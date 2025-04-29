// routes/courseRoutes.js
const express = require('express');
const QuizFolderController = require('../controllers/quizFolderController');
const authJwt = require('../middlewares/authJwt');

const router = express.Router();

module.exports = (app) => {

    app.post('/api/v1/testPanel/create-quiz-folder', [authJwt.verifyToken], QuizFolderController.createQuizFolder);
    // app.post('/api/v1/folders/:folderId/add-subfolder', courseController.addSubfolder);
    // app.post('/api/v1/folders/:folderId/add-file', courseController.addFileToFolder);

    app.get('/api/v1/testPanel/folders?', [authJwt.verifyToken], QuizFolderController.getQuizFolders);

    app.delete('/api/v1/testPanel/folders/:folderId', QuizFolderController.deleteFolder);
    // app.delete('/api/v1/folders/:folderId/files/:fileId', courseController.deleteFileFromFolder);

    // app.post('/api/v1/files/move', courseController.moveFileToFolder);

    // app.get('/api/v1/folders/move', courseController.moveFolderToFolder);

    // app.patch('/api/v1/folders/:folderId/files/:fileId', courseController.isViewable);


    // New route for renaming folder
    app.patch('/api/v1/testPanel/folders/:folderId', [authJwt.verifyToken], QuizFolderController.updateQuizFolder);

    app.post('/api/v1/testPanel/folders/:folderId/add-subfolder', [authJwt.verifyToken], QuizFolderController.addSubfolder);

    app.get('/api/v1/testPanel/folders', [authJwt.verifyToken], QuizFolderController.getFolderStructure);

    app.get('/api/v1/testPanel/folders/:folderId', [authJwt.verifyToken], QuizFolderController.getFolderContents);
      
};