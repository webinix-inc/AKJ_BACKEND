const mongoose = require('mongoose');


const addressSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    fullName: {
        type: String,
    },
    phone: {
        type: String,
    },
    addressLine1: {
        type: String,
    },
    addressLine2: {
        type: String,
    },
    city: {
        type: String,
    },
    state: {
        type: String,
    },
    postalCode: {
        type: String,
    },
    country: {
        type: String,
    },
    isDefault: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });


const Address = mongoose.model('Address', addressSchema);

module.exports = Address;