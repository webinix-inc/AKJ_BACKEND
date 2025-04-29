const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return !this.groupId;  // Receiver is required if groupId is not present
      },
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group", 
      required: function () {
        return !this.receiver;  // Group ID is required if no receiver is present
      },
    },
    content: { 
      type: String, 
      required: true 
    },
    isRead: { 
      type: Boolean, 
      default: false 
    },
    isBroadcast: { 
      type: Boolean, 
      default: false },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
    timestamp: { 
      type: Date, 
      default: Date.now },
  },
  { timestamps: true }
);

messageSchema.index({ receiver: 1 });
messageSchema.index({ sender: 1, receiver: 1, timestamp: -1 });
messageSchema.index({ groupId: 1 });
messageSchema.index({ isBroadcast: 1 });


const Chat = mongoose.models.Chat || mongoose.model("Chat", messageSchema);

module.exports = Chat;
