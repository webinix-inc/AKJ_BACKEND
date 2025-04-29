const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const recordingSchema = new Schema({
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
    recordingUrl: [{
        type: String,
    }]
}, { timestamps: true });

const Recording = mongoose.model('Recording', recordingSchema);

module.exports = Recording;
