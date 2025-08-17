// 🔥 Course Access Service - Handles installment-based course access control
const User = require('../models/userModel');
const Installment = require('../models/installmentModel');
const Course = require('../models/courseModel');

/**
 * Check and update course access for all users with installment payments
 */
const checkAndUpdateCourseAccess = async () => {
  try {
    console.log('🔄 Starting course access check for installment payments...');
    
    // Find all users with installment-based course purchases
    const usersWithInstallments = await User.find({
      'purchasedCourses.paymentMode': 'installment'
    }).populate('purchasedCourses.course');
    
    let totalChecked = 0;
    let accessRevoked = 0;
    let accessRestored = 0;
    
    for (const user of usersWithInstallments) {
      for (const purchasedCourse of user.purchasedCourses) {
        if (purchasedCourse.paymentMode !== 'installment') continue;
        
        totalChecked++;
        const courseId = purchasedCourse.course._id || purchasedCourse.course;
        
        try {
          const accessStatus = await checkUserInstallmentStatus(user._id, courseId);
          
          // Log the current status
          if (!accessStatus.hasAccess) {
            console.log(`⚠️  User ${user._id} - Course ${courseId}: ${accessStatus.reason}`);
            accessRevoked++;
          } else {
            console.log(`✅ User ${user._id} - Course ${courseId}: Access granted`);
            if (accessStatus.reason === 'ACCESS_RESTORED') {
              accessRestored++;
            }
          }
        } catch (error) {
          console.error(`❌ Error checking access for user ${user._id}, course ${courseId}:`, error.message);
        }
      }
    }
    
    console.log(`📊 Course access check completed:`);
    console.log(`   - Total checked: ${totalChecked}`);
    console.log(`   - Access revoked: ${accessRevoked}`);
    console.log(`   - Access restored: ${accessRestored}`);
    
    return {
      totalChecked,
      accessRevoked,
      accessRestored,
      timestamp: new Date()
    };
    
  } catch (error) {
    console.error('❌ Error in course access check service:', error);
    throw error;
  }
};

/**
 * Check installment payment status for a specific user and course
 */
const checkUserInstallmentStatus = async (userId, courseId) => {
  try {
    // Find user's installment plans for this course
    const installmentPlans = await Installment.find({ 
      courseId,
      'userPayments.userId': userId 
    });
    
    if (!installmentPlans.length) {
      return { hasAccess: true, reason: 'NO_INSTALLMENT_PLAN' };
    }
    
    const currentDate = new Date();
    
    for (const plan of installmentPlans) {
      const userPayments = plan.userPayments.filter(p => p.userId.toString() === userId);
      
      if (!userPayments.length) continue;
      
      // Find the first payment to establish the timeline
      const firstPayment = userPayments.find(p => p.installmentIndex === 0);
      if (!firstPayment || !firstPayment.isPaid) {
        return { 
          hasAccess: false, 
          reason: 'FIRST_INSTALLMENT_UNPAID',
          message: 'First installment payment is required',
          planType: plan.planType
        };
      }
      
      const firstPaymentDate = firstPayment.paymentDate;
      let overdueInstallments = [];
      let nextDueInstallment = null;
      
      // Check each installment's status
      for (let i = 0; i < plan.installments.length; i++) {
        const installment = plan.installments[i];
        const userPayment = userPayments.find(p => p.installmentIndex === i);
        
        if (userPayment && userPayment.isPaid) {
          continue; // This installment is paid
        }
        
        // Calculate due date: First payment date + i months
        let dueDate = new Date(firstPaymentDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        
        if (currentDate > dueDate) {
          // Payment is overdue
          const daysPastDue = Math.floor((currentDate - dueDate) / (1000 * 60 * 60 * 24));
          overdueInstallments.push({
            installmentNumber: i + 1,
            amount: installment.amount,
            dueDate,
            daysPastDue
          });
        } else if (!nextDueInstallment) {
          nextDueInstallment = {
            installmentNumber: i + 1,
            amount: installment.amount,
            dueDate
          };
        }
      }
      
      if (overdueInstallments.length > 0) {
        const totalOverdue = overdueInstallments.reduce((sum, inst) => sum + inst.amount, 0);
        
        return { 
          hasAccess: false, 
          reason: 'INSTALLMENTS_OVERDUE',
          message: `${overdueInstallments.length} installment(s) overdue. Total amount: ₹${totalOverdue.toFixed(2)}`,
          planType: plan.planType,
          overdueInstallments,
          totalOverdueAmount: totalOverdue
        };
      }
      
      return { 
        hasAccess: true, 
        reason: 'PAYMENTS_CURRENT',
        planType: plan.planType,
        nextDueInstallment
      };
    }
    
    return { hasAccess: true, reason: 'NO_ACTIVE_PLAN' };
    
  } catch (error) {
    console.error('Error checking user installment status:', error);
    return { hasAccess: false, reason: 'ERROR', error: error.message };
  }
};

/**
 * Get detailed payment timeline for a user's course
 */
const getUserPaymentTimeline = async (userId, courseId) => {
  try {
    const installmentPlans = await Installment.find({ 
      courseId,
      'userPayments.userId': userId 
    });
    
    if (!installmentPlans.length) {
      return { timeline: [], message: 'No installment plan found' };
    }
    
    const plan = installmentPlans[0]; // Assuming one plan per user per course
    const userPayments = plan.userPayments.filter(p => p.userId.toString() === userId);
    
    if (!userPayments.length) {
      return { timeline: [], message: 'No payments found for this user' };
    }
    
    // Find the first payment date to establish timeline
    const firstPayment = userPayments.find(p => p.installmentIndex === 0 && p.isPaid);
    if (!firstPayment) {
      return { timeline: [], message: 'First installment not paid yet' };
    }
    
    const firstPaymentDate = firstPayment.paymentDate;
    const timeline = [];
    
    for (let i = 0; i < plan.installments.length; i++) {
      const installment = plan.installments[i];
      const userPayment = userPayments.find(p => p.installmentIndex === i);
      
      // Calculate due date
      let dueDate = new Date(firstPaymentDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      
      const currentDate = new Date();
      let status = 'PENDING';
      
      if (userPayment && userPayment.isPaid) {
        status = 'PAID';
      } else if (currentDate > dueDate) {
        status = 'OVERDUE';
      } else {
        status = 'UPCOMING';
      }
      
      timeline.push({
        installmentNumber: i + 1,
        amount: installment.amount,
        dueDate,
        paidDate: userPayment?.paymentDate || null,
        status,
        daysPastDue: status === 'OVERDUE' ? Math.floor((currentDate - dueDate) / (1000 * 60 * 60 * 24)) : 0
      });
    }
    
    return {
      timeline,
      planType: plan.planType,
      totalAmount: plan.totalAmount,
      remainingAmount: plan.remainingAmount,
      firstPaymentDate
    };
    
  } catch (error) {
    console.error('Error getting payment timeline:', error);
    throw error;
  }
};

/**
 * Send payment reminder notifications (placeholder for future implementation)
 */
const sendPaymentReminders = async () => {
  console.log('📧 Payment reminder service - To be implemented');
  // This would integrate with notification service to send reminders
  // for upcoming and overdue payments
};

module.exports = {
  checkAndUpdateCourseAccess,
  checkUserInstallmentStatus,
  getUserPaymentTimeline,
  sendPaymentReminders
};