const Installment = require("../models/installmentModel");
const UserInstallment = require("../models/userInstallmentModel");
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
          const userPurchasedCourse = user.purchasedCourses.find((pc) => {
            const pcCourseId = pc.course?.toString?.() || pc.course;
            return pcCourseId === courseId && pc.paymentType === 'installment';
          });

          // 🔥 CRITICAL: Only filter if user has installments array (actually enrolled)
          // If user just has purchasedCourses entry but no installments, they're not enrolled yet
          if (userPurchasedCourse?.installments && userPurchasedCourse.installments.length > 0) {
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

    // Fetch all paid orders for this course to sync payment status
    let paidOrders = await Order.find({
      courseId: courseId,
      status: "paid",
      paymentMode: "installment"
    });

    // Auto-fix: If status is "paid" but installmentDetails.isPaid is false, update it to true
    let ordersFixed = 0;
    for (const order of paidOrders) {
      if (order.installmentDetails &&
        order.status === "paid" &&
        order.installmentDetails.isPaid === false) {
        console.log(`🔧 Auto-fixing order ${order.orderId}: Setting installmentDetails.isPaid to true`);
        order.installmentDetails.isPaid = true;
        await order.save();
        ordersFixed++;
      }
    }

    if (ordersFixed > 0) {
      console.log(`✅ Auto-fixed ${ordersFixed} order(s) in getInstallments`);
      // Re-fetch orders to get updated data
      paidOrders = await Order.find({
        courseId: courseId,
        status: "paid",
        paymentMode: "installment"
      });
    }

    // Sync userPayments and installments with Order status
    let totalFixed = 0;
    for (const plan of installments) {
      let planUpdated = false;

      // Process each paid order
      for (const order of paidOrders) {
        // 🔥 CRITICAL: Check if order belongs to THIS SPECIFIC PLAN
        // Must match BOTH installmentPlanId (if available) AND installmentIndex
        const orderPlanId = order.installmentPlanId?.toString?.() || order.installmentPlanId;
        const planId = plan._id?.toString?.() || plan._id;

        // Check if order belongs to this plan
        // Priority 1: Match by installmentPlanId (most accurate)
        // Priority 2: If installmentPlanId not available, match by planType (fallback for old orders)
        const belongsToThisPlan = orderPlanId
          ? orderPlanId === planId
          : order.planType === plan.planType;

        if (!belongsToThisPlan) {
          // Order doesn't belong to this plan - skip it
          continue;
        }

        // Now verify installmentIndex is valid for this plan
        if (order.installmentDetails &&
          order.installmentDetails.installmentIndex !== undefined &&
          order.installmentDetails.installmentIndex < plan.installments.length) {

          const installmentIdx = order.installmentDetails.installmentIndex;
          const userId = order.userId?.toString?.() || order.userId;

          // Check BOTH conditions: status === "paid" AND installmentDetails.isPaid === true
          const isFullyPaid = order.status === "paid" &&
            order.installmentDetails.isPaid === true;

          if (isFullyPaid) {
            // Update installments array
            if (plan.installments[installmentIdx] && !plan.installments[installmentIdx].isPaid) {
              plan.installments[installmentIdx].isPaid = true;
              plan.installments[installmentIdx].paidOn = order.updatedAt || order.createdAt || new Date();
              planUpdated = true;
              totalFixed++;
              console.log(`✅ [SYNC] Marked installment ${installmentIdx} as paid for plan ${plan.planType} (ID: ${planId}) from order ${order.orderId}`);
            }

            // Update userPayments array
            const userPaymentIndex = plan.userPayments.findIndex(
              up => up.userId?.toString?.() === userId &&
                up.installmentIndex === installmentIdx
            );

            if (userPaymentIndex !== -1) {
              // Update existing userPayment
              if (!plan.userPayments[userPaymentIndex].isPaid) {
                plan.userPayments[userPaymentIndex].isPaid = true;
                plan.userPayments[userPaymentIndex].paymentDate = order.updatedAt || order.createdAt || new Date();
                planUpdated = true;
              }
            } else {
              // Add new userPayment entry if it doesn't exist
              plan.userPayments.push({
                userId: userId,
                installmentIndex: installmentIdx,
                isPaid: true,
                paidAmount: order.amount,
                paymentDate: order.updatedAt || order.createdAt || new Date()
              });
              planUpdated = true;
            }
          }
        }
      }

      // Update remainingAmount and status if plan was updated
      if (planUpdated) {
        const paidAmount = plan.installments
          .filter(inst => inst.isPaid)
          .reduce((sum, inst) => sum + inst.amount, 0);
        plan.remainingAmount = plan.totalAmount - paidAmount;

        if (plan.installments.every(inst => inst.isPaid)) {
          plan.status = "completed";
        }

        await plan.save();
      }
    }

    if (totalFixed > 0) {
      console.log(`✅ Synced ${totalFixed} installment payment(s) with Order status for course ${courseId}`);
    }

    // Re-fetch installments to get updated data (use query to respect filtering)
    // Note: We use the original query here to maintain filtering
    const updatedInstallments = await Installment.find(query).sort({ createdAt: -1 });

    // 🔥 CRITICAL: If userId provided and user is ENROLLED (has installments), ensure only enrolled plan is returned
    if (userId && updatedInstallments.length > 1) {
      try {
        const User = require('../models/userModel');
        const user = await User.findById(userId).select('purchasedCourses');
        if (user?.purchasedCourses) {
          const userPurchasedCourse = user.purchasedCourses.find((pc) => {
            const pcCourseId = pc.course?.toString?.() || pc.course;
            return pcCourseId === courseId && pc.paymentType === 'installment';
          });

          // 🔥 CRITICAL: Only filter if user has installments array (actually enrolled)
          if (userPurchasedCourse?.installments && userPurchasedCourse.installments.length > 0) {
            if (userPurchasedCourse?.planType) {
              // Filter to only return the enrolled plan
              const enrolledPlan = updatedInstallments.find(p => p.planType === userPurchasedCourse.planType);
              if (enrolledPlan) {
                console.log(`✅ [getInstallments] User ${userId} is ENROLLED - returning only enrolled plan: ${userPurchasedCourse.planType}`);
                const enhancedInstallment = {
                  ...enrolledPlan.toObject(),
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
    const enhancedInstallments = updatedInstallments.map(plan => ({
      ...plan.toObject(),
      courseName: course.title || course.name,
      totalInstallments: plan.installments.length,
      paidInstallments: plan.installments.filter(inst => inst.isPaid).length,
      nextDueInstallment: plan.installments.find(inst => !inst.isPaid) || null
    }));

    res.status(200).json({
      message: "Installment plans retrieved successfully",
      data: enhancedInstallments,
      count: updatedInstallments.length,
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
    if (installment.isPaid)
      return res.status(400).json({ message: "Already paid" });

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

    // Find or create UserInstallment record
    let userInstallment = await UserInstallment.findOne({ userId, courseId: installmentPlan.courseId });
    if (!userInstallment) {
      userInstallment = new UserInstallment({
        userId,
        courseId: installmentPlan.courseId,
        installmentPlanId: installmentPlan._id,
        planSnapshot: {
          planType: installmentPlan.planType,
          totalAmount: installmentPlan.totalAmount,
          numberOfInstallments: installmentPlan.numberOfInstallments,
          installments: installmentPlan.installments.map(i => ({ amount: i.amount, dueDate: i.dueDate }))
        },
        remainingAmount: installmentPlan.totalAmount
      });
      await userInstallment.save();
    }

    // 🚀 LOG INSTALLMENT PAYMENT ORDER CREATION SUCCESS
    logger.userActivity(
      userId,
      result.internalOrder?.userEmail || 'Unknown User',
      'INSTALLMENT_PAYMENT_ORDER_CREATED',
      `Amount: ₹${installment.amount}, Course: ${installmentPlan.courseId}, Plan: ${installmentPlan.planType}, Installment: ${installmentIndex + 1}/${installmentPlan.installments.length}, OrderID: ${result.internalOrder?.orderId}, TrackingID: ${result.trackingNumber}, IP: ${req.ip}, UserInstallment Mode`
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
      amount: paidAmount,
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

    const installmentPlan = await Installment.findById(order.installmentPlanId);
    if (!installmentPlan)
      return res.status(404).json({ message: "Plan not found" });

    // 🔥 UPDATED: Use UserInstallment for scalable tracking

    // 1. Update Legacy (for backward compat if needed, but we rely on new model now)
    // We skip updating the massive array to avoid the very crash we are fixing
    // existingPlan.remainingAmount -= installment.amount; // Use generic ref

    // 2. Update New Scalable Model
    let userInstallment = await UserInstallment.findOne({ userId: order.userId, courseId: installmentPlan.courseId });

    if (userInstallment) {
      // Check if already paid in new model
      const alreadyPaid = userInstallment.payments.some(p => p.installmentIndex === order.installmentIndex);
      if (!alreadyPaid) {
        userInstallment.payments.push({
          installmentIndex: order.installmentIndex,
          amount: installment.amount,
          paidAt: new Date(),
          orderId: order.orderId,
          status: 'paid'
        });

        // Update remaining amount
        const totalPaid = userInstallment.payments.reduce((sum, p) => sum + p.amount, 0);
        userInstallment.remainingAmount = userInstallment.planSnapshot.totalAmount - totalPaid;

        if (userInstallment.remainingAmount <= 0) {
          userInstallment.status = 'completed';
        }

        await userInstallment.save();
      }
    } else {
      // Should have been created in makeInstallmentPayment, but create if missing (recovery)
      console.warn(`⚠️ UserInstallment not found for user ${order.userId}, creating from plan...`);
      userInstallment = new UserInstallment({
        userId: order.userId,
        courseId: installmentPlan.courseId,
        installmentPlanId: installmentPlan._id,
        planSnapshot: {
          planType: installmentPlan.planType,
          totalAmount: installmentPlan.totalAmount,
          numberOfInstallments: installmentPlan.numberOfInstallments,
          installments: installmentPlan.installments.map(i => ({ amount: i.amount, dueDate: i.dueDate })) // Map needed fields
        },
        remainingAmount: installmentPlan.totalAmount - installment.amount,
        payments: [{
          installmentIndex: order.installmentIndex,
          amount: installment.amount,
          paidAt: new Date(),
          orderId: order.orderId || `REC-PAY-${Date.now()}`,
          status: 'paid'
        }]
      });
      await userInstallment.save();
    }

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

    // 🔥 UPDATED: Read from UserInstallment
    let userInstallment = await UserInstallment.findOne({ courseId, userId });

    let installments, totalAmount, paidAmount, actualRemainingAmount, planType, numberOfInstallments;

    if (userInstallment) {
      // New Model Logic
      installments = userInstallment.planSnapshot.installments.map((inst, idx) => {
        const payment = userInstallment.payments.find(p => p.installmentIndex === idx);
        return {
          ...inst,
          amount: inst.amount,
          isPaid: !!payment,
          paidOn: payment ? payment.paidAt : null
        };
      });
      totalAmount = userInstallment.planSnapshot.totalAmount;
      paidAmount = userInstallment.payments.reduce((sum, p) => sum + p.amount, 0);
      actualRemainingAmount = userInstallment.remainingAmount;
      planType = userInstallment.planSnapshot.planType;
      numberOfInstallments = userInstallment.planSnapshot.numberOfInstallments;
    } else {
      // Fallback to legacy logic
      const plan = await Installment.findOne({ courseId, userId });

      if (!plan)
        return res.status(404).json({
          message: "No installment plan found for this user and course",
          courseId,
          userId
        });

      installments = plan.installments;
      totalAmount = plan.totalAmount;
      paidAmount = plan.installments
        .filter(inst => inst.isPaid)
        .reduce((sum, inst) => sum + inst.amount, 0); // Note: This legacy calculation is flawed as it sums ALL paid installments, not user specific. 
      // We accept this flaw for legacy data or assume plans were 1:1 in the past (which was the bug)
      actualRemainingAmount = plan.totalAmount - paidAmount;
      planType = plan.planType;
      numberOfInstallments = plan.numberOfInstallments;
    }

    res.status(200).json({
      message: "Outstanding balance retrieved",
      remainingAmount: actualRemainingAmount,
      totalAmount: totalAmount,
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

    // 🔥 NEW: Check UserInstallment model first (Primary Source of Truth)
    try {
      const UserInstallment = require('../models/userInstallmentModel');
      const userInstallment = await UserInstallment.findOne({ courseId, userId });

      if (userInstallment) {
        console.log(`✅ [TIMELINE] Found UserInstallment record for user ${userId} and course ${courseId}`);

        const totalAmount = userInstallment.planSnapshot?.totalAmount || 0;
        // Only count paid payments
        const paidAmount = userInstallment.payments?.reduce((sum, p) => sum + (p.status === 'paid' ? p.amount : 0), 0) || 0;
        const remainingAmount = Math.max(0, totalAmount - paidAmount);

        // Construct timeline
        let lastDueDate = null;
        const timeline = userInstallment.planSnapshot?.installments?.map((inst, index) => {
          const payment = userInstallment.payments?.find(p => p.installmentIndex === index && p.status === 'paid');

          // Calculate specific due date logic to match legacy behavior or use stored date
          let dueDate;
          if (index === 0) {
            dueDate = payment?.paidAt || userInstallment.createdAt || new Date();
          } else {
            const baseDate = lastDueDate || userInstallment.createdAt || new Date();
            dueDate = new Date(baseDate);
            dueDate.setMonth(dueDate.getMonth() + 1);
          }
          lastDueDate = new Date(dueDate);

          return {
            planType: userInstallment.planSnapshot.planType,
            installmentIndex: index,
            dueDate: dueDate,
            amount: inst.amount,
            isPaid: !!payment,
            paidOn: payment?.paidAt || null
          };
        }) || [];

        // Ensure paidAmount is number
        return res.status(200).json({
          message: "Timeline retrieved",
          timeline,
          totalAmount,
          paidAmount,
          remainingAmount
        });
      }
    } catch (err) {
      console.error("Error fetching UserInstallment logic:", err);
      // Fallthrough to legacy logic
    }

    // 🔥 CRITICAL: Check if user is enrolled and get their saved plan from purchasedCourses
    const User = require('../models/userModel');
    const user = await User.findById(userId).select('purchasedCourses');

    let userPurchasedCourse = null;
    let userOriginalInstallments = null;
    let isEnrolledUser = false;

    if (user?.purchasedCourses) {
      userPurchasedCourse = user.purchasedCourses.find((pc) => {
        const pcCourseId = pc.course?.toString?.() || pc.course;
        const currentCourseId = courseId?.toString?.() || courseId;
        return pcCourseId === currentCourseId && pc.paymentType === 'installment';
      });

      if (userPurchasedCourse?.installments && userPurchasedCourse.installments.length > 0) {
        isEnrolledUser = true;
        userOriginalInstallments = userPurchasedCourse.installments;
        console.log(`🔒 User is enrolled - using original plan amounts from purchasedCourses`);
      }
    }

    // 🔥 CRITICAL: Fetch paid orders FIRST to get latest payment status AND planType
    const Order = require('../models/orderModel');
    const paidOrders = await Order.find({
      courseId: courseId,
      userId: userId,
      status: "paid",
      paymentMode: "installment"
    }).sort({ createdAt: 1 });

    // 🔥 CRITICAL: Get planType - PRIORITY: purchasedCourses > first order > any order
    // purchasedCourses.planType is the most reliable source (stored at enrollment)
    let planTypeToUse = null;

    // Priority 1: Get from purchasedCourses (most reliable - stored at enrollment)
    if (userPurchasedCourse?.planType) {
      planTypeToUse = userPurchasedCourse.planType;
      console.log(`✅ [TIMELINE] Using planType from purchasedCourses: ${planTypeToUse}`);
    }

    // Priority 2: Get from first paid order (enrollment order)
    let enrollmentOrderPlanType = null;
    if (paidOrders.length > 0) {
      // Find the first order (enrollment order) - should be installmentIndex 0
      const enrollmentOrder = paidOrders.find(order =>
        order.installmentDetails?.installmentIndex === 0
      ) || paidOrders[0]; // Fallback to first order if no index 0 found

      enrollmentOrderPlanType = enrollmentOrder.planType;
      if (enrollmentOrderPlanType) {
        console.log(`✅ [TIMELINE] Found planType from enrollment order: ${enrollmentOrderPlanType}`);
      } else {
        console.warn(`⚠️ [TIMELINE] Enrollment order (${enrollmentOrder.orderId}) has no planType`);
      }
    }

    // If purchasedCourses doesn't have planType but order does, update purchasedCourses
    if (!planTypeToUse && enrollmentOrderPlanType && userPurchasedCourse) {
      try {
        const User = require('../models/userModel');
        await User.updateOne(
          {
            _id: userId,
            "purchasedCourses.course": courseId
          },
          {
            $set: {
              "purchasedCourses.$.planType": enrollmentOrderPlanType
            }
          }
        );
        planTypeToUse = enrollmentOrderPlanType;
        console.log(`✅ [TIMELINE] Updated missing planType in purchasedCourses: ${planTypeToUse}`);
      } catch (updateError) {
        console.error(`❌ [TIMELINE] Failed to update planType in purchasedCourses:`, updateError);
        planTypeToUse = enrollmentOrderPlanType; // Use order planType anyway
      }
    } else if (!planTypeToUse && enrollmentOrderPlanType) {
      planTypeToUse = enrollmentOrderPlanType;
      console.log(`✅ [TIMELINE] Using planType from enrollment order: ${planTypeToUse}`);
    }

    // Priority 3: Get from any paid order (last resort)
    if (!planTypeToUse && paidOrders.length > 0) {
      for (const order of paidOrders) {
        if (order.planType) {
          planTypeToUse = order.planType;
          console.log(`⚠️ [TIMELINE] Using planType from order ${order.orderId}: ${planTypeToUse} (fallback)`);
          break;
        }
      }
    }

    // Log all orders for debugging
    if (paidOrders.length > 0) {
      console.log(`📋 [TIMELINE] All paid orders planTypes:`, paidOrders.map(o => ({
        orderId: o.orderId,
        planType: o.planType,
        installmentIndex: o.installmentDetails?.installmentIndex,
        createdAt: o.createdAt
      })));
    }

    console.log(`🔍 [TIMELINE] Final planType to use: ${planTypeToUse || 'NOT FOUND - will return error'}`);

    // Create a map of paid installments from orders (most reliable source)
    const paidInstallmentsFromOrders = {};
    paidOrders.forEach(order => {
      if (order.installmentDetails &&
        order.installmentDetails.installmentIndex !== undefined &&
        order.status === "paid" &&
        (order.installmentDetails.isPaid === true || order.installmentDetails.isPaid === undefined)) {
        const idx = order.installmentDetails.installmentIndex;
        paidInstallmentsFromOrders[idx] = {
          isPaid: true,
          paidOn: order.paidAt || order.updatedAt || order.createdAt,
          amount: order.amount / 100, // Convert from paise
          orderId: order.orderId
        };
      }
    });

    // 🔥 CRITICAL: ONLY use the planType from user's order/purchase - NEVER fallback to first plan
    let plan = null;

    if (planTypeToUse) {
      // 🔥 CRITICAL: Use planType from user's purchase to get the correct plan
      plan = await Installment.findOne({
        courseId,
        planType: planTypeToUse
      });
      console.log(`🔍 [TIMELINE] Looking for plan with planType: "${planTypeToUse}"`, plan ? '✅ Found' : '❌ Not found');
      if (plan) {
        console.log(`✅ [TIMELINE] Using plan: ${plan.planType} (${plan.installments?.length || 0} installments)`);
      } else {
        console.error(`❌ [TIMELINE] Plan not found for planType: "${planTypeToUse}" - this should not happen!`);
      }
    } else {
      console.error(`❌ [TIMELINE] planTypeToUse is missing! PurchasedCourse planType: ${userPurchasedCourse?.planType || 'not found'}, Paid orders: ${paidOrders.length}`);
    }

    // 🔥 CRITICAL: Do NOT fallback to first plan - user must have selected a specific plan
    // If plan is not found, return error instead of showing wrong plan
    if (!plan && planTypeToUse) {
      return res.status(404).json({
        message: `Installment plan not found for planType: ${planTypeToUse}. Please contact support.`,
        courseId,
        userId,
        planType: planTypeToUse,
        error: "SELECTED_PLAN_NOT_FOUND"
      });
    }

    // Only allow fallback if user has NO planType at all (should not happen for enrolled users)
    if (!plan && !planTypeToUse) {
      console.error(`❌ [TIMELINE] CRITICAL: User has no planType stored! This indicates a data integrity issue.`);
      // Last resort: Try to find plan with userPayments
      plan = await Installment.findOne({
        courseId,
        "userPayments.userId": userId,
      });
      if (plan) {
        console.log(`⚠️ [TIMELINE] Using plan with userPayments as last resort: ${plan.planType}`);
      } else {
        return res.status(404).json({
          message: "No installment plan found for this course. Please contact support.",
          courseId,
          userId,
          error: "NO_PLAN_FOUND"
        });
      }
    }

    if (!plan) {
      return res.status(404).json({
        message: "No installment plan found for this course",
        courseId,
        userId
      });
    }

    // 🔥 CRITICAL: For enrolled users, use saved plan amounts; for new users, use current plan
    let installmentsToUse = [];
    let totalAmount = 0;
    let actualPlanType = planTypeToUse; // Will be updated if we find a better match

    if (isEnrolledUser && userOriginalInstallments) {
      // Use original plan amounts from purchasedCourses (locked in at enrollment)
      installmentsToUse = userOriginalInstallments.map((inst, idx) => ({
        amount: inst.amount, // Original amount locked in at enrollment
        isPaid: inst.isPaid || false,
        paidOn: inst.paidDate || null,
        installmentNumber: inst.installmentNumber || (idx + 1)
      }));

      // Calculate total from original installments
      totalAmount = userOriginalInstallments.reduce((sum, inst) => sum + inst.amount, 0);
      console.log(`🔒 Using original plan: ${userOriginalInstallments.length} installments, Total: ₹${totalAmount}`);

      // 🔥 CRITICAL: Verify that the plan we fetched matches the amounts in purchasedCourses
      // If amounts don't match, find the correct plan by matching amounts
      if (plan && plan.installments && plan.installments.length > 0) {
        const firstPlanAmount = plan.installments[0]?.amount;
        const firstUserAmount = userOriginalInstallments[0]?.amount;

        // If amounts don't match, the planType might be wrong - find the correct plan
        if (firstPlanAmount !== firstUserAmount) {
          console.warn(`⚠️ [TIMELINE] Plan amounts don't match! Plan has ₹${firstPlanAmount}, User has ₹${firstUserAmount}`);
          console.warn(`⚠️ [TIMELINE] Searching for plan with matching amounts...`);

          // Find all plans for this course
          const allPlans = await Installment.find({ courseId });

          // Find the plan that matches the user's installment amounts
          const matchingPlan = allPlans.find(p => {
            if (!p.installments || p.installments.length !== userOriginalInstallments.length) {
              return false;
            }
            // Check if first installment amount matches
            return p.installments[0]?.amount === firstUserAmount;
          });

          if (matchingPlan) {
            console.log(`✅ [TIMELINE] Found matching plan: ${matchingPlan.planType} (amounts match)`);
            plan = matchingPlan;
            actualPlanType = matchingPlan.planType;

            // 🔥 CRITICAL: Update purchasedCourses with correct planType if it's wrong
            if (userPurchasedCourse && userPurchasedCourse.planType !== matchingPlan.planType) {
              try {
                const User = require('../models/userModel');
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
                console.log(`✅ [TIMELINE] Updated incorrect planType in purchasedCourses: ${userPurchasedCourse.planType} → ${matchingPlan.planType}`);
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
    } else {
      // New user - use current plan from database
      installmentsToUse = plan.installments.map((inst, idx) => ({
        amount: inst.amount,
        isPaid: inst.isPaid || false,
        paidOn: inst.paidOn || null,
        installmentNumber: idx + 1
      }));

      totalAmount = plan.totalAmount || plan.installments.reduce((sum, inst) => sum + inst.amount, 0);
      console.log(`📋 Using current plan: ${plan.installments.length} installments, Total: ₹${totalAmount}`);
    }


    // Calculate paidAmount from paid orders
    const paidAmount = paidOrders.reduce((sum, order) => sum + (order.amount / 100), 0);
    const remainingAmount = Math.max(0, totalAmount - paidAmount);

    let lastDueDate = null;

    const timeline = installmentsToUse.map((installment, index) => {
      const userPayment = plan.userPayments?.find(
        (payment) =>
          payment.userId &&
          payment.userId.toString() === userId &&
          payment.installmentIndex === index
      );

      // 🔥 CRITICAL: Prioritize order data over plan data for payment status
      const orderPayment = paidInstallmentsFromOrders[index];
      const isPaid = orderPayment?.isPaid || installment.isPaid || userPayment?.isPaid || false;
      const paidOn = orderPayment?.paidOn || installment.paidOn || userPayment?.paymentDate || null;

      let dueDate;
      if (index === 0) {
        dueDate = paidOn || new Date();
      } else {
        dueDate = new Date(lastDueDate || new Date());
        dueDate.setMonth(dueDate.getMonth() + 1);
      }

      lastDueDate = new Date(dueDate);

      return {
        planType: actualPlanType || plan.planType, // Use actualPlanType (corrected if needed)
        installmentIndex: index,
        dueDate,
        amount: installment.amount, // 🔒 This is now the original amount for enrolled users
        isPaid,
        paidOn,
      };
    });

    res.status(200).json({
      message: "Timeline retrieved",
      timeline,
      totalAmount,
      paidAmount,
      remainingAmount
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


