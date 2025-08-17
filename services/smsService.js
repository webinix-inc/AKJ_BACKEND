const axios = require('axios');

class SMSService {
  constructor() {
    this.authKey = process.env.MSG91_AUTH_KEY;
    this.senderId = process.env.MSG91_SENDER_ID || 'OTPIND';
    this.templateId = process.env.MSG91_TEMPLATE_ID;
    this.baseUrl = 'https://control.msg91.com/api/v5';
    
    if (!this.authKey) {
      throw new Error('MSG91_AUTH_KEY is required in environment variables');
    }
  }

  /**
   * Send OTP via SMS using MSG91
   * @param {string} mobile - Mobile number with country code
   * @param {string} otp - 6-digit OTP code
   * @param {string} appName - Application name for SMS template
   * @returns {Promise<boolean>} - Success status
   */
  async sendOTP(mobile, otp, appName = 'AKJ Academy') {
    try {
      // Validate mobile number format
      if (!this.isValidMobile(mobile)) {
        throw new Error('Invalid mobile number format');
      }

      const payload = {
        template_id: this.templateId,
        sender: this.senderId,
        short_url: '0',
        mobiles: mobile,
        var1: otp,
        var2: appName,
        var3: '5', // OTP validity in minutes
      };

      const config = {
        method: 'POST',
        url: `${this.baseUrl}/flow/`,
        headers: {
          'authkey': this.authKey,
          'content-type': 'application/JSON',
          'accept': 'application/json'
        },
        data: payload
      };

      console.log(`📱 Sending OTP to ${mobile.substring(0, 8)}****`);
      
      const response = await axios(config);
      
      if (response.data && response.data.type === 'success') {
        console.log(`✅ SMS sent successfully to ${mobile.substring(0, 8)}****`);
        return true;
      } else {
        console.error('❌ MSG91 API Error:', response.data);
        return false;
      }
      
    } catch (error) {
      console.error('❌ SMS Service Error:', {
        message: error.message,
        mobile: mobile?.substring(0, 8) + '****',
        response: error.response?.data
      });
      
      // Don't throw error to prevent exposing internal details
      return false;
    }
  }

  /**
   * Validate mobile number format
   * @param {string} mobile - Mobile number to validate
   * @returns {boolean} - Validation result
   */
  isValidMobile(mobile) {
    // Indian mobile number: +91XXXXXXXXXX or 91XXXXXXXXXX or XXXXXXXXXX
    const mobileRegex = /^(\+91|91)?[6-9]\d{9}$/;
    return mobileRegex.test(mobile);
  }

  /**
   * Format mobile number to include country code
   * @param {string} mobile - Raw mobile number
   * @returns {string} - Formatted mobile number
   */
  formatMobile(mobile) {
    // Remove any spaces, dashes, or special characters
    const cleanMobile = mobile.replace(/[\s\-\(\)]/g, '');
    
    // Add country code if not present
    if (cleanMobile.startsWith('+91')) {
      return cleanMobile;
    } else if (cleanMobile.startsWith('91') && cleanMobile.length === 12) {
      return '+' + cleanMobile;
    } else if (cleanMobile.length === 10) {
      return '+91' + cleanMobile;
    }
    
    return cleanMobile;
  }
}

module.exports = new SMSService(); 