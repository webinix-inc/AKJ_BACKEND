const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema({
    offerName: {
        type: String,
        required: true
    },
    couponCode: {
        type: String,
        required: true,
        unique: true
    },
    couponType: {
        type: String,
        enum: ['Public', 'Private'],
        required: true
    },
    assignedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    courseSelectionType: {
        type: String,
        enum: ['All', 'Specific'],
        required: true
    },
    assignedCourses: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course'
    }],
    usageLimit: {
        type: Number,
        required: true
    },
    isUnlimited: {
        type: Boolean,
        default: false
    },
    usagePerStudent: {
        type: Number,
        required: true
    },
    visibility: {
        type: Boolean,
        default: true
    },
    discountType: {
        type: String,
        enum: ['Flat', 'Percentage'],
        required: true
    },
    discountAmount: {
        type: Number,
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    startTime: {
        type: String,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    endTime: {
        type: String,
        required: true
    },
    isLifetime: {
        type: Boolean,
        default: false
    },
    minimumOrderValue: {
        type: Number,
        required: true
    },
    usageCount: {
        type: Number,
        default: 0
    },
    userUsage: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        usageCount: {
            type: Number,
            default: 0
        }
    }]
}, { timestamps: true });

const Coupon = mongoose.model("Coupon", couponSchema);

module.exports = Coupon;