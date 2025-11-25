const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema(
  {
    groupName: { 
      type: String, 
      required: true,
      unique: true
    },
    members: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User" }],
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

groupSchema.index({ members: 1 });
groupSchema.index({ admin: 1 });


// Export the model
module.exports = mongoose.models.Group || mongoose.model("Group", groupSchema);
