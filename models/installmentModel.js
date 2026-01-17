const mongoose = require("mongoose");

const installmentSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
  },
  planType: {
    type: String,
    required: true,
  },
  numberOfInstallments: {
    type: Number,
    required: true,
  },
  validityId: {
    type: mongoose.Schema.Types.ObjectId,
    // required: false // Optional for backward compatibility
  },
  // @deprecated - Moved to UserInstallment model. Do not use for new records.
  userPayments: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        // required: true, // Removed required to allow empty array for new plans
      },
      installmentIndex: { type: Number },
      isPaid: { type: Boolean, default: false },
      paidAmount: { type: Number },
      paymentDate: { type: Date },
    },
  ],
  installments: [
    {
      amount: { type: Number, required: true },
      dueDate: { type: String, required: true },
      isPaid: { type: Boolean, default: false },
      paidOn: { type: Date },
    },
  ],
  totalAmount: { type: Number, required: true },
  remainingAmount: { type: Number, default: 0 },
  status: { type: String, enum: ["pending", "completed"], default: "pending" },
});

// 🚀 PERFORMANCE INDEXES for 2000+ concurrent users
// Single field indexes
installmentSchema.index({ courseId: 1 });
installmentSchema.index({ planType: 1 });
installmentSchema.index({ status: 1 });
installmentSchema.index({ "userPayments.userId": 1 });

// Compound indexes for complex queries
installmentSchema.index({ courseId: 1, "userPayments.userId": 1 }); // User payments by course
installmentSchema.index({ courseId: 1, planType: 1 }); // Course plans
installmentSchema.index({ status: 1, courseId: 1 }); // Status by course
installmentSchema.index({ "userPayments.userId": 1, "userPayments.isPaid": 1 }); // User payment status

// Export the model
module.exports = mongoose.models.Installment || mongoose.model("Installment", installmentSchema);
