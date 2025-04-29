// routes/courseRoutes.js
const express = require('express');
const courseController = require('../controllers/courseController');
const authJwt = require('../middlewares/authJwt');

const router = express.Router();

module.exports = (app) => {

    app.post('/api/v1/admin/courses/access',[authJwt.verifyToken],courseController.adminManageCourseAccess);

    app.post('/api/v1/courses/create-folder', courseController.createFolder);
    app.post('/api/v1/folders/:folderId/add-subfolder', courseController.addSubfolder);
    app.post('/api/v1/folders/:folderId/add-file', courseController.addFileToFolder);

    app.delete('/api/v1/folders/:folderId', courseController.deleteFolder);
    app.delete('/api/v1/folders/:folderId/files/:fileId', courseController.deleteFileFromFolder);

    app.get('/api/v1/folders/:folderId',[authJwt.verifyToken], courseController.getFolderContents);

    app.get('/api/v1/folders/user/:folderId',courseController.getFolderContentsForHomeScreen);
    
    app.patch('/api/v1/folders/:folderId', courseController.updateFolder);

    app.post('/api/v1/files/move', courseController.moveFileToFolder);

    app.post('/api/v1/folders/move', courseController.moveFolderToFolder);

    app.patch('/api/v1/folders/:folderId/files/:fileId', courseController.updateFile);

    app.post('/api/v1/folders/quiz-folders/:folderId/import-quiz', courseController.importQuizToCourseFolder);

    app.delete('/api/v1/folders/quiz-folders/:folderId/quizzes/:quizId', courseController.removeQuizFromCourseFolder);
    
    app.post('/api/v1/folders/quiz-folders/:folderId/import-quiz-folder',courseController.importQuizFolderToCourseFolder);
    
    app.delete('/api/v1/folders/quiz-folders/:folderId/:quizFolderId',courseController.removeQuizFolderFromCourseFolder);

    app.post('/api/v1/folders/:folderId/update-order', courseController.updateFileOrder);
};