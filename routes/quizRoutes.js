const express = require('express');
const multer = require('multer');
const upload = multer({dest: 'uploadsTest/'});
const questionRoutes = require('./questionRoutes');
const questionController = require('../controllers/questionController');
const quizController = require('../controllers/quizController');
const authJwt = require('../middlewares/authJwt');

const router = express.Router();

module.exports = (app) => {
    //for admin- for quiz management
    app.post('/api/v1/admin/quizzes/:folderId',[authJwt.verifyToken],quizController.createQuiz);

    //Fetch all quize for quize page
    app.get('/api/v1/admin/quizzes',[authJwt.verifyToken], quizController.fetchAllQuizzes);

    // Fetch quizzes by folder ID
    app.get('/api/v1/admin/folder/:folderId', [authJwt.verifyToken], quizController.fetchQuizzesByFolder);

    //Quize Fetch for quize details page -> Isse sbse kuchh aa jayega for one quize
    app.get('/api/v1/admin/quizzes/:quizId',[authJwt.verifyToken], quizController.specificQuizDetails);
    
    //Edit Quize
    app.put('/api/v1/admin/quizzes/:quizId',[authJwt.verifyToken], quizController.updateQuiz);

    app.delete('/api/v1/admin/quizzes/:quizId',[authJwt.verifyToken],quizController.deleteQuiz);
    
    app.put('/api/v1/admin/quizzes/:quizId/toggle-active',[authJwt.verifyToken],quizController.toggleQuizActive);
     

    app.get('/api/v1/admin/quizzes/:quizId/availability',[authJwt.verifyToken],quizController.getQuizAvailability);
    
    app.patch('/api/v1/admin/quizzes/:quizId/availability',[authJwt.verifyToken],quizController.updateQuizAvailability);
    app.get('/api/v1/quizzes/:quizId/availability',[authJwt.verifyToken],quizController.getQuizAvailability);
   
    app.patch('/api/v1/admin/quizzes/:quizId/attempts',[authJwt.verifyToken],quizController.setQuizAttempts);
    
    app.post('/api/v1/admin/quizzes/:quizId/upload-questions',[authJwt.verifyToken],upload.single('file'),questionController.uploadQuestionsFromWord);

    //for user- for quiz usage
    app.get('/api/v1/quizzes',[authJwt.verifyToken],quizController.fetchAllQuizzes);
    app.get('/api/v1/quizzes/:quizId',[authJwt.verifyToken],quizController.specificQuizDetails);
};