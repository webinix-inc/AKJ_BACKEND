const crypto = require('crypto');

// Middleware to validate Razorpay webhook signature
exports.validateWebhookSignature = (req, res, next) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const razorpaySignature = req.headers['x-razorpay-signature'];
    console.log(razorpaySignature)
    const body = req.body; // Ensure raw body is passed correctly

    // Generate the expected signature using HMAC SHA-256
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(body))
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      console.error('Invalid webhook signature');
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    next(); // Proceed to the controller if signature is valid
  } catch (error) {
    console.error('Error validating webhook signature:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
