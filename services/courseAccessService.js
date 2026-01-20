// 🔥 Course Access Service - Handles installment-based course access control
const User = require('../models/userModel');
const Order = require('../models/orderModel');

/**
 * Check and update course access for all users with installment payments
 */
const checkAndUpdateCourseAccess = async () => {
  try {
    console.log('🔄 Starting course access check for installment payments...');
    
    // Find all users with installment-based course purchases
    const usersWithInstallments = await User.find({
      $or: [
        { 'purchasedCourses.paymentMode': 'installment' },
        { 'purchasedCourses.paymentType': 'installment' }
      ]
    }).populate('purchasedCourses.course');
    
    let totalChecked = 0;
    let accessRevoked = 0;
    let accessRestored = 0;
    
    for (const user of usersWithInstallments) {
      for (const purchasedCourse of user.purchasedCourses) {
        const paymentMode = purchasedCourse.paymentMode || purchasedCourse.paymentType;
        if (paymentMode !== 'installment') continue;
        
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
    const user = await User.findById(userId).select('purchasedCourses');
    if (!user) {
      return { hasAccess: false, reason: 'USER_NOT_FOUND' };
    }

    const purchasedCourse = user.purchasedCourses?.find((pc) => {
      const pcCourseId = pc.course?.toString?.() || pc.course;
      const paymentMode = pc.paymentType || pc.paymentMode;
      return pcCourseId === courseId && paymentMode === 'installment';
    });

    if (!purchasedCourse || !purchasedCourse.installments || purchasedCourse.installments.length === 0) {
      return { hasAccess: true, reason: 'NO_INSTALLMENT_ENROLLMENT' };
    }

    const paidOrders = await Order.find({
      courseId,
      userId,
      status: "paid",
      paymentMode: "installment"
    }).select('installmentDetails paidAt updatedAt createdAt');

    const paidIndexes = new Set(
      paidOrders
        .map((order) => order.installmentDetails?.installmentIndex)
        .filter((idx) => idx !== undefined && idx !== null)
    );

    const enrollmentOrder = paidOrders.find(
      (order) => order.installmentDetails?.installmentIndex === 0
    ) || paidOrders[0];
    const firstPaymentDate = enrollmentOrder?.paidAt || enrollmentOrder?.updatedAt || enrollmentOrder?.createdAt || null;

    const baseDate = firstPaymentDate || purchasedCourse.purchaseDate || new Date();
    const currentDate = new Date();
    const overdueInstallments = [];
    let nextDueInstallment = null;

    for (let i = 0; i < purchasedCourse.installments.length; i++) {
      const installment = purchasedCourse.installments[i];
      const isPaid = paidIndexes.has(i) || !!installment.isPaid;

      if (i === 0 && !isPaid) {
        return {
          hasAccess: false,
          reason: 'FIRST_INSTALLMENT_UNPAID',
          message: 'First installment payment is required',
          planType: purchasedCourse.planType || null
        };
      }

      if (isPaid) {
        continue;
      }

      const dueDate = new Date(baseDate);
      dueDate.setMonth(dueDate.getMonth() + i);

      if (currentDate > dueDate) {
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
        planType: purchasedCourse.planType || null,
        overdueInstallments,
        totalOverdueAmount: totalOverdue
      };
    }

    return {
      hasAccess: true,
      reason: 'PAYMENTS_CURRENT',
      planType: purchasedCourse.planType || null,
      nextDueInstallment
    };
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
    const user = await User.findById(userId).select('purchasedCourses');
    if (!user) {
      return { timeline: [], message: 'User not found' };
    }

    const purchasedCourse = user.purchasedCourses?.find((pc) => {
      const pcCourseId = pc.course?.toString?.() || pc.course;
      const paymentMode = pc.paymentType || pc.paymentMode;
      return pcCourseId === courseId && paymentMode === 'installment';
    });

    if (!purchasedCourse || !purchasedCourse.installments || purchasedCourse.installments.length === 0) {
      return { timeline: [], message: 'No installment enrollment found' };
    }

    const paidOrders = await Order.find({
      courseId,
      userId,
      status: "paid",
      paymentMode: "installment"
    }).sort({ createdAt: 1 }).select('installmentDetails paidAt updatedAt createdAt');

    const paidIndexes = new Set(
      paidOrders
        .map((order) => order.installmentDetails?.installmentIndex)
        .filter((idx) => idx !== undefined && idx !== null)
    );

    const enrollmentOrder = paidOrders.find(
      (order) => order.installmentDetails?.installmentIndex === 0
    ) || paidOrders[0];
    const firstPaymentDate = enrollmentOrder?.paidAt || enrollmentOrder?.updatedAt || enrollmentOrder?.createdAt || null;
    const baseDate = firstPaymentDate || purchasedCourse.purchaseDate || new Date();

    let lastDueDate = null;
    const currentDate = new Date();
    const timeline = purchasedCourse.installments.map((installment, i) => {
      let dueDate;
      if (i === 0) {
        dueDate = baseDate;
      } else {
        const prevDate = lastDueDate || baseDate;
        dueDate = new Date(prevDate);
        dueDate.setMonth(dueDate.getMonth() + 1);
      }
      lastDueDate = new Date(dueDate);

      const paidOrder = paidOrders.find(
        (order) => order.installmentDetails?.installmentIndex === i
      );
      const isPaid = paidIndexes.has(i) || !!installment.isPaid;
      const paidDate = paidOrder?.paidAt || paidOrder?.updatedAt || paidOrder?.createdAt || installment.paidDate || null;

      let status = 'UPCOMING';
      if (isPaid) {
        status = 'PAID';
      } else if (currentDate > dueDate) {
        status = 'OVERDUE';
      }

      return {
        installmentNumber: i + 1,
        amount: installment.amount,
        dueDate,
        paidDate,
        status,
        daysPastDue: status === 'OVERDUE'
          ? Math.floor((currentDate - dueDate) / (1000 * 60 * 60 * 24))
          : 0
      };
    });

    const totalAmount = purchasedCourse.installments.reduce((sum, inst) => sum + (inst.amount || 0), 0);
    const paidAmount = purchasedCourse.installments
      .filter((_, idx) => paidIndexes.has(idx) || purchasedCourse.installments[idx]?.isPaid)
      .reduce((sum, inst) => sum + (inst.amount || 0), 0);
    const remainingAmount = Math.max(0, totalAmount - paidAmount);

    return {
      timeline,
      planType: purchasedCourse.planType || null,
      totalAmount,
      remainingAmount,
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