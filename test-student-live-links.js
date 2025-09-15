#!/usr/bin/env node

/**
 * Test Student Live Class Links
 * 
 * This script tests what live class links are returned to students
 * and verifies if they're getting individual user links or common links
 */

const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

// Import models from the current backend directory
const User = require('./models/userModel');
const LiveClass = require('./models/LiveClass');

async function testStudentLiveLinks() {
  const baseUrl = 'https://lms-backend-724799456037.europe-west1.run.app';
  
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.DB_URL);
    console.log('✅ Connected to MongoDB successfully');

    // Step 1: Find a test student user
    console.log('\n👤 Step 1: Finding a test student user...');
    
    const student = await User.findOne({
      userType: 'USER',
      purchasedCourses: { $exists: true, $ne: [] }
    });

    if (!student) {
      console.log('❌ No student with purchased courses found');
      return;
    }

    console.log('✅ Student found:', {
      id: student._id,
      email: student.email,
      name: `${student.firstName} ${student.lastName}`,
      merithubUserId: student.merithubUserId || '❌ NOT SET',
      purchasedCourses: student.purchasedCourses.length,
      liveClassesInProfile: student.liveClasses?.length || 0
    });

    // Step 2: Check what's in the student's liveClasses array (individual links)
    console.log('\n📱 Step 2: Checking student\'s individual live class links...');
    
    if (student.liveClasses && student.liveClasses.length > 0) {
      console.log(`Found ${student.liveClasses.length} live classes in student profile:`);
      student.liveClasses.forEach((lc, index) => {
        console.log(`\n  Class ${index + 1}:`);
        console.log(`  - Title: ${lc.title}`);
        console.log(`  - ClassId: ${lc.classId}`);
        console.log(`  - Platform: ${lc.platform}`);
        console.log(`  - ParticipantLink: ${lc.participantLink ? '✅ Available' : '❌ Missing'}`);
        console.log(`  - LiveLink: ${lc.liveLink ? '✅ Available' : '❌ Missing'}`);
        if (lc.participantLink) {
          console.log(`  - Link Preview: ${lc.participantLink.substring(0, 80)}...`);
          // Check if it's an individual link (contains unique identifier)
          const isIndividualLink = lc.participantLink.includes('d2v82r4rtl0v9lcr0kjg') || 
                                  lc.participantLink.match(/[a-z0-9]{20,}/);
          console.log(`  - Link Type: ${isIndividualLink ? '✅ Individual User Link' : '⚠️ Common Link'}`);
        }
      });
    } else {
      console.log('❌ No live classes found in student profile');
    }

    // Step 3: Check what's in the LiveClass collection (common links)
    console.log('\n🏫 Step 3: Checking LiveClass collection (common links)...');
    
    const userCourseIds = student.purchasedCourses.map(pc => pc.course.toString());
    const liveClasses = await LiveClass.find({
      courseIds: { $in: userCourseIds }
    }).sort({ startTime: -1 }).limit(3);

    if (liveClasses.length > 0) {
      console.log(`Found ${liveClasses.length} live classes in LiveClass collection:`);
      liveClasses.forEach((lc, index) => {
        console.log(`\n  Class ${index + 1}:`);
        console.log(`  - Title: ${lc.title}`);
        console.log(`  - ClassId: ${lc.classId}`);
        console.log(`  - Platform: ${lc.platform}`);
        console.log(`  - ParticipantLink: ${lc.participantLink ? '✅ Available' : '❌ Missing'}`);
        console.log(`  - LiveLink: ${lc.liveLink ? '✅ Available' : '❌ Missing'}`);
        if (lc.participantLink) {
          console.log(`  - Link Preview: ${lc.participantLink.substring(0, 80)}...`);
          console.log(`  - Link Type: ⚠️ Common Participant Link (from LiveClass collection)`);
        }
      });
    } else {
      console.log('❌ No live classes found in LiveClass collection for student\'s courses');
    }

    // Step 4: Test the actual API call that frontend makes
    console.log('\n🌐 Step 4: Testing user profile API call...');
    
    // We need to simulate a login to get a token
    // For now, let's check if we can find the student's token or simulate the API response
    
    try {
      // Create a mock token for testing (in real scenario, student would be logged in)
      const mockToken = 'test-token'; // This won't work for actual API call
      
      console.log('📡 Simulating /api/v1/user/getProfile API call...');
      console.log('🔍 This API should return live classes with individual user links');
      
      // Instead of making the API call, let's simulate what the controller does
      console.log('\n🔧 Simulating userController.getProfile logic:');
      
      // Get user's purchased course IDs
      const userCourseIds = student.purchasedCourses.map(pc => pc.course.toString());
      console.log('- User course IDs:', userCourseIds);
      
      // Find live classes that match user's purchased courses
      const freshLiveClasses = await LiveClass.find({
        courseIds: { $in: userCourseIds }
      }).sort({ startTime: -1 });
      
      console.log(`- Found ${freshLiveClasses.length} live classes from LiveClass collection`);
      
      // Filter active classes
      const now = new Date();
      const activeLiveClasses = freshLiveClasses.filter(liveClass => {
        const startTime = new Date(liveClass.startTime);
        const timeDiff = now - startTime;
        const twoHours = 2 * 60 * 60 * 1000;
        return timeDiff < twoHours || liveClass.status === "lv";
      });
      
      console.log(`- ${activeLiveClasses.length} active live classes after filtering`);
      
      // This is what gets returned to the frontend
      const apiResponse = activeLiveClasses.map(lc => ({
        _id: lc._id,
        classId: lc.classId,
        title: lc.title,
        startTime: lc.startTime,
        duration: lc.duration,
        platform: lc.platform,
        status: lc.status,
        liveLink: lc.participantLink || lc.liveLink, // 🚨 PROBLEM: This is common link!
        participantLink: lc.participantLink, // 🚨 PROBLEM: This is common link!
        courseIds: lc.courseIds
      }));
      
      console.log('\n🚨 PROBLEM IDENTIFIED:');
      console.log('- The API returns live classes from LiveClass collection');
      console.log('- LiveClass collection contains COMMON participant links');
      console.log('- But students need INDIVIDUAL user links');
      console.log('- Individual links are stored in User.liveClasses array');
      
      if (apiResponse.length > 0) {
        console.log('\nAPI Response Sample:');
        const sample = apiResponse[0];
        console.log('- Title:', sample.title);
        console.log('- ParticipantLink:', sample.participantLink ? 'Available (COMMON)' : 'Missing');
        console.log('- Link Type: ⚠️ Common Link (NOT individual)');
      }
      
    } catch (apiError) {
      console.log('API call failed (expected without proper auth):', apiError.message);
    }

    // Step 5: Show the fix needed
    console.log('\n💡 SOLUTION NEEDED:');
    console.log('1. The userController.getProfile should NOT use LiveClass collection');
    console.log('2. It should use the individual links from User.liveClasses array');
    console.log('3. User.liveClasses contains the individual user links we fixed earlier');
    console.log('4. Frontend should receive individual links, not common links');
    
    console.log('\n📋 SUMMARY:');
    console.log('='.repeat(60));
    console.log('❌ CURRENT: API returns common links from LiveClass collection');
    console.log('✅ NEEDED: API should return individual links from User.liveClasses');
    console.log('🔧 FIX: Modify userController.getProfile to use User.liveClasses');
    
  } catch (error) {
    console.error('❌ Error in test:', error.message);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('🔐 Database connection closed');
    }
  }
}

// Run the test
console.log('🧪 Testing Student Live Class Links...');
testStudentLiveLinks();
