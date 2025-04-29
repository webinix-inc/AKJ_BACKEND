const express = require('express');
const router = express.Router();
const scorecardController = require('../controllers/scorecardController');
const authJwt = require("../middlewares/authJwt");
// const { validateQuizId, validateScorecardId } = require('../middleware/validate');
// const apiLimiter = require('../middleware/rateLimiter');

module.exports = (app) => {

    app.post('/api/v1/quizzes/:quizId/validate',[authJwt.verifyToken],scorecardController.validateQuizStart);

    app.post('/api/v1/quizzes/:quizId/start',[authJwt.verifyToken],scorecardController.startQuiz);

    app.post('/api/v1/scorecards/:scorecardId/submit/:questionId',[authJwt.verifyToken],scorecardController.submitAnswer);

    app.post('/api/v1/scorecards/:scorecardId/finish',[authJwt.verifyToken],scorecardController.finishQuiz);
    
    app.get('/api/v1/scorecards/:scorecardId',[authJwt.verifyToken],scorecardController.getScorecardDetails);

    app.get('/api/v1/quizzes/:quizId/history',[authJwt.verifyToken],scorecardController.getUserQuizHistory);
}