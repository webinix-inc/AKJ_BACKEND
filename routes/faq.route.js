const express = require('express');
const faqController = require('../controllers/faqController');
const authJwt = require('../middlewares/authJwt');

module.exports = (app) => {
  // Define routes for FAQs
  app.post('/api/v1/admin/faqs', [authJwt.verifyToken], faqController.createFaqs); // Create multiple FAQs
  app.get('/api/v1/admin/faqs/:courseId', faqController.getFaqsByCourse); // Get FAQs by course (public endpoint)
  
  // Temporary test endpoint to add sample FAQs
  app.post('/api/v1/admin/faqs/test/:courseId', faqController.addTestFaqs); // Add test FAQs (temporary)
};
