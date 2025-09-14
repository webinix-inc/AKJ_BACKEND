// 🧪 Quick test to verify routes are properly configured
const express = require('express');

// Test route loading
try {
  console.log('🧪 Testing route configuration...');
  
  // Test if questionController exports the new function
  const questionController = require('./controllers/questionController');
  
  if (typeof questionController.uploadQuestionsFromS3 === 'function') {
    console.log('✅ uploadQuestionsFromS3 function exists');
  } else {
    console.log('❌ uploadQuestionsFromS3 function missing');
  }
  
  if (typeof questionController.uploadQuestionsFromWord === 'function') {
    console.log('✅ uploadQuestionsFromWord function exists (legacy)');
  } else {
    console.log('❌ uploadQuestionsFromWord function missing');
  }
  
  // Test route file loading
  const app = express();
  
  // Mock authJwt middleware
  const authJwt = {
    verifyToken: (req, res, next) => next()
  };
  
  // Load routes
  require('./routes/quizRoutes')(app);
  
  // Check if routes are registered
  const routes = [];
  app._router.stack.forEach(function(middleware) {
    if (middleware.route) {
      routes.push({
        method: Object.keys(middleware.route.methods)[0].toUpperCase(),
        path: middleware.route.path
      });
    }
  });
  
  console.log('\n📋 Registered Routes:');
  routes.forEach(route => {
    if (route.path.includes('upload-questions')) {
      console.log(`   ${route.method} ${route.path}`);
    }
  });
  
  // Check for the specific routes we need
  const newRoute = routes.find(r => r.path === '/api/v1/admin/quizzes/:quizId/upload-questions' && r.method === 'POST');
  const legacyRoute = routes.find(r => r.path === '/api/v1/admin/quizzes/:quizId/upload-questions-legacy' && r.method === 'POST');
  
  if (newRoute) {
    console.log('✅ New S3-based route registered correctly');
  } else {
    console.log('❌ New S3-based route NOT found');
  }
  
  if (legacyRoute) {
    console.log('✅ Legacy route registered correctly');
  } else {
    console.log('❌ Legacy route NOT found');
  }
  
  console.log('\n🎯 Route Configuration Status: READY FOR TESTING');
  
} catch (error) {
  console.error('❌ Error testing routes:', error.message);
  console.error('Stack:', error.stack);
}
