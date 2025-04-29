module.exports = (io) => {
  console.log("Notification system started");
  // console.log("io", io);
  const connectedUsers = new Map();

  io.on("connection", (socket) => {
    console.log("Client connected to notification system:", socket.id);

    // User joins their personal room
    // socket.on("joinNotificationRoom", (userId) => {
    //   socket.join(`notification:${userId}`);
    //   connectedUsers.set(userId, socket.id);
    //   console.log(`User ${userId} joined notification room`);
    // });

    // Listen for broadcastNotification event
    socket.on("broadcastNotification", ({ userIds, notification }) => {
      console.log(
        "Broadcasting notification:",
        notification,
        "to userIds:",
        userIds
      );

      userIds.forEach((userId) => {
        io.to(`notification:${userId}`).emit("notification", notification);
      });
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      // Remove user from connected users map
      for (const [userId, socketId] of connectedUsers.entries()) {
        if (socketId === socket.id) {
          connectedUsers.delete(userId);
          break;
        }
      }
      console.log("Client disconnected from notification system:", socket.id);
    });
  });
};