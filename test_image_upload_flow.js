const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');

// Test configuration
const API_BASE_URL = 'https://lms-backend-724799456037.europe-west1.run.app';
const TEST_IMAGE_PATH = './test_image.jpg'; // Make sure this file exists

console.log('🧪 COMPLETE IMAGE UPLOAD & RENDERING TEST');
console.log('='.repeat(60));

// Helper function to create a test image if it doesn't exist
function createTestImage() {
  if (!fs.existsSync(TEST_IMAGE_PATH)) {
    console.log('📸 Creating test image...');
    // Create a simple 1x1 pixel PNG image
    const pngData = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 pixel
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE,
      0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
      0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00, 0xFF, 0xFF,
      0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82 // IEND
    ]);
    fs.writeFileSync(TEST_IMAGE_PATH, pngData);
    console.log('✅ Test image created');
  }
}

// Test 1: Health Check
async function testHealthCheck() {
  console.log('\n🏥 STEP 1: Health Check');
  console.log('-'.repeat(40));
  
  try {
    const response = await axios.get(`${API_BASE_URL}/api/v1/health`, {
      timeout: 5000
    });
    
    console.log('✅ Server is running');
    console.log(`   Status: ${response.status}`);
    console.log(`   Database: ${response.data.database?.status || 'unknown'}`);
    return true;
  } catch (error) {
    console.log('❌ Server health check failed');
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

// Test 2: Get Categories (needed for course creation)
async function getCategories() {
  console.log('\n📂 STEP 2: Get Categories');
  console.log('-'.repeat(40));
  
  try {
    const response = await axios.get(`${API_BASE_URL}/api/v1/admin/categories`, {
      headers: {
        'Authorization': 'Bearer YOUR_JWT_TOKEN' // You'll need to replace this
      },
      timeout: 5000
    });
    
    const categories = response.data.data || response.data;
    console.log(`✅ Found ${categories.length} categories`);
    
    if (categories.length > 0) {
      const category = categories[0];
      console.log(`   Using category: ${category.name} (${category._id})`);
      
      // Get subcategories
      if (category.subCategories && category.subCategories.length > 0) {
        const subCategory = category.subCategories[0];
        console.log(`   Using subcategory: ${subCategory.name} (${subCategory._id})`);
        return { categoryId: category._id, subCategoryId: subCategory._id };
      }
    }
    
    return null;
  } catch (error) {
    console.log('❌ Failed to get categories');
    console.log(`   Error: ${error.response?.data?.message || error.message}`);
    return null;
  }
}

// Test 3: Upload Batch Course with Image
async function testBatchCourseUpload(categoryData) {
  console.log('\n📤 STEP 3: Upload Batch Course with Image');
  console.log('-'.repeat(40));
  
  if (!categoryData) {
    console.log('❌ Cannot test upload without category data');
    return null;
  }
  
  try {
    createTestImage();
    
    const formData = new FormData();
    
    // Add course data
    formData.append('title', `Test Course ${Date.now()}`);
    formData.append('description', 'Test course with image upload');
    formData.append('batchName', `Test Batch ${Date.now()}`);
    formData.append('category', categoryData.categoryId);
    formData.append('subCategory', categoryData.subCategoryId);
    formData.append('price', '1000');
    formData.append('courseType', 'Batch');
    formData.append('batchSize', '50');
    
    // Add image file
    const imageStream = fs.createReadStream(TEST_IMAGE_PATH);
    formData.append('courseImage', imageStream, {
      filename: 'test-course-image.jpg',
      contentType: 'image/jpeg'
    });
    
    console.log('📤 Uploading batch course with image...');
    
    const response = await axios.post(
      `${API_BASE_URL}/api/v1/admin/batch-courses/create`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': 'Bearer YOUR_JWT_TOKEN' // You'll need to replace this
        },
        timeout: 30000 // 30 seconds for upload
      }
    );
    
    console.log('✅ Batch course uploaded successfully');
    console.log(`   Course ID: ${response.data.data?._id || response.data._id}`);
    console.log(`   Title: ${response.data.data?.title || response.data.title}`);
    
    const courseData = response.data.data || response.data;
    if (courseData.courseImage && courseData.courseImage.length > 0) {
      console.log(`   Image URL: ${courseData.courseImage[0]}`);
      console.log(`   ✅ Image uploaded and stored in database`);
    } else {
      console.log(`   ❌ No image found in response`);
    }
    
    return courseData;
    
  } catch (error) {
    console.log('❌ Batch course upload failed');
    console.log(`   Status: ${error.response?.status}`);
    console.log(`   Error: ${error.response?.data?.message || error.message}`);
    
    if (error.response?.status === 401) {
      console.log('   💡 Hint: You need a valid JWT token for authentication');
    }
    
    return null;
  }
}

// Test 4: Test Streaming Endpoint
async function testImageStreaming(courseId) {
  console.log('\n🌊 STEP 4: Test Image Streaming');
  console.log('-'.repeat(40));
  
  if (!courseId) {
    console.log('❌ Cannot test streaming without course ID');
    return false;
  }
  
  try {
    const streamingUrl = `${API_BASE_URL}/api/v1/stream/course-image/${courseId}`;
    console.log(`📡 Testing: ${streamingUrl}`);
    
    const response = await axios.get(streamingUrl, {
      timeout: 10000,
      responseType: 'stream'
    });
    
    console.log('✅ Image streaming works');
    console.log(`   Status: ${response.status}`);
    console.log(`   Content-Type: ${response.headers['content-type']}`);
    console.log(`   Content-Length: ${response.headers['content-length'] || 'Unknown'}`);
    console.log(`   CORS Headers: ${response.headers['access-control-allow-origin'] || 'Not set'}`);
    
    return true;
    
  } catch (error) {
    console.log('❌ Image streaming failed');
    console.log(`   Status: ${error.response?.status}`);
    console.log(`   Error: ${error.response?.data?.message || error.message}`);
    return false;
  }
}

// Test 5: Verify Database Storage
async function verifyDatabaseStorage(courseId) {
  console.log('\n🗄️  STEP 5: Verify Database Storage');
  console.log('-'.repeat(40));
  
  if (!courseId) {
    console.log('❌ Cannot verify database without course ID');
    return false;
  }
  
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.DB_URL || 'mongodb://localhost:27017/wakad');
    console.log('✅ Connected to MongoDB');
    
    const Course = require('./models/courseModel');
    const course = await Course.findById(courseId);
    
    if (!course) {
      console.log('❌ Course not found in database');
      return false;
    }
    
    console.log('✅ Course found in database');
    console.log(`   Title: ${course.title}`);
    console.log(`   Type: ${course.courseType}`);
    console.log(`   Images: ${course.courseImage?.length || 0}`);
    
    if (course.courseImage && course.courseImage.length > 0) {
      course.courseImage.forEach((img, index) => {
        console.log(`   Image ${index + 1}: ${img}`);
        
        if (img.includes('amazonaws.com')) {
          console.log(`     ✅ Valid S3 URL`);
        } else {
          console.log(`     ⚠️  Not a direct S3 URL`);
        }
      });
      return true;
    } else {
      console.log('❌ No images found in database');
      return false;
    }
    
  } catch (error) {
    console.log('❌ Database verification failed');
    console.log(`   Error: ${error.message}`);
    return false;
  } finally {
    await mongoose.disconnect();
  }
}

// Main test function
async function runCompleteTest() {
  console.log('🚀 Starting Complete Image Upload & Rendering Test\n');
  
  const results = {
    healthCheck: false,
    categoryFetch: false,
    imageUpload: false,
    imageStreaming: false,
    databaseStorage: false
  };
  
  // Step 1: Health Check
  results.healthCheck = await testHealthCheck();
  if (!results.healthCheck) {
    console.log('\n❌ CRITICAL: Server is not running. Please start the backend server first.');
    return;
  }
  
  // Step 2: Get Categories
  const categoryData = await getCategories();
  results.categoryFetch = !!categoryData;
  
  // Step 3: Upload Course with Image
  const courseData = await testBatchCourseUpload(categoryData);
  results.imageUpload = !!courseData;
  
  let courseId = null;
  if (courseData) {
    courseId = courseData._id;
  }
  
  // Step 4: Test Image Streaming
  results.imageStreaming = await testImageStreaming(courseId);
  
  // Step 5: Verify Database Storage
  results.databaseStorage = await verifyDatabaseStorage(courseId);
  
  // Final Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 FINAL TEST RESULTS');
  console.log('='.repeat(60));
  
  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    const testName = test.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    console.log(`${status} ${testName}`);
  });
  
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;
  
  console.log(`\n📈 Overall: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('\n🎉 ALL TESTS PASSED! Image upload and rendering should work perfectly.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the issues above.');
    
    if (!results.healthCheck) {
      console.log('   → Start the backend server: npm start');
    }
    if (!results.categoryFetch) {
      console.log('   → Check JWT token and admin authentication');
    }
    if (!results.imageUpload) {
      console.log('   → Check file upload permissions and S3 configuration');
    }
    if (!results.imageStreaming) {
      console.log('   → Check streaming endpoints and S3 access');
    }
    if (!results.databaseStorage) {
      console.log('   → Check MongoDB connection and data persistence');
    }
  }
  
  // Cleanup
  if (fs.existsSync(TEST_IMAGE_PATH)) {
    fs.unlinkSync(TEST_IMAGE_PATH);
    console.log('\n🧹 Cleaned up test image');
  }
}

// Run the test
runCompleteTest().catch(console.error);
