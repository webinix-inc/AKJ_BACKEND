const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const fileSchema = new Schema({
  name: { type: String },
  // required: true },
  // type: { type: String, enum: ['video', 'pdf'], default: null },
  url: { type: String, required: true },
  description: String,
  isDownloadable: { type: Boolean, default: false },
  downloadType: {
    type: String,
    enum: ['web', 'app_pdf', 'app_video', 'both'],
    default: 'web'
  },
  isViewable: { type: Boolean, default: false },    // true = unlocked (visible to all), false = locked (only for purchased)
});

module.exports = mongoose.model('File', fileSchema);