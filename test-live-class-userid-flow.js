#!/usr/bin/env node

/**
 * Test Live Class User ID Flow
 * 
 * This script tests what user ID is being sent when creating a live class
 * and verifies all the checks applied before calling the Merithub API
 */

const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

// Import models from the current backend directory
const User = require('./models/userModel');
const Course = require('./models/courseModel');

async function testLiveClassUserIdFlow() {
  const baseUrl = 'https://lms-backend-724799456037.europe-west1.run.app';
  
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.DB_URL);
    console.log('✅ Connected to MongoDB successfully');

    // Step 1: Check admin user details
    console.log('\n👤 Step 1: Checking admin user details...');
    
    const admin = await User.findOne({
      email: 'AKJAcademy@lms.com',
      userType: 'ADMIN'
    });

    if (!admin) {
      console.log('❌ Admin not found');
      return;
    }

    console.log('✅ Admin found:', {
      mongoId: admin._id,
      email: admin.email,
      name: `${admin.firstName} ${admin.lastName}`,
      userType: admin.userType,
      merithubUserId: admin.merithubUserId || '❌ NOT SET',
      merithubUserToken: admin.merithubUserToken ? '✅ Available' : '❌ NOT SET'
    });

    // Step 2: Login as admin to get token
    console.log('\n🔐 Step 2: Logging in as admin...');
    
    const loginResponse = await axios.post(`${baseUrl}/api/v1/admin/login`, {
      email: 'AKJAcademy@lms.com',
      password: 'walkad@123456'
    });
    
    const token = loginResponse.data.accessToken;
    const adminData = loginResponse.data.data;
    
    console.log('✅ Admin login successful!');
    console.log('Admin data from login response:', {
      userId: adminData.userId, // This is MongoDB _id
      merithubUserId: adminData.merithubUserId || '❌ NOT SET',
      email: adminData.email,
      firstName: adminData.firstName,
      lastName: adminData.lastName
    });

    // Step 3: Simulate frontend logic
    console.log('\n🖥️ Step 3: Simulating frontend CreateLiveClass logic...');
    
    // This is what the frontend does:
    const frontendUserId = adminData.userId; // MongoDB _id
    const frontendMerithubUserId = adminData.merithubUserId; // Merithub user ID
    
    console.log('Frontend variables:');
    console.log('- userId (MongoDB _id):', frontendUserId);
    console.log('- merithubUserId (for API call):', frontendMerithubUserId || '❌ NOT SET');
    
    // Frontend check: if platform === "merithub" && !merithubUserId
    if (!frontendMerithubUserId) {
      console.log('⚠️ Frontend would try to register admin in Merithub...');
      
      // This is the registration call the frontend makes
      try {
        const regResponse = await axios.post(`${baseUrl}/api/v1/admin/register-merithub`, {
          adminId: frontendUserId, // MongoDB _id
          name: `${adminData.firstName} ${adminData.lastName}`,
          email: adminData.email
        }, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        console.log('✅ Admin registered in Merithub:', regResponse.data);
        
        // Re-fetch admin to get updated merithubUserId
        const updatedAdmin = await User.findById(admin._id);
        console.log('Updated admin merithubUserId:', updatedAdmin.merithubUserId);
        
        // Update our local variable
        frontendMerithubUserId = updatedAdmin.merithubUserId;
        
      } catch (regError) {
        console.log('❌ Merithub registration failed:', regError.response?.data || regError.message);
        return;
      }
    }

    // Step 4: Test live class creation data
    console.log('\n🎥 Step 4: Testing live class creation data...');
    
    const testCourse = await Course.findOne().limit(1);
    if (!testCourse) {
      console.log('❌ No courses found for testing');
      return;
    }

    // This is the exact data the frontend sends
    const liveClassData = {
      title: 'Test Live Class - ' + new Date().toISOString(),
      userId: frontendMerithubUserId, // 🔍 THIS IS THE KEY - should be merithubUserId
      courseIds: [testCourse._id],
      startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
      platform: 'merithub'
    };

    console.log('📤 Data being sent to backend:');
    console.log('- title:', liveClassData.title);
    console.log('- userId (should be merithubUserId):', liveClassData.userId);
    console.log('- courseIds:', liveClassData.courseIds);
    console.log('- platform:', liveClassData.platform);

    // Step 5: Test backend processing
    console.log('\n🔧 Step 5: Testing backend processing...');
    
    console.log('Backend will receive userId:', liveClassData.userId);
    console.log('Backend will look for user with merithubUserId:', liveClassData.userId);
    
    // Check if backend can find the instructor
    const instructorCheck = await User.findOne({ merithubUserId: liveClassData.userId });
    if (!instructorCheck) {
      console.log('❌ Backend would fail: Instructor not found with merithubUserId:', liveClassData.userId);
      console.log('💡 This means the merithubUserId in the database doesn\'t match what\'s being sent');
    } else {
      console.log('✅ Backend would find instructor:', {
        mongoId: instructorCheck._id,
        email: instructorCheck.email,
        merithubUserId: instructorCheck.merithubUserId,
        hasToken: !!instructorCheck.merithubUserToken
      });
      
      if (!instructorCheck.merithubUserToken) {
        console.log('❌ Backend would fail: Instructor has no merithubUserToken');
        console.log('💡 This is the "Instructor\'s MeritHub token not found" error');
      }
    }

    // Step 6: Actually try to create the live class
    console.log('\n🚀 Step 6: Actually creating live class...');
    
    try {
      const classResponse = await axios.post(`${baseUrl}/api/v1/admin/live-classes`, liveClassData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ Live class created successfully!');
      console.log('Response:', {
        classId: classResponse.data.liveClass?.classId,
        title: classResponse.data.liveClass?.title,
        platform: classResponse.data.liveClass?.platform
      });
      
    } catch (classError) {
      console.log('❌ Live class creation failed:');
      console.log('Status:', classError.response?.status);
      console.log('Error:', classError.response?.data);
      
      if (classError.response?.data?.error?.includes('Instructor not found')) {
        console.log('\n🔍 DIAGNOSIS: merithubUserId mismatch');
        console.log('- Frontend is sending userId:', liveClassData.userId);
        console.log('- But admin\'s actual merithubUserId is:', admin.merithubUserId);
        console.log('- These should match!');
      }
      
      if (classError.response?.data?.error?.includes('token not found')) {
        console.log('\n🔍 DIAGNOSIS: Missing merithubUserToken');
        console.log('- Admin needs to have merithubUserToken field populated');
        console.log('- This happens during Merithub registration');
      }
    }

    console.log('\n📋 SUMMARY:');
    console.log('='.repeat(50));
    console.log('1. Admin MongoDB _id:', admin._id);
    console.log('2. Admin merithubUserId:', admin.merithubUserId || 'NOT SET');
    console.log('3. Frontend sends userId:', liveClassData.userId);
    console.log('4. Backend looks for merithubUserId:', liveClassData.userId);
    console.log('5. Match?', admin.merithubUserId === liveClassData.userId ? '✅ YES' : '❌ NO');
    console.log('6. Has merithubUserToken?', admin.merithubUserToken ? '✅ YES' : '❌ NO');
    
  } catch (error) {
    console.error('❌ Error in test:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('🔐 Database connection closed');
    }
  }
}

// Run the test
console.log('🧪 Testing Live Class User ID Flow...');
testLiveClassUserIdFlow();
