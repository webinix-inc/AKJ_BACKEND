const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const courseSchema = new mongoose.Schema({ title: String });
const subscriptionSchema = new mongoose.Schema({
    name: String,
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' }
}, { strict: false });

const Course = mongoose.model('Course', courseSchema);
const Subscription = mongoose.model('Subscription', subscriptionSchema);
const DB_URL = process.env.DB_URL;

async function debugCourseSubs() {
    try {
        if (!DB_URL) { console.log("No DB URL"); return; }
        await mongoose.connect(DB_URL);

        // 1. Find the "Test" course
        const course = await Course.findOne({ title: 'Test' });
        if (!course) {
            console.log("Could not find course with title 'Test'. Listing all courses:");
            const all = await Course.find({}).select('title');
            all.forEach(c => console.log(`- ${c.title}`));
            return;
        }

        console.log(`Found Course: "${course.title}" (ID: ${course._id})`);

        // 2. Find subscriptions for this course
        const subs = await Subscription.find({ course: course._id });
        console.log(`Found ${subs.length} subscriptions for this course:`);

        subs.forEach(s => {
            console.log(`- Name: "${s.name}" (ID: ${s._id})`);
        });

        // 3. Check for the phantom string specifically in ALL subs
        const phantom = await Subscription.findOne({ name: "Foundation 2 Year Integrated" });
        if (phantom) {
            console.log(`\n!!! PHANTOM FOUND SEPARATELY !!!`);
            console.log(`Name: ${phantom.name}`);
            console.log(`Linked to Course ID: ${phantom.course}`);
            console.log(`(Is this the same course? ${phantom.course?.toString() === course._id.toString()})`);
        } else {
            console.log("\nPhantom string 'Foundation 2 Year Integrated' not found in ANY subscription.");
        }

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.connection.close();
    }
}

debugCourseSubs();
