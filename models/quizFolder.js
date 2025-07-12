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
    isVisible: { type: Boolean, default: false }, // New field for visibility
  },
  { timestamps: true }
);

module.exports = mongoose.model("QuizFolder", quizFolderSchema);
