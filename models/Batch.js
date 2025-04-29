const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  videoSrc: { type: String, required: true },
});

module.exports = mongoose.model('Batch', batchSchema);
