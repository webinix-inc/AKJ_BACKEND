#!/usr/bin/env node

/**
 * Debug Course Edit Issue - Find Valid Course and Test Edit
 */

const axios = require('axios');

const BASE_URL = 'https://lms-backend-724799456037.europe-west1.run.app/api/v1';
const ADMIN_EMAIL = 'wakade@lms.com';
const ADMIN_PASSWORD = 'wakad@123456';

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
    return true;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    return false;
  }
}

async function getAllCourses() {
  console.log('\n📚 Getting all courses to find valid IDs...');
  
  try {
    const response = await axios.get(`${BASE_URL}/admin/courses`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const courses = response.data.data || response.data;
    console.log('✅ Found courses:', courses.length);
    
    courses.forEach((course, index) => {
      console.log(`${index + 1}. ${course.title} (ID: ${course._id})`);
    });
    
    return courses;
  } catch (error) {
    console.error('❌ Failed to get courses:', error.response?.data || error.message);
    return [];
  }
}

async function testCourseEdit(courseId, courseTitle) {
  console.log(`\n🔧 Testing course edit for: ${courseTitle}`);
  console.log(`📋 Course ID: ${courseId}`);
  
  // Test 1: GET Course
  try {
    console.log('\n📖 Step 1: GET Course Details');
    const getResponse = await axios.get(`${BASE_URL}/admin/courses/${courseId}`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ GET successful - Status:', getResponse.status);
    console.log('📋 Current course data:', {
      title: getResponse.data.data?.title || getResponse.data.title,
      price: getResponse.data.data?.price || getResponse.data.price,
      isPublished: getResponse.data.data?.isPublished || getResponse.data.isPublished
    });
  } catch (error) {
    console.error('❌ GET failed:', error.response?.status, error.response?.data?.message);
    return false;
  }
  
  // Test 2: PUT Course Update (JSON)
  try {
    console.log('\n✏️ Step 2: PUT Course Update (JSON)');
    const updateData = {
      title: `${courseTitle} - Updated ${Date.now()}`,
      description: 'Updated via debug test',
      price: 2999
    };
    
    const putResponse = await axios.put(`${BASE_URL}/admin/courses/${courseId}`, updateData, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ PUT JSON successful - Status:', putResponse.status);
    console.log('📋 Updated title:', putResponse.data.data?.title || putResponse.data.title);
  } catch (error) {
    console.error('❌ PUT JSON failed:', error.response?.status, error.response?.data?.message);
  }
  
  // Test 3: PUT Course Update (FormData - like frontend)
  try {
    console.log('\n📋 Step 3: PUT Course Update (FormData)');
    const FormData = require('form-data');
    const formData = new FormData();
    
    formData.append('title', `${courseTitle} - FormData Updated ${Date.now()}`);
    formData.append('description', 'Updated via FormData debug test');
    formData.append('price', '3299');
    
    const putFormResponse = await axios.put(`${BASE_URL}/admin/courses/${courseId}`, formData, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        ...formData.getHeaders()
      }
    });
    
    console.log('✅ PUT FormData successful - Status:', putFormResponse.status);
    console.log('📋 Updated title:', putFormResponse.data.data?.title || putFormResponse.data.title);
  } catch (error) {
    console.error('❌ PUT FormData failed:', error.response?.status, error.response?.data?.message);
    console.error('📋 Full error details:', JSON.stringify(error.response?.data, null, 2));
  }
  
  return true;
}

async function createTestCourse() {
  console.log('\n➕ Creating a test course for edit testing...');
  
  try {
    const courseData = {
      title: `Debug Test Course ${Date.now()}`,
      description: 'Course created for debugging edit functionality',
      price: 1999,
      category: '68936806de62833c05162761',      // Foundation
      subCategory: '68936816de62833c05162768',   // IIT JEE
      courseType: 'Course'
    };
    
    const response = await axios.post(`${BASE_URL}/admin/courses/add`, courseData, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const newCourseId = response.data.data?._id || response.data._id;
    console.log('✅ Test course created successfully');
    console.log('📋 New course ID:', newCourseId);
    console.log('📋 New course title:', response.data.data?.title || response.data.title);
    
    return { id: newCourseId, title: response.data.data?.title || response.data.title };
  } catch (error) {
    console.error('❌ Failed to create test course:', error.response?.data || error.message);
    return null;
  }
}

async function debugCourseEditIssue() {
  console.log('🔍 DEBUGGING COURSE EDIT ISSUE');
  console.log('=' .repeat(60));
  console.log('Issue: Frontend course edit failing with 404 errors');
  console.log('=' .repeat(60));
  
  // Step 1: Login
  const loginSuccess = await login();
  if (!loginSuccess) {
    console.log('💥 Cannot proceed without login');
    return;
  }
  
  // Step 2: Get all existing courses
  const courses = await getAllCourses();
  
  if (courses.length === 0) {
    console.log('\n⚠️ No existing courses found. Creating a test course...');
    const testCourse = await createTestCourse();
    if (testCourse) {
      await testCourseEdit(testCourse.id, testCourse.title);
    }
  } else {
    // Test with the first existing course
    const firstCourse = courses[0];
    await testCourseEdit(firstCourse._id, firstCourse.title);
  }
  
  console.log('\n📊 DIAGNOSIS');
  console.log('=' .repeat(60));
  console.log('The frontend error is likely due to:');
  console.log('1. ❌ Invalid Course ID in URL (404 Course not found)');
  console.log('2. 🔄 Course was deleted but URL still cached');
  console.log('3. 🔗 Routing issue - wrong course ID being passed');
  console.log('4. 🗄️ Database connection issue');
  console.log('\n💡 SOLUTION:');
  console.log('1. ✅ Use a valid course ID from the list above');
  console.log('2. ✅ Clear browser cache and refresh');
  console.log('3. ✅ Navigate to courses list and click edit again');
  console.log('4. ✅ Check if course exists in admin panel');
}

// Run debug
debugCourseEditIssue().catch(error => {
  console.error('💥 Debug failed:', error.message);
});
