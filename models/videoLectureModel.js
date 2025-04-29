const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const videoLectureSchema = new Schema({
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
    videoUrl: [{
        type: String,
    }],
}, { timestamps: true });

const VideoLecture = mongoose.model('VideoLecture', videoLectureSchema);

module.exports = VideoLecture;
