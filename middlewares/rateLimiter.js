const { redisClient } = require('../configs/redis');

// Custom Redis-based rate limiter
class RedisRateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes
    this.max = options.max || 100;
    this.prefix = options.prefix || 'rl:';
    this.message = options.message || 'Too many requests';
    this.standardHeaders = options.standardHeaders !== false;
    this.keyGenerator = options.keyGenerator || ((req) => req.ip);
  }

  async isRateLimited(key) {
    try {
      const redisKey = this.prefix + key;
      const current = await redisClient.incr(redisKey);
      
      if (current === 1) {
        await redisClient.expire(redisKey, Math.ceil(this.windowMs / 1000));
      }
      
      const ttl = await redisClient.ttl(redisKey);
      const resetTime = new Date(Date.now() + ttl * 1000);

      return {
        totalHits: current,
        resetTime,
        isLimited: current > this.max
      };
    } catch (error) {
      console.error('Rate limiter error:', error);
      // On Redis error, allow the request through
      return { totalHits: 0, resetTime: new Date(), isLimited: false };
    }
  }

  middleware() {
    return async (req, res, next) => {
      try {
        const key = this.keyGenerator(req);
        const result = await this.isRateLimited(key);

        if (this.standardHeaders) {
          res.set({
            'X-RateLimit-Limit': this.max,
            'X-RateLimit-Remaining': Math.max(0, this.max - result.totalHits),
            'X-RateLimit-Reset': result.resetTime
          });
        }

        if (result.isLimited) {
          return res.status(429).json({
            success: false,
            message: this.message,
            code: 'RATE_LIMITED',
            retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
          });
        }

        next();
      } catch (error) {
        console.error('Rate limiter middleware error:', error);
        next(); // Continue on error
      }
    };
  }
}

// General API rate limiter
const generalLimiter = new RedisRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  prefix: 'general:',
  message: 'Too many requests from this IP, please try again later.'
}).middleware();

// OTP specific rate limiter (more restrictive)
const otpLimiter = new RedisRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 OTP requests per 15 minutes
  prefix: 'otp:',
  message: 'Too many OTP requests from this IP. Please wait before trying again.',
  keyGenerator: (req) => {
    // Use IP + mobile number for more specific rate limiting
    const mobile = req.body.mobile || '';
    return `${req.ip}:${mobile.replace(/[\s\-\(\)\+]/g, '')}`;
  }
}).middleware();

// Verification rate limiter
const verifyLimiter = new RedisRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 verification attempts per 15 minutes
  prefix: 'verify:',
  message: 'Too many verification attempts from this IP.',
  keyGenerator: (req) => {
    const mobile = req.body.mobile || '';
    return `${req.ip}:${mobile.replace(/[\s\-\(\)\+]/g, '')}`;
  }
}).middleware();

// Login rate limiter
const loginLimiter = new RedisRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit each IP to 15 login attempts per 15 minutes
  prefix: 'login:',
  message: 'Too many login attempts from this IP.',
  keyGenerator: (req) => {
    const identifier = req.body.identifier || '';
    return `${req.ip}:${identifier}`;
  }
}).middleware();

// Registration rate limiter
const registerLimiter = new RedisRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 registration attempts per hour
  prefix: 'register:',
  message: 'Too many registration attempts from this IP.',
}).middleware();

module.exports = {
  generalLimiter,
  otpLimiter,
  verifyLimiter,
  loginLimiter,
  registerLimiter,
  RedisRateLimiter
}; 