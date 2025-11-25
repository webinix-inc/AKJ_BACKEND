const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const importantLinkSchema = new Schema({
  name: { type: String },
  url: { type: String, required: true },
},{timestamps: true});

// Export the model
module.exports = mongoose.models.ImportantLink || mongoose.model("ImportantLink", importantLinkSchema);