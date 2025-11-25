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

  // Plan type validation
  const validPlanTypes = ["3 months", "6 months", "12 months", "24 months", "36 months", "48 months", "60 months"];
  if (planType && !validPlanTypes.includes(planType)) {
    errors.push(`planType must be one of: ${validPlanTypes.join(', ')}`);
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
    if (!discount || discount === 0) {
      const validityData = subscription.validities?.find(v => `${v.validity} months` === planType);
      finalDiscount = validityData?.discount || 0;
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

    // Validate maximum installments based on plan duration
    const maxInstallments = {
      "3 months": 3,
      "6 months": 6, 
      "12 months": 12,
      "24 months": 24,
      "36 months": 36,
      "48 months": 48,
      "60 months": 60
    };

    if (numberOfInstallments > maxInstallments[planType]) {
      return res.status(400).json({
        message: `Maximum ${maxInstallments[planType]} installments allowed for ${planType} plan`,
        maxAllowed: maxInstallments[planType],
        requested: numberOfInstallments
      });
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

    const installments = await Installment.find({ courseId }).sort({ createdAt: -1 });
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
        // Check if order belongs to this plan (by matching installmentIndex and courseId)
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

    // Re-fetch installments to get updated data
    const updatedInstallments = await Installment.find({ courseId }).sort({ createdAt: -1 });

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

    // Update installment plan with user ID if not set
    if (!installmentPlan.userId) {
      installmentPlan.userId = userId;
      await installmentPlan.save();
    }

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

    // 🚀 LOG INSTALLMENT PAYMENT CONFIRMATION SUCCESS
    logger.userActivity(
      order.userId,
      'Installment Payment',
      'INSTALLMENT_PAYMENT_CONFIRMED',
      `Amount: ₹${installment.amount}, Course: ${installmentPlan.courseId}, Plan: ${installmentPlan.planType}, Installment: ${order.installmentIndex + 1}/${installmentPlan.installments.length}, OrderID: ${order.orderId}, Status: ${installmentPlan.status}, Remaining: ₹${installmentPlan.remainingAmount}, IP: ${req.ip}`
    );

    res.status(200).json({ message: "Installment payment confirmed" });
  } catch (error) {
    // 🚀 LOG INSTALLMENT PAYMENT CONFIRMATION ERROR
    logger.error(error, 'INSTALLMENT_PAYMENT_CONFIRMATION', `Event: ${req.body?.event}, OrderID: ${req.body?.payload?.payment?.entity?.order_id}, IP: ${req.ip}`);
    
    res.status(500).json({ 
      message: "Webhook processing error", 
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

    const plan = await Installment.findOne({ courseId, userId });

    if (!plan)
      return res.status(404).json({ 
        message: "No installment plan found for this user and course",
        courseId,
        userId
      });

    // Calculate actual remaining amount
    const paidAmount = plan.installments
      .filter(inst => inst.isPaid)
      .reduce((sum, inst) => sum + inst.amount, 0);
    const actualRemainingAmount = plan.totalAmount - paidAmount;

    res.status(200).json({
      message: "Outstanding balance retrieved",
      remainingAmount: actualRemainingAmount,
      totalAmount: plan.totalAmount,
      paidAmount,
      installments: plan.installments,
      planType: plan.planType,
      numberOfInstallments: plan.numberOfInstallments
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

    // Try to find plan with userPayments first, then fallback to general plan
    let plan = await Installment.findOne({
      courseId,
      "userPayments.userId": userId,
    });

    // Fallback: look for any plan for this course if user-specific not found
    if (!plan) {
      plan = await Installment.findOne({ courseId });
    }

    if (!plan) {
      return res.status(404).json({
        message: "No installment plan found for this course",
        courseId,
        userId
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
