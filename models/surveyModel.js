const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const surveyFormSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'user',
    },
    teacher: {
        type: Schema.Types.ObjectId,
        ref: 'user',
    },
    course: {
        type: Schema.Types.ObjectId,
        ref: 'Course',
    },
    categoryId: {
        type: Schema.Types.ObjectId,
        ref: 'CourseCategory',
    },
    subCategoryId: {
        type: Schema.Types.ObjectId,
        ref: 'subCategory',
    },
    comment: {
        type: String,
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    adminReply: {
        type: String
    }
}, { timestamps: true });

// Export the model
const SurveyForm = mongoose.models.SurveyForm || mongoose.model("SurveyForm", surveyFormSchema);
module.exports = SurveyForm;
