const express = require('express');
const faqController = require('../controllers/faqController');
const authJwt = require('../middlewares/authJwt');

const router = express.Router();

// Define routes for FAQs
router.post('/api/v1/admin/faqs', [authJwt.verifyToken], faqController.createFaqs); // Create multiple FAQs
router.get('/api/v1/admin/faqs/:courseId' ,faqController.getFaqsByCourse); // Get FAQs by course

module.exports = (app) => {
  app.use(router);
};
