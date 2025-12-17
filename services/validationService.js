// ============================================================================
// ✅ VALIDATION BUSINESS LOGIC SERVICE
// ============================================================================
// 
// This service handles all validation-related business logic that was
// previously duplicated across ALL controllers. It provides centralized
// validation functions and error handling patterns.
//
// Controllers affected: ALL (25+ controllers)
//
// Functions consolidated:
// - Input validation with comprehensive rules
// - MongoDB ObjectId format validation
// - Email/Phone/Password format validation
// - File upload validation (type, size, security)
// - Business rule validation (pricing, dates, etc.)
// - Error response standardization
// - Validation middleware creation
//
// ============================================================================

const mongoose = require("mongoose");

// ============================================================================
// 🔧 BASIC VALIDATION UTILITIES
// ============================================================================

// Validate required fields
const validateRequiredFields = (data, requiredFields) => {
  const errors = [];
  const missingFields = {};

  for (const field of requiredFields) {
    if (!data[field] || data[field] === "" || data[field] === null || data[field] === undefined) {
      errors.push(`${field} is required`);
      missingFields[field] = true;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    missingFields
  };
};

// Validate data types
const validateDataTypes = (data, typeRules) => {
  const errors = [];

  for (const [field, expectedType] of Object.entries(typeRules)) {
    if (data[field] !== undefined && data[field] !== null) {
      const actualType = typeof data[field];
      
      if (expectedType === 'array' && !Array.isArray(data[field])) {
        errors.push(`${field} must be an array`);
      } else if (expectedType === 'number' && (actualType !== 'number' || isNaN(data[field]))) {
        errors.push(`${field} must be a valid number`);
      } else if (expectedType === 'string' && actualType !== 'string') {
        errors.push(`${field} must be a string`);
      } else if (expectedType === 'boolean' && actualType !== 'boolean') {
        errors.push(`${field} must be a boolean`);
      } else if (expectedType === 'date') {
        const date = new Date(data[field]);
        if (isNaN(date.getTime())) {
          errors.push(`${field} must be a valid date`);
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// ============================================================================
// 🆔 MONGODB OBJECTID VALIDATION
// ============================================================================

// Validate single ObjectId
const validateObjectId = (id, fieldName = "ID") => {
  if (!id) {
    return {
      isValid: false,
      error: `${fieldName} is required`
    };
  }

  if (typeof id !== 'string') {
    return {
      isValid: false,
      error: `${fieldName} must be a string`
    };
  }

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return {
      isValid: false,
      error: `Invalid ${fieldName} format`
    };
  }

  return {
    isValid: true,
    error: null
  };
};

// Validate multiple ObjectIds
const validateObjectIds = (ids, fieldName = "IDs") => {
  const errors = [];

  if (!ids || !Array.isArray(ids)) {
    return {
      isValid: false,
      errors: [`${fieldName} must be an array`]
    };
  }

  if (ids.length === 0) {
    return {
      isValid: false,
      errors: [`${fieldName} array cannot be empty`]
    };
  }

  ids.forEach((id, index) => {
    const validation = validateObjectId(id, `${fieldName}[${index}]`);
    if (!validation.isValid) {
      errors.push(validation.error);
    }
  });

  return {
    isValid: errors.length === 0,
    errors
  };
};

// ============================================================================
// 📧 EMAIL VALIDATION
// ============================================================================

const validateEmailFormat = (email, fieldName = "Email") => {
  if (!email) {
    return {
      isValid: false,
      error: `${fieldName} is required`
    };
  }

  if (typeof email !== 'string') {
    return {
      isValid: false,
      error: `${fieldName} must be a string`
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return {
      isValid: false,
      error: `Invalid ${fieldName.toLowerCase()} format`
    };
  }

  // Additional email validation rules
  if (email.length > 254) {
    return {
      isValid: false,
      error: `${fieldName} is too long (max 254 characters)`
    };
  }

  return {
    isValid: true,
    error: null
  };
};

// ============================================================================
// 📱 PHONE NUMBER VALIDATION
// ============================================================================

const validatePhoneNumber = (phone, fieldName = "Phone number") => {
  if (!phone) {
    return {
      isValid: false,
      error: `${fieldName} is required`
    };
  }

  if (typeof phone !== 'string') {
    return {
      isValid: false,
      error: `${fieldName} must be a string`
    };
  }

  // Remove spaces and special characters for validation
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');

  // Indian phone number validation (10 digits)
  const phoneRegex = /^[6-9]\d{9}$/;
  if (!phoneRegex.test(cleanPhone)) {
    return {
      isValid: false,
      error: `Invalid ${fieldName.toLowerCase()} format. Must be 10 digits starting with 6-9`
    };
  }

  return {
    isValid: true,
    error: null,
    cleanPhone
  };
};

// ============================================================================
// 🔐 PASSWORD VALIDATION
// ============================================================================

const validatePasswordStrength = (password, fieldName = "Password") => {
  if (!password) {
    return {
      isValid: false,
      error: `${fieldName} is required`
    };
  }

  if (typeof password !== 'string') {
    return {
      isValid: false,
      error: `${fieldName} must be a string`
    };
  }

  const errors = [];

  // Minimum length
  if (password.length < 8) {
    errors.push(`${fieldName} must be at least 8 characters long`);
  }

  // Maximum length
  if (password.length > 128) {
    errors.push(`${fieldName} is too long (max 128 characters)`);
  }

  // At least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    errors.push(`${fieldName} must contain at least one uppercase letter`);
  }

  // At least one lowercase letter
  if (!/[a-z]/.test(password)) {
    errors.push(`${fieldName} must contain at least one lowercase letter`);
  }

  // At least one digit
  if (!/\d/.test(password)) {
    errors.push(`${fieldName} must contain at least one number`);
  }

  // At least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push(`${fieldName} must contain at least one special character`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

const validatePasswordMatch = (password, confirmPassword) => {
  if (password !== confirmPassword) {
    return {
      isValid: false,
      error: "Password and confirm password do not match"
    };
  }

  return {
    isValid: true,
    error: null
  };
};

// ============================================================================
// 📁 FILE UPLOAD VALIDATION
// ============================================================================

const validateFileUpload = (file, options = {}) => {
  const {
    maxSize = 5 * 1024 * 1024, // 5MB default
    allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'],
    allowedExtensions = ['.jpg', '.jpeg', '.png'],
    fieldName = "File"
  } = options;

  if (!file) {
    return {
      isValid: false,
      error: `${fieldName} is required`
    };
  }

  // Check file size
  if (file.size > maxSize) {
    return {
      isValid: false,
      error: `${fieldName} size exceeds limit of ${Math.round(maxSize / (1024 * 1024))}MB`
    };
  }

  // Check MIME type
  if (allowedTypes.length > 0 && !allowedTypes.includes(file.mimetype)) {
    return {
      isValid: false,
      error: `Invalid ${fieldName.toLowerCase()} type. Allowed types: ${allowedTypes.join(', ')}`
    };
  }

  // Check file extension
  if (allowedExtensions.length > 0) {
    const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    if (!allowedExtensions.includes(fileExtension)) {
      return {
        isValid: false,
        error: `Invalid ${fieldName.toLowerCase()} extension. Allowed extensions: ${allowedExtensions.join(', ')}`
      };
    }
  }

  // Check for potential security issues
  const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.vbs', '.js', '.jar'];
  const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
  if (dangerousExtensions.includes(fileExtension)) {
    return {
      isValid: false,
      error: `${fieldName} type is not allowed for security reasons`
    };
  }

  return {
    isValid: true,
    error: null
  };
};

const validateMultipleFiles = (files, options = {}) => {
  const {
    maxFiles = 10,
    fieldName = "Files"
  } = options;

  if (!files || !Array.isArray(files)) {
    return {
      isValid: false,
      errors: [`${fieldName} must be an array`]
    };
  }

  if (files.length === 0) {
    return {
      isValid: false,
      errors: [`At least one ${fieldName.toLowerCase()} is required`]
    };
  }

  if (files.length > maxFiles) {
    return {
      isValid: false,
      errors: [`Too many ${fieldName.toLowerCase()}. Maximum allowed: ${maxFiles}`]
    };
  }

  const errors = [];
  files.forEach((file, index) => {
    const validation = validateFileUpload(file, { ...options, fieldName: `${fieldName}[${index}]` });
    if (!validation.isValid) {
      errors.push(validation.error);
    }
  });

  return {
    isValid: errors.length === 0,
    errors
  };
};

// ============================================================================
// 💰 BUSINESS RULE VALIDATION
// ============================================================================

// Validate price/amount
const validatePrice = (price, fieldName = "Price") => {
  if (price === undefined || price === null) {
    return {
      isValid: false,
      error: `${fieldName} is required`
    };
  }

  if (typeof price !== 'number' || isNaN(price)) {
    return {
      isValid: false,
      error: `${fieldName} must be a valid number`
    };
  }

  if (price < 0) {
    return {
      isValid: false,
      error: `${fieldName} cannot be negative`
    };
  }

  if (price > 1000000) {
    return {
      isValid: false,
      error: `${fieldName} is too high (max ₹10,00,000)`
    };
  }

  // Check for reasonable decimal places (max 2)
  if (price % 1 !== 0 && price.toString().split('.')[1]?.length > 2) {
    return {
      isValid: false,
      error: `${fieldName} can have at most 2 decimal places`
    };
  }

  return {
    isValid: true,
    error: null
  };
};

// Validate percentage
const validatePercentage = (percentage, fieldName = "Percentage") => {
  if (percentage === undefined || percentage === null) {
    return {
      isValid: false,
      error: `${fieldName} is required`
    };
  }

  if (typeof percentage !== 'number' || isNaN(percentage)) {
    return {
      isValid: false,
      error: `${fieldName} must be a valid number`
    };
  }

  if (percentage < 0 || percentage > 100) {
    return {
      isValid: false,
      error: `${fieldName} must be between 0 and 100`
    };
  }

  return {
    isValid: true,
    error: null
  };
};

// Validate date range
const validateDateRange = (startDate, endDate, fieldNames = ["Start date", "End date"]) => {
  const errors = [];

  if (!startDate) {
    errors.push(`${fieldNames[0]} is required`);
  }

  if (!endDate) {
    errors.push(`${fieldNames[1]} is required`);
  }

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime())) {
      errors.push(`Invalid ${fieldNames[0].toLowerCase()} format`);
    }

    if (isNaN(end.getTime())) {
      errors.push(`Invalid ${fieldNames[1].toLowerCase()} format`);
    }

    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start >= end) {
      errors.push(`${fieldNames[0]} must be before ${fieldNames[1].toLowerCase()}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// ============================================================================
// 📝 COURSE/CONTENT SPECIFIC VALIDATION
// ============================================================================

// Validate quiz duration
const validateQuizDuration = (duration, fieldName = "Duration") => {
  if (!duration) {
    return {
      isValid: false,
      error: `${fieldName} is required`
    };
  }

  if (typeof duration !== 'number' || isNaN(duration)) {
    return {
      isValid: false,
      error: `${fieldName} must be a valid number`
    };
  }

  if (duration < 1) {
    return {
      isValid: false,
      error: `${fieldName} must be at least 1 minute`
    };
  }

  if (duration > 480) { // 8 hours
    return {
      isValid: false,
      error: `${fieldName} cannot exceed 8 hours (480 minutes)`
    };
  }

  return {
    isValid: true,
    error: null
  };
};

// Validate installment plan
const validateInstallmentPlan = (planData) => {
  const { planType, numberOfInstallments, price } = planData;
  const errors = [];

  // Validate plan type - accept any string value
  if (!planType || typeof planType !== 'string') {
    errors.push("Plan type must be a string");
  }

  // Validate number of installments
  if (!numberOfInstallments || !Number.isInteger(numberOfInstallments) || numberOfInstallments < 1) {
    errors.push("Number of installments must be a positive integer");
  }

  // Validate price
  const priceValidation = validatePrice(price, "Plan price");
  if (!priceValidation.isValid) {
    errors.push(priceValidation.error);
  }

  // Validate installments against plan duration (extract months dynamically)
  if (planType && numberOfInstallments) {
    // Extract number of months from planType (e.g., "18 months" -> 18)
    const monthsMatch = planType.match(/(\d+)\s*months?/i);
    if (monthsMatch) {
      const maxMonths = parseInt(monthsMatch[1], 10);
      if (numberOfInstallments > maxMonths) {
        errors.push(`Maximum ${maxMonths} installments allowed for ${planType} plan`);
      }
    }
  }

  // Validate minimum installment amount
  if (price && numberOfInstallments) {
    const minInstallmentAmount = 50;
    if (price / numberOfInstallments < minInstallmentAmount) {
      errors.push(`Minimum installment amount is ₹${minInstallmentAmount}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// ============================================================================
// 🔄 ERROR RESPONSE FORMATTING
// ============================================================================

const formatErrorResponse = (errors, statusCode = 400) => {
  let message = "Validation failed";
  
  if (Array.isArray(errors)) {
    if (errors.length === 1) {
      message = errors[0];
    } else {
      message = "Multiple validation errors occurred";
    }
  } else if (typeof errors === 'string') {
    message = errors;
  }

  return {
    status: statusCode,
    success: false,
    message,
    errors: Array.isArray(errors) ? errors : [errors],
    timestamp: new Date().toISOString()
  };
};

const formatSuccessResponse = (data, message = "Success") => {
  return {
    status: 200,
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  };
};

// ============================================================================
// 🛡️ VALIDATION MIDDLEWARE CREATION
// ============================================================================

const createValidationMiddleware = (validationRules) => {
  return (req, res, next) => {
    const errors = [];

    // Apply validation rules
    for (const [field, rules] of Object.entries(validationRules)) {
      const value = req.body[field];

      if (rules.required && (!value && value !== 0 && value !== false)) {
        errors.push(`${field} is required`);
        continue;
      }

      if (value !== undefined && value !== null && value !== '') {
        // Type validation
        if (rules.type) {
          const typeValidation = validateDataTypes({ [field]: value }, { [field]: rules.type });
          if (!typeValidation.isValid) {
            errors.push(...typeValidation.errors);
          }
        }

        // Custom validation function
        if (rules.validate && typeof rules.validate === 'function') {
          const customValidation = rules.validate(value);
          if (!customValidation.isValid) {
            errors.push(customValidation.error);
          }
        }

        // Length validation for strings
        if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
          errors.push(`${field} must be at least ${rules.minLength} characters long`);
        }

        if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
          errors.push(`${field} must not exceed ${rules.maxLength} characters`);
        }

        // Range validation for numbers
        if (rules.min && typeof value === 'number' && value < rules.min) {
          errors.push(`${field} must be at least ${rules.min}`);
        }

        if (rules.max && typeof value === 'number' && value > rules.max) {
          errors.push(`${field} must not exceed ${rules.max}`);
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json(formatErrorResponse(errors));
    }

    next();
  };
};

// ============================================================================
// 📤 EXPORTS
// ============================================================================
module.exports = {
  // Basic validation
  validateRequiredFields,
  validateDataTypes,
  
  // ObjectId validation
  validateObjectId,
  validateObjectIds,
  
  // Format validation
  validateEmailFormat,
  validatePhoneNumber,
  validatePasswordStrength,
  validatePasswordMatch,
  
  // File validation
  validateFileUpload,
  validateMultipleFiles,
  
  // Business rule validation
  validatePrice,
  validatePercentage,
  validateDateRange,
  validateQuizDuration,
  validateInstallmentPlan,
  
  // Response formatting
  formatErrorResponse,
  formatSuccessResponse,
  
  // Middleware creation
  createValidationMiddleware,
};
