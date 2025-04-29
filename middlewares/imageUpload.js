var multer = require("multer");
const authConfig = require("../configs/auth.config");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;
cloudinary.config({ cloud_name: authConfig.cloud_name, api_key: authConfig.api_key, api_secret: authConfig.api_secret, });
const storage = new CloudinaryStorage({ cloudinary: cloudinary, params: { folder: "Amitesh-Project/images/profile", allowed_formats: ["jpg", "jpeg", "png", "PNG", "xlsx", "xls", "pdf", "PDF"], }, });
const userProfileUpload = multer({ storage: storage });
const storage1 = new CloudinaryStorage({ cloudinary: cloudinary, params: { folder: "Amitesh-Project/images/banner", allowed_formats: ["jpg", "jpeg", "png", "PNG", "xlsx", "xls", "pdf", "PDF"], }, });
const bannerImage = multer({ storage: storage1 });
const storage2 = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "Amitesh-Project/images/course",
        allowed_formats: ["jpg", "jpeg", "png", "PNG", "xlsx", "xls", "pdf", "PDF", "txt", "TXT", "jiff", "JIFF", "jfif", "JFIF", "mp4", "MP4", "webm", "WEBM"],
    },
});
const courseImage = multer({ storage: storage2 });

const kpUpload = courseImage.fields([
    { name: 'courseImage', maxCount: 10 },
    { name: 'courseNotes', maxCount: 10 },
]);

const storage3 = new CloudinaryStorage({ cloudinary: cloudinary, params: { folder: "Amitesh-Project/images/categoryImage", allowed_formats: ["jpg", "jpeg", "png", "PNG", "xlsx", "xls", "pdf", "PDF"], }, });
const categoryImage = multer({ storage: storage3 });
const storage4 = new CloudinaryStorage({ cloudinary: cloudinary, params: { folder: "Amitesh-Project/images/productImage", allowed_formats: ["jpg", "jpeg", "png", "PNG", "xlsx", "xls", "pdf", "PDF"], }, });
const productImage = multer({ storage: storage });
const storage5 = new CloudinaryStorage({ cloudinary: cloudinary, params: { folder: "Amitesh-Project/images/CourseCategory", allowed_formats: ["jpg", "jpeg", "png", "PNG", "xlsx", "xls", "pdf", "PDF"], }, });
const subCategoryUpload = multer({ storage: storage5 });
const storage6 = new CloudinaryStorage({ cloudinary: cloudinary, params: { folder: 'Amitesh-Project/images/CourseSubCategory', allowed_formats: ['jpg', 'jpeg', 'png', 'xlsx', 'xls', 'pdf', 'PDF', 'mp4', 'MP4', 'mkv', 'MKV', 'doc', 'docx'] } });
const subCategory = multer({ storage: storage6 });
const kpUpload1 = courseImage.fields([
    { name: 'courseImage', maxCount: 100 },
    { name: 'courseNotes', maxCount: 100 },
    { name: 'courseVideo', maxCount: 100 },
]);
const storage7 = new CloudinaryStorage({ cloudinary: cloudinary, params: { folder: "Amitesh-Project/images/CourseCategory", allowed_formats: ['jpg', 'jpeg', 'png', 'xlsx', 'xls', 'pdf', 'PDF', 'mp4', 'MP4', 'mkv', 'MKV', 'doc', 'docx'] } });
const courseImage1 = multer({ storage: storage7 });
const storage8 = new CloudinaryStorage({ cloudinary: cloudinary, params: { folder: "Amitesh-Project/images/CourseCategory", allowed_formats: ['jpg', 'jpeg', 'png', 'xlsx', 'xls', 'pdf', 'PDF', 'mp4', 'MP4', 'mkv', 'MKV', 'doc', 'docx'] } });
const courseNotes = multer({ storage: storage8 });
const storage9 = new CloudinaryStorage({ cloudinary: cloudinary, params: { folder: "Amitesh-Project/images/CourseCategory", allowed_formats: ['jpg', 'jpeg', 'png', 'xlsx', 'xls', 'pdf', 'PDF', 'mp4', 'MP4', 'mkv', 'MKV', 'doc', 'docx'] } });
const courseVideo = multer({ storage: storage9 });
const storage10 = new CloudinaryStorage({ cloudinary: cloudinary, params: { folder: "Amitesh-Project/images/document", allowed_formats: ["jpg", "jpeg", "png", "PNG", "xlsx", "xls", "pdf", "PDF"] } });
const documentUpload = multer({ storage: storage10 });
const storage11 = new CloudinaryStorage({ cloudinary: cloudinary, params: { folder: 'Amitesh-Project/images/CourseSubCategory', allowed_formats: ['jpg', 'jpeg', 'png', 'xlsx', 'xls', 'pdf', 'PDF', 'mp4', 'MP4', 'mkv', 'MKV', 'doc', 'docx'] } });
const teacherImage = multer({ storage: storage11 });
const kpUpload2 = teacherImage.fields([
    { name: 'image', maxCount: 1 },
    { name: 'otherImage', maxCount: 1 },
]);
const storage12 = new CloudinaryStorage({ cloudinary: cloudinary, params: { folder: "Amitesh-Project/images/syllabus", allowed_formats: ["jpg", "jpeg", "png", "PNG", "xlsx", "xls", "pdf", "PDF"] } });
const syllabusUpload = multer({ storage: storage12 });
const storage134 = new CloudinaryStorage({ cloudinary: cloudinary, params: { folder: "Amitesh-Project/images/testSeries", allowed_formats: ["jpg", "jpeg", "png", "PNG", "xlsx", "xls", "pdf", "PDF", "doc", "docx", "txt"] } });
const storage13 = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "Amitesh-Project/images/testSeries",
        resource_type: 'raw',
        allowed_formats: ["jpg", "jpeg", "png", "PNG", "xlsx", "xls", "pdf", "PDF", "DOC", "DOCX", "doc", "docx", "txt"]
    }
});
const TestSeriesUpload = multer({ storage: storage13 });
const storage14 = new CloudinaryStorage({ cloudinary: cloudinary, params: { folder: "Amitesh-Project/images/behaviourUpload", allowed_formats: ["jpg", "jpeg", "png", "PNG", "xlsx", "xls", "pdf", "PDF"] } });
const behaviourUpload = multer({ storage: storage14 });




module.exports = { userProfileUpload, bannerImage, kpUpload, categoryImage, productImage, subCategoryUpload, subCategory, kpUpload1, courseImage1, courseNotes, courseVideo, documentUpload, kpUpload2, syllabusUpload, TestSeriesUpload, behaviourUpload };
