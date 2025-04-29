const mongoose = require("mongoose");

const LiveClassSchema = new mongoose.Schema({
  title: { type: String, required: true },
  startTime: { type: Date, required: true },
  endDate: { type: Date },
  recordingDownload: { type: Boolean, default: false },
  duration: { type: Number, required: true },
  lang: { type: String, default: "en" },
  timeZoneId: { type: String, default: "Asia/Kolkata" },
  description: { type: String },
  type: { type: String, enum: ["oneTime", "perma"], required: true },
  access: { type: String, enum: ["private", "public"], default: "private" },
  login: { type: Boolean, default: false },
  layout: { type: String, default: "CR" },
  status: { type: String, enum: ["up","lv","down"], default: "up" },
  recording: {
    record: { type: Boolean, default: true },
    autoRecord: { type: Boolean, default: false },
    recordingControl: { type: Boolean, default: true },
  },
  participantControl: {
    write: { type: Boolean, default: false },
    audio: { type: Boolean, default: false },
    video: { type: Boolean, default: false },
  },
  schedule: { type: [Number] }, // For perma class: Days of week
  totalClasses: { type: Number }, // For perma class
  courseIds: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
  ], // Link to the course
  liveLink: { type: String },
  classId: { type: String },
  commonParticipantLink: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("LiveClass", LiveClassSchema);
