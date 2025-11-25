const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipient: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    courses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
      },
    ],
    title: {
      type: String,
    },
    message: {
      type: String,
    },
    type: {
      type: String,
      enum: [
        "NEW_COURSE_PURCHASE",
        "ADMIN_BROADCAST",
        "COURSE_SPECIFIC",
        "USER_SPECIFIC",
        "NEW_USER_SIGNUP",
        "COURSE_UPDATE",
        "PAYMENT_SUCCESS",
        "PAYMENT_FAILED",
        "COURSE_COMPLETION",
        "NEW_COURSE_AVAILABLE",
        "TO EVERYONE",
      ],
      required: true,
    },
    sendVia: {
      type: String,
      enum: ["SMS", "EMAIL", "NOTIFICATION"],
      default: "NOTIFICATION",
    },
    metadata: {
      landingScreen: String,
      imageUrl: String,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      default: "MEDIUM",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Export the model
module.exports = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
