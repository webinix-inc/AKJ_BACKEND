const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
    {
        sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
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
              return !this.receiver;
            },
          },
        content: { type: String, required: true },
        isRead: { type: Boolean, default: false },
        // timestamp: { type: Date, default: Date.now()},
        isBroadcast: { 
            type: Boolean, 
            default: false },
    },
    { timestamps: true },
   
);
const Chat = mongoose.model("Chat", messageSchema);


messageSchema.index({ receiver: 1 });
messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
messageSchema.index({ groupId: 1 });
messageSchema.index({ isBroadcast: 1 });


module.exports =Chat;