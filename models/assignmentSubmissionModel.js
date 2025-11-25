const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const assignmentSubmissionSchema = new Schema({
  // Student Information
  student: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Course Information (using rootFolder ID to identify course)
  courseRootFolder: {
    type: Schema.Types.ObjectId,
    ref: 'Folder',
    required: true
  },
  
  // Assignment Details
  assignmentTitle: {
    type: String,
    required: true,
    trim: true
  },
  
  assignmentDescription: {
    type: String,
    trim: true
  },
  
  // Submitted Files (stored in course folder structure)
  submittedFiles: [{
    fileId: {
      type: Schema.Types.ObjectId,
      ref: 'File',
      required: true
    },
    fileName: {
      type: String,
      required: true
    },
    fileUrl: {
      type: String,
      required: true
    },
    fileType: {
      type: String,
      enum: ['video', 'pdf', 'youtube', 'document', 'image', 'other'],
      required: true
    },
    fileSize: {
      type: Number // in bytes
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Submission Status
  submissionStatus: {
    type: String,
    enum: ['submitted', 'reviewed', 'graded'],
    default: 'submitted'
  },
  
  // Admin Review
  adminReview: {
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewDate: {
      type: Date
    },
    comments: {
      type: String
    },
    grade: {
      type: String
    }
  },
  
  // Student Notes
  studentNotes: {
    type: String,
    trim: true
  }
  
}, { 
  timestamps: true 
});

// Indexes for better performance
assignmentSubmissionSchema.index({ student: 1, courseRootFolder: 1 });
assignmentSubmissionSchema.index({ courseRootFolder: 1, createdAt: -1 });
assignmentSubmissionSchema.index({ submissionStatus: 1 });
assignmentSubmissionSchema.index({ createdAt: -1 });

// Export the model
module.exports = mongoose.models.AssignmentSubmission || mongoose.model("AssignmentSubmission", assignmentSubmissionSchema);
