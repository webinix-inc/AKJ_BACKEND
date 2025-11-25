const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const quizFolderSchema = new Schema(
  {
    name: { type: String, required: true },
    parentFolderId: {
      type: Schema.Types.ObjectId,
      ref: "QuizFolder",
      default: null,
    },
    subFolders: [{ type: Schema.Types.ObjectId, ref: "QuizFolder" }],
    quizzes: [{ type: Schema.Types.ObjectId, ref: "Quiz" }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    courses: [{ type: Schema.Types.ObjectId, ref: "Course" }],
    isVisible: { type: Boolean, default: true }, // 🔧 FIX: Default to visible so users can see assigned test folders
  },
  { timestamps: true }
);

// 🚀 PERFORMANCE INDEXES for 2000+ concurrent users
quizFolderSchema.index({ parentFolderId: 1 });
quizFolderSchema.index({ createdBy: 1 });
quizFolderSchema.index({ isVisible: 1 });
quizFolderSchema.index({ courses: 1 });
quizFolderSchema.index({ createdAt: -1 });
quizFolderSchema.index({ parentFolderId: 1, isVisible: 1 }); // Visible subfolders

// Export the model
module.exports = mongoose.models.QuizFolder || mongoose.model("QuizFolder", quizFolderSchema);
