const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const followUsSchema = new Schema({
    platform: {
        type: String,
        enum: ['YouTube', 'Twitter', 'Instagram', 'LinkedIn']
    },
    url: {
        type: String,
    },
    description: {
        type: String,
    }
}, { timestamps: true });

const FollowUs = mongoose.model('FollowUs', followUsSchema);

module.exports = FollowUs;
