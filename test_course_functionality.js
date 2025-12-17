#!/usr/bin/env node

/**
 * Comprehensive Course Functionality Test Script
 * Tests: Creation, Editing, Publishing/Unpublishing, FAQ Management, Deletion
 */

const axios = require('axios');

const BASE_URL = 'https://lms-backend-724799456037.europe-west1.run.app/api/v1';
const ADMIN_EMAIL = 'AKJAcademy@lms.com';
const ADMIN_PASSWORD = 'wakad@123456';

let authToken = '';
let testCourseId = '';
let testFaqId = '';

// Test data
const testCourseData = {
  title: `Test Course ${Date.now()}`,
  description: 'This is a comprehensive test course for functionality verification',
  price: 999,
  discount: 10,
  courseDuration: '3 months',
  category: '', // Will be set after fetching categories
  subCategory: '', // Will be set after fetching subcategories
  courseType: 'Course' // Regular course, not batch
};

const testFaqData = {
  question: 'What is this test course about?',
  answer: 'This is a test course created for functionality verification.',
  category: 'General'
};

// Helper function to make authenticated requests
const makeRequest = async (method, url, data = null) => {
  try {
    const config = {
      method,
      url: `${BASE_URL}${url}`,
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`❌ ${method.toUpperCase()} ${url} failed:`, error.response?.data || error.message);
    throw error;
  }
};

// Step 1: Admin Login
async function loginAdmin() {
  console.log('\n🔐 Step 1: Admin Login');
  try {
    const response = await axios.post(`${BASE_URL}/admin/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });
    
    authToken = response.data.accessToken;
    console.log('✅ Admin login successful');
    console.log('📋 Admin details:', {
      name: response.data.firstName + ' ' + response.data.lastName,
      email: response.data.email,
      role: response.data.role
    });
    
    return true;
  } catch (error) {
    console.error('❌ Admin login failed:', error.response?.data || error.message);
    return false;
  }
}

// Step 2: Fetch Categories and Subcategories
async function fetchCategoriesAndSubcategories() {
  console.log('\n📂 Step 2: Fetch Categories and Subcategories');
  try {
    // Fetch categories
    const categoriesResponse = await makeRequest('GET', '/admin/Category');
    const categories = categoriesResponse.data || categoriesResponse;
    
    if (categories.length === 0) {
      console.log('⚠️ No categories found, creating default category');
      const newCategory = await makeRequest('POST', '/admin/Category/create', {
        name: 'Test Category',
        description: 'Default test category'
      });
      testCourseData.category = newCategory.data._id;
    } else {
      testCourseData.category = categories[0]._id;
      console.log('✅ Using category:', categories[0].name);
    }
    
    // Fetch subcategories for the selected category
    const subcategoriesResponse = await makeRequest('GET', `/admin/SubCategory/${testCourseData.category}`);
    const subcategories = subcategoriesResponse.data || subcategoriesResponse;
    
    if (subcategories.length === 0) {
      console.log('⚠️ No subcategories found, creating default subcategory');
      const newSubcategory = await makeRequest('POST', '/admin/SubCategory/create', {
        name: 'Test Subcategory',
        description: 'Default test subcategory',
        category: testCourseData.category
      });
      testCourseData.subCategory = newSubcategory.data._id;
    } else {
      testCourseData.subCategory = subcategories[0]._id;
      console.log('✅ Using subcategory:', subcategories[0].name);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Failed to fetch categories/subcategories:', error.message);
    return false;
  }
}

// Step 3: Create Course
async function createCourse() {
  console.log('\n➕ Step 3: Create Course');
  try {
    const response = await makeRequest('POST', '/admin/courses/create', testCourseData);
    testCourseId = response.data._id || response._id;
    
    console.log('✅ Course created successfully');
    console.log('📋 Course details:', {
      id: testCourseId,
      title: response.data?.title || response.title,
      price: response.data?.price || response.price,
      category: response.data?.category || response.category,
      isPublished: response.data?.isPublished || response.isPublished
    });
    
    return true;
  } catch (error) {
    console.error('❌ Course creation failed:', error.message);
    return false;
  }
}

// Step 4: Fetch Course Details
async function fetchCourseDetails() {
  console.log('\n📖 Step 4: Fetch Course Details');
  try {
    const response = await makeRequest('GET', `/admin/courses/${testCourseId}`);
    
    console.log('✅ Course fetched successfully');
    console.log('📋 Course details:', {
      id: response.data?._id || response._id,
      title: response.data?.title || response.title,
      description: response.data?.description || response.description,
      isPublished: response.data?.isPublished || response.isPublished,
      price: response.data?.price || response.price
    });
    
    return true;
  } catch (error) {
    console.error('❌ Course fetch failed:', error.message);
    return false;
  }
}

// Step 5: Update Course
async function updateCourse() {
  console.log('\n✏️ Step 5: Update Course');
  try {
    const updateData = {
      title: `${testCourseData.title} - Updated`,
      description: 'This course has been updated for testing purposes',
      price: 1299
    };
    
    const response = await makeRequest('PUT', `/admin/courses/${testCourseId}`, updateData);
    
    console.log('✅ Course updated successfully');
    console.log('📋 Updated details:', {
      title: response.data?.title || response.title,
      description: response.data?.description || response.description,
      price: response.data?.price || response.price
    });
    
    return true;
  } catch (error) {
    console.error('❌ Course update failed:', error.message);
    return false;
  }
}

// Step 6: Publish Course
async function publishCourse() {
  console.log('\n📢 Step 6: Publish Course');
  try {
    const response = await makeRequest('PUT', `/admin/courses/publish/${testCourseId}`, {
      isPublished: true
    });
    
    console.log('✅ Course published successfully');
    console.log('📋 Publish status:', {
      isPublished: response.data?.isPublished || response.isPublished,
      message: response.message
    });
    
    return true;
  } catch (error) {
    console.error('❌ Course publish failed:', error.message);
    return false;
  }
}

// Step 7: Unpublish Course
async function unpublishCourse() {
  console.log('\n📝 Step 7: Unpublish Course');
  try {
    const response = await makeRequest('PUT', `/admin/courses/publish/${testCourseId}`, {
      isPublished: false
    });
    
    console.log('✅ Course unpublished successfully');
    console.log('📋 Publish status:', {
      isPublished: response.data?.isPublished || response.isPublished,
      message: response.message
    });
    
    return true;
  } catch (error) {
    console.error('❌ Course unpublish failed:', error.message);
    return false;
  }
}

// Step 8: Add FAQ
async function addFaq() {
  console.log('\n❓ Step 8: Add FAQ');
  try {
    const faqData = {
      ...testFaqData,
      course: testCourseId
    };
    
    const response = await makeRequest('POST', '/admin/faqs', faqData);
    testFaqId = response.data._id || response._id;
    
    console.log('✅ FAQ added successfully');
    console.log('📋 FAQ details:', {
      id: testFaqId,
      question: response.data?.question || response.question,
      answer: response.data?.answer || response.answer,
      category: response.data?.category || response.category
    });
    
    return true;
  } catch (error) {
    console.error('❌ FAQ creation failed:', error.message);
    return false;
  }
}

// Step 9: Update FAQ
async function updateFaq() {
  console.log('\n✏️ Step 9: Update FAQ');
  try {
    const updateData = {
      question: 'What is this updated test course about?',
      answer: 'This is an updated test course created for comprehensive functionality verification.',
      category: 'General'
    };
    
    const response = await makeRequest('PUT', `/admin/faqs/${testFaqId}`, updateData);
    
    console.log('✅ FAQ updated successfully');
    console.log('📋 Updated FAQ:', {
      question: response.data?.question || response.question,
      answer: response.data?.answer || response.answer
    });
    
    return true;
  } catch (error) {
    console.error('❌ FAQ update failed:', error.message);
    return false;
  }
}

// Step 10: Fetch Course FAQs
async function fetchCourseFaqs() {
  console.log('\n📋 Step 10: Fetch Course FAQs');
  try {
    const response = await makeRequest('GET', `/admin/faqs/${testCourseId}`);
    const faqs = response.data || response;
    
    console.log('✅ FAQs fetched successfully');
    console.log('📋 FAQ count:', faqs.length);
    
    if (faqs.length > 0) {
      console.log('📋 First FAQ:', {
        question: faqs[0].question,
        answer: faqs[0].answer.substring(0, 50) + '...'
      });
    }
    
    return true;
  } catch (error) {
    console.error('❌ FAQ fetch failed:', error.message);
    return false;
  }
}

// Step 11: Delete FAQ
async function deleteFaq() {
  console.log('\n🗑️ Step 11: Delete FAQ');
  try {
    const response = await makeRequest('DELETE', `/admin/faqs/${testFaqId}`);
    
    console.log('✅ FAQ deleted successfully');
    console.log('📋 Delete response:', response.message);
    
    return true;
  } catch (error) {
    console.error('❌ FAQ deletion failed:', error.message);
    return false;
  }
}

// Step 12: Delete Course
async function deleteCourse() {
  console.log('\n🗑️ Step 12: Delete Course');
  try {
    const response = await makeRequest('DELETE', `/admin/courses/${testCourseId}`);
    
    console.log('✅ Course deleted successfully');
    console.log('📋 Delete response:', response.message || 'Course deleted');
    
    return true;
  } catch (error) {
    console.error('❌ Course deletion failed:', error.message);
    return false;
  }
}

// Main test execution
async function runTests() {
  console.log('🚀 Starting Comprehensive Course Functionality Tests');
  console.log('=' .repeat(60));
  
  const tests = [
    { name: 'Admin Login', fn: loginAdmin },
    { name: 'Fetch Categories', fn: fetchCategoriesAndSubcategories },
    { name: 'Create Course', fn: createCourse },
    { name: 'Fetch Course', fn: fetchCourseDetails },
    { name: 'Update Course', fn: updateCourse },
    { name: 'Publish Course', fn: publishCourse },
    { name: 'Unpublish Course', fn: unpublishCourse },
    { name: 'Add FAQ', fn: addFaq },
    { name: 'Update FAQ', fn: updateFaq },
    { name: 'Fetch FAQs', fn: fetchCourseFaqs },
    { name: 'Delete FAQ', fn: deleteFaq },
    { name: 'Delete Course', fn: deleteCourse }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const success = await test.fn();
      if (success) {
        passed++;
        console.log(`✅ ${test.name} - PASSED`);
      } else {
        failed++;
        console.log(`❌ ${test.name} - FAILED`);
      }
    } catch (error) {
      failed++;
      console.log(`❌ ${test.name} - FAILED (${error.message})`);
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('=' .repeat(60));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Course functionality is working correctly.');
  } else {
    console.log('\n⚠️ Some tests failed. Please check the logs above for details.');
  }
}

// Run the tests
runTests().catch(error => {
  console.error('💥 Test execution failed:', error.message);
  process.exit(1);
});
