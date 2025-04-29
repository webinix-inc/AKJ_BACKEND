const mongoose = require("mongoose");

const achieverSchema = new mongoose.Schema({
  photos: [String],
  year: Number,  
  id: String,
});

const Achiever = mongoose.model("Achiever", achieverSchema);

module.exports = Achiever;
