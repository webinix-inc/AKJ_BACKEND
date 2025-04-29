const mongoose = require('mongoose');

const scorecardSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    quizId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quiz',
        required: true
    },
    startTime: {
        type: Date,
        required: true
    },
    expectedEndTime: {
        type: Date,
        required: true
    },
    endTime: {
        type: Date
    },
    totalMarks: {
        type: Number,
        required: true
    },
    score: {
        type: Number,
        default: 0
    },
    answers: [{
        questionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Question',
            required: true
        },
        selectedOptions: [{
            type: mongoose.Schema.Types.ObjectId
        }],
        isCorrect: {
            type: Boolean,
            required: true
        },
        marks: {
            type: Number,
            required: true
        },
        answeredAt: {
            type: Date,
            default: Date.now
        }
    }],
    correctQuestions: {
        type: Number,
        default: 0
    },
    incorrectQuestions: {
        type: Number,
        default: 0
    },
    completed: {
        type: Boolean,
        default: false
    },
    autoSubmitted: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['in-progress', 'completed', 'auto-submitted'],
        default: 'in-progress'
    }
}, { timestamps: true });

scorecardSchema.index({ userId: 1, quizId: 1 });
scorecardSchema.index({ quizId: 1 });
scorecardSchema.index({ expectedEndTime: 1 });
scorecardSchema.index({ status: 1 });

scorecardSchema.methods.calculateScore = function() {
    this.score = this.answers.reduce((total, answer) => total + answer.marks, 0);
    this.correctQuestions = this.answers.filter(answer => answer.isCorrect).length;
    this.incorrectQuestions = this.answers.length - this.correctQuestions;
};

const Scorecard = mongoose.model('Scorecard', scorecardSchema);

module.exports = Scorecard;