const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const examScheduleSchema = new Schema({
    courseId: {
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
    title: {
        type: String,
    },
    description: {
        type: String,
    },
    examDate: {
        type: Date,
    },
    duration: {
        type: Number,
    }
}, { timestamps: true });

// Export the model
const ExamSchedule = mongoose.models.ExamSchedule || mongoose.model("ExamSchedule", examScheduleSchema);
module.exports = ExamSchedule;
