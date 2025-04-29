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
    }]
}, { timestamps: true });


questionSchema.index({ quizId: 1 });
questionSchema.index({ questionType: 1 });

questionSchema.index({ quizId: 1, _id: 1 });

const Question = mongoose.model('Question', questionSchema);

module.exports = Question;
