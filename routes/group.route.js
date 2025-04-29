const express = require("express");
const router = express.Router();
const groupController = require("../controllers/groupController");
const authJwt = require("../middlewares/authJwt"); 

module.exports = (app) => {
    app.post("/api/v1/group/create", [authJwt.verifyToken], groupController.createGroup);
    app.post("/api/v1/group/sendMessage", [authJwt.verifyToken], groupController.sendGroupMessage);
    // app.get('/api/v1/group/groups', authJwt.verifyToken, auth.getUserGroups); // Uncomment if needed
    app.get("/api/v1/group/messages/:groupId", [authJwt.verifyToken], groupController.getGroupMessages);
};
