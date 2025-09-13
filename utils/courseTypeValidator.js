const Course = require('../models/courseModel');

/**
 * Valid courseType enum values according to the Course model
 */
const VALID_COURSE_TYPES = ['Free', 'Paid', 'Batch'];

/**
 * Fix invalid courseType values for a course
 * @param {string} courseId - The course ID
 * @returns {Promise<string|null>} - The corrected courseType or null if no fix was needed
 */
const fixInvalidCourseType = async (courseId) => {
  try {
    const course = await Course.findById(courseId).select('courseType title');
    
    if (!course) {
      throw new Error('Course not found');
    }
    
    // Check if courseType is invalid
    if (course.courseType && !VALID_COURSE_TYPES.includes(course.courseType)) {
      console.log(`⚠️ Found invalid courseType "${course.courseType}" for course "${course.title}"`);
      
      // Determine the correct courseType based on the invalid value
      let correctedCourseType = 'Paid'; // Default
      
      const lowerCaseType = course.courseType.toLowerCase();
      
      if (lowerCaseType === 'course' || lowerCaseType === 'regular') {
        correctedCourseType = 'Paid';
      } else if (lowerCaseType.includes('free')) {
        correctedCourseType = 'Free';
      } else if (lowerCaseType.includes('batch')) {
        correctedCourseType = 'Batch';
      }
      
      // Update the courseType without validation
      await Course.findByIdAndUpdate(
        courseId,
        { courseType: correctedCourseType },
        { runValidators: false }
      );
      
      console.log(`✅ Fixed courseType for "${course.title}": "${course.courseType}" → "${correctedCourseType}"`);
      return correctedCourseType;
    }
    
    return null; // No fix needed
  } catch (error) {
    console.error(`❌ Error fixing courseType for course ${courseId}:`, error);
    throw error;
  }
};

/**
 * Fix all courses with invalid courseType values
 * @returns {Promise<number>} - Number of courses fixed
 */
const fixAllInvalidCourseTypes = async () => {
  try {
    console.log('🔍 Checking for courses with invalid courseType values...');
    
    const allCourses = await Course.find({}).select('_id title courseType');
    const invalidCourses = allCourses.filter(course => 
      course.courseType && !VALID_COURSE_TYPES.includes(course.courseType)
    );
    
    console.log(`❌ Found ${invalidCourses.length} courses with invalid courseType`);
    
    let fixedCount = 0;
    for (const course of invalidCourses) {
      try {
        await fixInvalidCourseType(course._id);
        fixedCount++;
      } catch (error) {
        console.error(`Failed to fix course ${course._id}:`, error);
      }
    }
    
    console.log(`🎉 Fixed ${fixedCount} courses with invalid courseType values`);
    return fixedCount;
  } catch (error) {
    console.error('❌ Error in fixAllInvalidCourseTypes:', error);
    throw error;
  }
};

/**
 * Validate if a courseType value is valid
 * @param {string} courseType - The courseType to validate
 * @returns {boolean} - True if valid, false otherwise
 */
const isValidCourseType = (courseType) => {
  return VALID_COURSE_TYPES.includes(courseType);
};

/**
 * Get the correct courseType for an invalid value
 * @param {string} invalidType - The invalid courseType value
 * @returns {string} - The corrected courseType
 */
const getCorrectedCourseType = (invalidType) => {
  if (!invalidType) return 'Paid';
  
  const lowerCaseType = invalidType.toLowerCase();
  
  if (lowerCaseType === 'course' || lowerCaseType === 'regular') {
    return 'Paid';
  } else if (lowerCaseType.includes('free')) {
    return 'Free';
  } else if (lowerCaseType.includes('batch')) {
    return 'Batch';
  }
  
  return 'Paid'; // Default
};

module.exports = {
  VALID_COURSE_TYPES,
  fixInvalidCourseType,
  fixAllInvalidCourseTypes,
  isValidCourseType,
  getCorrectedCourseType
};
