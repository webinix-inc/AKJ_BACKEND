const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const courseSchema = new mongoose.Schema({ title: String }, { strict: false });
const subscriptionSchema = new mongoose.Schema({
    name: String,
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' }
}, { strict: false });

const Course = mongoose.model('Course', courseSchema);
const Subscription = mongoose.model('Subscription', subscriptionSchema);
const DB_URL = process.env.DB_URL;

async function forceCleanup() {
    try {
        if (!DB_URL) { console.log("No DB URL"); return; }
        await mongoose.connect(DB_URL);

        console.log("Searching for course 'Test'...");
        // Regex for Test, case insensitive
        const courses = await Course.find({ title: { $regex: 'Test', $options: 'i' } });

        if (courses.length === 0) {
            console.log("No course found with 'Test' in title.");
            return;
        }

        for (const c of courses) {
            console.log(`Checking Course: "${c.title}" (ID: ${c._id})`);
            const subs = await Subscription.find({ course: c._id });

            if (subs.length === 0) {
                console.log("  - No associated subscriptions.");
            } else {
                console.log(`  - Found ${subs.length} subscriptions:`);
                for (const s of subs) {
                    console.log(`    * Name: "${s.name}" (ID: ${s._id})`);
                    if (s.name === "Foundation 2 Year Integrated" || s.name.includes("Foundation")) {
                        console.log(`    !!! DELETING PHANTOM SUBSCRIPTION !!!`);
                        await Subscription.deleteOne({ _id: s._id });
                        console.log("    Deleted.");
                    }
                }
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.connection.close();
    }
}

forceCleanup();
