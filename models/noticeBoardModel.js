const mongoose = require('mongoose');

const noticeBoardSchema = new mongoose.Schema({
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
    },
    title: {
        type: String,
    },
    content: {
        type: String,
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
    },
    datePosted: {
        type: Date,
        default: Date.now,
    },
    expiryDate: {
        type: Date,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });

// Export the model
const NoticeBoard = mongoose.models.NoticeBoard || mongoose.model("NoticeBoard", noticeBoardSchema);
module.exports = NoticeBoard;
