const broadcastController = require("../controllers/broadcastController");
const authJwt = require("../middlewares/authJwt");

const express = require("express");
const router = express.Router(); 


module.exports = (app) => {
    app.post("/api/v1/broadcast", [authJwt.verifyToken], broadcastController.broadcastMessage);
};

