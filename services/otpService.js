const { redisClient } = require('../configs/redis');
const smsService = require('./smsService');
const crypto = require('crypto');

class OTPService {
  constructor() {
    this.OTP_LENGTH = 6;
    this.OTP_EXPIRY = 300; // 5 minutes in seconds
    this.RATE_LIMIT_WINDOW = 30; // 30 seconds
    this.MAX_ATTEMPTS = 3; // Maximum verification attempts
  }

  /**
   * Generate a 6-digit numeric OTP (improved from existing 4-digit)
   * @returns {string} - 6-digit OTP
   */
  generateOTP() {
    // Use crypto for secure random generation (more secure than Math.random)
    const buffer = crypto.randomBytes(3);
    const otp = parseInt(buffer.toString('hex'), 16) % 1000000;
    return otp.toString().padStart(this.OTP_LENGTH, '0');
  }

  /**
   * Get Redis keys for OTP operations (compatible with existing system)
   * @param {string} mobile - Mobile number
   * @returns {object} - Redis keys
   */
  getRedisKeys(mobile) {
    const normalizedMobile = this.normalizeMobile(mobile);
    return {
      otpKey: `otp:${normalizedMobile}`, // Compatible with existing format
      rateLimitKey: `rate_limit:${normalizedMobile}`,
      attemptsKey: `attempts:${normalizedMobile}`,
      userIdKey: `user_id:${normalizedMobile}` // For user ID mapping
    };
  }

  /**
   * Get Redis keys by user ID (compatible with existing system)
   * @param {string} userId - User ID
   * @returns {object} - Redis keys
   */
  getRedisKeysByUserId(userId) {
    return {
      otpKey: `otp:${userId}`, // Existing format: otp:userId
      rateLimitKey: `rate_limit:user:${userId}`,
      attemptsKey: `attempts:user:${userId}`
    };
  }

  /**
   * Normalize mobile number for consistent storage
   * @param {string} mobile - Mobile number
   * @returns {string} - Normalized mobile number
   */
  normalizeMobile(mobile) {
    return mobile.replace(/[\s\-\(\)\+]/g, '');
  }

  /**
   * Check if mobile number is rate limited
   * @param {string} mobile - Mobile number
   * @returns {Promise<object>} - Rate limit status
   */
  async checkRateLimit(mobile) {
    try {
      const { rateLimitKey } = this.getRedisKeys(mobile);
      const lastSent = await redisClient.get(rateLimitKey);
      
      if (lastSent) {
        const timeElapsed = Date.now() - parseInt(lastSent);
        const remainingTime = Math.ceil((this.RATE_LIMIT_WINDOW * 1000 - timeElapsed) / 1000);
        
        if (remainingTime > 0) {
          return {
            isLimited: true,
            remainingTime,
            message: `Please wait ${remainingTime} seconds before requesting another OTP`
          };
        }
      }
      
      return { isLimited: false };
    } catch (error) {
      console.error('Rate limit check error:', error);
      return { isLimited: false };
    }
  }

  /**
   * Send OTP via SMS (new MSG91 implementation)
   * @param {string} mobile - Mobile number
   * @param {string} userId - User ID (optional, for compatibility)
   * @param {string} appName - Application name
   * @returns {Promise<object>} - Operation result
   */
  async sendOTPViaSMS(mobile, userId = null, appName = 'AKJ Academy') {
    try {
      // Validate mobile number
      const formattedMobile = smsService.formatMobile(mobile);
      if (!smsService.isValidMobile(formattedMobile)) {
        return {
          success: false,
          message: 'Invalid mobile number format',
          code: 'INVALID_MOBILE'
        };
      }

      // Check rate limiting
      const rateLimitCheck = await this.checkRateLimit(formattedMobile);
      if (rateLimitCheck.isLimited) {
        return {
          success: false,
          message: rateLimitCheck.message,
          code: 'RATE_LIMITED',
          remainingTime: rateLimitCheck.remainingTime
        };
      }

      // Generate OTP
      const otp = this.generateOTP();
      const { otpKey, rateLimitKey, attemptsKey, userIdKey } = this.getRedisKeys(formattedMobile);

      // Store OTP in Redis with expiry
      const pipeline = redisClient.multi();
      pipeline.setEx(otpKey, this.OTP_EXPIRY, otp);
      pipeline.setEx(rateLimitKey, this.RATE_LIMIT_WINDOW, Date.now().toString());
      pipeline.setEx(attemptsKey, this.OTP_EXPIRY, '0'); // Reset attempts counter
      
      // Store user ID mapping if provided (for existing system compatibility)
      if (userId) {
        pipeline.setEx(userIdKey, this.OTP_EXPIRY, userId);
        // Also store in the existing format for backward compatibility
        const existingKey = `otp:${userId}`;
        pipeline.setEx(existingKey, this.OTP_EXPIRY, otp);
      }
      
      await pipeline.exec();

      // Send SMS using MSG91
      const smsResult = await smsService.sendOTP(formattedMobile, otp, appName);
      
      if (!smsResult) {
        // Clean up Redis if SMS failed
        await redisClient.del(otpKey);
        if (userId) {
          await redisClient.del(`otp:${userId}`);
        }
        return {
          success: false,
          message: 'Failed to send SMS. Please try again.',
          code: 'SMS_FAILED'
        };
      }

      console.log(`📱 OTP sent via SMS to ${formattedMobile.substring(0, 8)}****`);
      
      return {
        success: true,
        message: 'OTP sent successfully via SMS',
        expiresIn: this.OTP_EXPIRY,
        mobile: formattedMobile.substring(0, 8) + '****' // Masked mobile for response
      };

    } catch (error) {
      console.error('Send OTP SMS error:', error);
      return {
        success: false,
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      };
    }
  }

  /**
   * Send OTP (existing method compatibility - no SMS, for testing)
   * @param {string} mobile - Mobile number
   * @param {string} userId - User ID
   * @returns {Promise<object>} - Operation result
   */
  async sendOTP(mobile, userId) {
    try {
      const formattedMobile = smsService.formatMobile(mobile);
      if (!smsService.isValidMobile(formattedMobile)) {
        return {
          success: false,
          message: 'Invalid mobile number format',
          code: 'INVALID_MOBILE'
        };
      }

      // Check rate limiting
      const rateLimitCheck = await this.checkRateLimit(formattedMobile);
      if (rateLimitCheck.isLimited) {
        return {
          success: false,
          message: rateLimitCheck.message,
          code: 'RATE_LIMITED',
          remainingTime: rateLimitCheck.remainingTime
        };
      }

      // Generate OTP
      const otp = this.generateOTP();
      
      // Store using existing Redis key format for backward compatibility
      const existingKey = `otp:${userId}`;
      await redisClient.setEx(existingKey, this.OTP_EXPIRY, otp);
      
      // Also store using mobile-based key for new system
      const { otpKey, rateLimitKey, attemptsKey } = this.getRedisKeys(formattedMobile);
      const pipeline = redisClient.multi();
      pipeline.setEx(otpKey, this.OTP_EXPIRY, otp);
      pipeline.setEx(rateLimitKey, this.RATE_LIMIT_WINDOW, Date.now().toString());
      pipeline.setEx(attemptsKey, this.OTP_EXPIRY, '0');
      await pipeline.exec();

      console.log(`📱 OTP generated for ${formattedMobile.substring(0, 8)}**** (Testing mode - no SMS)`);
      
      return {
        success: true,
        message: 'OTP generated successfully',
        expiresIn: this.OTP_EXPIRY,
        mobile: formattedMobile.substring(0, 8) + '****',
        // In development, you might want to return OTP for testing
        ...(process.env.NODE_ENV === 'development' && { otp })
      };

    } catch (error) {
      console.error('Send OTP error:', error);
      return {
        success: false,
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      };
    }
  }

  /**
   * Verify OTP (enhanced version with better error handling)
   * @param {string} mobile - Mobile number
   * @param {string} inputOTP - User provided OTP
   * @param {string} userId - User ID (optional, for existing system compatibility)
   * @returns {Promise<object>} - Verification result
   */
  async verifyOTP(mobile, inputOTP, userId = null) {
    try {
      // Validate inputs
      if (!inputOTP || inputOTP.length !== this.OTP_LENGTH) {
        return {
          success: false,
          message: 'Invalid OTP format. Please enter a 6-digit code.',
          code: 'INVALID_OTP_FORMAT'
        };
      }

      const formattedMobile = smsService.formatMobile(mobile);
      let storedOTP = null;
      let otpKey = '';

      // Try both new mobile-based key and existing user ID-based key
      if (userId) {
        // Check existing format first for backward compatibility
        const existingKey = `otp:${userId}`;
        storedOTP = await redisClient.get(existingKey);
        otpKey = existingKey;
      }

      if (!storedOTP) {
        // Try new mobile-based key
        const { otpKey: mobileOtpKey, attemptsKey } = this.getRedisKeys(formattedMobile);
        storedOTP = await redisClient.get(mobileOtpKey);
        otpKey = mobileOtpKey;
      }

      // Check if OTP exists (not expired)
      if (!storedOTP) {
        return {
          success: false,
          message: 'OTP has expired or does not exist. Please request a new OTP.',
          code: 'OTP_EXPIRED'
        };
      }

      // Check verification attempts (for new system)
      const { attemptsKey } = this.getRedisKeys(formattedMobile);
      const attempts = parseInt(await redisClient.get(attemptsKey) || '0');
      
      if (attempts >= this.MAX_ATTEMPTS) {
        // Clean up OTP after max attempts
        await redisClient.del(otpKey);
        await redisClient.del(attemptsKey);
        
        return {
          success: false,
          message: 'Maximum verification attempts exceeded. Please request a new OTP.',
          code: 'MAX_ATTEMPTS_EXCEEDED'
        };
      }

      // Verify OTP
      if (storedOTP === inputOTP.toString()) {
        // Success - Clean up Redis
        await redisClient.del(otpKey);
        await redisClient.del(attemptsKey);
        
        console.log(`✅ OTP verified successfully for ${formattedMobile.substring(0, 8)}****`);
        
        return {
          success: true,
          message: 'OTP verified successfully',
          mobile: formattedMobile,
          userId: userId
        };
      } else {
        // Increment attempts for new system
        await redisClient.incr(attemptsKey);
        const remainingAttempts = this.MAX_ATTEMPTS - attempts - 1;
        
        return {
          success: false,
          message: `Invalid OTP. You have ${remainingAttempts} attempts remaining.`,
          code: 'INVALID_OTP',
          remainingAttempts
        };
      }

    } catch (error) {
      console.error('Verify OTP error:', error);
      return {
        success: false,
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      };
    }
  }

  /**
   * Clean up expired OTPs (can be called by cron job)
   * @returns {Promise<number>} - Number of cleaned entries
   */
  async cleanupExpiredOTPs() {
    try {
      const patterns = ['otp:*', 'rate_limit:*', 'attempts:*'];
      let cleanedCount = 0;

      for (const pattern of patterns) {
        // Note: Using KEYS in production should be avoided for large datasets
        // Consider using SCAN for production environments
        const keys = await redisClient.keys(pattern);
        
        for (const key of keys) {
          const ttl = await redisClient.ttl(key);
          if (ttl === -1) { // Key exists but has no TTL
            await redisClient.del(key);
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} expired OTP entries`);
      }

      return cleanedCount;
    } catch (error) {
      console.error('Cleanup error:', error);
      return 0;
    }
  }
}

module.exports = new OTPService(); 