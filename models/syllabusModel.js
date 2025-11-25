const mongoose = require('mongoose');

const syllabusSchema = new mongoose.Schema({
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
    },
    title: {
        type: String,
    },
    document: {
        type: String,
    }
}, { timestamps: true });

// Export the model
const Syllabus = mongoose.models.Syllabus || mongoose.model("Syllabus", syllabusSchema);
module.exports = Syllabus;
