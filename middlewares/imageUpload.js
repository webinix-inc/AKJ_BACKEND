var multer = require("multer");
const multerS3 = require("multer-s3");
const { S3Client } = require("@aws-sdk/client-s3");
const authConfig = require("../configs/auth.config");

// Configure S3 client
const s3 = new S3Client({
  region: authConfig.aws_region,
  credentials: {
    accessKeyId: authConfig.aws_access_key_id,
    secretAccessKey: authConfig.aws_secret_access_key,
  },
});

// Helper function to create S3 storage configuration (following existing project pattern)
const createS3Storage = (folderName) => multerS3({
  s3: s3,
  bucket: authConfig.s3_bucket,
  // ACL removed as bucket has ACLs disabled
  metadata: (req, file, cb) => {
    cb(null, { fieldName: file.fieldname });
  },
  key: (req, file, cb) => {
    // Sanitize filename to avoid special characters and spaces
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${Date.now().toString()}_${sanitizedName}`;
    const fullPath = `${folderName}/${fileName}`;
    cb(null, fullPath);
  },
  contentType: multerS3.AUTO_CONTENT_TYPE,
});

console.log("✅ ImageUpload middleware: Using S3 storage instead of Cloudinary");
// Profile images
const storage = createS3Storage("images/profile");
const userProfileUpload = multer({ storage: storage });

// Banner images
const storage1 = createS3Storage("images/banner");
const bannerImage = multer({ storage: storage1 });

// Course images and files
const storage2 = createS3Storage("images/course");
const courseImage = multer({ storage: storage2 });

const kpUpload = courseImage.fields([
    { name: 'courseImage', maxCount: 10 },
    { name: 'courseNotes', maxCount: 10 },
]);

// Category images
const storage3 = createS3Storage("images/categoryImage");
const categoryImage = multer({ storage: storage3 });

// Product images
const storage4 = createS3Storage("images/productImage");
const productImage = multer({ storage: storage4 });

// Course category images
const storage5 = createS3Storage("images/CourseCategory");
const subCategoryUpload = multer({ storage: storage5 });

// Course subcategory files
const storage6 = createS3Storage("images/CourseSubCategory");
const subCategory = multer({ storage: storage6 });

// Enhanced course upload with multiple fields
const kpUpload1 = courseImage.fields([
    { name: 'courseImage', maxCount: 100 },
    { name: 'courseNotes', maxCount: 100 },
    { name: 'courseVideo', maxCount: 100 },
]);

// Course images (alternative)
const storage7 = createS3Storage("images/CourseCategory");
const courseImage1 = multer({ storage: storage7 });

// Batch course images with dynamic folder naming
const createBatchCourseStorage = () => multerS3({
  s3: s3,
  bucket: authConfig.s3_bucket,
  metadata: (req, file, cb) => {
    cb(null, { fieldName: file.fieldname });
  },
  key: (req, file, cb) => {
    console.log(`\n🗂️ ===== S3 UPLOAD MIDDLEWARE =====`);
    console.log(`📁 Processing file upload for: ${file.originalname}`);
    console.log(`📝 Request body available:`, Object.keys(req.body));
    
    // Use batch name from request body for folder structure
    const batchName = req.body.batchName || req.body.title || 'default-batch';
    const sanitizedBatchName = batchName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const sanitizedFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${Date.now().toString()}_${sanitizedFileName}`;
    const fullPath = `images/BatchCourses/${sanitizedBatchName}/${fileName}`;
    
    console.log(`🔧 S3 Upload Configuration:`);
    console.log(`   - Original Batch Name: ${batchName}`);
    console.log(`   - Sanitized Batch Name: ${sanitizedBatchName}`);
    console.log(`   - Original File Name: ${file.originalname}`);
    console.log(`   - Sanitized File Name: ${sanitizedFileName}`);
    console.log(`   - Final File Name: ${fileName}`);
    console.log(`   - Full S3 Path: ${fullPath}`);
    console.log(`📤 Starting upload to S3...`);
    
    cb(null, fullPath);
  },
  contentType: multerS3.AUTO_CONTENT_TYPE,
});

const batchCourseImage = multer({ storage: createBatchCourseStorage() });

// Course notes
const storage8 = createS3Storage("documents/CourseNotes");
const courseNotes = multer({ storage: storage8 });

// Course videos
const storage9 = createS3Storage("videos/CourseVideos");
const courseVideo = multer({ storage: storage9 });

// Document uploads
const storage10 = createS3Storage("documents/general");
const documentUpload = multer({ storage: storage10 });

// Teacher images
const storage11 = createS3Storage("images/teachers");
const teacherImage = multer({ storage: storage11 });
const kpUpload2 = teacherImage.fields([
    { name: 'image', maxCount: 1 },
    { name: 'otherImage', maxCount: 1 },
]);
// Syllabus uploads
const storage12 = createS3Storage("documents/syllabus");
const syllabusUpload = multer({ storage: storage12 });

// Test series uploads (alternative config)
const storage134 = createS3Storage("documents/testSeries");

// Test series uploads (main config)
const storage13 = createS3Storage("documents/testSeries");
const TestSeriesUpload = multer({ storage: storage13 });

// Behaviour uploads
const storage14 = createS3Storage("documents/behaviourUpload");
const behaviourUpload = multer({ storage: storage14 });




module.exports = { userProfileUpload, bannerImage, kpUpload, categoryImage, productImage, subCategoryUpload, subCategory, kpUpload1, courseImage1, batchCourseImage, courseNotes, courseVideo, documentUpload, kpUpload2, syllabusUpload, TestSeriesUpload, behaviourUpload };
