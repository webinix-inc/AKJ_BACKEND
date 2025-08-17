// 🔥 Scheduled Job for Course Access Control
const schedule = require('node-schedule');
const { checkAndUpdateCourseAccess, sendPaymentReminders } = require('../services/courseAccessService');

/**
 * Schedule course access check to run daily at 9:00 AM
 * This will check all users with installment payments and update their access status
 */
const scheduleCourseAccessCheck = () => {
  // Run daily at 9:00 AM
  const dailyAccessCheck = schedule.scheduleJob('0 9 * * *', async () => {
    console.log('🕘 Starting scheduled course access check at', new Date().toISOString());
    
    try {
      const result = await checkAndUpdateCourseAccess();
      console.log('✅ Scheduled course access check completed:', result);
      
      // Also send payment reminders
      await sendPaymentReminders();
      
    } catch (error) {
      console.error('❌ Error in scheduled course access check:', error);
    }
  });
  
  // Run every 4 hours for more frequent checks
  const frequentAccessCheck = schedule.scheduleJob('0 */4 * * *', async () => {
    console.log('🕐 Starting frequent course access check at', new Date().toISOString());
    
    try {
      const result = await checkAndUpdateCourseAccess();
      console.log('✅ Frequent course access check completed:', result);
      
    } catch (error) {
      console.error('❌ Error in frequent course access check:', error);
    }
  });
  
  console.log('📅 Course access check jobs scheduled:');
  console.log('   - Daily comprehensive check: 9:00 AM');
  console.log('   - Frequent checks: Every 4 hours');
  
  return {
    dailyAccessCheck,
    frequentAccessCheck
  };
};

/**
 * Manual trigger for course access check (for testing/admin use)
 */
const runCourseAccessCheckNow = async () => {
  console.log('🚀 Manual course access check triggered at', new Date().toISOString());
  
  try {
    const result = await checkAndUpdateCourseAccess();
    console.log('✅ Manual course access check completed:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Error in manual course access check:', error);
    throw error;
  }
};

/**
 * Cancel all scheduled jobs (for cleanup)
 */
const cancelScheduledJobs = () => {
  schedule.gracefulShutdown();
  console.log('🛑 All scheduled course access jobs cancelled');
};

module.exports = {
  scheduleCourseAccessCheck,
  runCourseAccessCheckNow,
  cancelScheduledJobs
};