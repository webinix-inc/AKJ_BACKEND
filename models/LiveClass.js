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
  status: { type: String, enum: ["up","lv","down","scheduled","completed","expired"], default: "up" },
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
  
  // Platform selection (Zoom or MeritHub)
  platform: { 
    type: String, 
    enum: ["zoom", "merithub"], 
    required: true,
    default: "merithub"
  },
  
  // MeritHub specific fields
  liveLink: { type: String }, // Instructor link for "Go Live" button
  instructorLink: { type: String }, // Dedicated instructor link field
  classId: { type: String },
  // Removed commonParticipantLink - we only use individual user links
  
  // Zoom specific fields
  zoomMeetingLink: { type: String },
  zoomMeetingId: { type: String },
  zoomPasscode: { type: String },
  
  actualStartTime: { type: Date }, // When class actually went live
  actualEndTime: { type: Date }, // When class actually ended
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("LiveClass", LiveClassSchema);
