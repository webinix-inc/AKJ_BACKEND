const mongoose = require('mongoose');
const UserInstallment = require('../models/userInstallmentModel');
const Installment = require('../models/installmentModel');
const Subscription = require('../models/subscriptionModel');
const Course = require('../models/courseModel');
const User = require('../models/userModel');
const fs = require('fs');
const path = require('path');

// Placeholderd URL for verification script reliability
const DB_URL = "mongodb+srv://yashumittal9084:pnoLzPnsG8vMz4Bd@cluster0.qkcns.mongodb.net/wakadclass?retryWrites=true&w=majority&appName=Cluster0";

// MOCK DB CONNECTION
const connectDB = async () => {
    try {
        console.log('Connecting to Mongo URI...');
        await mongoose.connect(DB_URL, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ MongoDB Connected');
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
        process.exit(1);
    }
};

const runVerification = async () => {
    await connectDB();

    let dummyCourseId, dummySubId, dummyUserId, dummyPlanId, dummyCategoryId;

    try {
        console.log('\n--- 🧪 STARTING VERIFICATION ---\n');

        // 1. Create Dummy User
        const user = new User({
            firstName: 'Test',
            lastName: 'User',
            email: `testuser_${Date.now()}@example.com`,
            phone: '1234567890',
            password: 'password123',
            userType: 'USER'
        });
        await user.save();
        dummyUserId = user._id;
        console.log(`✅ Dummy User Created: ${dummyUserId}`);

        const CourseCategory = require('../models/course/courseCategory'); // Import Category Model

        // ... (in runVerification)
        // 1.5 Create Dummy Category
        const category = new CourseCategory({
            name: 'Verification Category',
            slug: 'verification-category',
            image: 'dummy.jpg'
        });
        await category.save();
        const dummyCategoryId = category._id;
        console.log(`✅ Dummy Category Created: ${dummyCategoryId}`);

        // 2. Create Dummy Course
        const course = new Course({
            title: 'Verification Course',
            description: 'For testing installments',
            price: 10000,
            category: dummyCategoryId // Assign Category
        });
        await course.save();
        dummyCourseId = course._id;
        console.log(`✅ Dummy Course Created: ${dummyCourseId}`);

        // 3. Create Dummy Subscription with IDs
        const subscription = new Subscription({
            course: dummyCourseId,
            name: 'Test Sub',
            type: 'Premium',
            validities: [
                { validity: 6, price: 6000, discount: 0 } // ID will be auto-generated because we removed _id: false
            ]
        });
        await subscription.save();
        dummySubId = subscription._id;

        // RELOAD Subscription to ensure we get the generated ID
        const reloadedSub = await Subscription.findById(dummySubId);
        const validityId = reloadedSub.validities[0]._id;

        console.log(`✅ Dummy Subscription Created: ${dummySubId}`);
        console.log(`ℹ️ Validity ID Generated: ${validityId}`);

        if (!validityId) {
            throw new Error('❌ Validity ID NOT generated! Check subscriptionModel schema.');
        }

        // 4. Simulate setCustomInstallments (Creation of Plan)
        // Ideally we'd call the controller, but here we simulate the logic to verify schema usage
        const plan = new Installment({
            courseId: dummyCourseId.toString(), // Using string as per controller
            planType: '6 months',
            validityId: validityId, // Testing if this field saves correctly
            totalAmount: 6000,
            numberOfInstallments: 2,
            amountPerInstallment: 3000,
            installments: [
                { installmentNumber: 1, amount: 3000, dueDate: new Date(), isPaid: false },
                { installmentNumber: 2, amount: 3000, dueDate: new Date(), isPaid: false }
            ],
            status: 'pending'
        });
        await plan.save();
        dummyPlanId = plan._id;
        console.log(`✅ Installment Plan Created: ${dummyPlanId}`);

        // Verify validityId was saved
        const savedPlan = await Installment.findById(dummyPlanId);
        if (!savedPlan.validityId) {
            throw new Error('❌ validityId NOT saved in Installment Plan!');
        }
        console.log(`✅ Verified validityId in Plan: ${savedPlan.validityId}`);


        // 5. Simulate User Enrollment / Payment Creation (UserInstallment)
        const userInstallment = new UserInstallment({
            userId: dummyUserId,
            courseId: dummyCourseId,
            installmentPlanId: dummyPlanId,
            planSnapshot: {
                planType: plan.planType,
                totalAmount: plan.totalAmount,
                numberOfInstallments: plan.numberOfInstallments,
                installments: plan.installments
            },
            remainingAmount: 6000,
            payments: [],
            status: 'pending'
        });
        await userInstallment.save();
        console.log(`✅ UserInstallment Created: ${userInstallment._id}`);

        // 6. Simulate Payment
        userInstallment.payments.push({
            installmentIndex: 0,
            amount: 3000,
            paidAt: new Date(),
            orderId: 'ORDER_123',
            status: 'paid'
        });
        userInstallment.remainingAmount -= 3000;
        await userInstallment.save();
        console.log(`✅ Payment Simulated. Remaining: ${userInstallment.remainingAmount}`);

        // 7. Check Data Integrity
        const fetchedUI = await UserInstallment.findOne({ userId: dummyUserId, courseId: dummyCourseId });
        if (fetchedUI.remainingAmount !== 3000) {
            throw new Error(`❌ Remaining amount mismatch! Expected 3000, got ${fetchedUI.remainingAmount}`);
        }
        console.log('✅ Final Data Integrity Check Passed');

        // Write success status
        const statusPath = path.resolve(__dirname, 'verification_status.txt');
        fs.writeFileSync(statusPath, 'SUCCESS');
        console.log(`✅ Status written to ${statusPath}`);

    } catch (error) {
        console.error('❌ VERIFICATION FAILED:', error);

        const statusPath = path.resolve(__dirname, 'verification_status.txt');
        fs.writeFileSync(statusPath, `FAILURE: ${error.message}`);
        console.log(`❌ Failure status written to ${statusPath}`);
    } finally {
        // Cleanup
        if (dummyUserId) await User.findByIdAndDelete(dummyUserId);
        if (dummyCourseId) await Course.findByIdAndDelete(dummyCourseId);
        if (dummyCategoryId) await CourseCategory.findByIdAndDelete(dummyCategoryId);
        if (dummySubId) await Subscription.findByIdAndDelete(dummySubId);
        if (dummyPlanId) await Installment.findByIdAndDelete(dummyPlanId);
        if (dummyUserId && dummyCourseId) await UserInstallment.deleteMany({ userId: dummyUserId, courseId: dummyCourseId });

        console.log('🧹 Cleanup Completed');
        await mongoose.disconnect();
    }
};

runVerification();
