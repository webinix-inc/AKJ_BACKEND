const User = require("../models/userModel");
const authConfig = require("../configs/auth.config");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const newOTP = require("otp-generators");
const bcrypt = require("bcryptjs");
const ffmpeg = require("fluent-ffmpeg");
const Banner = require("../models/bannerModel");
const Subscription = require("../models/subscriptionModel");
const UserSubscription = require("../models/userSubscriptionModel");
const Subject = require("../models/subjectModel");
const Privacy = require("../models/privacyPolicyModel");
const AboutUs = require("../models/aboutUsModel");
const Course = require("../models/courseModel");
const Notification = require("../models/notificationModel");
const Schedule = require("../models/scheduleModel");
const Category = require("../models/course/courseCategory");
const Installment = require("../models/installmentModel");
const installmentService = require("../services/installmentService");
const subscriptionService = require("../services/subscriptionService");
const courseService = require("../services/courseService");
const productService = require("../services/productService");
const fileService = require("../services/fileService");
const Product = require("../models/ProductModel");
// const Cart = require("../models/cartModel"); // UNUSED - Removed
// const Address = require("../models/addressModel"); // UNUSED - Removed
// const Order = require('../models/orderModel');
const CourseCategory = require("../models/course/courseCategory");
const CourseSubCategory = require("../models/course/courseSubCategory");
const NoticeBoard = require("../models/noticeBoardModel");
const Syllabus = require("../models/syllabusModel");
const TestSeries = require("../models/testSeriesModel");
const VideoLecture = require("../models/videoLectureModel");
const ExamSchedule = require("../models/examScheduleModel");
const Folder = require("../models/folderModel");
const File = require("../models/fileModel");
const Recording = require("../models/recordingModel");
const SurveyForm = require("../models/surveyModel");
const FollowUs = require("../models/followusModel");
const {
  generatePresignedUrl,
  generateUploadUrl,
  deleteFilesFromBucket,
} = require("../configs/aws.config");
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { kpUpload1, TestSeriesUpload } = require("../middlewares/fileUpload");
const { logger } = require("../utils/logger");

//
const Faq = require("../models/faqModel");
const { createFolder } = require("./courseController");

// Using existing fileUpload configurations instead of creating new ones
console.log("✅ AdminController: Using existing S3 configurations from fileUpload.js");
// TestSeriesUpload is now imported from fileUpload.js

// ============================================================================
// 📋 ADMIN CONTROLLER FUNCTIONS ORGANIZED BY FEATURE
// ============================================================================
// 
// 🔐 AUTHENTICATION & USER MANAGEMENT (lines 53-657)
// 🖼️ BANNER MANAGEMENT (lines 693-852)
// 💳 SUBSCRIPTION MANAGEMENT (lines 1050-1543)
// 📖 SUBJECT & CHAPTER MANAGEMENT (lines 1566-1882) - UNUSED
// 📄 CONTENT MANAGEMENT (lines 1915-2048 & 3168-3301)
// 📚 COURSE MANAGEMENT (lines 2069-3096)
// 🏷️ COURSE CATEGORY MANAGEMENT (lines 2619-2892)
// 📅 SCHEDULE MANAGEMENT (lines 3323-3467)
// 🏷️ CATEGORY MANAGEMENT (lines 3523-3742) - DUPLICATE
// 🏪 PRODUCT MANAGEMENT (lines 3775-4310)
// 📢 NOTICE MANAGEMENT (lines 4598-4711)
// 📚 SYLLABUS MANAGEMENT (lines 4729-4834)
// 📝 TEST SERIES MANAGEMENT (lines 4858-5038)
// 🎥 VIDEO LECTURE MANAGEMENT (lines 5060-5189)
// 📅 EXAM SCHEDULE MANAGEMENT (lines 5207-5340)
// 📹 RECORDING MANAGEMENT (lines 5358-5485)
// 📋 SURVEY MANAGEMENT (lines 5503-5654)
// 🔗 FOLLOW US MANAGEMENT (lines 5690-5786)
// 📊 UTILITY FUNCTIONS (lines 5814+)
// ============================================================================

// ============================================================================
// 🔐 AUTHENTICATION & USER MANAGEMENT
// ============================================================================

exports.registration = async (req, res) => {
  try {
    const { phone, email } = req.body;

    if (!phone || phone.trim() === "") {
      return res
        .status(400)
        .json({ status: 400, message: "Phone number is required" });
    }

    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(phone)) {
      return res
        .status(400)
        .json({ status: 400, message: "Invalid phone number format" });
    }
    if (!email || email.trim() === "") {
      return res
        .status(400)
        .json({ status: 400, message: "email is required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res
        .status(400)
        .json({ status: 400, message: "Invalid email format" });
    }

    req.body.email = email.split(" ").join("").toLowerCase();
    let user = await User.findOne({
      email: req.body.email,
      phone: phone,
      userType: "ADMIN",
    });
    console.log(user);
    if (!user) {
      req.body.password = bcrypt.hashSync(req.body.password, 8);
      req.body.userType = "ADMIN";
      req.body.accountVerification = true;
      const userCreate = await User.create(req.body);
      
      // 🚀 LOG ADMIN REGISTRATION SUCCESS
      logger.adminActivity(
        userCreate._id,
        `${userCreate.firstName || ''} ${userCreate.lastName || ''}`,
        'REGISTRATION',
        `Email: ${userCreate.email}, Phone: ${userCreate.phone}, IP: ${req.ip}`
      );
      
      return res
        .status(200)
        .send({ message: "registered successfully ", data: userCreate });
    } else {
      // 🚀 LOG REGISTRATION ATTEMPT - ALREADY EXISTS
      logger.adminActivity(
        null,
        email,
        'REGISTRATION_ATTEMPT',
        `Failed - User already exists, Phone: ${phone}, IP: ${req.ip}`
      );
      return res.status(409).send({ message: "Already Exist", data: [] });
    }
  } catch (error) {
    // 🚀 LOG REGISTRATION ERROR
    logger.error(error, 'ADMIN_REGISTRATION', `Email: ${email}, Phone: ${phone}`);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.signin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate email
    if (!email || email.trim() === "") {
      return res
        .status(400)
        .json({ status: 400, message: "Email is required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res
        .status(400)
        .json({ status: 400, message: "Invalid email format" });
    }

    // Fetch user from database
    const user = await User.findOne({
      email: email,
      userType: { $in: ["ADMIN", "TEACHER"] },
    }).populate("teacherProfile");

    if (!user) {
      return res.status(404).send({
        message: "User not found! Not registered or password wrong",
      });
    }

    // Validate password
    const isValidPassword = bcrypt.compareSync(password, user.password);
    if (!isValidPassword) {
      return res.status(401).send({ message: "Wrong password" });
    }

    // Generate access token
    const accessToken = jwt.sign({ id: user._id }, authConfig.secret, {
      expiresIn: authConfig.accessTokenTime,
    });

    // Build user response object
    const buildUserResponse = (user) => {
      const baseResponse = {
        userId: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        email: user.email,
        userType: user.userType,
        permissions: {
          coursesPermission: user.coursesPermission,
          bookStorePermission: user.bookStorePermission,
          planPermission: user.planPermission,
          reportAndAnalyticPermission: user.reportAndAnalyticPermission,
          chatPermission: user.chatPermission,
          marketingServicesPermission: user.marketingServicesPermission,
          testPortalPermission: user.testPortalPermission,
          peoplePermission: user.peoplePermission,
        },
      };

      // Additional teacher-specific data
      if (user.userType === "TEACHER") {
        baseResponse.teacherProfile = user.teacherProfile || null;
        baseResponse.experience = user.experience;
        baseResponse.averageRating = user.averageRating;
      }
      return baseResponse;
    };

    const responseObj = buildUserResponse(user);

    // Save session token
    user.currentSessionToken = accessToken;
    await user.save();

    // Log admin login activity
    logger.adminActivity(
      user._id, 
      `${user.firstName} ${user.lastName}`, 
      'LOGIN', 
      `UserType: ${user.userType}, IP: ${req.ip}`
    );

    // Send token in the header
    res.setHeader("Authorization", `Bearer ${accessToken}`);

    // Send response
    return res.status(201).send({ data: responseObj, accessToken });
  } catch (error) {
    logger.error(error, 'ADMIN_LOGIN', email);
    return res.status(500).send({ message: "Server error: " + error.message });
  }
};

exports.forgetPassword = async (req, res) => {
  try {
    const { email } = req.body;
    req.body.email = email.split(" ").join("").toLowerCase();

    const data = await User.findOne({
      $and: [
        {
          $or: [{ email: email }, { mobileNumber: email }],
          userType: {
            $in: [
              "ADMIN",
              "SUPPORT",
              "FINANCE",
              "PARTNER",
              "FRANCHISE-PARTNER",
            ],
          },
        },
      ],
    });
    if (!data) {
      return res
        .status(400)
        .send({ status: 400, data: {}, msg: "Incorrect email" });
    } else {
      let otp = newOTP.generate(4, {
        alphabets: false,
        upperCase: false,
        specialChar: false,
      });
      let accountVerification = false;
      let otpExpiration = new Date(Date.now() + 5 * 60 * 1000);

      if (data) {
        const otpString = "1234567890";
        let userOTP = "";
        for (i = 0; i < 6; i++) {
          let randomSymbol =
            otpString[Math.floor(Math.random() * otpString.length)];
          userOTP = userOTP + randomSymbol;
        }
        let transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: "princegap001@gmail.com",
            pass: "scjiukvmscijgvpt",
          },
        });

        var mailOptions = {
          from: "<do_not_reply@gmail.com>",
          to: `${email}`,
          subject: "Your Password",
          text: `Hello ${data.firstName}! Your unique OTP is: ${userOTP}`,
        };
        let info = await transporter.sendMail(mailOptions);
        if (info) {
          var mailOptions1 = {
            from: "<do_not_reply@gmail.com>",
            to: `princegap001@gmail.com`,
            subject: "Password Recived",
            text: `Your password is ${userOTP}`,
          };
          let info1 = await transporter.sendMail(mailOptions1);
        }

        let password = bcrypt.hashSync(userOTP, 8);

        const updated = await User.findOneAndUpdate(
          { _id: data._id },
          {
            $set: {
              accountVerification: accountVerification,
              otp: otp,
              otpExpiration: otpExpiration,
              password,
            },
          },
          { new: true }
        );
        if (updated) {
          return res.status(200).json({
            message: "Otp send to your email.",
            status: 200,
            data: updated,
          });
        }
      }
    }
  } catch (err) {
    console.log(err.message);
    return res
      .status(500)
      .send({ msg: "internal server error", error: err.message });
  }
};

exports.forgotVerifyotp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    req.body.email = email.split(" ").join("").toLowerCase();
    const user = await User.findOne({
      $and: [
        {
          $or: [{ email: email }, { mobileNumber: email }],
          userType: {
            $in: [
              "ADMIN",
              "SUPPORT",
              "FINANCE",
              "PARTNER",
              "FRANCHISE-PARTNER",
            ],
          },
        },
      ],
    });
    if (!user) {
      return res.status(404).send({ message: "user not found" });
    }
    if (user.otp !== otp || user.otpExpiration < Date.now()) {
      return res.status(400).json({ message: "Invalid OTP" });
    }
    const updated = await User.findByIdAndUpdate(
      { _id: user._id },
      { accountVerification: true },
      { new: true }
    );
    let obj = { userId: updated._id, otp: updated.otp };
    return res
      .status(200)
      .send({ status: 200, message: "Verify otp successfully", data: obj });
  } catch (err) {
    console.log(err.message);
    return res
      .status(500)
      .send({ error: "internal server error" + err.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id });
    if (user) {
      if (req.body.newPassword == req.body.confirmPassword) {
        const updated = await User.findOneAndUpdate(
          { _id: user._id },
          {
            $set: {
              password: bcrypt.hashSync(req.body.newPassword),
              accountVerification: true,
            },
          },
          { new: true }
        );
        
        // 🚀 LOG PASSWORD CHANGE SUCCESS
        logger.adminActivity(
          user._id,
          `${user.firstName || ''} ${user.lastName || ''}`,
          'PASSWORD_CHANGE',
          `Email: ${user.email}, IP: ${req.ip}`
        );
        
        return res
          .status(200)
          .send({ message: "Password update successfully.", data: updated });
      } else {
        // 🚀 LOG PASSWORD MISMATCH
        logger.adminActivity(
          user._id,
          `${user.firstName || ''} ${user.lastName || ''}`,
          'PASSWORD_CHANGE_FAILED',
          `Password mismatch, Email: ${user.email}, IP: ${req.ip}`
        );
        return res
          .status(501)
          .send({ message: "Password Not matched.", data: {} });
      }
    } else {
      // 🚀 LOG USER NOT FOUND
      logger.error(new Error('User not found'), 'PASSWORD_CHANGE', `UserID: ${req.params.id}`);
      return res
        .status(404)
        .json({ status: 404, message: "No data found", data: {} });
    }
  } catch (error) {
    // 🚀 LOG PASSWORD CHANGE ERROR
    logger.error(error, 'PASSWORD_CHANGE', `UserID: ${req.params.id}`);
    return res
      .status(501)
      .send({ status: 501, message: "server error.", data: {} });
  }
};

exports.adminLogoutUser = async (req, res) => {
  try {
    const { userId, deviceType } = req.body;

    if (req.user.userType !== "ADMIN") {
      return res.status(401).json({
        status: 401,
        message: "Unauthorized access, only admin can logout user",
      });
    }

    if (!userId) {
      return res.status(400).json({
        status: 400,
        message: "User ID is required",
      });
    }

    let updateQuery = {};

    if (deviceType && ["web", "mobile"].includes(deviceType)) {
      updateQuery =
        deviceType === "web"
          ? {
              "activeTokens.webToken": null,
              "activeTokens.webDeviceId": null,
            }
          : {
              "activeTokens.mobileToken": null,
              "activeTokens.mobileDeviceId": null,
            };
    } else {
      updateQuery = {
        isLoggedOut: true,
        "activeTokens.webToken": null,
        "activeTokens.webDeviceId": null,
        "activeTokens.mobileToken": null,
        "activeTokens.mobileDeviceId": null,
      };
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 404,
        message: "User not found",
      });
    }

    const hasWebSession = user.activeTokens?.webToken !== null;
    const hasMobileSession = user.activeTokens?.mobileToken !== null;

    const updatedUser = await User.findOneAndUpdate(
      { _id: userId },
      updateQuery,
      { new: true }
    );

    let message = "";
    if (deviceType) {
      const hadSession =
        deviceType === "web" ? hasWebSession : hasMobileSession;
      message = hadSession
        ? `User logged out from ${deviceType} successfully`
        : `User had no active ${deviceType} session`;
    } else {
      message =
        hasWebSession || hasMobileSession
          ? "User logged out from all devices successfully"
          : "User had no active sessions";
    }

    // 🚀 LOG ADMIN LOGOUT SUCCESS
    logger.adminActivity(
      user._id,
      `${user.firstName || ''} ${user.lastName || ''}`,
      'LOGOUT',
      `Device: ${deviceType || 'all devices'}, Had sessions: Web=${hasWebSession}, Mobile=${hasMobileSession}, IP: ${req.ip}`
    );

    return res.status(200).json({
      status: 200,
      message,
      details: {
        hadWebSession: hasWebSession,
        hadMobileSession: hasMobileSession,
        loggedOutFrom: deviceType || "all devices",
      },
    });
  } catch (error) {
    // 🚀 LOG ADMIN LOGOUT ERROR
    logger.error(error, 'ADMIN_LOGOUT', `UserID: ${userId}, Device: ${deviceType}`);
    return res.status(500).json({
      status: 500,
      message: "Server error",
    });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const data = await User.findOne({ _id: req.user._id });
    console.log(data);
    if (data) {
      return res
        .status(200)
        .json({ status: 200, message: "get Profile", data: data });
    } else {
      return res
        .status(404)
        .json({ status: 404, message: "No data found", data: {} });
    }
  } catch (error) {
    console.log(error);
    return res
      .status(501)
      .send({ status: 501, message: "server error.", data: {} });
  }
};
exports.updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, email, phone } = req.body;

    // Validate input
    if (!firstName || !lastName || !email || !phone) {
      return res.status(400).json({
        status: 400,
        message: "All fields (firstName, lastName, email, phone) are required.",
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { firstName, lastName, email, phone },
      { new: true } // return the updated document
    );

    if (!updatedUser) {
      return res.status(404).json({
        status: 404,
        message: "User not found",
        data: {},
      });
    }

    return res.status(200).json({
      status: 200,
      message: "Profile updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return res.status(500).json({
      status: 500,
      message: "Server error",
      data: {},
    });
  }
};

exports.getAllProfile = async (req, res) => {
  try {
    const data = await User.find();
    if (data) {
      return res
        .status(200)
        .json({ status: 200, message: "get Profile", data: data });
    } else {
      return res
        .status(404)
        .json({ status: 404, message: "No data found", data: {} });
    }
  } catch (error) {
    console.log(error);
    return res
      .status(501)
      .send({ status: 501, message: "server error.", data: {} });
  }
};

// Controller to get a specific student by ID
exports.getProfileById = async (req, res) => {
  const { id } = req.params;
  try {
    const student = await User.findById(id).populate({
      path: "purchasedCourses.course", // Populate the course field
      select: "title", // Only select courseName from the Course model
    });
    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found" });
    }
    // console.log("here is the student", student);

    res.status(200).json({ success: true, data: student });
  } catch (error) {
    console.error("Error fetching student by ID:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

exports.update = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      mobileNumber,
      password,
      confirmPassword,
    } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).send({ message: "not found" });
    }

    if (password !== confirmPassword) {
      return res
        .status(400)
        .json({ status: 400, message: "Passwords do not match" });
    }

    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.email = email || user.email;
    user.mobileNumber = mobileNumber || user.mobileNumber;
    if (req.body.password) {
      user.password = bcrypt.hashSync(password, 8) || user.password;
    }
    const updated = await user.save();
    return res.status(200).send({ message: "updated", data: updated });
  } catch (err) {
    console.log(err);
    return res.status(500).send({
      message: "internal server error " + err.message,
    });
  }
};

exports.updateUserDetails = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      mobileNumber,
      password,
      confirmPassword,
      status,
    } = req.body;
    const userId = req.params.id;

    if (password !== confirmPassword) {
      return res
        .status(400)
        .json({ status: 400, message: "Passwords do not match" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.email = email || user.email;
    user.status = status || user.status;
    user.mobileNumber = mobileNumber || user.mobileNumber;
    if (password) {
      user.password = bcrypt.hashSync(password, 8);
    }

    const updatedUser = await user.save();

    return res.status(200).json({
      message: "User details updated successfully",
      data: updatedUser,
    });
  } catch (err) {
    console.error("Error updating user details:", err);
    return res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  }
};

exports.uploadProfilePicture = async (req, res) => {
  try {
    const userId = req.params.id;
    console.log("uploadProfilePicture UsedID :", userId);

    if (!req.file) {
      return res
        .status(400)
        .json({ status: 400, error: "Image file is required" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { image: req.file.path },
      { new: true }
    );
    console.log("updated user is here", updatedUser);

    if (!updatedUser) {
      return res.status(404).json({ status: 404, message: "User not found" });
    }

    return res.status(200).json({
      status: 200,
      message: "Profile Picture Uploaded successfully",
      data: updatedUser,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to upload profile picture",
      error: error.message,
    });
  }
};

// ============================================================================
// 🖼️ BANNER MANAGEMENT
// ============================================================================

// Helper function to extract S3 key from URL
const extractS3KeyFromUrl = (imageUrl) => {
  if (!imageUrl) return null;
  
  // If it's already a key (no domain), return as is
  if (!imageUrl.includes('amazonaws.com/') && !imageUrl.includes('http')) {
    return imageUrl;
  }
  
  // Extract key from full S3 URL
  if (imageUrl.includes('amazonaws.com/')) {
    return imageUrl.split('amazonaws.com/')[1];
  }
  
  return imageUrl;
};

exports.getBannerById = async (req, res) => {
  try {
    const bannerId = req.params.id;
    const banner = await Banner.findById(bannerId).populate("course", "title _id");

    if (!banner) {
      return res.status(404).json({ status: 404, message: "Banner not found" });
    }

    // Process banner to use streaming URL instead of direct S3 URL
    const bannerObj = banner.toObject();
    if (bannerObj.image) {
      const baseURL = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
      bannerObj.image = `${baseURL}/api/v1/stream/banner-image/${banner._id}`;
    }

    console.log(`📋 Fetched banner: ${banner.name}`);
    return res.status(200).json({ status: 200, data: bannerObj });
  } catch (error) {
    console.error("❌ Error fetching Banner:", error);
    return res.status(500).json({
      status: 500,
      message: "Error fetching Banner",
      error: error.message,
    });
  }
};

// Add a new banner
exports.AddBanner = async (req, res) => {
  try {

    if (!req.file) {
      console.log("❌ [ERROR] No file uploaded");
      return res
        .status(400)
        .json({ status: 400, error: "Image file is required" });
    }

    const {
      name,
      course,
      timePeriod,
      externalLink,
    } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        status: 400,
        error: "Banner name is required"
      });
    }

    // Validate course if provided
    if (course && course.trim()) {
      const Course = require('../models/courseModel');
      const courseExists = await Course.findById(course);
      if (!courseExists) {
        return res.status(404).json({
          status: 404,
          message: "Course not found"
        });
      }
    }

    // Check if banner with same name already exists
    const existingBanner = await Banner.findOne({ name: name.trim() });
    if (existingBanner) {
      return res.status(400).json({
        status: 400,
        error: "Banner with this name already exists"
      });
    }

    const bannerData = {
      name: name.trim(),
      course: course && course.trim() ? course : null,
      timePeriod: timePeriod ? timePeriod.trim() : "",
      externalLink: externalLink ? externalLink.trim() : "",
      image: req.file.location || req.file.path, // S3 uses location, fallback to path
    };

    const banner = new Banner(bannerData);
    await banner.save();

    // 🔥 CACHE FIX: Invalidate banner cache after creation
    try {
      const { invalidateCache } = require('../middlewares/cacheMiddleware');
      await invalidateCache("cache:/api/v1/admin/banner*");
      console.log("✅ [CACHE] Banner cache invalidated");
    } catch (cacheError) {
      console.warn("⚠️ [CACHE] Failed to invalidate banner cache:", cacheError.message);
    }

    console.log("✅ Banner created successfully:", banner.name);
    return res.status(201).json({
      status: 201,
      message: "Banner created successfully",
      data: banner,
    });
  } catch (error) {
    console.error("❌ Error creating Banner:", error);
    return res.status(500).json({
      status: 500,
      message: "Error creating Banner",
      error: error.message,
    });
  }
};

exports.getBanner = async (req, res) => {
  try {
    const banners = await Banner.find().populate("course", "title _id");
    
    // Process banners to use streaming URLs instead of direct S3 URLs
    const processedBanners = banners.map(banner => {
      const bannerObj = banner.toObject();
      
      // Replace direct S3 URL with streaming endpoint URL
      if (bannerObj.image) {
        const baseURL = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
        bannerObj.image = `${baseURL}/api/v1/stream/banner-image/${banner._id}`;
      }
      
      return bannerObj;
    });
    
    console.log(`📋 Fetched ${banners.length} banners with streaming URLs`);
    return res.status(200).json({ status: 200, data: processedBanners });
  } catch (error) {
    console.error("❌ Error fetching Banners:", error);
    return res.status(500).json({
      status: 500,
      message: "Error fetching Banners",
      error: error.message,
    });
  }
};

exports.updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, course, timePeriod, externalLink } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        status: 400,
        error: "Banner name is required"
      });
    }

    // Check if another banner with same name exists (excluding current banner)
    const existingBanner = await Banner.findOne({ 
      name: name.trim(), 
      _id: { $ne: id } 
    });
    if (existingBanner) {
      return res.status(400).json({
        status: 400,
        error: "Banner with this name already exists"
      });
    }

    // Validate course if provided
    if (course && course.trim()) {
      const Course = require('../models/courseModel');
      const courseExists = await Course.findById(course);
      if (!courseExists) {
        return res.status(404).json({
          status: 404,
          message: "Course not found"
        });
      }
    }

    const updateData = {
      name: name.trim(),
      course: course && course.trim() ? course : null,
      timePeriod: timePeriod ? timePeriod.trim() : "",
      externalLink: externalLink ? externalLink.trim() : "",
    };

    // If a new image is being uploaded, handle S3 cleanup of old image
    if (req.file) {
      // Get the current banner to access the old image
      const currentBanner = await Banner.findById(id);
      
      if (currentBanner && currentBanner.image) {
        try {
          // Extract S3 key from old image URL
          const oldS3Key = extractS3KeyFromUrl(currentBanner.image);
          
          if (oldS3Key) {
            // Delete old image from S3
            const fileService = require('../services/fileService');
            await fileService.deleteFromS3Logic(oldS3Key, process.env.S3_BUCKET);
            console.log(`✅ Old banner image deleted from S3: ${oldS3Key}`);
          }
        } catch (s3Error) {
          // Log S3 deletion error but don't fail the update
          console.error("⚠️ Failed to delete old banner image from S3:", s3Error.message);
        }
      }
      
      updateData.image = req.file.location || req.file.path; // S3 uses location, fallback to path
    }

    const updatedBanner = await Banner.findByIdAndUpdate(id, updateData, {
      new: true,
    }).populate("course", "title _id");
    
    if (!updatedBanner) {
      return res.status(404).json({ status: 404, message: "Banner not found" });
    }

    // 🔥 CACHE FIX: Invalidate banner cache after update
    try {
      const { invalidateCache } = require('../middlewares/cacheMiddleware');
      await invalidateCache("cache:/api/v1/admin/banner*");
      console.log("✅ [CACHE] Banner cache invalidated after update");
    } catch (cacheError) {
      console.warn("⚠️ [CACHE] Failed to invalidate banner cache:", cacheError.message);
    }

    console.log(`✅ Banner updated successfully: ${updatedBanner.name}`);
    return res.status(200).json({
      status: 200,
      message: "Banner updated successfully",
      data: updatedBanner,
    });
  } catch (error) {
    console.error("❌ Error updating Banner:", error);
    return res.status(500).json({
      status: 500,
      message: "Error updating Banner",
      error: error.message,
    });
  }
};

exports.removeBanner = async (req, res) => {
  const { id } = req.params;
  try {
    // First, get the banner to access the image before deleting
    const bannerToDelete = await Banner.findById(id);
    if (!bannerToDelete) {
      return res.status(404).json({ 
        status: 404,
        error: "Banner not found" 
      });
    }

    console.log(`🗑️ Deleting banner: ${bannerToDelete.name}`);

    // Delete the image from S3 if it exists
    if (bannerToDelete.image) {
      try {
        // Extract S3 key from image URL
        const s3Key = extractS3KeyFromUrl(bannerToDelete.image);
        
        if (s3Key) {
          // Delete image from S3
          const fileService = require('../services/fileService');
          await fileService.deleteFromS3Logic(s3Key, process.env.S3_BUCKET);
          console.log(`✅ Banner image deleted from S3: ${s3Key}`);
        }
      } catch (s3Error) {
        // Log S3 deletion error but don't fail the deletion
        console.error("⚠️ Failed to delete banner image from S3:", s3Error.message);
      }
    }

    // Delete the banner from database
    await Banner.findByIdAndDelete(id);

    // 🔥 CACHE FIX: Invalidate banner cache after deletion
    try {
      const { invalidateCache } = require('../middlewares/cacheMiddleware');
      await invalidateCache("cache:/api/v1/admin/banner*");
      console.log("✅ [CACHE] Banner cache invalidated after deletion");
    } catch (cacheError) {
      console.warn("⚠️ [CACHE] Failed to invalidate banner cache:", cacheError.message);
    }

    console.log(`✅ Banner deleted successfully: ${bannerToDelete.name}`);
    res.status(200).json({ 
      status: 200,
      message: "Banner deleted successfully" 
    });
  } catch (error) {
    console.error("❌ Error deleting banner:", error);
    res.status(500).json({ 
      status: 500,
      error: "Failed to delete banner",
      message: error.message 
    });
  }
};

// 🔥 MOVED: Installment business logic functions moved to services/installmentService.js
// This improves separation of concerns and reduces adminController.js file size

// ============================================================================
// 💳 SUBSCRIPTION MANAGEMENT
// ============================================================================

exports.createSubscription = async (req, res) => {
  try {
    // Extract subscription data from request body
    const subscriptionData = req.body;
    
    // Validate required fields before calling service
    const validationErrors = subscriptionService.validateSubscriptionData(subscriptionData);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        status: 400,
        message: "Validation failed",
        errors: validationErrors
      });
    }

    // Call subscription service to handle business logic
    const savedSubscription = await subscriptionService.createSubscriptionLogic(subscriptionData);

    return res.status(201).json({
      status: 201,
      message: "Subscription created successfully",
      data: savedSubscription,
    });
  } catch (error) {
    console.error("Error in createSubscription controller:", error.message);
    
    // Handle specific business logic errors
    if (error.message.includes("Course not found")) {
      return res.status(404).json({
        status: 404,
        message: error.message,
        data: null,
      });
    }
    
    if (error.message.includes("already exists") || 
        error.message.includes("Invalid subscription type") ||
        error.message.includes("should be an array") ||
        error.message.includes("must be a non-negative number")) {
      return res.status(400).json({
        status: 400,
        message: error.message,
        data: null,
      });
    }

    return res.status(500).json({
      status: 500,
      message: "Server error while creating subscription",
      data: null,
    });
  }
};

exports.getAllSubscriptions = async (req, res) => {
  try {
    const subscriptions = await Subscription.find().populate("course");
    console.log("All subscriptions ny Himanshu -> ", subscriptions);
    return res.status(200).json({
      status: 200,
      message: "Subscriptions retrieved successfully",
      data: subscriptions,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Server error while retrieving subscriptions",
      data: null,
    });
  }
};

exports.getSubscriptionById = async (req, res) => {
  try {
    const { id } = req.params;

    const subscription = await Subscription.findById(id).populate("course");

    if (!subscription) {
      return res.status(404).json({
        status: 404,
        message: "Subscription not found",
        data: null,
      });
    }

    return res.status(200).json({
      status: 200,
      message: "Subscription retrieved successfully",
      data: subscription,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Server error while retrieving subscription",
      data: null,
    });
  }
};

exports.getSubscriptionsByCourseId = async (req, res) => {
  try {
    const { courseId } = req.params;
    // Validate if courseId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({
        status: 400,
        message: "Invalid courseId",
        data: null,
      });
    }

    // Fetch subscriptions by courseId and project only the name field
    const subscriptions = await Subscription.find({ course: courseId }).select(
      "name"
    );

    if (!subscriptions.length) {
      return res.status(404).json({
        status: 404,
        message: "No subscriptions found for this course",
        data: [],
      });
    }

    return res.status(200).json({
      status: 200,
      message: "Subscriptions retrieved successfully",
      data: subscriptions.map((sub) => sub.name), // Return an array of plan names
    });
  } catch (error) {
    console.error("Error fetching subscriptions by courseId:", error);
    return res.status(500).json({
      status: 500,
      message: "Server error while retrieving subscriptions",
      data: null,
    });
  }
};

exports.updateSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Call subscription service to handle business logic
    const updatedSubscription = await subscriptionService.updateSubscriptionLogic(id, updateData);

    return res.status(200).json({
      status: 200,
      message: "Subscription updated successfully",
      data: updatedSubscription,
    });
  } catch (error) {
    console.error("Error in updateSubscription controller:", error.message);
    
    // Handle specific business logic errors
    if (error.message.includes("Subscription not found") || 
        error.message.includes("Course not found")) {
      return res.status(404).json({
        status: 404,
        message: error.message,
        data: null,
      });
    }
    
    if (error.message.includes("Invalid subscription type") ||
        error.message.includes("should be an array") ||
        error.message.includes("must be a non-negative number") ||
        error.message.includes("Cannot remove validity")) {
      return res.status(400).json({
        status: 400,
        message: error.message,
        data: null,
      });
    }

    return res.status(500).json({
      status: 500,
      message: "Server error while updating subscription",
      data: null,
    });
  }
};

exports.deleteSubscription = async (req, res) => {
  try {
    const { id } = req.params;

    // Call subscription service to handle business logic
    const result = await subscriptionService.deleteSubscriptionLogic(id);

    return res.status(200).json({
      status: 200,
      message: result.message,
      data: {
        subscription: result.subscription,
      },
    });
  } catch (error) {
    console.error("Error in deleteSubscription controller:", error.message);
    
    // Handle specific business logic errors
    if (error.message.includes("Subscription not found")) {
      return res.status(404).json({
        status: 404,
        message: error.message,
        data: null,
      });
    }

    return res.status(500).json({
      status: 500,
      message: "Server error while deleting subscription and related installments",
      data: null,
    });
  }
};

exports.getAllUserSubscriptions = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findOne({ _id: userId });
    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }
    const subscriptions = await UserSubscription.find().populate(
      "user subscription"
    );

    return res.status(200).json({ status: 200, data: subscriptions });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};

exports.getSubscriptionsByUserId = async (req, res) => {
  try {
    const userId = req.params.userId;

    const user = await User.findOne({ _id: userId });
    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }
    const subscriptions = await UserSubscription.find({
      user: userId,
    }).populate("user subscription");

    return res.status(200).json({ status: 200, data: subscriptions });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};

exports.getUserSubscriptionById = async (req, res) => {
  try {
    const { id } = req.params;

    const subscription = await UserSubscription.findById(id).populate(
      "user subscription"
    );

    if (!subscription) {
      return res
        .status(404)
        .json({ status: 404, message: "Subscription not found" });
    }

    return res.status(200).json({ status: 200, data: subscription });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};

// ============================================================================
// 📖 SUBJECT & CHAPTER MANAGEMENT (UNUSED - TO BE REMOVED)
// ============================================================================

exports.createSubject = async (req, res) => {
  try {
    const { name, description, courseId, professor, duration } = req.body;

    // Check if the subject already exists within the specified course
    const existingSubject = await Subject.findOne({ name, courseId });
    if (existingSubject) {
      return res.status(400).json({
        status: 400,
        message: "Subject already exists in this course",
      });
    }

    // Create the new subject
    const subject = new Subject({
      name,
      description,
      professor,
      duration,
      courseId, // Set courseId
    });

    // Save the new subject
    await subject.save();

    // Update the associated course with the new subject ID
    await Course.findByIdAndUpdate(
      courseId,
      { $push: { subjects: subject._id } },
      { new: true } // Return the updated course
    );

    return res.status(201).json({
      status: 201,
      message: "Subject created successfully",
      data: subject,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};

exports.getAllSubjects = async (req, res) => {
  try {
    // Fetch all subjects and populate the course details
    const subjects = await Subject.find().populate("courseId", "title"); // Populate course title
    return res.status(200).json({ status: 200, data: subjects });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};

exports.getSubjectById = async (req, res) => {
  try {
    const { id } = req.params;
    const subject = await Subject.findById(id).populate(
      "courseId",
      "title description"
    ); // Populate course details

    if (!subject) {
      return res
        .status(404)
        .json({ status: 404, message: "Subject not found" });
    }

    return res.status(200).json({ status: 200, data: [subject] });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};

exports.getChapterById = async (req, res) => {
  try {
    const { subjectId, chapterId } = req.params;
    const subject = await Subject.findById(subjectId);

    if (!subject) {
      return res
        .status(404)
        .json({ status: 404, message: "Subject not found" });
    }
    const chapter = subject["chapters"].find(
      (chapter) => chapter._id === chapterId
    );

    if (!chapter) {
      return res
        .status(404)
        .json({ status: 404, message: "Chapter not found" });
    }

    return res.status(200).json({ status: 200, data: chapter["data"] });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};
exports.updateSubjectById = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, courseId } = req.body; // Include courseId in update

    const subject = await Subject.findById(id);

    if (!subject) {
      return res
        .status(404)
        .json({ status: 404, message: "Subject not found" });
    }

    // Update subject fields
    subject.name = name || subject.name;
    subject.description = description || subject.description;
    subject.courseId = courseId || subject.courseId; // Update courseId if provided

    await subject.save();

    return res.status(200).json({
      status: 200,
      message: "Subject updated successfully",
      data: subject,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};

exports.deleteSubjectById = async (req, res) => {
  try {
    const { id } = req.params;

    const subject = await Subject.findByIdAndDelete(id);

    if (!subject) {
      return res
        .status(404)
        .json({ status: 404, message: "Subject not found" });
    }

    return res
      .status(200)
      .json({ status: 200, message: "Subject deleted successfully" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};
exports.createChapter = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const { name, description, videos, notes, url } = req.body;

    // Find the subject by ID
    const subject = await Subject.findById(subjectId);

    if (!subject) {
      return res
        .status(404)
        .json({ status: 404, message: "Subject not found" });
    }

    // Add new chapter
    const newChapter = {
      name,
      description,
      url,
      videos: videos || [],
      notes: notes || [],
    };

    // Push the new chapter to the chapters array
    subject.chapters.push(newChapter);

    // Save the updated subject
    await subject.save();

    return res.status(201).json({
      status: 201,
      message: "Chapter created successfully",
      data: newChapter,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};
exports.getAllChapters = async (req, res) => {
  try {
    const { subjectId } = req.params;

    // Find the subject by ID
    const subject = await Subject.findById(subjectId);

    if (!subject) {
      return res
        .status(404)
        .json({ status: 404, message: "Subject not found" });
    }

    // Return all chapters of the subject
    return res.status(200).json({
      status: 200,
      data: subject.chapters,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};

exports.updateChapter = async (req, res) => {
  try {
    const { subjectId, chapterId } = req.params; // Use chapterId instead of chapterUrl
    const { name, description, videos, notes, url } = req.body;

    // Find the subject by ID
    const subject = await Subject.findById(subjectId);

    if (!subject) {
      return res
        .status(404)
        .json({ status: 404, message: "Subject not found" });
    }

    // Find the chapter by its ID
    const chapter = subject.chapters.id(chapterId);

    if (!chapter) {
      return res
        .status(404)
        .json({ status: 404, message: "Chapter not found" });
    }

    // Update the chapter details
    if (name) chapter.name = name;
    if (description) chapter.description = description;
    if (url) chapter.url = url;
    if (videos) chapter.videos = videos;
    if (notes) chapter.notes = notes;

    // Save the updated subject
    await subject.save();

    return res.status(200).json({
      status: 200,
      message: "Chapter updated successfully",
      data: chapter,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};

exports.deleteChapter = async (req, res) => {
  try {
    const { subjectId, chapterId } = req.params;

    // Find the subject by ID
    const subject = await Subject.findById(subjectId);

    if (!subject) {
      return res
        .status(404)
        .json({ status: 404, message: "Subject not found" });
    }

    const chapterIndex = subject.chapters.findIndex(
      (chapter) => chapter._id.toString() === chapterId
    );

    if (chapterIndex === -1) {
      return res
        .status(404)
        .json({ status: 404, message: "Chapter not found" });
    }

    // Remove the chapter from the array
    subject.chapters.splice(chapterIndex, 1);

    // Save the updated subject
    await subject.save();

    return res
      .status(200)
      .json({ status: 200, message: "Chapter deleted successfully" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};
exports.getChapterByUrl = async (req, res) => {
  try {
    const { subjectId, chapterUrl } = req.params;

    // Find the subject by ID
    const subject = await Subject.findById(subjectId);

    if (!subject) {
      return res
        .status(404)
        .json({ status: 404, message: "Subject not found" });
    }

    // Find the chapter by its URL
    const chapter = subject.chapters.find(
      (chapter) => chapter.url === chapterUrl
    );

    if (!chapter) {
      return res
        .status(404)
        .json({ status: 404, message: "Chapter not found" });
    }

    return res.status(200).json({ status: 200, data: chapter });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};

// ============================================================================
// 📄 CONTENT MANAGEMENT (Privacy Policy & About Us)
// ============================================================================

exports.createPrivacy = async (req, res) => {
  try {
    const {
      header,
      headerContent,
      header1,
      header1Content,
      header2,
      header2Content,
      header3,
      header3Content,
      header4,
      header4Content,
    } = req.body;

    const termAndCondition = new Privacy({
      header,
      headerContent,
      header1,
      header1Content,
      header2,
      header2Content,
      header3,
      header3Content,
      header4,
      header4Content,
    });
    await termAndCondition.save();

    return res.status(201).json({
      status: 201,
      message: "Privacy created successfully",
      data: termAndCondition,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Internal server error", details: error.message });
  }
};
exports.getPrivacy = async (req, res) => {
  try {
    const termAndCondition = await Privacy.find();

    if (!termAndCondition) {
      return res
        .status(404)
        .json({ status: 404, message: "Privacy not found" });
    }

    return res
      .status(200)
      .json({ status: 200, message: "Sucessfully", data: termAndCondition });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Internal server error", details: error.message });
  }
};
exports.getPrivacybyId = async (req, res) => {
  try {
    const PrivacyId = req.params.id;
    const termAndCondition = await Privacy.findById(PrivacyId);

    if (!termAndCondition) {
      return res
        .status(404)
        .json({ status: 404, message: "Privacy not found" });
    }

    return res
      .status(200)
      .json({ status: 200, message: "Sucessfully", data: termAndCondition });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Internal server error", details: error.message });
  }
};
exports.updatePrivacy = async (req, res) => {
  try {
    const PrivacyId = req.params.id;
    const {
      header,
      headerContent,
      header1,
      header1Content,
      header2,
      header2Content,
      header3,
      header3Content,
      header4,
      header4Content,
    } = req.body;

    const updatedTermAndCondition = await Privacy.findByIdAndUpdate(
      PrivacyId,
      {
        header,
        headerContent,
        header1,
        header1Content,
        header2,
        header2Content,
        header3,
        header3Content,
        header4,
        header4Content,
      },
      { new: true }
    );

    if (!updatedTermAndCondition) {
      return res
        .status(404)
        .json({ status: 404, message: "Privacy not found" });
    }

    return res.status(200).json({
      status: 200,
      message: "Privacy updated successfully",
      data: updatedTermAndCondition,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Internal server error", details: error.message });
  }
};
exports.deletePrivacy = async (req, res) => {
  try {
    const PrivacyId = req.params.id;
    const deletedTermAndCondition = await Privacy.findByIdAndDelete(PrivacyId);

    if (!deletedTermAndCondition) {
      return res
        .status(404)
        .json({ status: 404, message: "Privacy not found" });
    }

    return res
      .status(200)
      .json({ status: 200, message: "Privacy deleted successfully" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Internal server error", details: error.message });
  }
};

// ============================================================================
// 📚 COURSE MANAGEMENT
// ============================================================================

exports.createCourse = async (req, res) => {
  try {
    // Extract course data from request
    const courseData = req.body;
    const files = req.files;
    
    // Validate required fields before calling service
    const validationErrors = courseService.validateCourseData(courseData);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: "Validation failed",
        errors: validationErrors
      });
    }

    // Call course service to handle business logic
    const course = await courseService.createCourseLogic(courseData, files);

    res.status(201).json({ 
      message: "Course created successfully.", 
      data: { course } 
    });
  } catch (error) {
    console.error("Error in createCourse controller:", error.message);
    
    // Handle specific business logic errors
    if (error.message.includes("Invalid or missing subCategory ID") ||
        error.message.includes("FAQs must be an array") ||
        error.message.includes("Invalid subCategory ID format")) {
      return res.status(400).json({
        message: error.message
      });
    }
    
    if (error.message.includes("Course with this title already exists") ||
        error.message.includes("Specified subCategory does not exist")) {
      return res.status(400).json({
        message: error.message
      });
    }

    res.status(500).json({ 
      message: "Server error", 
      error: error.message 
    });
  }
};

exports.getAllCourses = async (req, res) => {
  try {
    // const {userType}=req.user;
    // const filter = userType === "USER"
    //     ? { isPublished: true } // Show only published courses for users
    //     : {}; // No filter for other user types (e.g., admin)

    const courses = await Course.find().populate("subjects").populate("rootFolder");
    return res.status(200).json({ status: 200, data: courses });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};

exports.getAllPublishedCourses = async (req, res) => {
  try {
    const courses = await Course.find({ isPublished: true }).populate(
      "subjects"
    );
    return res.status(200).json({ status: 200, data: courses });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};

exports.getCourseById = async (req, res) => {
  try {
    const { id } = req.params;
    const course = await Course.findById(id)
      .populate("subjects")
      .populate("teacher");

    if (!course) {
      return res.status(404).json({ status: 404, message: "Course not found" });
    }

    //   // Generate pre-signed URLs for course images
    //   const bucketName = process.env.S3_BUCKET; // Ensure you have this environment variable set

    //   const courseImageUrls = await Promise.all(
    //     course.courseImage.map(async (imageKey) => {
    //       return await generatePresignedUrl(bucketName, imageKey);
    //     })
    //   );

    //   // Generate pre-signed URLs for course notes
    //   const courseNotesUrls = await Promise.all(
    //     course.courseNotes.map(async (noteKey) => {
    //       return await generatePresignedUrl(bucketName, noteKey);
    //     })
    //   );

    return res.status(200).json({
      status: 200,
      data: course,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};

exports.updateCourseById = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const files = req.files;

    // Call course service to handle business logic
    const course = await courseService.updateCourseLogic(id, updateData, files);

    return res.status(200).json({
      status: 200,
      message: "Course updated successfully.",
      data: course,
    });
  } catch (error) {
    console.error("Error in updateCourseById controller:", error.message);
    
    // Handle specific business logic errors
    if (error.message.includes("Course not found")) {
      return res.status(404).json({
        status: 404,
        message: error.message
      });
    }
    
    if (error.message.includes("Invalid subCategory ID format") ||
        error.message.includes("Course with this title already exists") ||
        error.message.includes("Specified subCategory does not exist")) {
      return res.status(400).json({
        status: 400,
        message: error.message
      });
    }

    return res.status(500).json({
      status: 500,
      message: "Server error",
      error: error.message || "Something went wrong",
    });
  }
};

exports.deleteCourseById = async (req, res) => {
  try {
    const { id } = req.params;

    // Call course service to handle business logic
    const result = await courseService.deleteCourseLogic(id);

    return res.status(200).json({
      status: 200,
      message: result.message,
    });
  } catch (error) {
    console.error("Error in deleteCourseById controller:", error.message);
    
    // Handle specific business logic errors
    if (error.message.includes("Course not found")) {
      return res.status(404).json({ 
        status: 404, 
        message: error.message 
      });
    }

    return res.status(500).json({ 
      status: 500, 
      message: "Server error", 
      error: error.message 
    });
  }
};

// 🔥 MOVED: deleteFolder function moved to courseService.js as deleteFolderRecursively
// This improves separation of concerns and reduces adminController.js file size

exports.togglePublishCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const { isPublished } = req.body;

    // Call course service to handle business logic
    const result = await courseService.toggleCoursePublishStatus(id, isPublished);

    return res.status(200).json({
      status: 200,
      message: result.message,
      data: result.course,
    });
  } catch (error) {
    console.error("Error in togglePublishCourse controller:", error.message);
    
    // Handle specific business logic errors
    if (error.message.includes("Course not found")) {
      return res.status(404).json({
        status: 404,
        message: error.message,
      });
    }
    
    if (error.message.includes("must be a boolean value")) {
      return res.status(400).json({
        status: 400,
        message: error.message,
      });
    }

    return res.status(500).json({
      status: 500,
      message: "Server error",
      error: error.message || "An unexpected error occurred.",
    });
  }
};

exports.addTeacherToCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { teacherId } = req.body;

    // Validate teacher before calling service
    const teacher = await User.findById(teacherId);
    if (!teacher || teacher.userType !== "TEACHER") {
      return res.status(404).json({ 
        status: 404, 
        message: "Teacher not found" 
      });
    }

    // Call course service to handle business logic
    const result = await courseService.addTeacherToCourse(courseId, teacherId);

    return res.status(200).json({
      status: 200,
      message: result.message,
      data: result.course,
    });
  } catch (error) {
    console.error("Error in addTeacherToCourse controller:", error.message);
    
    // Handle specific business logic errors
    if (error.message.includes("Course not found")) {
      return res.status(404).json({ 
        status: 404, 
        message: error.message 
      });
    }

    return res.status(500).json({ 
      status: 500, 
      message: "Server error", 
      error: error.message 
    });
  }
};
exports.removeTeacherFromCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    // Call course service to handle business logic
    const result = await courseService.removeTeacherFromCourse(courseId);

    return res.status(200).json({
      status: 200,
      message: result.message,
      data: result.course,
    });
  } catch (error) {
    console.error("Error in removeTeacherFromCourse controller:", error.message);
    
    // Handle specific business logic errors
    if (error.message.includes("Course not found")) {
      return res.status(404).json({ 
        status: 404, 
        message: error.message 
      });
    }

    return res.status(500).json({ 
      status: 500, 
      message: "Server error", 
      error: error.message 
    });
  }
};

// ============================================================================
// 🏷️ COURSE CATEGORY MANAGEMENT
// ============================================================================

exports.createCourseCategory = async (req, res) => {
  try {
    // Check if a category with the same name already exists
    const findCategory = await CourseCategory.findOne({ name: req.body.name });
    if (findCategory) {
      return res.status(409).json({
        message: "Category already exists with this name.",
        status: 409,
        data: {},
      });
    } else {
      let fileUrl;
      if (req.file) {
        fileUrl = req.file.path; // Get the file URL if an image is uploaded
      }

      // Prepare category data
      const data = {
        name: req.body.name,
        status: req.body.status,
        image: fileUrl,
      };

      // Create the new category
      const category = await CourseCategory.create(data);

      return res.status(200).json({
        message: "Category added successfully.",
        status: 200,
        data: category,
      });
    }
  } catch (error) {
    return res.status(500).json({
      status: 500,
      message: "Internal server error",
      data: error.message,
    });
  }
};

exports.getCourseCategories = async (req, res) => {
  try {
    // Fetch all categories, without linking to any specific course
    const categories = await CourseCategory.find({});

    if (categories.length > 0) {
      return res.status(200).json({
        message: "Categories Found",
        status: 200,
        data: categories,
      });
    } else {
      return res.status(404).json({
        message: "No Categories Found",
        status: 404,
        data: {},
      });
    }
  } catch (error) {
    return res.status(500).json({
      status: 500,
      message: "Internal server error",
      data: error.message,
    });
  }
};

exports.getAllCourseCategories = async (req, res) => {
  try {
    console.log("📂 Fetching all course categories");
    
    const categories = await CourseCategory.find({});
    
    console.log(`📂 Found ${categories.length} categories`);

    return res.status(200).json({
      message: "Categories retrieved successfully",
      status: 200,
      data: categories,
    });
  } catch (error) {
    console.error("❌ Error fetching categories:", error);
    return res.status(500).json({
      status: 500,
      message: "Server error while fetching categories",
      data: error.message,
    });
  }
};

exports.updateCourseCategory = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the category by ID
    const findCategory = await CourseCategory.findById(id);
    if (!findCategory) {
      return res
        .status(404)
        .json({ message: "Category Not Found", status: 404, data: {} });
    }

    // Check if a new image was uploaded
    let fileUrl = findCategory.image; // Default to existing image
    if (req.file) {
      fileUrl = req.file.path; // Update with new image if provided
    }

    // Prepare the updated fields, ignoring courseId since it's not relevant anymore
    let updatedCategoryData = {
      name: req.body.name || findCategory.name,
      image: fileUrl,
      status: req.body.status || findCategory.status,
    };

    // Update the category
    const updatedCategory = await CourseCategory.findByIdAndUpdate(
      { _id: id },
      { $set: updatedCategoryData },
      { new: true } // Return the updated document
    );

    return res.status(200).json({
      message: "Category Updated Successfully",
      data: updatedCategory,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      status: 500,
      data: error.message,
    });
  }
};

exports.removeCourseCategory = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("🗑️ Deleting category with ID:", id);
    
    const category = await CourseCategory.findById(id);
    if (!category) {
      return res.status(404).json({
        message: "Category not found",
        status: 404,
        data: {},
      });
    }

    await CourseCategory.findByIdAndDelete(category._id);
    console.log("✅ Category deleted successfully:", category.name);
    
    return res.status(200).json({
      message: "Category deleted successfully",
      status: 200,
      data: {},
    });
  } catch (error) {
    console.error("❌ Error deleting category:", error);
    return res.status(500).json({
      status: 500,
      message: "Server error while deleting category",
      data: error.message,
    });
  }
};

// ============================================================================
// 🔧 TEMPORARY FIX FUNCTIONS
// ============================================================================

exports.fixSubscriptionCourse = async (req, res) => {
  try {
    console.log('🔍 Checking subscriptions...');
    
    // Find all subscriptions
    const subscriptions = await Subscription.find().populate('course');
    console.log(`📊 Found ${subscriptions.length} subscriptions`);
    
    let fixedCount = 0;
    
    for (const subscription of subscriptions) {
      console.log(`\n📋 Subscription: ${subscription.name}`);
      console.log(`   - ID: ${subscription._id}`);
      console.log(`   - Course: ${subscription.course ? subscription.course.title : 'NULL'}`);
      
      if (!subscription.course) {
        console.log('❌ Course is null - needs fixing');
        
        // Find available courses
        const courses = await Course.find();
        console.log(`📚 Available courses:`);
        courses.forEach((course, index) => {
          console.log(`   ${index + 1}. ${course.title} (${course._id})`);
        });
        
        if (courses.length > 0) {
          // Associate with the first available course
          const targetCourse = courses[0];
          console.log(`🔧 Associating with course: ${targetCourse.title}`);
          
          subscription.course = targetCourse._id;
          await subscription.save();
          
          console.log('✅ Subscription updated successfully');
          fixedCount++;
        }
      } else {
        console.log('✅ Course association is valid');
      }
    }
    
    console.log('\n🎯 Verification - checking updated subscriptions:');
    const updatedSubscriptions = await Subscription.find().populate('course');
    const result = updatedSubscriptions.map(sub => ({
      name: sub.name,
      course: sub.course ? sub.course.title : 'NULL',
      courseId: sub.course ? sub.course._id : null
    }));
    
    return res.status(200).json({
      status: 200,
      message: `Fixed ${fixedCount} subscriptions`,
      data: {
        fixedCount,
        subscriptions: result
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
    return res.status(500).json({
      status: 500,
      message: 'Error fixing subscriptions',
      error: error.message
    });
  }
};

// ============================================================================
// 🏷️ SUB-CATEGORY MANAGEMENT
// ============================================================================

/**
 * Create a new sub-category under a specific category
 * Route: POST /api/v1/admin/Category/:categoryId/createSubCategory
 */
exports.createSubCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name, description, status } = req.body;

    console.log("📂 Creating sub-category:", name, "under category:", categoryId);
    console.log("🔍 Received status value:", status, typeof status);

    // Validate if categoryId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({
        status: 400,
        message: "Invalid category ID",
        data: null,
      });
    }

    // Find the parent category
    const parentCategory = await CourseCategory.findById(categoryId);
    if (!parentCategory) {
      return res.status(404).json({
        status: 404,
        message: "Parent category not found",
        data: null,
      });
    }

    // Check if sub-category with same name already exists under this category
    const existingSubCategory = parentCategory.subCategories.find(
      subCat => subCat.name.toLowerCase() === name.toLowerCase()
    );

    if (existingSubCategory) {
      return res.status(409).json({
        status: 409,
        message: "Sub-category with this name already exists under this category",
        data: null,
      });
    }

    // Prepare sub-category data
    const subCategoryData = {
      name: name,
      status: status === 'false' ? false : true, // Convert string to boolean
      courses: [] // Initialize empty courses array
    };

    // Add the new subcategory to the category's subCategories array
    parentCategory.subCategories.push(subCategoryData);

    // Save the updated category
    await parentCategory.save();

    console.log("✅ Sub-category created successfully:", name);

    // Return the newly created subcategory (last item in the array)
    const newSubCategory = parentCategory.subCategories[parentCategory.subCategories.length - 1];

    return res.status(201).json({
      status: 201,
      message: "Sub-category created successfully",
      data: newSubCategory,
    });
  } catch (error) {
    console.error("❌ Error creating sub-category:", error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        status: 400,
        message: "Validation error",
        data: error.errors,
      });
    }

    return res.status(500).json({
      status: 500,
      message: "Server error while creating sub-category",
      data: error.message,
    });
  }
};

/**
 * Get all sub-categories for a specific category
 * Route: GET /api/v1/admin/Category/:categoryId/subCategories
 */
exports.getSubCategories = async (req, res) => {
  try {
    console.log("🔍 getSubCategories function called");
    
    const { categoryId } = req.params;

    console.log("📂 Fetching sub-categories for category:", categoryId);

    // Validate if categoryId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({
        status: 400,
        message: "Invalid category ID",
        data: null,
      });
    }

    // Fetch the category with its embedded subcategories
    const category = await CourseCategory.findById(categoryId).select('name subCategories');
    if (!category) {
      return res.status(404).json({
        status: 404,
        message: "Category not found",
        data: null,
      });
    }

    // Extract subcategories from the category document
    const subCategories = category.subCategories || [];

    console.log(`📂 Found ${subCategories.length} sub-categories for category "${category.name}"`);

    return res.status(200).json({
      status: 200,
      message: "Sub-categories retrieved successfully",
      data: subCategories,
    });
  } catch (error) {
    console.error("❌ Error fetching sub-categories:", error);
    return res.status(500).json({
      status: 500,
      message: "Error fetching subcategories",
      error: error.message,
    });
  }
};

// exports.createSubCategory = async (req, res) => {
//     try {
//         const findMainCategory = await Course.findById({ _id: req.body.courseId });
//         if (!findMainCategory) {
//             return res.status(404).json({ message: "Main Category Not Found", status: 404, data: {} });
//         } else {
//             let findCategory = await CourseCategory.findOne({ courseId: findMainCategory._id, _id: req.body.categoryId });
//             if (!findCategory) {
//                 return res.status(404).json({ message: "Category Not Found", status: 404, data: {} });
//             } else {
//                 let findSubCategory = await CourseSubCategory.findOne({ courseId: findMainCategory._id, categoryId: findCategory._id, name: req.body.name });
//                 if (findSubCategory) {
//                     return res.status(409).json({ message: "Sub Category already exit.", status: 404, data: {} });
//                 } else {
//                     let courseImage = [];
//                     let courseNotes = [];
//                     let courseVideo = [];

//                     if (req.files) {
//                         if (req.files['courseImage']) {
//                             let dlFront = req.files['courseImage'];
//                             courseImage = dlFront[0].path;
//                         }
//                     }
//                     if (req.files) {
//                         if (req.files['courseNotes']) {
//                             let dlFront = req.files['courseNotes'];
//                             courseNotes = dlFront[0].path;
//                         }
//                     }
//                     if (req.files) {
//                         console.log("req.files", req.files);
//                         if (req.files['courseVideo']) {
//                             let dlFront = req.files['courseVideo'];
//                             courseVideo = dlFront[0].path;
//                         }
//                     }

//                     console.log('courseVideo:', courseVideo);

//                     const data = {
//                         courseId: findMainCategory._id, categoryId: findCategory._id, name: req.body.name, courseImage, courseVideo, courseNotes, description: req.body.description, status: req.body.status
//                     };
//                     const category = await CourseSubCategory.create(data);
//                     return res.status(200).json({ message: "Sub Category add successfully.", status: 200, data: category });
//                 }
//             }
//         }
//     } catch (error) {
//         console.log(error);
//         return res.status(500).json({ status: 500, message: "internal server error ", data: error.message, });
//     }
// };
// exports.getSubCategories = async (req, res) => {
//     const findMainCategory = await Course.findById({ _id: req.params.courseId });
//     if (!findMainCategory) {
//         return res.status(404).json({ message: "Main Category Not Found", status: 404, data: {} });
//     } else {
//         let findCategory = await CourseCategory.findOne({ courseId: findMainCategory._id, _id: req.params.categoryId });
//         if (!findCategory) {
//             return res.status(404).json({ message: "Category Not Found", status: 404, data: {} });
//         } else {
//             let findSubCategory = await CourseSubCategory.find({ courseId: findMainCategory._id, categoryId: findCategory._id, }).populate('courseId').populate('categoryId')
//             if (findSubCategory.length > 0) {
//                 return res.status(200).json({ message: "Sub Category Found", status: 200, data: findSubCategory, });
//             } else {
//                 return res.status(201).json({ message: "Sub Category not Found", status: 404, data: {}, });
//             }
//         }
//     }
// };
exports.getAllSubCategories = async (req, res) => {
  let findSubCategory = await CourseSubCategory.find()
    .populate("courseId", "name")
    .populate("categoryId", "name");
  if (findSubCategory.length > 0) {
    return res.status(200).json({
      message: "Sub Category Found",
      status: 200,
      data: findSubCategory,
    });
  } else {
    return res
      .status(201)
      .json({ message: "Sub Category not Found", status: 404, data: {} });
  }
};
exports.updateSubCategory = async (req, res) => {
  const { id } = req.params;
  const findSubCategory = await CourseSubCategory.findById(id);
  if (!findSubCategory) {
    return res
      .status(404)
      .json({ message: "Sub Category Not Found", status: 404, data: {} });
  }
  if (req.body.courseId != (null || undefined)) {
    const findMainCategory = await Course.findById({ _id: req.body.courseId });
    if (!findMainCategory) {
      return res
        .status(404)
        .json({ message: "Category Not Found", status: 404, data: {} });
    }
  }
  if (req.body.categoryId != (null || undefined)) {
    let findCategory = await CourseCategory.findOne({
      _id: req.body.categoryId,
    });
    if (!findCategory) {
      return res
        .status(404)
        .json({ message: "Category Not Found", status: 404, data: {} });
    }
  }
  let fileUrl;
  if (req.file) {
    fileUrl = req.file ? req.file.path : "";
  }
  let obj = {
    name: req.body.name || findSubCategory.name,
    courseId: req.body.courseId || findSubCategory.courseId,
    categoryId: req.body.categoryId || findSubCategory.categoryId,
    status: req.body.status || findSubCategory.status,
    description: req.body.description || findSubCategory.description,
    image: fileUrl || findSubCategory.image,
  };
  let update = await CourseSubCategory.findByIdAndUpdate(
    { _id: findSubCategory._id },
    { $set: obj },
    { new: true }
  );
  return res
    .status(200)
    .json({ message: "Updated Successfully", data: update });
};
exports.removeSubCategory = async (req, res) => {
  const { id } = req.params;
  const category = await CourseSubCategory.findById(id);
  if (!category) {
    return res
      .status(404)
      .json({ message: "Sub Category Not Found", status: 404, data: {} });
  } else {
    await CourseSubCategory.findByIdAndDelete(category._id);
    return res
      .status(200)
      .json({ message: "Sub Category Deleted Successfully !" });
  }
};
exports.UploadCourseImage = async (req, res) => {
  try {
    const subcategoryId = req.params.subcategoryId;

    const subCategory = await CourseSubCategory.findById(subcategoryId);
    if (!subCategory) {
      return res
        .status(404)
        .json({ message: "Sub Category Not Found", status: 404, data: {} });
    }

    if (req.files) {
      for (let i = 0; i < req.files.length; i++) {
        const imagePath = req.files[i].path;
        subCategory.courseImage.push(imagePath);
        await subCategory.save();
      }
    } else {
      console.log("No file uploaded");
    }

    return res.status(200).json({
      message: "Course image uploaded successfully",
      status: 200,
      data: subCategory,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: "Internal server error",
      data: error.message,
    });
  }
};
exports.UploadCourseDocument = async (req, res) => {
  try {
    const { title, description } = req.body;
    const { folderId } = req.params;
    const uploadedFiles = req.files;

    if (!uploadedFiles || Object.keys(uploadedFiles).length === 0) {
      return res.status(400).json({ message: "No document files uploaded" });
    }

    const folder = await Folder.findById(folderId);
    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }

    const allowedFields = ["courseImage", "courseNotes", "courseVideo"];
    const createdFiles = [];

    for (const field of allowedFields) {
      if (uploadedFiles[field]) {
        for (const file of uploadedFiles[field]) {
          const fileExtension = file.originalname.split('.').pop().toLowerCase();
          let fileType = "document"; // default
          
          if (['mp4', 'webm', 'mkv', 'avi', 'mov'].includes(fileExtension)) {
            fileType = "video";
          } else if (['pdf'].includes(fileExtension)) {
            fileType = "pdf";
          } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension)) {
            fileType = "image";
          }
          
          const newFile = await File.create({
            url: file.location, // S3 URL
            name: title || file.originalname, // File name
            description: description || "", // Description
            fileType: fileType,
            isDownloadable: false, // Default to not downloadable
            isViewable: false, // Default to not viewable - admin can toggle this later
          });

          createdFiles.push(newFile._id);
        }
      }
    }

    // Push the file IDs to the folder
    folder.files.push(...createdFiles);
    await folder.save();

    res.status(200).json({
      message: "Documents uploaded successfully",
      data: createdFiles,
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred during the document upload process" });
  }
};

exports.UploadCourseVideo1 = async (req, res) => {
  try {
    const subcategoryId = req.params.subcategoryId;

    const subCategory = await CourseSubCategory.findById(subcategoryId);
    if (!subCategory) {
      return res
        .status(404)
        .json({ message: "Sub Category Not Found", status: 404, data: {} });
    }

    if (req.files) {
      req.files.forEach((file) => {
        subCategory.courseVideo.push(file.path);
      });
      await subCategory.save();
    } else {
      console.log("No file uploaded");
      return res
        .status(400)
        .json({ message: "No files uploaded", status: 400 });
    }
    console.log("Updated SubCategory:", subCategory);

    return res.status(200).json({
      message: "Course image uploaded successfully",
      status: 200,
      data: subCategory,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: 500,
      message: "Internal server error",
      data: error.message,
    });
  }
};

exports.UploadCourseVideo = async (req, res) => {
  try {
    kpUpload1(req, res, async (err) => {
      if (err) {
        return res.status(500).json({ error: "Error uploading videos" });
      }

      const { title, description } = req.body; // Extract title and description from request body
      const videoFiles = req.files["courseVideo"]; // Access the uploaded courseVideo files

      if (!videoFiles || videoFiles.length === 0) {
        return res.status(400).json({ message: "No video files uploaded" });
      }

      const { folderId } = req.params; // Extract folderId from URL params

      // Fetch the folder
      const folder = await Folder.findById(folderId);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }

      // Check if adding the new videos exceeds any pre-defined limit (e.g., max 100 videos per folder)
      if (folder.files.length + videoFiles.length > 100) {
        return res
          .status(400)
          .json({ message: "Exceeded maximum limit of 100 videos per folder" });
      }

      // Create `File` documents for each uploaded video
      const createdFiles = await Promise.all(
        videoFiles.map(async (file) => {
          const objectKey = file.key; // S3 key (file location in the bucket)
          const directUrl = `https://${authConfig.s3_bucket}.s3.amazonaws.com/${objectKey}`;

          const newFile = await File.create({
            name: title || file.originalname, // Default to filename if title is not provided
            url: directUrl,
            description: description || "", // Default to empty string if description is not provided
            fileType: "video",
            isDownloadable: false, // Default to not downloadable
            isViewable: false, // Default to not viewable - admin can toggle this later
          });

          return newFile; // File is already saved by create()
        })
      );

      // Add the file `_id`s to the folder
      const fileIds = createdFiles.map((file) => file._id);
      folder.files.push(...fileIds);
      await folder.save();

      res.status(200).json({
        message: "Videos uploaded successfully",
        data: createdFiles.map((file) => ({
          id: file._id,
          url: file.url,
          name: file.name,
        })), // Return the details of created files
      });
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred during the video upload process" });
  }
};

exports.deleteCourseVideos = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { folderId } = req.params; // Folder ID from request params
    const videoUrls = req.body.videoUrls; // URLs of videos to delete

    if (!videoUrls || videoUrls.length === 0) {
      return res
        .status(400)
        .json({ message: "No video URLs provided for deletion" });
    }

    // Fetch the folder with session
    const folder = await Folder.findById(folderId).session(session);
    if (!folder) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Folder not found" });
    }

    // Separate videos to delete and keep
    const remainingVideos = folder.files.filter(
      (file) => !videoUrls.includes(file.url)
    );
    const videosToDelete = folder.files.filter((file) =>
      videoUrls.includes(file.url)
    );

    if (videosToDelete.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ message: "No videos found matching the provided URLs" });
    }

    // Update the folder with remaining videos
    folder.files = remainingVideos;

    // Save the updated folder
    await folder.save({ session });

    // Delete the files from the S3 bucket
    try {
      await deleteFilesFromBucket(authConfig.s3_bucket, videoUrls);
    } catch (error) {
      console.error("Failed to delete video files from S3:", error);
      await session.abortTransaction();
      session.endSession();
      return res.status(500).json({ error: "Failed to delete files from S3" });
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      status: 200,
      message: "Videos deleted successfully",
      data: folder,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Failed to delete videos:", error);
    res
      .status(500)
      .json({ error: "An error occurred during the video deletion process" });
  }
};

exports.createAboutUs = async (req, res) => {
  try {
    const {
      header,
      headerContent,
      header1,
      header1Content,
      header2,
      header2Content,
      header3,
      header3Content,
      header4,
      header4Content,
    } = req.body;

    const termAndCondition = new AboutUs({
      header,
      headerContent,
      header1,
      header1Content,
      header2,
      header2Content,
      header3,
      header3Content,
      header4,
      header4Content,
    });
    await termAndCondition.save();

    return res.status(201).json({
      status: 201,
      message: "AboutUs created successfully",
      data: termAndCondition,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Internal server error", details: error.message });
  }
};
exports.getAboutUs = async (req, res) => {
  try {
    const termAndCondition = await AboutUs.find();

    if (!termAndCondition) {
      return res
        .status(404)
        .json({ status: 404, message: "AboutUs not found" });
    }

    return res
      .status(200)
      .json({ status: 200, message: "Sucessfully", data: termAndCondition });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Internal server error", details: error.message });
  }
};
exports.getAboutUsbyId = async (req, res) => {
  try {
    const AboutUsId = req.params.id;
    const termAndCondition = await AboutUs.findById(AboutUsId);

    if (!termAndCondition) {
      return res
        .status(404)
        .json({ status: 404, message: "AboutUs not found" });
    }

    return res
      .status(200)
      .json({ status: 200, message: "Sucessfully", data: termAndCondition });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Internal server error", details: error.message });
  }
};
exports.updateAboutUs = async (req, res) => {
  try {
    const AboutUsId = req.params.id;
    const {
      header,
      headerContent,
      header1,
      header1Content,
      header2,
      header2Content,
      header3,
      header3Content,
      header4,
      header4Content,
    } = req.body;

    const updatedTermAndCondition = await AboutUs.findByIdAndUpdate(
      AboutUsId,
      {
        header,
        headerContent,
        header1,
        header1Content,
        header2,
        header2Content,
        header3,
        header3Content,
        header4,
        header4Content,
      },
      { new: true }
    );

    if (!updatedTermAndCondition) {
      return res
        .status(404)
        .json({ status: 404, message: "AboutUs not found" });
    }

    return res.status(200).json({
      status: 200,
      message: "AboutUs updated successfully",
      data: updatedTermAndCondition,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Internal server error", details: error.message });
  }
};
exports.deleteAboutUs = async (req, res) => {
  try {
    const AboutUsId = req.params.id;
    const deletedTermAndCondition = await AboutUs.findByIdAndDelete(AboutUsId);

    if (!deletedTermAndCondition) {
      return res
        .status(404)
        .json({ status: 404, message: "AboutUs not found" });
    }

    return res
      .status(200)
      .json({ status: 200, message: "AboutUs deleted successfully" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Internal server error", details: error.message });
  }
};

// ============================================================================
// 📅 SCHEDULE MANAGEMENT
// ============================================================================

exports.createSchedule = async (req, res) => {
  try {
    const {
      course,
      title,
      date,
      startTime,
      endTime,
      duration,
      description,
      meetingLink,
      teachers,
      status,
    } = req.body;
    const schedule = new Schedule({
      course,
      title,
      date,
      startTime,
      endTime,
      duration,
      description,
      meetingLink,
      teachers,
      status,
    });
    await schedule.save();
    return res.status(201).json({
      status: 201,
      message: "Schedule created successfully",
      data: schedule,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error: error.message });
  }
};
exports.getAllSchedules = async (req, res) => {
  try {
    const schedules = await Schedule.find().populate(
      "course"
    ); /*.populate('teachers')*/
    return res.status(200).json({
      status: 200,
      message: "Schedules retrieved successfully",
      data: schedules,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error: error.message });
  }
};
exports.getScheduleById = async (req, res) => {
  try {
    const { id } = req.params;
    const schedule = await Schedule.findById(id).populate("course");
    if (!schedule) {
      return res
        .status(404)
        .json({ status: 404, message: "Schedule not found" });
    }
    return res.status(200).json({
      status: 200,
      message: "Schedule retrieved successfully",
      data: schedule,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error: error.message });
  }
};
exports.updateSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      course,
      title,
      date,
      startTime,
      endTime,
      duration,
      description,
      meetingLink,
      teachers,
      status,
    } = req.body;
    const schedule = await Schedule.findByIdAndUpdate(
      id,
      {
        course,
        title,
        date,
        startTime,
        endTime,
        duration,
        description,
        meetingLink,
        teachers,
        status,
      },
      { new: true }
    );
    if (!schedule) {
      return res
        .status(404)
        .json({ status: 404, message: "Schedule not found" });
    }
    return res.status(200).json({
      status: 200,
      message: "Schedule updated successfully",
      data: schedule,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error: error.message });
  }
};
exports.deleteSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const schedule = await Schedule.findByIdAndDelete(id);
    if (!schedule) {
      return res
        .status(404)
        .json({ status: 404, message: "Schedule not found" });
    }
    return res
      .status(200)
      .json({ status: 200, message: "Schedule deleted successfully" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error: error.message });
  }
};
exports.deleteAllSchedules = async (req, res) => {
  try {
    await Schedule.deleteMany({});
    return res
      .status(200)
      .json({ status: 200, message: "All schedules deleted successfully" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error: error.message });
  }
};
const scheduleUpdate = async () => {
  try {
    const currentDateTime = new Date();
    const currentDate = currentDateTime.toISOString().split("T")[0];
    const currentTime = currentDateTime.toTimeString().slice(0, 5);

    const schedules = await Schedule.find({
      status: "scheduled",
      date: { $lte: currentDate },
      startTime: currentTime.toString(),
    });

    for (const schedule of schedules) {
      schedule.status = "live";
      await schedule.save();
    }

    const completedSchedules = await Schedule.find({
      status: { $in: ["scheduled", "live"] },
      date: { $lte: currentDate },
      endTime: currentTime.toString(),
    });

    for (const schedule of completedSchedules) {
      schedule.status = "completed";
      await schedule.save();
    }

    // console.log(`Checked schedules at ${currentDateTime}`);
  } catch (error) {
    console.error("Error updating schedules:", error);
  }
};
const intervalMinutes = 1;
const intervalMilliseconds = intervalMinutes * 60 * 1000;
const startInterval = () => {
  // console.log(`Starting interval to fetch and save Checked schedules data every ${intervalMinutes2} minutes`);
  setInterval(async () => {
    // console.log('Fetching and saving matches data...');
    await scheduleUpdate();
  }, intervalMilliseconds);
};
startInterval();

// ============================================================================
// 🏷️ CATEGORY MANAGEMENT (DUPLICATE - TO BE REMOVED)
// ============================================================================

exports.createCategory = async (req, res) => {
  try {
    const { name } = req.body;

    // if (!req.file) {
    //     return res.status(400).json({ status: 400, error: "Image file is required" });
    // }

    const category = new Category({
      name,
    });

    await category.save();

    return res.status(201).json({
      status: 201,
      message: "Category created successfully",
      data: category,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Category creation failed",
      error: error.message,
    });
  }
};

exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find();
    return res.status(200).json({ status: 200, data: categories });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Error fetching categories",
      error: error.message,
    });
  }
};

exports.getCategoryById = async (req, res) => {
  try {
    const categoryId = req.params.categoryId;

    const category = await Category.findById(categoryId);

    if (!category) {
      return res
        .status(404)
        .json({ status: 404, message: "Category not found" });
    }

    return res.status(200).json({ status: 200, data: category });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Error fetching category",
      error: error.message,
    });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const categoryId = req.params.categoryId;
    const { name } = req.body;

    const updateData = { name };
    if (req.file) updateData.image = req.file.path;

    const category = await Category.findByIdAndUpdate(categoryId, updateData, {
      new: true,
    });

    if (!category) {
      return res
        .status(404)
        .json({ status: 404, message: "Category not found" });
    }

    return res.status(200).json({
      status: 200,
      message: "Category updated successfully",
      data: category,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Category update failed",
      error: error.message,
    });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const categoryId = req.params.categoryId;

    const category = await Category.findByIdAndDelete(categoryId);

    if (!category) {
      return res
        .status(404)
        .json({ status: 404, message: "Category not found" });
    }

    return res
      .status(200)
      .json({ status: 200, message: "Category deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Category deletion failed",
      error: error.message,
    });
  }
};

// SubCategory CRUD
exports.createSubCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name, status } = req.body;

    const category = await Category.findById(categoryId);
    if (!category) {
      return res
        .status(404)
        .json({ status: 404, message: "Category not found" });
    }

    category.subCategories.push({ name, status });
    await category.save();

    return res.status(201).json({
      status: 201,
      message: "SubCategory created successfully",
      data: category,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "SubCategory creation failed",
      error: error.message,
    });
  }
};

exports.getSubCategories = async (req, res) => {
  try {
    const { categoryId } = req.params;
    console.log(categoryId);
    const category = await Category.findById(categoryId).select(
      "subCategories"
    );

    if (!category) {
      return res
        .status(404)
        .json({ status: 404, message: "Category not found" });
    }

    return res.status(200).json({ status: 200, data: category.subCategories });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Error fetching subcategories",
      error: error.message,
    });
  }
};

exports.updateSubCategory = async (req, res) => {
  try {
    const { categoryId, subCategoryId } = req.params;
    const { name, status } = req.body;

    const category = await Category.findById(categoryId);
    if (!category) {
      return res
        .status(404)
        .json({ status: 404, message: "Category not found" });
    }

    const subCategory = category.subCategories.id(subCategoryId);
    if (!subCategory) {
      return res
        .status(404)
        .json({ status: 404, message: "SubCategory not found" });
    }

    subCategory.name = name || subCategory.name;
    if (status !== undefined) subCategory.status = status;

    await category.save();

    return res.status(200).json({
      status: 200,
      message: "SubCategory updated successfully",
      data: category,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "SubCategory update failed",
      error: error.message,
    });
  }
};

exports.deleteSubCategory = async (req, res) => {
  try {
    const { categoryId, subCategoryId } = req.params;

    const category = await Category.findById(categoryId);
    if (!category) {
      return res
        .status(404)
        .json({ status: 404, message: "Category not found" });
    }

    const subCategory = category.subCategories.id(subCategoryId);
    if (!subCategory) {
      return res
        .status(404)
        .json({ status: 404, message: "SubCategory not found" });
    }

    subCategory.remove();
    await category.save();

    return res
      .status(200)
      .json({ status: 200, message: "SubCategory deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "SubCategory deletion failed",
      error: error.message,
    });
  }
};

// ============================================================================
// 🏪 PRODUCT MANAGEMENT
// ============================================================================

exports.createProduct = async (req, res) => {
  try {
    // Extract product data from request
    const productData = req.body;
    const files = req.files;
    
    // Validate required fields before calling service
    const validationErrors = productService.validateProductData(productData);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        status: 400,
        message: "Validation failed",
        errors: validationErrors
      });
    }

    // Call product service to handle business logic
    const product = await productService.createProductLogic(productData, files);

    return res.status(201).json({
      status: 201,
      message: "Product created successfully",
      data: product,
    });
  } catch (error) {
    console.error("Error in createProduct controller:", error.message);
    
    // Handle specific business logic errors
    if (error.message.includes("Category not found")) {
      return res.status(404).json({
        status: 404,
        message: error.message,
      });
    }

    return res.status(500).json({
      status: 500,
      message: "Product creation failed",
      error: error.message,
    });
  }
};
exports.getAllProducts = async (req, res) => {
  try {
    const products = await Product.find();
    return res.status(200).json({ status: 200, data: products });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Error fetching products",
      error: error.message,
    });
  }
};
exports.getProductById = async (req, res) => {
  try {
    const productId = req.params.productId;

    const product = await Product.findById(productId);

    if (!product) {
      return res
        .status(404)
        .json({ status: 404, message: "Product not found" });
    }

    return res.status(200).json({ status: 200, data: product });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Error fetching product by ID",
      error: error.message,
    });
  }
};
exports.updateProduct = async (req, res) => {
  try {
    const productId = req.params.productId;
    const updateData = req.body;
    const files = req.files;

    // Call product service to handle business logic
    const updatedProduct = await productService.updateProductLogic(productId, updateData, files);

    return res.status(200).json({
      status: 200,
      message: "Product updated successfully",
      data: updatedProduct,
    });
  } catch (error) {
    console.error("Error in updateProduct controller:", error.message);
    
    // Handle specific business logic errors
    if (error.message.includes("Product not found") ||
        error.message.includes("Category not found") ||
        error.message.includes("SubCategory not found")) {
      return res.status(404).json({
        status: 404,
        message: error.message,
      });
    }

    return res.status(500).json({
      status: 500,
      message: "Product update failed",
      error: error.message,
    });
  }
};
exports.deleteProduct = async (req, res) => {
  try {
    const productId = req.params.productId;

    const deletedProduct = await Product.findByIdAndDelete(productId);

    if (!deletedProduct) {
      return res
        .status(404)
        .json({ status: 404, message: "Product not found" });
    }

    return res
      .status(200)
      .json({ status: 200, message: "Product deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Product deletion failed",
      error: error.message,
    });
  }
};
exports.createProductReview = async (req, res) => {
  try {
    const productId = req.params.productId;

    const { rating, comment } = req.body;

    const userId = req.user.id;

    const userCheck = await User.findById(userId);

    if (!userCheck) {
      return res.status(404).json({ status: 404, message: "User not found" });
    }

    const review = {
      user: userCheck._id,
      name: userCheck.userName,
      rating,
      comment,
    };

    const product = await Product.findById(productId);

    if (!product) {
      return res
        .status(404)
        .json({ status: 404, message: "Product not found" });
    }

    product.reviews.push(review);

    const totalRatings = product.reviews.reduce(
      (sum, review) => sum + review.rating,
      0
    );
    const newNumOfReviews = product.reviews.length;
    const newAvgRating = totalRatings / newNumOfReviews;

    product.rating = newAvgRating;
    product.numOfReviews = newNumOfReviews;

    await product.save();

    return res.status(201).json({
      status: 201,
      message: "Product review added successfully",
      data: product,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Product review creation failed",
      error: error.message,
    });
  }
};
exports.getAllProductReviews = async (req, res) => {
  try {
    const productId = req.params.productId;

    const product = await Product.findById(productId);

    if (!product) {
      return res
        .status(404)
        .json({ status: 404, message: "Product not found" });
    }

    const reviews = product.reviews;

    res.status(200).json({ status: 200, data: reviews });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Error fetching product reviews",
      error: error.message,
    });
  }
};
exports.getProductReviewById = async (req, res) => {
  try {
    const productId = req.params.productId;
    const reviewId = req.params.reviewId;

    const product = await Product.findById(productId);

    if (!product) {
      return res
        .status(404)
        .json({ status: 404, message: "Product not found" });
    }

    const review = product.reviews.id(reviewId);

    if (!review) {
      return res.status(404).json({ status: 404, message: "Review not found" });
    }

    res.status(200).json({ status: 200, data: review });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Error fetching product review",
      error: error.message,
    });
  }
};
exports.updateProductReview = async (req, res) => {
  try {
    const productId = req.params.productId;
    const reviewId = req.params.reviewId;
    const { rating, comment } = req.body;

    const product = await Product.findById(productId);

    if (!product) {
      return res
        .status(404)
        .json({ status: 404, message: "Product not found" });
    }

    const review = product.reviews.id(reviewId);

    if (!review) {
      return res.status(404).json({ status: 404, message: "Review not found" });
    }

    review.rating = rating;
    review.comment = comment;

    const totalRatings = product.reviews.reduce((sum, r) => sum + r.rating, 0);
    const newAvgRating = totalRatings / product.numOfReviews;

    product.rating = newAvgRating;

    await product.save();

    res.status(200).json({
      status: 200,
      message: "Product review updated successfully",
      data: review,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Product review update failed",
      error: error.message,
    });
  }
};
exports.deleteProductReview = async (req, res) => {
  try {
    const productId = req.params.productId;
    const reviewId = req.params.reviewId;

    const product = await Product.findById(productId);

    if (!product) {
      return res
        .status(404)
        .json({ status: 404, message: "Product not found" });
    }

    const reviewIndex = product.reviews.findIndex(
      (review) => review._id.toString() === reviewId
    );

    if (reviewIndex === -1) {
      return res.status(404).json({ status: 404, message: "Review not found" });
    }

    product.reviews.splice(reviewIndex, 1);

    product.numOfReviews -= 1;

    if (product.numOfReviews > 0) {
      const totalRatings = product.reviews.reduce(
        (sum, r) => sum + r.rating,
        0
      );
      const newAvgRating = totalRatings / product.numOfReviews;
      product.rating = newAvgRating;
    } else {
      product.rating = 0;
    }

    await product.save();

    res
      .status(200)
      .json({ status: 200, message: "Product review deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Product review deletion failed",
      error: error.message,
    });
  }
};
exports.getProductsByCategory = async (req, res) => {
  try {
    const categoryId = req.params.categoryId;

    const products = await Product.find({ categoryId });

    res.status(200).json({ status: 200, data: products });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Error fetching products by category",
      error: error.message,
    });
  }
};
exports.searchProducts = async (req, res) => {
  try {
    const searchParams = req.query;

    // Call product service to handle business logic
    const result = await productService.searchProductsLogic(searchParams);

    return res.status(200).json({
      status: 200,
      message: result.message,
      data: result.data,
      count: result.count,
    });
  } catch (error) {
    console.error("Error in searchProducts controller:", error.message);
    
    res.status(500).json({
      status: 500,
      message: "Error searching products",
      error: error.message,
    });
  }
};
exports.getNewArrivalProductsByCategoryAndSubCategory = async (req, res) => {
  try {
    const categoryId = req.params.categoryId;

    const category = await Category.findById(categoryId);

    if (!category) {
      return res
        .status(404)
        .json({ status: 404, message: "Category not found" });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const newArrivalProducts = await Product.find({
      categoryId: categoryId,
      createdAt: { $gte: thirtyDaysAgo },
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      message: "New arrival products by category and subcategory",
      data: newArrivalProducts,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Error retrieving new arrival products",
      error: error.message,
    });
  }
};
exports.getNewArrivalProducts = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 90);

    const newArrivalProducts = await Product.find({
      createdAt: { $gte: thirtyDaysAgo },
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      status: 200,
      message: "New arrival products",
      data: newArrivalProducts,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Error retrieving new arrival products",
      error: error.message,
    });
  }
};
exports.getMostDemandedProducts = async (req, res) => {
  try {
    const mostDemandedProducts = await Product.find({}).sort({
      numOfReviews: -1,
    });

    return res.status(200).json({
      status: 200,
      message: "Most demanded products",
      data: mostDemandedProducts,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Error retrieving most demanded products",
      error: error.message,
    });
  }
};
exports.paginateProductSearch = async (req, res) => {
  try {
    const searchParams = req.query;

    // Call product service to handle business logic
    const result = await productService.paginateProductSearchLogic(searchParams);

    return res.status(200).json({ 
      status: 200, 
      message: result.message, 
      data: result.data 
    });
  } catch (error) {
    console.error("Error in paginateProductSearch controller:", error.message);
    
    return res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
// exports.getAllOrders = async (req, res) => {
//     try {
//         const orders = await Order.find()
//             .populate({
//                 path: 'products.product',
//                 select: 'productName price image',
//             })
//             .populate({
//                 path: 'products.vendorId',
//                 select: 'userName mobileNumber image',
//             })
//             .populate({
//                 path: 'user',
//             })
//             .populate({
//                 path: 'shippingAddress',
//                 select: 'fullName phone addressLine1 city state postalCode country isDefault',
//             });

//         const count = orders.length;

//         return res.status(200).json({ status: 200, message: 'Orders retrieved successfully', data: count, orders });
//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ status: 500, message: 'Error fetching orders', error: error.message });
//     }
// };
// exports.getOrdersByUserId = async (req, res) => {
//     try {
//         const userId = req.params.userId;

//         const orders = await Order.find({ user: userId })
//             .populate({
//                 path: 'products.product',
//                 select: 'productName price image',
//             })
//             .populate({
//                 path: 'products.vendorId',
//                 select: 'userName mobileNumber image',
//             })
//             .populate({
//                 path: 'user',
//                 select: 'userName mobileNumber image',
//             })
//             .populate({
//                 path: 'shippingAddress',
//                 select: 'fullName phone addressLine1 city state postalCode country isDefault',
//             });

//         const count = orders.length;

//         return res.status(200).json({ status: 200, message: 'Orders retrieved successfully', data: count, orders });
//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ status: 500, message: 'Error fetching orders', error: error.message });
//     }
// };
// exports.getOrdersByProductId = async (req, res) => {
//     try {
//         const productId = req.params.productId;

//         const orders = await Order.find({ 'products.product': productId })
//             .populate({
//                 path: 'products.product',
//                 select: 'productName price image',
//             })
//             .populate({
//                 path: 'products.vendorId',
//                 select: 'userName mobileNumber image',
//             })
//             .populate({
//                 path: 'user',
//                 select: 'userName mobileNumber image',
//             })
//             .populate({
//                 path: 'shippingAddress',
//                 select: 'fullName phone addressLine1 city state postalCode country isDefault',
//             });

//         const count = orders.length;

//         return res.status(200).json({ status: 200, message: 'Orders retrieved successfully', data: count, orders });
//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ status: 500, message: 'Error fetching orders', error: error.message });
//     }
// };
// exports.getOrderById = async (req, res) => {
//     try {
//         const orderId = req.params.orderId;

//         const { error } = orderIdValidation.validate(req.params);
//         if (error) {
//             return res.status(400).json({ status: 400, message: error.details[0].message });
//         }
//         const order = await Order.findById(orderId)
//             .populate({
//                 path: 'products.product',
//                 select: 'productName price image',
//             })
//             .populate({
//                 path: 'products.vendorId',
//                 select: 'userName mobileNumber image',
//             })
//             .populate({
//                 path: 'user',
//                 select: 'userName mobileNumber image',
//             })
//             .populate({
//                 path: 'shippingAddress',
//                 select: 'fullName phone addressLine1 city state postalCode country isDefault',
//             });

//         if (!order) {
//             return res.status(404).json({ status: 404, message: 'Order not found' });
//         }

//         return res.status(200).json({ status: 200, message: 'Order retrieved successfully', data: order });
//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ status: 500, message: 'Error fetching order', error: error.message });
//     }
// };
// exports.searchOrders = async (req, res) => {
//     try {
//         const { userId, vendorId, productId } = req.query;
//         let query = {};

//         if (userId) {
//             query.user = userId;
//         }
//         if (vendorId) {
//             query['products.vendorId'] = vendorId;
//         }
//         if (productId) {
//             query['products.product'] = productId;
//         }

//         const orders = await Order.find(query)
//             .populate({
//                 path: 'products.product',
//                 select: 'productName price image',
//             })
//             .populate({
//                 path: 'products.vendorId',
//                 select: 'userName mobileNumber image',
//             })
//             .populate({
//                 path: 'user',
//                 select: 'userName mobileNumber image',
//             })
//             .populate({
//                 path: 'shippingAddress',
//                 select: 'fullName phone addressLine1 city state postalCode country isDefault',
//             });

//         const count = orders.length;

//         return res.status(200).json({ status: 200, message: 'Orders retrieved successfully', data: count, orders });
//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ status: 500, message: 'Error fetching orders', error: error.message });
//     }
// };
// exports.updateOrderStatus = async (req, res) => {
//     try {
//         const orderId = req.params.id;
//         const { status } = req.body;

//         const { error } = updateOrderStatusValidation.validate({ orderId, status });
//         if (error) {
//             return res.status(400).json({ status: 400, message: error.details[0].message });
//         }

//         const order = await Order.findById(orderId);

//         if (!order) {
//             return res.status(404).json({ status: 404, message: 'Order not found' });
//         }

//         order.status = status;
//         await order.save();

//         return res.status(200).json({ status: 200, message: 'Order status updated successfully', data: order });
//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({ status: 500, message: 'Error updating order status', error: error.message });
//     }
// };
// exports.updateRefundStatus = async (req, res) => {
//     try {
//         const { orderId } = req.params;
//         const { refundStatus } = req.body;

//         const order = await Order.findById(orderId);
//         if (!order) {
//             return res.status(404).json({
//                 status: 404,
//                 message: 'Order not found',
//             });
//         }

//         const previousRefundStatus = order.refundStatus;

//         order.refundStatus = refundStatus;

//         await order.save();

//         if (refundStatus === 'Completed' && previousRefundStatus !== 'Completed') {
//             let wallet = await User.findById(order.user);
//             console.log("wallet", wallet);

//             const existingWallet = await UserWallet.findOne({ user: order.user });
//             if (existingWallet) {
//                 existingWallet.balance += order.totalAmount;
//                 await existingWallet.save();
//             } else {
//                 let userWallet = new UserWallet({ user: order.user, balance: order.totalAmount });
//                 await userWallet.save();
//             }

//             const notification = new Notification({
//                 userId: order.user,
//                 title: 'Refund for order #' + order.trackingNumber,
//                 content: 'Total Amount Refund Amount Is Added On Your Wallet: ' + order.totalAmount,
//             });
//             await notification.save();
//         }

//         return res.status(200).json({
//             status: 200,
//             message: 'Refund status updated successfully',
//             data: order,
//         });
//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({
//             status: 500,
//             message: 'Error updating refund status',
//             error: error.message,
//         });
//     }
// };
exports.createNotice = async (req, res) => {
  try {
    const { courseId, title, content, expiryDate } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).send({ message: "not found" });
    }
    if (courseId) {
      const schedule = await Course.findOne({ _id: courseId });
      if (!schedule) {
        return res
          .status(404)
          .json({ status: 404, message: "course not found" });
      }
    }
    const notice = new NoticeBoard({
      courseId,
      title,
      content,
      author: user._id,
      expiryDate,
    });

    await notice.save();
    res.status(201).json({
      status: 201,
      message: "Notice created successfully",
      data: notice,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.getAllNotices = async (req, res) => {
  try {
    const notices = await NoticeBoard.find().populate("author courseId");
    res.status(200).json({
      status: 200,
      message: "Notices retrieved successfully",
      data: notices,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.getNoticeById = async (req, res) => {
  try {
    const notice = await NoticeBoard.findById(req.params.id).populate(
      "author courseId"
    );
    if (!notice) {
      return res.status(404).json({ status: 404, message: "Notice not found" });
    }
    res.status(200).json({
      status: 200,
      message: "Notice retrieved successfully",
      data: notice,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.updateNotice = async (req, res) => {
  try {
    const { courseId, title, content, expiryDate, isActive } = req.body;

    if (courseId) {
      const schedule = await Course.findOne({ _id: courseId });
      if (!schedule) {
        return res
          .status(404)
          .json({ status: 404, message: "course not found" });
      }
    }
    const notice = await NoticeBoard.findByIdAndUpdate(
      req.params.id,
      { courseId, title, content, expiryDate, isActive },
      { new: true, runValidators: true }
    );

    if (!notice) {
      return res.status(404).json({ status: 404, message: "Notice not found" });
    }

    res.status(200).json({
      status: 200,
      message: "Notice updated successfully",
      data: notice,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.deleteNotice = async (req, res) => {
  try {
    const notice = await NoticeBoard.findByIdAndDelete(req.params.id);
    if (!notice) {
      return res.status(404).json({ status: 404, message: "Notice not found" });
    }
    res
      .status(200)
      .json({ status: 200, message: "Notice deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ============================================================================
// 📚 SYLLABUS MANAGEMENT
// ============================================================================

exports.createSyllabus = async (req, res) => {
  try {
    const { courseId, title } = req.body;

    let image;
    if (req.file) {
      image = req.file.path;
    }
    const syllabus = new Syllabus({
      courseId,
      title,
      document: image,
    });

    const savedSyllabus = await syllabus.save();

    res.status(201).json({
      status: 201,
      message: "Syllabus uploaded successfully",
      data: savedSyllabus,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.getAllSyllabus = async (req, res) => {
  try {
    const syllabusEntries = await Syllabus.find();
    res.status(200).json({
      status: 200,
      message: "All syllabus entries retrieved successfully",
      data: syllabusEntries,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.getSyllabusById = async (req, res) => {
  try {
    const syllabusEntry = await Syllabus.findById(req.params.id);
    if (!syllabusEntry) {
      return res
        .status(404)
        .json({ status: 404, message: "Syllabus entry not found", data: null });
    }
    res.status(200).json({
      status: 200,
      message: "Syllabus entry retrieved successfully",
      data: syllabusEntry,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.updateSyllabus = async (req, res) => {
  try {
    const { courseId, title } = req.body;
    const syllabusId = req.params.id;

    let syllabusEntry = await Syllabus.findById(syllabusId);

    if (!syllabusEntry) {
      return res
        .status(404)
        .json({ status: 404, message: "Syllabus entry not found", data: null });
    }

    syllabusEntry.courseId = courseId || syllabusEntry.courseId;
    syllabusEntry.title = title || syllabusEntry.title;

    if (req.file) {
      syllabusEntry.document = req.file.path;
    }

    const updatedSyllabus = await syllabusEntry.save();

    res.status(200).json({
      status: 200,
      message: "Syllabus entry updated successfully",
      data: updatedSyllabus,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.deleteSyllabus = async (req, res) => {
  try {
    const deletedSyllabus = await Syllabus.findByIdAndDelete(req.params.id);
    if (!deletedSyllabus) {
      return res.status(404).json({
        status: 404,
        message: "Syllabus entry not found for deletion",
        data: null,
      });
    }
    res.status(200).json({
      status: 200,
      message: "Syllabus entry deleted successfully",
      data: deletedSyllabus,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ============================================================================
// 📝 TEST SERIES MANAGEMENT
// ============================================================================

exports.createTestSeries = async (req, res) => {
  try {
    const { courseId, categoryId, subCategoryId, title, description } =
      req.body;

    let document = [];
    // if (req.files) {
    //     document = req.files.map(file => file.path);
    // }
    if (req.files) {
      for (let i = 0; i < req.files.length; i++) {
        console.log(req.files[i]);
        const imagePath = req.files[i].path;
        document.push(imagePath);
        console.log(document);
      }
    } else {
      console.log("No file uploaded");
    }
    if (req.files.length == document.length) {
      const newTestSeries = new TestSeries({
        courseId,
        categoryId,
        subCategoryId,
        title,
        description,
        documents: document,
      });

      const savedTestSeries = await newTestSeries.save();
      res.status(201).json({
        status: 201,
        message: "Test series created successfully",
        data: savedTestSeries,
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.createTestSeries1 = async (req, res) => {
  TestSeriesUpload(req, res, async (err) => {
    if (err) {
      return res.status(500).json({ error: "Error uploading documents" });
    }

    let document = [];
    console.log(req.files);

    if (req.files) {
      for (let i = 0; i < req.files.length; i++) {
        console.log(req.files[i]);
        const imagePath = req.files[i].path;
        document.push(imagePath);
        console.log(document);
      }
    } else {
      console.log("No file uploaded");
    }
    // const documents = req.files.map((file) => file.path);
    // if (documents.length > 6) {
    //     return res.status(400).json({ status: 400, message: 'Exceeded maximum limit of 6 documents per test series' });
    // }

    try {
      const { courseId, categoryId, subCategoryId, title, description } =
        req.body;

      const newTestSeries = new TestSeries({
        courseId,
        categoryId,
        subCategoryId,
        title,
        description,
        document,
      });

      const savedTestSeries = await newTestSeries.save();
      res.status(201).json({
        status: 201,
        message: "Test series created successfully",
        data: savedTestSeries,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        status: 500,
        message: "Internal server error",
        error: error.message,
      });
    }
  });
};
exports.getAllTestSeries = async (req, res) => {
  try {
    const testSeriesList = await TestSeries.find().populate(
      "courseId categoryId subCategoryId"
    );
    res.status(200).json({
      status: 200,
      message: "Test series retrieved successfully",
      data: testSeriesList,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.getTestSeriesById = async (req, res) => {
  try {
    const testSeries = await TestSeries.findById(req.params.id).populate(
      "courseId categoryId subCategoryId"
    );
    if (!testSeries) {
      return res
        .status(404)
        .json({ status: 404, message: "Test series not found", data: null });
    }
    res.status(200).json({
      status: 200,
      message: "Test series retrieved successfully",
      data: testSeries,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.updateTestSeries = async (req, res) => {
  try {
    const { courseId, categoryId, subCategoryId, title, description } =
      req.body;
    let documents = [];
    if (req.files) {
      documents = req.files.map((file) => file.path);
    }

    const testSeries = await TestSeries.findById(req.params.id);
    if (!testSeries) {
      return res
        .status(404)
        .json({ status: 404, message: "Test series not found", data: null });
    }

    testSeries.courseId = courseId || testSeries.courseId;
    testSeries.categoryId = categoryId || testSeries.categoryId;
    testSeries.subCategoryId = subCategoryId || testSeries.subCategoryId;
    testSeries.title = title || testSeries.title;
    testSeries.description = description || testSeries.description;
    testSeries.documents =
      documents.length > 0 ? documents : testSeries.documents;

    const updatedTestSeries = await testSeries.save();
    res.status(200).json({
      status: 200,
      message: "Test series updated successfully",
      data: updatedTestSeries,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.deleteTestSeries = async (req, res) => {
  try {
    const testSeries = await TestSeries.findByIdAndDelete(req.params.id);
    if (!testSeries) {
      return res
        .status(404)
        .json({ status: 404, message: "Test series not found", data: null });
    }
    res.status(200).json({
      status: 200,
      message: "Test series deleted successfully",
      data: testSeries,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ============================================================================
// 🎥 VIDEO LECTURE MANAGEMENT
// ============================================================================

exports.createVideoLecture = async (req, res) => {
  try {
    const {
      courseId,
      categoryId,
      subCategoryId,
      title,
      description,
      videoUrl,
    } = req.body;

    const newVideoLecture = new VideoLecture({
      courseId,
      categoryId,
      subCategoryId,
      title,
      description,
      videoUrl,
    });

    const savedVideoLecture = await newVideoLecture.save();
    res.status(201).json({
      status: 201,
      message: "Video lecture created successfully",
      data: savedVideoLecture,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.getVideoLectureById = async (req, res) => {
  try {
    const videoLecture = await VideoLecture.findById(
      req.params.id
    ); /*.populate('courseId categoryId subCategoryId')*/
    if (!videoLecture) {
      return res
        .status(404)
        .json({ status: 404, message: "Video lecture not found", data: null });
    }
    res.status(200).json({
      status: 200,
      message: "Video lecture retrieved successfully",
      data: videoLecture,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.updateVideoLecture = async (req, res) => {
  try {
    const {
      courseId,
      categoryId,
      subCategoryId,
      title,
      description,
      videoUrl,
    } = req.body;

    const updatedVideoLecture = await VideoLecture.findByIdAndUpdate(
      req.params.id,
      {
        courseId,
        categoryId,
        subCategoryId,
        title,
        description,
        videoUrl,
      },
      { new: true }
    );

    if (!updatedVideoLecture) {
      return res
        .status(404)
        .json({ status: 404, message: "Video lecture not found", data: null });
    }

    res.status(200).json({
      status: 200,
      message: "Video lecture updated successfully",
      data: updatedVideoLecture,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.deleteVideoLecture = async (req, res) => {
  try {
    const deletedVideoLecture = await VideoLecture.findByIdAndDelete(
      req.params.id
    );

    if (!deletedVideoLecture) {
      return res
        .status(404)
        .json({ status: 404, message: "Video lecture not found", data: null });
    }

    res.status(200).json({
      status: 200,
      message: "Video lecture deleted successfully",
      data: deletedVideoLecture,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.getAllVideoLectures = async (req, res) => {
  try {
    const videoLectures =
      await VideoLecture.find(); /*.populate('courseId categoryId subCategoryId')*/
    res.status(200).json({
      status: 200,
      message: "Video lectures retrieved successfully",
      data: videoLectures,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ============================================================================
// 📅 EXAM SCHEDULE MANAGEMENT
// ============================================================================

exports.createExamSchedule = async (req, res) => {
  try {
    const {
      courseId,
      categoryId,
      subCategoryId,
      title,
      description,
      examDate,
      duration,
    } = req.body;

    const newExamSchedule = new ExamSchedule({
      courseId,
      categoryId,
      subCategoryId,
      title,
      description,
      examDate,
      duration,
    });

    const savedExamSchedule = await newExamSchedule.save();
    res.status(201).json({
      status: 201,
      message: "Exam schedule created successfully",
      data: savedExamSchedule,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.getExamScheduleById = async (req, res) => {
  try {
    const examSchedule = await ExamSchedule.findById(
      req.params.id
    ); /*.populate('courseId categoryId subCategoryId')*/
    if (!examSchedule) {
      return res
        .status(404)
        .json({ status: 404, message: "Exam schedule not found", data: null });
    }
    res.status(200).json({
      status: 200,
      message: "Exam schedule retrieved successfully",
      data: examSchedule,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.updateExamSchedule = async (req, res) => {
  try {
    const {
      courseId,
      categoryId,
      subCategoryId,
      title,
      description,
      examDate,
      duration,
    } = req.body;

    const updatedExamSchedule = await ExamSchedule.findByIdAndUpdate(
      req.params.id,
      {
        courseId,
        categoryId,
        subCategoryId,
        title,
        description,
        examDate,
        duration,
      },
      { new: true }
    );

    if (!updatedExamSchedule) {
      return res
        .status(404)
        .json({ status: 404, message: "Exam schedule not found", data: null });
    }

    res.status(200).json({
      status: 200,
      message: "Exam schedule updated successfully",
      data: updatedExamSchedule,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.deleteExamSchedule = async (req, res) => {
  try {
    const deletedExamSchedule = await ExamSchedule.findByIdAndDelete(
      req.params.id
    );

    if (!deletedExamSchedule) {
      return res
        .status(404)
        .json({ status: 404, message: "Exam schedule not found", data: null });
    }

    res.status(200).json({
      status: 200,
      message: "Exam schedule deleted successfully",
      data: deletedExamSchedule,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.getAllExamSchedules = async (req, res) => {
  try {
    const examSchedules =
      await ExamSchedule.find(); /*.populate('courseId categoryId subCategoryId')*/
    res.status(200).json({
      status: 200,
      message: "Exam schedules retrieved successfully",
      data: examSchedules,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ============================================================================
// 📹 RECORDING MANAGEMENT
// ============================================================================

exports.createRecording = async (req, res) => {
  try {
    const {
      courseId,
      categoryId,
      subCategoryId,
      title,
      description,
      recordingUrl,
    } = req.body;

    const newRecording = new Recording({
      courseId,
      categoryId,
      subCategoryId,
      title,
      description,
      recordingUrl,
    });

    const savedRecording = await newRecording.save();
    res.status(201).json({
      status: 201,
      message: "Recording created successfully",
      data: savedRecording,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.getRecordingById = async (req, res) => {
  try {
    const recording = await Recording.findById(
      req.params.id
    ); /*.populate('courseId categoryId subCategoryId')*/
    if (!recording) {
      return res
        .status(404)
        .json({ status: 404, message: "Recording not found", data: null });
    }
    res.status(200).json({
      status: 200,
      message: "Recording retrieved successfully",
      data: recording,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.updateRecording = async (req, res) => {
  try {
    const {
      courseId,
      categoryId,
      subCategoryId,
      title,
      description,
      recordingUrl,
    } = req.body;

    const updatedRecording = await Recording.findByIdAndUpdate(
      req.params.id,
      {
        courseId,
        categoryId,
        subCategoryId,
        title,
        description,
        recordingUrl,
      },
      { new: true }
    );

    if (!updatedRecording) {
      return res
        .status(404)
        .json({ status: 404, message: "Recording not found", data: null });
    }

    res.status(200).json({
      status: 200,
      message: "Recording updated successfully",
      data: updatedRecording,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.deleteRecording = async (req, res) => {
  try {
    const deletedRecording = await Recording.findByIdAndDelete(req.params.id);

    if (!deletedRecording) {
      return res
        .status(404)
        .json({ status: 404, message: "Recording not found", data: null });
    }

    res.status(200).json({
      status: 200,
      message: "Recording deleted successfully",
      data: deletedRecording,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.getAllRecordings = async (req, res) => {
  try {
    const recordings =
      await Recording.find(); /*.populate('courseId categoryId subCategoryId')*/
    res.status(200).json({
      status: 200,
      message: "Recordings retrieved successfully",
      data: recordings,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ============================================================================
// 📋 SURVEY MANAGEMENT
// ============================================================================

exports.createSurveyForm = async (req, res) => {
  try {
    const {
      teacher,
      course,
      categoryId,
      subCategoryId,
      comment,
      rating,
      adminReply,
    } = req.body;

    const newSurveyForm = new SurveyForm({
      teacher,
      course,
      categoryId,
      subCategoryId,
      comment,
      rating,
      adminReply,
    });

    const savedSurveyForm = await newSurveyForm.save();
    res.status(201).json({
      status: 201,
      message: "Survey form created successfully",
      data: savedSurveyForm,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.getSurveyFormById = async (req, res) => {
  try {
    const surveyForm = await SurveyForm.findById(
      req.params.id
    ); /*.populate('teacher course categoryId subCategoryId')*/
    if (!surveyForm) {
      return res
        .status(404)
        .json({ status: 404, message: "Survey form not found", data: null });
    }
    res.status(200).json({
      status: 200,
      message: "Survey form retrieved successfully",
      data: surveyForm,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.updateSurveyForm = async (req, res) => {
  try {
    const {
      teacher,
      course,
      categoryId,
      subCategoryId,
      comment,
      rating,
      adminReply,
    } = req.body;

    const updatedSurveyForm = await SurveyForm.findByIdAndUpdate(
      req.params.id,
      {
        teacher,
        course,
        categoryId,
        subCategoryId,
        comment,
        rating,
        adminReply,
      },
      { new: true }
    );

    if (!updatedSurveyForm) {
      return res
        .status(404)
        .json({ status: 404, message: "Survey form not found", data: null });
    }

    res.status(200).json({
      status: 200,
      message: "Survey form updated successfully",
      data: updatedSurveyForm,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.deleteSurveyForm = async (req, res) => {
  try {
    const deletedSurveyForm = await SurveyForm.findByIdAndDelete(req.params.id);

    if (!deletedSurveyForm) {
      return res
        .status(404)
        .json({ status: 404, message: "Survey form not found", data: null });
    }

    res.status(200).json({
      status: 200,
      message: "Survey form deleted successfully",
      data: deletedSurveyForm,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.getAllSurveyForms = async (req, res) => {
  try {
    const surveyForms =
      await SurveyForm.find(); /*.populate('teacher course categoryId subCategoryId')*/
    res.status(200).json({
      status: 200,
      message: "Survey forms retrieved successfully",
      data: surveyForms,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.addAdminReply = async (req, res) => {
  try {
    const { adminReply } = req.body;

    if (!adminReply) {
      return res
        .status(400)
        .json({ status: 400, message: "Admin reply is required" });
    }

    const updatedSurveyForm = await SurveyForm.findByIdAndUpdate(
      req.params.id,
      { adminReply },
      { new: true }
    );

    if (!updatedSurveyForm) {
      return res
        .status(404)
        .json({ status: 404, message: "Survey form not found", data: null });
    }

    res.status(200).json({
      status: 200,
      message: "Admin reply added successfully",
      data: updatedSurveyForm,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ============================================================================
// 🔗 FOLLOW US MANAGEMENT
// ============================================================================

exports.createFollowUs = async (req, res) => {
  try {
    const { platform, url, description } = req.body;

    const newFollowUs = new FollowUs({ platform, url, description });
    const savedFollowUs = await newFollowUs.save();

    res.status(201).json({
      status: 201,
      message: "Social media link created successfully",
      data: savedFollowUs,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.getAllFollowUs = async (req, res) => {
  try {
    const followUsLinks = await FollowUs.find();
    res.status(200).json({
      status: 200,
      message: "Social media links retrieved successfully",
      data: followUsLinks,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.getFollowUsById = async (req, res) => {
  try {
    const followUsLink = await FollowUs.findById(req.params.id);

    if (!followUsLink) {
      return res.status(404).json({
        status: 404,
        message: "Social media link not found",
        data: null,
      });
    }

    res.status(200).json({
      status: 200,
      message: "Social media link retrieved successfully",
      data: followUsLink,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.updateFollowUs = async (req, res) => {
  try {
    const { platform, url, description } = req.body;

    const updatedFollowUs = await FollowUs.findByIdAndUpdate(
      req.params.id,
      { platform, url, description },
      { new: true }
    );

    if (!updatedFollowUs) {
      return res.status(404).json({
        status: 404,
        message: "Social media link not found",
        data: null,
      });
    }

    res.status(200).json({
      status: 200,
      message: "Social media link updated successfully",
      data: updatedFollowUs,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.deleteFollowUs = async (req, res) => {
  try {
    const deletedFollowUs = await FollowUs.findByIdAndDelete(req.params.id);

    if (!deletedFollowUs) {
      return res.status(404).json({
        status: 404,
        message: "Social media link not found",
        data: null,
      });
    }

    res.status(200).json({
      status: 200,
      message: "Social media link deleted successfully",
      data: deletedFollowUs,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ============================================================================
// 📊 UTILITY FUNCTIONS
// ============================================================================

// Added by Himanshu
exports.updateDownloads = async (req, res) => {
  console.log("updateDownloads function hit");
  const { rootFolderId, allowDownload } = req.body;
  // if (!req.user || req.user.role !== "admin") {
  //   return res.status(403).json({ message: "Unauthorized" });
  // }

  if (!rootFolderId || typeof allowDownload !== "boolean") {
    return res.status(400).json({
      message: "Missing required fields: rootFolderId or allowDownload",
    });
  }

  const visited = new Set(); // To avoid infinite loops

  const updateFilesRecursively = async (folderId) => {
    if (visited.has(folderId.toString())) return;
    visited.add(folderId.toString());

    const folder = await Folder.findById(folderId)
      .populate("files")
      .populate("folders");

    if (!folder) return;

    // Update all PDF files in this folder
    const updatePromises = folder.files
      .map((file) => {
        if (file.url && file.url.toLowerCase().endsWith(".pdf")) {
          return File.findByIdAndUpdate(file._id, {
            isDownloadable: allowDownload,
          });
        }
      })
      .filter(Boolean); // Remove undefined entries

    await Promise.all(updatePromises);

    // Recursively update subfolders
    const subfolderPromises = folder.folders.map((sub) =>
      updateFilesRecursively(sub._id)
    );
    await Promise.all(subfolderPromises);
  };

  try {
    await updateFilesRecursively(rootFolderId);
    res
      .status(200)
      .json({ message: `PDF download setting updated to ${allowDownload}` });
  } catch (error) {
    console.error("Error updating downloads:", error);
    res.status(500).json({ message: "Server error while updating downloads" });
  }
};

// ============================================================================
// 📚 COURSE MANAGEMENT - CREATE COURSE
// ============================================================================

/**
 * Create a new course
 * Route: POST /api/v1/admin/courses/add
 * Middleware: authJwt.verifyToken, kpUpload
 */
exports.createCourse = async (req, res) => {
  try {
    console.log("📚 Creating new course with data:", req.body);
    console.log("📁 Uploaded files:", req.files ? Object.keys(req.files) : 'No files');

    // Extract course data from request body
    const courseData = {
      title: req.body.title,
      description: req.body.description,
      subject: req.body.subject,
      price: req.body.price,
      oldPrice: req.body.oldPrice,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      discount: req.body.discount,
      duration: req.body.duration,
      lessons: req.body.lessons,
      weeks: req.body.weeks,
      subCategory: req.body.subCategory,
      categoryId: req.body.categoryId,
      level: req.body.level,
      language: req.body.language,
      status: req.body.status || 'draft',
      isPublished: req.body.isPublished === 'true' ? true : false, // Convert string to boolean
    };

    // Validate required fields
    if (!courseData.title || !courseData.description) {
      return res.status(400).json({
        status: 400,
        message: "Title and description are required",
        data: null,
      });
    }

    // Use courseService to handle business logic
    const newCourse = await courseService.createCourseLogic(courseData, req.files);

    console.log("✅ Course created successfully:", newCourse.title);

    return res.status(201).json({
      status: 201,
      message: "Course created successfully",
      data: newCourse,
    });
  } catch (error) {
    console.error("❌ Error creating course:", error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      console.error("❌ Mongoose ValidationError:", error.errors);
      return res.status(400).json({
        status: 400,
        message: "Validation error",
        data: error.errors,
      });
    }
    
    // Handle other specific errors
    if (error.message && error.message.includes('must be true or false')) {
      console.error("❌ Boolean validation error:", error.message);
      return res.status(400).json({
        status: 400,
        message: error.message,
        data: null,
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(409).json({
        status: 409,
        message: "Course with this title already exists",
        data: null,
      });
    }

    return res.status(500).json({
      status: 500,
      message: "Server error while creating course",
      data: error.message,
    });
  }
};

// ============================================================================
// 📢 COURSE PUBLISH/UNPUBLISH MANAGEMENT
// ============================================================================

/**
 * Toggle publish status of a course
 * Route: PATCH /api/v1/admin/courses/:id/toggle-publish
 */
exports.togglePublishCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const { isPublished } = req.body; // Get desired state from request body

    console.log("🔄 Setting publish status for course:", id, "to:", isPublished);

    // Validate if id is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 400,
        message: "Invalid course ID",
        data: null,
      });
    }

    // Find the course
    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({
        status: 404,
        message: "Course not found",
        data: null,
      });
    }

    // Set the publish status to desired state
    console.log("🔍 Current isPublished value:", course.isPublished, typeof course.isPublished);
    
    // If no desired state provided, toggle the current state
    let newStatus;
    if (isPublished !== undefined) {
      // Use the desired state from request
      newStatus = isPublished === true || isPublished === 'true';
    } else {
      // Fallback to toggle behavior
      const isCurrentlyPublished = course.isPublished === true;
      newStatus = !isCurrentlyPublished;
    }
    
    // Explicitly set the field to ensure it's a proper boolean
    course.set('isPublished', newStatus);
    
    console.log("🔄 New isPublished value:", course.isPublished, typeof course.isPublished);
    await course.save();

    console.log(`✅ Course "${course.title}" ${course.isPublished ? 'published' : 'unpublished'} successfully`);

    return res.status(200).json({
      status: 200,
      message: `Course ${course.isPublished ? 'published' : 'unpublished'} successfully`,
      data: {
        courseId: course._id,
        title: course.title,
        isPublished: course.isPublished,
      },
    });
  } catch (error) {
    console.error("❌ Error toggling course publish status:", error);
    return res.status(500).json({
      status: 500,
      message: "Server error while updating course publish status",
      data: error.message,
    });
  }
};

/**
 * Get all published courses (for public/user access)
 * Route: GET /api/v1/user/courses
 */
exports.getAllPublishedCourses = async (req, res) => {
  try {
    console.log("📚 Fetching all published courses");

    // Find only published courses
    const courses = await Course.find({ isPublished: true })
      .populate("category", "name")
      .populate("teacher", "name email")
      .populate("faqs")
      .sort({ createdAt: -1 });

    console.log(`📚 Found ${courses.length} published courses`);

    return res.status(200).json({
      status: 200,
      message: "Published courses retrieved successfully",
      data: courses,
    });
  } catch (error) {
    console.error("❌ Error fetching published courses:", error);
    return res.status(500).json({
      status: 500,
      message: "Server error while fetching published courses",
      data: error.message,
    });
  }
};

// ============================================================================
// 📚 BATCH COURSE MANAGEMENT
// ============================================================================

/**
 * Create a new batch course (no pricing, manual enrollment)
 * Route: POST /api/v1/admin/batch-courses/create
 */
exports.createBatchCourse = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      subCategory,
      teacher,
      batchName,
      batchSize,
      batchStartDate,
      batchEndDate,
      duration,
      lessons,
      weeks
    } = req.body;

    // Validate required fields
    if (!title || !description || !category || !batchName) {
      return res.status(400).json({
        status: 400,
        message: "Missing required fields: title, description, category, batchName",
      });
    }

    // Create batch course with default values for batch type
    const newBatchCourse = new Course({
      title,
      description: Array.isArray(description) ? description : [description],
      category,
      subCategory,
      teacher: teacher ? (Array.isArray(teacher) ? teacher : [teacher]) : [],
      courseType: "Batch",
      price: 0, // Batch courses are free
      oldPrice: 0,
      isPublished: false, // Default to unpublished
      batchName,
      batchSize: batchSize || 50,
      batchStartDate: batchStartDate ? new Date(batchStartDate) : null,
      batchEndDate: batchEndDate ? new Date(batchEndDate) : null,
      duration,
      lessons,
      weeks,
      manualEnrollments: []
    });

    const savedCourse = await newBatchCourse.save();

    // Create folder for the batch course (same as regular courses)
    const { createFolder } = require('./courseController');
    const folderReqBody = {
      name: savedCourse.title,
      courseId: savedCourse._id,
    };
    const folderReq = { body: folderReqBody };
    const folderResponse = await createFolder(folderReq);
    const rootFolderId = folderResponse._id;

    // Update course with rootFolder
    savedCourse.rootFolder = rootFolderId;
    await savedCourse.save();

    console.log(`✅ Batch course created: ${savedCourse.title}`);

    res.status(201).json({
      status: 201,
      message: "Batch course created successfully",
      data: savedCourse,
    });

  } catch (error) {
    console.error("❌ Error creating batch course:", error);

    res.status(500).json({
      status: 500,
      message: "Server error while creating batch course",
      data: error.message,
    });
  }
};

/**
 * Get all batch courses
 * Route: GET /api/v1/admin/batch-courses
 */
exports.getAllBatchCourses = async (req, res) => {
  try {
    const batchCourses = await Course.find({ courseType: "Batch" })
      .populate('category', 'name')
      .populate('teacher', 'firstName lastName email')
      .populate('manualEnrollments.user', 'firstName lastName email')
      .populate('manualEnrollments.enrolledBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    console.log(`✅ Batch courses fetched: ${batchCourses.length} courses`);

    res.status(200).json({
      status: 200,
      message: "Batch courses fetched successfully",
      data: batchCourses,
    });

  } catch (error) {
    console.error("❌ Error fetching batch courses:", error);

    res.status(500).json({
      status: 500,
      message: "Server error while fetching batch courses",
      data: error.message,
    });
  }
};

/**
 * Add user to batch course (manual enrollment)
 * Route: POST /api/v1/admin/batch-courses/:courseId/add-user
 */
exports.addUserToBatchCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        status: 400,
        message: "User ID is required",
      });
    }

    // Find the batch course
    const course = await Course.findOne({ 
      _id: courseId, 
      courseType: "Batch" 
    });

    if (!course) {
      return res.status(404).json({
        status: 404,
        message: "Batch course not found",
      });
    }

    // Verify user exists first
    const User = require('../models/userModel');
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 404,
        message: "User not found",
      });
    }

    // Check if user is already enrolled (check both manualEnrollments and purchasedCourses)
    const isAlreadyEnrolled = course.manualEnrollments.some(
      enrollment => enrollment.user.toString() === userId
    );

    const hasAlreadyPurchased = user.purchasedCourses.some(
      pc => pc.course.toString() === courseId
    );

    console.log(`🔍 [DEBUG] Duplicate check results:`);
    console.log(`🔍 [DEBUG] - User already in manual enrollments: ${isAlreadyEnrolled}`);
    console.log(`🔍 [DEBUG] - User already has purchased course: ${hasAlreadyPurchased}`);
    console.log(`🔍 [DEBUG] - Current course manual enrollments: ${course.manualEnrollments.length}`);
    console.log(`🔍 [DEBUG] - Current user purchased courses: ${user.purchasedCourses.length}`);

    if (isAlreadyEnrolled || hasAlreadyPurchased) {
      console.log(`⚠️ [DEBUG] User already has access - returning early`);
      return res.status(400).json({
        status: 400,
        message: "User is already enrolled in this batch course",
      });
    }

    console.log(`✅ [DEBUG] User does not have access yet - proceeding with addition`);

    // Add user to batch course
    course.manualEnrollments.push({
      user: userId,
      enrolledBy: req.user.id,
      status: 'Active'
    });

    // ALSO add the batch course to user's purchasedCourses array
    user.purchasedCourses.push({
      course: courseId,
      assignedByAdmin: {
        isAssigned: true,
        assignedAt: new Date(),
        assignedBy: req.user.id
      },
      expiresAt: null // Batch courses don't expire by default
    });

    // Enhanced debugging before save
    console.log(`🔧 [DEBUG] About to save changes:`);
    console.log(`🔧 [DEBUG] - Course manual enrollments count: ${course.manualEnrollments.length}`);
    console.log(`🔧 [DEBUG] - User purchased courses count: ${user.purchasedCourses.length}`);
    console.log(`🔧 [DEBUG] - Course ID: ${courseId}`);
    console.log(`🔧 [DEBUG] - User ID: ${userId}`);

    try {
      const saveResults = await Promise.all([course.save(), user.save()]);
      console.log(`✅ [DEBUG] Save successful - Course saved: ${!!saveResults[0]}, User saved: ${!!saveResults[1]}`);
    } catch (saveError) {
      console.error(`❌ [DEBUG] Save failed:`, saveError);
      throw saveError;
    }

    // Verify the save worked by re-fetching
    const verifyUser = await User.findById(userId);
    const verifyCourse = await Course.findById(courseId);
    
    const userHasCourse = verifyUser.purchasedCourses.some(pc => pc.course.toString() === courseId);
    const courseHasUser = verifyCourse.manualEnrollments.some(e => e.user.toString() === userId);
    
    console.log(`🔍 [DEBUG] Verification after save:`);
    console.log(`🔍 [DEBUG] - User has course in purchasedCourses: ${userHasCourse}`);
    console.log(`🔍 [DEBUG] - Course has user in manualEnrollments: ${courseHasUser}`);

    if (!userHasCourse || !courseHasUser) {
      console.error(`🚨 [DEBUG] DATABASE SAVE VERIFICATION FAILED!`);
      console.error(`🚨 [DEBUG] - User purchased courses: ${verifyUser.purchasedCourses.length}`);
      console.error(`🚨 [DEBUG] - Course manual enrollments: ${verifyCourse.manualEnrollments.length}`);
    }

    // Populate the new enrollment for response
    await course.populate('manualEnrollments.user', 'firstName lastName email');
    await course.populate('manualEnrollments.enrolledBy', 'firstName lastName email');

    console.log(`✅ User added to batch course: ${user.firstName} ${user.lastName} -> ${course.batchName}`);

    

    res.status(200).json({
      status: 200,
      message: "User added to batch course successfully",
      data: course,
    });

  } catch (error) {
    console.error("❌ Error adding user to batch course:", error);

    res.status(500).json({
      status: 500,
      message: "Server error while adding user to batch course",
      data: error.message,
    });
  }
};

/**
 * Remove user from batch course
 * Route: DELETE /api/v1/admin/batch-courses/:courseId/remove-user/:userId
 */
exports.removeUserFromBatchCourse = async (req, res) => {
  try {
    const { courseId, userId } = req.params;

    // Find the batch course
    const course = await Course.findOne({ 
      _id: courseId, 
      courseType: "Batch" 
    });

    if (!course) {
      return res.status(404).json({
        status: 404,
        message: "Batch course not found",
      });
    }

    // Find and remove the enrollment
    const enrollmentIndex = course.manualEnrollments.findIndex(
      enrollment => enrollment.user.toString() === userId
    );

    if (enrollmentIndex === -1) {
      return res.status(404).json({
        status: 404,
        message: "User is not enrolled in this batch course",
      });
    }

    // Get user info for logging before removal
    const User = require('../models/userModel');
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        status: 404,
        message: "User not found",
      });
    }

    // Remove from both course.manualEnrollments AND user.purchasedCourses
    course.manualEnrollments.splice(enrollmentIndex, 1);
    
    // Remove from user's purchasedCourses array
    user.purchasedCourses = user.purchasedCourses.filter(
      pc => pc.course.toString() !== courseId
    );

    await Promise.all([course.save(), user.save()]);

    console.log(`✅ User removed from batch course: ${user?.firstName} ${user?.lastName} <- ${course.batchName}`);

    res.status(200).json({
      status: 200,
      message: "User removed from batch course successfully",
      data: course,
    });

  } catch (error) {
    console.error("❌ Error removing user from batch course:", error);

    res.status(500).json({
      status: 500,
      message: "Server error while removing user from batch course",
      data: error.message,
    });
  }
};

/**
 * Get batch course by ID with enrolled users
 * Route: GET /api/v1/admin/batch-courses/:courseId
 */
exports.getBatchCourseById = async (req, res) => {
  try {
    const { courseId } = req.params;

    const course = await Course.findOne({ 
      _id: courseId, 
      courseType: "Batch" 
    })
      .populate('category', 'name')
      .populate('teacher', 'firstName lastName email')
      .populate('manualEnrollments.user', 'firstName lastName email phone')
      .populate('manualEnrollments.enrolledBy', 'firstName lastName email');

    if (!course) {
      return res.status(404).json({
        status: 404,
        message: "Batch course not found",
      });
    }

    console.log(`✅ Batch course details fetched: ${course.title} (${course.manualEnrollments.length} enrolled)`);

    res.status(200).json({
      status: 200,
      message: "Batch course details fetched successfully",
      data: course,
    });

  } catch (error) {
    console.error("❌ Error fetching batch course details:", error);

    res.status(500).json({
      status: 500,
      message: "Server error while fetching batch course details",
      data: error.message,
    });
  }
};

// Utility function to fix batch courses without rootFolder
exports.fixBatchCoursesRootFolder = async (req, res) => {
  try {
    console.log('🔧 Starting batch course rootFolder fix...');
    
    // Find batch courses without rootFolder
    const batchCoursesWithoutFolder = await Course.find({
      courseType: "Batch",
      $or: [
        { rootFolder: { $exists: false } },
        { rootFolder: null },
        { rootFolder: undefined }
      ]
    });
    
    console.log(`Found ${batchCoursesWithoutFolder.length} batch courses without rootFolder`);
    
    if (batchCoursesWithoutFolder.length === 0) {
      return res.status(200).json({
        status: 200,
        message: "All batch courses already have rootFolder",
        data: { fixed: 0, total: 0 }
      });
    }
    
    const { createFolder } = require('./courseController');
    let fixedCount = 0;
    const results = [];
    
    for (const course of batchCoursesWithoutFolder) {
      try {
        console.log(`🔧 Fixing course: ${course.title} (${course._id})`);
        
        // Create folder for the batch course
        const folderReqBody = {
          name: course.title,
          courseId: course._id,
        };
        const folderReq = { body: folderReqBody };
        const folderResponse = await createFolder(folderReq);
        const rootFolderId = folderResponse._id;
        
        // Update course with rootFolder
        course.rootFolder = rootFolderId;
        await course.save();
        
        fixedCount++;
        results.push({
          courseId: course._id,
          courseTitle: course.title,
          rootFolderId: rootFolderId,
          status: 'fixed'
        });
        
        console.log(`✅ Fixed course: ${course.title} -> rootFolder: ${rootFolderId}`);
        
      } catch (error) {
        console.error(`❌ Error fixing course ${course.title}:`, error);
        results.push({
          courseId: course._id,
          courseTitle: course.title,
          status: 'error',
          error: error.message
        });
      }
    }
    
    console.log(`🎉 Batch course fix completed: ${fixedCount}/${batchCoursesWithoutFolder.length} fixed`);
    
    res.status(200).json({
      status: 200,
      message: `Fixed ${fixedCount} out of ${batchCoursesWithoutFolder.length} batch courses`,
      data: {
        fixed: fixedCount,
        total: batchCoursesWithoutFolder.length,
        results: results
      }
    });
    
  } catch (error) {
    console.error("❌ Error in fixBatchCoursesRootFolder:", error);
    res.status(500).json({
      status: 500,
      message: "Server error while fixing batch courses",
      data: error.message,
    });
  }
};

// Debug endpoint to check user's purchased courses
exports.debugUserCourses = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({
        status: 400,
        message: "User ID is required",
      });
    }
    
    const user = await User.findById(userId).populate({
      path: 'purchasedCourses.course',
      select: 'title courseType isPublished _id'
    });
    
    if (!user) {
      return res.status(404).json({
        status: 404,
        message: "User not found",
      });
    }
    
    console.log(`🔍 [DEBUG] User courses for ${user.firstName} ${user.lastName}:`);
    
    const courseDetails = user.purchasedCourses.map(pc => ({
      courseId: pc.course?._id?.toString() || 'N/A',
      courseTitle: pc.course?.title || 'N/A',
      courseType: pc.course?.courseType || 'N/A',
      isPublished: pc.course?.isPublished || false,
      assignedByAdmin: pc.assignedByAdmin?.isAssigned || false,
      assignedAt: pc.assignedByAdmin?.assignedAt || null,
      expiresAt: pc.expiresAt || null
    }));
    
    console.log(`🔍 [DEBUG] Course details:`, courseDetails);
    
    res.status(200).json({
      status: 200,
      message: "User course debug info retrieved successfully",
      data: {
        userId: userId,
        userName: `${user.firstName} ${user.lastName}`,
        totalCourses: user.purchasedCourses.length,
        courses: courseDetails
      }
    });
    
  } catch (error) {
    console.error("❌ Error in debugUserCourses:", error);
    res.status(500).json({
      status: 500,
      message: "Server error while debugging user courses",
      data: error.message,
    });
  }
};

// Quick fix for user batch course access
exports.fixUserBatchAccess = async (req, res) => {
  try {
    const { userId, courseId } = req.body;
    
    console.log(`🔧 [DEBUG] fixUserBatchAccess called with:`);
    console.log(`🔧 [DEBUG] - userId: ${userId}`);
    console.log(`🔧 [DEBUG] - courseId: ${courseId}`);

// FORCE FIX: Direct database operation for the specific user
if (!userId && !courseId) {
  const tempUserId = '6889f297ae1f381179cf6f50';
  const tempCourseId = '6895a124640829b294034fa0';
  console.log(`🔧 [FORCE FIX] Direct database operation for user ${tempUserId} to course ${tempCourseId}`);
  
  try {
    const tempUser = await User.findById(tempUserId);
    const tempCourse = await Course.findById(tempCourseId);
    
    if (!tempUser) {
      return res.status(404).json({ status: 404, message: "User not found" });
    }
    
    if (!tempCourse) {
      return res.status(404).json({ status: 404, message: "Course not found" });
    }
    
    console.log(`🔧 [FORCE FIX] Found user: ${tempUser.firstName} ${tempUser.lastName}`);
    console.log(`🔧 [FORCE FIX] Found course: ${tempCourse.title || tempCourse.batchName} (Type: ${tempCourse.courseType})`);
    
    // Check current access
    const hasInPurchased = tempUser.purchasedCourses.some(pc => pc.course.toString() === tempCourseId);
    const hasInEnrollments = tempCourse.manualEnrollments.some(e => e.user.toString() === tempUserId);
    
    console.log(`🔧 [FORCE FIX] Current access status:`);
    console.log(`🔧 [FORCE FIX] - In purchased courses: ${hasInPurchased}`);
    console.log(`🔧 [FORCE FIX] - In manual enrollments: ${hasInEnrollments}`);
    
    let changes = [];
    
    if (!hasInPurchased) {
      tempUser.purchasedCourses.push({
        course: tempCourseId,
        assignedByAdmin: {
          isAssigned: true,
          assignedAt: new Date(),
          assignedBy: tempUserId
        },
        expiresAt: null
      });
      changes.push("Added to purchased courses");
      console.log(`🔧 [FORCE FIX] Added course to user's purchased courses`);
    }
    
    if (tempCourse.courseType === 'Batch' && !hasInEnrollments) {
      tempCourse.manualEnrollments.push({
        user: tempUserId,
        enrolledBy: tempUserId,
        status: 'Active'
      });
      changes.push("Added to manual enrollments");
      console.log(`🔧 [FORCE FIX] Added user to course's manual enrollments`);
    }
    
    if (changes.length > 0) {
      console.log(`🔧 [FORCE FIX] Saving changes: ${changes.join(', ')}`);
      
      // Force save with validation disabled
      const saveResults = await Promise.all([
        tempUser.save({ validateBeforeSave: false }),
        tempCourse.save({ validateBeforeSave: false })
      ]);
      
      console.log(`✅ [FORCE FIX] Save results: User=${!!saveResults[0]}, Course=${!!saveResults[1]}`);
      
      // Verify the changes
      const verifyUser = await User.findById(tempUserId);
      const verifyCourse = await Course.findById(tempCourseId);
      
      const finalUserHas = verifyUser.purchasedCourses.some(pc => pc.course.toString() === tempCourseId);
      const finalCourseHas = verifyCourse.manualEnrollments.some(e => e.user.toString() === tempUserId);
      
      console.log(`🔧 [FORCE FIX] Final verification:`);
      console.log(`🔧 [FORCE FIX] - User has course: ${finalUserHas}`);
      console.log(`🔧 [FORCE FIX] - Course has user: ${finalCourseHas}`);
      
      return res.status(200).json({
        status: 200,
        message: `✅ FORCE FIX: Successfully applied changes - ${changes.join(', ')}`,
        data: { 
          userId: tempUserId, 
          courseId: tempCourseId,
          changes,
          verification: { userHasCourse: finalUserHas, courseHasUser: finalCourseHas }
        }
      });
    } else {
      return res.status(200).json({
        status: 200,
        message: `✅ User already has proper access to course`,
        data: { userId: tempUserId, courseId: tempCourseId }
      });
    }
    
  } catch (forceFixError) {
    console.error(`❌ [FORCE FIX] Error:`, forceFixError);
    return res.status(500).json({
      status: 500,
      message: `Force fix failed: ${forceFixError.message}`,
      error: forceFixError.message
    });
  }
}
    
    if (!userId || !courseId) {
      return res.status(400).json({
        status: 400,
        message: "User ID and Course ID are required",
      });
    }
    
    // Find the user and course
    const user = await User.findById(userId);
    const course = await Course.findById(courseId);
    
    if (!user) {
      return res.status(404).json({
        status: 404,
        message: "User not found",
      });
    }
    
    if (!course) {
      return res.status(404).json({
        status: 404,
        message: "Course not found",
      });
    }
    
    console.log(`🔧 Fixing batch access for user: ${user.firstName} ${user.lastName}`);
    console.log(`🔧 Course: ${course.title} (${course.courseType})`);
    
    // Check if user already has the course
    const hasAlreadyPurchased = user.purchasedCourses.some(
      pc => pc.course.toString() === courseId
    );
    
    if (hasAlreadyPurchased) {
      return res.status(200).json({
        status: 200,
        message: "User already has access to this course",
        data: {
          userId,
          courseId,
          courseName: course.title,
          userName: `${user.firstName} ${user.lastName}`
        }
      });
    }
    
    // Add the batch course to user's purchasedCourses array
    user.purchasedCourses.push({
      course: courseId,
      assignedByAdmin: {
        isAssigned: true,
        assignedAt: new Date(),
        assignedBy: req.user._id
      },
      expiresAt: null // Batch courses don't expire by default
    });
    
    // Also ensure user is in course's manualEnrollments
    const isAlreadyEnrolled = course.manualEnrollments.some(
      enrollment => enrollment.user.toString() === userId
    );
    
    if (!isAlreadyEnrolled) {
      course.manualEnrollments.push({
        user: userId,
        enrolledBy: req.user._id,
        status: 'Active'
      });
    }
    
    await Promise.all([user.save(), course.save()]);
    
    console.log(`✅ Fixed batch access for user: ${user.firstName} ${user.lastName} -> ${course.title}`);
    
    res.status(200).json({
      status: 200,
      message: "User batch course access fixed successfully",
      data: {
        userId,
        courseId,
        courseName: course.title,
        courseType: course.courseType,
        userName: `${user.firstName} ${user.lastName}`,
        accessGranted: true
      }
    });
    
  } catch (error) {
    console.error("❌ Error in fixUserBatchAccess:", error);
    res.status(500).json({
      status: 500,
      message: "Server error while fixing user batch access",
      data: error.message,
    });
  }
};

// Utility to check and explain batch course file access
exports.checkBatchFileAccess = async (req, res) => {
  try {
    const { courseId, userId } = req.body;
    
    if (!courseId) {
      return res.status(400).json({
        status: 400,
        message: "Course ID is required",
      });
    }
    
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        status: 404,
        message: "Course not found",
      });
    }
    
    if (course.courseType !== "Batch") {
      return res.status(400).json({
        status: 400,
        message: "This utility is only for batch courses",
      });
    }
    
    let userInfo = null;
    let hasAccess = false;
    
    if (userId) {
      const user = await User.findById(userId).populate('purchasedCourses.course', 'title courseType');
      if (user) {
        hasAccess = user.purchasedCourses.some(pc => pc.course._id.toString() === courseId);
        userInfo = {
          userId: user._id,
          name: `${user.firstName} ${user.lastName}`,
          hasAccess: hasAccess
        };
      }
    }
    
    // Get course folder and files
    const Folder = require('../models/folderModel');
    const File = require('../models/fileModel');
    
    const rootFolder = await Folder.findById(course.rootFolder).populate('files');
    if (!rootFolder) {
      return res.status(404).json({
        status: 404,
        message: "Course root folder not found",
      });
    }
    
    const fileAccessInfo = rootFolder.files.map(file => {
      const wasManuallyLocked = file.isViewable === false;
      let userCanAccess = false;
      
      if (hasAccess) {
        // Batch course logic: unlocked by default unless manually locked
        userCanAccess = !wasManuallyLocked;
      }
      
      return {
        fileId: file._id,
        fileName: file.name,
        originalIsViewable: file.isViewable,
        wasManuallyLocked: wasManuallyLocked,
        userCanAccess: userCanAccess,
        explanation: hasAccess 
          ? (wasManuallyLocked 
              ? "🔒 Locked - Admin manually locked this file" 
              : "🔓 Unlocked - Default batch behavior")
          : "❌ No access - User not enrolled in batch"
      };
    });
    
    res.status(200).json({
      status: 200,
      message: "Batch file access analysis completed",
      data: {
        course: {
          id: course._id,
          title: course.title,
          type: course.courseType
        },
        user: userInfo,
        batchAccessRule: "Files are UNLOCKED by default unless admin manually locks them",
        totalFiles: rootFolder.files.length,
        files: fileAccessInfo,
        summary: {
          totalFiles: rootFolder.files.length,
          manuallyLocked: fileAccessInfo.filter(f => f.wasManuallyLocked).length,
          userCanAccess: fileAccessInfo.filter(f => f.userCanAccess).length
        }
      }
    });
    
  } catch (error) {
    console.error("❌ Error in checkBatchFileAccess:", error);
    res.status(500).json({
      status: 500,
      message: "Server error while checking batch file access",
      data: error.message,
    });
  }
};

// Add Free Class to Folder
exports.addFreeClassToFolder = async (req, res) => {
  try {
    const { folderId } = req.params;
    const { name, url, description, type } = req.body;

    console.log(`🔍 [DEBUG] Adding free class to folder ${folderId}:`, { name, url, type });

    // Validate required fields
    if (!name || !url) {
      return res.status(400).json({ 
        message: "Name and URL are required",
        error: "Missing required fields" 
      });
    }

    // Validate YouTube URL
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    if (!youtubeRegex.test(url)) {
      return res.status(400).json({ 
        message: "Invalid YouTube URL",
        error: "Please provide a valid YouTube URL" 
      });
    }

    // Find the folder
    const Folder = require("../models/folderModel");
    const File = require("../models/fileModel");
    const mongoose = require("mongoose");
    
    const folder = await Folder.findById(folderId);
    if (!folder) {
      return res.status(404).json({ 
        message: "Folder not found",
        error: "The specified folder does not exist" 
      });
    }

    // Create a new File model instance for the free class
    const freeClassFile = new File({
      name: name.trim(),
      url: url.trim(),
      description: description ? description.trim() : "",
      type: type || "youtube", // Add type field to identify YouTube videos
      isViewable: true, // Free classes are always viewable
      isDownloadable: false, // YouTube videos are not downloadable
    });

    // Save the file first
    const savedFile = await freeClassFile.save();

    // Add the file ID to folder's files array
    if (!folder.files) {
      folder.files = [];
    }
    folder.files.push(savedFile._id);

    // Save the folder
    await folder.save();

    // Re-fetch the folder with populated data to ensure consistency
    const updatedFolder = await Folder.findById(folderId)
      .populate("folders")
      .populate("files");

    console.log(`✅ [DEBUG] Free class added successfully to folder ${folderId}`);
    console.log(`✅ [DEBUG] Updated folder now has ${updatedFolder.files.length} files`);

    res.status(201).json({ 
      message: "Free class added successfully",
      freeClass: savedFile,
      folder: updatedFolder
    });

  } catch (error) {
    console.error("❌ Error adding free class to folder:", error);
    res.status(500).json({ 
      message: "Failed to add free class",
      error: error.message 
    });
  }
};

// ============================================================================
// 🔧 ASSIGNMENT FOLDER UTILITIES

exports.debugAssignmentFolders = async (req, res) => {
  try {
    const Folder = require("../models/folderModel");
    
    console.log('🔍 [DEBUG] Checking assignment folders...');
    
    // Find all folders with name "Assignments"
    const assignmentFolders = await Folder.find({ name: "Assignments" });
    
    console.log(`🔍 [DEBUG] Found ${assignmentFolders.length} assignment folders`);
    
    const folderInfo = assignmentFolders.map(folder => ({
      id: folder._id,
      name: folder.name,
      parentFolderId: folder.parentFolderId,
      parentFolder: folder.parentFolder, // Old field
      isSystemFolder: folder.isSystemFolder,
      folderType: folder.folderType,
      hasParentFolder: !!folder.parentFolder,
      hasParentFolderId: !!folder.parentFolderId
    }));
    
    // Also check student folders
    const studentFolders = await Folder.find({
      name: { $regex: /_/ }, // Names with underscore
    }).limit(5); // Limit to first 5 for debugging
    
    const studentInfo = studentFolders.map(folder => ({
      id: folder._id,
      name: folder.name,
      parentFolderId: folder.parentFolderId,
      parentFolder: folder.parentFolder,
      isSystemFolder: folder.isSystemFolder,
      folderType: folder.folderType
    }));
    
    res.status(200).json({
      status: 200,
      message: 'Assignment folder debug info',
      data: {
        assignmentFolders: folderInfo,
        studentFolders: studentInfo,
        totalAssignmentFolders: assignmentFolders.length,
        totalStudentFolders: studentFolders.length
      }
    });
    
  } catch (error) {
    console.error('❌ [ERROR] Debug assignment folders failed:', error);
    res.status(500).json({
      status: 500,
      message: 'Debug assignment folders failed',
      error: error.message
    });
  }
};

exports.fixAssignmentFolders = async (req, res) => {
  try {
    console.log('🔧 [DEBUG] Starting assignment folder fix...');
    console.log('🔧 [DEBUG] User:', req.user ? `${req.user.firstName} (${req.user.userType})` : 'No user');
    
    // Find all folders with name "Assignments" that have wrong field names
    const assignmentFolders = await Folder.find({ 
      name: "Assignments",
      $or: [
        { parentFolder: { $exists: true } }, // Old field name
        { isSystemFolder: { $ne: true } },   // Missing system flag
        { folderType: { $ne: 'assignments' } } // Wrong folder type
      ]
    });
    
    console.log(`🔧 [DEBUG] Found ${assignmentFolders.length} assignment folders to fix`);
    
    let fixedCount = 0;
    
    for (const folder of assignmentFolders) {
      let needsUpdate = false;
      const updateData = {};
      
      // Fix parentFolder -> parentFolderId
      if (folder.parentFolder && !folder.parentFolderId) {
        updateData.parentFolderId = folder.parentFolder;
        updateData.$unset = { parentFolder: 1 };
        needsUpdate = true;
        console.log(`🔧 [DEBUG] Fixing parentFolder for folder ${folder._id}`);
      }
      
      // Add system folder flags
      if (!folder.isSystemFolder) {
        updateData.isSystemFolder = true;
        needsUpdate = true;
        console.log(`🔧 [DEBUG] Adding isSystemFolder flag for folder ${folder._id}`);
      }
      
      if (folder.folderType !== 'assignments') {
        updateData.folderType = 'assignments';
        needsUpdate = true;
        console.log(`🔧 [DEBUG] Setting folderType to assignments for folder ${folder._id}`);
      }
      
      if (needsUpdate) {
        await Folder.findByIdAndUpdate(folder._id, updateData);
        fixedCount++;
        console.log(`✅ [DEBUG] Fixed assignment folder ${folder._id}`);
      }
    }
    
    // Fix student assignment folders too
    const studentFolders = await Folder.find({
      name: { $regex: /_/ }, // Names with underscore (student folders)
      $or: [
        { parentFolder: { $exists: true } },
        { isSystemFolder: { $ne: true } },
        { folderType: { $ne: 'student_assignments' } }
      ]
    });
    
    console.log(`🔧 [DEBUG] Found ${studentFolders.length} student assignment folders to fix`);
    
    for (const folder of studentFolders) {
      // Check if this is actually a student assignment folder by checking its parent
      const parentFolder = await Folder.findById(folder.parentFolderId || folder.parentFolder);
      if (parentFolder && parentFolder.name === 'Assignments') {
        let needsUpdate = false;
        const updateData = {};
        
        // Fix parentFolder -> parentFolderId
        if (folder.parentFolder && !folder.parentFolderId) {
          updateData.parentFolderId = folder.parentFolder;
          updateData.$unset = { parentFolder: 1 };
          needsUpdate = true;
        }
        
        // Add system folder flags
        if (!folder.isSystemFolder) {
          updateData.isSystemFolder = true;
          needsUpdate = true;
        }
        
        if (folder.folderType !== 'student_assignments') {
          updateData.folderType = 'student_assignments';
          needsUpdate = true;
        }
        
        if (needsUpdate) {
          await Folder.findByIdAndUpdate(folder._id, updateData);
          fixedCount++;
          console.log(`✅ [DEBUG] Fixed student assignment folder ${folder._id}`);
        }
      }
    }
    
    console.log(`🎉 [DEBUG] Assignment folder fix complete. Fixed ${fixedCount} folders.`);
    
    res.status(200).json({
      status: 200,
      message: `Assignment folder fix complete. Fixed ${fixedCount} folders.`,
      data: { fixedCount }
    });
    
  } catch (error) {
    console.error('❌ [ERROR] Assignment folder fix failed:', error);
    res.status(500).json({
      status: 500,
      message: 'Assignment folder fix failed',
      error: error.message
    });
  }
};

// 📝 ASSIGNMENT SUBMISSION FUNCTIONS
// ============================================================================

// Get all assignment submissions for admin
exports.getAllAssignmentSubmissions = async (req, res) => {
  try {
    const AssignmentSubmission = require("../models/assignmentSubmissionModel");
    
    console.log('🔍 [DEBUG] Fetching all assignment submissions for admin');
    
    const submissions = await AssignmentSubmission.find()
      .populate('student', 'firstName lastName email phone')
      .populate('courseRootFolder', 'name')
      .sort({ createdAt: -1 });
    
    console.log(`✅ [DEBUG] Found ${submissions.length} assignment submissions`);
    
    res.status(200).json({
      status: 200,
      message: "Assignment submissions retrieved successfully",
      data: submissions
    });
    
  } catch (error) {
    console.error("❌ Error fetching assignment submissions:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch assignment submissions",
      error: error.message
    });
  }
};

// Get assignment submissions for a specific user
exports.getUserAssignmentSubmissions = async (req, res) => {
  try {
    const AssignmentSubmission = require("../models/assignmentSubmissionModel");
    const { userId } = req.params;
    
    console.log(`🔍 [DEBUG] Fetching assignment submissions for user: ${userId}`);
    
    const submissions = await AssignmentSubmission.find({ student: userId })
      .populate('courseRootFolder', 'name')
      .populate('student', 'firstName lastName phone')
      .sort({ createdAt: -1 });
    
    console.log(`✅ [DEBUG] Found ${submissions.length} submissions for user ${userId}`);
    
    res.status(200).json({
      status: 200,
      message: "User assignment submissions retrieved successfully",
      data: submissions
    });
    
  } catch (error) {
    console.error("❌ Error fetching user assignment submissions:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch user assignment submissions",
      error: error.message
    });
  }
};

// Update assignment submission review
exports.updateAssignmentReview = async (req, res) => {
  try {
    const AssignmentSubmission = require("../models/assignmentSubmissionModel");
    const { submissionId } = req.params;
    const { comments, grade, status } = req.body;
    const adminId = req.user._id;
    
    console.log(`🔍 [DEBUG] Updating assignment review for submission: ${submissionId}`);
    
    const submission = await AssignmentSubmission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({
        status: 404,
        message: "Assignment submission not found"
      });
    }
    
    // Update review information
    submission.adminReview = {
      reviewedBy: adminId,
      reviewDate: new Date(),
      comments: comments || submission.adminReview.comments,
      grade: grade || submission.adminReview.grade
    };
    
    if (status) {
      submission.submissionStatus = status;
    }
    
    await submission.save();
    
    // Populate the updated submission
    const updatedSubmission = await AssignmentSubmission.findById(submissionId)
      .populate('student', 'firstName lastName email')
      .populate('courseRootFolder', 'name')
      .populate('adminReview.reviewedBy', 'firstName lastName');
    
    console.log(`✅ [DEBUG] Assignment review updated successfully`);
    
    res.status(200).json({
      status: 200,
      message: "Assignment review updated successfully",
      data: updatedSubmission
    });
    
  } catch (error) {
    console.error("❌ Error updating assignment review:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to update assignment review",
      error: error.message
    });
  }
};

// 🔧 TEMPORARY: Fix quiz folder visibility for existing folders
exports.fixFolderVisibility = async (req, res) => {
  try {
    console.log('🔧 [ADMIN] Fixing quiz folder visibility...');
    
    // Only allow admin users
    if (req.user.userType !== 'ADMIN') {
      return res.status(403).json({
        status: 403,
        message: 'Access denied. Admin privileges required.'
      });
    }
    
    const QuizFolder = require('../models/quizFolder');
    
    // Find all folders that are currently invisible
    const invisibleFolders = await QuizFolder.find({ isVisible: false });
    
    console.log(`📊 Found ${invisibleFolders.length} invisible folders`);
    
    if (invisibleFolders.length === 0) {
      return res.status(200).json({
        status: 200,
        message: 'All folders are already visible!',
        data: {
          foldersUpdated: 0,
          totalFolders: await QuizFolder.countDocuments()
        }
      });
    }
    
    // Show which folders will be updated
    console.log('📁 Folders to be made visible:');
    invisibleFolders.forEach((folder, index) => {
      console.log(`   ${index + 1}. "${folder.name}" (ID: ${folder._id})`);
    });
    
    // Update all invisible folders to be visible
    const result = await QuizFolder.updateMany(
      { isVisible: false },
      { $set: { isVisible: true } }
    );
    
    console.log(`✅ SUCCESS: Updated ${result.modifiedCount} folders to be visible`);
    
    // Verify the update
    const stillInvisible = await QuizFolder.find({ isVisible: false });
    const totalFolders = await QuizFolder.countDocuments();
    
    res.status(200).json({
      status: 200,
      message: `Successfully updated ${result.modifiedCount} folders to be visible`,
      data: {
        foldersUpdated: result.modifiedCount,
        remainingInvisible: stillInvisible.length,
        totalFolders: totalFolders,
        updatedFolders: invisibleFolders.map(f => ({ id: f._id, name: f.name }))
      }
    });
    
  } catch (error) {
    console.error('❌ Error fixing folder visibility:', error);
    res.status(500).json({
      status: 500,
      message: 'Failed to fix folder visibility',
      error: error.message
    });
  }
};

// 🔧 ADMIN: Cleanup incomplete/expired scorecards
exports.cleanupIncompleteScorecards = async (req, res) => {
  try {
    console.log('🧹 [ADMIN] Starting cleanup of incomplete scorecards...');
    
    // Check if user is admin
    if (req.user.userType !== 'ADMIN') {
      return res.status(403).json({
        status: 403,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const Scorecard = require('../models/scorecardModel');
    const { finishQuizHelper } = require('../utils/scoreUtils');
    
    const currentTime = new Date();
    
    // Find all incomplete scorecards
    const incompleteScorecards = await Scorecard.find({ 
      completed: false 
    }).populate('quizId', 'quizName').populate('userId', 'name email');
    
    if (incompleteScorecards.length === 0) {
      return res.status(200).json({
        status: 200,
        message: 'No incomplete scorecards found.',
        processed: 0
      });
    }

    console.log(`📊 [ADMIN] Found ${incompleteScorecards.length} incomplete scorecards`);
    
    let expiredCount = 0;
    let activeCount = 0;
    let processedCount = 0;
    let errorCount = 0;
    const processedScorecards = [];

    for (const scorecard of incompleteScorecards) {
      try {
        const isExpired = scorecard.expectedEndTime && currentTime > scorecard.expectedEndTime;
        
        if (isExpired) {
          console.log(`🕐 [ADMIN] Auto-submitting expired scorecard ${scorecard._id} (User: ${scorecard.userId?.name || 'Unknown'})`);
          await finishQuizHelper(scorecard);
          expiredCount++;
          processedCount++;
          
          processedScorecards.push({
            scorecardId: scorecard._id,
            userId: scorecard.userId?._id,
            userName: scorecard.userId?.name || 'Unknown',
            quizName: scorecard.quizId?.quizName || 'Unknown',
            action: 'auto-submitted',
            expiredBy: Math.ceil((currentTime - scorecard.expectedEndTime) / (1000 * 60)) + ' minutes'
          });
        } else {
          activeCount++;
          const timeRemaining = scorecard.expectedEndTime ? 
            Math.max(0, Math.ceil((scorecard.expectedEndTime - currentTime) / (1000 * 60))) : 
            'Unknown';
          
          processedScorecards.push({
            scorecardId: scorecard._id,
            userId: scorecard.userId?._id,
            userName: scorecard.userId?.name || 'Unknown',
            quizName: scorecard.quizId?.quizName || 'Unknown',
            action: 'still-active',
            timeRemaining: timeRemaining + ' minutes'
          });
        }
      } catch (error) {
        console.error(`❌ [ADMIN] Error processing scorecard ${scorecard._id}:`, error);
        errorCount++;
      }
    }

    console.log(`✅ [ADMIN] Cleanup completed: ${expiredCount} expired, ${activeCount} active, ${errorCount} errors`);

    return res.status(200).json({
      status: 200,
      message: 'Scorecard cleanup completed',
      summary: {
        totalFound: incompleteScorecards.length,
        expiredAndSubmitted: expiredCount,
        stillActive: activeCount,
        errors: errorCount,
        processed: processedCount
      },
      details: processedScorecards
    });

  } catch (error) {
    console.error('❌ [ADMIN] Error during scorecard cleanup:', error);
    return res.status(500).json({
      status: 500,
      message: 'Internal server error during scorecard cleanup',
      error: error.message
    });
  }
};
