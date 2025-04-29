const BookOrder = require("../models/BookOrder");

exports.placeOrder = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      country,
      region,
      city,
      address,
      postCode,
      paymentMethod,
      quantity,
      book,
      paymentId,
    } = req.body;
    
    console.log("Received fields:", {
      firstName,
      lastName,
      email,
      phone,
      country,
      region,
      city,
      address,
      postCode,
      paymentMethod,
      quantity,
      book,
      paymentId,
    });

    const requiredFields = [
      "firstName",
      "lastName",
      "email",
      "phone",
      "country",
      "region",
      "city",
      "address",
      "postCode",
      "paymentMethod",
      "quantity",
      "book",
      "paymentId",
    ];

    const missingFields = requiredFields.filter(
      (field) => !req.body[field] || (typeof req.body[field] === "string" && req.body[field].trim() === "")
    );

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields.",
        missingFields,
      });
    }

    const newOrder = new BookOrder({
      firstName,
      lastName,
      email,
      phone,
      country,
      region,
      city,
      address,
      postCode,
      paymentMethod,
      quantity,
      book,
      paymentId,
    });

    const savedOrder = await newOrder.save();

    res.status(201).json({
      success: true,
      message: "Order placed successfully.",
      data: savedOrder,
    });
  } catch (err) {
    console.error("Error placing order:", err);

    if (err.name === "ValidationError") {
      const validationErrors = Object.values(err.errors).map((error) => error.message);
      return res.status(400).json({
        success: false,
        message: "Validation error while placing order.",
        errors: validationErrors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to place order. Please try again.",
      error: err.message,
    });
  }
};

// Get all orders
exports.getAllOrders = async (req, res) => {
  try {
    const orders = await BookOrder.find();
    res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch orders.",
      error: err.message,
    });
  }
};

// Get a single order by ID
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await BookOrder.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (err) {
    console.error("Error fetching order:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch order.",
      error: err.message,
    });
  }
};

// Update order status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { orderStatus } = req.body;

    const updatedOrder = await BookOrder.findByIdAndUpdate(
      id,
      { orderStatus },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Order status updated successfully.",
      data: updatedOrder,
    });
  } catch (err) {
    console.error("Error updating order:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update order.",
      error: err.message,
    });
  }
};