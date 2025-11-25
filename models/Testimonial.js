const mongoose = require('mongoose');

const testimonialSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true }, // Ensure one testimonial per user
  name: { type: String, required: true },
  text: { type: String, required: true },
  imageUrl: { type: String},
  isVisible: { type: Boolean, default: true },
}, { timestamps: true });

// Export the model
const Testimonial = mongoose.models.Testimonial || mongoose.model("Testimonial", testimonialSchema);
module.exports = Testimonial;