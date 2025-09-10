const express = require("express");
const router = express.Router();
const {
  createLiveClass,
  createUser,
  fetchAllClasses,
  editLiveClass,
  deleteLiveClass,
  checkClassStatus,
  getRecordedVideos,
  handleMeritHubStatusPing,
} = require("../controllers/liveClassController");
const authJwt = require("../middlewares/authJwt"); // Importing auth middleware

module.exports = (app) => {
  app.post("/api/v1/admin/live-classes", createLiveClass);
  app.put("/api/v1/admin/edit-live-classes/:classId", editLiveClass);
  app.delete("/api/v1/admin/delete-live-classes/:classId", deleteLiveClass);
  app.get("/api/v1/admin/live-classes/:classId/status", checkClassStatus);
  app.post("/api/v1/admin/live-users", createUser);
  app.post("/api/v1/admin/webhooks/merithub-status", handleMeritHubStatusPing);
  app.get("/api/v1/admin/upcoming-live-classes", fetchAllClasses);

  app.get("/courses/:courseId/recorded-videos", [authJwt.verifyToken], getRecordedVideos);
};
