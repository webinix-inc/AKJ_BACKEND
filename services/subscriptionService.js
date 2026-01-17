// ============================================================================
// 💳 SUBSCRIPTION BUSINESS LOGIC SERVICE
// ============================================================================
// 
// This service handles all subscription-related business logic that was
// previously mixed in adminController.js. It maintains the same core
// logic and algorithms while providing better separation of concerns.
//
// Functions moved from adminController.js:
// - createSubscription business logic
// - updateSubscription business logic  
// - deleteSubscription business logic
// - Course pricing calculations
// - Validity management
// - Installment plan integration
//
// ============================================================================

const Subscription = require("../models/subscriptionModel");
const Course = require("../models/courseModel");
const Installment = require("../models/installmentModel");
const installmentService = require("./installmentService");

// ============================================================================
// 🆕 CREATE SUBSCRIPTION BUSINESS LOGIC
// ============================================================================
const createSubscriptionLogic = async (subscriptionData) => {
  try {
    const {
      course,
      name,
      description,
      type,
      validities,
      features,
      pdfDownloadPermissionsApp,
      pdfDownloadInDevice,
      pdfDownloadWithinApp,
      pdfPermissionsWeb,
      pdfViewAccess,
      pdfDownloadAccess,
      gst,
      internetHandling,
    } = subscriptionData;

    // Validate course existence and fetch full course data
    console.log("course from createSubscriptionLogic :", course);
    let courseData = null;
    if (course) {
      courseData = await Course.findById(course);
      if (!courseData) {
        throw new Error("Course not found");
      }
    }

    // Check if a subscription already exists for this course
    const existingSubscription = await Subscription.findOne({
      course: courseData._id,
    });
    if (existingSubscription) {
      throw new Error("A subscription for this course already exists");
    }

    // Validate type of subscription (optional)
    const validTypes = ["Basic", "Premium", "Recording"];
    if (type && !validTypes.includes(type)) {
      throw new Error(`Invalid subscription type. Allowed types: ${validTypes.join(", ")}`);
    }

    // Validate validities
    if (validities && !Array.isArray(validities)) {
      throw new Error("Validities should be an array");
    }

    // Validate features if provided
    if (features && !Array.isArray(features)) {
      throw new Error("Features should be an array");
    }

    // Validate GST and Internet Handling Charges
    if (gst && (typeof gst !== "number" || gst < 0)) {
      throw new Error("GST must be a non-negative number");
    }

    if (internetHandling && (typeof internetHandling !== "number" || internetHandling < 0)) {
      throw new Error("Internet Handling Charges must be a non-negative number");
    }

    // Create new subscription object with all fields
    const newSubscription = new Subscription({
      course: courseData, // Store the full course data
      name,
      description,
      type,
      validities,
      features, // Optional features field
      pdfDownloadPermissionsApp,
      pdfDownloadInDevice,
      pdfDownloadWithinApp,
      pdfPermissionsWeb,
      pdfViewAccess,
      pdfDownloadAccess,
      gst, // New GST field
      internetHandling, // New Internet Handling Charges field
    });

    // Calculate and update course pricing based on validities
    if (validities && validities.length > 0) {
      const pricingResult = calculateLowestPrice(validities);

      courseData.price = pricingResult.lowestDiscountedPrice;
      courseData.discount = pricingResult.correspondingDiscount;
      courseData.oldPrice = pricingResult.basePrice;

      await courseData.save();
      console.log(`💰 Course pricing updated: ₹${pricingResult.lowestDiscountedPrice} (${pricingResult.correspondingDiscount}% off ₹${pricingResult.basePrice})`);
    }

    // Save the subscription to the database
    const savedSubscription = await newSubscription.save();
    console.log("✅ Subscription created successfully:", savedSubscription._id);

    // 🔥 AUTO-CREATE: Create default one-time installment plans for all validities
    if (validities && validities.length > 0) {
      console.log("📊 Auto-creating default installment plans for new subscription...");
      try {
        await installmentService.createOneTimeInstallmentsForValidities(
          courseData._id,
          validities,
          gst || 0,
          internetHandling || 0
        );
        console.log("✅ Default installment plans created successfully");
      } catch (installmentError) {
        console.error("❌ Error creating default installment plans:", installmentError);
        // Don't fail subscription creation if installment creation fails
      }
    }

    return savedSubscription;
  } catch (error) {
    console.error("Error in createSubscriptionLogic:", error.message);
    throw error;
  }
};

// ============================================================================
// 🔄 UPDATE SUBSCRIPTION BUSINESS LOGIC
// ============================================================================

// Helper to ensure default "Full Payment" installment exists for every validity
const ensureDefaultInstallments = async (subscription) => {
  try {
    if (!subscription || !subscription.validities || !subscription.course) return;

    // Populate course if it's not already populated, to get the _id
    const courseId = subscription.course._id || subscription.course;

    for (const validity of subscription.validities) {
      const planType = `${validity.validity} months`; // e.g. "12 months"

      // Check if an installment plan already exists for this course & validity type
      const existingInstallment = await Installment.findOne({
        courseId: courseId,
        planType: { $regex: new RegExp(`^${planType}$`, "i") } // Case insensitive check
      });

      if (!existingInstallment) {
        // Create default 1-payment installment

        // 1. Calculate Base Discounted Price
        const discount = validity.discount || 0;
        const discountAmount = (validity.price * discount) / 100;
        const baseDiscountedPrice = validity.price - discountAmount;

        // 2. Calculate Taxes & Fees
        const gstPercent = subscription.gst || 0;
        const handlingPercent = subscription.internetHandling || 0;

        const gstAmount = (baseDiscountedPrice * gstPercent) / 100;
        const handlingAmount = (baseDiscountedPrice * handlingPercent) / 100;

        // 3. Final Total
        const finalPrice = Math.floor(baseDiscountedPrice + gstAmount + handlingAmount);

        const newInstallment = new Installment({
          courseId: courseId,
          planType: planType,
          numberOfInstallments: 1,
          totalAmount: finalPrice, // REQUIRED FIELD
          installments: [
            {
              amount: finalPrice,
              dueDate: "Immediate", // REQUIRED STRING
              isPaid: false
            }
          ]
        });

        await newInstallment.save();
        console.log(`Auto-created default installment for: ${planType} for course ${courseId} (Price: ${finalPrice} incl. ${gstPercent}% GST & ${handlingPercent}% Handling)`);
      }
    }
  } catch (error) {
    console.error("Error ensuring default installments:", error);
    // Don't block the main flow if this fails
  }
};

const updateSubscriptionLogic = async (subscriptionId, updateData) => {
  try {
    // Fetch the current subscription to compare changes, particularly for validities
    const currentSubscription = await Subscription.findById(subscriptionId).populate("course");

    if (!currentSubscription) {
      throw new Error("Subscription not found");
    }

    // Determine the course to use for downstream operations (installments, etc.)
    let resolvedCourseId = null;
    if (currentSubscription.course) {
      resolvedCourseId = currentSubscription.course._id || currentSubscription.course;
    }

    // Validate the provided course ID, if it's being updated
    if (updateData.course) {
      const incomingCourseId = updateData.course.toString();
      const currentCourseId = resolvedCourseId ? resolvedCourseId.toString() : null;

      if (!currentCourseId || incomingCourseId !== currentCourseId) {
        const courseData = await Course.findById(updateData.course);
        if (!courseData) {
          throw new Error("Course not found");
        }
        resolvedCourseId = courseData._id;
        updateData.course = courseData._id; // Ensure only the course ID is stored
      } else {
        // Ensure the stored value is the actual ObjectId instance
        updateData.course = resolvedCourseId;
      }
    }

    // Validate the type of subscription, if it's being updated
    const validTypes = ["Basic", "Premium", "Recording"];
    if (updateData.type && !validTypes.includes(updateData.type)) {
      throw new Error(`Invalid subscription type. Allowed types: ${validTypes.join(", ")}`);
    }

    // Handling removed validities - check for existing installments
    if (updateData.validities) {
      const removedValidities = currentSubscription.validities.filter(
        (v) => !updateData.validities.some((uv) => uv.validity === v.validity)
      );

      if (resolvedCourseId) {
        for (const validity of removedValidities) {
          const associatedInstallments = await Installment.find({
            courseId: resolvedCourseId,
            planType: { $regex: new RegExp(`^${validity.validity} months$`, "i") },
          });
          if (associatedInstallments.length > 0) {
            // Instead of blocking, we auto-delete the linked installment plan
            console.log(`🗑️ Auto-deleting installment plan for removed validity: ${validity.validity} months`);
            await Installment.deleteMany({
              courseId: resolvedCourseId,
              planType: { $regex: new RegExp(`^${validity.validity} months$`, "i") },
            });
          }
        }
      }
    }

    // Validate validities, if being updated
    if (updateData.validities && !Array.isArray(updateData.validities)) {
      throw new Error("Validities should be an array");
    }

    // Validate features, if being updated
    if (updateData.features && !Array.isArray(updateData.features)) {
      throw new Error("Features should be an array");
    }

    // Validate GST, if being updated
    if (updateData.gst !== undefined && (typeof updateData.gst !== "number" || updateData.gst < 0)) {
      throw new Error("GST must be a non-negative number");
    }

    // Validate Internet Handling Charges, if being updated
    if (updateData.internetHandling !== undefined &&
      (typeof updateData.internetHandling !== "number" || updateData.internetHandling < 0)) {
      throw new Error("Internet Handling Charges must be a non-negative number");
    }

    // Update the subscription
    await Subscription.findByIdAndUpdate(subscriptionId, updateData, { new: true });

    // Re-fetch the subscription to include populated course data
    const updatedSubscription = await Subscription.findById(subscriptionId).populate("course");

    // 🔥 CHECK: If course changed, check if previous course needs unpublishing
    if (updateData.course && resolvedCourseId && currentSubscription.course) {
      const oldCourseId = currentSubscription.course._id || currentSubscription.course;
      // Compare strictly (strings)
      if (oldCourseId.toString() !== resolvedCourseId.toString()) {
        const remainingCount = await Subscription.countDocuments({ course: oldCourseId });
        if (remainingCount === 0) {
          console.log(`📉 Auto-unpublishing PREVIOUS course ${oldCourseId} as its last subscription was moved.`);
          await Course.findByIdAndUpdate(oldCourseId, { isPublished: false });
        }

        // Optional: Clean up installments on old course? 
        // The prompt didn't strictly ask, but it's good practice. 
        // For now, we stick to the requested behavior (unpublishing).
      }
    }

    // 🔥 CRITICAL: Update existing installment plans when validities change
    if (updateData.validities) {
      console.log("📊 Updating existing installment plans due to validity changes...");

      try {
        // Create subscription object for the service call
        const subscriptionForUpdate = {
          ...currentSubscription.toObject(),
          validities: updateData.validities,
          gst: updateData.gst !== undefined ? updateData.gst : currentSubscription.gst,
          internetHandling: updateData.internetHandling !== undefined ? updateData.internetHandling : currentSubscription.internetHandling
        };

        if (resolvedCourseId) {
          await installmentService.updateExistingInstallmentPlans(
            resolvedCourseId,
            subscriptionForUpdate,
            updateData.validities
          );
          console.log("✅ Installment plans updated successfully");
        } else {
          console.warn("⚠️ Skipping installment plan update because subscription is not linked to any course");
        }
      } catch (installmentUpdateError) {
        console.error("❌ Error updating installment plans:", installmentUpdateError);
        // Log error but don't fail the subscription update
      }
    }

    if (!updatedSubscription) {
      throw new Error("Subscription not found after update");
    }

    // 🔥 AUTO-ENSURE: Create default installments for any NEW validities added during update
    await ensureDefaultInstallments(updatedSubscription);

    return updatedSubscription;
  } catch (error) {
    console.error("Error in updateSubscriptionLogic:", error.message);
    throw error;
  }
};

// ============================================================================
// 🗑️ DELETE SUBSCRIPTION BUSINESS LOGIC
// ============================================================================
const deleteSubscriptionLogic = async (subscriptionId) => {
  try {
    // First, find the subscription by ID to access the course ID before deleting
    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) {
      throw new Error("Subscription not found");
    }

    // Check if course is published and if this is the last subscription
    const courseId = subscription.course;
    const Course = require("../models/courseModel");
    const course = await Course.findById(courseId);

    if (course && course.isPublished) {
      const subCount = await Subscription.countDocuments({ course: courseId });
      // If this is the last subscription, auto-unpublish the course
      if (subCount <= 1) {
        console.log(`📉 Auto-unpublishing course ${courseId} as its last subscription plan is being deleted.`);
        course.isPublished = false;
        await course.save();
      }
    }

    // Delete the subscription
    const deletedSubscription = await Subscription.findByIdAndDelete(subscriptionId);
    if (!deletedSubscription) {
      throw new Error("Subscription not found during deletion");
    }

    // Delete related installments based on the course ID of the deleted subscription
    await installmentService.deleteInstallmentsForCourse(courseId);

    console.log(`✅ Subscription ${subscriptionId} and related installments deleted successfully`);

    return {
      subscription: deletedSubscription,
      message: "Subscription and related installments deleted successfully"
    };
  } catch (error) {
    console.error("Error in deleteSubscriptionLogic:", error.message);
    throw error;
  }
};

// ============================================================================
// 💰 PRICING CALCULATION UTILITIES
// ============================================================================
const calculateLowestPrice = (validities) => {
  let lowestDiscountedPrice = Number.MAX_VALUE;
  let correspondingDiscount = 0;
  let basePrice = 0;

  validities.forEach((item) => {
    const discount = item.discount || 0;
    const discountAmount = (item.price * discount) / 100;
    const finalPrice = item.price - discountAmount;

    if (finalPrice < lowestDiscountedPrice) {
      lowestDiscountedPrice = finalPrice;
      correspondingDiscount = discount;
      basePrice = item.price;
    }
  });

  return {
    lowestDiscountedPrice,
    correspondingDiscount,
    basePrice
  };
};

// ============================================================================
// 📊 SUBSCRIPTION VALIDATION UTILITIES
// ============================================================================
const validateSubscriptionData = (data) => {
  const errors = [];

  // Required fields validation
  if (!data.course) errors.push("Course is required");
  if (!data.name) errors.push("Name is required");
  // Type is optional - removed requirement

  // Type validation (only if provided)
  const validTypes = ["Basic", "Premium", "Recording"];
  if (data.type && !validTypes.includes(data.type)) {
    errors.push(`Invalid subscription type. Allowed types: ${validTypes.join(", ")}`);
  }

  // Validities validation
  if (data.validities && !Array.isArray(data.validities)) {
    errors.push("Validities should be an array");
  }

  // Features validation
  if (data.features && !Array.isArray(data.features)) {
    errors.push("Features should be an array");
  }

  // GST validation
  if (data.gst && (typeof data.gst !== "number" || data.gst < 0)) {
    errors.push("GST must be a non-negative number");
  }

  // Internet handling validation
  if (data.internetHandling && (typeof data.internetHandling !== "number" || data.internetHandling < 0)) {
    errors.push("Internet Handling Charges must be a non-negative number");
  }

  return errors;
};

// ============================================================================
// 🔍 SUBSCRIPTION QUERY UTILITIES
// ============================================================================
const checkExistingSubscription = async (courseId) => {
  try {
    const existingSubscription = await Subscription.findOne({ course: courseId });
    return existingSubscription;
  } catch (error) {
    console.error("Error checking existing subscription:", error);
    throw error;
  }
};

const getSubscriptionWithInstallments = async (subscriptionId) => {
  try {
    const subscription = await Subscription.findById(subscriptionId).populate("course");
    if (!subscription) {
      return null;
    }

    const installments = await Installment.find({ courseId: subscription.course._id });

    return {
      subscription,
      installments,
      installmentCount: installments.length
    };
  } catch (error) {
    console.error("Error getting subscription with installments:", error);
    throw error;
  }
};

// ============================================================================
// 📤 EXPORTS
// ============================================================================
module.exports = {
  createSubscriptionLogic,
  updateSubscriptionLogic,
  deleteSubscriptionLogic,
  calculateLowestPrice,
  validateSubscriptionData,
  checkExistingSubscription,
  getSubscriptionWithInstallments
};
