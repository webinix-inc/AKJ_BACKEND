const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { deleteFilesFromBucket } = require('../configs/aws.config'); // Import the deleteFilesFromBucket function
const authConfig = require('../configs/auth.config'); // Ensure authConfig has your bucket name

const subjectSchema = new Schema({
    name: {
        type: String,
        unique: true,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    professor: {
        type: String
    },
    duration: {
        type: String
    },
    courseId: {
        type: Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    chapters: [{
        name: {
            type: String,
            required: true
        },
        description: String,
        videos: [{
            title: String,
            url: String, // Video file URL
            duration: String,
            description: String
        }],
        notes: [{
            title: String,
            content: String,
            fileUrl: String // Note file (PDF, DOC, etc.)
        }]
    }],
}, { timestamps: true });

// Pre-hook for deleting media files from S3 when a subject is deleted
subjectSchema.pre('findOneAndDelete', async function (next) {
    const subject = await this.model.findOne(this.getFilter());

    if (subject) {
        const mediaFiles = [];
        
        // Collect media files from chapters (videos and notes)
        subject.chapters.forEach((chapter) => {
            chapter.videos.forEach((video) => {
                if (video.url) mediaFiles.push(video.url);
            });
            chapter.notes.forEach((note) => {
                if (note.fileUrl) mediaFiles.push(note.fileUrl);
            });
        });

        // If media files exist, delete them from the S3 bucket
        if (mediaFiles.length > 0) {
            await deleteFilesFromBucket(authConfig.s3_bucket, mediaFiles);
        }
    }

    next();
});

// Export the model
module.exports = mongoose.models.Subject || mongoose.model("Subject", subjectSchema);
