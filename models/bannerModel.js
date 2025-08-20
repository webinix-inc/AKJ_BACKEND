const mongoose = require("mongoose");

const bannerSchema = new mongoose.Schema({
    // 📝 Name of the banner
    name: {
        type: String,
        required: true,
        trim: true
    },
    
    // 📚 Associated course (optional)
    course: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        default: null
    },
    
    // ⏰ Time period for the banner (e.g., "Jan 2025 - Mar 2025", "Valid till 31st Dec")
    timePeriod: {
        type: String,
        trim: true,
        default: ""
    },
    
    // 🔗 External link where banner should redirect
    externalLink: {
        type: String,
        trim: true,
        default: ""
    },
    
    // 🖼️ Banner image stored in S3
    image: {
        type: String,
        required: true
    }
}, {
    timestamps: true // Automatically add createdAt and updatedAt
});

module.exports = mongoose.model("Banner", bannerSchema);