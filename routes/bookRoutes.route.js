// routes/bookRoutes.route.js
const express = require('express');
const { bannerImage } = require('../middlewares/imageUpload');
const bookController = require('../controllers/bookController'); // Adjusted import for book controller
const authJwt = require('../middlewares/authJwt'); // Importing auth middleware
const { kpUpload,bookImage } = require('../middlewares/fileUpload');

module.exports = (app) => {
  // Routes for books with authentication middleware
  app.get('/api/v1/admin/books', bookController.getBooks);
  app.get('/api/v1/admin/books/:id', [authJwt.verifyToken], bookController.getBookById);
  app.post('/api/v1/admin/books', [authJwt.verifyToken], bookImage.array('images', 10), bookController.createBook);
  app.put('/api/v1/admin/books/:id', [authJwt.verifyToken], bookImage.array('images', 10), bookController.updateBook);  
  app.delete('/api/v1/admin/books/:id', [authJwt.verifyToken], bookController.deleteBook);
};