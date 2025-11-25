const mongoose = require("mongoose");

const wishlistSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  courses: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
    },
  ],
});

// Export the model
const Wishlist = mongoose.models.Wishlist || mongoose.model("Wishlist", wishlistSchema);
module.exports = Wishlist;
