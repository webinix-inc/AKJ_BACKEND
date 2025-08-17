// ============================================================================
// 📊 INSTALLMENT BUSINESS LOGIC SERVICE
// ============================================================================
// 
// This service handles all installment-related business logic that was
// previously scattered in adminController.js. It maintains the same core
// logic and algorithms while providing better separation of concerns.
//
// Functions moved from adminController.js:
// - updateExistingInstallmentPlans() 
// - createOneTimeInstallmentsForValidities()
//
// ============================================================================

const Installment = require("../models/installmentModel");
const Subscription = require("../models/subscriptionModel");

// ============================================================================
// 🔄 UPDATE EXISTING INSTALLMENT PLANS
// ============================================================================
// Updates existing installment plans when subscription validities change
// This maintains the exact same logic as adminController.js
const updateExistingInstallmentPlans = async (
  courseId,
  subscription,
  changedValidities = []
) => {
  try {
    console.log(`📊 Updating installment plans for course ${courseId}`);
    
    // Process each changed validity or all validities if none specified
    const validities = changedValidities.length > 0 ? changedValidities : subscription.validities;
    
    for (const validity of validities) {
      const planType = `${validity.validity} months`;
      const price = validity.price;
      const discount = validity.discount || 0;
      const gstPercentage = subscription.gst || 0;
      const internetHandlingPercentage = subscription.internetHandling || 0;

      // Calculate new total amount with same logic as setCustomInstallments
      const discountValue = (price * discount) / 100;
      let totalAmount = price - discountValue;
      const gstAmount = (totalAmount * gstPercentage) / 100;
      const internetHandlingCharge = (totalAmount * internetHandlingPercentage) / 100;
      totalAmount += gstAmount + internetHandlingCharge;

      // Find all existing installment plans for this course and plan type
      const existingPlans = await Installment.find({ courseId, planType });
      
      for (const plan of existingPlans) {
        // Only update plans that have unpaid installments or no user payments yet
        const hasUnpaidInstallments = plan.installments.some(inst => !inst.isPaid);
        const hasUserPayments = plan.userPayments && plan.userPayments.length > 0;
        
        if (hasUnpaidInstallments || !hasUserPayments) {
          console.log(`🔄 Updating installment plan ${plan._id} for ${planType}`);
          
          // Recalculate installment amounts with improved rounding
          const numberOfInstallments = plan.numberOfInstallments;
          const baseInstallmentAmount = Math.floor((totalAmount / numberOfInstallments) * 100) / 100;
          const remainder = Math.round((totalAmount - (baseInstallmentAmount * numberOfInstallments)) * 100) / 100;
          
          // Update installments array
          const updatedInstallments = [];
          for (let i = 0; i < numberOfInstallments; i++) {
            const installmentAmount = i === 0 ? baseInstallmentAmount + remainder : baseInstallmentAmount;
            const originalInstallment = plan.installments[i];
            
            updatedInstallments.push({
              amount: parseFloat(installmentAmount.toFixed(2)),
              dueDate: originalInstallment ? originalInstallment.dueDate : (i === 0 ? "DOP" : `DOP + ${i} month${i > 1 ? "s" : ""}`),
              isPaid: originalInstallment ? originalInstallment.isPaid : false,
              paidOn: originalInstallment ? originalInstallment.paidOn : undefined
            });
          }
          
          // Calculate new remaining amount based on paid installments
          const paidAmount = updatedInstallments
            .filter(inst => inst.isPaid)
            .reduce((sum, inst) => sum + inst.amount, 0);
          const newRemainingAmount = totalAmount - paidAmount;
          
          // Update the plan
          plan.installments = updatedInstallments;
          plan.totalAmount = totalAmount.toFixed(2);
          plan.remainingAmount = newRemainingAmount.toFixed(2);
          
          await plan.save();
          console.log(`✅ Updated installment plan ${plan._id}`);
        }
      }
    }
    
    console.log(`✅ Successfully updated all installment plans for course ${courseId}`);
  } catch (error) {
    console.error(`❌ Error in updateExistingInstallmentPlans:`, error);
    throw error;
  }
};

// ============================================================================
// 🆕 CREATE ONE-TIME INSTALLMENTS FOR VALIDITIES  
// ============================================================================
// Creates default one-time installment plans for subscription validities
// This maintains the exact same logic as adminController.js
const createOneTimeInstallmentsForValidities = async (
  courseId,
  validities,
  gst,
  internetHandling
) => {
  try {
    console.log(
      "Input courseId from createOneTimeInstallmentsForValidities : ",
      courseId
    );
    console.log(
      "Input gst from createOneTimeInstallmentsForValidities : ",
      gst
    );
    console.log(
      "Input internetHandling from createOneTimeInstallmentsForValidities : ",
      internetHandling
    );
    console.log(
      "Validities from createOneTimeInstallmentsForValidities : ",
      validities
    );

    for (const validity of validities) {
      const planType = `${validity.validity} months`;
      const price = validity.price;
      const discount = validity.discount || 0;

      const gstPercentage = gst || 0;
      const internetHandlingPercentage = internetHandling || 0;

      const discountValue = (price * discount) / 100;
      let totalAmount = price - discountValue;
      const gstAmount = (totalAmount * gstPercentage) / 100;
      const internetHandlingCharge =
        (totalAmount * internetHandlingPercentage) / 100;
      totalAmount += gstAmount + internetHandlingCharge;

      console.log(`Creating plan for ${planType}:`);
      console.log(`- Original price: ₹${price}`);
      console.log(`- Discount (${discount}%): -₹${discountValue.toFixed(2)}`);
      console.log(`- After discount: ₹${(price - discountValue).toFixed(2)}`);
      console.log(`- GST (${gstPercentage}%): +₹${gstAmount.toFixed(2)}`);
      console.log(
        `- Internet handling (${internetHandlingPercentage}%): +₹${internetHandlingCharge.toFixed(
          2
        )}`
      );
      console.log(`- Total amount: ₹${totalAmount.toFixed(2)}`);

      // Check if plan already exists
      const existingPlan = await Installment.findOne({ courseId, planType });

      const oneTimeInstallments = [
        {
          amount: parseFloat(totalAmount.toFixed(2)),
          dueDate: "DOP", // Date of Purchase
          isPaid: false,
        },
      ];

      if (existingPlan) {
        existingPlan.numberOfInstallments = 1;
        existingPlan.installments = oneTimeInstallments;
        existingPlan.totalAmount = totalAmount.toFixed(2);
        existingPlan.remainingAmount = totalAmount.toFixed(2);
        await existingPlan.save();
        console.log(`✅ Updated existing one-time plan for ${planType}`);
      } else {
        const newInstallmentPlan = new Installment({
          courseId,
          planType,
          numberOfInstallments: 1,
          installments: oneTimeInstallments,
          totalAmount: totalAmount.toFixed(2),
          remainingAmount: totalAmount.toFixed(2),
        });

        await newInstallmentPlan.save();
        console.log(`✅ Created new one-time plan for ${planType}`);
      }
    }
  } catch (error) {
    console.error("Error in createOneTimeInstallmentsForValidities:", error);
    throw error;
  }
};

// ============================================================================
// 🔄 SYNC INSTALLMENT PLANS WITH SUBSCRIPTION
// ============================================================================
// Comprehensive function to sync all installment plans when subscription changes
const syncInstallmentPlansWithSubscription = async (subscriptionId) => {
  try {
    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    console.log(`🔄 Syncing installment plans for subscription ${subscriptionId}`);
    
    // Update existing installment plans
    await updateExistingInstallmentPlans(
      subscription.course,
      subscription,
      subscription.validities
    );
    
    // Create/update one-time installment plans
    await createOneTimeInstallmentsForValidities(
      subscription.course,
      subscription.validities,
      subscription.gst,
      subscription.internetHandling
    );
    
    console.log(`✅ Successfully synced all installment plans for subscription ${subscriptionId}`);
  } catch (error) {
    console.error(`❌ Error in syncInstallmentPlansWithSubscription:`, error);
    throw error;
  }
};

// ============================================================================
// 🗑️ DELETE INSTALLMENTS FOR COURSE
// ============================================================================
// Deletes all installment plans associated with a course
const deleteInstallmentsForCourse = async (courseId) => {
  try {
    console.log(`🗑️ Deleting installment plans for course ${courseId}`);
    const result = await Installment.deleteMany({ courseId });
    console.log(`✅ Deleted ${result.deletedCount} installment plans for course ${courseId}`);
    return result;
  } catch (error) {
    console.error(`❌ Error deleting installments for course ${courseId}:`, error);
    throw error;
  }
};

// ============================================================================
// 📊 GET INSTALLMENT STATISTICS
// ============================================================================
// Get statistics about installment plans for a course
const getInstallmentStatistics = async (courseId) => {
  try {
    const plans = await Installment.find({ courseId });
    
    const statistics = {
      totalPlans: plans.length,
      planTypes: [...new Set(plans.map(p => p.planType))],
      totalUsers: plans.filter(p => p.userId).length,
      completedPlans: plans.filter(p => p.status === 'completed').length,
      activePlans: plans.filter(p => p.status !== 'completed').length,
      totalRevenue: plans.reduce((sum, p) => {
        const paidAmount = p.installments
          .filter(inst => inst.isPaid)
          .reduce((instSum, inst) => instSum + inst.amount, 0);
        return sum + paidAmount;
      }, 0),
      pendingRevenue: plans.reduce((sum, p) => sum + parseFloat(p.remainingAmount || 0), 0)
    };
    
    return statistics;
  } catch (error) {
    console.error(`❌ Error getting installment statistics for course ${courseId}:`, error);
    throw error;
  }
};

// ============================================================================
// 📤 EXPORTS
// ============================================================================
module.exports = {
  updateExistingInstallmentPlans,
  createOneTimeInstallmentsForValidities,
  syncInstallmentPlansWithSubscription,
  deleteInstallmentsForCourse,
  getInstallmentStatistics
};
