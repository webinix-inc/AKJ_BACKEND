const express = require('express');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const authConfig = require('../configs/auth.config');

// 🔧 NEW: S3-based Word document upload configuration
const s3 = new S3Client({
  region: authConfig.aws_region,
  credentials: {
    accessKeyId: authConfig.aws_access_key_id,
    secretAccessKey: authConfig.aws_secret_access_key,
  },
});

// 🔧 NEW: S3 storage for Word documents under quizes/files/
const wordDocumentStorage = multerS3({
  s3: s3,
  bucket: authConfig.s3_bucket,
  metadata: (req, file, cb) => {
    cb(null, { 
      fieldName: file.fieldname,
      quizId: req.params.quizId,
      uploadTimestamp: new Date().toISOString()
    });
  },
  key: (req, file, cb) => {
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
    const fileName = `${req.params.quizId}_${timestamp}_${file.originalname}`;
    const fullPath = `quizes/files/${fileName}`;
    cb(null, fullPath);
  },
  contentType: multerS3.AUTO_CONTENT_TYPE,
});

// 🔧 NEW: Enhanced upload configuration with S3 storage
const uploadToS3 = multer({ 
  storage: wordDocumentStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for Word documents
  fileFilter: (req, file, cb) => {
    // Only allow Word documents
    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/msword' // .doc
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Word documents (.doc, .docx) are allowed'), false);
    }
  }
});

// 🔧 REMOVED: Legacy local upload system replaced by S3-based system

// 🔧 NEW: Import controller for DOCX to LaTeX conversion
const { importDocxToQuiz } = require('../controllers/quizImportController');
const uploadImport = multer({ limits: { fileSize: 15 * 1024 * 1024 } }); // 15MB limit for import
const questionRoutes = require('./questionRoutes');
const questionController = require('../controllers/questionController');
const quizController = require('../controllers/quizController');
const authJwt = require('../middlewares/authJwt');
const { cacheConfigs } = require('../middlewares/cacheMiddleware');

const router = express.Router();

module.exports = (app) => {
    console.log("📝 Registering quiz routes...");
    
    // Free tests endpoints (accessible to all - MUST be first to avoid route conflicts)
    app.get('/api/v1/free-tests', (req, res, next) => {
        console.log("✅ Free tests route hit!");
        next();
    }, quizController.fetchFreeTests);
    app.get('/api/v1/admin/free-tests', [authJwt.verifyToken], quizController.fetchFreeTests);
    
    console.log("✅ Free tests routes registered");
    
    //for admin- for quiz management
    app.post('/api/v1/admin/quizzes/:folderId',[authJwt.verifyToken],quizController.createQuiz);

    //Fetch all quize for quize page
    app.get('/api/v1/admin/quizzes',[authJwt.verifyToken, cacheConfigs.quizzes()], quizController.fetchAllQuizzes);

    // Fetch quizzes by folder ID
    app.get('/api/v1/admin/folder/:folderId', [authJwt.verifyToken, cacheConfigs.quizzes()], quizController.fetchQuizzesByFolder);

    //Quize Fetch for quize details page -> Isse sbse kuchh aa jayega for one quize
    app.get('/api/v1/admin/quizzes/:quizId',[authJwt.verifyToken, cacheConfigs.quizzes()], quizController.specificQuizDetails);
    
    //Edit Quize
    app.put('/api/v1/admin/quizzes/:quizId',[authJwt.verifyToken], quizController.updateQuiz);

    app.delete('/api/v1/admin/quizzes/:quizId',[authJwt.verifyToken],quizController.deleteQuiz);
    
    app.put('/api/v1/admin/quizzes/:quizId/toggle-active',[authJwt.verifyToken],quizController.toggleQuizActive);
     

    app.get('/api/v1/admin/quizzes/:quizId/availability',[authJwt.verifyToken],quizController.getQuizAvailability);
    
    app.patch('/api/v1/admin/quizzes/:quizId/availability',[authJwt.verifyToken],quizController.updateQuizAvailability);
    app.get('/api/v1/quizzes/:quizId/availability',[authJwt.verifyToken],quizController.getQuizAvailability);
   
    app.patch('/api/v1/admin/quizzes/:quizId/attempts',[authJwt.verifyToken],quizController.setQuizAttempts);
    
    // 🔧 S3-based Word document upload with enhanced parsing
    app.post('/api/v1/admin/quizzes/:quizId/upload-questions',[authJwt.verifyToken],uploadToS3.single('file'),questionController.uploadQuestionsFromS3);

    // 🔧 NEW: Import DOCX with LaTeX math extraction
    app.post('/api/v1/admin/quiz/:quizId/import-docx',[authJwt.verifyToken],uploadImport.single('file'),importDocxToQuiz);
    
    //for user- for quiz usage
    app.get('/api/v1/quizzes',[authJwt.verifyToken, cacheConfigs.quizzes()],quizController.fetchAllQuizzes);
    app.get('/api/v1/quizzes/:quizId',[authJwt.verifyToken, cacheConfigs.quizzes()],quizController.specificQuizDetails);
};