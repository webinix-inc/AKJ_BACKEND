#!/usr/bin/env node

/**
 * Test Course Edit API - Debug Frontend Issues
 */

const axios = require('axios');

const BASE_URL = 'https://lms-backend-724799456037.europe-west1.run.app/api/v1';
const ADMIN_EMAIL = 'AKJAcademy@lms.com';
const ADMIN_PASSWORD = 'wakad@123456';

// Course ID from the URL in screenshot
const COURSE_ID = '6895a12464082902943f4fa0';

let authToken = '';

async function login() {
  console.log('🔐 Logging in...');
  try {
    const response = await axios.post(`${BASE_URL}/admin/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });
    
    authToken = response.data.accessToken;
    console.log('✅ Login successful');
    console.log('📋 Token:', authToken.substring(0, 20) + '...');
    return true;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    return false;
  }
}

async function testGetCourseById() {
  console.log(`\n📖 Testing GET /admin/courses/${COURSE_ID}`);
  
  try {
    const response = await axios.get(`${BASE_URL}/admin/courses/${COURSE_ID}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ GET Course successful');
    console.log('📋 Status:', response.status);
    console.log('📋 Course data:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('❌ GET Course failed');
    console.error('📋 Status:', error.response?.status);
    console.error('📋 Error:', JSON.stringify(error.response?.data, null, 2));
    return null;
  }
}

async function testUpdateCourse() {
  console.log(`\n✏️ Testing PUT /admin/courses/${COURSE_ID}`);
  
  const updateData = {
    title: 'JEE 2025-2027 Batch - Updated via API Test',
    description: 'Updated description via API test',
    price: 3600,
    discount: 10
  };
  
  console.log('📋 Update data:', JSON.stringify(updateData, null, 2));
  
  try {
    const response = await axios.put(`${BASE_URL}/admin/courses/${COURSE_ID}`, updateData, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ PUT Course successful');
    console.log('📋 Status:', response.status);
    console.log('📋 Updated course:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('❌ PUT Course failed');
    console.error('📋 Status:', error.response?.status);
    console.error('📋 Error:', JSON.stringify(error.response?.data, null, 2));
    console.error('📋 Full error:', error.message);
    return null;
  }
}

async function testUpdateCourseWithFormData() {
  console.log(`\n📋 Testing PUT /admin/courses/${COURSE_ID} with FormData`);
  
  const FormData = require('form-data');
  const formData = new FormData();
  
  formData.append('title', 'JEE 2025-2027 Batch - FormData Test');
  formData.append('description', 'Updated via FormData test');
  formData.append('price', '3700');
  formData.append('discount', '15');
  
  console.log('📋 Using FormData for update');
  
  try {
    const response = await axios.put(`${BASE_URL}/admin/courses/${COURSE_ID}`, formData, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        ...formData.getHeaders()
      }
    });
    
    console.log('✅ PUT Course with FormData successful');
    console.log('📋 Status:', response.status);
    console.log('📋 Updated course:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('❌ PUT Course with FormData failed');
    console.error('📋 Status:', error.response?.status);
    console.error('📋 Error:', JSON.stringify(error.response?.data, null, 2));
    console.error('📋 Full error:', error.message);
    return null;
  }
}

async function testCourseEditEndpoints() {
  console.log('🚀 TESTING COURSE EDIT API ENDPOINTS');
  console.log('=' .repeat(60));
  console.log(`Course ID: ${COURSE_ID}`);
  console.log('=' .repeat(60));
  
  // Step 1: Login
  const loginSuccess = await login();
  if (!loginSuccess) {
    console.log('💥 Cannot proceed without login');
    return;
  }
  
  // Step 2: Test GET course
  const courseData = await testGetCourseById();
  
  // Step 3: Test PUT course with JSON
  await testUpdateCourse();
  
  // Step 4: Test PUT course with FormData (like frontend)
  await testUpdateCourseWithFormData();
  
  console.log('\n📊 SUMMARY');
  console.log('=' .repeat(60));
  console.log('If GET works but PUT fails, there might be:');
  console.log('1. Authentication issues with PUT endpoint');
  console.log('2. Validation errors in the update data');
  console.log('3. Middleware issues (file upload, body parsing)');
  console.log('4. Database connection issues');
  console.log('5. Course ID format issues');
}

// Alternative curl-like test using pure HTTP
async function testWithCurl() {
  console.log('\n🔧 CURL-STYLE TESTS');
  console.log('=' .repeat(40));
  
  if (!authToken) {
    console.log('❌ No auth token available');
    return;
  }
  
  // Test 1: GET Course
  console.log('\n📖 CURL Test: GET Course');
  console.log(`curl -X GET "${BASE_URL}/admin/courses/${COURSE_ID}" \\`);
  console.log(`  -H "Authorization: Bearer ${authToken.substring(0, 20)}..." \\`);
  console.log(`  -H "Content-Type: application/json"`);
  
  // Test 2: PUT Course
  console.log('\n✏️ CURL Test: PUT Course');
  console.log(`curl -X PUT "${BASE_URL}/admin/courses/${COURSE_ID}" \\`);
  console.log(`  -H "Authorization: Bearer ${authToken.substring(0, 20)}..." \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"title":"Test Update","description":"Test","price":3600}'`);
}

// Run tests
testCourseEditEndpoints().then(() => {
  testWithCurl();
}).catch(error => {
  console.error('💥 Test failed:', error.message);
});
