const express = require('express');

const questionController = require('../controllers/questionController');
const authJwt = require("../middlewares/authJwt");

const router = express.Router();

module.exports = (app) => {

    // for admin- for question management
    app.post('/api/v1/admin/quizzes/:quizId/questions', [authJwt.verifyToken], questionController.addQuestion);

    app.get('/api/v1/admin/quizzes/:quizId/questions', [authJwt.verifyToken], questionController.fetchAllQuestions);

    app.get('/api/v1/admin/quizzes/:quizId/questions/:questionId', [authJwt.verifyToken], questionController.specificQuestionDetails);

    app.put('/api/v1/admin/quizzes/:quizId/questions/:questionId', [authJwt.verifyToken], questionController.updateQuestion);

    app.delete('/api/v1/admin/quizzes/:quizId/questions/:questionId', [authJwt.verifyToken], questionController.deleteQuestion);

    // Admin route for deleting all questions in a quiz
    app.delete('/api/v1/admin/quizzes/:quizId/questions', [authJwt.verifyToken], questionController.deleteAllQuestions);


    // for user- for question usage
    app.get('/api/v1/quizzes/:quizId/questions', [authJwt.verifyToken], questionController.fetchAllQuestions
    );

    app.get('/api/v1/quizzes/:quizId/questions/:questionId', [authJwt.verifyToken], questionController.specificQuestionDetails);
};