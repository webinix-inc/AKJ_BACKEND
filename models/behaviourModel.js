const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const behaviorNoteSchema = new Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
    },
    teacher: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
    },
    name: {
        type: String,
        required: true
    },
    class: {
        type: String,
        required: true
    },
    rollNo: {
        type: String,
        required: true
    },
    image: {
        type: String,
        default: null
    },
    behaviorNote: {
        type: String,
        required: true
    }
}, { timestamps: true });

// Export the model
const BehaviorNote = mongoose.models.BehaviorNote || mongoose.model("BehaviorNote", behaviorNoteSchema);
module.exports = BehaviorNote;
