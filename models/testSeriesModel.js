const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const testSeriesSchema = new Schema({
    courseId: {
        type: Schema.Types.ObjectId,
        ref: 'Course',
    },
    categoryId: {
        type: Schema.Types.ObjectId,
        ref: "CourseCategory"
    },
    subCategoryId: {
        type: Schema.Types.ObjectId,
        ref: "subCategory"
    },
    title: {
        type: String,
    },
    description: {
        type: String,
    },
    documents: [{
        type: String,
    }],

}, { timestamps: true });

testSeriesSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

// Export the model
const TestSeries = mongoose.models.TestSeries || mongoose.model("TestSeries", testSeriesSchema);
module.exports = TestSeries;
