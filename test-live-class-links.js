/**
 * Test script to verify live class link generation
 * This script will create test live classes and check the links generated for users
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const User = require('./models/userModel');
const LiveClass = require('./models/LiveClass');

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function testLiveClassLinks() {
  await connectDB();
  
  console.log('\n🔍 TESTING LIVE CLASS LINK GENERATION\n');
  
  try {
    // Find a test user with purchased courses
    const testUser = await User.findOne({
      'purchasedCourses.0': { $exists: true }
    }).populate('purchasedCourses.course');
    
    if (!testUser) {
      console.log('❌ No test user found with purchased courses');
      return;
    }
    
    console.log(`👤 Test User: ${testUser.firstName} ${testUser.lastName}`);
    console.log(`📧 Email: ${testUser.email}`);
    console.log(`🎓 Purchased Courses: ${testUser.purchasedCourses.length}`);
    
    // Get the first course ID
    const courseId = testUser.purchasedCourses[0].course;
    console.log(`📚 Using Course ID: ${courseId}`);
    
    // Check current live classes for this user
    console.log('\n📋 CURRENT LIVE CLASSES FOR USER:');
    console.log(`Total live classes: ${testUser.liveClasses.length}`);
    
    testUser.liveClasses.forEach((liveClass, index) => {
      console.log(`\n${index + 1}. ${liveClass.title}`);
      console.log(`   Platform: ${liveClass.platform || 'unknown'}`);
      console.log(`   Class ID: ${liveClass.classId || 'none'}`);
      console.log(`   Live Link: ${liveClass.liveLink ? 'YES' : 'NO'}`);
      console.log(`   Participant Link: ${liveClass.participantLink ? 'YES (OLD)' : 'NO'}`);
      console.log(`   Start Time: ${liveClass.startTime}`);
      
      if (liveClass.liveLink) {
        const linkType = liveClass.liveLink.includes('zoom.us') ? 'ZOOM' : 
                        liveClass.liveLink.includes('merithub.com') ? 'MERITHUB' : 'UNKNOWN';
        console.log(`   Link Type: ${linkType}`);
        console.log(`   Link: ${liveClass.liveLink.substring(0, 50)}...`);
      }
    });
    
    // Check for any live classes in the LiveClass collection
    console.log('\n📋 ALL LIVE CLASSES IN DATABASE:');
    const allLiveClasses = await LiveClass.find({}).limit(5);
    console.log(`Total live classes in DB: ${allLiveClasses.length}`);
    
    allLiveClasses.forEach((liveClass, index) => {
      console.log(`\n${index + 1}. ${liveClass.title}`);
      console.log(`   Platform: ${liveClass.platform}`);
      console.log(`   Class ID: ${liveClass.classId || 'none'}`);
      console.log(`   Course IDs: ${liveClass.courseIds}`);
      console.log(`   Start Time: ${liveClass.startTime}`);
      console.log(`   Live Link: ${liveClass.liveLink ? 'YES' : 'NO'}`);
      console.log(`   Instructor Link: ${liveClass.instructorLink ? 'YES' : 'NO'}`);
      
      if (liveClass.platform === 'zoom') {
        console.log(`   Zoom Meeting Link: ${liveClass.zoomMeetingLink || 'none'}`);
        console.log(`   Zoom Meeting ID: ${liveClass.zoomMeetingId || 'none'}`);
      }
    });
    
    // Count users by platform
    console.log('\n📊 LINK ANALYSIS BY PLATFORM:');
    const usersWithZoomLinks = await User.countDocuments({
      'liveClasses.platform': 'zoom'
    });
    const usersWithMeritHubLinks = await User.countDocuments({
      'liveClasses.platform': 'merithub'
    });
    const usersWithOldParticipantLinks = await User.countDocuments({
      'liveClasses.participantLink': { $exists: true }
    });
    
    console.log(`👥 Users with Zoom live classes: ${usersWithZoomLinks}`);
    console.log(`👥 Users with MeritHub live classes: ${usersWithMeritHubLinks}`);
    console.log(`⚠️  Users with old participant links: ${usersWithOldParticipantLinks}`);
    
    // Check for potential issues
    console.log('\n🔍 POTENTIAL ISSUES:');
    
    // Check for classes without liveLink
    const classesWithoutLiveLink = await User.countDocuments({
      'liveClasses': {
        $elemMatch: {
          'liveLink': { $exists: false }
        }
      }
    });
    
    // Check for Zoom classes with MeritHub links
    const zoomClassesWithMeritHubLinks = await User.countDocuments({
      'liveClasses': {
        $elemMatch: {
          'platform': 'zoom',
          'liveLink': { $regex: 'merithub.com' }
        }
      }
    });
    
    // Check for MeritHub classes with Zoom links
    const meritHubClassesWithZoomLinks = await User.countDocuments({
      'liveClasses': {
        $elemMatch: {
          'platform': 'merithub',
          'liveLink': { $regex: 'zoom.us' }
        }
      }
    });
    
    console.log(`❌ Classes without liveLink: ${classesWithoutLiveLink}`);
    console.log(`❌ Zoom classes with MeritHub links: ${zoomClassesWithMeritHubLinks}`);
    console.log(`❌ MeritHub classes with Zoom links: ${meritHubClassesWithZoomLinks}`);
    
    if (classesWithoutLiveLink > 0 || zoomClassesWithMeritHubLinks > 0 || meritHubClassesWithZoomLinks > 0) {
      console.log('\n⚠️  ISSUES DETECTED! Consider running the migration script.');
    } else {
      console.log('\n✅ No issues detected with link generation.');
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the test
testLiveClassLinks().catch(console.error);
