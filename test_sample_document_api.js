require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Create a test server
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add the sample document routes
require('./routes/sampleDocumentRoutes')(app);

async function testSampleDocumentAPI() {
  console.log('🧪 TESTING SAMPLE DOCUMENT API...\n');
  
  // Start test server
  const server = app.listen(3001, () => {
    console.log('🚀 Test server running on port 3001');
  });
  
  try {
    // Test the API endpoints
    const axios = require('axios');
    const baseURL = 'http://localhost:3001/api/v1';
    
    console.log('📊 Testing sample document info endpoint...');
    
    try {
      const infoResponse = await axios.get(`${baseURL}/sample-document/info`);
      console.log('✅ Sample document info API works!');
      console.log(`📋 Response status: ${infoResponse.status}`);
      console.log(`📄 File name: ${infoResponse.data.info.fileName}`);
      console.log(`📝 Questions: ${infoResponse.data.info.questionCount}`);
      console.log(`📊 Options: ${infoResponse.data.info.optionCount}`);
      console.log(`🧮 Math expressions: ${infoResponse.data.info.mathExpressions}`);
      console.log(`📏 File size: ${infoResponse.data.info.fileSize} bytes`);
    } catch (error) {
      console.error('❌ Info API error:', error.message);
    }
    
    console.log('\n📥 Testing sample document download endpoint...');
    
    try {
      const downloadResponse = await axios.get(`${baseURL}/sample-document/download`);
      console.log('✅ Sample document download API works!');
      console.log(`📋 Response status: ${downloadResponse.status}`);
      console.log(`📄 Content type: ${downloadResponse.headers['content-type']}`);
      console.log(`📏 Content length: ${downloadResponse.data.length} characters`);
      
      // Check if content has the expected structure
      const content = downloadResponse.data;
      const questionCount = (content.match(/Question \d+/g) || []).length;
      const optionCount = (content.match(/Option\t/g) || []).length;
      const correctAnswers = (content.match(/\tCorrect/g) || []).length;
      
      console.log(`📝 Questions in download: ${questionCount}`);
      console.log(`📊 Options in download: ${optionCount}`);
      console.log(`✅ Correct answers: ${correctAnswers}`);
      
      // Show sample content
      console.log('\n📄 Sample content preview:');
      console.log('='.repeat(50));
      console.log(content.substring(0, 300) + '...');
      
    } catch (error) {
      console.error('❌ Download API error:', error.message);
    }
    
    // Test validation function
    console.log('\n🔍 Testing document validation...');
    
    const { validateDocumentFormat } = require('./controllers/sampleDocumentController');
    
    const validContent = `Question 1
Test question with x² + 5x = 0

Option\tA) x = 0, x = -5\tCorrect
Option\tB) x = 1, x = 5\tIncorrect
Option\tC) x = 2, x = 3\tIncorrect
Option\tD) x = -1, x = -5\tIncorrect`;

    const validation = validateDocumentFormat(validContent);
    console.log('📊 Validation result:');
    console.log(`   ✅ Valid: ${validation.isValid}`);
    console.log(`   📝 Questions: ${validation.questionCount}`);
    console.log(`   📊 Options: ${validation.optionCount}`);
    console.log(`   ❌ Errors: ${validation.errors.length}`);
    console.log(`   ⚠️ Warnings: ${validation.warnings.length}`);
    
    if (validation.errors.length > 0) {
      console.log('   Errors:', validation.errors);
    }
    if (validation.warnings.length > 0) {
      console.log('   Warnings:', validation.warnings);
    }
    
    // Test invalid content
    console.log('\n🔍 Testing invalid document validation...');
    
    const invalidContent = `Question 1
Test question

Option\tA) Option 1\tCorrect
Option\tB) Option 2\tCorrect
Option\tC) Option 3\tIncorrect`;

    const invalidValidation = validateDocumentFormat(invalidContent);
    console.log('📊 Invalid validation result:');
    console.log(`   ✅ Valid: ${invalidValidation.isValid}`);
    console.log(`   ❌ Errors: ${invalidValidation.errors.length}`);
    
    if (invalidValidation.errors.length > 0) {
      console.log('   Expected errors:');
      invalidValidation.errors.forEach((error, index) => {
        console.log(`      ${index + 1}. ${error}`);
      });
    }
    
    console.log('\n✅ SAMPLE DOCUMENT API TESTING COMPLETE!');
    console.log('\n📋 API ENDPOINTS AVAILABLE:');
    console.log('   GET /api/v1/sample-document/info - Get document information');
    console.log('   GET /api/v1/sample-document/download - Download sample template');
    console.log('   GET /api/v1/admin/sample-document/info - Admin info (requires auth)');
    console.log('   GET /api/v1/admin/sample-document/download - Admin download (requires auth)');
    
    console.log('\n🌐 FRONTEND INTEGRATION:');
    console.log('   1. Add "Download Sample" button in admin upload modal');
    console.log('   2. Call info API to show document details');
    console.log('   3. Use download API to serve the template file');
    console.log('   4. Display instructions and format requirements');
    
  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    // Close test server
    server.close(() => {
      console.log('🛑 Test server closed');
      process.exit(0);
    });
  }
}

// Run the test
testSampleDocumentAPI();
