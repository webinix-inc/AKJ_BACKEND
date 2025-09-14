const express = require("express");
const router = express.Router();
const {
  analyzeLiveClassLinks,
  createTestLiveClass
} = require("../controllers/testController");

module.exports = (app) => {
  // Test endpoints for live class link analysis
  app.get("/api/v1/test/analyze-live-class-links", analyzeLiveClassLinks);
  app.post("/api/v1/test/create-test-live-class", createTestLiveClass);
};
