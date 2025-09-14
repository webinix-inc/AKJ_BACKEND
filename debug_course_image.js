const mongoose = require('mongoose');
const Course = require('./models/courseModel');
require('dotenv').config();

async function debugCourseImage() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.DB_URL);
    console.log('✅ Connected to MongoDB');

    // The course ID from the error
    const courseId = '6895a124640829b294034fa0';
    
    console.log(`🔍 Checking course: ${courseId}`);
    
    // Find the course
    const course = await Course.findById(courseId);
    
    if (!course) {
      console.log('❌ Course not found');
      return;
    }
    
    console.log('✅ Course found:', course.name);
    console.log('📊 Course data:');
    console.log('- ID:', course._id);
    console.log('- Name:', course.name);
    console.log('- CourseImage field exists:', !!course.courseImage);
    console.log('- CourseImage type:', typeof course.courseImage);
    console.log('- CourseImage length:', course.courseImage?.length || 0);
    
    if (course.courseImage && course.courseImage.length > 0) {
      console.log('🖼️ Course images:');
      course.courseImage.forEach((img, index) => {
        console.log(`  ${index + 1}. ${img}`);
        
        // Check if it's a full S3 URL or just a key
        if (img.includes('amazonaws.com/')) {
          const s3Key = img.split('amazonaws.com/')[1];
          console.log(`     S3 Key: ${s3Key}`);
        } else {
          console.log(`     Assumed S3 Key: ${img}`);
        }
      });
    } else {
      console.log('❌ No course images found');
    }
    
    // Check other image-related fields
    console.log('\n📋 Other fields:');
    console.log('- Image field:', course.image || 'Not set');
    console.log('- Thumbnail field:', course.thumbnail || 'Not set');
    
    console.log('\n🔧 Streaming URL that should work:');
    console.log(`http://localhost:8890/api/v1/stream/course-image/${courseId}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

debugCourseImage();
