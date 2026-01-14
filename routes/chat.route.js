const chatController = require("../controllers/chatController");
const authJwt = require("../middlewares/authJwt");
const { chatAttachments } = require("../middlewares/fileUpload");
const { chatRateLimiter, chatFetchRateLimiter } = require("../middlewares/rateLimiter");

const express = require("express");
const router = express.Router();

module.exports = (app) => {
  // Send message with rate limiting
  app.post(
    "/api/v1/chat/send",
    [authJwt.verifyToken, chatRateLimiter, chatAttachments],
    chatController.sendMessage
  );

  // Get users based on roles with rate limiting
  app.get(
    "/api/v1/chat/getUsersBasedOnRoles",
    [authJwt.verifyToken, chatFetchRateLimiter],
    chatController.getChatTabUsers
  );

  // Get users with messages with rate limiting
  app.get(
    "/api/v1/chat/users/withMessages",
    [authJwt.verifyToken, chatFetchRateLimiter],
    chatController.getUsersWithMessages
  );

  // Mark messages as read
  app.get(
    "/api/v1/chat/markAsRead/:partnerId",
    [authJwt.verifyToken],
    chatController.markMessageAsRead
  );

  // Get group user data
  app.get(
    "/api/v1/chat/getUserDataOfGroup/:groupId",
    [authJwt.verifyToken, chatFetchRateLimiter],
    chatController.getUserDataOfGroup
  );

  // Get groups for user
  app.get(
    "/api/v1/chat/groups",
    [authJwt.verifyToken, chatFetchRateLimiter],
    chatController.getGroupsForUser
  );

  // Get messages for specific user with rate limiting
  app.get(
    "/api/v1/chat/:requestedUserID",
    [authJwt.verifyToken, chatFetchRateLimiter],
    chatController.specificUserMessages
  );

  // Admin chat access control
  app.put(
    "/api/v1/admin/chat/chat-access/:requestedUserId",
    [authJwt.verifyToken],
    chatController.chatAccess
  );
};