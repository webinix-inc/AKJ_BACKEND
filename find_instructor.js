/**
 * Find an instructor with MeritHub ID for testing
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/userModel');

async function findInstructor() {
  try {
    // Connect to MongoDB using the same env var as server
    await mongoose.connect(process.env.DB_URL || 'mongodb://localhost:27017/wakad');
    console.log('✅ Connected to MongoDB');

    // Find users with MeritHub IDs
    console.log('🔍 Looking for users with MeritHub IDs...');
    const usersWithMeritHub = await User.find({
      merithubUserId: { $exists: true, $ne: null }
    }).limit(10);

    console.log(`Found ${usersWithMeritHub.length} users with MeritHub IDs:`);
    usersWithMeritHub.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.firstName} ${user.lastName}`);
      console.log(`     Email: ${user.email}`);
      console.log(`     User Type: ${user.userType}`);
      console.log(`     MeritHub ID: ${user.merithubUserId}`);
      console.log('');
    });

    // Find admin users specifically
    console.log('👤 Looking for admin users...');
    const adminUsers = await User.find({
      userType: { $in: ['ADMIN', 'TEACHER'] }
    }).limit(5);

    console.log(`Found ${adminUsers.length} admin/teacher users:`);
    adminUsers.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.firstName} ${user.lastName}`);
      console.log(`     Email: ${user.email}`);
      console.log(`     User Type: ${user.userType}`);
      console.log(`     MeritHub ID: ${user.merithubUserId || 'Not set'}`);
      console.log('');
    });

    // Find courses and enrolled users
    console.log('📚 Checking courses and enrolled users...');
    const Course = require('./models/courseModel');
    const courses = await Course.find().limit(3);
    
    for (const course of courses) {
      console.log(`Course: ${course.title}`);
      
      const enrolledUsers = await User.find({
        'purchasedCourses.course': course._id
      }).limit(3);
      
      console.log(`  Enrolled users: ${enrolledUsers.length}`);
      enrolledUsers.forEach(user => {
        console.log(`    - ${user.firstName} ${user.lastName} (MeritHub: ${user.merithubUserId || 'None'})`);
      });
      console.log('');
    }

    mongoose.connection.close();
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

findInstructor();
