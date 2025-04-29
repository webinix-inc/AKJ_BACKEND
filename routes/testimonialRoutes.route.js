const express = require('express');
const {
  createTestimonial,
  getTestimonials,
  getUserTestimonial,
  deleteTestimonial,
  updateTestimonial,
  getTestimonialByUserId
} = require('../controllers/testimonialController');
const { kpUpload } = require('../middlewares/cloudinaryConfig');
const authJwt = require('../middlewares/authJwt');

const router = express.Router();

module.exports = (app) => {
  app.get('/api/v1/admin/testimonial', getTestimonials);
  app.get('/api/v1/admin/testimonial/me', authJwt.verifyToken, getUserTestimonial);
  app.put('/api/v1/admin/testimonial/:id', [authJwt.verifyToken, kpUpload], updateTestimonial);
  app.delete('/api/v1/admin/testimonial/:id', [authJwt.verifyToken], deleteTestimonial);

  app.get("/api/v1/admin/testimonial/me", getUserTestimonial);

  // Get testimonial by a specific user ID (admin or authorized user only)
  app.get("/api/v1/admin/testimonial/user/:userId", authJwt.verifyToken, getTestimonialByUserId);

  // Create a new testimonial (with image upload)
  app.post("/api/v1/admin/testimonial", [authJwt.verifyToken, kpUpload], createTestimonial);

};