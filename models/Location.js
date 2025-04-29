const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const locationSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true }, // e.g., "Home", "Work"
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    country: { type: String, required: true },
    region: { type: String, required: true },
    city: { type: String, required: true },
    postCode: { type: String, required: true },
}, { timestamps: true });

const Location = mongoose.model("Location", locationSchema);
module.exports = Location;