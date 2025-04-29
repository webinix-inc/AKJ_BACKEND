const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  paymentId: { type: String },
  amount: { type: Number, required: true },
  currency: { type: String, default: "INR" },
  receipt: { type: String },
  planType:{type:String},
  trackingNumber: { type: String },
  status: { type: String, enum: ["created", "paid", "partial", "failed"], default: "created" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  paymentMode: { type: String, enum: ["full", "installment"], required: true },

  // Fields for installment payments
  installmentDetails: {
    installmentIndex: Number,          // Index of the current installment
    totalInstallments: Number,         // Total number of installments in the plan
    installmentAmount: Number,         // Amount per installment
    isPaid: { type: Boolean, default: false }, // Flag to indicate if this installment is paid
  },
}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);

