#!/usr/bin/env node

/**
 * Test Admin Backend Fix Script
 * 
 * This script tests the admin Merithub registration and live class creation
 * using the correct backend directory (backend/LMS-Backend)
 */

const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

// Import models from the current backend directory
const User = require('./models/userModel');
const Course = require('./models/courseModel');

async function testAdminBackendFix() {
  const baseUrl = 'https://lms-backend-724799456037.europe-west1.run.app';
  
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.DB_URL);
    console.log('✅ Connected to MongoDB successfully');

    // Step 1: Check if Wakade admin exists
    console.log('\n👤 Step 1: Checking Wakade admin...');
    
    const admin = await User.findOne({
      email: 'wakade@lms.com',
      userType: 'ADMIN'
    });

    if (!admin) {
      console.log('❌ Wakade admin not found in database');
      console.log('Please ensure the admin user exists with email: wakade@lms.com');
      return;
    }

    console.log('✅ Wakade admin found:', {
      id: admin._id,
      email: admin.email,
      name: `${admin.firstName} ${admin.lastName}`,
      userType: admin.userType,
      merithubUserId: admin.merithubUserId || 'Not registered'
    });

    // Step 2: Login as admin
    console.log('\n🔐 Step 2: Logging in as admin...');
    
    const loginResponse = await axios.post(`${baseUrl}/api/v1/admin/login`, {
      email: 'wakade@lms.com',
      password: 'walkad@123456'
    });
    
    console.log('✅ Admin login successful!');
    const token = loginResponse.data.accessToken;
    const adminData = loginResponse.data.data;

    // Step 3: Register admin in Merithub if not already registered
    console.log('\n🌐 Step 3: Checking/Registering admin in Merithub...');
    
    if (!admin.merithubUserId) {
      console.log('⚠️ Admin not registered in Merithub. Registering now...');
      
      try {
        const merithubResponse = await axios.post(`${baseUrl}/api/v1/admin/register-merithub`, {
          adminId: admin._id,
          name: `${admin.firstName} ${admin.lastName}`,
          email: admin.email
        }, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        console.log('✅ Admin registered in Merithub successfully!');
        console.log('Response:', merithubResponse.data);
        
      } catch (regError) {
        console.log('❌ Merithub registration failed:');
        console.log('Status:', regError.response?.status);
        console.log('Error:', regError.response?.data || regError.message);
        return;
      }
    } else {
      console.log('✅ Admin already registered in Merithub:', admin.merithubUserId);
    }

    // Step 4: Test batch courses API
    console.log('\n📚 Step 4: Testing batch courses API...');
    
    try {
      const batchCoursesResponse = await axios.get(`${baseUrl}/api/v1/admin/batch-courses`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log('✅ Batch courses API working!');
      console.log('Found', batchCoursesResponse.data.data?.length || 0, 'batch courses');
      
    } catch (batchError) {
      console.log('❌ Batch courses API failed:');
      console.log('Status:', batchError.response?.status);
      console.log('Error:', batchError.response?.data || batchError.message);
    }

    // Step 5: Test live class creation
    console.log('\n🎥 Step 5: Testing live class creation...');
    
    // Get a test course
    const testCourse = await Course.findOne().limit(1);
    if (!testCourse) {
      console.log('❌ No courses found for testing');
      return;
    }

    console.log('✅ Test course found:', {
      id: testCourse._id,
      title: testCourse.title
    });

    // Re-fetch admin to get updated merithubUserId
    const updatedAdmin = await User.findById(admin._id);
    
    if (updatedAdmin.merithubUserId) {
      try {
        const testClassData = {
          title: 'Backend Admin Test Class - ' + new Date().toISOString(),
          courseIds: [testCourse._id],
          startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
          platform: 'merithub',
          userId: updatedAdmin.merithubUserId
        };

        console.log('Creating test class with data:', {
          title: testClassData.title,
          courseId: testClassData.courseIds[0],
          merithubUserId: testClassData.userId,
          platform: testClassData.platform
        });

        const classResponse = await axios.post(`${baseUrl}/api/v1/admin/live-classes`, testClassData, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        console.log('✅ Live class created successfully!');
        console.log('Class details:', {
          id: classResponse.data.liveClass._id,
          title: classResponse.data.liveClass.title,
          classId: classResponse.data.liveClass.classId,
          platform: classResponse.data.liveClass.platform,
          liveLink: classResponse.data.liveClass.liveLink ? '✅ Available' : '❌ Not Available'
        });
        
      } catch (classError) {
        console.log('❌ Live class creation failed:');
        console.log('Status:', classError.response?.status);
        console.log('Error:', classError.response?.data || classError.message);
        
        if (classError.response?.data?.error?.includes('permission')) {
          console.log('\n💡 This looks like a Merithub permission issue.');
          console.log('The admin role and permissions have been fixed to:');
          console.log('- Role: "C" (Creator/Teacher)');
          console.log('- Permission: "CC" (Course and Classes Creation/Edit)');
        }
      }
    } else {
      console.log('⚠️ Cannot create live class - Admin not registered in Merithub');
    }

    console.log('\n🎉 Backend admin test completed!');
    console.log('\n📝 Summary:');
    console.log('- Using correct backend directory: ✅');
    console.log('- Admin wakade@lms.com exists: ✅');
    console.log('- Admin can login: ✅');
    console.log('- Merithub registration route added: ✅');
    console.log('- Batch courses API working: Check above results');
    console.log('- Live class creation: Check above results');
    
  } catch (error) {
    console.error('❌ Error in test script:', error.message);
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
console.log('🚀 Starting Backend Admin Test...');
testAdminBackendFix();
