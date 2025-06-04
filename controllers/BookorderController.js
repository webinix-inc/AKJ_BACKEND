const BookOrder = require("../models/bookorderModel");

const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const generateReceipt = () => `book_rcpt_${Date.now()}`;
const generateTrackingNumber = () =>
  `BOOK-TN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;


exports.createBookOrder = async (req, res) => {
  try {
    const { amount, currency } = req.body;

    if (!amount || !currency) {
      return res.status(400).json({ success: false, message: "Amount and currency are required" });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // convert to paisa
      currency,
      receipt: `book_rcpt_${Date.now()}`,
    });

    if (!order || !order.id) {
      return res.status(500).json({ success: false, message: "Razorpay order creation failed" });
    }

    res.status(200).json({ success: true, data: order });
  } catch (err) {
    console.error("Razorpay order creation error:", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.placeOrder = async (req, res) => {
  try {
    const {
      transactionId,
      orderId,
      user,
      book,
      quantity,
      totalAmount
    } = req.body;

    // ✅ Validate required fields
    if (
      !transactionId ||
      !orderId ||
      !user?.firstName ||
      !user?.lastName ||
      !user?.email ||
      !user?.phone ||
      !user?.address ||
      !user?.country ||
      !user?.region ||
      !user?.city ||
      !user?.postCode ||
      !book?.name ||
      !book?.author ||
      book?.price == null || // allow 0 but not undefined
      !quantity ||
      !totalAmount
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required order fields",
      });
    }

    const newOrder = new BookOrder({
      transactionId,
      orderId, // ✅ this matches schema
      user,
      book,
      quantity,
      totalAmount,
    });

    const savedOrder = await newOrder.save();

    return res.status(201).json({
      success: true,
      message: "Order placed successfully",
      data: savedOrder,
    });
  } catch (err) {
    console.error("❌ Order save error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to save order",
    });
  }
};



// exports.placeOrder = async (req, res) => {
//   try {
//     const {
//       firstName,
//       lastName,
//       email,
//       phone,
//       country,
//       region,
//       city,
//       address,
//       postCode,
//       paymentMethod,
//       quantity,
//       book,
//       amount,
//       currency = "INR",
//     } = req.body;

//     const requiredFields = [
//       "firstName",
//       "lastName",
//       "email",
//       "phone",
//       "country",
//       "region",
//       "city",
//       "address",
//       "postCode",
//       "paymentMethod",
//       "quantity",
//       "book",
//       "amount",
//     ];

//     const missingFields = requiredFields.filter(
//       (field) =>
//         !req.body[field] ||
//         (typeof req.body[field] === "string" && req.body[field].trim() === "")
//     );

//     if (missingFields.length > 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing required fields.",
//         missingFields,
//       });
//     }

//     const totalAmountInPaisa = Math.round(amount * 100);

//     const razorpayOrder = await razorpay.orders.create({
//       amount: totalAmountInPaisa,
//       currency,
//       receipt: generateReceipt(),
//     });

//     const bookOrderData = {
//       firstName,
//       lastName,
//       email,
//       phone,
//       country,
//       region,
//       city,
//       address,
//       postCode,
//       paymentMethod,
//       quantity,
//       book,
//       amount,
//       currency,
//       razorpayOrderId: razorpayOrder.id,
//       trackingNumber: generateTrackingNumber(),
//       status: "created",
//     };

//     const savedOrder = await new BookOrder(bookOrderData).save();

//     res.status(201).json({
//       success: true,
//       message: "Razorpay order created successfully.",
//       razorpayOrder,
//       order: savedOrder,
//     });
//   } catch (error) {
//     console.error("Error placing book order:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to place order.",
//       error: error.message,
//     });
//   }
// };

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
