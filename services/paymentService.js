// ============================================================================
// 💳 PAYMENT BUSINESS LOGIC SERVICE
// ============================================================================
// 
// This service handles all payment-related business logic that was
// previously duplicated across multiple controllers. It maintains the same
// core logic and algorithms while providing better separation of concerns.
//
// Controllers affected:
// - adminController.js (Admin payment management)
// - razorpayController.js (Core payment processing)
// - installmentController.js (Installment payments)
// - userController.js (User order creation)
//
// Functions consolidated:
// - Razorpay order creation and management
// - Payment signature verification
// - Installment payment processing
// - Course enrollment after payment
// - Order tracking and management
// - GST and handling charge calculations
//
// ============================================================================

const Razorpay = require("razorpay");
const crypto = require("crypto");
const Order = require("../models/orderModel");
const User = require("../models/userModel");
const Course = require("../models/courseModel");
const Installment = require("../models/installmentModel");
const LiveClass = require("../models/LiveClass");
const { addUsersToClass } = require("../configs/merithub.config");

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ============================================================================
// 🔧 UTILITY FUNCTIONS
// ============================================================================
const generateReceipt = () => `receipt_${Math.floor(Math.random() * 1e6)}`;

const generateUniqueTrackingNumber = () =>
  `TN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const generateOrderId = () => `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

// ============================================================================
// 💰 RAZORPAY ORDER CREATION BUSINESS LOGIC
// ============================================================================
const createRazorpayOrderLogic = async (orderData) => {
  try {
    const {
      amount,
      currency = "INR",
      receipt,
      userId,
      courseId,
      planType,
      paymentMode,
      installmentIndex,
      totalInstallments,
      notes = {}
    } = orderData;

    console.log("💳 Creating Razorpay order with payment service");

    // Validate required fields
    if (!userId || !courseId || !paymentMode) {
      throw new Error("userId, courseId, and paymentMode are required");
    }

    // Handle installment-specific logic
    if (paymentMode === "installment") {
      const installmentPlan = await Installment.findOne({ courseId, planType });
      if (!installmentPlan) {
        throw new Error("Installment plan not found");
      }

      // Check if installment already exists
      const exists = installmentPlan.userPayments.some(
        (p) =>
          p.userId.toString() === userId &&
          p.installmentIndex === installmentIndex
      );
      
      if (exists) {
        throw new Error("Installment already exists for this user");
      }

      // Add installment to plan
      installmentPlan.userPayments.push({
        userId,
        installmentIndex,
        isPaid: false,
        paidAmount: amount,
        paymentDate: null,
      });
      await installmentPlan.save();
    }

    // Create Razorpay order
    const razorpayOrderData = {
      amount: Math.round(amount * 100), // Convert to paise
      currency,
      receipt: receipt || generateReceipt(),
      notes: {
        userId,
        courseId,
        paymentMode,
        planType,
        ...notes
      }
    };

    const razorpayOrder = await razorpay.orders.create(razorpayOrderData);

    // Create internal order record
    const internalOrderData = {
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

    // Add installment details if applicable
    if (paymentMode === "installment") {
      internalOrderData.installmentDetails = {
        installmentIndex,
        totalInstallments,
        installmentAmount: amount,
        isPaid: false,
      };
    }

    const newOrder = new Order(internalOrderData);
    await newOrder.save();

    console.log("✅ Razorpay order created successfully");
    return {
      razorpayOrder,
      internalOrder: newOrder,
      trackingNumber: internalOrderData.trackingNumber
    };
  } catch (error) {
    console.error("❌ Error in createRazorpayOrderLogic:", error);
    throw error;
  }
};

// ============================================================================
// 🔐 PAYMENT SIGNATURE VERIFICATION BUSINESS LOGIC
// ============================================================================
const verifyPaymentSignatureLogic = async (signatureData) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = signatureData;

    console.log("💳 Verifying payment signature with payment service");

    // Generate signature for verification
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      throw new Error("Invalid payment signature");
    }

    // Find and update the order
    const order = await Order.findOneAndUpdate(
      { orderId: razorpay_order_id },
      {
        status: "paid",
        paymentId: razorpay_payment_id,
        paidAt: new Date()
      },
      { new: true }
    );

    if (!order) {
      throw new Error(`Order not found for ID: ${razorpay_order_id}`);
    }

    // Process course enrollment
    const mockPaymentDetails = {
      id: razorpay_payment_id,
      amount: order.amount,
      order_id: razorpay_order_id,
      status: "captured"
    };

    await addCourseToUserLogic(
      order.userId,
      order.courseId,
      order.paymentMode,
      order.installmentDetails,
      mockPaymentDetails
    );

    console.log("✅ Payment signature verified and course enrolled");
    return {
      verified: true,
      order,
      message: "Payment verified and course enrolled"
    };
  } catch (error) {
    console.error("❌ Error in verifyPaymentSignatureLogic:", error);
    throw error;
  }
};

// ============================================================================
// 🎓 COURSE ENROLLMENT BUSINESS LOGIC
// ============================================================================
const addCourseToUserLogic = async (userId, courseId, paymentMode, installmentDetails, paymentDetails) => {
  try {
    console.log("💳 Processing course enrollment with payment service");

    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const amountPaid = paymentDetails.amount / 100; // Convert from paise
    const alreadyEnrolled = user.purchasedCourses.some(
      (c) => c.course.toString() === courseId.toString()
    );

    // Add course to user if not already enrolled
    if (!alreadyEnrolled) {
      const newCourse = {
        course: courseId,
        purchaseDate: new Date(),
        amountPaid,
        paymentType: paymentMode, // 🔥 FIXED: Use correct field name from user model
      };
      
      if (paymentMode === "installment") {
        newCourse.totalInstallments = installmentDetails.totalInstallments;
      }

      console.log(`💳 Adding course to user with payment details:`, {
        courseId,
        paymentType: paymentMode, // 🔥 FIXED: Log correct field name
        amountPaid,
        totalInstallments: newCourse.totalInstallments || 'undefined (full payment)'
      });

      user.purchasedCourses.push(newCourse);
      await user.save();
    } else {
      console.log(`💳 User already enrolled in course ${courseId}`);
    }

    // Handle live class integration
    await integrateLiveClassesLogic(userId, courseId);

    console.log("✅ Course enrollment completed");
    return {
      enrolled: true,
      courseId,
      userId,
      amountPaid
    };
  } catch (error) {
    console.error("❌ Error in addCourseToUserLogic:", error);
    throw error;
  }
};

// ============================================================================
// 📹 LIVE CLASS INTEGRATION BUSINESS LOGIC
// ============================================================================
const integrateLiveClassesLogic = async (userId, courseId) => {
  try {
    console.log("💳 Integrating live classes with payment service");

    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found for live class integration");
    }

    const classes = await LiveClass.find({ courseIds: courseId });
    
    const addUserToClasses = classes.map(async (cls) => {
      if (!cls.classId || !cls.commonParticipantLink) return;

      try {
        // Add user to the class and get individual user link
        const addUsersResponse = await addUsersToClass(
          cls.classId,
          [user.merithubUserId]
        );

        if (addUsersResponse && addUsersResponse.length > 0) {
          const userResponse = addUsersResponse[0];
          const { userLink } = userResponse;
          
          // 🔧 FIX: Use individual user link generated by Merithub API
          const individualUserUrl = userLink 
            ? `https://live.merithub.com/info/room/${process.env.MERIT_HUB_CLIENT_ID}/${userLink}`
            : `https://live.merithub.com/info/room/${process.env.MERIT_HUB_CLIENT_ID}/${cls.commonParticipantLink}`;
          
          console.log(`👤 [PAYMENT_SERVICE] Storing individual user link for ${user.merithubUserId}: ${individualUserUrl}`);

          const liveClassInfo = {
            title: cls.title,
            startTime: cls.startTime,
            duration: cls.duration,
            liveLink: individualUserUrl,
            participantLink: individualUserUrl,
            courseIds: courseId,
            classId: cls.classId,
          };

          await User.findByIdAndUpdate(userId, { $push: { liveClasses: liveClassInfo } });
          console.log(`✅ Added user to live class: ${cls.title}`);
        }
      } catch (classError) {
        console.error(`❌ Error adding user to class ${cls.title}:`, classError);
      }
    });

    await Promise.all(addUserToClasses);
    console.log("✅ Live class integration completed");
  } catch (error) {
    console.error("❌ Error in integrateLiveClassesLogic:", error);
    throw error;
  }
};

// ============================================================================
// 💸 INSTALLMENT PAYMENT BUSINESS LOGIC
// ============================================================================
const handleInstallmentPaymentLogic = async (userId, courseId, installmentDetails, planType) => {
  try {
    console.log("💳 Processing installment payment with payment service");

    const plan = await Installment.findOne({ courseId, planType });
    if (!plan) {
      throw new Error("Installment plan not found");
    }

    // Find the specific installment entry
    const entry = plan.userPayments.find(
      (p) =>
        p.userId.toString() === userId &&
        p.installmentIndex === installmentDetails.installmentIndex
    );

    if (!entry || entry.isPaid) {
      throw new Error("Installment not found or already paid");
    }

    // Mark installment as paid
    entry.isPaid = true;
    entry.paymentDate = new Date();
    plan.remainingAmount -= entry.paidAmount;

    // Check if all installments are paid
    const paidInstallments = plan.userPayments.filter(
      (p) => p.userId.toString() === userId && p.isPaid
    ).length;
    
    if (paidInstallments === plan.installments.length) {
      plan.status = "completed";
    }

    await plan.save();

    console.log("✅ Installment payment processed");
    return {
      installmentPaid: true,
      remainingAmount: plan.remainingAmount,
      totalInstallments: plan.installments.length,
      paidInstallments,
      isCompleted: plan.status === "completed"
    };
  } catch (error) {
    console.error("❌ Error in handleInstallmentPaymentLogic:", error);
    throw error;
  }
};

// ============================================================================
// 🎣 WEBHOOK HANDLING BUSINESS LOGIC
// ============================================================================
const handlePaymentWebhookLogic = async (webhookData) => {
  try {
    const { signature, body } = webhookData;

    console.log("💳 Processing payment webhook with payment service");

    // Verify webhook signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(JSON.stringify(body))
      .digest("hex");

    if (signature !== generatedSignature) {
      throw new Error("Invalid webhook signature");
    }

    const {
      event,
      payload: {
        payment: { entity: paymentDetails },
      },
    } = body;

    // Handle payment captured event
    if (event === "payment.captured") {
      await handlePaymentCapturedLogic(paymentDetails);
    }

    console.log("✅ Payment webhook processed successfully");
    return {
      processed: true,
      event,
      paymentId: paymentDetails.id
    };
  } catch (error) {
    console.error("❌ Error in handlePaymentWebhookLogic:", error);
    throw error;
  }
};

// ============================================================================
// 💰 PAYMENT CAPTURED HANDLING BUSINESS LOGIC
// ============================================================================
const handlePaymentCapturedLogic = async (paymentDetails) => {
  try {
    const { order_id, id: paymentId, amount } = paymentDetails;

    console.log("💳 Processing captured payment with payment service");

    if (!amount || isNaN(amount)) {
      throw new Error("Invalid payment amount");
    }

    // Update order status
    const order = await Order.findOneAndUpdate(
      { orderId: order_id },
      {
        status: "paid",
        paymentId,
        paidAt: new Date(),
        ...(paymentDetails.paymentMode === "installment" && {
          "installmentDetails.isPaid": true,
        }),
      },
      { new: true }
    );

    if (!order) {
      throw new Error(`Order not found for ID: ${order_id}`);
    }

    const { userId, courseId, paymentMode, installmentDetails, planType } = order;

    // Handle installment payment if applicable
    if (paymentMode === "installment") {
      await handleInstallmentPaymentLogic(userId, courseId, installmentDetails, planType);
    }

    // Enroll user in course
    await addCourseToUserLogic(userId, courseId, paymentMode, installmentDetails, paymentDetails);

    console.log("✅ Payment captured and processed successfully");
    return {
      captured: true,
      orderId: order_id,
      paymentId,
      courseEnrolled: true
    };
  } catch (error) {
    console.error("❌ Error in handlePaymentCapturedLogic:", error);
    throw error;
  }
};

// ============================================================================
// 💲 PRICE CALCULATION BUSINESS LOGIC
// ============================================================================
const calculatePaymentChargesLogic = (basePrice, options = {}) => {
  try {
    const {
      discount = 0,
      gstPercentage = 0,
      internetHandlingPercentage = 0,
      numberOfInstallments = 1
    } = options;

    console.log("💳 Calculating payment charges with payment service");

    // Validate inputs
    if (discount < 0 || discount > 100) {
      throw new Error("Discount must be between 0 and 100");
    }

    // Calculate discount
    const discountValue = (basePrice * discount) / 100;
    let totalAmount = basePrice - discountValue;

    // Calculate GST
    const gstAmount = (totalAmount * gstPercentage) / 100;

    // Calculate internet handling charges
    const internetHandlingCharge = (totalAmount * internetHandlingPercentage) / 100;

    // Final total
    totalAmount += gstAmount + internetHandlingCharge;

    // Calculate installment amounts if applicable
    let installmentAmounts = [];
    if (numberOfInstallments > 1) {
      const baseInstallmentAmount = Math.floor((totalAmount / numberOfInstallments) * 100) / 100;
      const remainder = Math.round((totalAmount - (baseInstallmentAmount * numberOfInstallments)) * 100) / 100;

      for (let i = 0; i < numberOfInstallments; i++) {
        const amount = i === 0 ? baseInstallmentAmount + remainder : baseInstallmentAmount;
        installmentAmounts.push(amount);
      }
    }

    const calculation = {
      basePrice,
      discount,
      discountValue,
      gstPercentage,
      gstAmount,
      internetHandlingPercentage,
      internetHandlingCharge,
      totalAmount,
      numberOfInstallments,
      installmentAmounts
    };

    console.log("✅ Payment charges calculated successfully");
    return calculation;
  } catch (error) {
    console.error("❌ Error in calculatePaymentChargesLogic:", error);
    throw error;
  }
};

// ============================================================================
// 🔍 ORDER MANAGEMENT BUSINESS LOGIC
// ============================================================================
const getOrderStatusLogic = async (orderId) => {
  try {
    console.log("💳 Getting order status with payment service");

    const order = await Order.findOne({ orderId })
      .populate('userId', 'firstName lastName email')
      .populate('courseId', 'courseName price');

    if (!order) {
      throw new Error("Order not found");
    }

    console.log("✅ Order status retrieved successfully");
    return order;
  } catch (error) {
    console.error("❌ Error in getOrderStatusLogic:", error);
    throw error;
  }
};

const getUserOrdersLogic = async (userId, options = {}) => {
  try {
    const { page = 1, limit = 10, status } = options;

    console.log("💳 Getting user orders with payment service");

    let query = { userId };
    if (status) {
      query.status = status;
    }

    const orders = await Order.find(query)
      .populate('courseId', 'courseName price')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalOrders = await Order.countDocuments(query);

    console.log("✅ User orders retrieved successfully");
    return {
      orders,
      totalOrders,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit)
    };
  } catch (error) {
    console.error("❌ Error in getUserOrdersLogic:", error);
    throw error;
  }
};

// ============================================================================
// 📤 EXPORTS
// ============================================================================
module.exports = {
  createRazorpayOrderLogic,
  verifyPaymentSignatureLogic,
  addCourseToUserLogic,
  integrateLiveClassesLogic,
  handleInstallmentPaymentLogic,
  handlePaymentWebhookLogic,
  handlePaymentCapturedLogic,
  calculatePaymentChargesLogic,
  getOrderStatusLogic,
  getUserOrdersLogic,
  
  // Utility functions
  generateReceipt,
  generateUniqueTrackingNumber,
  generateOrderId,
};
