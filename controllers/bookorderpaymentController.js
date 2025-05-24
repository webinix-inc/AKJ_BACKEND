const BookPaymentOrder = require("../models/bookorderModel");

// Create a new order
exports.createOrder = async (req, res) => {
  try {
    const order = new BookPaymentOrder(req.body);
    await order.save();
    res
      .status(201)
      .json({ success: true, message: "Order created successfully", order });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create order",
      error: error.message,
    });
  }
};

// Get all orders
exports.getAllOrders = async (req, res) => {
  try {
    const orders = await BookPaymentOrder.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, orders });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
      error: error.message,
    });
  }
};

// Get orders by user ID (assuming user ID is part of the transaction)
exports.getOrdersByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const orders = await BookPaymentOrder.find({ "user.email": userId });

    if (!orders.length) {
      return res
        .status(404)
        .json({ success: false, message: "No orders found for this user" });
    }

    res.status(200).json({ success: true, orders });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch user orders",
      error: error.message,
    });
  }
};

// Delete an order
exports.deleteOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const deletedOrder = await BookPaymentOrder.findOneAndDelete({ orderId });

    if (!deletedOrder) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    res
      .status(200)
      .json({ success: true, message: "Order deleted successfully" });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete order",
      error: error.message,
    });
  }
};
