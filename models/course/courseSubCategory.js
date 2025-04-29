const mongoose = require("mongoose");

const schema = mongoose.Schema;
const categorySchema = schema(
  {
    courseId: {
      type: schema.Types.ObjectId,
      ref: "Course",
    },
    categoryId: {
      type: schema.Types.ObjectId,
      ref: "CourseCategory",
    },
    name: {
      type: String,
    },
    description: {
      type: String,
    },
    duration: {
      type: String,
    },
    lessons: {
      type: String,
    },
    weeks: {
      type: String,
    },
    courseImage: [
      {
        // img: {
        type: String,
        // }
      },
    ],
    courseVideo: [
      {
        type: String,
      },
    ],
    courseNotes: [
      {
        // note: {
        type: String,
        // }
      },
    ],
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    courseType: {
      type: String,
      enum: ["Free", "Paid"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("subCategory", categorySchema);
