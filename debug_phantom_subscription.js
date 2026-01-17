const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const subscriptionSchema = new mongoose.Schema({
    name: String,
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
}, { strict: false });

const Subscription = mongoose.model('Subscription', subscriptionSchema);
const DB_URL = process.env.DB_URL;

async function run() {
    try {
        if (!DB_URL) { console.log("NO DB URL"); return; }
        await mongoose.connect(DB_URL);

        console.log("SEARCHING FOR: 'Foundation 2 Year Integrated'");

        const results = await Subscription.find({
            name: { $regex: 'Foundation', $options: 'i' }
        }).select('name _id course');

        if (results.length > 0) {
            console.log("!!! FOUND MATCHES IN DB !!!");
            results.forEach(r => console.log(`FOUND: "${r.name}" (ID: ${r._id})`));
        } else {
            console.log("NOT FOUND IN DB.");
        }

    } catch (e) { console.error(e); }
    finally { await mongoose.connection.close(); }
}

run();
