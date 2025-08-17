const express = require('express');
const authController = require('../controllers/authController');
const authJwt = require('../middlewares/authJwt');
const { 
  generalLimiter, 
  otpLimiter, 
  verifyLimiter, 
  loginLimiter, 
  registerLimiter 
} = require('../middlewares/rateLimiter');

const router = express.Router();

module.exports = (app) => {
  // Apply general rate limiting to all auth routes
  app.use('/api/v1/auth', generalLimiter);

  // Health check endpoint
  app.get('/api/v1/auth/health', authController.healthCheck);

  // Registration endpoint with rate limiting
  app.post(
    '/api/v1/auth/register-mobile', 
    registerLimiter, 
    authController.registerWithMobile
  );

  // Send OTP via SMS endpoint with specific rate limiting
  app.post(
    '/api/v1/auth/send-otp-sms', 
    otpLimiter, 
    authController.sendOTPSMS
  );

  // Verify OTP via SMS endpoint with specific rate limiting
  app.post(
    '/api/v1/auth/verify-otp-sms', 
    verifyLimiter, 
    authController.verifyOTPSMS
  );

  // Enhanced login endpoint with rate limiting
  app.post(
    '/api/v1/auth/login-enhanced', 
    loginLimiter, 
    authController.loginEnhanced
  );

  // Get user profile (protected route)
  app.get(
    '/api/v1/auth/profile', 
    [authJwt.verifyToken], 
    authController.getProfile
  );

  // Logout endpoint (protected route)
  app.post(
    '/api/v1/auth/logout', 
    [authJwt.verifyToken], 
    authController.logout
  );

  console.log('✅ Enhanced Auth routes loaded');
}; 