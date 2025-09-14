const express = require('express');
const streamController = require('./controllers/streamController');

// Create a test app to check route registration
const app = express();

console.log('🔧 Testing route registration...');

// Check if streamController has the required functions
console.log('📊 StreamController functions:');
console.log('- streamCourseImage:', typeof streamController.streamCourseImage);
console.log('- streamUserImage:', typeof streamController.streamUserImage);
console.log('- streamBannerImage:', typeof streamController.streamBannerImage);
console.log('- streamBookImage:', typeof streamController.streamBookImage);
console.log('- streamS3Image:', typeof streamController.streamS3Image);

// Test route registration
try {
  // CORS middleware for image streaming routes only (publicly accessible)
  const imageStreamingCORS = (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    next();
  };

  // Try to register the route
  app.get("/api/v1/stream/course-image/:courseId", imageStreamingCORS, streamController.streamCourseImage);
  
  console.log('✅ Route registered successfully');
  
  // List all registered routes
  console.log('\n📋 Registered routes:');
  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
      console.log(`- ${methods} ${middleware.route.path}`);
    }
  });
  
} catch (error) {
  console.error('❌ Route registration failed:', error);
}

console.log('\n🔍 Checking if the function exists and is callable:');
if (typeof streamController.streamCourseImage === 'function') {
  console.log('✅ streamCourseImage is a function');
} else {
  console.log('❌ streamCourseImage is not a function:', typeof streamController.streamCourseImage);
}
