const { redisClient, redisSubscriber } = require("../configs/redis");

module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("New client connected: ", socket.id);
    
    // Join user to their personal room
    socket.on("join", (userId) => {
      socket.join(userId);
      console.log(`User ${userId} joined their personal room`);
    });

    // Join user to a group room
    socket.on("joinGroup", (groupId) => {
      socket.join(`group:${groupId}`);
      console.log(`User ${socket.id} joined group ${groupId}`);
    });

    // Handle individual messages (existing logic)
    socket.on("message", (messageData) => {
      console.log("Received individual message:", messageData);
      const { receiverId, message } = messageData;
      console.log(`Message received for user ${receiverId}:`, message);
      
      // Emit message to the specific user only
      io.to(receiverId).emit("message", message);
    });

    // Handle group messages
    socket.on("groupMessage", (messageData) => {
      console.log("Received group message:", messageData);
      const { groupId, message, sender } = messageData;

      // Emit message to the entire group room
      io.to(`group:${groupId}`).emit("groupMessage", { message, sender });
    });

    // Handle client disconnection
    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });  // Closing bracket for the io.on('connection') function

  // Redis subscriber listens to broadcast channel and emits messages to the users
  redisSubscriber.subscribe("broadcastChannel", (message) => {
    try {
      const { messages } = JSON.parse(message);
      console.log("Parsed message:", messages);
      
      messages.forEach((msg) => {
        const { receiver, sender, content, isBroadcast, timestamp } = msg;
        const receiverSocket = connectedUsers.get(receiver);
        if (receiverSocket) {
          receiverSocket.emit("message", { content, sender, receiver, isBroadcast, timestamp });
          console.log(`Broadcast message sent to user: ${receiver}`);
        } else {
          console.log(`User ${receiver} is offline. Message queued.`);
        }
      });
    } catch (error) {
      console.error('Error processing broadcast message:', error);
    }
  });
};
