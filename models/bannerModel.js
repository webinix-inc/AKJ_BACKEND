const mongoose = require("mongoose");

const bannerSchema = new mongoose.Schema({
    course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
    },
    subscription: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'subscription',
    },
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
    },
    title: {
        type: String,
    },
    image: {
        type: String,
    },
    description: {
        type: String,
    },
    link: {
        type: String,
    },
    code: {
        type: String
    },
    linktoredirect: {
        type: String
    },
    externallink: {
        type: String
    },
    discountPercentage: {
        type: Number,
    },
    validFrom: {
        type: Date,
    },
    validTo: {
        type: Date,
    },

});

module.exports = mongoose.model("Banner", bannerSchema);