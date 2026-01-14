const express = require('express');
const {
  placeOrder,
  createBookOrder,
  getAllOrders,
  getOrdersByUser,
  getOrdersForUser,
  deleteOrder
} = require('../controllers/BookorderController');
const authJwt = require('../middlewares/authJwt');

module.exports = (app) => {
  // Create Razorpay order
  app.post("/api/v1/razorpay/createOrder", [authJwt.verifyToken], createBookOrder);
  
  // Place a new book order (save to database)
  app.post('/api/v1/orders', [authJwt.verifyToken], placeOrder);
  
  // Get all orders
  app.get('/api/v1/orders', [authJwt.verifyToken], getAllOrders);
  
  // Get orders for current authenticated user (no need to send email from FE)
  app.get('/api/v1/orders/user', [authJwt.verifyToken], getOrdersForUser);

  // Get orders by user email (userId is the email)
  app.get('/api/v1/orders/user/:userId', [authJwt.verifyToken], getOrdersByUser);
  
  // Delete an order by orderId
  app.delete('/api/v1/orders/:orderId', [authJwt.verifyToken], deleteOrder);
};
