const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true,
    },
    course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
    },
    liveClass: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LiveClass',
    },
    liveClassId: {
        type: String, // MeritHub classId
    },
    date: {
        type: Date,
        default: Date.now,
    },
    status: {
        type: String,
        enum: ['Present', 'Absent'],
        default: 'Present',
    },
    // Live class attendance tracking
    joinTime: {
        type: Date, // When student joined the class
    },
    leaveTime: {
        type: Date, // When student left the class
    },
    duration: {
        type: Number, // Duration in minutes
        default: 0,
    },
    attendancePercentage: {
        type: Number, // Percentage of class duration attended
        default: 0,
    },
    // MeritHub specific data
    merithubUserId: {
        type: String, // MeritHub user ID for tracking
    },
    role: {
        type: String, // Role in class: "host", "participant", etc.
    },
    userType: {
        type: String, // User type: "mu", "su", etc.
    },
    analytics: {
        type: mongoose.Schema.Types.Mixed, // Store analytics data from MeritHub
    },
}, { timestamps: true });

// Export the model
const Attendance = mongoose.models.Attendance || mongoose.model("Attendance", attendanceSchema);
module.exports = Attendance;
