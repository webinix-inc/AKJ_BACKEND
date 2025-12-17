// ============================================================================
// 👤 USER MANAGEMENT BUSINESS LOGIC SERVICE
// ============================================================================
// 
// This service handles all user-related business logic that was
// previously duplicated across multiple controllers. It maintains the same
// core logic and algorithms while providing better separation of concerns.
//
// Controllers affected:
// - adminController.js (Admin user management)
// - userController.js (User registration/profile)
// - teacherController.js (Teacher registration)
// - courseController.js (Course access management)
// - authController.js (Authentication operations)
//
// Functions consolidated:
// - User registration with validation and OTP
// - Password hashing and authentication
// - Referral code generation and management
// - Course access management (assign/revoke)
// - User profile updates with image upload
// - Welcome message automation
// - User subscription management
// - Merithub integration for live classes
//
// ============================================================================

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const authConfig = require("../configs/auth.config");
const User = require("../models/userModel");
const Course = require("../models/courseModel");
const Message = require("../models/messageModel");
const Notification = require("../models/notificationModel");
const { addUser, updateUser } = require("../configs/merithub.config");

// ============================================================================
// 🔧 UTILITY FUNCTIONS
// ============================================================================
const generateReferralCode = async () => {
  var digits = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 9; i++) {
    code += digits[Math.floor(Math.random() * 36)];
  }
  return code;
};

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

const generateJWT = (userId, userType = "USER") => {
  return jwt.sign(
    { id: userId, userType },
    authConfig.secret,
    { expiresIn: authConfig.jwtExpiration }
  );
};

// ============================================================================
// 👤 USER REGISTRATION BUSINESS LOGIC
// ============================================================================
const registerUserLogic = async (userData, userType = "USER") => {
  try {
    const {
      email,
      mobileNumber,
      password,
      confirmPassword,
      firstName,
      lastName,
      ...otherData
    } = userData;

    console.log("👤 Registering user with user service");

    // Validate required fields
    if (!email || !mobileNumber || !password || !firstName) {
      throw new Error("Email, mobile number, password, and first name are required");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error("Invalid email format");
    }

    // Validate phone number format
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(mobileNumber)) {
      throw new Error("Invalid phone number format. Must be 10 digits");
    }

    // Validate password match
    if (password !== confirmPassword) {
      throw new Error("Password and confirm password do not match");
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { mobileNumber }]
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw new Error("Email is already registered");
      }
      if (existingUser.mobileNumber === mobileNumber) {
        throw new Error("Mobile number is already registered");
      }
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Generate referral code
    const referralCode = await generateReferralCode();

    // Create user object
    const newUser = new User({
      email,
      mobileNumber,
      password: hashedPassword,
      firstName,
      lastName,
      referralCode,
      userType,
      isActive: true,
      ...otherData
    });

    // Save user to database
    await newUser.save();

    // Integrate with Merithub if needed
    if (userType !== "ADMIN") {
      try {
        await integrateMerithubUserLogic(newUser._id, {
          firstName,
          lastName,
          email,
          mobileNumber
        });
      } catch (merithubError) {
        console.warn("⚠️ Merithub integration failed:", merithubError.message);
        // Don't fail registration if Merithub fails
      }
    }

    // Send welcome message
    await sendWelcomeMessageLogic(newUser._id, firstName, true);

    // Generate JWT token
    const token = generateJWT(newUser._id, userType);

    console.log("✅ User registered successfully");
    return {
      user: {
        _id: newUser._id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        mobileNumber: newUser.mobileNumber,
        userType: newUser.userType,
        referralCode: newUser.referralCode
      },
      token,
      message: "User registered successfully"
    };
  } catch (error) {
    console.error("❌ Error in registerUserLogic:", error);
    throw error;
  }
};

// ============================================================================
// 🔐 USER AUTHENTICATION BUSINESS LOGIC
// ============================================================================
const authenticateUserLogic = async (credentials) => {
  try {
    const { email, mobileNumber, password } = credentials;

    console.log("👤 Authenticating user with user service");

    // Validate input
    if (!password) {
      throw new Error("Password is required");
    }

    if (!email && !mobileNumber) {
      throw new Error("Email or mobile number is required");
    }

    // Build query
    let query = {};
    if (email) {
      query.email = email;
    } else if (mobileNumber) {
      query.mobileNumber = mobileNumber;
    }

    // Find user
    const user = await User.findOne(query);
    if (!user) {
      throw new Error("Invalid credentials");
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error("Account is deactivated. Please contact support");
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      throw new Error("Invalid credentials");
    }

    // Generate JWT token
    const token = generateJWT(user._id, user.userType);

    // Send welcome back message for returning users
    await sendWelcomeMessageLogic(user._id, user.firstName, false);

    console.log("✅ User authenticated successfully");
    return {
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        mobileNumber: user.mobileNumber,
        userType: user.userType,
        referralCode: user.referralCode,
        purchasedCourses: user.purchasedCourses
      },
      token,
      message: "Login successful"
    };
  } catch (error) {
    console.error("❌ Error in authenticateUserLogic:", error);
    throw error;
  }
};

// ============================================================================
// 📝 USER PROFILE UPDATE BUSINESS LOGIC
// ============================================================================
const updateUserProfileLogic = async (userId, updateData, file) => {
  try {
    console.log("👤 Updating user profile with user service");

    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Prepare update fields
    let updatedFields = { ...updateData };

    // Handle file upload if provided
    if (file) {
      updatedFields.image = file.path || file.location;
    }

    // Hash new password if provided
    if (updateData.password) {
      if (updateData.confirmPassword && updateData.password !== updateData.confirmPassword) {
        throw new Error("Password and confirm password do not match");
      }
      updatedFields.password = await hashPassword(updateData.password);
      delete updatedFields.confirmPassword;
    }

    // Validate email if being updated
    if (updateData.email && updateData.email !== user.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(updateData.email)) {
        throw new Error("Invalid email format");
      }

      // Check if email is already taken
      const existingUser = await User.findOne({ 
        email: updateData.email,
        _id: { $ne: userId }
      });
      if (existingUser) {
        throw new Error("Email is already registered");
      }
    }

    // Validate phone number if being updated
    if (updateData.mobileNumber && updateData.mobileNumber !== user.mobileNumber) {
      const phoneRegex = /^[0-9]{10}$/;
      if (!phoneRegex.test(updateData.mobileNumber)) {
        throw new Error("Invalid phone number format");
      }

      // Check if phone is already taken
      const existingUser = await User.findOne({ 
        mobileNumber: updateData.mobileNumber,
        _id: { $ne: userId }
      });
      if (existingUser) {
        throw new Error("Mobile number is already registered");
      }
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updatedFields,
      { new: true, select: '-password' }
    );

    // Update Merithub if profile data changed
    if (updateData.firstName || updateData.lastName || updateData.email || updateData.mobileNumber) {
      try {
        await updateMerithubUserLogic(userId, {
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          email: updatedUser.email,
          mobileNumber: updatedUser.mobileNumber
        });
      } catch (merithubError) {
        console.warn("⚠️ Merithub update failed:", merithubError.message);
      }
    }

    console.log("✅ User profile updated successfully");
    return {
      user: updatedUser,
      message: "Profile updated successfully"
    };
  } catch (error) {
    console.error("❌ Error in updateUserProfileLogic:", error);
    throw error;
  }
};

// ============================================================================
// 🎓 COURSE ACCESS MANAGEMENT BUSINESS LOGIC
// ============================================================================
const manageCourseAccessLogic = async (adminUserId, accessData) => {
  try {
    const { userIds, courseId, action, expiresIn } = accessData;

    console.log("👤 Managing course access with user service");

    // Validate inputs
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      throw new Error("User IDs array is required");
    }

    if (!courseId) {
      throw new Error("Course ID is required");
    }

    if (!["ASSIGN", "REVOKE"].includes(action)) {
      throw new Error("Invalid action. Use 'ASSIGN' or 'REVOKE'");
    }

    if (action === "ASSIGN" && expiresIn && (typeof expiresIn !== "number" || expiresIn <= 0)) {
      throw new Error("Invalid expiresIn value. It must be a positive number of days");
    }

    // Validate course exists
    const course = await Course.findById(courseId);
    if (!course) {
      throw new Error("Course not found");
    }

    const results = { successful: [], failed: [] };

    // Process each user
    for (const userId of userIds) {
      try {
        const user = await User.findById(userId);

        if (!user) {
          results.failed.push({ userId, reason: "User not found" });
          continue;
        }

        if (action === "ASSIGN") {
          const hasAccess = user.purchasedCourses.some(pc => pc.course.toString() === courseId);

          if (hasAccess) {
            results.failed.push({ userId, reason: "User already has access to this course" });
          } else {
            const expirationDate = expiresIn ? new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000) : null;

            user.purchasedCourses.push({
              course: courseId,
              assignedByAdmin: {
                isAssigned: true,
                assignedAt: new Date(),
                assignedBy: adminUserId
              },
              expiresAt: expirationDate
            });

            await user.save();
            results.successful.push({ userId, expiresAt: expirationDate });
          }
        } else { // REVOKE
          const courseIndex = user.purchasedCourses.findIndex(pc => pc.course.toString() === courseId);

          if (courseIndex === -1) {
            results.failed.push({ userId, reason: "User doesn't have access to this course" });
          } else {
            user.purchasedCourses.splice(courseIndex, 1);
            await user.save();
            results.successful.push({ userId });
          }
        }
      } catch (userError) {
        results.failed.push({ userId, reason: userError.message });
      }
    }

    console.log("✅ Course access management completed");
    return {
      results,
      message: `Course access ${action.toLowerCase()}ed for ${results.successful.length} users`
    };
  } catch (error) {
    console.error("❌ Error in manageCourseAccessLogic:", error);
    throw error;
  }
};

// ============================================================================
// 💬 WELCOME MESSAGE BUSINESS LOGIC
// ============================================================================
const sendWelcomeMessageLogic = async (userId, userName = "Student", isNewUser = false) => {
  try {
    console.log("👤 Sending welcome message with user service");

    // Find admin user to send welcome message from
    const adminUser = await User.findOne({ userType: "ADMIN" }).select("_id firstName lastName");
    if (!adminUser) {
      console.log("No admin user found for welcome message");
      return;
    }

    // Check if welcome message already exists for this user
    const existingWelcome = await Message.findOne({
      sender: adminUser._id,
      receiver: userId,
      isBroadcast: false,
      content: { $regex: /welcome|Welcome/i }
    });

    // Only send welcome message if it doesn't exist
    if (!existingWelcome) {
      const welcomeContent = isNewUser 
        ? `🎉 Welcome to AKJ Academy, ${userName}! 

We're excited to have you join our learning community! Here's what you can do:

📚 Browse our courses and start learning
📝 Take tests to evaluate your progress  
📹 Join live classes with expert teachers
💬 Use this chat for any questions or support

Our team is here to help you succeed. Feel free to ask anything!

Best regards,
AKJAcademyademy Team`
        : `👋 Welcome back, ${userName}! 

Great to see you again at AKJAcademyademy. 

Need any help with your courses or have questions? Just message us here!

Happy learning! 🚀`;

      const welcomeMessage = new Message({
        sender: adminUser._id,  // FROM admin
        receiver: userId,      // TO user
        content: welcomeContent,
        attachments: [],
        isRead: false,
        isBroadcast: false,
        status: "sent",
        timestamp: new Date(),
      });

      await welcomeMessage.save();
      console.log(`✅ Welcome message created: Admin ${adminUser._id} → User ${userId}`);
    }
  } catch (error) {
    console.error("❌ Error in sendWelcomeMessageLogic:", error);
    // Don't throw error to avoid breaking user registration/login
  }
};

// ============================================================================
// 🔗 MERITHUB INTEGRATION BUSINESS LOGIC
// ============================================================================
const integrateMerithubUserLogic = async (userId, userData) => {
  try {
    console.log("👤 Integrating user with Merithub");

    const { firstName, lastName, email, mobileNumber } = userData;

    // Add user to Merithub
    const merithubResponse = await addUser({
      name: `${firstName} ${lastName}`,
      email,
      phone: mobileNumber,
      externalId: userId.toString()
    });

    if (merithubResponse && merithubResponse.userId) {
      // Update user with Merithub ID
      await User.findByIdAndUpdate(userId, {
        merithubUserId: merithubResponse.userId
      });

      console.log("✅ User integrated with Merithub successfully");
      return merithubResponse;
    } else {
      throw new Error("Failed to get Merithub user ID");
    }
  } catch (error) {
    console.error("❌ Error in integrateMerithubUserLogic:", error);
    throw error;
  }
};

const updateMerithubUserLogic = async (userId, userData) => {
  try {
    console.log("👤 Updating user in Merithub");

    const user = await User.findById(userId);
    if (!user || !user.merithubUserId) {
      throw new Error("User not found or not integrated with Merithub");
    }

    const { firstName, lastName, email, mobileNumber } = userData;

    // Update user in Merithub
    const merithubResponse = await updateUser(user.merithubUserId, {
      name: `${firstName} ${lastName}`,
      email,
      phone: mobileNumber
    });

    console.log("✅ User updated in Merithub successfully");
    return merithubResponse;
  } catch (error) {
    console.error("❌ Error in updateMerithubUserLogic:", error);
    throw error;
  }
};

// ============================================================================
// 📊 USER STATISTICS AND ANALYTICS BUSINESS LOGIC
// ============================================================================
const getUserStatisticsLogic = async (userId) => {
  try {
    console.log("👤 Getting user statistics with user service");

    const user = await User.findById(userId)
      .populate('purchasedCourses.course', 'courseName price')
      .select('-password');

    if (!user) {
      throw new Error("User not found");
    }

    const statistics = {
      totalCourses: user.purchasedCourses.length,
      activeCourses: user.purchasedCourses.filter(pc => !pc.expiresAt || pc.expiresAt > new Date()).length,
      expiredCourses: user.purchasedCourses.filter(pc => pc.expiresAt && pc.expiresAt <= new Date()).length,
      totalSpent: user.purchasedCourses.reduce((total, pc) => total + (pc.amountPaid || 0), 0),
      registrationDate: user.createdAt,
      lastLogin: user.lastLogin,
      referralCode: user.referralCode
    };

    console.log("✅ User statistics retrieved successfully");
    return statistics;
  } catch (error) {
    console.error("❌ Error in getUserStatisticsLogic:", error);
    throw error;
  }
};

// ============================================================================
// 🔍 USER SEARCH AND FILTERING BUSINESS LOGIC
// ============================================================================
const searchUsersLogic = async (searchCriteria, options = {}) => {
  try {
    const { query, userType, isActive, page = 1, limit = 10 } = { ...searchCriteria, ...options };

    console.log("👤 Searching users with user service");

    // Build search query
    let searchQuery = {};

    if (query) {
      searchQuery.$or = [
        { firstName: { $regex: query, $options: "i" } },
        { lastName: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
        { mobileNumber: { $regex: query, $options: "i" } }
      ];
    }

    if (userType) {
      searchQuery.userType = userType;
    }

    if (isActive !== undefined) {
      searchQuery.isActive = isActive;
    }

    // Execute search with pagination
    const users = await User.find(searchQuery)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const totalUsers = await User.countDocuments(searchQuery);

    console.log("✅ User search completed successfully");
    return {
      users,
      totalUsers,
      currentPage: page,
      totalPages: Math.ceil(totalUsers / limit),
      hasMore: page < Math.ceil(totalUsers / limit)
    };
  } catch (error) {
    console.error("❌ Error in searchUsersLogic:", error);
    throw error;
  }
};

// ============================================================================
// 📤 EXPORTS
// ============================================================================
module.exports = {
  registerUserLogic,
  authenticateUserLogic,
  updateUserProfileLogic,
  manageCourseAccessLogic,
  sendWelcomeMessageLogic,
  integrateMerithubUserLogic,
  updateMerithubUserLogic,
  getUserStatisticsLogic,
  searchUsersLogic,
  
  // Utility functions
  generateReferralCode,
  generateOTP,
  hashPassword,
  comparePassword,
  generateJWT,
};
