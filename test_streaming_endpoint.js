const axios = require('axios');

async function testStreamingEndpoint() {
  try {
    console.log('🔧 Testing Course Image Streaming Endpoint...');
    
    const courseId = '6895a124640829b294034fa0';
    const streamingUrl = `http://localhost:8890/api/v1/stream/course-image/${courseId}`;
    
    console.log(`🔍 Testing URL: ${streamingUrl}`);
    
    // Test the streaming endpoint
    const response = await axios.get(streamingUrl, {
      timeout: 10000,
      responseType: 'arraybuffer', // For binary data
      headers: {
        'Accept': 'image/*',
      }
    });
    
    console.log('✅ Streaming endpoint works!');
    console.log('📊 Response info:');
    console.log('- Status:', response.status);
    console.log('- Content-Type:', response.headers['content-type']);
    console.log('- Content-Length:', response.headers['content-length']);
    console.log('- Data length:', response.data.length);
    console.log('- CORS headers:');
    console.log('  - Access-Control-Allow-Origin:', response.headers['access-control-allow-origin']);
    console.log('  - Cross-Origin-Resource-Policy:', response.headers['cross-origin-resource-policy']);
    
  } catch (error) {
    console.error('❌ Streaming endpoint error:');
    
    if (error.response) {
      console.error('📊 Response error:');
      console.error('- Status:', error.response.status);
      console.error('- Status Text:', error.response.statusText);
      console.error('- Headers:', error.response.headers);
      console.error('- Data:', error.response.data?.toString() || 'No data');
    } else if (error.request) {
      console.error('📡 Request error:');
      console.error('- No response received');
      console.error('- Request:', error.request);
    } else {
      console.error('⚙️ Setup error:');
      console.error('- Message:', error.message);
    }
    
    console.error('🔍 Full error:', error);
  }
}

testStreamingEndpoint();
