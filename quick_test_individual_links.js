// Quick test to verify individual user links are working
const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const API_BASE_URL = 'http://localhost:8890/api/v1';

function generateAdminToken() {
  return jwt.sign({
    id: '66b5a1b4640829b294034f9e',
    userType: 'ADMIN'
  }, process.env.SECRET, { expiresIn: '1h' });
}

function generateUserToken(userId) {
  return jwt.sign({
    id: userId,
    userType: 'USER'
  }, process.env.SECRET, { expiresIn: '1h' });
}

async function quickTest() {
  try {
    console.log('🚀 Quick Individual Links Test');
    console.log('==============================');
    
    // Test 1: Create a simple class
    console.log('1️⃣ Creating live class...');
    const adminToken = generateAdminToken();
    
    const classData = {
      userId: 'd2v82r4rtl0v9lcr0kjg',
      courseIds: ['6895a124640829b294034fa0'],
      title: 'Quick Test Class',
      startTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      platform: 'merithub',
      type: 'oneTime',
      duration: 60
    };

    const createResponse = await axios.post(
      `${API_BASE_URL}/admin/live-classes`,
      classData,
      { headers: { 'Authorization': `Bearer ${adminToken}` } }
    );

    console.log('✅ Class created:', createResponse.data.liveClass.classId);
    
    // Test 2: Check student access
    console.log('2️⃣ Testing student access...');
    const userToken = generateUserToken('6889f33aae1f381179cf7f51');
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const studentResponse = await axios.get(
      `${API_BASE_URL}/user/live-classes`,
      { headers: { 'Authorization': `Bearer ${userToken}` } }
    );

    const studentClass = studentResponse.data.classes?.find(cls => 
      cls.title === 'Quick Test Class'
    );
    
    if (studentClass) {
      console.log('✅ Student can see class');
      console.log('   Access Type:', studentClass.accessType);
      console.log('   Individual Link:', studentClass.individualUserLink ? 'Available' : 'Missing');
      console.log('   Profile Link:', studentClass.userProfileLinkAvailable ? 'Yes' : 'No');
      
      if (studentClass.individualUserLink) {
        console.log('   Link Format:', studentClass.individualUserLink.includes('?iframe=true') ? 'Correct' : 'Incorrect');
      }
    } else {
      console.log('❌ Student cannot see class');
    }
    
    // Test 3: Check instructor access
    console.log('3️⃣ Testing instructor access...');
    const instructorResponse = await axios.get(
      `${API_BASE_URL}/user/live-classes`,
      { headers: { 'Authorization': `Bearer ${adminToken}` } }
    );

    const instructorClass = instructorResponse.data.classes?.find(cls => 
      cls.title === 'Quick Test Class'
    );
    
    if (instructorClass) {
      console.log('✅ Instructor can see class');
      console.log('   Access Type:', instructorClass.accessType);
      console.log('   Individual Link:', instructorClass.individualUserLink ? 'Available' : 'Missing');
    } else {
      console.log('❌ Instructor cannot see class');
    }
    
    // Summary
    console.log('');
    console.log('📊 QUICK TEST SUMMARY:');
    console.log('======================');
    
    const results = {
      classCreated: !!createResponse.data.liveClass,
      studentAccess: !!studentClass,
      instructorAccess: !!instructorClass,
      individualLinks: !!(studentClass?.individualUserLink),
      correctFormat: studentClass?.individualUserLink?.includes('?iframe=true'),
      roleBasedAccess: studentClass?.accessType === 'participant' && instructorClass?.accessType === 'instructor'
    };
    
    Object.entries(results).forEach(([test, passed]) => {
      console.log(`${passed ? '✅' : '❌'} ${test}`);
    });
    
    const allPassed = Object.values(results).every(r => r === true);
    console.log('');
    console.log(allPassed ? '🎉 ALL TESTS PASSED!' : '⚠️ SOME TESTS FAILED');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

quickTest();
