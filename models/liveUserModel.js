const mongoose = require("mongoose");

const LiveUserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  title: { type: String },
  img: {
    type: String,
    default: "https://hst.meritgraph.com/theme/img/png/avtr.png",
  },
  desc: { type: String },
  lang: { type: String, default: "en" },
  clientUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    unique: true,
    required: true,
  }, // Linking to UserModel's _id
  email: { type: String, unique: true, required: true },
  role: { type: String, enum: ["C", "M"], required: true, default: "M" },
  timeZone: { type: String, default: "Asia/Kolkata" },
  permission: {
    type: String,
    enum: ["CC", "CJ"],
    required: true,
    default: "CJ",
  },
  merithubUserId: { type: String, unique: true, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Export the model
module.exports = mongoose.models.LiveUser || mongoose.model("LiveUser", LiveUserSchema);
