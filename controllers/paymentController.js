require("dotenv").config();
const Razorpay = require("razorpay");

// Step 1: Initialize Razorpay instance
console.log("🚀 Initializing Razorpay instance...");
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error("❌ Missing Razorpay API credentials. Check your .env file.");
} else {
  console.log("✅ Razorpay API credentials loaded successfully.");
}

// Step 2: Log Razorpay Key to verify
console.log("🔑 Razorpay Key ID:", process.env.RAZORPAY_KEY_ID);

// Controller to create an order
exports.createOrder = async (req, res) => {
  console.log("📌 Received request to create an order.");
  console.log("🛠 Request Body:", req.body);

  const { amount, currency } = req.body;

  if (!amount || !currency) {
    console.error("❌ Missing required fields: amount or currency.");
    return res.status(400).json({
      status: 400,
      message: "Invalid request: Amount and currency are required.",
    });
  }

  try {
    console.log("📡 Sending request to Razorpay to create order...");

    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt: `order_rcpt_${Date.now()}`,
    });

    if (!order || !order.id) {
      console.error("❌ Order creation failed. No order ID received.");
      return res.status(500).json({
        status: 500,
        message: "Order creation failed. No valid order ID received.",
      });
    }

    console.log("✅ Order created successfully:", order);

    return res.status(200).json({
      status: 200,
      message: "Order created successfully",
      data: order,
    });
  } catch (error) {
    console.error("❌ Razorpay Order Error:", error);

    return res.status(500).json({
      status: 500,
      message: "Failed to create Razorpay order",
      error: error.message,
    });
  }
};
