const mongoose = require("mongoose");

const userSubscriptionSchema = mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
    },
    subscription: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription',
    },
    course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
    },
    purchaseDate: {
        type: Date,
        default: Date.now
    },
    startDate: {
        type: Date,
    },
    endDate: {
        type: Date,
    },
    validityType: {
        type: String,
        enum: ["Month", "Year"]
    },
    validity: {
        type: Number
    },
    price: {
        type: Number
    },
    status: {
        type: String,
        enum: ['Pending', 'Active', 'Inactive', 'Cancelled'],
        default: 'Pending'
    }
}, { timestamps: true });

// Export the model
module.exports = mongoose.models.UserSubscription || mongoose.model("UserSubscription", userSubscriptionSchema);
