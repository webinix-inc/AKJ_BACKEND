const http = require('http');
const https = require('https');

// Test configuration
const API_BASE_URL = 'http://localhost:8890';
const TEST_COURSE_ID = '6751b5b4b5a6b8b5a6b8b5a6'; // Replace with actual course ID
const TEST_BANNER_ID = '6751b5b4b5a6b8b5a6b8b5a7'; // Replace with actual banner ID

console.log('🧪 Testing Image Streaming Endpoints\n');
console.log('='.repeat(60));

// Helper function to make HTTP requests
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const req = protocol.get(url, (res) => {
      console.log(`📡 ${url}`);
      console.log(`   Status: ${res.statusCode} ${res.statusMessage}`);
      console.log(`   Content-Type: ${res.headers['content-type'] || 'Not set'}`);
      console.log(`   Content-Length: ${res.headers['content-length'] || 'Not set'}`);
      console.log(`   CORS Headers: ${res.headers['access-control-allow-origin'] || 'Not set'}`);
      
      if (res.statusCode === 200) {
        console.log('   ✅ SUCCESS');
      } else {
        console.log('   ❌ FAILED');
      }
      
      resolve({
        status: res.statusCode,
        headers: res.headers,
        url: url
      });
    });
    
    req.on('error', (err) => {
      console.log(`📡 ${url}`);
      console.log(`   ❌ ERROR: ${err.message}`);
      resolve({
        status: 'ERROR',
        error: err.message,
        url: url
      });
    });
    
    req.setTimeout(10000, () => {
      console.log(`📡 ${url}`);
      console.log(`   ⏰ TIMEOUT`);
      req.destroy();
      resolve({
        status: 'TIMEOUT',
        url: url
      });
    });
  });
}

async function testEndpoints() {
  const endpoints = [
    // Health check
    `${API_BASE_URL}/api/v1/health`,
    
    // Course image streaming
    `${API_BASE_URL}/api/v1/stream/course-image/${TEST_COURSE_ID}`,
    
    // Banner image streaming
    `${API_BASE_URL}/api/v1/stream/banner-image/${TEST_BANNER_ID}`,
    
    // Generic S3 image streaming
    `${API_BASE_URL}/api/v1/stream/image/test-image.jpg?folder=images/course`,
  ];
  
  console.log(`\n🎯 Testing ${endpoints.length} endpoints...\n`);
  
  const results = [];
  
  for (const endpoint of endpoints) {
    const result = await makeRequest(endpoint);
    results.push(result);
    console.log(''); // Empty line for readability
    
    // Wait a bit between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Summary
  console.log('='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => r.status === 200).length;
  const failed = results.filter(r => r.status !== 200).length;
  
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${results.length}`);
  
  if (failed > 0) {
    console.log('\n🔍 Failed Endpoints:');
    results.filter(r => r.status !== 200).forEach(r => {
      console.log(`   - ${r.url} (${r.status})`);
    });
  }
  
  // Recommendations
  console.log('\n💡 RECOMMENDATIONS:');
  
  if (results[0].status !== 200) {
    console.log('   1. ❌ Backend server is not running on port 8890');
    console.log('      → Start the backend server: npm start');
  } else {
    console.log('   1. ✅ Backend server is running');
  }
  
  const imageEndpoints = results.slice(1);
  const workingImages = imageEndpoints.filter(r => r.status === 200).length;
  
  if (workingImages === 0) {
    console.log('   2. ❌ No image endpoints are working');
    console.log('      → Check MongoDB connection and course/banner data');
    console.log('      → Verify S3 credentials and bucket access');
  } else if (workingImages < imageEndpoints.length) {
    console.log('   3. ⚠️  Some image endpoints are not working');
    console.log('      → Check if test course/banner IDs exist in database');
  } else {
    console.log('   2. ✅ All image endpoints are working');
  }
}

// Run the test
testEndpoints().catch(console.error);
