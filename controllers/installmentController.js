const Installment = require("../models/installmentModel");
const Order = require("../models/orderModel");
const Razorpay = require("razorpay");
const Course = require("../models/courseModel");
const Subscription = require("../models/subscriptionModel");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Set Installment Plan (Admin)
exports.setCustomInstallments = async (req, res) => {
  try {
    const { courseId, planType, numberOfInstallments, price, discount } =
      req.body;
    console.log("Himanshu -> setCustomInstallments -> req.body:", req.body);
    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    const subscription = await Subscription.findOne({ course: courseId });
    if (!subscription)
      return res.status(404).json({ message: "Subscription not found" });

    const gstPercentage = subscription.gst || 0;
    const internetHandlingPercentage = subscription.internetHandling || 0;
    const discountValue = (price * discount) / 100;

    let totalAmount = price - discountValue;
    const gstAmount = (totalAmount * gstPercentage) / 100;
    const internetHandlingCharge =
      (totalAmount * internetHandlingPercentage) / 100;
    totalAmount += gstAmount + internetHandlingCharge;

    if (numberOfInstallments < 1) {
      return res
        .status(400)
        .json({ message: "Invalid number of installments" });
    }

    const installmentAmount = totalAmount / numberOfInstallments;

    let planDuration;
    switch (planType) {
      case "3 months":
        planDuration = 3;
        break;
      case "6 months":
        planDuration = 6;
        break;
      case "12 months":
        planDuration = 12;
        break;
      default:
        planDuration = parseInt(planType.trim().split(" ")[0]);
    }

    if (numberOfInstallments > planDuration) {
      return res.status(400).json({
        message: `Installments cannot exceed plan duration (${planDuration} months)`,
      });
    }

    const installments = [];
    for (let i = 0; i < numberOfInstallments; i++) {
      installments.push({
        amount: installmentAmount.toFixed(2),
        dueDate: i === 0 ? "DOP" : `DOP + ${i} month${i > 1 ? "s" : ""}`,
        isPaid: false,
      });
    }

    const existingPlan = await Installment.findOne({ courseId, planType });
    if (existingPlan) {
      existingPlan.numberOfInstallments = numberOfInstallments;
      existingPlan.installments = installments;
      existingPlan.totalAmount = totalAmount.toFixed(2);
      existingPlan.remainingAmount = totalAmount.toFixed(2);
      await existingPlan.save();
      return res
        .status(200)
        .json({ message: "Plan updated", data: existingPlan });
    }

    const newInstallmentPlan = new Installment({
      courseId,
      planType,
      numberOfInstallments,
      installments,
      totalAmount: totalAmount.toFixed(2),
      remainingAmount: totalAmount.toFixed(2),
    });

    await newInstallmentPlan.save();
    return res
      .status(201)
      .json({ message: "Installment plan set", data: newInstallmentPlan });
  } catch (error) {
    res.status(500).json({ message: "Error setting installment plan", error });
  }
};

// Get All Plans for a Course
exports.getInstallments = async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    const installments = await Installment.find({ courseId });
    if (!installments.length) {
      return res.status(404).json({ message: "No installment plans found" });
    }

    res
      .status(200)
      .json({ message: "Installment plans retrieved", data: installments });
  } catch (error) {
    res.status(500).json({ message: "Error retrieving plans", error });
  }
};

// Create Razorpay Order for Installment
exports.makeInstallmentPayment = async (req, res) => {
  try {
    const { installmentId } = req.params;
    const { userId, installmentIndex } = req.body;

    const installmentPlan = await Installment.findById(installmentId);
    if (!installmentPlan)
      return res.status(404).json({ message: "Plan not found" });

    if (
      installmentIndex < 0 ||
      installmentIndex >= installmentPlan.installments.length
    ) {
      return res.status(400).json({ message: "Invalid installment index" });
    }

    const installment = installmentPlan.installments[installmentIndex];
    if (installment.isPaid)
      return res.status(400).json({ message: "Already paid" });

    const paymentOptions = {
      amount: installment.amount * 100,
      currency: "INR",
      receipt: `receipt_${Math.floor(Math.random() * 1e6)}`,
    };
    const razorpayOrder = await razorpay.orders.create(paymentOptions);

    if (!installmentPlan.userId) {
      installmentPlan.userId = userId;
      await installmentPlan.save();
    }

    const newOrder = new Order({
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      userId,
      courseId: installmentPlan.courseId,
      installmentPlanId: installmentId,
      installmentIndex,
      status: "created",
      trackingNumber: `TN-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      paymentMode: "installment",
    });

    await newOrder.save();

    res.status(201).json({
      success: true,
      order: razorpayOrder,
      message: "Installment payment order created",
    });
  } catch (error) {
    console.error("Error creating installment payment order:", error);
    res.status(500).json({ message: "Error creating order", error });
  }
};

// Razorpay Webhook Confirmation
exports.confirmInstallmentPayment = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (signature !== generatedSignature) {
      return res.status(400).json({ message: "Invalid webhook signature" });
    }

    const { event, payload } = req.body;
    const paymentEntity = payload?.payment?.entity;

    if (event !== "payment.captured") {
      return res.status(400).json({ message: "Not a payment.captured event" });
    }

    const {
      order_id: orderId,
      amount: paidAmount,
      status: paymentStatus,
    } = paymentEntity;

    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (paymentStatus !== "captured") {
      return res.status(400).json({ message: "Payment status not captured" });
    }

    order.status = "paid";
    await order.save();

    const installmentPlan = await Installment.findById(order.installmentPlanId);
    if (!installmentPlan)
      return res.status(404).json({ message: "Plan not found" });

    if (!installmentPlan.userId) installmentPlan.userId = order.userId;

    const installment = installmentPlan.installments[order.installmentIndex];
    if (!installment)
      return res.status(404).json({ message: "Installment not found" });
    if (installment.isPaid)
      return res.status(400).json({ message: "Installment already paid" });

    installment.isPaid = true;
    installment.paidOn = new Date();
    installmentPlan.remainingAmount -= installment.amount;

    if (installmentPlan.installments.every((i) => i.isPaid)) {
      installmentPlan.status = "completed";
    }

    await installmentPlan.save();
    res.status(200).json({ message: "Installment payment confirmed" });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ message: "Webhook error", error });
  }
};

// Get Balance for a User & Course
exports.getOutstandingBalance = async (req, res) => {
  try {
    const { courseId, userId } = req.params;
    const plan = await Installment.findOne({ courseId, userId });

    if (!plan)
      return res.status(404).json({ message: "Installment plan not found" });

    res.status(200).json({
      message: "Outstanding balance retrieved",
      remainingAmount: plan.remainingAmount,
      installments: plan.installments,
    });
  } catch (error) {
    console.error("Balance error:", error);
    res.status(500).json({ message: "Balance fetch error", error });
  }
};

// Get Timeline of Installment Dates for a User
exports.getUserInstallmentTimeline = async (req, res) => {
  try {
    const { courseId, userId } = req.params;

    const plan = await Installment.findOne({
      courseId,
      "userPayments.userId": userId,
    });

    if (!plan) {
      return res.status(404).json({
        message: "No installment plan found for this course and user",
      });
    }

    let lastDueDate = null;

    const timeline = plan.installments.map((installment, index) => {
      const userPayment = plan.userPayments.find(
        (payment) =>
          payment.userId.toString() === userId &&
          payment.installmentIndex === index
      );

      const paidOn = installment.paidOn || userPayment?.paymentDate || null;

      let dueDate;
      if (index === 0) {
        dueDate = paidOn || new Date();
      } else {
        dueDate = new Date(lastDueDate || new Date());
        dueDate.setMonth(dueDate.getMonth() + 1);
      }

      lastDueDate = new Date(dueDate);

      return {
        planType: plan.planType,
        installmentIndex: index,
        dueDate,
        amount: installment.amount,
        isPaid: installment.isPaid || userPayment?.isPaid || false,
        paidOn,
      };
    });

    res.status(200).json({ message: "Timeline retrieved", timeline });
  } catch (error) {
    console.error("Timeline error:", error);
    res.status(500).json({ message: "Timeline error", error });
  }
};
