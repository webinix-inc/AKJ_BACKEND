const express = require('express');
const faqController = require('../controllers/faqController');
const authJwt = require('../middlewares/authJwt');

module.exports = (app) => {
  // Define routes for FAQs
  app.post('/api/v1/admin/faqs', [authJwt.verifyToken], faqController.createFaqs); // Create single or multiple FAQs (unified)
  app.get('/api/v1/admin/faqs/:courseId', faqController.getFaqsByCourse); // Get FAQs by course (public endpoint)
  app.put('/api/v1/admin/faqs/:faqId', [authJwt.verifyToken], faqController.updateFaq); // Update single FAQ
  app.delete('/api/v1/admin/faqs/:faqId', [authJwt.verifyToken], faqController.deleteFaq); // Delete single FAQ
};
