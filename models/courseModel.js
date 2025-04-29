const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const Subject = require("../models/subjectModel");
const { deleteFilesFromBucket } = require("../configs/aws.config");
const authConfig = require("../configs/auth.config");
const Folder=require('./folderModel');

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: [String],
      required: true,
    },
    // Link to a specific SubCategory within a Category
    subCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseCategory.subCategories",
      // required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseCategory",
      required: true,
    },
    subjects: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subject",
      },
    ],
    teacher: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    }],
    price: {
      type: Number,
      default:0,
    },
    oldPrice: Number,
    startDate: String,
    endDate: String,
    discount: { type: Number, default: 15 },
    duration: String,
    lessons: String,
    weeks: String,
    courseImage: [{ type: String }],
    courseVideo: [
      {
        url: { type: String, required: true },
        type: {
          type: String,
          enum: ["Free", "Paid"],
          required: true,
        },
      },
    ],
    courseNotes: [{ type: String }],
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    courseType: {
      type: String,
      enum: ["Free", "Paid"],
    },
     // New field to toggle publish status
     isPublished: {
      type: Boolean,
      default: false, // Default to unpublished
    },
    // Link to associated FAQs
    faqs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Faq" }],

    rootFolder: { type: Schema.Types.ObjectId, ref: 'Folder' },    
  },
  { timestamps: true }
);

// Pre-hook to delete associated subjects and media files
courseSchema.pre("findOneAndDelete", async function (next) {
  const course = await this.model.findOne(this.getFilter());

  if (course) {
    const subjects = await Subject.find({ courseId: course._id });

    // Collect media files from subjects and course
    const mediaFiles = [...course.courseImage, ...course.courseNotes];

    // Collect videos from both free and paid categories
    course.courseVideo.forEach((video) => {
      if (video.url) mediaFiles.push(video.url);
    });

    subjects.forEach((subject) => {
      subject.chapters.forEach((chapter) => {
        chapter.videos.forEach((video) => {
          if (video.url) mediaFiles.push(video.url);
        });
        chapter.notes.forEach((note) => {
          if (note.fileUrl) mediaFiles.push(note.fileUrl);
        });
      });
    });

    // Delete associated media files from S3
    if (mediaFiles.length > 0) {
      await deleteFilesFromBucket(authConfig.s3_bucket, mediaFiles);
    }

    // Delete all subjects associated with this course
    await Subject.deleteMany({ courseId: course._id });
  }

  next();
});

module.exports = mongoose.model("Course", courseSchema);
