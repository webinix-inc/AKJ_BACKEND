const Coupon = require("../models/couponModel");
const User = require("../models/userModel");
const Course = require("../models/courseModel");
// const { validateCoupon } = require('./couponController');

exports.createCoupon = async (req, res) => {
  try {
    const {
      offerName,
      couponCode,
      couponType,
      assignedUserIds,
      courseSelectionType,
      assignedCourseIds,
      usageLimit,
      isUnlimited,
      usagePerStudent,
      visibility,
      discountType,
      discountAmount,
      discountPercentage,
      startDate,
      startTime,
      endDate,
      endTime,
      isLifetime,
      minimumOrderValue,
    } = req.body;
    console.log(req.body);

    if (!couponCode) {
      return res.status(400).json({ message: "couponCode is required" });
    }

    const existingCoupon = await Coupon.findOne({ couponCode });
    if (existingCoupon) {
      return res.status(400).json({ message: "Coupon code already exists" });
    }

    if (
      couponType === "Private" &&
      (!assignedUserIds || assignedUserIds.length === 0)
    ) {
      return res
        .status(400)
        .json({ message: "Private coupons require assigned users" });
    }

    if (
      courseSelectionType === "Specific" &&
      (!assignedCourseIds || assignedCourseIds.length === 0)
    ) {
      return res.status(400).json({
        message: "Specific course selection requires assigned courses",
      });
    }

    console.log("!!!@");

    const sanitizedDiscountAmount = discountAmount === "" ? 0 : discountAmount;
    const sanitizedDiscountPercentage =
      discountPercentage === "" ? 0 : discountPercentage;

    console.log("Discount amount is this ", sanitizedDiscountAmount);
    console.log("Discount percentage is this ", sanitizedDiscountPercentage);

    const coupon = new Coupon({
      offerName,
      couponCode,
      couponType,
      assignedUsers: couponType === "Private" ? assignedUserIds : [],
      courseSelectionType,
      assignedCourses:
        courseSelectionType === "Specific" ? assignedCourseIds : [],
      usageLimit: isUnlimited ? null : usageLimit,
      isUnlimited,
      usagePerStudent,
      visibility,
      discountType,
      discountAmount: sanitizedDiscountAmount,
      discountPercentage: sanitizedDiscountPercentage,
      startDate,
      startTime,
      endDate,
      endTime,
      isLifetime,
      minimumOrderValue,
    });

    await coupon.save();
    console.log("!!!@####");
    res.status(201).json({ message: "Coupon created successfully", coupon });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating coupon", error: error.message });
  }
};

exports.getAllCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find()
      .populate("assignedUsers", "fullName email")
      .populate("assignedCourses", "title price");
    res.status(200).json(coupons);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching coupons", error: error.message });
  }
};

exports.getCouponById = async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id)
      .populate("assignedUsers", "fullName email")
      .populate("assignedCourses", "title price");

    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    res.status(200).json(coupon);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching coupon", error: error.message });
  }
};

exports.updateCoupon = async (req, res) => {
  try {
    console.log(
      "req.body() we are getting on calling updateCoupon :",
      req.body
    );
    const {
      offerName,
      couponType,
      couponCode,
      assignedUserIds,
      courseSelectionType,
      assignedCourseIds,
      usageLimit,
      isUnlimited,
      usagePerStudent,
      visibility,
      discountType,
      discountAmount,
      discountPercentage,
      startDate,
      startTime,
      endDate,
      endTime,
      isLifetime,
      minimumOrderValue,
    } = req.body;

    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    const sanitizedDiscountAmount =
      discountAmount === "" || isNaN(discountAmount)
        ? 0
        : Number(discountAmount);
    const sanitizedDiscountPercentage =
      discountPercentage === "" || isNaN(discountPercentage)
        ? 0
        : Number(discountPercentage);

    coupon.offerName = offerName || coupon.offerName;
    coupon.couponCode = couponCode || coupon.couponCode;
    coupon.couponType = couponType || coupon.couponType;

    if (couponType === "Private") {
      coupon.assignedUsers = assignedUserIds || coupon.assignedUsers;
    }
    coupon.courseSelectionType =
      courseSelectionType || coupon.courseSelectionType;
    if (courseSelectionType === "Specific") {
      coupon.assignedCourses = assignedCourseIds || coupon.assignedCourses;
    }
    coupon.usageLimit = isUnlimited ? null : usageLimit || coupon.usageLimit;
    coupon.isUnlimited = isUnlimited;
    coupon.usagePerStudent = usagePerStudent || coupon.usagePerStudent;
    coupon.visibility =
      visibility !== undefined ? visibility : coupon.visibility;
    coupon.discountType = discountType || coupon.discountType;
    if (discountType === "Flat") {
      coupon.discountAmount = sanitizedDiscountAmount;
      coupon.discountPercentage = 0;
    } else if (discountType === "Percentage") {
      coupon.discountPercentage = sanitizedDiscountPercentage;
      coupon.discountAmount = 0;
    }

    // coupon.discountAmount = discountAmount || coupon.discountAmount;
    coupon.startDate = startDate || coupon.startDate;
    coupon.startTime = startTime || coupon.startTime;
    coupon.isLifetime = isLifetime;
    coupon.endDate = isLifetime ? endDate || coupon.endDate : null;
    coupon.endTime = isLifetime ? endTime || coupon.endTime : null;
    coupon.minimumOrderValue = minimumOrderValue || coupon.minimumOrderValue;

    await coupon.save();
    console.log("Upadated coupon is hereby :", coupon);
    res.status(200).json({ message: "Coupon updated successfully", coupon });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating coupon", error: error.message });
  }
};

exports.deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }
    res.status(200).json({ message: "Coupon deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting coupon", error: error.message });
  }
};

exports.validateCoupon = async (req) => {
  try {
    const { couponCode, userId, courseId, orderAmount } = req.body;

    console.log(userId);

    const coupon = await Coupon.findOne({ couponCode });
    if (!coupon) {
      return { success: false, message: "Invalid coupon code" };
    }

    if (!coupon.visibility) {
      return { success: false, message: "This coupon is not active" };
    }

    const currentDate = new Date();
    const currentTime = currentDate.toLocaleTimeString("en-US", {
      hour12: false,
    });

    if (
      !coupon.isLifetime &&
      (currentDate < new Date(coupon.startDate) ||
        currentDate > new Date(coupon.endDate) ||
        currentTime < coupon.startTime ||
        currentTime > coupon.endTime)
    ) {
      return {
        success: false,
        message: "Coupon has expired or not yet active",
      };
    }

    if (orderAmount < coupon.minimumOrderValue) {
      return {
        success: false,
        message: `Minimum order amount should be ${coupon.minimumOrderValue}`,
      };
    }

    if (
      coupon.couponType === "Private" &&
      !coupon.assignedUsers.includes(userId)
    ) {
      return {
        success: false,
        message: "You are not eligible for this coupon",
      };
    }

    if (
      coupon.courseSelectionType === "Specific" &&
      !coupon.assignedCourses.includes(courseId)
    ) {
      return {
        success: false,
        message: "Coupon not applicable for this course",
      };
    }

    if (!coupon.isUnlimited && coupon.usageCount >= coupon.usageLimit) {
      return { success: false, message: "Coupon usage limit exceeded" };
    }

    const userUsage = coupon.userUsage.find((u) => u.userId === userId);
    if (userUsage && userUsage.usageCount >= coupon.usagePerStudent) {
      return {
        success: false,
        message: `You have exceeded the maximum usage limit (${coupon.usagePerStudent}) for this coupon`,
      };
    }

    // const discount =
    //   coupon.discountType === "Percentage"
    //     ? (orderAmount * coupon.discountAmount) / 100
    //     : coupon.discountAmount;
    const discount =
      coupon.discountType === "Percentage"
        ? (orderAmount * coupon.discountPercentage) / 100
        : coupon.discountAmount;

    return {
      success: true,
      discount,
      discountType: coupon.discountType,
      ...(coupon.discountType === "Percentage"
        ? { discountPercentage: coupon.discountPercentage }
        : { discountAmount: coupon.discountAmount }),
    };
  } catch (error) {
    return {
      success: false,
      message: "Error validating coupon",
      error: error.message,
    };
  }
};

// exports.getAvailableCoupons = async (req, res) => {
//   try {
//     const userId = req.userId;
//     const { courseId } = req.query;

//     // Get all public coupons and private coupons assigned to the user
//     const coupons = await Coupon.find({
//       $or: [
//         { couponType: "Public" },
//         {
//           couponType: "Private",
//           assignedUsers: userId,
//         },
//       ],
//       visibility: true,
//       $or: [
//         { isLifetime: true },
//         {
//           endDate: { $gte: new Date() },
//           startDate: { $lte: new Date() },
//         },
//       ],
//       $or: [
//         { courseSelectionType: "All" }, // assuming "All" means it's not specific
//         {
//           courseSelectionType: "Specific",
//           assignedCourses: courseId, // ensure current course is in assignedCourses
//         },
//       ],
//     });

//     res.status(200).json(coupons);
//   } catch (error) {
//     res.status(500).json({
//       message: "Error fetching available coupons",
//       error: error.message,
//     });
//   }
// };

exports.getAvailableCoupons = async (req, res) => {
  try {
    const userId = req.userId;
    const { courseId } = req.query;

    const today = new Date();

    // const coupons = await Coupon.find({
    //   $and: [
    //     {
    //       $or: [
    //         { couponType: "Public" },
    //         { couponType: "Private", assignedUsers: userId },
    //       ],
    //     },
    //     { visibility: true },
    //     // {
    //     //   $or: [
    //     //     // { isLifetime: true },
    //     //     { isLifetime: { $eq: true } },

    //     //     {
    //     //       startDate: { $lte: today },
    //     //       endDate: { $gte: today },
    //     //     },
    //     //   ],
    //     // },

    //     {
    //       $or: [
    //         { courseSelectionType: "All" },
    //         {
    //           courseSelectionType: "Specific",
    //           assignedCourses: courseId, // Make sure this is a string and matches ObjectId if needed
    //         },
    //       ],
    //     },
    //   ],
    // });

    const coupons = await Coupon.find({
      $or: [
        { couponType: "Public" },
        { couponType: "Private", assignedUsers: userId },
      ],
      visibility: true,
      $or: [
        { isLifetime: true },
        {
          startDate: { $lte: today },
          endDate: { $gte: today },
        },
      ],
      $or: [
        { courseSelectionType: "All" },
        {
          courseSelectionType: "Specific",
          assignedCourses: courseId, // this must match the type in DB (e.g., ObjectId or string)
        },
      ],
    });
    res.status(200).json(coupons);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching available coupons",
      error: error.message,
    });
  }
};

exports.applyCoupon = async (req, res) => {
  try {
    const { couponCode, courseId, orderAmount } = req.body;
    const userId = req.userId;

    // Call validateCoupon and handle its result
    const validationResult = await exports.validateCoupon(req);
    if (!validationResult.success) {
      return res.status(400).json(validationResult);
    }

    const coupon = await Coupon.findOne({ couponCode });
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    // Update global usage count
    // coupon.usageCount += 1;

    // Update user-specific usage count
    const userUsageIndex = coupon.userUsage.findIndex(
      (u) => u.userId === userId
    );
    if (userUsageIndex >= 0) {
      coupon.userUsage[userUsageIndex].usageCount += 1;
    } else {
      coupon.userUsage.push({ userId, usageCount: 1 });
    }

    // Save updated coupon
    await coupon.save();

    console.log("These are the validation results :", validationResult);
    console.log("This is the coupon after applying :", coupon);

    // Send success response
    res.status(200).json({
      message: "Coupon applied successfully",
      discount: validationResult.discount,
      discountType: validationResult.discountType,
      ...(validationResult.discountType === "Percentage"
        ? { discountPercentage: validationResult.discountPercentage }
        : { discountAmount: validationResult.discountAmount }),
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error applying coupon", error: error.message });
  }
};
