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
      enum: ["Free", "Paid", "Batch"],
    },
     // New field to toggle publish status
     isPublished: {
      type: Boolean,
      default: false, // Default to unpublished
    },
    // Link to associated FAQs
    faqs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Faq" }],

    rootFolder: { type: Schema.Types.ObjectId, ref: 'Folder' },
    
    // Batch course specific fields (optional, only used when courseType is "Batch")
    batchName: {
      type: String,
    },
    batchSize: {
      type: Number,
      default: 50,
    },
    batchStartDate: {
      type: Date,
    },
    batchEndDate: {
      type: Date,
    },
    // Manual enrollments for batch courses (no payment required)
    manualEnrollments: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      enrolledDate: {
        type: Date,
        default: Date.now
      },
      enrolledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Admin who enrolled the user
      },
      status: {
        type: String,
        enum: ['Active', 'Inactive', 'Completed'],
        default: 'Active'
      }
    }],
  },
  { timestamps: true }
);

// Pre-save hook to ensure isPublished is always a proper boolean
courseSchema.pre("save", function (next) {
  // Ensure isPublished is always a boolean
  if (this.isPublished === undefined || this.isPublished === null) {
    this.isPublished = false;
  } else if (typeof this.isPublished !== 'boolean') {
    // Convert string values to boolean
    this.isPublished = this.isPublished === 'true' || this.isPublished === true;
  }
  next();
});

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

// 🚀 PERFORMANCE INDEXES for 2000+ concurrent users
// Single field indexes for frequent queries
courseSchema.index({ isPublished: 1 });
courseSchema.index({ category: 1 });
courseSchema.index({ subCategory: 1 });
courseSchema.index({ price: 1 });
courseSchema.index({ teacher: 1 });
courseSchema.index({ createdAt: -1 });

// Compound indexes for complex queries
courseSchema.index({ isPublished: 1, category: 1 }); // Published courses by category
courseSchema.index({ isPublished: 1, price: 1 }); // Published courses by price
courseSchema.index({ category: 1, subCategory: 1 }); // Category navigation
courseSchema.index({ teacher: 1, isPublished: 1 }); // Teacher's published courses
courseSchema.index({ isPublished: 1, createdAt: -1 }); // Latest published courses

module.exports = mongoose.model("Course", courseSchema);
