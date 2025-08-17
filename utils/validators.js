/**
 * Validate mobile number format
 * @param {string} mobile - Mobile number to validate
 * @returns {object} - Validation result
 */
function validateMobile(mobile) {
  if (!mobile || typeof mobile !== 'string') {
    return {
      isValid: false,
      message: 'Mobile number must be a valid string'
    };
  }

  // Remove spaces, dashes, brackets
  const cleanMobile = mobile.replace(/[\s\-\(\)]/g, '');
  
  // Indian mobile number patterns
  const patterns = [
    /^\+91[6-9]\d{9}$/, // +91XXXXXXXXXX
    /^91[6-9]\d{9}$/,   // 91XXXXXXXXXX
    /^[6-9]\d{9}$/      // XXXXXXXXXX
  ];

  const isValid = patterns.some(pattern => pattern.test(cleanMobile));
  
  if (!isValid) {
    return {
      isValid: false,
      message: 'Invalid mobile number format. Please enter a valid Indian mobile number.'
    };
  }

  // Check for length
  if (cleanMobile.length < 10 || cleanMobile.length > 13) {
    return {
      isValid: false,
      message: 'Mobile number length is invalid'
    };
  }

  return {
    isValid: true,
    message: 'Valid mobile number',
    formatted: formatMobile(cleanMobile)
  };
}

/**
 * Validate OTP format
 * @param {string} otp - OTP to validate
 * @returns {object} - Validation result
 */
function validateOTP(otp) {
  if (!otp) {
    return {
      isValid: false,
      message: 'OTP is required'
    };
  }

  // Convert to string and check
  const otpString = otp.toString().trim();
  
  if (!/^\d{6}$/.test(otpString)) {
    return {
      isValid: false,
      message: 'OTP must be a 6-digit number'
    };
  }

  return {
    isValid: true,
    message: 'Valid OTP format'
  };
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {object} - Validation result
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return {
      isValid: false,
      message: 'Email must be a valid string'
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(email)) {
    return {
      isValid: false,
      message: 'Invalid email format'
    };
  }

  return {
    isValid: true,
    message: 'Valid email format'
  };
}

/**
 * Format mobile number with country code
 * @param {string} mobile - Mobile number to format
 * @returns {string} - Formatted mobile number
 */
function formatMobile(mobile) {
  const cleanMobile = mobile.replace(/[\s\-\(\)\+]/g, '');
  
  if (cleanMobile.startsWith('91') && cleanMobile.length === 12) {
    return '+' + cleanMobile;
  } else if (cleanMobile.length === 10) {
    return '+91' + cleanMobile;
  }
  
  return '+' + cleanMobile;
}

/**
 * Sanitize mobile number for logging
 * @param {string} mobile - Mobile number to sanitize
 * @returns {string} - Sanitized mobile number
 */
function sanitizeMobile(mobile) {
  if (!mobile || mobile.length < 8) {
    return '****';
  }
  return mobile.substring(0, 8) + '****';
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {object} - Validation result
 */
function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return {
      isValid: false,
      message: 'Password is required'
    };
  }

  if (password.length < 8) {
    return {
      isValid: false,
      message: 'Password must be at least 8 characters long'
    };
  }

  // Check for at least one uppercase, one lowercase, one number
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);

  if (!hasUppercase || !hasLowercase || !hasNumber) {
    return {
      isValid: false,
      message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    };
  }

  return {
    isValid: true,
    message: 'Valid password'
  };
}

/**
 * Validate user input for registration
 * @param {object} userData - User data to validate
 * @returns {object} - Validation result
 */
function validateRegistrationData(userData) {
  const errors = [];

  // Validate required fields
  if (!userData.firstName || userData.firstName.trim().length < 2) {
    errors.push('First name must be at least 2 characters long');
  }

  if (!userData.lastName || userData.lastName.trim().length < 2) {
    errors.push('Last name must be at least 2 characters long');
  }

  if (!userData.phone) {
    errors.push('Phone number is required');
  } else {
    const mobileValidation = validateMobile(userData.phone);
    if (!mobileValidation.isValid) {
      errors.push(mobileValidation.message);
    }
  }

  // Validate email if provided
  if (userData.email) {
    const emailValidation = validateEmail(userData.email);
    if (!emailValidation.isValid) {
      errors.push(emailValidation.message);
    }
  }

  // Validate password if provided
  if (userData.password) {
    const passwordValidation = validatePassword(userData.password);
    if (!passwordValidation.isValid) {
      errors.push(passwordValidation.message);
    }
  }

  return {
    isValid: errors.length === 0,
    message: errors.length === 0 ? 'Valid registration data' : 'Validation failed',
    errors: errors
  };
}

module.exports = {
  validateMobile,
  validateOTP,
  validateEmail,
  validatePassword,
  validateRegistrationData,
  formatMobile,
  sanitizeMobile
}; 