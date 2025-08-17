const express = require('express');
const paymentController = require('../controllers/razorpayController'); // Import payment controller
const { validateWebhookSignature } = require('../middlewares/razorpayMiddleware'); // Middleware for signature validation

module.exports = (app) => {
  // Route to create a new Razorpay order (full payment)
  app.post('/api/v1/payments/order', paymentController.createOrder);

  // Route to verify payment signature (called by frontend after payment)
  app.post('/api/v1/payments/verify', paymentController.verifySignature);

  // Webhook route for full payment: Ensure raw body is passed for signature verification
  app.post(
    '/api/v1/payments/webhook',
    express.raw({ type: 'application/json' }),
    validateWebhookSignature,
    paymentController.handleWebhook
  );
};
