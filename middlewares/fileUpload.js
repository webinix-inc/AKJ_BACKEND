const multer = require("multer");
const multerS3 = require("multer-s3");
const { S3Client } = require("@aws-sdk/client-s3");
const authConfig = require("../configs/auth.config"); // For bucket name and other configurations

// Initialize the S3 client
const s3 = new S3Client({
  region: authConfig.aws_region,
  credentials: {
    accessKeyId: authConfig.aws_access_key_id,
    secretAccessKey: authConfig.aws_secret_access_key,
  },
});

// Reusable S3 storage configuration
const s3Storage = (folderName = "images") =>
  multerS3({
    s3: s3,
    bucket: authConfig.s3_bucket, // Use the bucket name from config (without slashes)
    // ACL removed as bucket has ACLs disabled
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      // Sanitize filename to avoid special characters and spaces
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `${Date.now().toString()}_${sanitizedName}`;
      const fullPath = `${folderName}/${fileName}`; // Construct the full path with the folder name
      cb(null, fullPath); // Generate a unique key with the folder structure
    },
    contentType: multerS3.AUTO_CONTENT_TYPE, // Auto-detect content type
  });

// Profile Image Upload
const userProfileUpload = multer({
  storage: s3Storage("images/profile"),
});

// Banner Image Upload
const bannerImage = multer({
  storage: s3Storage("images/banner"),
});

// Course Image and Notes Upload
const courseImage = multer({
  storage: s3Storage("images/course"),
});

const bookImage = multer({
  storage: s3Storage("images/books"),
});

const kpUpload = courseImage.fields([
  { name: "courseImage", maxCount: 100 },
  { name: "courseNotes", maxCount: 100 },
  { name: "courseVideo", maxCount: 100 },
]);

// Category Image Upload
const categoryImage = multer({
  storage: s3Storage("images/categoryImage"),
});

// Product Image Upload
const productImage = multer({
  storage: s3Storage("images/productImage"),
});

// Course SubCategory Image Upload
const subCategoryUpload = multer({
  storage: s3Storage("images/courseSubCategory"),
});

// Enhanced Video Upload with larger file size limits for 1GB videos
const videoUpload = multer({
  storage: s3Storage("videos/course"),
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB file size limit
    files: 10, // Max 10 files per upload
  },
  fileFilter: (req, file, cb) => {
    // Allow video file types
    const allowedMimeTypes = [
      "video/mp4",
      "video/webm", 
      "video/quicktime",
      "video/x-msvideo", // .avi
      "video/x-ms-wmv", // .wmv
      "video/x-flv", // .flv
      "video/3gpp", // .3gp
      "video/x-matroska", // .mkv
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid video file type: ${file.mimetype}. Allowed types: ${allowedMimeTypes.join(', ')}`), false);
    }
  },
});

const kpUpload1 = multer({
  storage: s3Storage("content"),
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB file size limit for large videos
    files: 100, // Max 100 files per upload
  },
  fileFilter: (req, file, cb) => {
    // Allow all common file types including large videos
    const allowedMimeTypes = [
      // Images
      "image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "image/svg+xml",
      // Videos (with large file support)
      "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-ms-wmv", 
      "video/x-flv", "video/3gpp", "video/x-matroska", "video/mpeg", "video/ogg",
      // Documents
      "application/pdf", "application/msword", 
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel", 
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain", "text/csv",
      // Audio
      "audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}`), false);
    }
  },
}).fields([
  { name: "courseImage", maxCount: 100 },
  { name: "courseNotes", maxCount: 100 },
  { name: "courseVideo", maxCount: 100 },
]);

// Syllabus Upload
const syllabusUpload = multer({
  storage: s3Storage("images/syllabus"),
});

// Test Series Upload (with private ACL for sensitive data)
const TestSeriesUpload = multer({
  storage: s3Storage("images/testSeries", "private"),
});

// Teacher Image Upload
const teacherImage = multer({
  storage: s3Storage("images/teacher"),
});

const kpUpload2 = teacherImage.fields([
  { name: "image", maxCount: 1 },
  { name: "otherImage", maxCount: 1 },
]);

// Behavior Upload
const behaviourUpload = multer({
  storage: s3Storage("images/behaviourUpload"),
});

const chatAttachmentUpload = multer({
  storage: s3Storage("messages/attachments"),
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowedMimeTypes = [
      // Images
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      // Videos
      "video/mp4",
      "video/webm",
      "video/quicktime",
      // Documents
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain",
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"), false);
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
    files: 5, // Max 5 files per upload
  },
});

const chatAttachments = chatAttachmentUpload.array("attachments", 5);

// Export all multer setups for use in routes
module.exports = {
  userProfileUpload,
  bannerImage,
  bookImage,
  kpUpload,
  categoryImage,
  productImage,
  subCategoryUpload,
  kpUpload1,
  videoUpload, // New enhanced video upload middleware
  syllabusUpload,
  TestSeriesUpload,
  kpUpload2,
  behaviourUpload,
  chatAttachments, 
};