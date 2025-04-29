const User = require("../models/userModel");

const removeExpiredCourses = async () => {
    try {
        console.log("🕒 Running course expiry check...");

        // Find users with expired admin-assigned courses
        const users = await User.find({
            "purchasedCourses.expiresAt": { $lte: new Date() }
        });

        if (users.length === 0) {
            console.log("✅ No expired courses found.");
            return;
        }

        let updatedCount = 0;

        for (const user of users) {
            const beforeCount = user.purchasedCourses.length;

            // Remove only expired admin-assigned courses
            user.purchasedCourses = user.purchasedCourses.filter(pc => 
                !pc.expiresAt || pc.expiresAt > new Date()
            );

            if (beforeCount !== user.purchasedCourses.length) {
                await user.save();
                updatedCount++;
            }
        }

        console.log(`✅ Removed expired course access from ${updatedCount} users.`);
    } catch (error) {
        console.error("❌ Error removing expired courses:", error);
    }
};

module.exports = removeExpiredCourses;
