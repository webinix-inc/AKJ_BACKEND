
const mongoose = require('mongoose');
const courseService = require('./services/courseService');
const Course = require('./models/courseModel');
const Subscription = require('./models/subscriptionModel');
require('dotenv').config();

const runTest = async () => {
    try {
        await mongoose.connect(process.env.DB_URL);
        console.log("Connected to DB");

        // 1. Create a dummy course
        console.log("Creating dummy course...");
        const course = new Course({
            title: "Test Publish Logic " + Date.now(),
            description: ["Test verify publish"],
            isPublished: false,
            // Minimal required fields
            subCategory: new mongoose.Types.ObjectId(), // Fake ID
            category: new mongoose.Types.ObjectId(), // Fake ID
        });
        // Bypass validation for quick test
        await course.save({ validateBeforeSave: false });
        console.log("Course created:", course._id);

        // 2. Try to publish it (should fail)
        console.log("Attempting to publish without subscription...");
        try {
            await courseService.toggleCoursePublishStatus(course._id, true);
            console.error("❌ FAILED: Course was published but should have been blocked!");
        } catch (error) {
            console.log("✅ SUCCESS: Publishing blocked as expected. Error:", error.message);
        }

        // 3. Cleanup
        await Course.deleteOne({ _id: course._id });
        console.log("Cleanup done.");

    } catch (err) {
        console.error("Test Error:", err);
    } finally {
        await mongoose.disconnect();
    }
};

runTest();
