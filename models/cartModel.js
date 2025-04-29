const mongoose = require("mongoose");

const cartProductsSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product"
    },
    vendorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    size: {
        type: String
    },
    quantity: {
        type: Number,
        default: 1
    },
    price: {
        type: Number,
        default: 0,
    },
    totalAmount: {
        type: Number,
        default: 0,
    }
}, { _id: true })

const CartSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    products: {
        type: [cartProductsSchema]
    },
    coupon: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Coupon",
        default: null,
    },
    wallet: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserWallet',
    },
    walletUsed: {
        type: Boolean,
        default: false
    },
    shippingPrice: {
        type: Number,
        default: 0,
    },
    totalPaidAmount: {
        type: Number
    }

}, {
    timestamps: true
})

module.exports = mongoose.model("Cart", CartSchema)