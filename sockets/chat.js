const { redisClient, redisSubscriber } = require("../configs/redis");

// Track connected users: userId -> Set of socketIds
const connectedUsers = new Map();

// Track typing status: `${senderId}:${receiverId}` -> timeout
const typingTimeouts = new Map();

module.exports = (io) => {
  // Make io globally available for controller access
  global.io = io;

  io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);

    // Store userId associated with this socket
    let currentUserId = null;

    // Join user to their personal room
    socket.on("join", (userId) => {
      if (!userId) return;

      currentUserId = userId.toString();
      socket.join(currentUserId);

      // Track connected user
      if (!connectedUsers.has(currentUserId)) {
        connectedUsers.set(currentUserId, new Set());
      }
      connectedUsers.get(currentUserId).add(socket.id);

      console.log(`User ${currentUserId} joined (socket: ${socket.id}). Total connections: ${connectedUsers.get(currentUserId).size}`);

      // Emit online status to other users
      socket.broadcast.emit("userOnline", { userId: currentUserId });
    });

    // Join user to a group room
    socket.on("joinGroup", (groupId) => {
      if (!groupId) return;
      socket.join(`group:${groupId}`);
      console.log(`User ${socket.id} joined group ${groupId}`);
    });

    // Handle individual messages
    socket.on("message", (messageData) => {
      if (!messageData) return;

      console.log("📨 Received socket message:", messageData);

      const { receiverId, content, _id, sender, createdAt, attachments } = messageData;

      if (!receiverId) {
        console.warn("Message missing receiverId");
        return;
      }

      const receiverIdStr = receiverId.toString();
      const senderIdStr = (sender || currentUserId)?.toString();

      // Construct message to emit
      const messageToEmit = {
        _id: _id || Date.now(),
        sender: senderIdStr,
        receiver: receiverIdStr,
        content: content || messageData.message || "",
        attachments: attachments || [],
        createdAt: createdAt || new Date().toISOString(),
        isRead: false
      };

      // Only emit to receiver's room - NOT to sender
      // Sender already has the message via optimistic update
      io.to(receiverIdStr).emit("message", messageToEmit);
      console.log(`✅ Message emitted to user ${receiverIdStr} only (not to sender ${senderIdStr})`);
    });

    // Handle typing indicator
    socket.on("typing", ({ receiverId, isTyping }) => {
      if (!receiverId || !currentUserId) return;

      const typingKey = `${currentUserId}:${receiverId}`;

      if (isTyping) {
        // Clear existing timeout
        if (typingTimeouts.has(typingKey)) {
          clearTimeout(typingTimeouts.get(typingKey));
        }

        // Emit typing status
        io.to(receiverId.toString()).emit("userTyping", {
          userId: currentUserId,
          isTyping: true
        });

        // Auto-clear typing after 3 seconds
        typingTimeouts.set(typingKey, setTimeout(() => {
          io.to(receiverId.toString()).emit("userTyping", {
            userId: currentUserId,
            isTyping: false
          });
          typingTimeouts.delete(typingKey);
        }, 3000));
      } else {
        // Clear typing status
        if (typingTimeouts.has(typingKey)) {
          clearTimeout(typingTimeouts.get(typingKey));
          typingTimeouts.delete(typingKey);
        }
        io.to(receiverId.toString()).emit("userTyping", {
          userId: currentUserId,
          isTyping: false
        });
      }
    });

    // Handle read receipts
    socket.on("markRead", ({ senderId, messageIds }) => {
      if (!senderId || !messageIds) return;

      io.to(senderId.toString()).emit("messagesRead", {
        readBy: currentUserId,
        messageIds
      });
    });

    // Handle group messages
    socket.on("groupMessage", (messageData) => {
      if (!messageData) return;

      const { groupId, message, sender } = messageData;
      if (!groupId) return;

      io.to(`group:${groupId}`).emit("groupMessage", { message, sender });
    });

    // Handle client disconnection
    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);

      if (currentUserId && connectedUsers.has(currentUserId)) {
        connectedUsers.get(currentUserId).delete(socket.id);

        // If no more connections for this user, remove and notify
        if (connectedUsers.get(currentUserId).size === 0) {
          connectedUsers.delete(currentUserId);
          socket.broadcast.emit("userOffline", { userId: currentUserId });
          console.log(`User ${currentUserId} is now offline`);
        }
      }

      // Clean up typing timeouts
      for (const [key, timeout] of typingTimeouts.entries()) {
        if (key.startsWith(`${currentUserId}:`)) {
          clearTimeout(timeout);
          typingTimeouts.delete(key);
        }
      }
    });
  });

  // Redis subscriber for broadcast messages
  redisSubscriber.subscribe("broadcastChannel", (message) => {
    try {
      const { messages } = JSON.parse(message);
      console.log("Received broadcast message:", messages?.length, "messages");

      if (!messages || !Array.isArray(messages)) return;

      messages.forEach((msg) => {
        const { receiver, sender, content, isBroadcast, timestamp } = msg;

        if (!receiver) return;

        const receiverStr = receiver.toString();

        // Emit to receiver's room (works whether online or not - room is persistent)
        io.to(receiverStr).emit("message", {
          content,
          sender,
          receiver: receiverStr,
          isBroadcast,
          timestamp,
          createdAt: timestamp || new Date().toISOString()
        });

        console.log(`Broadcast message sent to user: ${receiverStr}`);
      });
    } catch (error) {
      console.error('Error processing broadcast message:', error);
    }
  });

  // Export helper functions
  return {
    getConnectedUsers: () => connectedUsers,
    isUserOnline: (userId) => connectedUsers.has(userId?.toString()),
    getOnlineUserCount: () => connectedUsers.size
  };
};
