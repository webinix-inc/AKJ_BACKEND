const mongoose = require("mongoose");
const schema = mongoose.Schema;

// SubCategory schema embedded within CourseCategory
const subCategorySchema = new schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    status: {
        type: Boolean,
        default: true, // Active by default
    },
    // Optional array of courses linked to this subcategory
    courses: [{
        type: schema.Types.ObjectId,
        ref: "Course",
    }]
});

const categorySchema = new schema({
    // Name of the category
    name: {
        type: String,
        required: true,
        trim: true,
    },
    // Optional image URL for the category
    image: {
        type: String,
        required: false,
    },
    // Status of the category (true for active, false for inactive)
    status: {
        type: Boolean,
        default: true,
    },
    // Array of embedded SubCategory documents
    subCategories: [subCategorySchema]
}, { timestamps: true });

module.exports = mongoose.model("CourseCategory", categorySchema);
