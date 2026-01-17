const mongoose = require("mongoose");

const userInstallmentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
        required: true,
    },
    installmentPlanId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Installment",
        required: true,
    },
    // Store the plan details at the time of enrollment to preserve history if plan changes
    planSnapshot: {
        planType: String,
        totalAmount: Number,
        numberOfInstallments: Number,
        installments: [{
            amount: Number,
            dueDate: String, // Relative due date description e.g., "DOP + 1 month"
        }]
    },
    status: {
        type: String,
        enum: ["pending", "completed", "defaulted"],
        default: "pending"
    },
    // Track individual payments
    payments: [
        {
            installmentIndex: { type: Number, required: true },
            amount: { type: Number, required: true },
            paidAt: { type: Date, default: Date.now },
            orderId: { type: String }, // Razorpay/Payment Gateway Order ID
            status: { type: String, enum: ["paid", "failed"], default: "paid" }
        },
    ],
    nextDueDate: {
        type: Date
    },
    remainingAmount: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

// Indexes for fast lookup
userInstallmentSchema.index({ userId: 1, courseId: 1 }, { unique: true }); // One active installment plan per user per course
userInstallmentSchema.index({ installmentPlanId: 1 });
userInstallmentSchema.index({ status: 1 });

module.exports = mongoose.models.UserInstallment || mongoose.model("UserInstallment", userInstallmentSchema);
