const multer = require('multer');  // <-- Import multer
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Cloudinary configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer-Cloudinary storage configuration
const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
        let folderName = '';
        let resourceType = 'auto'; // Default resource type

        // Determine folder and resource type based on the file fieldname and type
        if (file.fieldname === 'courseImage') {
            folderName = 'courses/images';
        } else if (file.fieldname === 'courseNotes') {
            folderName = 'courses/notes';
            resourceType = 'raw'; // Treat PDFs as raw files
        }

        return {
            folder: folderName,
            resource_type: resourceType,
            public_id: file.originalname.split('.')[0], // Optional: Customize the public ID if needed
        };
    },
});



// Multer setup to handle multiple files
const kpUpload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max file size
    },
}).fields([
    { name: 'courseImage', maxCount: 10 },  // Allow up to 10 course images
    { name: 'courseNotes', maxCount: 10 },  // Allow up to 10 course notes
]);

module.exports = { kpUpload, cloudinary };
