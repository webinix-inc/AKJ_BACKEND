// require("dotenv").config();
// const Razorpay = require("razorpay");

// // Step 1: Initialize Razorpay instance
// console.log("🚀 Initializing Razorpay instance...");
// const razorpay = new Razorpay({
//   key_id: process.env.RAZORPAY_KEY_ID,
//   key_secret: process.env.RAZORPAY_KEY_SECRET,
// });

// if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
//   console.error("❌ Missing Razorpay API credentials. Check your .env file.");
// } else {
//   console.log("✅ Razorpay API credentials loaded successfully.");
// }

// // Step 2: Log Razorpay Key to verify
// console.log("🔑 Razorpay Key ID:", process.env.RAZORPAY_KEY_ID);

// // Controller to create an order
// exports.createOrder = async (req, res) => {
//   console.log("📌 Received request to create an order.");
//   console.log("🛠 Request Body:", req.body);

//   const { amount, currency } = req.body;

//   if (!amount || !currency) {
//     console.error("❌ Missing required fields: amount or currency.");
//     return res.status(400).json({
//       status: 400,
//       message: "Invalid request: Amount and currency are required.",
//     });
//   }

//   try {
//     console.log("📡 Sending request to Razorpay to create order...");

//     const order = await razorpay.orders.create({
//       amount,
//       currency,
//       receipt: `order_rcpt_${Date.now()}`,
//     });

//     if (!order || !order.id) {
//       console.error("❌ Order creation failed. No order ID received.");
//       return res.status(500).json({
//         status: 500,
//         message: "Order creation failed. No valid order ID received.",
//       });
//     }

//     console.log("✅ Order created successfully:", order);

//     return res.status(200).json({
//       status: 200,
//       message: "Order created successfully",
//       data: order,
//     });
//   } catch (error) {
//     console.error("❌ Razorpay Order Error:", error);

//     return res.status(500).json({
//       status: 500,
//       message: "Failed to create Razorpay order",
//       error: error.message,
//     });
//   }
// };

// ========================= paymentController.js =========================
const Razorpay = require("razorpay");
const Order = require("../models/orderModel");
const User = require("../models/userModel");
const Course = require("../models/courseModel");
const Installment = require("../models/installmentModel");
const LiveClass = require("../models/LiveClass");
const { addUsersToClass } = require("../configs/merithub.config");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const generateReceipt = () => `receipt_${Math.floor(Math.random() * 1e6)}`;
const generateUniqueTrackingNumber = () =>
  `TN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

exports.createOrder = async (req, res) => {
  try {
    const {
      amount,
      currency,
      userId,
      courseId,
      planType,
      paymentMode,
      installmentIndex,
      totalInstallments,
    } = req.body;

    if (!userId || !courseId || !paymentMode) {
      return res
        .status(400)
        .json({
          success: false,
          message: "userId, courseId, and paymentMode are required",
        });
    }

    let installmentPlan;
    if (paymentMode === "installment") {
      installmentPlan = await Installment.findOne({ courseId, planType });
      if (!installmentPlan) {
        return res
          .status(404)
          .json({ success: false, message: "Installment plan not found" });
      }

      const existingUserPayment = installmentPlan.userPayments.find(
        (payment) =>
          payment.userId.toString() === userId.toString() &&
          payment.installmentIndex === installmentIndex
      );

      if (!existingUserPayment) {
        installmentPlan.userPayments.push({
          userId,
          installmentIndex,
          isPaid: false,
          paidAmount: amount,
          paymentDate: null,
        });
      } else {
        return res
          .status(400)
          .json({
            success: false,
            message: "Installment already exists for this user",
          });
      }

      await installmentPlan.save();
    }

    const totalAmountInSmallestUnit = Math.round(amount * 100);
    const razorpayOrder = await razorpay.orders.create({
      amount: totalAmountInSmallestUnit,
      currency,
      receipt: generateReceipt(),
    });

    const newOrderData = {
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      receipt: razorpayOrder.receipt,
      status: paymentMode === "installment" ? "partial" : "created",
      trackingNumber: generateUniqueTrackingNumber(),
      userId,
      courseId,
      paymentMode,
      planType,
    };

    if (paymentMode === "installment") {
      newOrderData.installmentDetails = {
        installmentIndex,
        totalInstallments,
        installmentAmount: amount,
        isPaid: false,
      };
    }

    const newOrder = new Order(newOrderData);
    await newOrder.save();

    return res.status(201).json({ success: true, order: newOrder });
  } catch (error) {
    console.error("Error creating order:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error creating order" });
  }
};

exports.verifySignature = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature === razorpay_signature) {
      return res.status(200).json({ success: true });
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Invalid signature" });
    }
  } catch (error) {
    console.error("Error verifying signature:", error);
    return res
      .status(500)
      .json({ success: false, message: "Verification error" });
  }
};
