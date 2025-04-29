const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const importantLinkSchema = new Schema({
  name: { type: String },
  url: { type: String, required: true },
},{timestamps: true});

module.exports = mongoose.model('ImportantLink', importantLinkSchema);