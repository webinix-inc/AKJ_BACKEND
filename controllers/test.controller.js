const Installment = require("../models/installmentModel");

// 🔧 TEST: Reset installment paid state for a course
exports.resetInstallmentPaidState = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({ message: "courseId is required" });
    }
    if (!courseId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid courseId format" });
    }

    const plans = await Installment.find({ courseId });
    if (!plans.length) {
      return res.status(404).json({ message: "No installment plans found for this course", courseId });
    }

    let updatedCount = 0;
    for (const plan of plans) {
      if (plan.installments && plan.installments.length > 0) {
        plan.installments.forEach((inst) => {
          inst.isPaid = false;
          inst.paidOn = null;
        });
      }
      plan.userPayments = [];
      plan.remainingAmount = plan.totalAmount;
      plan.status = "pending";
      plan.markModified("installments");
      await plan.save();
      updatedCount += 1;
    }

    return res.status(200).json({
      message: "Installment paid state reset successfully",
      courseId,
      updatedPlans: updatedCount
    });
  } catch (error) {
    console.error("Error in resetInstallmentPaidState:", error);
    return res.status(500).json({
      message: "Error resetting installment paid state",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};
