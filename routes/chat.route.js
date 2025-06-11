const chatController = require("../controllers/chatController");
const authJwt = require("../middlewares/authJwt");
const { chatAttachments } = require("../middlewares/fileUpload");

const express = require("express");
const router = express.Router();

module.exports = (app) => {
  app.post(
    "/api/v1/chat/send",
    [authJwt.verifyToken, chatAttachments],
    chatController.sendMessage
  );
  app.get(
    "/api/v1/chat/getUsersBasedOnRoles",
    [authJwt.verifyToken],
    chatController.getChatTabUsers
  );
  app.get(
    "/api/v1/chat/users/withMessages",
    [authJwt.verifyToken],
    chatController.getUsersWithMessages
  );

  app.get("/api/v1/chat/markAsRead/:partnerId", [authJwt.verifyToken], chatController.markMessageAsRead);

  app.get("/api/v1/chat/getUserDataOfGroup/:groupId", [authJwt.verifyToken], chatController.getUserDataOfGroup);

  // New routes
  app.get("/api/v1/chat/groups", [authJwt.verifyToken], chatController.getGroupsForUser);
  
  app.get("/api/v1/chat/:requestedUserID", [authJwt.verifyToken], chatController.specificUserMessages);

  app.put("/api/v1/admin/chat/chat-access/:requestedUserId", [authJwt.verifyToken], chatController.chatAccess);
};