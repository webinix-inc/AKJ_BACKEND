const mongoose = require("mongoose");

const installmentSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
  },
  planType: {
    type: String,
    enum: ["3 months", "6 months", "12 months", "24 months", "custom"],
    required: true,
  },
  numberOfInstallments: {
    type: Number,
    required: true,
  },
  userPayments: [
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      installmentIndex: { type: Number, required: true },
      isPaid: { type: Boolean, default: false },
      paidAmount: { type: Number, required: true },
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

// Compound index for querying user payments quickly within userPayments array
installmentSchema.index({ courseId: 1, "userPayments.userId": 1 });

module.exports = mongoose.model("Installment", installmentSchema);
