const { redisClient } = require("../configs/redis");
const Message = require("../models/messageModel");
const User = require("../models/userModel");
const mongoose = require("mongoose");
const Group = require("../models/groupModel");

// Retrieve cached data
exports.getCachedData = async (key) => {
  try {
    const data = await redisClient.lRange(key, 0, -1);
    return data.map((item) => JSON.parse(item));
  } catch (error) {
    console.error(`Error getting cache for key: ${key}, error`);
    return null;
  }
};

// Set cached data with dynamic expiry based on access count
exports.setCachedData = async (key, messages, expireSeconds = 3600) => {
  try {
    await redisClient.del(key); // Clear existing data
    for (const message of messages) {
      const cachedMessage = {
        _id: message._id.toString(),
        content: message.content,
        sender: message.sender,
        receiver: message.receiver,
        isBroadcast: message.isBroadcast,
        attachments: message.attachments,
        createdAt: message.createdAt,
      };
      await redisClient.lPush(key, JSON.stringify(cachedMessage));
    }
    await redisClient.lTrim(key, 0, 9);
    await redisClient.expire(key, expireSeconds);
    console.log(`Successfully cached latest messages for key: ${key}`);
  } catch (error) {
    console.error(`Error setting cache for key: ${key}, error`);
  }
};

exports.getCacheKey = (userID1, userID2) =>
  `messages:${[userID1, userID2].sort().join(":")}`;

exports.addMessageToCache = async (senderId, receiverId, message) => {
  const cacheKey = exports.getCacheKey(senderId, receiverId);
  try {
    const cachedMessage = {
      _id: message._id.toString(),
      content: message.content,
      sender: message.sender,
      receiver: message.receiver,
      attachments: message.attachments,
      createdAt: message.createdAt,
      isBroadcast: message.isBroadcast,
    };
    await redisClient.lPush(cacheKey, JSON.stringify(cachedMessage));
    await redisClient.lTrim(cacheKey, 0, 9); // Keep only the latest 10 messages
    await redisClient.expire(cacheKey, 3600); // Reset expiry to 1 hour
  } catch (error) {
    console.error(`Error adding message to cache: ${cacheKey}, error`);
  }
};

const cleanupExpiredKeys = async () => {
  const script = `
    local keys = redis.call('KEYS', 'messages:*')
    local deleted = 0
    for i, key in ipairs(keys) do
      if redis.call('TTL', key) <= 0 then
        redis.call('DEL', key)
        deleted = deleted + 1
      end
    end
    return deleted
  `;

  try {
    const deletedCount = await redisClient.eval(script, 0);
    console.log(`Cleaned up ${deletedCount} expired keys`);
  } catch (error) {
    console.error("Error during cleanup:", error);
  }
};

// Run cleanup every hour
let cleanupInterval;

exports.startCleanupInterval = () => {
  cleanupInterval = setInterval(cleanupExpiredKeys, 3600000);
};

exports.stopCleanupInterval = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
};

// Send a message
exports.sendMessage = async (req, res) => {
  const { senderId, receiverId, message } = req.body;
  const { _id: authenticatedUserId, userType } = req.user;

  try {
    // Validate request data
    if (!receiverId || (!message && (!req.files || req.files.length === 0))) {
      return res.status(400).json({
        error: "receiverId and either message or attachments are required",
      });
    }

    const MAX_PAYLOAD_SIZE = 1024 * 1024;
    if (JSON.stringify(req.body).length > MAX_PAYLOAD_SIZE) {
      return res.status(413).json({ error: "Payload too large" });
    }

    // Find the receiver
    const receiver = await User.findById(
      new mongoose.Types.ObjectId(receiverId)
    ).select("firstName userEmail userType");
    if (!receiver) {
      return res.status(404).json({ error: "Receiver not found" });
    } // Initialize message data with required fields
    const messageData = {
      sender: new mongoose.Types.ObjectId(authenticatedUserId),
      receiver: new mongoose.Types.ObjectId(receiverId),
      content: message || "", // Set empty string if no message
      isBroadcast: false,
      attachments: [], // Initialize empty attachments array
    };


    // Handle file attachments if present
    if (req.files && req.files.length > 0) {
      messageData.attachments = req.files.map((file) => ({
        type: file.mimetype.startsWith("image/")
          ? "image"
          : file.mimetype.startsWith("video/")
          ? "video"
          : "document",
        url: file.location,
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      }));

    } // Create and save the message
    const newMessage = new Message(messageData);
    const savedMessage = await newMessage.save();
    console.log(
      "Message after save:",
      JSON.stringify(savedMessage.toObject(), null, 2)
    );

    // Add message to cache
    await exports.addMessageToCache(
      authenticatedUserId,
      receiverId,
      savedMessage
    );

    // Emit message to receiver if socket.io is available
    if (req.io) {
      console.log("Emitting message to receiver:", receiverId);
      req.io.to(receiverId).emit("message", savedMessage);
    } else {
      console.warn("Socket.io not initialized");
    }

    res.status(201).json({
      status: 201,
      message: "Message sent successfully",
      data: savedMessage,
    });
  } catch (error) {
    console.error("Error sending message:", error);
    if (error.name === "MongoError" && error.code === 11000) {
      return res.status(409).json({ error: "Duplicate message detected" });
    }
    res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
};

exports.specificUserMessages = async (req, res) => {
  try {
    const { requestedUserID } = req.params;
    const { cursor, limit = 10 } = req.query;
    const senderId = req.user._id;

    if (!requestedUserID) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const user = await User.findById(
      new mongoose.Types.ObjectId(requestedUserID)
    );
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const cacheKey = exports.getCacheKey(senderId, requestedUserID);
    let messages;
    let cachedMessages = await exports.getCachedData(cacheKey);

    if (!cursor && cachedMessages && cachedMessages.length > 0) {
      messages = cachedMessages;
    } else {
      const matchCondition = {
        $or: [
          { sender: requestedUserID, receiver: senderId },
          { sender: senderId, receiver: requestedUserID },
        ],
      };

      if (cursor) {
        try {
          const cursorMessage = await Message.findById(cursor);
          if (cursorMessage) {
            matchCondition.createdAt = { $lt: cursorMessage.createdAt };
          }
        } catch (error) {
          console.error("Error parsing cursor ObjectId:", error);
          return res.status(400).json({ error: "Invalid cursor format" });
        }
      }

      messages = await Message.find(matchCondition)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit, 10));

      if (!cursor) {
        await exports.setCachedData(cacheKey, messages);
      }
    }

    // const matchCondition = {
    //   $or: [
    //     { sender: requestedUserID, receiver: senderId },
    //     { sender: senderId, receiver: requestedUserID },
    //   ],
    // };

    // const messages = await Message.find(matchCondition).sort({ createdAt: -1 });

    const formattedMessages = messages.map((msg) => ({
      _id: msg._id.toString(),
      content: msg.content,
      sender: msg.sender,
      receiver: msg.receiver,
      isBroadcast: msg.isBroadcast,
      createdAt: msg.createdAt,
    }));

    const nextCursor =
      messages.length > 0 ? messages[messages.length - 1]._id.toString() : null;

    return res.status(200).json({
      message:
        messages.length > 0
          ? "Messages retrieved successfully"
          : "No more messages found for this user",
      data: formattedMessages,
      nextCursor: nextCursor,
    });
  } catch (error) {
    console.error("Error fetching user messages:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching messages" });
  }
};

exports.getChatTabUsers = async (req, res) => {
  const { userType, userID, phone, image } = req.user;
  const page = req.query.page ? parseInt(req.query.page) : 1;
  const limitOnUser = req.query.limitOnUser
    ? parseInt(req.query.limitOnUser)
    : 10;
  const limitOnGroup = req.query.limitOnGroup
    ? parseInt(req.query.limitOnGroup)
    : 10;

  try {
    let users = [];
    let groups = [];
    let totalUsersCount = 0;
    let totalGroupsCount = 0;

    if (userType === "ADMIN") {
      users = await User.find(
        { _id: { $ne: userID } },
        { _id: 1, firstName: 1, userEmail: 1, userType: 1, phone: 1, image: 1 }
      )
        .skip((page - 1) * limitOnUser)
        .limit(limitOnUser);
      totalUsersCount = await User.countDocuments({ _id: { $ne: userID } });

      groups = await Group.find({}, { _id: 1, groupName: 1 })
        .skip((page - 1) * limitOnGroup)
        .limit(limitOnGroup);
      totalGroupsCount = await Group.countDocuments();
    } else if (userType === "TEACHER") {
      users = await User.find(
        { _id: { $ne: userID } },
        { _id: 1, firstName: 1, userEmail: 1, userType: 1, groups: 1 }
      )
        .populate("groups", "_id")
        .skip((page - 1) * limitOnUser)
        .limit(limitOnUser);
      totalUsersCount = await User.countDocuments({ _id: { $ne: userID } });

      const groupIds = users.flatMap((user) =>
        user.groups.map((group) => group._id)
      );
      groups = await Group.find(
        { _id: { $in: groupIds } },
        { _id: 1, groupName: 1 }
      )
        .skip((page - 1) * limitOnGroup)
        .limit(limitOnGroup);
      totalGroupsCount = await Group.countDocuments({ _id: { $in: groupIds } });
    } else if (userType === "USER") {
      users = await User.find(
        { userType: { $in: ["ADMIN", "TEACHER"] }, _id: { $ne: userID } },
        { _id: 1, firstName: 1, userEmail: 1, userType: 1, groups: 1 }
      )
        .populate("groups", "_id")
        .skip((page - 1) * limitOnUser)
        .limit(limitOnUser);
      totalUsersCount = await User.countDocuments({
        userType: { $in: ["ADMIN", "TEACHER"] },
        _id: { $ne: userID },
      });

      const groupIds = users.flatMap((user) =>
        user.groups.map((group) => group._id)
      );
      groups = await Group.find(
        { _id: { $in: groupIds } },
        { _id: 1, groupName: 1 }
      )
        .skip((page - 1) * limitOnGroup)
        .limit(limitOnGroup);
      totalGroupsCount = await Group.countDocuments({ _id: { $in: groupIds } });
    }
    // console.log("Users fetched:", users);

    res.status(200).json({ users, totalUsersCount, groups, totalGroupsCount });
  } catch (error) {
    console.error("Error fetching users for chat tab:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getUserDataOfGroup = async (req, res) => {
  const { groupId } = req.params;
  const { userID } = req.user;
  // console.log("Group ID:", groupId);

  try {
    const group = await Group.findById(new mongoose.Types.ObjectId(groupId));
    // console.log("Fetched group:", group);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }
    if (!group.members.includes(userID) && req.user.userType !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "You are not a member of this group" });
    }

    const memberIds = group.members.map(
      (member) => new mongoose.Types.ObjectId(member)
    );
    // console.log("Member IDs:", memberIds);

    const groupUsers = await User.find(
      { _id: { $in: memberIds } },
      { _id: 1, firstName: 1, userEmail: 1, userType: 1, phone: 1 }
    );
    // console.log("Group users fetched:", groupUsers);

    // Remove non-existent users from the group
    const existingUserIds = groupUsers.map((user) => user._id.toString());
    const nonExistentUserIds = memberIds.filter(
      (id) => !existingUserIds.includes(id.toString())
    );

    if (nonExistentUserIds.length > 0) {
      console.log(
        "Removing non-existent users from group:",
        nonExistentUserIds
      );
      await Group.updateOne(
        { _id: group._id },
        { $pull: { members: { $in: nonExistentUserIds } } }
      );
    }

    res.status(200).json({
      groupUsers,
      removedMembers: nonExistentUserIds,
      groupName: group.groupName,
    });
  } catch (error) {
    console.error("Error fetching group users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getUsersWithMessages = async (req, res) => {
  const { _id: userID, userType, image } = req.user;
  const page = req.query.page ? parseInt(req.query.page) : 1;
  const limit = req.query.limit ? parseInt(req.query.limit) : 10;

  try {
    const messagePartners = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: new mongoose.Types.ObjectId(userID) },
            { receiver: new mongoose.Types.ObjectId(userID) },
          ],
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: {
              if: { $eq: ["$sender", new mongoose.Types.ObjectId(userID)] },
              then: "$receiver",
              else: "$sender",
            },
          },
          lastMessageTime: { $first: "$createdAt" },
          lastMessage: { $first: "$content" },
          lastMessageAttachments: { $first: "$attachments" },
          lastMessageSender: { $first: "$sender" },
        },
      },
      { $sort: { lastMessageTime: -1 } },
    ]);

    if (messagePartners.length > 0) {
      console.log(
        "[getUsersWithMessages] First message partner:",
        messagePartners[0]
      );
    } else {
      console.log("[getUsersWithMessages] No message partners found");
    }

    let enrichedUsers = [];
    let totalUnreadMessages = 0;

    // If we have message partners, process them
    if (messagePartners.length > 0) {
      console.log("[getUsersWithMessages] Creating base query for User.find");
      // First find all users who have messages
      let baseQuery = {
        _id: {
          $in: messagePartners.map((partner) => partner._id),
        },
      };

      let allMessageUsers = await User.find(baseQuery).lean();

      if (allMessageUsers.length > 0) {
        console.log("[getUsersWithMessages] First matched user:", {
          id: allMessageUsers[0]._id,
          name: allMessageUsers[0].firstName,
        });
      } else {
        console.log(
          "[getUsersWithMessages] No users found matching message partners"
        );
      }

      // For chat, we want to show all users you've messaged with, regardless of type
      let filteredUsers = allMessageUsers;

      // Remove current user if present
      const beforeFilter = filteredUsers.length;
      filteredUsers = filteredUsers.filter(
        (user) => user._id.toString() !== userID
      );

      const userLastMessageMap = new Map(
        messagePartners.map((partner) => [
          partner._id?.toString(),
          {
            lastMessageTime: partner.lastMessageTime,
            lastMessage: partner.lastMessage,
            lastMessageAttachments: partner.lastMessageAttachments || [],
            lastMessageSender: partner.lastMessageSender,
          },
        ])
      );

      const unreadCounts = await Promise.all(
        filteredUsers.map(async (user) => {
          const count = await Message.countDocuments({
            sender: user._id,
            receiver: new mongoose.Types.ObjectId(userID),
            isRead: false,
          });
          return [user._id.toString(), count];
        })
      );
      const unreadCountMap = new Map(unreadCounts);

      enrichedUsers = filteredUsers.map((user) => {
        const messageDetails = userLastMessageMap.get(user._id.toString());
        const unreadCount = unreadCountMap.get(user._id.toString()) || 0;
        totalUnreadMessages += unreadCount;

        return {
          firstName: user.firstName,
          email: user.email || user.userEmail, // Support both field names
          userType: userType,
          image:user.image,
          lastMessageTime: messageDetails?.lastMessageTime,
          lastMessage: messageDetails?.lastMessage,
          isLastMessageSentByMe:
            messageDetails?.lastMessageSender.toString() === userID,
          // Include _id for compatibility with expected response
          _id: user._id,
        };
      });

      // Sorting users based on their last message time
      enrichedUsers.sort((a, b) => {
        const timeA = a.lastMessageTime || 0;
        const timeB = b.lastMessageTime || 0;
        return timeB - timeA;
      });
      console.log(
        `[getUsersWithMessages] Sorted ${enrichedUsers.length} enriched users by message time`
      );
    }

    // Applying pagination
    const paginatedUsers = enrichedUsers.slice(
      (page - 1) * limit,
      page * limit
    );
    const totalUsersCount = enrichedUsers.length;
    console.log(
      `[getUsersWithMessages] Applied pagination: ${totalUsersCount} total users -> ${paginatedUsers.length} in current page`
    );

    console.log("[getUsersWithMessages] Returning response");
    res.status(200).json({
      users: paginatedUsers,
      totalUsersCount,
      totalUnreadMessages,
      currentPage: page,
      totalPages: Math.ceil(totalUsersCount / limit),
    });
  } catch (error) {
    console.error("[getUsersWithMessages] Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getGroupsForUser = async (req, res) => {
  const { userID, userType } = req.user;
  console.log("Fetching groups for user:", userID);
  const page = req.query.page ? parseInt(req.query.page) : 1;
  const limit = req.query.limit ? parseInt(req.query.limit) : 10;

  try {
    let query = { members: userID };

    if (userType !== "ADMIN") {
      // For non-admin users, only fetch groups they're a member of
      query = { members: userID };
    }

    const groups = await Group.find(query, { _id: 1, groupName: 1, members: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalGroupsCount = await Group.countDocuments(query);

    res.status(200).json({
      groups,
      totalGroupsCount,
      currentPage: page,
      totalPages: Math.ceil(totalGroupsCount / limit),
    });
  } catch (error) {
    console.error("Error fetching groups for user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.markMessageAsRead = async (req, res) => {
  const { _id: currentUserId } = req.user;
  const { partnerId } = req.params;

  if (!partnerId) {
    return res.status(400).json({ error: "partnerId is required" });
  }

  try {
    const update = await Message.updateMany(
      {
        sender: partnerId,
        receiver: currentUserId,
        isRead: false,
      },
      {
        $set: { isRead: true },
      }
    );

    res.status(200).json({
      message: "Messages marked as read successfully",
      updatedCount: update.modifiedCount,
    });
  } catch (error) {
    console.error("Error marking messages as read:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.chatAccess = async (req, res) => {
  const { _id: AdminUserId, userType } = req.user;
  const { requestedUserId } = req.params;
  const { chatAccess } = req.body;

  try {
    if (typeof chatAccess !== "boolean") {
      return res
        .status(400)
        .json({ error: "Invalid value for chatAccess. Must be a boolean." });
    }

    if (userType !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "Only Admin can edit access to chat" });
    }

    const requestedUser = await User.findById(requestedUserId);
    if (!requestedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    requestedUser.chatAccess = chatAccess;
    await requestedUser.save();

    res.status(200).json({
      message: "Chat access updated successfully",
      user: {
        _id: requestedUser._id,
        chatAccess: requestedUser.chatAccess,
      },
    });
  } catch (error) {
    console.error("Error updating chat access:", error);
    res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
};

//with messages response
// {
//   "users": [
//       {
//           "partnerId": "672df33ef442d2336a0c2184",
//           "phone": "919565153545",
//           "userType": "USER",
//           "email": "vikas@gmail.com",
//           "firstName": "Vikas",
//           "lastMessageTime": "2024-11-26T11:25:34.749Z",
//           "lastMessage": "11",
//           "unreadCount": 23,
//           "isLastMessageSentByMe": false
//       },
//       {
//           "partnerId": "672ca70651c1bf8dbed90e31",
//           "phone": "919084890039",
//           "userType": "USER",
//           "email": "yashumittal9084@gmail.com",
//           "firstName": "yashuuuu",
//           "lastMessageTime": "2024-11-23T07:34:15.001Z",
//           "lastMessage": "😄",
//           "unreadCount": 21,
//           "isLastMessageSentByMe": false
//       },
//       {
//           "partnerId": "67305b09b02dea37a7324472",
//           "phone": "917071322273",
//           "userType": "USER",
//           "firstName": "Rishabh ",
//           "lastMessageTime": "2024-11-20T10:38:32.422Z",
//           "lastMessage": "Hello",
//           "unreadCount": 6,
//           "isLastMessageSentByMe": false
//       },
//       {
//           "partnerId": "6735227a3017bce7e2d32fd9",
//           "phone": "919084890029",
//           "userType": "USER",
//           "lastMessageTime": "2024-11-15T06:48:56.028Z",
//           "lastMessage": "Okay",
//           "unreadCount": 2,
//           "isLastMessageSentByMe": true
//       },
//       {
//           "partnerId": "6735e364442bdefe34883896",
//           "phone": "918127241488",
//           "userType": "USER",
//           "lastMessageTime": "2024-11-15T06:43:30.448Z",
//           "lastMessage": "Testing!!",
//           "unreadCount": 0,
//           "isLastMessageSentByMe": true
//       },
//       {
//           "partnerId": "6735d22f0d77a3ec9a816156",
//           "phone": "918953267318",
//           "userType": "USER",
//           "lastMessageTime": null,
//           "lastMessage": "Now its good.",
//           "unreadCount": 0,
//           "isLastMessageSentByMe": true
//       }
//   ],
//   "totalUsersCount": 6,
//   "totalUnreadMessages": 65,
//   "currentPage": 1,
//   "totalPages": 1
// }

//mark messaeg as read response
// {
//   "message": "Messages marked as read successfully",
//   "updatedCount": 2
// }