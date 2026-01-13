// ============================================================================
// 💳 PAYMENT BUSINESS LOGIC SERVICE
// ============================================================================
// 
// This service handles all payment-related business logic that was
// previously duplicated across multiple controllers. It maintains the same
// core logic and algorithms while providing better separation of concerns.
//
// Controllers affected:
// - adminController.js (Admin payment management)
// - razorpayController.js (Core payment processing)
// - installmentController.js (Installment payments)
// - userController.js (User order creation)
//
// Functions consolidated:
// - Razorpay order creation and management
// - Payment signature verification
// - Installment payment processing
// - Course enrollment after payment
// - Order tracking and management
// - GST and handling charge calculations
//
// ============================================================================

const Razorpay = require("razorpay");
const crypto = require("crypto");
const Order = require("../models/orderModel");
const User = require("../models/userModel");
const Course = require("../models/courseModel");
const Installment = require("../models/installmentModel");
const LiveClass = require("../models/LiveClass");

const Notification = require("../models/notificationModel"); // Imported Notification Model
const { addUsersToClass } = require("../configs/merithub.config");

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ============================================================================
// 🔧 UTILITY FUNCTIONS
// ============================================================================
const generateReceipt = () => `receipt_${Math.floor(Math.random() * 1e6)}`;

// ============================================================================
// 💬 SEND PAYMENT RECEIPT MESSAGE TO STUDENT
// ============================================================================
// ============================================================================
// 💰 RAZORPAY ORDER CREATION BUSINESS LOGIC
// ============================================================================

const generateUniqueTrackingNumber = () =>
  `TN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

const generateOrderId = () => `ORD-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

// ============================================================================
// 💰 RAZORPAY ORDER CREATION BUSINESS LOGIC
// ============================================================================
const createRazorpayOrderLogic = async (orderData) => {
  try {
    let {
      amount,
      currency = "INR",
      receipt,
      userId,
      courseId,
      planType,
      installmentPlanId, // 🔥 NEW: Selected plan ID
      paymentMode,
      installmentIndex,
      totalInstallments,
      notes = {}
    } = orderData;

    console.log("💳 Creating Razorpay order with payment service");

    // Validate required fields
    if (!userId || !courseId || !paymentMode) {
      throw new Error("userId, courseId, and paymentMode are required");
    }

    // 🔥 CRITICAL: Declare installmentPlan outside the if block so it's accessible later
    let installmentPlan = null;

    // Handle installment-specific logic
    if (paymentMode === "installment") {
      // 🔥 CRITICAL: Use installmentPlanId if provided, otherwise fallback to planType

      if (installmentPlanId) {
        installmentPlan = await Installment.findById(installmentPlanId);
        if (!installmentPlan || installmentPlan.courseId.toString() !== courseId.toString()) {
          throw new Error("Installment plan not found or doesn't match course");
        }
        console.log(`✅ [createRazorpayOrderLogic] Using selected plan ID: ${installmentPlanId} (${installmentPlan.planType})`);
      } else if (planType) {
        installmentPlan = await Installment.findOne({ courseId, planType });
        if (!installmentPlan) {
          throw new Error("Installment plan not found");
        }
        console.log(`⚠️ [createRazorpayOrderLogic] Using planType fallback: ${planType}`);
      } else {
        throw new Error("Either installmentPlanId or planType is required for installment payments");
      }

      // 🔥 CRITICAL: Ensure installmentPlan is defined before proceeding
      if (!installmentPlan) {
        throw new Error("Installment plan is required but was not found");
      }

      // 🔥 CRITICAL: For enrolled users, use saved amount from purchasedCourses
      // This ensures users keep their original plan prices even if admin changes the plan
      const User = require('../models/userModel');
      const user = await User.findById(userId).select('purchasedCourses');

      if (user?.purchasedCourses) {
        const purchasedCourse = user.purchasedCourses.find((pc) => {
          const pcCourseId = pc.course?.toString?.() || pc.course;
          const currentCourseId = courseId?.toString?.() || courseId;
          return pcCourseId === currentCourseId && pc.paymentType === 'installment';
        });

        if (purchasedCourse?.installments && purchasedCourse.installments.length > 0) {
          // Find the installment by installmentNumber (1-based) or by index
          const installmentNumber = installmentIndex + 1; // Convert to 1-based
          const savedInstallment = purchasedCourse.installments.find(
            inst => inst.installmentNumber === installmentNumber
          ) || purchasedCourse.installments[installmentIndex];

          if (savedInstallment?.amount) {
            const savedAmount = savedInstallment.amount;
            console.log(`🔒 Enrolled user - Using saved amount ₹${savedAmount} instead of ₹${amount} for installment ${installmentNumber}`);

            // Warn if amounts don't match (frontend should have sent correct amount)
            if (Math.abs(savedAmount - amount) > 0.01) {
              console.warn(`⚠️ Amount mismatch for enrolled user: Frontend sent ₹${amount}, but saved amount is ₹${savedAmount}. Using saved amount.`);
            }

            // Override amount with saved amount
            amount = savedAmount;
          }
        }
      }

      // Check if installment already exists
      const existingPayment = installmentPlan.userPayments.find(
        (p) =>
          p.userId.toString() === userId &&
          p.installmentIndex === installmentIndex
      );

      if (existingPayment) {
        // If installment already exists and is paid, don't allow creating another order
        if (existingPayment.isPaid) {
          throw new Error(`Installment ${installmentIndex + 1} has already been paid for this user`);
        }

        // If installment exists but not paid, allow creating order (user might be retrying payment)
        // Don't add duplicate entry, just proceed with order creation
        console.log(`⚠️ Installment ${installmentIndex + 1} already exists but not paid. Allowing order creation for retry.`);
      } else {
        // Add new installment to plan only if it doesn't exist
        installmentPlan.userPayments.push({
          userId,
          installmentIndex,
          isPaid: false,
          paidAmount: amount, // Use amount (may be saved amount for enrolled users)
          paymentDate: null,
        });
        await installmentPlan.save();
      }
    }

    // Create Razorpay order (amount may have been adjusted for enrolled users)
    const razorpayOrderData = {
      amount: Math.round(amount * 100), // Convert to paise (may be saved amount for enrolled users)
      currency,
      receipt: receipt || generateReceipt(),
      notes: {
        userId,
        courseId,
        paymentMode,
        planType,
        ...notes
      }
    };

    const razorpayOrder = await razorpay.orders.create(razorpayOrderData);

    // Create internal order record
    // 🔥 CRITICAL: Safely get installmentPlanId - only access installmentPlan if paymentMode is installment
    let finalInstallmentPlanId = installmentPlanId; // Default to the provided installmentPlanId

    if (paymentMode === "installment") {
      // Only access installmentPlan here where we know it should be set
      // Use typeof check to ensure variable exists before accessing
      if (typeof installmentPlan !== 'undefined' && installmentPlan !== null && installmentPlan._id) {
        finalInstallmentPlanId = installmentPlan._id;
      } else if (installmentPlanId) {
        finalInstallmentPlanId = installmentPlanId;
      } else {
        console.warn("⚠️ [createRazorpayOrderLogic] installmentPlan not found, using provided installmentPlanId");
      }
    }

    const internalOrderData = {
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      receipt: razorpayOrder.receipt,
      status: paymentMode === "installment" ? "partial" : "created",
      trackingNumber: generateUniqueTrackingNumber(),
      userId,
      courseId,
      paymentMode,
      planType,
      installmentPlanId: finalInstallmentPlanId, // 🔥 NEW: Store selected plan ID
    };

    // Add installment details if applicable
    if (paymentMode === "installment") {
      internalOrderData.installmentDetails = {
        installmentIndex,
        totalInstallments,
        installmentAmount: amount,
        isPaid: false,
      };
    }

    const newOrder = new Order(internalOrderData);
    await newOrder.save();

    console.log("✅ Razorpay order created successfully");
    return {
      razorpayOrder,
      internalOrder: newOrder,
      trackingNumber: internalOrderData.trackingNumber
    };
  } catch (error) {
    console.error("❌ Error in createRazorpayOrderLogic:", error);
    throw error;
  }
};

// ============================================================================
// 🔐 PAYMENT SIGNATURE VERIFICATION BUSINESS LOGIC
// ============================================================================
const verifyPaymentSignatureLogic = async (signatureData) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = signatureData;

    console.log("💳 Verifying payment signature with payment service");

    // Generate signature for verification
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      throw new Error("Invalid payment signature");
    }

    // Find and update the order
    const order = await Order.findOneAndUpdate(
      { orderId: razorpay_order_id },
      {
        status: "paid",
        paymentId: razorpay_payment_id,
        paidAt: new Date()
      },
      { new: true }
    );

    if (!order) {
      throw new Error(`Order not found for ID: ${razorpay_order_id}`);
    }

    // Process course enrollment immediately (optimized for speed)
    const mockPaymentDetails = {
      id: razorpay_payment_id,
      amount: order.amount,
      order_id: razorpay_order_id,
      status: "captured"
    };

    // Enroll user immediately - this is the critical path for access granting
    // Add planType to installmentDetails if not present
    const installmentDetailsWithPlanType = order.installmentDetails ? {
      ...order.installmentDetails,
      planType: order.planType || order.installmentDetails.planType,
      installmentPlanId: order.installmentPlanId // 🔥 NEW: Pass installmentPlanId to enrollment
    } : null;

    // 🔥 CRITICAL: Enroll user in course - this must complete successfully
    let enrollmentResult;
    try {
      enrollmentResult = await addCourseToUserLogic(
        order.userId,
        order.courseId,
        order.paymentMode,
        installmentDetailsWithPlanType,
        mockPaymentDetails,
        order.orderId // 🔥 CRITICAL: Pass orderId to help with installmentPlanId lookup
      );

      // 🔥 CRITICAL: For installment payments, update Installment model separately
      // This ensures proper tracking and avoids duplicate updates
      if (order.paymentMode === "installment" && order.installmentPlanId) {
        try {
          await handleInstallmentPaymentLogic(
            order.userId,
            order.courseId,
            installmentDetailsWithPlanType,
            order.planType,
            order.orderId
          );
          console.log("✅ [VERIFY] Installment payment tracking updated");
        } catch (installmentError) {
          console.error("⚠️ [VERIFY] Error updating installment payment tracking:", installmentError);
          // Don't throw - enrollment is already complete, this is just for tracking
        }
      }

      console.log("✅ Payment signature verified and course enrolled", {
        courseId: order.courseId,
        userId: order.userId,
        isNewEnrollment: enrollmentResult.isNewEnrollment
      });
    } catch (enrollmentError) {
      console.error("❌ CRITICAL: Failed to enroll user in course:", enrollmentError);
      // Re-throw to prevent payment from being marked as successful without enrollment
      throw new Error(`Course enrollment failed: ${enrollmentError.message}`);
    }

    // 🔥 CRITICAL: Verify enrollment was successful by checking user's purchasedCourses
    try {
      const User = require('../models/userModel');
      const user = await User.findById(order.userId).select('purchasedCourses');
      const hasCourse = user.purchasedCourses.some(
        (pc) => pc.course.toString() === order.courseId.toString()
      );

      if (!hasCourse) {
        console.error("❌ CRITICAL: Course enrollment verification failed - course not found in user's purchasedCourses");
        throw new Error("Course enrollment verification failed");
      }
      console.log("✅ Verified: Course found in user's purchasedCourses after enrollment");
    } catch (verificationError) {
      console.error("❌ CRITICAL: Enrollment verification error:", verificationError);
      throw new Error(`Enrollment verification failed: ${verificationError.message}`);
    }

    // 🔥 SEND SYSTEM NOTIFICATIONS (USER & ADMIN)
    try {
      console.log("🔔 Sending system notifications for purchase...");

      // 1. Notify Student
      const studentNotification = new Notification({
        title: "Course Purchased Successfully! 🎉",
        message: `You have successfully purchased ${course?.title || 'the course'}. Happy Learning!`,
        type: 'NEW_COURSE_PURCHASE',
        recipient: [order.userId],
        courses: [order.courseId],
        sendVia: 'NOTIFICATION', // Fixed: 'system' is not in enum
        metadata: { orderId: order.orderId, amount: order.amount },
        priority: 'HIGH',
        createdBy: order.userId // Self-initiated
      });
      await studentNotification.save();

      if (global.io) {
        global.io.to(`notification:${order.userId}`).emit("notification", {
          title: studentNotification.title,
          message: studentNotification.message,
          type: studentNotification.type,
          metadata: studentNotification.metadata,
          createdAt: new Date(),
          _id: studentNotification._id
        });
        console.log(`✅ Notification sent to user ${order.userId}`);
      }

      // 2. Notify Admin
      // Find all admins
      const admins = await User.find({ userType: "ADMIN" }).select("_id");
      const adminIds = admins.map(a => a._id);

      if (adminIds.length > 0) {
        const adminNotification = new Notification({
          title: "New Course Sale! 💰",
          message: `${user?.firstName || 'A user'} has purchased ${course?.title || 'a course'} for ₹${order.amount / 100}.`,
          type: 'ADMIN_ALERT',
          recipient: adminIds,
          courses: [order.courseId],
          sendVia: 'NOTIFICATION',
          metadata: { orderId: order.orderId, userId: order.userId },
          priority: 'MEDIUM', // Fixed: Uppercase to match schema
          createdBy: order.userId
        });
        await adminNotification.save();

        // Emit to a special admin room or loop through admins
        if (global.io) {
          // Assuming admins might join their own notification rooms
          adminIds.forEach(adminId => {
            global.io.to(`notification:${adminId}`).emit("notification", {
              title: adminNotification.title,
              message: adminNotification.message,
              type: adminNotification.type,
              metadata: adminNotification.metadata,
              createdAt: new Date(),
              _id: adminNotification._id
            });
          });
          console.log(`✅ Notification sent to ${adminIds.length} admins`);
        }
      }

    } catch (notificationError) {
      console.error("❌ Error sending system notifications:", notificationError);
    }

    return {
      verified: true,
      order,
      enrollmentResult,
      message: "Payment verified and course enrolled",
      courseEnrolled: true
    };
  } catch (error) {
    console.error("❌ Error in verifyPaymentSignatureLogic:", error);
    throw error;
  }
};

// ============================================================================
// 🎓 COURSE ENROLLMENT BUSINESS LOGIC
// ============================================================================
const addCourseToUserLogic = async (userId, courseId, paymentMode, installmentDetails, paymentDetails, orderId = null) => {
  try {
    console.log("💳 Processing course enrollment with payment service");

    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const amountPaid = paymentDetails.amount / 100; // Convert from paise
    const paymentId = paymentDetails.id || paymentDetails.payment_id || null;
    // 🔥 CRITICAL: Use passed orderId parameter if available, otherwise get from paymentDetails
    const finalOrderId = orderId || paymentDetails.order_id || null;

    // 🔥 CRITICAL: Declare installmentPlan at function scope to avoid shadowing issues
    let installmentPlan = null;

    // Find if user already has this course
    const courseIndex = user.purchasedCourses.findIndex(
      (c) => c.course.toString() === courseId.toString()
    );

    const isInstallment = paymentMode === "installment";
    const installmentIndex = installmentDetails?.installmentIndex ?? 0;
    const installmentNumber = installmentIndex + 1; // 1-based for display
    const totalInstallments = installmentDetails?.totalInstallments ?? 1;

    // If course not found, create new entry (first installment or full payment)
    if (courseIndex === -1) {
      const newCourse = {
        course: courseId,
        purchaseDate: new Date(),
        amountPaid,
        paymentType: paymentMode,
        installments: [],
      };

      if (isInstallment) {
        newCourse.totalInstallments = totalInstallments;
        newCourse.planType = installmentDetails?.planType; // 🔥 Store planType immediately

        // 🔒 CRITICAL: Store ALL installment amounts at enrollment time to lock in prices
        // This ensures enrolled users keep their original prices even if admin updates the plan
        try {
          // 🔥 CRITICAL: Get planType from installmentDetails (should always be present)
          // If not, get it from the CURRENT order being verified (using orderId from paymentDetails)
          let planTypeToUse = installmentDetails?.planType;

          // 🔥 CRITICAL: Use installmentPlanId from installmentDetails or order if available
          let installmentPlanIdToUse = installmentDetails?.installmentPlanId;

          // 🔥 OPTIMIZATION: Use installmentPlanId from order if available (faster than planType lookup)
          if (!installmentPlanIdToUse && finalOrderId) {
            const currentOrder = await Order.findOne({
              orderId: finalOrderId
            }).select('planType installmentPlanId'); // Only select needed fields for speed
            installmentPlanIdToUse = currentOrder?.installmentPlanId;
            planTypeToUse = currentOrder?.planType || planTypeToUse;

            // If planType not in order but installmentPlanId is, fetch plan directly
            if (!planTypeToUse && installmentPlanIdToUse) {
              // Use global Installment model (already required at top of file)
              const plan = await Installment.findById(installmentPlanIdToUse).select('planType');
              planTypeToUse = plan?.planType;
              console.log(`🔍 [ENROLLMENT] Got planType from installmentPlanId: ${planTypeToUse}`);
            } else if (planTypeToUse) {
              console.log(`🔍 [ENROLLMENT] Got planType from current order: ${planTypeToUse}`);
            }
          }

          // 🔥 CRITICAL: Use installmentPlanId if available, otherwise fallback to planType
          // Ensure installmentPlan is properly initialized before use
          if (installmentPlanIdToUse) {
            installmentPlan = await Installment.findById(installmentPlanIdToUse);
            if (installmentPlan && installmentPlan.courseId.toString() === courseId.toString()) {
              console.log(`✅ [ENROLLMENT] Using installmentPlanId: ${installmentPlanIdToUse} (${installmentPlan.planType})`);
            } else {
              console.warn(`⚠️ [ENROLLMENT] installmentPlanId ${installmentPlanIdToUse} not found or doesn't match course, falling back to planType`);
              installmentPlan = null;
            }
          }

          // Fallback to planType lookup if installmentPlanId not available
          if (!installmentPlan && planTypeToUse) {
            installmentPlan = await Installment.findOne({
              courseId,
              planType: planTypeToUse
            });
            if (installmentPlan) {
              console.log(`✅ [ENROLLMENT] Using planType lookup: ${planTypeToUse}`);
            } else {
              console.warn(`⚠️ [ENROLLMENT] Plan not found with planType: ${planTypeToUse}`);
            }
          }

          // Final fallback: Get from any recent order (but this should rarely happen)
          if (!planTypeToUse) {
            const recentOrder = await Order.findOne({
              userId,
              courseId,
              paymentMode: 'installment'
            }).select('planType').sort({ createdAt: -1 }); // Only select planType for speed
            planTypeToUse = recentOrder?.planType;
            console.log(`⚠️ [ENROLLMENT] Using planType from recent order (fallback): ${planTypeToUse}`);
          }

          if (!planTypeToUse) {
            throw new Error(`❌ planType not found for course enrollment. OrderId: ${finalOrderId}, CourseId: ${courseId}`);
          }

          console.log(`✅ [ENROLLMENT] Using planType: ${planTypeToUse} for course ${courseId}`);

          // 🔥 CRITICAL: Final check - if installmentPlan still not found, try one more time with orderId
          if (!installmentPlan && finalOrderId) {
            const currentOrder = await Order.findOne({ orderId: finalOrderId }).select('installmentPlanId planType');
            if (currentOrder?.installmentPlanId) {
              installmentPlan = await Installment.findById(currentOrder.installmentPlanId);
              if (installmentPlan && installmentPlan.courseId.toString() === courseId.toString()) {
                console.log(`✅ [ENROLLMENT] Using installmentPlanId from order (final attempt): ${currentOrder.installmentPlanId} (${installmentPlan.planType})`);
              } else {
                installmentPlan = null;
              }
            }
          }

          // Final validation - ensure installmentPlan is found
          if (!installmentPlan) {
            throw new Error(`❌ Installment plan not found. OrderId: ${finalOrderId}, CourseId: ${courseId}, PlanType: ${planTypeToUse}`);
          }

          // 🔥 CRITICAL: Verify this is the correct plan (safety check)
          if (installmentPlan.courseId.toString() !== courseId.toString()) {
            throw new Error(`❌ Installment plan courseId mismatch. Plan: ${installmentPlan.courseId}, Expected: ${courseId}`);
          }

          if (installmentPlan && installmentPlan.installments && installmentPlan.installments.length > 0) {
            // Store all installment amounts from the plan at enrollment time
            installmentPlan.installments.forEach((planInst, idx) => {
              const instNumber = idx + 1; // 1-based
              const isFirstInstallment = instNumber === installmentNumber;
              // 🔥 CRITICAL: Only mark as paid if paymentId exists (payment was actually processed)
              // Use finalOrderId instead of orderId to ensure we have the correct value
              const hasValidPayment = isFirstInstallment && paymentId && finalOrderId;

              newCourse.installments.push({
                installmentNumber: instNumber,
                amount: planInst.amount, // Store original amount from plan
                paidDate: hasValidPayment ? new Date() : null,
                paymentId: hasValidPayment ? paymentId : null,
                orderId: hasValidPayment ? finalOrderId : null,
                isPaid: !!hasValidPayment, // 🔥 CRITICAL: Ensure boolean value
              });
            });

            console.log(`🔒 Locked in ${installmentPlan.installments.length} installment amounts for user ${userId} at enrollment`);
            console.log(`   Installment amounts: ${installmentPlan.installments.map(i => `₹${i.amount}`).join(', ')}`);
          } else {
            // Fallback: If plan not found, just store the first installment
            // 🔥 CRITICAL: Only mark as paid if paymentId exists (payment was actually processed)
            // Use finalOrderId instead of orderId to ensure we have the correct value
            const hasValidPayment = paymentId && finalOrderId;
            newCourse.installments.push({
              installmentNumber,
              amount: amountPaid,
              paidDate: hasValidPayment ? new Date() : null,
              paymentId: hasValidPayment ? paymentId : null,
              orderId: hasValidPayment ? finalOrderId : null,
              isPaid: !!hasValidPayment, // 🔥 CRITICAL: Ensure boolean value
            });
            console.log(`⚠️ Installment plan not found, storing only first installment amount`);
          }
        } catch (planError) {
          console.error(`❌ Error fetching installment plan for price lock-in:`, planError);
          // Fallback: Store only the first installment
          // 🔥 CRITICAL: Only mark as paid if paymentId exists (payment was actually processed)
          const hasValidPayment = paymentId && orderId;
          newCourse.installments.push({
            installmentNumber,
            amount: amountPaid,
            paidDate: hasValidPayment ? new Date() : null,
            paymentId: hasValidPayment ? paymentId : null,
            orderId: hasValidPayment ? orderId : null,
            isPaid: hasValidPayment, // Only mark as paid if payment was actually processed
          });
        }
      }

      console.log(`💳 Adding course to user with payment details:`, {
        courseId,
        paymentType: paymentMode,
        amountPaid,
        totalInstallments: isInstallment ? totalInstallments : 'N/A (full payment)',
        installmentNumber: isInstallment ? installmentNumber : 'N/A'
      });

      user.purchasedCourses.push(newCourse);
      await user.save();

      // 🔥 CRITICAL: Verify the course was actually saved
      const savedUser = await User.findById(userId).select('purchasedCourses');
      const savedCourse = savedUser.purchasedCourses.find(
        (c) => c.course.toString() === courseId.toString()
      );
      if (!savedCourse) {
        console.error("❌ CRITICAL: Course was not saved to user's purchasedCourses!");
        throw new Error("Failed to save course to user's purchasedCourses");
      }
      console.log("✅ Verified: Course successfully saved to user's purchasedCourses");
    } else {
      // Course already exists - update for subsequent installment payments
      const purchasedCourse = user.purchasedCourses[courseIndex];

      if (isInstallment) {
        // 🔥 CRITICAL: Ensure planType is stored (should already be there, but update if missing)
        if (!purchasedCourse.planType && installmentDetails?.planType) {
          purchasedCourse.planType = installmentDetails.planType;
          console.log(`✅ [ENROLLMENT] Updated missing planType for existing course: ${installmentDetails.planType}`);
        }

        // Update total amount paid
        purchasedCourse.amountPaid = (purchasedCourse.amountPaid || 0) + amountPaid;

        // Check if this installment already exists
        const existingInstallment = purchasedCourse.installments.find(
          (inst) => inst.installmentNumber === installmentNumber
        );

        if (existingInstallment) {
          // Update existing installment (use saved amount, not amountPaid)
          // 🔥 CRITICAL: Ensure isPaid is always a boolean, and use finalOrderId
          // Also fix any corrupted data where isPaid might be a string
          if (typeof existingInstallment.isPaid !== 'boolean') {
            console.warn(`⚠️ [ENROLLMENT] Found corrupted isPaid value (${typeof existingInstallment.isPaid}), fixing...`);
            // If isPaid was incorrectly set to orderId, extract it
            if (typeof existingInstallment.isPaid === 'string' && existingInstallment.isPaid.startsWith('order_')) {
              existingInstallment.orderId = existingInstallment.isPaid;
            }
          }
          existingInstallment.isPaid = true;
          existingInstallment.paidDate = new Date();
          existingInstallment.paymentId = paymentId || null;
          existingInstallment.orderId = finalOrderId || existingInstallment.orderId || null;
          // 🔒 Keep the original amount - don't update it with amountPaid
          console.log(`💳 Updated existing installment ${installmentNumber} for course ${courseId} (amount: ₹${existingInstallment.amount} - original)`);
        } else {
          // Installment doesn't exist in saved plan - this shouldn't happen for enrolled users
          // But if it does, try to find the amount from the saved plan first
          const savedInstallment = purchasedCourse.installments.find(
            inst => inst.installmentNumber === installmentNumber
          );

          if (savedInstallment) {
            // Use saved amount
            // 🔥 CRITICAL: Ensure isPaid is always a boolean, and use finalOrderId
            savedInstallment.isPaid = true;
            savedInstallment.paidDate = new Date();
            savedInstallment.paymentId = paymentId || null;
            savedInstallment.orderId = finalOrderId || null;
            console.log(`💳 Updated saved installment ${installmentNumber} for course ${courseId} (amount: ₹${savedInstallment.amount} - original)`);
          } else {
            // Fallback: Add new installment record (shouldn't happen for enrolled users)
            purchasedCourse.installments.push({
              installmentNumber,
              amount: amountPaid, // Use amountPaid only as fallback
              paidDate: new Date(),
              paymentId: paymentId || null,
              orderId: finalOrderId || null,
              isPaid: true, // 🔥 CRITICAL: Ensure boolean value
            });
            console.log(`⚠️ Added new installment ${installmentNumber} for course ${courseId} (fallback - amount: ₹${amountPaid})`);
          }
        }

        // Ensure totalInstallments is set
        if (!purchasedCourse.totalInstallments || purchasedCourse.totalInstallments === -1) {
          purchasedCourse.totalInstallments = totalInstallments;
        }
      } else {
        // Full payment - update amount paid
        purchasedCourse.amountPaid = (purchasedCourse.amountPaid || 0) + amountPaid;
      }

      await user.save();
      console.log(`💳 Updated course payment for user ${userId}, course ${courseId}, new total: ₹${purchasedCourse.amountPaid}`);

      // 🔥 CRITICAL: Verify the course update was actually saved
      const savedUser = await User.findById(userId).select('purchasedCourses');
      const savedCourse = savedUser.purchasedCourses.find(
        (c) => c.course.toString() === courseId.toString()
      );
      if (!savedCourse) {
        console.error("❌ CRITICAL: Course update was not saved to user's purchasedCourses!");
        throw new Error("Failed to update course in user's purchasedCourses");
      }
      console.log("✅ Verified: Course successfully updated in user's purchasedCourses");
    }

    // 🔥 REMOVED: Duplicate installment payment update logic
    // This is now handled by handleInstallmentPaymentLogic which is called separately
    // to avoid duplicate updates and race conditions

    // 🔥 OPTIMIZATION: Handle live class integration asynchronously (don't block enrollment)
    // This allows course access to be granted immediately while live classes are set up in background
    if (courseIndex === -1) {
      // Run live class integration in background (don't await)
      integrateLiveClassesLogic(userId, courseId).catch(error => {
        console.error(`⚠️ Live class integration failed (non-critical):`, error);
        // Don't throw - live class integration failure shouldn't block enrollment
      });
    }

    console.log("✅ Course enrollment/payment update completed");
    return {
      enrolled: true,
      courseId,
      userId,
      amountPaid,
      isNewEnrollment: courseIndex === -1,
      installmentNumber: isInstallment ? installmentNumber : null
    };
  } catch (error) {
    console.error("❌ Error in addCourseToUserLogic:", error);
    throw error;
  }
};

// ============================================================================
// 📹 LIVE CLASS INTEGRATION BUSINESS LOGIC
// ============================================================================
const integrateLiveClassesLogic = async (userId, courseId) => {
  try {
    console.log("💳 Integrating live classes with payment service");

    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found for live class integration");
    }

    // Find live classes where the courseId is in the courseIds array (supports multiple courses per class)
    const classes = await LiveClass.find({ courseIds: { $in: [courseId] } });

    const addUserToClasses = classes.map(async (cls) => {
      if (!cls.classId || !cls.commonParticipantLink) return;

      try {
        // Extract commonParticipantLink from the stored participantLink URL
        let commonParticipantLink = null;
        if (cls.participantLink) {
          const urlParts = cls.participantLink.split('/');
          const linkPart = urlParts[urlParts.length - 1];
          commonParticipantLink = linkPart?.split('?')[0];
        } else if (cls.liveLink) {
          const urlParts = cls.liveLink.split('/');
          const linkPart = urlParts[urlParts.length - 1];
          commonParticipantLink = linkPart?.split('?')[0];
        }

        if (!commonParticipantLink) {
          console.error(`❌ [INTEGRATE] No participant link found for class ${cls.title}`);
          return;
        }

        const response = await addUsersToClass(
          cls.classId,
          [user.merithubUserId],
          commonParticipantLink
        );

        const userRes = response.find((r) => r.userId === user.merithubUserId);
        if (!userRes?.userLink) {
          console.error(`❌ [INTEGRATE] No individual link returned for user ${user.merithubUserId}`);
          return;
        }

        const link = `https://live.merithub.com/info/room/${process.env.MERIT_HUB_CLIENT_ID}/${userRes.userLink}?iframe=true`;

        const liveClassInfo = {
          title: cls.title,
          startTime: cls.startTime,
          duration: cls.duration,
          liveLink: link, // 🔧 FIXED: Individual user link for student joining classes
          courseIds: courseId,
          classId: cls.classId, // Add classId for consistency
          platform: "merithub", // Add platform for consistency
        };

        await User.findByIdAndUpdate(userId, { $push: { liveClasses: liveClassInfo } });
        console.log(`✅ Added user to live class: ${cls.title}`);
      }
      catch (classError) {
        console.error(`❌ Error adding user to class ${cls.title}:`, classError);
      }
    });

    await Promise.all(addUserToClasses);
    console.log("✅ Live class integration completed");
  } catch (error) {
    console.error("❌ Error in integrateLiveClassesLogic:", error);
    throw error;
  }
};

// ============================================================================
// 💸 INSTALLMENT PAYMENT BUSINESS LOGIC
// ============================================================================
const handleInstallmentPaymentLogic = async (userId, courseId, installmentDetails, planType, orderId = null) => {
  try {
    console.log("💳 Processing installment payment with payment service");

    let plan = null;

    // 🔥 CRITICAL: First try to get installmentPlanId from order (most accurate)
    if (orderId) {
      const Order = require('../models/orderModel');
      const currentOrder = await Order.findOne({ orderId }).select('installmentPlanId');
      if (currentOrder?.installmentPlanId) {
        plan = await Installment.findById(currentOrder.installmentPlanId);
        console.log(`✅ [INSTALLMENT PAYMENT] Using installmentPlanId from order: ${currentOrder.installmentPlanId}`);
      }
    }

    // Fallback to planType lookup only if installmentPlanId not available
    if (!plan && planType) {
      plan = await Installment.findOne({ courseId, planType });
      console.log(`⚠️ [INSTALLMENT PAYMENT] Using planType fallback: ${planType}`);
    }

    if (!plan) {
      throw new Error("Installment plan not found");
    }

    // Find the specific installment entry
    const entryIndex = plan.userPayments.findIndex(
      (p) =>
        p.userId.toString() === userId.toString() &&
        p.installmentIndex === installmentDetails.installmentIndex
    );

    // 🔥 CRITICAL: Handle case where entry doesn't exist or is already paid
    if (entryIndex === -1) {
      // Entry doesn't exist - create it
      plan.userPayments.push({
        userId,
        installmentIndex: installmentDetails.installmentIndex,
        isPaid: true,
        paidAmount: installmentDetails.amount || plan.installments[installmentDetails.installmentIndex]?.amount || 0,
        paymentDate: new Date(),
      });
      console.log(`✅ [INSTALLMENT PAYMENT] Created new userPayment entry for installment ${installmentDetails.installmentIndex}`);
    } else if (plan.userPayments[entryIndex].isPaid) {
      // Already paid - log warning but don't throw error (idempotent operation)
      console.warn(`⚠️ [INSTALLMENT PAYMENT] Installment ${installmentDetails.installmentIndex} already paid, skipping update`);
      return {
        installmentPaid: true,
        remainingAmount: plan.remainingAmount,
        totalInstallments: plan.installments.length,
        paidInstallments: plan.userPayments.filter(p => p.userId.toString() === userId.toString() && p.isPaid).length,
        isCompleted: plan.status === "completed",
        alreadyPaid: true
      };
    } else {
      // Update existing entry
      plan.userPayments[entryIndex].isPaid = true;
      plan.userPayments[entryIndex].paymentDate = new Date();
      if (!plan.userPayments[entryIndex].paidAmount) {
        plan.userPayments[entryIndex].paidAmount = installmentDetails.amount || plan.installments[installmentDetails.installmentIndex]?.amount || 0;
      }
    }

    // Update installment in plan.installments array
    if (plan.installments[installmentDetails.installmentIndex]) {
      plan.installments[installmentDetails.installmentIndex].isPaid = true;
      plan.installments[installmentDetails.installmentIndex].paidOn = new Date();
    }

    // Recalculate remaining amount based on actual paid installments
    const paidAmount = plan.installments
      .filter(inst => inst.isPaid)
      .reduce((sum, inst) => sum + inst.amount, 0);
    plan.remainingAmount = plan.totalAmount - paidAmount;

    // Check if all installments are paid
    const paidInstallments = plan.userPayments.filter(
      (p) => p.userId.toString() === userId && p.isPaid
    ).length;

    if (paidInstallments === plan.installments.length) {
      plan.status = "completed";
    }

    await plan.save();

    console.log("✅ Installment payment processed");
    return {
      installmentPaid: true,
      remainingAmount: plan.remainingAmount,
      totalInstallments: plan.installments.length,
      paidInstallments,
      isCompleted: plan.status === "completed"
    };
  } catch (error) {
    console.error("❌ Error in handleInstallmentPaymentLogic:", error);
    throw error;
  }
};

// ============================================================================
// 🎣 WEBHOOK HANDLING BUSINESS LOGIC
// ============================================================================
const handlePaymentWebhookLogic = async (webhookData) => {
  try {
    const { signature, body } = webhookData;

    console.log("💳 Processing payment webhook with payment service");

    // Verify webhook signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(JSON.stringify(body))
      .digest("hex");

    if (signature !== generatedSignature) {
      throw new Error("Invalid webhook signature");
    }

    const {
      event,
      payload: {
        payment: { entity: paymentDetails },
      },
    } = body;

    // Handle payment captured event
    if (event === "payment.captured") {
      await handlePaymentCapturedLogic(paymentDetails);
    }

    console.log("✅ Payment webhook processed successfully");
    return {
      processed: true,
      event,
      paymentId: paymentDetails.id
    };
  } catch (error) {
    console.error("❌ Error in handlePaymentWebhookLogic:", error);
    throw error;
  }
};

// ============================================================================
// 💰 PAYMENT CAPTURED HANDLING BUSINESS LOGIC
// ============================================================================
const handlePaymentCapturedLogic = async (paymentDetails) => {
  try {
    const { order_id, id: paymentId, amount } = paymentDetails;

    console.log("💳 Processing captured payment with payment service");

    if (!amount || isNaN(amount)) {
      throw new Error("Invalid payment amount");
    }

    // Update order status
    const order = await Order.findOneAndUpdate(
      { orderId: order_id },
      {
        status: "paid",
        paymentId,
        paidAt: new Date(),
        ...(paymentDetails.paymentMode === "installment" && {
          "installmentDetails.isPaid": true,
        }),
      },
      { new: true }
    );

    if (!order) {
      throw new Error(`Order not found for ID: ${order_id}`);
    }

    const { userId, courseId, paymentMode, installmentDetails, planType } = order;

    // Handle installment payment if applicable
    // 🔥 CRITICAL: Pass orderId to ensure only the selected plan's installments are updated
    if (paymentMode === "installment") {
      await handleInstallmentPaymentLogic(userId, courseId, installmentDetails, planType, order_id);
    }

    // Enroll user in course
    // Add planType and installmentPlanId to installmentDetails if not present
    const installmentDetailsWithPlanType = installmentDetails ? {
      ...installmentDetails,
      planType: planType || installmentDetails.planType,
      installmentPlanId: order.installmentPlanId || installmentDetails.installmentPlanId // 🔥 CRITICAL: Include installmentPlanId
    } : null;

    await addCourseToUserLogic(userId, courseId, paymentMode, installmentDetailsWithPlanType, paymentDetails, order_id);

    // 🔥 SEND PAYMENT RECEIPT MESSAGE TO STUDENT'S CHAT
    try {
      console.log("💬 Attempting to send payment receipt message (webhook)...", {
        userId,
        courseId,
        orderId: order_id
      });

      const user = await User.findById(userId).select("firstName lastName email");
      const course = await Course.findById(courseId).select("title");

      if (!user) {
        console.error("⚠️ User not found for payment receipt message:", userId);
        return;
      }

      if (!course) {
        console.error("⚠️ Course not found for payment receipt message:", courseId);
        return;
      }

      console.log("✅ User and course found, sending message...", {
        userName: user.firstName,
        courseTitle: course.title
      });

      // Refresh order to get latest data
      const updatedOrder = await Order.findOne({ orderId: order_id });
      await sendPaymentReceiptMessage(updatedOrder || order, course, user);
      console.log("✅ Payment receipt message sent successfully (webhook)");
    } catch (messageError) {
      console.error("❌ Error sending payment receipt message (webhook):", messageError);
      console.error("❌ Message error details:", messageError.stack);
      // Don't throw - payment is successful, message is just a notification
    }

    console.log("✅ Payment captured and processed successfully");
    return {
      captured: true,
      orderId: order_id,
      paymentId,
      courseEnrolled: true
    };
  } catch (error) {
    console.error("❌ Error in handlePaymentCapturedLogic:", error);
    throw error;
  }
};

// ============================================================================
// 💲 PRICE CALCULATION BUSINESS LOGIC
// ============================================================================
const calculatePaymentChargesLogic = (basePrice, options = {}) => {
  try {
    const {
      discount = 0,
      gstPercentage = 0,
      internetHandlingPercentage = 0,
      numberOfInstallments = 1
    } = options;

    console.log("💳 Calculating payment charges with payment service");

    // Validate inputs
    if (discount < 0 || discount > 100) {
      throw new Error("Discount must be between 0 and 100");
    }

    // Calculate discount
    const discountValue = (basePrice * discount) / 100;
    let totalAmount = basePrice - discountValue;

    // Calculate GST
    const gstAmount = (totalAmount * gstPercentage) / 100;

    // Calculate internet handling charges
    const internetHandlingCharge = (totalAmount * internetHandlingPercentage) / 100;

    // Final total
    totalAmount += gstAmount + internetHandlingCharge;

    // Calculate installment amounts if applicable
    let installmentAmounts = [];
    if (numberOfInstallments > 1) {
      const baseInstallmentAmount = Math.floor((totalAmount / numberOfInstallments) * 100) / 100;
      const remainder = Math.round((totalAmount - (baseInstallmentAmount * numberOfInstallments)) * 100) / 100;

      for (let i = 0; i < numberOfInstallments; i++) {
        const amount = i === 0 ? baseInstallmentAmount + remainder : baseInstallmentAmount;
        installmentAmounts.push(amount);
      }
    }

    const calculation = {
      basePrice,
      discount,
      discountValue,
      gstPercentage,
      gstAmount,
      internetHandlingPercentage,
      internetHandlingCharge,
      totalAmount,
      numberOfInstallments,
      installmentAmounts
    };

    console.log("✅ Payment charges calculated successfully");
    return calculation;
  } catch (error) {
    console.error("❌ Error in calculatePaymentChargesLogic:", error);
    throw error;
  }
};

// ============================================================================
// 🔍 ORDER MANAGEMENT BUSINESS LOGIC
// ============================================================================
const getOrderStatusLogic = async (orderId) => {
  try {
    console.log("💳 Getting order status with payment service");

    const order = await Order.findOne({ orderId })
      .populate('userId', 'firstName lastName email')
      .populate('courseId', 'courseName price');

    if (!order) {
      throw new Error("Order not found");
    }

    console.log("✅ Order status retrieved successfully");
    return order;
  } catch (error) {
    console.error("❌ Error in getOrderStatusLogic:", error);
    throw error;
  }
};

const getUserOrdersLogic = async (userId, options = {}) => {
  try {
    const { page = 1, limit = 10, status } = options;

    console.log("💳 Getting user orders with payment service");

    let query = { userId };
    if (status) {
      query.status = status;
    }

    const orders = await Order.find(query)
      .populate('courseId', 'courseName price')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalOrders = await Order.countDocuments(query);

    console.log("✅ User orders retrieved successfully");
    return {
      orders,
      totalOrders,
      currentPage: page,
      totalPages: Math.ceil(totalOrders / limit)
    };
  } catch (error) {
    console.error("❌ Error in getUserOrdersLogic:", error);
    throw error;
  }
};

// ============================================================================
// 📤 EXPORTS
// ============================================================================
module.exports = {
  createRazorpayOrderLogic,
  verifyPaymentSignatureLogic,
  addCourseToUserLogic,
  integrateLiveClassesLogic,
  handleInstallmentPaymentLogic,
  handlePaymentWebhookLogic,
  handlePaymentCapturedLogic,
  calculatePaymentChargesLogic,
  getOrderStatusLogic,
  getUserOrdersLogic,

  // Utility functions
  generateReceipt,
  generateUniqueTrackingNumber,
  generateOrderId,
};
