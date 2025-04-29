// routes/achieverRoutes.js
const express = require("express");
const achieverController = require("../controllers/achieverController");
const authJwt = require('../middlewares/authJwt');
const { bookImage } = require('../middlewares/fileUpload');

const router = express.Router();

module.exports = (app) => {
  app.post('/api/v1/achievers', bookImage.array('photo', 100), achieverController.addAchiever);
  app.get('/api/v1/achievers', achieverController.getAchievers);
  app.put('/api/v1/achievers/:id',  bookImage.array('images', 100), [authJwt.verifyToken], achieverController.updateAchiever);
  app.delete('/api/v1/achievers/:id', [authJwt.verifyToken], achieverController.deleteAchiever);
  app.get('/api/v1/achievers/upload-url', [authJwt.verifyToken], achieverController.getUploadUrl);
  app.get('/api/v1/achievers/view-url', [authJwt.verifyToken], achieverController.getViewUrl); 
};