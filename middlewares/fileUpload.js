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
const s3Storage = (folderName = "public-read") =>
  multerS3({
    s3: s3,
    bucket: authConfig.s3_bucket, // Use the bucket name from config (without slashes)
    // acl: folderName === 'private' ? 'private' : 'public-read', // Set ACL based on folder
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      const fileName = `${Date.now().toString()}_${file.originalname}`;
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

const kpUpload1 = courseImage.fields([
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
  syllabusUpload,
  TestSeriesUpload,
  kpUpload2,
  behaviourUpload,
};
