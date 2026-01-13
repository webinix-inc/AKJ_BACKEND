const rateLimit = require("express-rate-limit");

// Rate limiter for chat messages - 30 messages per minute per user
const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute
  message: {
    error: "Too many messages sent. Please wait a moment before sending more.",
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use user ID for rate limiting (from JWT)
    return req.user?._id?.toString() || req.ip;
  },
  skip: (req) => {
    // Skip rate limiting for admin users
    return req.user?.userType === "ADMIN";
  }
});

// Rate limiter for fetching users/messages - 60 requests per minute
const chatFetchRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: {
    error: "Too many requests. Please slow down.",
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?._id?.toString() || req.ip
});

module.exports = {
  chatRateLimiter,
  chatFetchRateLimiter
};