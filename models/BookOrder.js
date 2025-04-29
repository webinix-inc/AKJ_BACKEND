const mongoose = require("mongoose");

const bookOrderSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: [true, "First name is required."] },
    lastName: { type: String, required: [true, "Last name is required."] },
    email: {
      type: String,
      required: [true, "Email is required."],
      validate: {
        validator: function (v) {
          return /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/.test(v); // Basic email regex
        },
        message: (props) => `${props.value} is not a valid email!`,
      },
    },
    phone: { type: String, required: [true, "Phone number is required."] },
    country: { type: String, required: [true, "Country is required."] },
    region: { type: String, required: [true, "Region is required."] },
    city: { type: String, required: [true, "City is required."] },
    address: { type: String, required: [true, "Address is required."] },
    postCode: { type: String, required: [true, "Postcode is required."] },
    paymentMethod: { type: String, required: [true, "Payment method is required."] },
    quantity: {
      type: Number,
      required: [true, "Quantity is required."],
      min: [1, "Quantity must be at least 1."],
    },
    book: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, "Book details are required."],
    },
    paymentId: { type: String, required: [true, "Payment ID is required."] },
    orderStatus: { type: String, default: "Pending" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BookOrder", bookOrderSchema);