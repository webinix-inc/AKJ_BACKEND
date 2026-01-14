const { redisClient } = require("../configs/redis");
const Message = require("../models/messageModel");
const User = require("../models/userModel");
const mongoose = require("mongoose");
const Group = require("../models/groupModel");
const { getSignedFileUrl } = require("../utils/s3Signer");

// Helper to sign attachments in a message
const signMessageAttachments = async (message) => {
  if (!message || !message.attachments || message.attachments.length === 0) {
    return message;
  }

  const signedAttachments = await Promise.all(
    message.attachments.map(async (att) => {
      // Create a shallow copy to avoid mutating if it's a frozen object
      const newAtt = { ...att };
      if (newAtt.url) {
        newAtt.url = await getSignedFileUrl(newAtt.url);
      }
      return newAtt;
    })
  );

  return { ...message, attachments: signedAttachments };
};

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

    // Sanitize message content (XSS prevention)
    const sanitizeHtml = (str) => {
      if (!str) return "";
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;")
        .replace(/\//g, "&#x2F;");
    };

    const sanitizedMessage = message ? sanitizeHtml(message.trim()) : "";

    // Find the receiver
    const receiver = await User.findById(
      new mongoose.Types.ObjectId(receiverId)
    ).select("firstName userEmail userType");
    if (!receiver) {
      return res.status(404).json({ error: "Receiver not found" });
    }

    // Initialize message data with required fields
    const messageData = {
      sender: new mongoose.Types.ObjectId(authenticatedUserId),
      receiver: new mongoose.Types.ObjectId(receiverId),
      content: sanitizedMessage, // Use sanitized message
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

    // Socket emission is handled by the frontend socket.emit("message", ...)
    // which triggers the socket handler. No need to emit here to avoid duplicates.
    // The socket handler in sockets/chat.js handles broadcasting to the receiver.

    // Sign the message for response
    const signedMessage = await signMessageAttachments(savedMessage.toObject());

    res.status(201).json({
      status: 201,
      message: "Message sent successfully",
      data: signedMessage,
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
    const userType = req.user.userType;

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

    // For ADMIN users, don't use cache to ensure we get all messages from any admin
    // For regular users, use cache for performance
    let cachedMessages = null;
    if (userType !== "ADMIN") {
      cachedMessages = await exports.getCachedData(cacheKey);
    }

    if (!cursor && cachedMessages && cachedMessages.length > 0) {
      messages = cachedMessages;
    } else {
      // For ADMIN users: Include messages sent by ANY admin to the student
      // For regular users: Only include messages between current user and requested user
      let matchCondition;
      let adminObjectIds = null; // Declare outside if block for debug use

      if (userType === "ADMIN") {
        // Get all admin IDs
        const adminIds = await User.find({ userType: "ADMIN" })
          .select("_id")
          .lean();
        adminObjectIds = adminIds.map((a) => new mongoose.Types.ObjectId(a._id));
        const requestedUserObjectId = new mongoose.Types.ObjectId(requestedUserID);

        console.log(`[specificUserMessages] ADMIN query - Admin IDs: ${adminObjectIds.length}, Student ID: ${requestedUserObjectId}`);
        console.log(`[specificUserMessages] Admin ObjectIds:`, adminObjectIds.map(id => id.toString()));
        console.log(`[specificUserMessages] Requested User ObjectId:`, requestedUserObjectId.toString());

        matchCondition = {
          $or: [
            // Messages from any admin to the student
            { sender: { $in: adminObjectIds }, receiver: requestedUserObjectId },
            // Messages from the student to any admin
            { sender: requestedUserObjectId, receiver: { $in: adminObjectIds } },
          ],
        };

        // Log match condition in a readable format
        console.log(`[specificUserMessages] Match condition:`, {
          $or: [
            {
              sender: { $in: adminObjectIds.map(id => id.toString()) },
              receiver: requestedUserObjectId.toString()
            },
            {
              sender: requestedUserObjectId.toString(),
              receiver: { $in: adminObjectIds.map(id => id.toString()) }
            }
          ]
        });
      } else {
        // For non-admin users, check if they're requesting messages with an admin
        const senderObjectId = new mongoose.Types.ObjectId(senderId);
        const requestedUserObjectId = new mongoose.Types.ObjectId(requestedUserID);

        // Check if the requested user is an admin
        const requestedUser = await User.findById(requestedUserID).select("userType").lean();

        if (requestedUser?.userType === "ADMIN") {
          // If requesting messages with an admin, get ALL admin messages (consolidated view)
          const adminIds = await User.find({ userType: "ADMIN" })
            .select("_id")
            .lean();
          const adminObjectIds = adminIds.map((a) => new mongoose.Types.ObjectId(a._id));

          matchCondition = {
            $or: [
              // Messages from any admin to this user
              { sender: { $in: adminObjectIds }, receiver: senderObjectId },
              // Messages from this user to any admin
              { sender: senderObjectId, receiver: { $in: adminObjectIds } },
            ],
          };
          console.log(`[specificUserMessages] Non-admin requesting admin chat - consolidating all admin messages`);
        } else {
          // Regular user-to-user chat
          matchCondition = {
            $or: [
              { sender: requestedUserObjectId, receiver: senderObjectId },
              { sender: senderObjectId, receiver: requestedUserObjectId },
            ],
          };
        }
      }

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
        .limit(parseInt(limit, 10))
        .lean();

      console.log(`[specificUserMessages] Found ${messages.length} messages for userType: ${userType}, requestedUserID: ${requestedUserID}`);

      // Debug: Log first few message IDs and sender/receiver to verify query
      if (messages.length > 0) {
        console.log(`[specificUserMessages] Sample messages:`, messages.slice(0, 3).map(msg => ({
          _id: msg._id.toString(),
          sender: msg.sender.toString(),
          receiver: msg.receiver?.toString(),
          content: msg.content?.substring(0, 50) + '...'
        })));
      } else if (userType === "ADMIN") {
        // If no messages found for admin, let's debug why
        console.log(`[specificUserMessages] DEBUG: No messages found, checking database directly...`);

        // Check if message exists with this receiver
        const testMessage = await Message.findOne({
          receiver: new mongoose.Types.ObjectId(requestedUserID)
        }).sort({ createdAt: -1 });

        if (testMessage) {
          console.log(`[specificUserMessages] DEBUG: Found a message with this receiver:`, {
            _id: testMessage._id.toString(),
            sender: testMessage.sender.toString(),
            receiver: testMessage.receiver.toString(),
            senderIsAdmin: adminObjectIds?.some(id => id.toString() === testMessage.sender.toString()),
            contentPreview: testMessage.content?.substring(0, 100)
          });

          // Try to find messages with the exact query we're using
          const directQuery = {
            $or: [
              { sender: { $in: adminObjectIds }, receiver: new mongoose.Types.ObjectId(requestedUserID) },
              { sender: new mongoose.Types.ObjectId(requestedUserID), receiver: { $in: adminObjectIds } },
            ],
          };
          const directResult = await Message.find(directQuery).limit(5);
          console.log(`[specificUserMessages] DEBUG: Direct query result: ${directResult.length} messages`);
        } else {
          console.log(`[specificUserMessages] DEBUG: No messages found with receiver: ${requestedUserID}`);
        }
      }

      // Only cache for non-admin users to avoid stale data
      if (!cursor && userType !== "ADMIN") {
        await exports.setCachedData(cacheKey, messages);
      }
    }


    const formattedMessages = await Promise.all(messages.map(async (msg) => {
      const signedMsg = await signMessageAttachments(msg);
      return {
        _id: signedMsg._id.toString(),
        content: signedMsg.content,
        sender: signedMsg.sender,
        receiver: signedMsg.receiver,
        isBroadcast: signedMsg.isBroadcast,
        createdAt: signedMsg.createdAt,
        attachments: signedMsg.attachments || [],
      };
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
    // Build match stage: for ADMIN, include messages sent by any admin to students
    let matchStage;
    let adminObjectIds = null; // Declare outside if block for use in aggregation pipeline

    if (userType === "ADMIN") {
      const adminIds = await User.find({ userType: "ADMIN" })
        .select("_id")
        .lean();
      // Convert to ObjectIds for aggregation pipeline
      adminObjectIds = adminIds.map((a) => new mongoose.Types.ObjectId(a._id));

      matchStage = {
        $match: {
          $or: [
            { sender: { $in: adminObjectIds } },
            { receiver: { $in: adminObjectIds } },
          ],
        },
      };
    } else {
      matchStage = {
        $match: {
          $or: [
            { sender: new mongoose.Types.ObjectId(userID) },
            { receiver: new mongoose.Types.ObjectId(userID) },
          ],
        },
      };
    }

    // Build aggregation pipeline
    let aggregationPipeline = [matchStage, { $sort: { createdAt: -1 } }];

    // For ADMIN users, add a stage to identify the student (non-admin) partner
    if (userType === "ADMIN" && adminObjectIds && adminObjectIds.length > 0) {
      // Create an array of conditions to check if sender is an admin
      // Since $in doesn't work with JS arrays in $cond, we'll use a different approach
      // We'll create a $setIsSubset check or use $or with multiple $eq
      const adminCheckConditions = adminObjectIds.map(adminId => ({
        $eq: ["$sender", adminId]
      }));

      aggregationPipeline.push({
        $addFields: {
          // Check if sender is an admin by using $or with multiple $eq checks
          isSenderAdmin: {
            $or: adminCheckConditions
          },
        },
      });

      aggregationPipeline.push({
        $addFields: {
          // Identify which field is the student (the one that's NOT an admin)
          studentPartner: {
            $cond: {
              if: "$isSenderAdmin",
              then: "$receiver",
              else: "$sender",
            },
          },
        },
      });

      aggregationPipeline.push({
        $group: {
          _id: "$studentPartner",
          lastMessageTime: { $first: "$createdAt" },
          lastMessage: { $first: "$content" },
          lastMessageAttachments: { $first: "$attachments" },
          lastMessageSender: { $first: "$sender" },
        },
      });
    } else {
      // For non-admin users, consolidate all admin conversations into one "AKJ Classes" entry
      // First, get all admin IDs to identify admin conversation partners
      const adminIds = await User.find({ userType: "ADMIN" })
        .select("_id")
        .lean();
      adminObjectIds = adminIds.map((a) => new mongoose.Types.ObjectId(a._id));

      // Create conditions to check if the conversation partner is an admin
      const adminCheckConditions = adminObjectIds.map(adminId => ({
        $eq: ["$conversationPartner", adminId]
      }));

      aggregationPipeline.push({
        $addFields: {
          // First determine who the conversation partner is (not the current user)
          conversationPartner: {
            $cond: {
              if: { $eq: ["$sender", new mongoose.Types.ObjectId(userID)] },
              then: "$receiver",
              else: "$sender"
            }
          }
        }
      });

      aggregationPipeline.push({
        $addFields: {
          // Check if conversation partner is an admin
          isPartnerAdmin: adminObjectIds.length > 0 ? { $or: adminCheckConditions } : false
        }
      });

      aggregationPipeline.push({
        $addFields: {
          // If partner is admin, use a consolidated "ADMIN" key, otherwise use actual partner ID
          groupKey: {
            $cond: {
              if: "$isPartnerAdmin",
              then: "ADMIN_CONSOLIDATED",
              else: "$conversationPartner"
            }
          }
        }
      });

      aggregationPipeline.push({
        $group: {
          _id: "$groupKey",
          lastMessageTime: { $first: "$createdAt" },
          lastMessage: { $first: "$content" },
          lastMessageAttachments: { $first: "$attachments" },
          lastMessageSender: { $first: "$sender" },
          // Keep track of one admin ID for reference (to get admin info later)
          adminPartnerId: { $first: { $cond: { if: "$isPartnerAdmin", then: "$conversationPartner", else: null } } }
        }
      });
    }

    aggregationPipeline.push({ $sort: { lastMessageTime: -1 } });

    const messagePartners = await Message.aggregate(aggregationPipeline);

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

      // For non-admin users, handle the consolidated admin entry separately
      if (userType !== "ADMIN") {
        // Find the consolidated admin entry if it exists
        const consolidatedAdminEntry = messagePartners.find(p => p._id === "ADMIN_CONSOLIDATED");
        const otherPartners = messagePartners.filter(p => p._id !== "ADMIN_CONSOLIDATED");

        // Get non-admin user partners
        let baseQuery = {
          _id: {
            $in: otherPartners.map((partner) => partner._id).filter(id => id),
          },
        };

        let allMessageUsers = await User.find(baseQuery).lean();

        // For chat, we want to show all users you've messaged with
        let filteredUsers = allMessageUsers.filter(
          (user) => user._id.toString() !== userID
        );

        // If there's a consolidated admin entry, add a virtual "AKJ Classes" admin user
        if (consolidatedAdminEntry) {
          // Get the first admin to use as a reference for the consolidated entry
          const firstAdmin = await User.findOne({ userType: "ADMIN" }).select("image").lean();

          const virtualAdminUser = {
            _id: consolidatedAdminEntry.adminPartnerId || "ADMIN_CONSOLIDATED",
            firstName: "AKJ Classes",
            lastName: "",
            userType: "ADMIN",
            image: firstAdmin?.image || null,
            isConsolidatedAdmin: true, // Flag to identify this is the consolidated admin
          };
          filteredUsers.unshift(virtualAdminUser);
        }

        // Build message details map
        const userLastMessageMap = new Map();
        if (consolidatedAdminEntry) {
          userLastMessageMap.set(consolidatedAdminEntry.adminPartnerId?.toString() || "ADMIN_CONSOLIDATED", {
            lastMessageTime: consolidatedAdminEntry.lastMessageTime,
            lastMessage: consolidatedAdminEntry.lastMessage,
            lastMessageAttachments: consolidatedAdminEntry.lastMessageAttachments || [],
            lastMessageSender: consolidatedAdminEntry.lastMessageSender,
          });
        }
        otherPartners.forEach((partner) => {
          userLastMessageMap.set(partner._id?.toString(), {
            lastMessageTime: partner.lastMessageTime,
            lastMessage: partner.lastMessage,
            lastMessageAttachments: partner.lastMessageAttachments || [],
            lastMessageSender: partner.lastMessageSender,
          });
        });

        // Calculate unread counts
        const unreadCounts = await Promise.all(
          filteredUsers.map(async (user) => {
            if (user.isConsolidatedAdmin) {
              // For consolidated admin, count unread from ALL admins
              const count = await Message.countDocuments({
                sender: { $in: adminObjectIds },
                receiver: new mongoose.Types.ObjectId(userID),
                isRead: false,
              });
              return [user._id.toString(), count];
            } else {
              const count = await Message.countDocuments({
                sender: user._id,
                receiver: new mongoose.Types.ObjectId(userID),
                isRead: false,
              });
              return [user._id.toString(), count];
            }
          })
        );
        const unreadCountMap = new Map(unreadCounts);

        enrichedUsers = filteredUsers.map((user) => {
          const messageDetails = userLastMessageMap.get(user._id.toString());
          const unreadCount = unreadCountMap.get(user._id.toString()) || 0;
          totalUnreadMessages += unreadCount;

          return {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            userEmail: user.userEmail,
            phone: user.phone,
            userName: user.userName,
            image: user.image,
            userType: user.userType,
            lastMessageTime: messageDetails?.lastMessageTime,
            lastMessage: messageDetails?.lastMessageAttachments?.length > 0
              ? "📎 Attachment"
              : messageDetails?.lastMessage ?? "No messages yet",
            unreadCount,
            isConsolidatedAdmin: user.isConsolidatedAdmin || false,
          };
        });
      } else {
        // Original logic for ADMIN users
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
            lastName: user.lastName, // Include lastName for full name display
            email: user.email || user.userEmail, // Support both field names
            phone: user.phone, // Include phone for display
            userType: user.userType, // Use individual user's userType, not requesting user's
            image: user.image,
            lastMessageTime: messageDetails?.lastMessageTime,
            lastMessage: messageDetails?.lastMessage,
            lastMessageAttachments: messageDetails?.lastMessageAttachments || [],
            isLastMessageSentByMe:
              messageDetails?.lastMessageSender.toString() === userID,
            unreadCount: unreadCountMap.get(user._id.toString()) || 0,
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
      } // End of else block (ADMIN users)
    } // End of if (messagePartners.length > 0)

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