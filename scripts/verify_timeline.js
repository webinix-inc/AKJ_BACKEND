
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// Load environment variables manually since dotenv might have path issues
const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = envContent.split('\n').reduce((acc, line) => {
    const [key, value] = line.split('=');
    if (key && value) acc[key.trim()] = value.trim();
    return acc;
}, {});

// const DB_URL = envVars.DB_URL || "mongodb+srv://ashish:ashish@cluster0.08nmu.mongodb.net/LMS?retryWrites=true&w=majority";
const DB_URL = "mongodb+srv://ashish:ashish@cluster0.08nmu.mongodb.net/LMS?retryWrites=true&w=majority"; // Hardcoded for reliability

// Import Models
const User = require('../models/userModel');
const Course = require('../models/courseModel');
const Installment = require('../models/installmentModel');
const UserInstallment = require('../models/userInstallmentModel');
const CourseCategory = require('../models/course/courseCategory'); // Just in case we need it

async function verifyTimeline() {
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(DB_URL);
        console.log('✅ Connected to MongoDB');

        // 1. Create Dummy Data
        console.log('🆕 Creating dummy data...');

        // Dummy Category
        const category = new CourseCategory({ name: 'Timeline Test Cat', description: 'Test' });
        await category.save();

        // Dummy Plan (Installment Template)
        const validityId = new mongoose.Types.ObjectId();
        const courseId = new mongoose.Types.ObjectId();
        const userId = new mongoose.Types.ObjectId();

        const installmentPlan = new Installment({
            courseId: courseId,
            planType: '3 Months',
            validityId: validityId,
            numberOfInstallments: 3,
            installments: [
                { amount: 1000, dueDate: 'DOP' },
                { amount: 1000, dueDate: 'DOP + 1 month' },
                { amount: 1000, dueDate: 'DOP + 2 months' }
            ],
            totalAmount: 3000,
            remainingAmount: 3000,
            status: 'pending' // Correct enum
        });
        await installmentPlan.save();
        console.log('✅ Dummy Installment Plan created:', installmentPlan._id);

        // Dummy UserInstallment (The new source of truth)
        const userInstallment = new UserInstallment({
            userId: userId,
            courseId: courseId,
            installmentPlanId: installmentPlan._id,
            planSnapshot: {
                planType: '3 Months',
                totalAmount: 3000,
                numberOfInstallments: 3,
                installments: [
                    { amount: 1000, dueDate: 'DOP' },
                    { amount: 1000, dueDate: 'DOP + 1 month' },
                    { amount: 1000, dueDate: 'DOP + 2 months' }
                ]
            },
            status: 'pending',
            payments: [
                {
                    installmentIndex: 0,
                    amount: 1000,
                    paidAt: new Date(),
                    status: 'paid',
                    orderId: 'order_test_123'
                }
            ],
            remainingAmount: 2000
        });
        await userInstallment.save();
        console.log('✅ Dummy UserInstallment created:', userInstallment._id);

        // 2. Call the Controller Function programmatically (Simulation)
        // We can't easily call the controller function directly without mocking specific req/res objects
        // Instead, we will simulate the logic we just added to verify it works as expected "in principle"
        // But better: Let's use `axios` to call the actual API endpoint if the server was running.
        // Since we are in a script, we can just instantiate the controller and call it with mock req/res.

        const installmentController = require('../controllers/installmentController');

        const req = {
            params: {
                courseId: courseId.toString(),
                userId: userId.toString()
            }
        };

        const res = {
            status: function (code) {
                this.statusCode = code;
                return this;
            },
            json: function (data) {
                this.data = data;
                return this;
            }
        };

        console.log('🔄 Calling getUserInstallmentTimeline...');
        await installmentController.getUserInstallmentTimeline(req, res);

        // 3. Verify Response
        if (res.statusCode === 200) {
            console.log('✅ API returned 200 OK');

            // Check if it returned our UserInstallment data
            const timeline = res.data.timeline;
            if (timeline && timeline.length === 3) {
                console.log('✅ Timeline length is correct (3)');
                if (timeline[0].isPaid === true && timeline[1].isPaid === false) {
                    console.log('✅ Payment status is correct (1st paid, 2nd unpaid)');
                    console.log('🎉 VERIFICATION SUCCESSFUL: Update is working!');
                    fs.writeFileSync('verification_timeline_status.txt', 'SUCCESS');
                } else {
                    console.error('❌ Check failed: Payment statuses are wrong', timeline);
                    fs.writeFileSync('verification_timeline_status.txt', 'FAILURE');
                }
            } else {
                console.error('❌ Check failed: Timeline structure mismatch', res.data);
                fs.writeFileSync('verification_timeline_status.txt', 'FAILURE');
            }

        } else {
            console.error('❌ API returned error status:', res.statusCode, res.data);
            fs.writeFileSync('verification_timeline_status.txt', 'FAILURE');
        }

        // Cleanup
        console.log('🧹 Cleaning up...');
        await UserInstallment.deleteOne({ _id: userInstallment._id });
        await Installment.deleteOne({ _id: installmentPlan._id });
        await CourseCategory.deleteOne({ _id: category._id });

    } catch (error) {
        console.error('❌ Verification Error:', error);
        fs.writeFileSync('verification_timeline_status.txt', 'FAILURE');
    } finally {
        await mongoose.disconnect();
    }
}

verifyTimeline();
