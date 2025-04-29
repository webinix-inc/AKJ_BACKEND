const {redisClient} = require("../configs/redis");
const User = require("../models/userModel");
const Message = require("../models/messageModel");
const { 
  getCacheKey, 
  getCachedData, 
  setCachedData, 
  addMessageToCache 
} = require("./chatController");


exports.broadcastMessage = async (req, res) => {
  const { message, recipientIds } = req.body;
  const senderId = req.user.userID;

  try {
    if (req.user.userType !== "ADMIN") {
      return res.status(403).json({ error: "Only admins can broadcast" });
    }

    if (!message || !recipientIds || !recipientIds.length) {
      return res.status(400).json({ error: "Message and recipients are required" });
    }

    const recipients = await User.find({ _id: { $in: recipientIds } }).select('_id');

    if (!recipients.length) {
      return res.status(404).json({ error: "No valid recipients found" });
    }

    // const messageTimestamp = timestamp || new Date().toISOString();

    const broadcastMessages = [];

    for (const recipient of recipients) {
      const receiverId = recipient._id.toString();
      const cacheKey = getCacheKey(senderId, receiverId);

      const newMessage = new Message({
        sender: senderId,
        receiver: receiverId,
        content: message,
        isBroadcast: true,
        // timestamp: messageTimestamp
      });

      const savedMessage = await newMessage.save();
      broadcastMessages.push(savedMessage);

      // Add new message to the cache
      await addMessageToCache(senderId, receiverId, savedMessage);
    }

    const broadcastData = {
      messages: broadcastMessages
    };

    await redisClient.publish("broadcastChannel", JSON.stringify(broadcastData));

    // if (req.io) {
    //   broadcastMessages.forEach(msg => {
    //     req.io.to(msg.receiver).emit("message", msg);
    //   });
    // } else {
    //   console.warn("Socket.io not initialized");
    // }

    res.status(200).json({
      success: true,
      // timestamp: messageTimestamp
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error broadcasting message" });
  }
};