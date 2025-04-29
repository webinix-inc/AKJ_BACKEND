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
  }
});

// // Assign _id to files subdocuments
// fileSchema.set('toObject', { virtuals: true });
// fileSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Folder', folderSchema);