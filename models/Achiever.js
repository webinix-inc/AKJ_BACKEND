const mongoose = require("mongoose");

const achieverSchema = new mongoose.Schema({
  photos: [String],
  year: Number,  
  id: String,
});

// Export the model
const Achiever = mongoose.models.Achiever || mongoose.model("Achiever", achieverSchema);
module.exports = Achiever;
