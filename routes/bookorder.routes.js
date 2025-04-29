const express = require('express');
const bookOrderController = require('../controllers/bookorderpaymentController');
const authJwt = require('../middlewares/authJwt');

module.exports = (app) => {
  app.post('/api/v1/orders', [authJwt.verifyToken], bookOrderController.createOrder);
  app.get('/api/v1/orders/user/:userId', [authJwt.verifyToken], bookOrderController.getOrdersByUser);
  app.get('/api/v1/orders', [authJwt.verifyToken], bookOrderController.getAllOrders);
  app.delete('/api/v1/orders/:orderId', [authJwt.verifyToken], bookOrderController.deleteOrder);
};