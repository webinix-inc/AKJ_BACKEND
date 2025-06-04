const express = require('express');
const {
  placeOrder,
  getAllOrders,
  getOrderById,
  updateOrderStatus
} = require('../controllers/BookorderController');
const authJwt = require('../middlewares/authJwt');

module.exports = (app) => {
  // Place a new order
  // app.post('/api/v1/admin/bookorder',  placeOrder);

  // Get all orders
  app.get('/api/v1/admin/bookorders',  getAllOrders);

  // Get a specific order by ID
  app.get('/api/v1/admin/bookorder/:id', [authJwt.verifyToken], getOrderById);

  // Update order status by ID
  app.patch('/api/v1/admin/bookorder/:id', [authJwt.verifyToken], updateOrderStatus);
};