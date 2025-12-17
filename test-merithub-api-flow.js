#!/usr/bin/env node

/**
 * Test Merithub API Flow
 * 
 * This script tests the complete flow of creating a live class
 * and adding users to it, with detailed logging to see where it fails
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import models and functions
const User = require('./models/userModel');
const { addUsersToClass, scheduleLiveClass, getAccessToken } = require('./configs/merithub.config');

async function testMerithubApiFlow() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.DB_URL);
    console.log('✅ Connected to MongoDB successfully');

    // Step 1: Test access token
    console.log('\n🔑 Step 1: Testing Merithub access token...');
    try {
      const token = await getAccessToken();
      console.log('✅ Access token obtained successfully');
      console.log('🔍 Token preview:', token.substring(0, 20) + '...');
    } catch (tokenError) {
      console.log('❌ Failed to get access token:', tokenError.message);
      return;
    }

    // Step 2: Find test users
    console.log('\n👥 Step 2: Finding test users with merithubUserId...');
    const testUsers = await User.find({
      userType: 'USER',
      merithubUserId: { $exists: true, $ne: null },
      purchasedCourses: { $exists: true, $ne: [] }
    }).limit(2);

    if (testUsers.length === 0) {
      console.log('❌ No test users found with merithubUserId');
      return;
    }

    console.log(`✅ Found ${testUsers.length} test users:`);
    testUsers.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.firstName} ${user.lastName} (${user.merithubUserId})`);
    });

    const testUserIds = testUsers.map(user => user.merithubUserId);

    // Step 3: Test creating a live class first
    console.log('\n🎥 Step 3: Testing live class creation...');
    
    // Get admin user for class creation
    const admin = await User.findOne({ 
      email: 'AKJAcademy@lms.com',
      userType: 'ADMIN' 
    });
    
    if (!admin || !admin.merithubUserId) {
      console.log('❌ Admin not found or missing merithubUserId');
      return;
    }

    console.log(`✅ Admin found: ${admin.firstName} ${admin.lastName} (${admin.merithubUserId})`);

    // Create test class details
    const testClassDetails = {
      title: 'API Flow Test Class - ' + new Date().toISOString(),
      description: 'Test class for debugging API flow',
      startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
      duration: 60,
      timeZoneId: 'Asia/Kolkata'
    };

    console.log('📤 Creating live class with details:');
    console.log('- Title:', testClassDetails.title);
    console.log('- Instructor:', admin.merithubUserId);
    console.log('- Duration:', testClassDetails.duration, 'minutes');

    let testClassId;
    try {
      const classResponse = await scheduleLiveClass(admin.merithubUserId, testClassDetails);
      testClassId = classResponse.classId;
      console.log('✅ Live class created successfully!');
      console.log('- Class ID:', testClassId);
      console.log('- Response keys:', Object.keys(classResponse));
    } catch (classError) {
      console.log('❌ Failed to create live class:', classError.message);
      return;
    }

    // Step 4: Test adding users to the class
    console.log('\n👥 Step 4: Testing addUsersToClass function...');
    
    console.log('📤 Calling addUsersToClass with:');
    console.log('- Class ID:', testClassId);
    console.log('- User IDs:', testUserIds);
    console.log('- Number of users:', testUserIds.length);

    try {
      console.log('⏳ Waiting for addUsersToClass response...');
      const startTime = Date.now();
      
      const addUsersResponse = await addUsersToClass(testClassId, testUserIds);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`✅ addUsersToClass completed in ${duration}ms`);
      console.log('📊 Response analysis:');
      console.log('- Response type:', typeof addUsersResponse);
      console.log('- Is array:', Array.isArray(addUsersResponse));
      
      if (Array.isArray(addUsersResponse)) {
        console.log('- Response length:', addUsersResponse.length);
        console.log('- Expected length:', testUserIds.length);
        
        addUsersResponse.forEach((userResponse, index) => {
          console.log(`\n  User ${index + 1} response:`);
          console.log('  - Keys:', Object.keys(userResponse));
          console.log('  - userId:', userResponse.userId);
          console.log('  - userLink:', userResponse.userLink ? 'Available' : 'Missing');
          
          if (userResponse.userLink) {
            console.log('  - userLink preview:', userResponse.userLink.substring(0, 50) + '...');
          }
          
          // Check if this userId matches our test users
          const matchingUser = testUsers.find(u => u.merithubUserId === userResponse.userId);
          if (matchingUser) {
            console.log(`  - Matches: ${matchingUser.firstName} ${matchingUser.lastName}`);
          } else {
            console.log('  - ⚠️ No matching user found for this userId');
          }
        });
        
        // Step 5: Test the user update process
        console.log('\n💾 Step 5: Testing user profile updates...');
        
        const CLIENT_ID = process.env.MERIT_HUB_CLIENT_ID;
        let updateCount = 0;
        
        for (let i = 0; i < addUsersResponse.length; i++) {
          const userResponse = addUsersResponse[i];
          const { userId: merithubUserId, userLink } = userResponse;
          
          console.log(`\n👤 Processing user ${i + 1}: ${merithubUserId}`);
          
          if (userLink) {
            const individualUserUrl = `https://live.merithub.com/info/room/${CLIENT_ID}/${userLink}`;
            console.log('🔗 Individual URL:', individualUserUrl.substring(0, 80) + '...');
            
            const liveClassInfo = {
              title: testClassDetails.title,
              startTime: testClassDetails.startTime,
              duration: testClassDetails.duration,
              classId: testClassId,
              platform: "merithub",
              liveLink: individualUserUrl,
              participantLink: individualUserUrl,
              createdAt: new Date()
            };
            
            try {
              const updatedUser = await User.findOneAndUpdate(
                { merithubUserId },
                { $push: { liveClasses: liveClassInfo } },
                { new: true }
              );
              
              if (updatedUser) {
                console.log(`✅ Successfully updated ${updatedUser.firstName} ${updatedUser.lastName}`);
                console.log(`📊 User now has ${updatedUser.liveClasses.length} live classes`);
                updateCount++;
              } else {
                console.log(`❌ User not found with merithubUserId: ${merithubUserId}`);
              }
            } catch (updateError) {
              console.log(`❌ Error updating user: ${updateError.message}`);
            }
          } else {
            console.log('❌ No userLink provided for this user');
          }
        }
        
        console.log(`\n📊 Final Results:`);
        console.log(`- Users processed: ${addUsersResponse.length}`);
        console.log(`- Successful updates: ${updateCount}`);
        console.log(`- Failed updates: ${addUsersResponse.length - updateCount}`);
        
        if (updateCount === testUserIds.length) {
          console.log('🎉 SUCCESS: All users received individual links!');
        } else {
          console.log('⚠️ PARTIAL SUCCESS: Some users did not receive links');
        }
        
      } else {
        console.log('❌ Unexpected response format - not an array');
        console.log('Response:', addUsersResponse);
      }
      
    } catch (addUsersError) {
      console.log('❌ addUsersToClass failed:', addUsersError.message);
      console.log('Error details:', addUsersError);
    }

    console.log('\n🧹 Cleanup: The test class will remain in Merithub for manual verification');
    
  } catch (error) {
    console.error('❌ Error in test:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('🔐 Database connection closed');
    }
  }
}

// Run the test
console.log('🧪 Testing Merithub API Flow...');
testMerithubApiFlow();
