const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
    course: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true,
    }],
    title: {
        type: String,
        required: true,
    },
    date: {
        type: Date,
        required: true,
    },
    startTime: {
        type: String,
        required: true,
    },
    endTime: {
        type: String,
        required: true,
    },
    duration: {
        type: Number,
    },
    description: {
        type: String,
    },
    meetingLink: {
        type: String,
    },
    teachers: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    status: {
        type: String,
        enum: ['scheduled', 'live', 'completed', 'cancelled'],
        default: 'scheduled',
    },
}, { timestamps: true });

const Schedule = mongoose.model('Schedule', scheduleSchema);

module.exports = Schedule;
