const Installment = require("../models/installmentModel");
const Order = require("../models/orderModel");
const Course = require("../models/courseModel");
const Subscription = require("../models/subscriptionModel");
const installmentService = require("../services/installmentService");
const paymentService = require("../services/paymentService");
const { logger } = require("../utils/logger");

// Input validation helper
const validateInstallmentInput = (req, res, next) => {
  const { courseId, planType, numberOfInstallments, price } = req.body;
  const errors = [];

  // Required field validation
  if (!courseId) errors.push("courseId is required");
  if (!planType) errors.push("planType is required");
  if (!numberOfInstallments) errors.push("numberOfInstallments is required");
  if (price === undefined || price === null) errors.push("price is required");

  // Type validation
  if (courseId && typeof courseId !== 'string') errors.push("courseId must be a string");
  if (planType && typeof planType !== 'string') errors.push("planType must be a string");
  if (numberOfInstallments && (!Number.isInteger(numberOfInstallments) || numberOfInstallments < 1)) {
    errors.push("numberOfInstallments must be a positive integer");
  }
  if (price !== undefined && price !== null && (typeof price !== 'number' || price <= 0)) {
    errors.push("price must be a positive number");
  }

  if (errors.length > 0) {
    return res.status(400).json({
      message: "Validation failed",
      errors,
      receivedData: { courseId, planType, numberOfInstallments, price }
    });
  }

  next();
};

// Set Installment Plan (Admin)
exports.setCustomInstallments = async (req, res) => {
  try {
    // Run validation first
    await new Promise((resolve, reject) => {
      validateInstallmentInput(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const { courseId, planType, numberOfInstallments, price, discount = 0 } = req.body;
    console.log("Himanshu -> setCustomInstallments -> req.body:", req.body);

    // Validate courseId format
    if (!courseId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid courseId format" });
    }

    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    const subscription = await Subscription.findOne({ course: courseId });
    if (!subscription)
      return res.status(404).json({ message: "Subscription not found" });

    // Get discount from subscription validities if not provided
    let finalDiscount = discount;
    let selectedValidity = null;

    // 1. Try matching by validityId (Robust Method)
    if (req.body.validityId) {
      selectedValidity = subscription.validities?.find(v => v._id && v._id.toString() === req.body.validityId);
    }

    // 2. Fallback: Try matching by string (Legacy Method)
    if (!selectedValidity) {
      selectedValidity = subscription.validities?.find(v => `${v.validity} months` === planType);
    }

    if (!discount || discount === 0) {
      finalDiscount = selectedValidity?.discount || 0;
    }

    // Validate discount range
    if (finalDiscount < 0 || finalDiscount > 100) {
      return res.status(400).json({ message: "Discount must be between 0 and 100" });
    }

    const gstPercentage = subscription.gst || 0;
    const internetHandlingPercentage = subscription.internetHandling || 0;
    const discountValue = (price * finalDiscount) / 100;

    let totalAmount = price - discountValue;
    const gstAmount = (totalAmount * gstPercentage) / 100;
    const internetHandlingCharge = (totalAmount * internetHandlingPercentage) / 100;
    totalAmount += gstAmount + internetHandlingCharge;

    // Enhanced validation for installments
    if (numberOfInstallments < 1) {
      return res.status(400).json({ message: "Number of installments must be at least 1" });
    }

    // Validate maximum installments based on plan duration (extract months dynamically)
    // Extract number of months from planType (e.g., "18 months" -> 18)
    const monthsMatch = planType.match(/(\d+)\s*months?/i);
    if (monthsMatch) {
      const maxMonths = parseInt(monthsMatch[1], 10);
      if (numberOfInstallments > maxMonths) {
        return res.status(400).json({
          message: `Maximum ${maxMonths} installments allowed for ${planType} plan`,
          maxAllowed: maxMonths,
          requested: numberOfInstallments
        });
      }
    }

    // Validate minimum installment amount (₹50)
    const minInstallmentAmount = 50;
    if (totalAmount / numberOfInstallments < minInstallmentAmount) {
      return res.status(400).json({
        message: `Minimum installment amount is ₹${minInstallmentAmount}. Total amount ₹${totalAmount.toFixed(2)} cannot be divided into ${numberOfInstallments} installments.`
      });
    }

    // Improved installment amount calculation with proper rounding
    const baseInstallmentAmount = Math.floor((totalAmount / numberOfInstallments) * 100) / 100;
    const remainder = Math.round((totalAmount - (baseInstallmentAmount * numberOfInstallments)) * 100) / 100;

    console.log(`Price calculation breakdown:`);
    console.log(`- Original price: ₹${price}`);
    console.log(`- Discount (${finalDiscount}%): -₹${discountValue.toFixed(2)}`);
    console.log(`- After discount: ₹${(price - discountValue).toFixed(2)}`);
    console.log(`- GST (${gstPercentage}%): +₹${gstAmount.toFixed(2)}`);
    console.log(`- Internet handling (${internetHandlingPercentage}%): +₹${internetHandlingCharge.toFixed(2)}`);
    console.log(`- Total amount: ₹${totalAmount.toFixed(2)}`);
    console.log(`- Base installment: ₹${baseInstallmentAmount}`);
    console.log(`- Remainder distributed: ₹${remainder}`);

    // Create installments with proper amount distribution
    const installments = [];
    for (let i = 0; i < numberOfInstallments; i++) {
      // Add remainder to first installment to ensure total matches exactly
      const installmentAmount = i === 0 ? baseInstallmentAmount + remainder : baseInstallmentAmount;

      installments.push({
        amount: parseFloat(installmentAmount.toFixed(2)),
        dueDate: i === 0 ? "DOP" : `DOP + ${i} month${i > 1 ? "s" : ""}`,
        isPaid: false,
      });
    }

    // Verify total amount matches (quality check)
    const calculatedTotal = installments.reduce((sum, inst) => sum + inst.amount, 0);
    if (Math.abs(calculatedTotal - totalAmount) > 0.01) {
      console.warn(`Amount mismatch: Expected ₹${totalAmount.toFixed(2)}, Got ₹${calculatedTotal.toFixed(2)}`);
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
      validityId: selectedValidity?._id, // 🔥 Store robust ID
      numberOfInstallments,
      installments,
      discount: finalDiscount, // Ensure we save the calculated/provided discount
      status: "active",
      totalAmount: totalAmount.toFixed(2),
      remainingAmount: totalAmount.toFixed(2),
    });

    await newInstallmentPlan.save();
    return res
      .status(201)
      .json({ message: "Installment plan set", data: newInstallmentPlan });
  } catch (error) {
    console.error("Error in setCustomInstallments:", {
      error: error.message,
      stack: error.stack,
      requestBody: req.body,
      timestamp: new Date().toISOString()
    });

    // Handle specific error types
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: "Validation error",
        details: error.errors
      });
    }
    if (error.name === 'CastError') {
      return res.status(400).json({
        message: "Invalid data format",
        field: error.path
      });
    }

    res.status(500).json({
      message: "Error setting installment plan",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get All Plans for a Course
exports.getInstallments = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { planType, userId } = req.query; // 🔥 NEW: Optional planType and userId filters
    let userPurchasedCourse = null;
    let userIsEnrolled = false;

    // Input validation
    if (!courseId) {
      return res.status(400).json({ message: "courseId is required" });
    }

    // Validate ObjectId format
    if (!courseId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid courseId format" });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        message: "Course not found",
        courseId
      });
    }

    // 🔥 CRITICAL: If userId is provided, check if user has enrolled with a specific plan
    // Also check for installmentPlanId query parameter
    const { installmentPlanId } = req.query; // 🔥 NEW: Support installmentPlanId filter
    let planTypeToFilter = planType;

    // Priority 1: If installmentPlanId is provided, use that
    if (installmentPlanId) {
      const plan = await Installment.findById(installmentPlanId);
      if (plan && plan.courseId.toString() === courseId) {
        planTypeToFilter = plan.planType;
        console.log(`✅ [getInstallments] Using installmentPlanId: ${installmentPlanId} (${plan.planType})`);
      } else {
        console.warn(`⚠️ [getInstallments] installmentPlanId ${installmentPlanId} not found or doesn't match course`);
      }
    }

    // 🔥 CRITICAL: Only filter by userId if user is ACTUALLY ENROLLED (has purchasedCourses with installments)
    // Don't filter just because user has orders - they might be in the process of purchasing
    if (userId && !planTypeToFilter) {
      try {
        const User = require('../models/userModel');
        const user = await User.findById(userId).select('purchasedCourses');
        if (user?.purchasedCourses) {
          userPurchasedCourse = user.purchasedCourses.find((pc) => {
            const pcCourseId = pc.course?.toString?.() || pc.course;
            const paymentMode = pc.paymentType || pc.paymentMode;
            return pcCourseId === courseId && paymentMode === 'installment';
          });

          // 🔥 CRITICAL: Only filter if user has installments array (actually enrolled)
          // If user just has purchasedCourses entry but no installments, they're not enrolled yet
          if (userPurchasedCourse?.installments && userPurchasedCourse.installments.length > 0) {
            userIsEnrolled = true;
            // User is enrolled - filter to their enrolled plan
            if (userPurchasedCourse?.planType) {
              planTypeToFilter = userPurchasedCourse.planType;
              console.log(`✅ [getInstallments] User ${userId} ENROLLED with plan: ${planTypeToFilter}, filtering to show only that plan`);
            }
          } else {
            // User has purchasedCourses entry but no installments - not enrolled yet, show all plans
            console.log(`ℹ️ [getInstallments] User ${userId} has course entry but not enrolled yet - showing all plans for selection`);
          }
        } else {
          // User has no purchasedCourses - not enrolled, show all plans
          console.log(`ℹ️ [getInstallments] User ${userId} not enrolled - showing all plans for selection`);
        }
      } catch (userError) {
        console.error(`⚠️ [getInstallments] Error checking user plan:`, userError);
        // On error, don't filter - show all plans
      }
    }

    // Build query - filter by installmentPlanId or planType if provided
    const query = { courseId };
    if (installmentPlanId) {
      query._id = installmentPlanId; // 🔥 NEW: Filter by plan ID
      console.log(`🔍 [getInstallments] Filtering by installmentPlanId: ${installmentPlanId}`);
    } else if (planTypeToFilter) {
      query.planType = planTypeToFilter;
      console.log(`🔍 [getInstallments] Filtering by planType: ${planTypeToFilter}`);
    } else if (userId) {
      // 🔥 CRITICAL: If userId is provided but no planType found, log warning
      console.warn(`⚠️ [getInstallments] User ${userId} provided but no planType found - returning all plans`);
    }

    const installments = await Installment.find(query).sort({ createdAt: -1 });
    if (!installments.length) {
      return res.status(404).json({
        message: "No installment plans found for this course",
        courseId,
        courseName: course.title || course.name
      });
    }

    // NOTE: Do not sync Order state into shared Installment plans.
    // Installment plans are templates; user-specific payment state must be derived elsewhere.
    let responseInstallments = installments.map((plan) => plan.toObject());
    if (userId) {
      const User = require('../models/userModel');
      const user = await User.findById(userId).select('purchasedCourses');
      if (user?.purchasedCourses && !userPurchasedCourse) {
        userPurchasedCourse = user.purchasedCourses.find((pc) => {
          const pcCourseId = pc.course?.toString?.() || pc.course;
          const paymentMode = pc.paymentType || pc.paymentMode;
          return pcCourseId === courseId && paymentMode === 'installment';
        });
        userIsEnrolled = !!(userPurchasedCourse?.installments && userPurchasedCourse.installments.length > 0);
      }

      const paidOrders = await Order.find({
        courseId,
        userId,
        status: "paid",
        paymentMode: "installment"
      }).select('installmentDetails installmentPlanId planType paidAt updatedAt createdAt');

      responseInstallments = installments.map((plan) => {
        const planObj = plan.toObject();
        const planId = plan._id?.toString?.() || plan._id;
        const planPaidOrders = paidOrders.filter((order) => {
          const orderPlanId = order.installmentPlanId?.toString?.() || order.installmentPlanId;
          return orderPlanId ? orderPlanId === planId : order.planType === plan.planType;
        });
        const paidByIndex = new Map();
        planPaidOrders.forEach((order) => {
          const idx = order.installmentDetails?.installmentIndex;
          if (idx !== undefined && idx !== null) {
            paidByIndex.set(idx, order);
          }
        });

        const sourceInstallments = (userIsEnrolled && userPurchasedCourse?.planType === plan.planType)
          ? userPurchasedCourse.installments
          : plan.installments;

        const mappedInstallments = sourceInstallments.map((inst, idx) => {
          const paidOrder = paidByIndex.get(idx);
          const isPaid = !!paidOrder || !!inst.isPaid;
          const paidOn = paidOrder?.paidAt || paidOrder?.updatedAt || paidOrder?.createdAt || inst.paidDate || inst.paidOn || null;
          return {
            ...inst,
            isPaid,
            paidOn
          };
        });

        return {
          ...planObj,
          installments: mappedInstallments
        };
      });
    }

    // 🔥 CRITICAL: If userId provided and user is ENROLLED (has installments), ensure only enrolled plan is returned
    if (userId && responseInstallments.length > 1) {
      try {
        const User = require('../models/userModel');
        const user = await User.findById(userId).select('purchasedCourses');
        if (user?.purchasedCourses) {
          const userPurchasedCourse = user.purchasedCourses.find((pc) => {
            const pcCourseId = pc.course?.toString?.() || pc.course;
            const paymentMode = pc.paymentType || pc.paymentMode;
            return pcCourseId === courseId && paymentMode === 'installment';
          });

          // 🔥 CRITICAL: Only filter if user has installments array (actually enrolled)
          if (userPurchasedCourse?.installments && userPurchasedCourse.installments.length > 0) {
            if (userPurchasedCourse?.planType) {
              // Filter to only return the enrolled plan
              const enrolledPlan = responseInstallments.find(p => p.planType === userPurchasedCourse.planType);
              if (enrolledPlan) {
                console.log(`✅ [getInstallments] User ${userId} is ENROLLED - returning only enrolled plan: ${userPurchasedCourse.planType}`);
                const enhancedInstallment = {
                  ...enrolledPlan,
                  courseName: course.title || course.name,
                  totalInstallments: enrolledPlan.installments.length,
                  paidInstallments: enrolledPlan.installments.filter(inst => inst.isPaid).length,
                  nextDueInstallment: enrolledPlan.installments.find(inst => !inst.isPaid) || null
                };
                return res.status(200).json({
                  message: "Installment plans retrieved successfully",
                  data: [enhancedInstallment], // Return only enrolled plan
                  count: 1,
                  courseInfo: {
                    id: course._id,
                    name: course.title || course.name
                  }
                });
              }
            }
          } else {
            // User not enrolled yet - return all plans
            console.log(`ℹ️ [getInstallments] User ${userId} not enrolled yet - returning all plans for selection`);
          }
        }
      } catch (userError) {
        console.error(`⚠️ [getInstallments] Error in final user check:`, userError);
      }
    }

    // Enhance response with additional metadata
    const enhancedInstallments = responseInstallments.map(plan => ({
      ...plan,
      courseName: course.title || course.name,
      totalInstallments: plan.installments.length,
      paidInstallments: plan.installments.filter(inst => inst.isPaid).length,
      nextDueInstallment: plan.installments.find(inst => !inst.isPaid) || null
    }));

    res.status(200).json({
      message: "Installment plans retrieved successfully",
      data: enhancedInstallments,
      count: responseInstallments.length,
      courseInfo: {
        id: course._id,
        name: course.title || course.name
      }
    });
  } catch (error) {
    console.error("Error in getInstallments:", {
      error: error.message,
      courseId: req.params.courseId,
      timestamp: new Date().toISOString()
    });

    if (error.name === 'CastError') {
      return res.status(400).json({
        message: "Invalid courseId format",
        field: error.path
      });
    }

    res.status(500).json({
      message: "Error retrieving installment plans",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Create Razorpay Order for Installment
exports.makeInstallmentPayment = async (req, res) => {
  try {
    const { installmentId } = req.params;
    const { userId, installmentIndex } = req.body;

    // Input validation
    if (!installmentId) {
      return res.status(400).json({ message: "installmentId is required" });
    }
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }
    if (installmentIndex === undefined || installmentIndex === null) {
      return res.status(400).json({ message: "installmentIndex is required" });
    }

    // Validate ObjectId format
    if (!installmentId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid installmentId format" });
    }
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid userId format" });
    }

    // Validate installmentIndex is a valid integer
    if (!Number.isInteger(installmentIndex) || installmentIndex < 0) {
      return res.status(400).json({ message: "installmentIndex must be a non-negative integer" });
    }

    const installmentPlan = await Installment.findById(installmentId);
    if (!installmentPlan)
      return res.status(404).json({ message: "Installment plan not found" });

    if (installmentIndex >= installmentPlan.installments.length) {
      return res.status(400).json({
        message: "Invalid installment index",
        maxIndex: installmentPlan.installments.length - 1,
        providedIndex: installmentIndex
      });
    }

    const installment = installmentPlan.installments[installmentIndex];
    const existingPaidOrder = await Order.findOne({
      userId,
      courseId: installmentPlan.courseId,
      installmentPlanId: installmentPlan._id,
      paymentMode: "installment",
      status: "paid",
      "installmentDetails.installmentIndex": installmentIndex
    }).select("_id");

    if (existingPaidOrder) {
      return res.status(400).json({ message: "Already paid" });
    }

    // Prepare order data for payment service
    const orderData = {
      amount: installment.amount,
      currency: "INR",
      userId,
      courseId: installmentPlan.courseId,
      planType: installmentPlan.planType,
      paymentMode: "installment",
      installmentIndex,
      totalInstallments: installmentPlan.installments.length,
      notes: {
        installmentPlanId: installmentId
      }
    };

    // Use payment service to create Razorpay order
    const result = await paymentService.createRazorpayOrderLogic(orderData);

    // 🚀 LOG INSTALLMENT PAYMENT ORDER CREATION SUCCESS
    logger.userActivity(
      userId,
      result.internalOrder?.userEmail || 'Unknown User',
      'INSTALLMENT_PAYMENT_ORDER_CREATED',
      `Amount: ₹${installment.amount}, Course: ${installmentPlan.courseId}, Plan: ${installmentPlan.planType}, Installment: ${installmentIndex + 1}/${installmentPlan.installments.length}, OrderID: ${result.internalOrder?.orderId}, TrackingID: ${result.trackingNumber}, IP: ${req.ip}`
    );

    res.status(201).json({
      success: true,
      order: result.razorpayOrder,
      internalOrder: result.internalOrder,
      trackingNumber: result.trackingNumber,
      message: "Installment payment order created",
    });
  } catch (error) {
    // 🚀 LOG INSTALLMENT PAYMENT ORDER CREATION ERROR
    logger.error(error, 'INSTALLMENT_PAYMENT_ORDER_CREATE', `InstallmentID: ${req.params.installmentId}, UserID: ${req.body.userId}, Index: ${req.body.installmentIndex}`);

    if (error.name === 'CastError') {
      return res.status(400).json({
        message: "Invalid ID format",
        field: error.path
      });
    }

    res.status(500).json({
      message: "Error creating installment payment order",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Razorpay Webhook Confirmation
exports.confirmInstallmentPayment = async (req, res) => {
  try {
    // Validate webhook signature
    const signature = req.headers["x-razorpay-signature"];
    if (!signature) {
      return res.status(400).json({ message: "Missing webhook signature" });
    }

    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
      console.error("RAZORPAY_WEBHOOK_SECRET not configured");
      return res.status(500).json({ message: "Webhook configuration error" });
    }

    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (signature !== generatedSignature) {
      console.warn("Invalid webhook signature received", {
        received: signature,
        expected: generatedSignature,
        timestamp: new Date().toISOString()
      });
      return res.status(400).json({ message: "Invalid webhook signature" });
    }

    const { event, payload } = req.body;

    // Validate webhook payload structure
    if (!event) {
      return res.status(400).json({ message: "Missing event type in webhook" });
    }
    if (!payload) {
      return res.status(400).json({ message: "Missing payload in webhook" });
    }

    const paymentEntity = payload?.payment?.entity;
    if (!paymentEntity) {
      return res.status(400).json({ message: "Missing payment entity in webhook" });
    }

    if (event !== "payment.captured") {
      console.log(`Ignoring webhook event: ${event}`);
      return res.status(200).json({ message: `Event ${event} ignored` });
    }

    const {
      order_id: orderId,
      status: paymentStatus,
    } = paymentEntity;

    const order = await Order.findOne({ orderId });
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (paymentStatus !== "captured") {
      return res.status(400).json({ message: "Payment status not captured" });
    }

    order.status = "paid";

    // Update order's installmentDetails if it exists
    if (order.installmentDetails) {
      order.installmentDetails.isPaid = true;
    }

    await order.save();

    res.status(200).json({ success: true, message: "Installment payment confirmed" });
  } catch (error) {
    console.error("Error in confirmInstallmentPayment:", error);
    res.status(500).json({
      message: "Error confirming installment payment",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get Balance for a User & Course
exports.getOutstandingBalance = async (req, res) => {
  try {
    const { courseId, userId } = req.params;

    // Input validation
    if (!courseId) {
      return res.status(400).json({ message: "courseId is required" });
    }
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    // Validate ObjectId format
    if (!courseId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid courseId format" });
    }
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid userId format" });
    }

    const User = require('../models/userModel');
    const user = await User.findById(userId).select('purchasedCourses');
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const purchasedCourse = user.purchasedCourses?.find((pc) => {
      const pcCourseId = pc.course?.toString?.() || pc.course;
      const paymentMode = pc.paymentType || pc.paymentMode;
      return pcCourseId === courseId && paymentMode === 'installment';
    });

    if (!purchasedCourse || !purchasedCourse.installments || purchasedCourse.installments.length === 0) {
      return res.status(404).json({
        message: "No installment enrollment found for this user and course",
        courseId,
        userId
      });
    }

    const paidOrders = await Order.find({
      courseId,
      userId,
      status: "paid",
      paymentMode: "installment"
    }).select('installmentDetails paidAt updatedAt createdAt planType installmentPlanId');

    const paidIndexes = new Set(
      paidOrders
        .map((order) => order.installmentDetails?.installmentIndex)
        .filter((idx) => idx !== undefined && idx !== null)
    );

    const installments = purchasedCourse.installments.map((inst, idx) => {
      const paidOrder = paidOrders.find(
        (order) => order.installmentDetails?.installmentIndex === idx
      );
      const isPaid = paidIndexes.has(idx) || !!inst.isPaid;
      const paidOn = paidOrder?.paidAt || paidOrder?.updatedAt || paidOrder?.createdAt || inst.paidDate || null;
      return {
        amount: inst.amount,
        isPaid,
        paidOn,
        installmentNumber: inst.installmentNumber || idx + 1
      };
    });

    let planTypeToUse = purchasedCourse.planType || null;
    if (!planTypeToUse) {
      const orderWithPlanType = paidOrders.find((order) => order.planType);
      if (orderWithPlanType?.planType) {
        planTypeToUse = orderWithPlanType.planType;
      } else {
        const orderWithPlanId = paidOrders.find((order) => order.installmentPlanId);
        if (orderWithPlanId?.installmentPlanId) {
          const planFromOrder = await Installment.findById(orderWithPlanId.installmentPlanId).select('planType');
          if (planFromOrder?.planType) {
            planTypeToUse = planFromOrder.planType;
          }
        }
      }
    }
    if (planTypeToUse && !purchasedCourse.planType) {
      await User.updateOne(
        { _id: userId, "purchasedCourses.course": courseId },
        { $set: { "purchasedCourses.$.planType": planTypeToUse } }
      );
    }

    const totalAmount = installments.reduce((sum, inst) => sum + (inst.amount || 0), 0);
    const paidAmount = installments
      .filter((inst) => inst.isPaid)
      .reduce((sum, inst) => sum + (inst.amount || 0), 0);
    const actualRemainingAmount = Math.max(0, totalAmount - paidAmount);
    const planType = planTypeToUse;
    const numberOfInstallments = purchasedCourse.totalInstallments || installments.length;

    res.status(200).json({
      message: "Outstanding balance retrieved",
      remainingAmount: actualRemainingAmount,
      totalAmount,
      paidAmount,
      installments,
      planType,
      numberOfInstallments
    });
  } catch (error) {
    console.error("Error in getOutstandingBalance:", {
      error: error.message,
      courseId: req.params.courseId,
      userId: req.params.userId,
      timestamp: new Date().toISOString()
    });

    if (error.name === 'CastError') {
      return res.status(400).json({
        message: "Invalid ID format",
        field: error.path
      });
    }

    res.status(500).json({
      message: "Error retrieving outstanding balance",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Get Timeline of Installment Dates for a User
exports.getUserInstallmentTimeline = async (req, res) => {
  try {
    const { courseId, userId } = req.params;

    // Input validation
    if (!courseId) {
      return res.status(400).json({ message: "courseId is required" });
    }
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    // Validate ObjectId format
    if (!courseId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid courseId format" });
    }
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid userId format" });
    }

    const User = require('../models/userModel');
    const user = await User.findById(userId).select('purchasedCourses');
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const purchasedCourse = user.purchasedCourses?.find((pc) => {
      const pcCourseId = pc.course?.toString?.() || pc.course;
      const paymentMode = pc.paymentType || pc.paymentMode;
      return pcCourseId === courseId && paymentMode === 'installment';
    });

    if (!purchasedCourse || !purchasedCourse.installments || purchasedCourse.installments.length === 0) {
      return res.status(404).json({
        message: "No installment enrollment found for this user and course",
        courseId,
        userId
      });
    }

    const paidOrders = await Order.find({
      courseId,
      userId,
      status: "paid",
      paymentMode: "installment"
    }).sort({ createdAt: 1 }).select('installmentDetails paidAt updatedAt createdAt planType installmentPlanId');

    const paidIndexes = new Set(
      paidOrders
        .map((order) => order.installmentDetails?.installmentIndex)
        .filter((idx) => idx !== undefined && idx !== null)
    );

    // Calculate base date for timeline from first payment
    const enrollmentOrder = paidOrders.find(
      (order) => order.installmentDetails?.installmentIndex === 0
    ) || paidOrders[0];
    const firstPaidDate = enrollmentOrder?.paidAt || enrollmentOrder?.updatedAt || enrollmentOrder?.createdAt || null;
    const baseDate = firstPaidDate || purchasedCourse.purchaseDate || new Date();

    let lastDueDate = null;
    const currentDate = new Date();

    // 🔥 STEP 1: Find planType using fallback cascade (Your fix for null planType)
    let planTypeToUse = purchasedCourse.planType || null;
    if (!planTypeToUse) {
      const orderWithPlanType = paidOrders.find((order) => order.planType);
      if (orderWithPlanType?.planType) {
        planTypeToUse = orderWithPlanType.planType;
        console.log(`✅ [TIMELINE] Found planType from order: ${planTypeToUse}`);
      } else {
        const orderWithPlanId = paidOrders.find((order) => order.installmentPlanId);
        if (orderWithPlanId?.installmentPlanId) {
          const planFromOrder = await Installment.findById(orderWithPlanId.installmentPlanId).select('planType');
          if (planFromOrder?.planType) {
            planTypeToUse = planFromOrder.planType;
            console.log(`✅ [TIMELINE] Found planType from installmentPlan: ${planTypeToUse}`);
          }
        }
      }
    }

    // 🔥 STEP 2: Validate planType against actual amounts (Incoming version's validation)
    if (planTypeToUse && purchasedCourse.installments && purchasedCourse.installments.length > 0) {
      try {
        // Fetch the plan from database
        const plan = await Installment.findOne({ courseId, planType: planTypeToUse });
        
        if (plan && plan.installments && plan.installments.length > 0) {
          const firstPlanAmount = plan.installments[0]?.amount;
          const firstUserAmount = purchasedCourse.installments[0]?.amount;

          // 🔥 CRITICAL: Verify that amounts match - if not, find correct plan
          if (firstPlanAmount !== firstUserAmount) {
            console.warn(`⚠️ [TIMELINE] Plan amounts don't match! Plan has ₹${firstPlanAmount}, User has ₹${firstUserAmount}`);
            console.warn(`⚠️ [TIMELINE] Searching for plan with matching amounts...`);

            // Find all plans for this course
            const allPlans = await Installment.find({ courseId });

            // Find the plan that matches the user's installment amounts
            const matchingPlan = allPlans.find(p => {
              if (!p.installments || p.installments.length !== purchasedCourse.installments.length) {
                return false;
              }
              // Check if first installment amount matches
              return p.installments[0]?.amount === firstUserAmount;
            });

            if (matchingPlan) {
              console.log(`✅ [TIMELINE] Found matching plan: ${matchingPlan.planType} (amounts match)`);
              planTypeToUse = matchingPlan.planType;

              // 🔥 CRITICAL: Update purchasedCourses with correct planType if it was wrong
              if (purchasedCourse.planType !== matchingPlan.planType) {
                try {
                  await User.updateOne(
                    {
                      _id: userId,
                      "purchasedCourses.course": courseId
                    },
                    {
                      $set: {
                        "purchasedCourses.$.planType": matchingPlan.planType
                      }
                    }
                  );
                  console.log(`✅ [TIMELINE] Updated incorrect planType in purchasedCourses: ${purchasedCourse.planType} → ${matchingPlan.planType}`);
                } catch (updateError) {
                  console.error(`❌ [TIMELINE] Failed to update planType in purchasedCourses:`, updateError);
                }
              }
            } else {
              console.error(`❌ [TIMELINE] No matching plan found for amounts. User's first installment: ₹${firstUserAmount}`);
            }
          } else {
            console.log(`✅ [TIMELINE] Plan amounts match correctly`);
          }
        }
      } catch (planValidationError) {
        console.error(`❌ [TIMELINE] Error validating plan amounts:`, planValidationError);
      }
    }

    // 🔥 STEP 3: Update purchasedCourse if planType was missing
    if (planTypeToUse && !purchasedCourse.planType) {
      await User.updateOne(
        { _id: userId, "purchasedCourses.course": courseId },
        { $set: { "purchasedCourses.$.planType": planTypeToUse } }
      );
      console.log(`✅ [TIMELINE] Set missing planType in purchasedCourses: ${planTypeToUse}`);
    }

    // 🔥 STEP 4: Generate timeline with correct planType
    const timeline = purchasedCourse.installments.map((inst, index) => {
      let dueDate;
      if (index === 0) {
        dueDate = baseDate;
      } else {
        const prevDate = lastDueDate || baseDate;
        dueDate = new Date(prevDate);
        dueDate.setMonth(dueDate.getMonth() + 1);
      }
      lastDueDate = new Date(dueDate);

      const paidOrder = paidOrders.find(
        (order) => order.installmentDetails?.installmentIndex === index
      );
      const isPaid = paidIndexes.has(index) || !!inst.isPaid;
      const paidOn = paidOrder?.paidAt || paidOrder?.updatedAt || paidOrder?.createdAt || inst.paidDate || null;

      let status = 'UPCOMING';
      if (isPaid) {
        status = 'PAID';
      } else if (currentDate > dueDate) {
        status = 'OVERDUE';
      }

      return {
        planType: planTypeToUse,
        installmentIndex: index,
        dueDate,
        amount: inst.amount,
        isPaid,
        paidOn,
        status,
        daysPastDue: status === 'OVERDUE'
          ? Math.floor((currentDate - dueDate) / (1000 * 60 * 60 * 24))
          : 0
      };
    });

    // 🔥 STEP 5: Calculate amounts from user's locked-in installments
    const totalAmount = purchasedCourse.installments.reduce((sum, inst) => sum + (inst.amount || 0), 0);
    const paidAmount = purchasedCourse.installments
      .filter((_, idx) => paidIndexes.has(idx) || purchasedCourse.installments[idx]?.isPaid)
      .reduce((sum, inst) => sum + (inst.amount || 0), 0);
    const remainingAmount = Math.max(0, totalAmount - paidAmount);

    res.status(200).json({
      message: "Timeline retrieved",
      timeline,
      totalAmount,
      paidAmount,
      remainingAmount,
      purchasedCourse: {
        courseId: purchasedCourse.course?.toString?.() || purchasedCourse.course,
        purchaseDate: purchasedCourse.purchaseDate,
        amountPaid: purchasedCourse.amountPaid,
        paymentType: purchasedCourse.paymentType || purchasedCourse.paymentMode,
        totalInstallments: purchasedCourse.totalInstallments,
        planType: planTypeToUse,
        assignedByAdmin: purchasedCourse.assignedByAdmin,
        expiresAt: purchasedCourse.expiresAt
      }
    });
  } catch (error) {
    console.error("Error in getUserInstallmentTimeline:", {
      error: error.message,
      courseId: req.params.courseId,
      userId: req.params.userId,
      timestamp: new Date().toISOString()
    });

    if (error.name === 'CastError') {
      return res.status(400).json({
        message: "Invalid ID format",
        field: error.path
      });
    }

    res.status(500).json({
      message: "Error retrieving installment timeline",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// 🔥 NEW: Check user's course access based on installment payments
exports.checkUserCourseAccess = async (req, res) => {
  try {
    const { courseId, userId } = req.params;

    // Input validation
    if (!courseId) {
      return res.status(400).json({ message: "courseId is required" });
    }
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    // Validate ObjectId format
    if (!courseId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid courseId format" });
    }
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid userId format" });
    }

    const { checkUserInstallmentStatus } = require('../services/courseAccessService');
    const accessStatus = await checkUserInstallmentStatus(userId, courseId);

    res.status(200).json({
      message: "Course access status retrieved",
      hasAccess: accessStatus.hasAccess,
      reason: accessStatus.reason,
      ...(accessStatus.message && { statusMessage: accessStatus.message }),
      ...(accessStatus.planType && { planType: accessStatus.planType }),
      ...(accessStatus.overdueInstallments && { overdueInstallments: accessStatus.overdueInstallments }),
      ...(accessStatus.totalOverdueAmount && { totalOverdueAmount: accessStatus.totalOverdueAmount }),
      ...(accessStatus.nextDueInstallment && { nextDueInstallment: accessStatus.nextDueInstallment }),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error in checkUserCourseAccess:", {
      error: error.message,
      courseId: req.params.courseId,
      userId: req.params.userId,
      timestamp: new Date().toISOString()
    });

    if (error.name === 'CastError') {
      return res.status(400).json({
        message: "Invalid ID format",
        field: error.path
      });
    }

    res.status(500).json({
      message: "Error checking course access",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// 🔥 NEW: Get detailed payment timeline for user's course
exports.getUserPaymentTimeline = async (req, res) => {
  try {
    const { courseId, userId } = req.params;

    // Input validation
    if (!courseId) {
      return res.status(400).json({ message: "courseId is required" });
    }
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    // Validate ObjectId format
    if (!courseId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid courseId format" });
    }
    if (!userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid userId format" });
    }

    const { getUserPaymentTimeline } = require('../services/courseAccessService');
    const timelineData = await getUserPaymentTimeline(userId, courseId);

    res.status(200).json({
      message: "Payment timeline retrieved successfully",
      ...timelineData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error in getUserPaymentTimeline:", {
      error: error.message,
      courseId: req.params.courseId,
      userId: req.params.userId,
      timestamp: new Date().toISOString()
    });

    if (error.name === 'CastError') {
      return res.status(400).json({
        message: "Invalid ID format",
        field: error.path
      });
    }

    res.status(500).json({
      message: "Error retrieving payment timeline",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};


