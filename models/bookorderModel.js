const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  transactionId: { type: String, required: true },
  orderId: { type: String, required: true, unique: true },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  user: {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    country: { type: String, required: true },
    region: { type: String, required: true },
    city: { type: String, required: true },
    postCode: { type: String, required: true },
  },
  book: {
    name: { type: String, required: true },
    author: { type: String, required: true },
    price: { type: Number, required: true },
    imageUrl: { type: String, default: "" },
  },
  quantity: { type: Number, required: true, min: 1 },
  totalAmount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Export the model
module.exports =
  mongoose.models.BookPaymentOrder ||
  mongoose.model("BookPaymentOrder", orderSchema);
