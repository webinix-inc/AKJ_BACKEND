const mongoose = require("mongoose");

const quizSchema = new mongoose.Schema(
  {
    creatorId: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      required: true,
    },
    quizName: {
      type: String,
      required: true,
      unique: true,
    },
    duration: {
      hours: {
        type: Number,
        default: 0,
        min: [0, "Hours cannot be negative"],
      },
      minutes: {
        type: Number,
        default: 0,
        min: [0, "Minutes cannot be negative"],
      },
    },
    category: {
      type: String,
      required: true,
    },
    questions: [
      {
        type: mongoose.Types.ObjectId,
        ref: "Question",
      },
    ],
    isActive: {
      type: Boolean,
      default: false,
    },
    availabilityType: {
      type: String,
      enum: ["always", "scheduled"],
      default: "always",
    },
    scheduledStartDate: {
      type: String,
    },
    scheduledStartTime: {
      type: String,
    },
    scheduledEndDate: {
      type: String,
    },
    scheduledEndTime: {
      type: String,
    },
    quizTotalMarks: {
      type: Number,
      default: 0,
    },
    numberOfAttempts: {
      type: Number,
      default: 0,
    },
    averageScore: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 1,
      min: [1, "Max attempts must be at least 1"],
    },
    userAttempts: [
      {
        userId: {
          type: mongoose.Types.ObjectId,
          ref: "User",
        },
        attemptCount: {
          type: Number,
          default: 0,
        },
      },
    ],
    isFreeTest: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

quizSchema.index({ creatorId: 1 });
quizSchema.index({ quizName: 1 }, { unique: true });
quizSchema.index({ category: 1 });
quizSchema.index({ isActive: 1 });
quizSchema.index({ _id: 1, availabilityType: 1 });
quizSchema.index({ scheduledStart: 1, scheduledEnd: 1 });

// Export the model
const Quiz = mongoose.models.Quiz || mongoose.model("Quiz", quizSchema);
module.exports = Quiz;
