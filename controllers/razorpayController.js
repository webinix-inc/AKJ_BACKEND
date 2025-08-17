// ============================================================================
// 💳 RAZORPAY CONTROLLER - REFACTORED TO USE PAYMENT SERVICE
// ============================================================================
// 
// This controller now uses paymentService.js for all business logic,
// maintaining the same API contracts and behavior while eliminating
// code duplication and improving maintainability.
//
// All core business logic has been moved to services/paymentService.js
// This controller focuses purely on HTTP request/response handling.
//
// ============================================================================

const paymentService = require("../services/paymentService");
const { logger } = require("../utils/logger");

// 🔹 Razorpay Order Creation API
exports.createOrder = async (req, res) => {
  try {
    const orderData = req.body;

    // Call payment service to handle business logic
    const result = await paymentService.createRazorpayOrderLogic(orderData);

    // 🚀 LOG PAYMENT ORDER CREATION SUCCESS
    logger.userActivity(
      orderData.userId || 'Unknown',
      orderData.userEmail || orderData.userPhone || 'Unknown User',
      'PAYMENT_ORDER_CREATED',
      `Amount: ₹${orderData.amount}, Course: ${orderData.courseId || 'N/A'}, OrderID: ${result.internalOrder.orderId}, TrackingID: ${result.trackingNumber}, IP: ${req.ip}`
    );

    return res.status(201).json({ 
      success: true, 
      order: result.internalOrder,
      razorpayOrder: result.razorpayOrder,
      trackingNumber: result.trackingNumber
    });
  } catch (error) {
    // 🚀 LOG PAYMENT ORDER CREATION ERROR
    logger.error(error, 'PAYMENT_ORDER_CREATE', `UserID: ${orderData?.userId}, Amount: ${orderData?.amount}, Course: ${orderData?.courseId}`);
    
    // Handle specific business logic errors
    if (error.message.includes("required") || 
        error.message.includes("not found") ||
        error.message.includes("already exists")) {
      return res.status(400).json({
          success: false,
        message: error.message,
      });
    }

    if (error.message.includes("Installment plan not found")) {
      return res.status(404).json({
            success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error creating order",
    });
  }
};

// 🔹 Webhook Handler
exports.handleWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const body = req.body;

    // Call payment service to handle webhook business logic
    const result = await paymentService.handlePaymentWebhookLogic({
      signature,
      body
    });

    // 🚀 LOG PAYMENT WEBHOOK SUCCESS
    logger.userActivity(
      result.userId || 'System',
      result.userEmail || 'Payment Webhook',
      'PAYMENT_WEBHOOK_PROCESSED',
      `Event: ${result.event}, PaymentID: ${result.paymentId}, OrderID: ${result.orderId || 'N/A'}, Status: ${result.status || 'N/A'}, IP: ${req.ip}`
    );

    return res.status(200).json({ 
      success: true, 
      message: "Webhook processed successfully",
      event: result.event,
      paymentId: result.paymentId
    });
  } catch (error) {
    // 🚀 LOG PAYMENT WEBHOOK ERROR
    logger.error(error, 'PAYMENT_WEBHOOK', `Event: ${body?.event}, PaymentID: ${body?.payload?.payment?.entity?.id}, IP: ${req.ip}`);
    
    if (error.message.includes("Invalid webhook signature")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Webhook internal error",
    });
  }
};

// 🔹 Signature Verification Endpoint (Frontend calls this after payment)
exports.verifySignature = async (req, res) => {
  try {
    const signatureData = req.body;

    // Call payment service to handle signature verification business logic
    const result = await paymentService.verifyPaymentSignatureLogic(signatureData);

    // 🚀 LOG PAYMENT VERIFICATION SUCCESS
    logger.userActivity(
      result.order?.userId || signatureData?.userId || 'Unknown',
      result.order?.userEmail || 'Unknown User',
      'PAYMENT_VERIFIED',
      `OrderID: ${result.order?.orderId}, PaymentID: ${signatureData?.razorpayPaymentId}, Amount: ₹${result.order?.amount}, Verified: ${result.verified}, IP: ${req.ip}`
    );

    return res.status(200).json({ 
      success: true, 
      message: result.message,
      order: result.order,
      verified: result.verified
    });
  } catch (error) {
    // 🚀 LOG PAYMENT VERIFICATION ERROR
    logger.error(error, 'PAYMENT_VERIFICATION', `PaymentID: ${signatureData?.razorpayPaymentId}, OrderID: ${signatureData?.razorpayOrderId}, IP: ${req.ip}`);
    
    if (error.message.includes("Invalid payment signature")) {
      return res.status(400).json({ 
        success: false, 
        message: error.message 
      });
    }

    if (error.message.includes("Order not found")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Verification error",
    });
  }
};

// 🔹 Get Order Status
exports.getOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Call payment service to get order status
    const order = await paymentService.getOrderStatusLogic(orderId);

    return res.status(200).json({
      success: true,
      order
    });
  } catch (error) {
    console.error("Error in getOrderStatus controller:", error.message);
    
    if (error.message.includes("Order not found")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error fetching order status",
    });
  }
};

// 🔹 Get User Orders
exports.getUserOrders = async (req, res) => {
  try {
    const { userId } = req.params;
    const options = req.query;

    // Call payment service to get user orders
    const result = await paymentService.getUserOrdersLogic(userId, options);

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error("Error in getUserOrders controller:", error.message);
    
    return res.status(500).json({
      success: false,
      message: "Error fetching user orders",
    });
  }
};

// 🔹 Calculate Payment Charges
exports.calculateCharges = async (req, res) => {
  try {
    const { basePrice, ...options } = req.body;

    if (!basePrice || basePrice <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid base price is required",
      });
    }

    // Call payment service to calculate charges
    const calculation = paymentService.calculatePaymentChargesLogic(basePrice, options);

    return res.status(200).json({
      success: true,
      calculation
    });
  } catch (error) {
    console.error("Error in calculateCharges controller:", error.message);
    
    if (error.message.includes("must be between")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error calculating charges",
    });
  }
};