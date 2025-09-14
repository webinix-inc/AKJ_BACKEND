const mongoose = require('mongoose');
const Course = require('../models/courseModel');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/wakad', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Fix invalid courseType values
const fixCourseTypes = async () => {
  try {
    console.log('🔍 Checking for courses with invalid courseType values...');
    
    // Find all courses
    const allCourses = await Course.find({}).select('_id title courseType');
    console.log(`📊 Total courses found: ${allCourses.length}`);
    
    // Valid courseType values according to the model
    const validCourseTypes = ['Free', 'Paid', 'Batch'];
    
    // Find courses with invalid courseType
    const invalidCourses = allCourses.filter(course => 
      course.courseType && !validCourseTypes.includes(course.courseType)
    );
    
    console.log(`❌ Courses with invalid courseType: ${invalidCourses.length}`);
    
    if (invalidCourses.length > 0) {
      console.log('Invalid courses:');
      invalidCourses.forEach(course => {
        console.log(`  - ${course.title} (ID: ${course._id}) - courseType: "${course.courseType}"`);
      });
      
      // Fix invalid courseTypes
      console.log('\n🔧 Fixing invalid courseType values...');
      
      for (const course of invalidCourses) {
        let newCourseType = 'Paid'; // Default to Paid
        
        // Try to determine the correct type based on the invalid value
        if (course.courseType === 'Course' || course.courseType === 'course') {
          newCourseType = 'Paid'; // Assume regular courses are Paid
        } else if (course.courseType === 'free' || course.courseType === 'Free Course') {
          newCourseType = 'Free';
        } else if (course.courseType === 'batch' || course.courseType === 'Batch Course') {
          newCourseType = 'Batch';
        }
        
        // Update the course without validation
        await Course.findByIdAndUpdate(
          course._id,
          { courseType: newCourseType },
          { runValidators: false }
        );
        
        console.log(`  ✅ Updated "${course.title}": "${course.courseType}" → "${newCourseType}"`);
      }
      
      console.log(`\n🎉 Fixed ${invalidCourses.length} courses with invalid courseType values`);
    } else {
      console.log('✅ All courses have valid courseType values');
    }
    
    // Also check for courses without courseType
    const coursesWithoutType = allCourses.filter(course => !course.courseType);
    
    if (coursesWithoutType.length > 0) {
      console.log(`\n🔧 Found ${coursesWithoutType.length} courses without courseType, setting to 'Paid'...`);
      
      for (const course of coursesWithoutType) {
        await Course.findByIdAndUpdate(
          course._id,
          { courseType: 'Paid' },
          { runValidators: false }
        );
        console.log(`  ✅ Set courseType for "${course.title}" to "Paid"`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error fixing courseType values:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await fixCourseTypes();
  
  console.log('\n✅ Course type fix completed');
  process.exit(0);
};

// Run the script
main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
