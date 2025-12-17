// ========================= paymentController.js =========================
const Razorpay = require("razorpay");
const Order = require("../models/orderModel");
const User = require("../models/userModel");
const Course = require("../models/courseModel");
const Installment = require("../models/installmentModel");
const LiveClass = require("../models/LiveClass");
const { addUsersToClass } = require("../configs/merithub.config");
const crypto = require("crypto");
const { logger } = require("../utils/logger");

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
      installmentPlanId, // 🔥 NEW: Selected plan ID
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
      // 🔥 CRITICAL: Use installmentPlanId if provided, otherwise fallback to planType
      if (installmentPlanId) {
        installmentPlan = await Installment.findById(installmentPlanId);
        if (!installmentPlan || installmentPlan.courseId.toString() !== courseId.toString()) {
          return res
            .status(404)
            .json({ success: false, message: "Installment plan not found or doesn't match course" });
        }
        console.log(`✅ [createOrder] Using selected plan ID: ${installmentPlanId} (${installmentPlan.planType})`);
      } else {
        installmentPlan = await Installment.findOne({ courseId, planType });
        if (!installmentPlan) {
          return res
            .status(404)
            .json({ success: false, message: "Installment plan not found" });
        }
        console.log(`⚠️ [createOrder] Using planType fallback: ${planType}`);
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
      installmentPlanId: installmentPlan?._id, // 🔥 NEW: Store selected plan ID
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

    // 🚀 LOG PAYMENT ORDER CREATION SUCCESS
    logger.userActivity(
      userId,
      'Payment Order',
      'PAYMENT_ORDER_CREATED',
      `Amount: ₹${amount}, Course: ${courseId}, Mode: ${paymentMode}, Plan: ${planType || 'N/A'}, OrderID: ${newOrder.orderId}, TrackingID: ${newOrder.trackingNumber}, IP: ${req.ip}`
    );

    return res.status(201).json({ success: true, order: newOrder });
  } catch (error) {
    // 🚀 LOG PAYMENT ORDER CREATION ERROR
    logger.error(error, 'PAYMENT_ORDER_CREATE', `UserID: ${userId}, Amount: ${amount}, Course: ${courseId}, Mode: ${paymentMode}`);
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
