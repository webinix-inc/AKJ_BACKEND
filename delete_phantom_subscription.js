const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const subscriptionSchema = new mongoose.Schema({
    name: String,
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' }
}, { strict: false });

const Subscription = mongoose.model('Subscription', subscriptionSchema);
const DB_URL = process.env.DB_URL;

async function deletePhantom() {
    try {
        if (!DB_URL) { console.log("No DB URL"); return; }
        await mongoose.connect(DB_URL);

        const phantomName = "Foundation 2 Year Integrated";
        console.log(`Searching for: "${phantomName}"`);

        // Find first to log it
        const found = await Subscription.find({ name: phantomName });

        if (found.length > 0) {
            console.log(`Found ${found.length} records. Deleting...`);
            const result = await Subscription.deleteMany({ name: phantomName });
            console.log(`Deleted ${result.deletedCount} records.`);
        } else {
            console.log("No records found with that exact name.");
            // Try fuzzy search just in case whitespace differs
            const fuzzy = await Subscription.find({ name: { $regex: 'Foundation 2 Year Integrated', $options: 'i' } });
            if (fuzzy.length > 0) {
                console.log(`Found ${fuzzy.length} fuzzy matches. Deleting them:`);
                fuzzy.forEach(f => console.log(`- ${f.name}`));
                const res2 = await Subscription.deleteMany({ _id: { $in: fuzzy.map(f => f._id) } });
                console.log(`Deleted ${res2.deletedCount} fuzzy matches.`);
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.connection.close();
    }
}

deletePhantom();
