const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const fileSchema = require('./fileModel');

const folderSchema = new Schema({
  name: { type: String, required: true },
  parentFolderId: { type: Schema.Types.ObjectId, ref: 'Folder'},
  folders: [{ type: Schema.Types.ObjectId, ref: 'Folder' }], // Subfolders
  files: [{
    type: Schema.Types.ObjectId,
    ref: 'File'
  }], // Files within the folder
  importedQuizzes: [{
    quizId: {
      type: Schema.Types.ObjectId,
      ref: 'Quiz'
    },
    originalFolderId: {
      type: Schema.Types.ObjectId,
      ref: 'QuizFolder'
    },
    importedAt: {
      type: Date,
      default: Date.now
    }
  }],
  QuizFolders: [{ 
    type: Schema.Types.ObjectId, 
    ref: 'QuizFolder' 
  }],
  isDownloadable: { type: Boolean, default: false },
  downloadType: {
    type: String,
    enum: ['web', 'app_pdf', 'app_video', 'both'],
    default: 'web'
  },
  
  // 🔥 NEW: Master Folder System Properties
  isMasterFolder: { type: Boolean, default: false },    // Master folder flag
  isSystemFolder: { type: Boolean, default: false },    // System-protected folder
  isDeletable: { type: Boolean, default: true },        // Can be deleted
  folderType: { 
    type: String, 
    enum: ['master', 'course', 'general', 'system', 'assignments', 'student_assignments'], 
    default: 'general' 
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }, // Creator reference
  systemDescription: { type: String }, // Description for system folders
}, { timestamps: true });

// 🚀 PERFORMANCE INDEXES for Master Folder System
folderSchema.index({ parentFolderId: 1 });
folderSchema.index({ isMasterFolder: 1 });
folderSchema.index({ isSystemFolder: 1 });
folderSchema.index({ folderType: 1 });
folderSchema.index({ isDeletable: 1 });
folderSchema.index({ createdBy: 1 });
folderSchema.index({ createdAt: -1 });
// Compound indexes for common queries
folderSchema.index({ parentFolderId: 1, folderType: 1 });
folderSchema.index({ isSystemFolder: 1, isDeletable: 1 });
folderSchema.index({ isMasterFolder: 1, isSystemFolder: 1 });

// // Assign _id to files subdocuments
// fileSchema.set('toObject', { virtuals: true });
// fileSchema.set('toJSON', { virtuals: true });

// Export the model
module.exports = mongoose.models.Folder || mongoose.model("Folder", folderSchema);