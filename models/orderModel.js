const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  paymentId: { type: String },
  amount: { type: Number, required: true },
  currency: { type: String, default: "INR" },
  receipt: { type: String },
  planType:{type:String},
  installmentPlanId: { type: mongoose.Schema.Types.ObjectId, ref: "Installment" }, // 🔥 NEW: Store selected plan ID
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

// 🚀 PERFORMANCE INDEXES for 2000+ concurrent users
// Single field indexes for frequent queries
orderSchema.index({ orderId: 1 }); // Already unique, but adding for performance
orderSchema.index({ paymentId: 1 });
orderSchema.index({ userId: 1 });
orderSchema.index({ courseId: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentMode: 1 });
orderSchema.index({ createdAt: -1 });

// Compound indexes for complex queries
orderSchema.index({ userId: 1, status: 1 }); // User's orders by status
orderSchema.index({ userId: 1, createdAt: -1 }); // User's order history
orderSchema.index({ courseId: 1, status: 1 }); // Course orders by status
orderSchema.index({ status: 1, paymentMode: 1 }); // Orders by status and payment mode
orderSchema.index({ userId: 1, courseId: 1 }); // User-course combinations

// Export the model
module.exports = mongoose.models.Order || mongoose.model("Order", orderSchema);

