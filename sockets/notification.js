module.exports = (io) => {
  console.log("Notification system started");
  const connectedUsers = new Map();

  io.on("connection", (socket) => {
    // console.log("Client connected to notification system:", socket.id);

    // User joins their personal room
    socket.on("joinNotificationRoom", (userId) => {
      if (!userId) return;

      const userRoom = `notification:${userId}`;
      socket.join(userRoom);
      connectedUsers.set(userId, socket.id);

      // Auto-join global broadcast room
      socket.join("notification:global");

      console.log(`User ${userId} joined ${userRoom} and global room`);
    });

    // Join specific course rooms for updates
    socket.on("joinCourseRooms", (courseIds) => {
      if (Array.isArray(courseIds)) {
        courseIds.forEach(courseId => {
          const roomName = `course:${courseId}`;
          socket.join(roomName);
          console.log(`Socket ${socket.id} joined course room: ${roomName}`);
        });
      }
    });

    // Listen for broadcastNotification event (Legacy support or internal broadcast)
    socket.on("broadcastNotification", ({ userIds, notification }) => {
      console.log("Broadcasting notification via socket event:", notification.title);

      if (userIds && Array.isArray(userIds)) {
        userIds.forEach((userId) => {
          io.to(`notification:${userId}`).emit("notification", notification);
        });
      }
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
      // console.log("Client disconnected from notification system:", socket.id);
    });
  });
};