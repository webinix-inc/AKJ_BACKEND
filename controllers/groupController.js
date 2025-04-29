const { redisClient } = require("../configs/redis");

const Group = require("../models/groupModel");
const Message = require("../models/messageModel");
const mongoose = require("mongoose");

// Function to cache group messages
const cacheGroupMessages = async () => {
  try {
    const groups = await Group.find({}, { _id: 1 });
    for (const group of groups) {
      const messages = await Message.find({ groupId: group._id })
        .sort({ createdAt: -1 })
        .limit(10);
      await redisClient.set(
        `group:${group._id}:messages`,
        JSON.stringify(messages),
        "EX",
        3600
      ); // Cache for 60 minutes
    }
    console.log("Group messages cached successfully.");
  } catch (error) {
    console.error("Error caching group messages:", error);
  }
};

// Start the caching process every 30 minutes
// setInterval(cacheGroupMessages, 1800000); // 30 minutes
let cacheInterval;

exports.startCaching = () => {
  if (!cacheInterval) {
    cacheInterval = setInterval(cacheGroupMessages, 1800000); // 30 minutes
  }
};

// Function to stop the caching process
exports.stopCaching = () => {
  if (cacheInterval) {
    clearInterval(cacheInterval);
    cacheInterval = null;
  }
};

exports.createGroup = async (req, res) => {
  try {
    if (req.user.userType !== "ADMIN") {
      return res.status(403).json({ error: "Only admins can create groups" });
    }

    const { groupName, memberIds } = req.body;
    console.log("Group name:", groupName);
    console.log("Member IDs:", memberIds);
    console.log("Admin :", req.user);
    if (!groupName || !memberIds || memberIds.length === 0) {
      return res
        .status(400)
        .json({ error: "Group name and members are required" });
    }

    const existingGroup = await Group.findOne({ groupName });
    if (existingGroup) {
      return res.status(400).json({ error: "Group already exists" });
    }

    console.log("Creating group...");
    const newGroup = new Group({
      groupName,
      members: [...memberIds, req.user.userID], // Admin automatically added
      admin: req.user.userID,
    });

    await newGroup.save();
    console.log("Group created successfully", newGroup);
    // Cache group details
    redisClient.setEx(
      `group:${newGroup._id}:data`,
      3600,
      JSON.stringify(newGroup)
    );

    res
      .status(201)
      .json({ message: "Group created successfully", group: newGroup });
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Send message to group
exports.sendGroupMessage = async (req, res) => {
  try {
    const { message, groupId } = req.body;
    // console.log("Received group message request:", { message, groupId });
    // console.log("Sender:", req.user);

    if (!message || !groupId) {
      return res
        .status(400)
        .json({ error: "Message and group ID are required" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }
    console.log("Group:", group.members);
    console.log("Sender:", req.user.userID); 
    if (!group.members.includes(req.user.userID)) {
      return res
        .status(403)
        .json({ error: "You are not a member of this group" });
    }

    // console.log('Sender:', req.user);

    const newMessage = new Message({
      sender: req.user.userID,
      groupId,
      content: message,
      isBroadcast: false,
      createdAt: new Date(),
    });

    const savedMessage=await newMessage.save();
    // console.log("New message saved:", savedMessage);
    cacheGroupMessages(); // Update group messages cache

    // Emit to the group room
    if (req.io) {
      console.log("Emitting group message to group:", groupId);
      req.io.emit("groupMessage", savedMessage);
    } else {
      console.warn("Socket.io not initialized");
    }

    res.status(200).json({ message: "Group message sent successfully" });
  } catch (error) {
    console.error("Error sending group message:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get messages for a group
exports.getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    console.log("Group ID:", groupId);
    console.log("sender:", req.user.userID);
    console.log("User:", req.user);
    const page = parseInt(req.query.page) || 1; // Set default page to 1 if not provided
    const limit = parseInt(req.query.limit) || 10; // Set default limit to 10 if not provided

    const group = await Group.findById(groupId);
    console.log("Group:", group.members);
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }
    if (!group.members.includes(req.user.userID)) {
      return res
        .status(403)
        .json({ error: "You are not a member of this group" });
    }

    const cachedMessages = await redisClient.get(`group:${groupId}:messages`);

    if (cachedMessages) {
      return res.status(200).json(JSON.parse(cachedMessages));
    }

    const messages = await Message.find({ groupId })
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 })
      .limit(10);

    await redisClient.set(
      `group:${groupId}:messages`,
      JSON.stringify(messages),
      "EX",
      3600
    );

    res.status(200).json(messages);
  } catch (error) {
    console.error("Error retrieving group messages:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
