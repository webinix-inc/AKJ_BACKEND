const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    quizId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Quiz',
        required: true
    },
    questionType: {
        type: String,
        enum: ['mcq', 'integer', "multiple_choice"],
        required: true
    },
    questionText: {
        type: String,
        default: ''
    },
    questionImage: [{
        type: String,
        default: null
    }],
    options: [{
        optionText: String,
        isCorrect: Boolean
    }],
    solution: {
        type: String,
        default: ''
    },
    questionCorrectMarks: {
        type: Number,
        required: true
    },
    questionIncorrectMarks: {
        type: Number,
        default: 0
    },
    uploadedFromWord: {
        type: Boolean,
        default: false
    },
    tables: [{
        type: String
    }],
    // 🔧 NEW: Parts array for mixed text and LaTeX math content
    parts: [{
        kind: {
            type: String,
            enum: ['text', 'math'],
            required: true
        },
        content: {
            type: String,
            required: true  // LaTeX when kind==='math'
        }
    }]
}, { timestamps: true });


questionSchema.index({ quizId: 1 });
questionSchema.index({ questionType: 1 });

questionSchema.index({ quizId: 1, _id: 1 });

const Question = mongoose.model('Question', questionSchema);

module.exports = Question;
