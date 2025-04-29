const express = require('express');
const batchController = require('../controllers/batchController');
const authJwt = require('../middlewares/authJwt'); 


const router = express.Router();

module.exports = (app) => {
  app.get('/api/v1/admin/freeCourse', [authJwt.verifyToken], batchController.getAllBatches);
  app.get('/api/v1/admin/freeCourse/:id', [authJwt.verifyToken], batchController.getBatchById);
  app.post('/api/v1/admin/freeCourse', [authJwt.verifyToken], batchController.createBatch);
  app.put('/api/v1/admin/freeCourse/:id', [authJwt.verifyToken], batchController.updateBatch);
  app.delete('/api/v1/admin/freeCourse/:id', [authJwt.verifyToken], batchController.deleteBatch);
};
