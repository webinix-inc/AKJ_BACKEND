const otpService = require('../services/otpService');
const User = require('../models/userModel');
const jwt = require('jsonwebtoken');
const authConfig = require('../configs/auth.config');
const bcrypt = require('bcryptjs');

class AuthController {
  /**
   * Send OTP via SMS (New MSG91 implementation)
   * POST /api/v1/auth/send-otp-sms
   */
  async sendOTPSMS(req, res) {
    try {
      const { mobile, appName } = req.body;

      // Validate request body
      if (!mobile) {
        return res.status(400).json({
          success: false,
          message: 'Mobile number is required',
          code: 'MISSING_MOBILE'
        });
      }

      // Check if user exists with this mobile number
      const user = await User.findOne({
        $and: [{ phone: mobile }, { userType: "USER" }],
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found with this mobile number',
          code: 'USER_NOT_FOUND'
        });
      }

      // Send OTP via SMS
      const result = await otpService.sendOTPViaSMS(mobile, user._id.toString(), appName);

      if (result.success) {
        return res.status(200).json({
          success: true,
          message: result.message,
          data: {
            userId: user._id,
            mobile: result.mobile,
            expiresIn: result.expiresIn
          }
        });
      } else {
        // Handle different error types with appropriate status codes
        let statusCode = 500;
        
        switch (result.code) {
          case 'INVALID_MOBILE':
            statusCode = 400;
            break;
          case 'RATE_LIMITED':
            statusCode = 429;
            break;
          case 'SMS_FAILED':
            statusCode = 503;
            break;
          default:
            statusCode = 500;
        }

        return res.status(statusCode).json({
          success: false,
          message: result.message,
          code: result.code,
          ...(result.remainingTime && { remainingTime: result.remainingTime })
        });
      }

    } catch (error) {
      console.error('Send OTP SMS Controller Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * Verify OTP and generate JWT token (Enhanced version)
   * POST /api/v1/auth/verify-otp-sms
   */
  async verifyOTPSMS(req, res) {
    try {
      const { mobile, otp, userId } = req.body;

      // Validate request body
      if (!mobile || !otp) {
        return res.status(400).json({
          success: false,
          message: 'Mobile number and OTP are required',
          code: 'MISSING_PARAMETERS'
        });
      }

      // Find user
      const user = await User.findOne({
        $and: [{ phone: mobile }, { userType: "USER" }],
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Verify OTP
      const result = await otpService.verifyOTP(mobile, otp, user._id.toString());

      if (result.success) {
        // Update user verification status
        await User.findByIdAndUpdate(
          user._id,
          { accountVerification: true },
          { new: true }
        );

        // Generate JWT token
        const accessToken = jwt.sign(
          { id: user._id, userType: user.userType },
          authConfig.secret,
          { expiresIn: authConfig.accessTokenTime }
        );

        return res.status(200).json({
          success: true,
          message: result.message,
          data: {
            userId: user._id,
            mobile: result.mobile,
            token: accessToken,
            userType: user.userType,
            completeProfile: user.completeProfile,
            accountVerification: true,
            verified: true,
            timestamp: new Date().toISOString()
          }
        });
      } else {
        // Handle different error types with appropriate status codes
        let statusCode = 400;
        
        switch (result.code) {
          case 'OTP_EXPIRED':
            statusCode = 410; // Gone
            break;
          case 'MAX_ATTEMPTS_EXCEEDED':
            statusCode = 429; // Too Many Requests
            break;
          case 'INVALID_OTP':
          case 'INVALID_OTP_FORMAT':
            statusCode = 400; // Bad Request
            break;
          default:
            statusCode = 500;
        }

        return res.status(statusCode).json({
          success: false,
          message: result.message,
          code: result.code,
          ...(result.remainingAttempts !== undefined && { 
            remainingAttempts: result.remainingAttempts 
          })
        });
      }

    } catch (error) {
      console.error('Verify OTP SMS Controller Error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * Enhanced login with both password and OTP support
   * POST /api/v1/auth/login-enhanced
   */
  async loginEnhanced(req, res) {
    try {
      const { identifier, password, otp, loginType } = req.body;

      if (!identifier) {
        return res.status(400).json({
          success: false,
          message: "Email or phone number is required",
          code: 'MISSING_IDENTIFIER'
        });
      }

      if (!password && !otp) {
        return res.status(400).json({
          success: false,
          message: "Either password or OTP is required",
          code: 'MISSING_CREDENTIALS'
        });
      }

      // Find user by email or phone
      const user = await User.findOne({
        $or: [{ email: identifier }, { phone: identifier }],
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
          code: 'USER_NOT_FOUND'
        });
      }

      let isAuthenticated = false;
      let authMethod = '';

      if (otp && loginType === 'otp') {
        // OTP-based login using enhanced OTP service
        const otpResult = await otpService.verifyOTP(identifier, otp, user._id.toString());
        
        if (otpResult.success) {
          isAuthenticated = true;
          authMethod = 'OTP';
          
          // Update user verification status
          await User.findByIdAndUpdate(
            user._id,
            { accountVerification: true },
            { new: true }
          );
        }
      } else if (password && loginType === 'password') {
        // Password-based login
        if (!user.password) {
          return res.status(400).json({
            success: false,
            message: "Password not set for this account. Please use OTP login.",
            code: 'PASSWORD_NOT_SET'
          });
        }
        
        isAuthenticated = await bcrypt.compare(password, user.password);
        authMethod = 'Password';
      }

      if (!isAuthenticated) {
        return res.status(401).json({
          success: false,
          message: otp ? "Invalid OTP" : "Invalid password",
          code: 'INVALID_CREDENTIALS'
        });
      }

      // Generate JWT token
      const accessToken = jwt.sign(
        { id: user._id, userType: user.userType },
        authConfig.secret,
        { expiresIn: authConfig.accessTokenTime }
      );

      // Prepare user response
      const userResponse = {
        userId: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        userType: user.userType,
        token: accessToken,
        completeProfile: user.completeProfile,
        accountVerification: user.accountVerification,
        authMethod: authMethod,
        loginTime: new Date().toISOString()
      };

      return res.status(200).json({
        success: true,
        message: "Logged in successfully",
        data: userResponse
      });

    } catch (error) {
      console.error('Enhanced Login Error:', error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * Register new user with mobile number
   * POST /api/v1/auth/register-mobile
   */
  async registerWithMobile(req, res) {
    try {
      const { firstName, lastName, phone, email, school, className, rollNo } = req.body;

      if (!phone) {
        return res.status(400).json({
          success: false,
          message: "Phone number is required",
          code: 'MISSING_PHONE'
        });
      }

      // Validate phone number format
      const phoneRegex = /^(\+91|91)?[6-9]\d{9}$/;
      if (!phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''))) {
        return res.status(400).json({
          success: false,
          message: "Invalid phone number format",
          code: 'INVALID_PHONE'
        });
      }

      // Check if user already exists
      const existingUser = await User.findOne({
        $and: [{ phone: phone }, { userType: "USER" }],
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "User with this phone number already exists",
          code: 'USER_EXISTS'
        });
      }

      // Create new user
      const newUser = new User({
        firstName,
        lastName,
        phone,
        email,
        school,
        class: className,
        rollNo,
        userType: "USER",
        accountVerification: false,
        completeProfile: false
      });

      await newUser.save();

      return res.status(201).json({
        success: true,
        message: "User registered successfully",
        data: {
          userId: newUser._id,
          phone: newUser.phone,
          message: "You can now login using OTP"
        }
      });

    } catch (error) {
      console.error('Register Mobile Error:', error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * Get user profile (Protected route)
   * GET /api/v1/auth/profile
   */
  async getProfile(req, res) {
    try {
      const user = await User.findById(req.user._id).select('-password -otp');
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
          code: 'USER_NOT_FOUND'
        });
      }

      return res.status(200).json({
        success: true,
        message: "Profile retrieved successfully",
        data: user
      });

    } catch (error) {
      console.error('Get Profile Error:', error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * Health check endpoint
   * GET /api/v1/auth/health
   */
  async healthCheck(req, res) {
    try {
      return res.status(200).json({
        success: true,
        message: 'Enhanced Auth service is running',
        timestamp: new Date().toISOString(),
        service: 'Enhanced OTP Authentication with MSG91',
        features: [
          'SMS OTP via MSG91',
          'JWT Token Generation',
          'Rate Limiting',
          'Attempt Limiting',
          'Backward Compatibility'
        ]
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Service unavailable'
      });
    }
  }

  /**
   * Logout user (Enhanced)
   * POST /api/v1/auth/logout
   */
  async logout(req, res) {
    try {
      // Here you can implement token blacklisting if needed
      // For now, we'll just return success as JWT tokens are stateless
      
      return res.status(200).json({
        success: true,
        message: "Logged out successfully",
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Logout Error:', error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        code: 'INTERNAL_ERROR'
      });
    }
  }
}

module.exports = new AuthController(); 