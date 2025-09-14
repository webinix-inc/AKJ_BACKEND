const axios = require('axios');
const mongoose = require('mongoose');
const Course = require('./models/courseModel');
const Banner = require('./models/bannerModel');
require('dotenv').config();

const BASE_URL = 'http://localhost:8890';

async function testAdminImageRoutes() {
  console.log('🔧 COMPREHENSIVE ADMIN IMAGE ROUTES TESTING');
  console.log('=' .repeat(60));

  try {
    // Connect to MongoDB to get real data
    await mongoose.connect(process.env.DB_URL);
    console.log('✅ Connected to MongoDB');

    // Test 1: Admin Banner Routes
    console.log('\n📋 1. TESTING ADMIN BANNER ROUTES');
    console.log('-'.repeat(40));
    
    try {
      const bannerResponse = await axios.get(`${BASE_URL}/api/v1/admin/banner`);
      console.log('✅ GET /api/v1/admin/banner - Status:', bannerResponse.status);
      
      const banners = bannerResponse.data.data || bannerResponse.data;
      console.log('📊 Banner count:', banners.length);
      
      if (banners.length > 0) {
        const firstBanner = banners[0];
        console.log('🖼️ First banner data:');
        console.log('- ID:', firstBanner._id);
        console.log('- Title:', firstBanner.title || 'No title');
        console.log('- Image:', firstBanner.image || 'No image');
        console.log('- Image type:', typeof firstBanner.image);
        
        // Test banner image streaming
        if (firstBanner._id) {
          const bannerStreamUrl = `${BASE_URL}/api/v1/stream/banner-image/${firstBanner._id}`;
          console.log('🔗 Testing banner streaming:', bannerStreamUrl);
          
          try {
            const streamResponse = await axios.head(bannerStreamUrl);
            console.log('✅ Banner streaming works - Status:', streamResponse.status);
            console.log('📊 Content-Type:', streamResponse.headers['content-type']);
            console.log('📊 Content-Length:', streamResponse.headers['content-length']);
          } catch (streamError) {
            console.log('❌ Banner streaming failed:', streamError.response?.status, streamError.response?.statusText);
          }
        }
      }
    } catch (error) {
      console.error('❌ Banner routes error:', error.response?.status, error.response?.statusText);
    }

    // Test 2: Admin Course Routes
    console.log('\n📋 2. TESTING ADMIN COURSE ROUTES');
    console.log('-'.repeat(40));
    
    try {
      const courseResponse = await axios.get(`${BASE_URL}/api/v1/admin/courses`);
      console.log('✅ GET /api/v1/admin/courses - Status:', courseResponse.status);
      
      const courses = courseResponse.data.data || courseResponse.data;
      console.log('📊 Course count:', courses.length);
      
      if (courses.length > 0) {
        const firstCourse = courses[0];
        console.log('🖼️ First course data:');
        console.log('- ID:', firstCourse._id);
        console.log('- Title:', firstCourse.title || firstCourse.name);
        console.log('- CourseImage:', firstCourse.courseImage);
        console.log('- CourseImage type:', typeof firstCourse.courseImage);
        console.log('- CourseImage length:', firstCourse.courseImage?.length || 0);
        
        // Test course image streaming
        if (firstCourse._id) {
          const courseStreamUrl = `${BASE_URL}/api/v1/stream/course-image/${firstCourse._id}`;
          console.log('🔗 Testing course streaming:', courseStreamUrl);
          
          try {
            const streamResponse = await axios.head(courseStreamUrl);
            console.log('✅ Course streaming works - Status:', streamResponse.status);
            console.log('📊 Content-Type:', streamResponse.headers['content-type']);
            console.log('📊 Content-Length:', streamResponse.headers['content-length']);
          } catch (streamError) {
            console.log('❌ Course streaming failed:', streamError.response?.status, streamError.response?.statusText);
          }
        }
      }
    } catch (error) {
      console.error('❌ Course routes error:', error.response?.status, error.response?.statusText);
    }

    // Test 3: Generic S3 Image Streaming
    console.log('\n📋 3. TESTING GENERIC S3 IMAGE STREAMING');
    console.log('-'.repeat(40));
    
    // Get a real S3 key from a course
    const sampleCourse = await Course.findOne({ courseImage: { $exists: true, $ne: [] } });
    if (sampleCourse && sampleCourse.courseImage && sampleCourse.courseImage.length > 0) {
      const imageUrl = sampleCourse.courseImage[0];
      let s3Key;
      
      if (imageUrl.includes('amazonaws.com/')) {
        s3Key = imageUrl.split('amazonaws.com/')[1];
      } else {
        s3Key = imageUrl;
      }
      
      console.log('🔗 Testing S3 key:', s3Key);
      const s3StreamUrl = `${BASE_URL}/api/v1/stream/image/${encodeURIComponent(s3Key)}`;
      
      try {
        const s3Response = await axios.head(s3StreamUrl);
        console.log('✅ S3 streaming works - Status:', s3Response.status);
        console.log('📊 Content-Type:', s3Response.headers['content-type']);
        console.log('📊 Content-Length:', s3Response.headers['content-length']);
      } catch (s3Error) {
        console.log('❌ S3 streaming failed:', s3Error.response?.status, s3Error.response?.statusText);
      }
    }

    // Test 4: CORS Headers Check
    console.log('\n📋 4. TESTING CORS HEADERS');
    console.log('-'.repeat(40));
    
    const testUrls = [
      `${BASE_URL}/api/v1/admin/banner`,
      `${BASE_URL}/api/v1/admin/courses`
    ];
    
    for (const url of testUrls) {
      try {
        const response = await axios.get(url);
        console.log(`🔗 ${url.split('/').pop()}:`);
        console.log('- Access-Control-Allow-Origin:', response.headers['access-control-allow-origin'] || 'Not set');
        console.log('- Access-Control-Allow-Methods:', response.headers['access-control-allow-methods'] || 'Not set');
        console.log('- Cross-Origin-Resource-Policy:', response.headers['cross-origin-resource-policy'] || 'Not set');
      } catch (error) {
        console.log(`❌ ${url}: ${error.response?.status}`);
      }
    }

    // Test 5: Frontend Integration URLs
    console.log('\n📋 5. TESTING FRONTEND INTEGRATION URLS');
    console.log('-'.repeat(40));
    
    console.log('🔗 Admin Frontend should use:');
    console.log('- API Base:', 'http://localhost:8890/api/v1');
    console.log('- Image Base:', 'http://localhost:8890');
    console.log('- Socket Base:', 'http://localhost:8890');
    
    console.log('\n🔗 User Frontend should use:');
    console.log('- API Base:', 'http://localhost:8890/api/v1');
    console.log('- Image Base:', 'http://localhost:8890');
    console.log('- Socket Base:', 'http://localhost:8890');

    // Test 6: Check if server has all streaming routes
    console.log('\n📋 6. TESTING ALL STREAMING ENDPOINTS');
    console.log('-'.repeat(40));
    
    const streamingEndpoints = [
      '/api/v1/stream/course-image/test',
      '/api/v1/stream/banner-image/test',
      '/api/v1/stream/user-image/test',
      '/api/v1/stream/book-image/test',
      '/api/v1/stream/image/test.jpg'
    ];
    
    for (const endpoint of streamingEndpoints) {
      try {
        await axios.get(`${BASE_URL}${endpoint}`);
        console.log(`✅ ${endpoint} - Route exists`);
      } catch (error) {
        if (error.response?.status === 404 && error.response?.data?.includes('Cannot GET')) {
          console.log(`❌ ${endpoint} - Route NOT FOUND (server needs restart)`);
        } else {
          console.log(`✅ ${endpoint} - Route exists (${error.response?.status})`);
        }
      }
    }

  } catch (error) {
    console.error('❌ General error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

testAdminImageRoutes();
