const cron = require("node-cron");
const removeExpiredCourses = require("./removeExpiredCourses");

let courseExpiryJob = null;

const startCourseExpiryCron = () => {
    if (courseExpiryJob) {
        console.log("✅ Course expiry cron job is already running");
        return;
    }

    // 📌 Runs every day at midnight (UTC) - Adjust if needed
    courseExpiryJob = cron.schedule("0 0 * * *", async () => {
        console.log("⏳ Running course expiry check...");
        await removeExpiredCourses();
    }, {
        timezone: "UTC"
    });

    console.log("✅ Course expiry cron job started");
};

const stopCourseExpiryCron = () => {
    if (courseExpiryJob) {
        courseExpiryJob.stop();
        courseExpiryJob = null;
        console.log("❌ Course expiry cron job stopped");
    }
};

module.exports = { startCourseExpiryCron, stopCourseExpiryCron };
