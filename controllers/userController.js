const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const authConfig = require("../configs/auth.config");
// var newOTP = require("otp-generators"); // Replaced with generateOTP function
const User = require("../models/userModel");
const Banner = require("../models/bannerModel");
const Subscription = require("../models/subscriptionModel");
const UserSubscription = require("../models/userSubscriptionModel");
const Notification = require("../models/notificationModel");
const Message = require("../models/messageModel");
const Schedule = require("../models/scheduleModel");
const Category = require("../models/course/courseCategory");
const Product = require("../models/ProductModel");
const Cart = require("../models/cartModel");
const Address = require("../models/addressModel");
const Order = require("../models/orderModel");
const Course = require("../models/courseModel");
const NoticeBoard = require("../models/noticeBoardModel");
const Attendance = require("../models/attendanceModel");
const Wishlist = require("../models/wishlistModel");
const Syllabus = require("../models/syllabusModel");
const TestSeries = require("../models/testSeriesModel");
const VideoLecture = require("../models/videoLectureModel");
const ExamSchedule = require("../models/examScheduleModel");
const Recording = require("../models/recordingModel");
const SurveyForm = require("../models/surveyModel");
const FollowUs = require("../models/followusModel");
const BehaviorNote = require("../models/behaviourModel");
const { addUser, updateUser } = require("../configs/merithub.config");
// const nodemailer = require('nodemailer');
const { redisClient } = require("../configs/redis");
const { logger } = require("../utils/logger");

const reffralCode = async () => {
  var digits = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let OTP = "";
  for (let i = 0; i < 9; i++) {
    OTP += digits[Math.floor(Math.random() * 36)];
  }
  return OTP;
};

// Function to send automatic welcome message when user logs in
const sendWelcomeMessage = async (userId, userName = "Student", isNewUser = false) => {
  try {
    // Find admin user to send welcome message from
    const adminUser = await User.findOne({ userType: "ADMIN" }).select("_id firstName lastName");
    if (!adminUser) {
      console.log("No admin user found for welcome message");
      return;
    }

    // Check if welcome message already exists for this user (from admin to user)
    const existingWelcome = await Message.findOne({
      sender: adminUser._id,
      receiver: userId,
      isBroadcast: false,
      content: { $regex: /welcome|Welcome/i }
    });

    // Only send welcome message if it doesn't exist
    if (!existingWelcome) {
      const welcomeContent = isNewUser 
        ? `🎉 Welcome to Wakade Classes, ${userName}! 

We're excited to have you join our learning community! Here's what you can do:

📚 Browse our courses and start learning
📝 Take tests to evaluate your progress  
📹 Join live classes with expert teachers
💬 Use this chat for any questions or support

Our team is here to help you succeed. Feel free to ask anything!

Best regards,
Wakade Classes Team`
        : `👋 Welcome back, ${userName}! 

Great to see you again at Wakade Classes. 

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
      
      // Emit socket event for real-time delivery if socket is available
      if (global.io) {
        global.io.to(userId.toString()).emit("message", {
          _id: welcomeMessage._id,
          content: welcomeMessage.content,
          sender: adminUser._id,
          receiver: userId,
          createdAt: welcomeMessage.createdAt,
          attachments: [],
          isBroadcast: false
        });
        console.log(`🔔 Welcome message emitted to user ${userId}`);
      }

      console.log(`📨 Welcome message sent from admin to user ${userId}`);
    } else {
      console.log(`⚠️ Welcome message already exists for user ${userId}`);
    }
  } catch (error) {
    console.error("❌ Error sending welcome message:", error);
  }
};

const generateTrackingNumber = () => {
  const date = new Date();
  const randomId = Math.floor(Math.random() * 10000);
  const trackingNumber = `TN-${date.getFullYear()}${
    date.getMonth() + 1
  }${date.getDate()}-${randomId}`;
  return trackingNumber;
};

//for future
// const transporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS
//   }
// });

// const sendEmailOTP = async (email, otp) => {
//   const mailOptions = {
//     from: process.env.EMAIL_USER,
//     to: email,
//     subject: 'Your Verification OTP',
//     text: `Your OTP for verification is: ${otp}. This OTP will expire in 5 minutes.`
//   };

//   return transporter.sendMail(mailOptions);
// };

// const sendSMSOTP = async (phone, otp) => {
//   // will have to implement SMS sending logic here
//   console.log(`SMS OTP sending placeholder: ${phone} - ${otp}`);
//   return Promise.resolve(); //  response
// };

// const sendResetEmail = async (email, token) => {
//   const mailOptions = {
//     from: process.env.EMAIL_USER,
//     to: email,
//     subject: 'Password Reset Request',
//     text: `Your password reset token is: ${token}. This token will expire in 1 hour.`
//   };

//   return transporter.sendMail(mailOptions);
// };

// const sendResetSMS = async (phone, token) => {
//   //logic here
//   console.log(`Reset SMS sending placeholder: ${phone} - ${token}`);
//   return Promise.resolve();
// };

const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

exports.signup = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      email,       
    } = req.body;

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

    // Use the consistent generateOTP function
    let otp = generateOTP();
    // let otpExpiration = new Date(Date.now() + 5 * 60 * 1000);
    let otpExpiration = new Date(Date.now() + 30 * 1000);
    let accountVerification = false;

    const user = await User.findOne({
      phone: phone,
      email: email,
      userType: "USER",
    });
    if (user) {
      // 🚀 LOG REGISTRATION ATTEMPT - ALREADY EXISTS
      logger.userActivity(
        user._id,
        `${user.firstName} ${user.lastName}`,
        'REGISTRATION_ATTEMPT',
        `Failed - User already exists, Email: ${email}, Phone: ${phone}, IP: ${req.ip}`
      );
      return res
        .status(400)
        .send({ status: 400, message: "User already exists" });
    }
    const newUser = new User({
      firstName,
      lastName,
      phone,
      email,
      otp,
      otpExpiration,
      accountVerification,
      userType: "USER",
    });

    await newUser.save();

    // 🚀 LOG USER REGISTRATION SUCCESS
    logger.userActivity(
      newUser._id,
      `${newUser.firstName} ${newUser.lastName}`,
      'REGISTRATION',
      `Email: ${newUser.email}, Phone: ${newUser.phone}, IP: ${req.ip}`
    );

    return res.status(201).json({
      status: 201,
      message: "User created successfully",
      user: newUser,
    });
  } catch (error) {
    // 🚀 LOG USER REGISTRATION ERROR
    logger.error(error, 'USER_REGISTRATION', `Email: ${email}, Phone: ${phone}`);
    return res
      .status(500)
      .json({ status: 500, message: "Error creating user", error });
  }
};
exports.registration = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.user._id });
    if (user) {
      if (req.body.refferalCode == null || req.body.refferalCode == undefined) {
        req.body.otp = generateOTP();
        // req.body.otpExpiration = new Date(Date.now() + 5 * 60 * 1000);
        req.body.otpExpiration = new Date(Date.now() + 30 * 1000);
        req.body.accountVerification = false;
        req.body.refferalCode = await reffralCode();
        req.body.completeProfile = true;
        const userCreate = await User.findOneAndUpdate(
          { _id: user._id },
          req.body,
          { new: true }
        );
        let obj = {
          id: userCreate._id,
          completeProfile: userCreate.completeProfile,
          phone: userCreate.phone,
        };
        return res.status(200).send({
          status: 200,
          message: "Registered successfully ",
          data: obj,
        });
      } else {
        const findUser = await User.findOne({
          refferalCode: req.body.refferalCode,
        });
        if (findUser) {
          req.body.otp = generateOTP();
          // req.body.otpExpiration = new Date(Date.now() + 5 * 60 * 1000);
          req.body.otpExpiration = new Date(Date.now() + 30 * 1000);
          req.body.accountVerification = false;
          req.body.userType = "USER";
          req.body.refferalCode = await reffralCode();
          req.body.refferUserId = findUser._id;
          req.body.completeProfile = true;
          const userCreate = await User.findOneAndUpdate(
            { _id: user._id },
            req.body,
            { new: true }
          );
          if (userCreate) {
            let updateWallet = await User.findOneAndUpdate(
              { _id: findUser._id },
              { $push: { joinUser: userCreate._id } },
              { new: true }
            );
            let obj = {
              id: userCreate._id,
              completeProfile: userCreate.completeProfile,
              phone: userCreate.phone,
            };
            return res.status(200).send({
              status: 200,
              message: "Registered successfully ",
              data: obj,
            });
          }
        } else {
          return res
            .status(404)
            .send({ status: 404, message: "Invalid refferal code", data: {} });
        }
      }
    } else {
      return res.status(404).send({ status: 404, msg: "Not found" });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.socialLogin = async (req, res) => {
  try {
    const { firstName, lastName, email, phone } = req.body;
    console.log(req.body);
    const user = await User.findOne({
      $and: [{ $or: [{ email }, { phone }] }, { userType: "USER" }],
    });
    if (user) {
      // Existing user - no welcome message needed (already sent during registration)
      
      jwt.sign(
        { id: user._id, userType: user.userType },
        authConfig.secret,
        (err, token) => {
          if (err) {
            return res.status(401).send("Invalid Credentials");
          } else {
            return res.status(200).json({
              status: 200,
              msg: "Login successfully",
              userId: user._id,
              token: token,
            });
          }
        }
      );
    } else {
      let refferalCode = await reffralCode();
      const newUser = await User.create({
        firstName,
        lastName,
        phone,
        email,
        refferalCode,
        userType: "USER",
      });
      if (newUser) {
        // New user - send welcome message
        await sendWelcomeMessage(newUser._id, newUser.firstName || firstName, true);
        
        jwt.sign({ id: newUser._id }, authConfig.secret, (err, token) => {
          if (err) {
            return res.status(401).send("Invalid Credentials");
          } else {
            console.log(token);
            return res.status(200).json({
              status: 200,
              msg: "Login successfully",
              userId: newUser._id,
              token: token,
            });
          }
        });
      }
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: 500, message: "Internal server error" });
  }
};

exports.loginWithPhone = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res
        .status(400)
        .json({ status: 400, message: "Phone number is required" });
    }

    const phoneRegex = /^(\+?\d{1,3})?\d{10}$/;
    if (!phoneRegex.test(phone)) {
      return res
        .status(400)
        .json({ status: 400, message: "Invalid phone number format" });
    }

    const user = await User.findOne({
      $and: [{ $or: [{ phone: phone }] }, { userType: "USER" }],
    });

    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }

    const otp = generateOTP();
    const expirationTime = 5 * 60; // 5 minutes
    const redisKey = `otp:${user._id}`;
    await redisClient.setEx(redisKey, expirationTime, otp);

    const userObj = {
      otp: otp,
      otpExpiration: expirationTime,
      accountVerification: false,
    };

    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      userObj,
      { new: true }
    );

    const responseObj = {
      id: updatedUser._id,
      otp: updatedUser.otp,
      phone: updatedUser.phone,
      userType: user.userType,
    };

    return res.status(200).send({
      status: 200,
      message: "OTP sent successfully",
      data: responseObj,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: 500, message: "Server error" });
  }
};

exports.logoutUser = async (req, res) => {
  try {
    const { deviceType } = req.body;
    const userId = req.user._id;

    if (!deviceType || !["web", "mobile"].includes(deviceType)) {
      return res.status(400).json({
        status: 400,
        message: "Valid device type (web/mobile) is required",
      });
    }

    const updateQuery =
      deviceType === "web"
        ? { "activeTokens.webToken": null }
        : { "activeTokens.mobileToken": null };

    const user = await User.findOneAndUpdate({ _id: userId }, updateQuery, { new: true });

    // 🚀 LOG USER LOGOUT SUCCESS
    logger.userActivity(
      userId,
      user.firstName || user.email || user.phone || 'Unknown',
      'LOGOUT',
      `Device: ${deviceType}, IP: ${req.ip}`
    );

    return res.status(200).json({
      status: 200,
      message: `Successfully logged out from ${deviceType}`,
    });
  } catch (error) {
    // 🚀 LOG USER LOGOUT ERROR
    logger.error(error, 'USER_LOGOUT', `UserID: ${userId}, Device: ${deviceType}`);
    return res.status(500).json({
      status: 500,
      message: "Server error",
    });
  }
};

exports.signupWithPhone = async (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body;
    console.log(req.body);

    // Check if the phone number is provided
    if (!phone) {
      return res
        .status(400)
        .json({ status: 400, message: "Phone number is required" });
    }

    // Validate phone number format
    const phoneRegex = /^(\+?\d{1,3})?\d{10}$/;
    if (!phoneRegex.test(phone)) {
      return res
        .status(400)
        .json({ status: 400, message: "Invalid phone number format" });
    }

    // Check if the user already exists
    const existingUser = await User.findOne({
      $and: [{ phone: phone }, { userType: "USER" }],
    });

    if (existingUser) {
      return res.status(409).json({
        status: 409,
        message: "User with this phone number already exists",
      });
    }

    const expirationTime = 5 * 60; // 5 minutes //otp

    // Create a new user object
    const newUser = new User({
      phone: phone,
      firstName,
      lastName,
      // otp: otp,
      // otpExpiration: otpExpiration,
      accountVerification: false,
      userType: "USER",
      refferalCode: await reffralCode(),
      completeProfile: false,
    });

    // Save the new user to the database
    await newUser.save();

    // Send welcome message to new user
    await sendWelcomeMessage(newUser._id, newUser.firstName || "Student", true);

    // Generate OTP and set expiration
    const otp = generateOTP();

    // Store OTP in Redis with expiration
    const redisKey = `otp:${newUser._id}`;
    await redisClient.setEx(redisKey, expirationTime, otp);

    // Prepare user details for MeritHub
    // Prepare user details for MeritHub API (following MeritHub specification)
    const userFullName = `${newUser.firstName || 'Student'} ${newUser.lastName || ''}`.trim();
    const userDetailsForMeritHub = {
      name: userFullName || `Student_${newUser._id}`, // Use actual user name
      title: "Student", // Meaningful title for students
      img: "https://hst.meritgraph.com/theme/img/png/avtr.png", // MeritHub default avatar
      desc: `Student at Wakade Classes - ${userFullName}`, // Descriptive description
      lang: "en", // Language preference
      clientUserId: newUser._id.toString(), // Unique identifier (MongoDB _id)
      email: newUser.email || `student_${newUser._id}@wakadeclasses.com`, // Unique email (real or dummy)
      role: "M", // Role: "M" for Students, "C" for Creator/Teacher
      timeZone: "Asia/Kolkata", // Time zone
      permission: "CJ", // Permission: "CJ" for Course and Class Joining
    };

    try {
      // Add user to MeritHub
      const meritHubResponse = await addUser(userDetailsForMeritHub);

      // Update the user in the database with the MeritHub User ID
      newUser.merithubUserId = meritHubResponse.userId;
      await newUser.save();
    } catch (meritHubError) {
      console.error("Error adding user to MeritHub:", meritHubError.message);

      // Handle MeritHub API failure gracefully
      return res.status(500).json({
        status: 500,
        message: "User registered but failed to add to MeritHub.",
        data: { id: newUser._id, phone: newUser.phone, otp: otp },
      });
    }

    // Return the response with all necessary details
    const responseObj = {
      id: newUser._id,
      phone: newUser.phone,
      otp: otp,
      merithubUserId: newUser.merithubUserId,
    };

    return res.status(200).send({
      status: 200,
      message: "User registered successfully and added to MeritHub",
      data: responseObj,
    });
  } catch (error) {
    console.error("Error during signup:", error.message);
    return res.status(500).json({ status: 500, message: "Server error" });
  }
};

exports.sendOTP = async (req, res) => {
  try {
    const { email, phone } = req.body;

    // if (!email && !phone) {
    //   return res.status(400).json({
    //     message: "Either email or phone number is required"
    //   });
    // }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const otp = generateOTP();
    const expirationTime = 5 * 60; // 5 minutes

    // Store OTP in Redis with expiration
    const redisKey = `otp:${user._id}`;
    await redisClient.setEx(redisKey, expirationTime, otp);

    // for future
    // if (email) {
    //   await sendEmailOTP(email, otp);
    // } else if (phone) {
    //   await sendSMSOTP(phone, otp);
    // }

    // for development and testing purposes only - remove in production
    return res.status(200).json({
      message: "OTP sent successfully",
      otp: otp, // remove this in production
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Internal server error",
      error: err.message,
    });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).send({ message: "user not found" });
    }

    let isValidOTP = false;

    // First try Redis (for signupWithPhone)
    const redisKey = `otp:${user._id}`;
    const storedOTP = await redisClient.get(redisKey);

    if (storedOTP && storedOTP === otp) {
      // OTP found in Redis and matches
      isValidOTP = true;
      await redisClient.del(redisKey); // Clean up Redis
    } else if (user.otp && user.otpExpiration) {
      // Fallback to database OTP (for signup)
      if (user.otp === otp && new Date() < user.otpExpiration) {
        isValidOTP = true;
        // Clean up database OTP
        await User.findByIdAndUpdate(user._id, {
          $unset: { otp: 1, otpExpiration: 1 }
        });
      }
    }

    if (!isValidOTP) {
      return res.status(400).json({ 
        status: 400, 
        message: "Invalid or expired OTP" 
      });
    }

    // Update user verification status
    const updated = await User.findByIdAndUpdate(
      { _id: user._id },
      { accountVerification: true },
      { new: true }
    );

    // NOTE: Welcome message is sent during user creation in socialLogin/signup, not here
    // This prevents duplicate welcome messages during OTP verification

    // Generate JWT token
    const accessToken = jwt.sign({ id: user._id }, authConfig.secret, {
      expiresIn: authConfig.accessTokenTime,
    });

    let obj = {
      userId: updated._id,
      phone: updated.phone,
      token: accessToken,
      completeProfile: updated.completeProfile,
    };

    return res.status(200).send({ 
      status: 200, 
      message: "logged in successfully", 
      data: obj 
    });
  } catch (err) {
    console.log(err.message);
    return res.status(500).send({ 
      status: 500, 
      error: "internal server error: " + err.message 
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { identifier, password, otp } = req.body;

    if (!identifier) {
      return res.status(400).json({
        message: "Email or phone number is required",
      });
    }

    if (!password && !otp) {
      return res.status(400).json({
        message: "Either password or OTP is required",
      });
    }

    // finding user by email or phone
    const user = await User.findOne({
      $or: [{ email: identifier }, { phone: identifier }],
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    let isAuthenticated = false;

    if (otp) {
      const redisKey = `otp:${user._id}`;
      const storedOTP = await redisClient.get(redisKey);

      if (storedOTP && storedOTP === otp) {
        isAuthenticated = true;

        await redisClient.del(redisKey);
      }
    } else if (password) {
      isAuthenticated = await bcrypt.compare(password, user.password);
    }

    if (!isAuthenticated) {
      return res.status(401).json({
        message: otp ? "Invalid OTP" : "Invalid password",
      });
    }

    const accessToken = jwt.sign({ id: user._id }, authConfig.secret, {
      expiresIn: authConfig.accessTokenTime,
    });

    // Send welcome message after successful login
    await sendWelcomeMessage(user._id, user.firstName || "Student", false);

    // Log user login activity
    logger.userActivity(
      user._id, 
      user.firstName || user.email || user.phone, 
      'LOGIN', 
      `Login method: ${otp ? 'OTP' : 'PASSWORD'}, IP: ${req.ip}`
    );

    // last Login can be used
    // await User.findByIdAndUpdate(user._id, {
    //   lastLogin: new Date()
    // });

    const responseObj = {
      userId: user._id,
      email: user.email,
      phone: user.phone,
      token: accessToken,
      completeProfile: user.completeProfile,
      accountVerification: user.accountVerification,
    };

    return res.status(200).json({
      status: 200,
      message: "Logged in successfully",
      data: responseObj,
    });
  } catch (err) {
    logger.error(err, 'USER_LOGIN', identifier);
    return res.status(500).json({
      message: "Internal server error",
      error: err.message,
    });
  }
};

// Helper function for sending responses
const sendResponse = (res, status, message, data = {}) => {
  return res.status(status).json({ status, message, data });
};

// Controller to get the current user's profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return sendResponse(res, 404, "No data found");
    }

    // 🔧 FIX: Use individual user links from User.liveClasses array (NOT LiveClass collection)
    console.log(`🔍 [PROFILE] Fetching individual live classes for user ${user._id}`);
    console.log(`✅ [PROFILE] Using User.liveClasses array with individual user links`);

    // Filter out past classes (older than 2 hours) unless they're currently live
    const now = new Date();
    const activeLiveClasses = (user.liveClasses || []).filter(liveClass => {
      const startTime = new Date(liveClass.startTime);
      const timeDiff = now - startTime;
      const twoHours = 2 * 60 * 60 * 1000;
      
      // Keep if: not started yet, currently live, or ended less than 2 hours ago
      return timeDiff < twoHours || liveClass.status === "lv";
    });

    console.log(`✅ [PROFILE] Found ${activeLiveClasses.length} active individual live classes for user profile`);

      // 🔍 DEBUG: Log what's in the database for live classes
      console.log(`🔍 [PROFILE_DEBUG] Active live classes from DB:`, activeLiveClasses.length);
      activeLiveClasses.forEach((lc, index) => {
        console.log(`🔍 [PROFILE_DEBUG] Live Class ${index + 1}:`);
        console.log(`   Title: ${lc.title}`);
        console.log(`   lc.participantLink: ${lc.participantLink ? 'Available' : 'Missing'}`);
        console.log(`   lc.liveLink: ${lc.liveLink ? 'Available' : 'Missing'}`);
        if (lc.participantLink) {
          console.log(`   participantLink preview: ${lc.participantLink.substring(0, 50)}...`);
        }
        if (lc.liveLink) {
          console.log(`   liveLink preview: ${lc.liveLink.substring(0, 50)}...`);
        }
      });

      // Create enhanced user object with individual live classes
      const userWithIndividualLiveClasses = {
        ...user.toObject(),
        liveClasses: activeLiveClasses.map(lc => ({
        _id: lc._id,
        classId: lc.classId,
        title: lc.title,
        startTime: lc.startTime,
        endDate: lc.endDate,
        duration: lc.duration,
        platform: lc.platform || 'merithub',
        status: lc.status,
        // 🔧 FIXED: For students, use participantLink from LiveClass collection
        // This ensures students get participant access, not instructor access
        liveLink: lc.liveLink, // Keep original instructor link for reference
        participantLink: lc.participantLink, // Participant link for students
        instructorLink: lc.instructorLink,
        moderatorLink: lc.moderatorLink,
        courseIds: lc.courseIds,
        description: lc.description,
        timeZoneId: lc.timeZoneId,
        createdAt: lc.createdAt
      }))
    };

    console.log(`🎯 [PROFILE] Returning ${userWithIndividualLiveClasses.liveClasses.length} live classes with individual user links`);
    
    return sendResponse(res, 200, "Profile retrieved successfully", userWithIndividualLiveClasses);
  } catch (error) {
    console.error("❌ [PROFILE] Error fetching profile with individual live classes:", error);
    return sendResponse(res, 500, "Server error");
  }
};



// Controller to update the current user's profile
exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return sendResponse(res, 404, "No data found");
    }

    // Create update object dynamically for local database
    const updateDataLocal = {
      firstName: req.body.firstName || user.firstName,
      lastName: req.body.lastName || user.lastName,
      email: req.body.email || user.email,
      phone: req.body.phone || user.phone,
      gender: req.body.gender || user.gender,
      alternatePhone: req.body.alternatePhone || user.alternatePhone,
      dob: req.body.dob || user.dob,
      address1: req.body.address1 || user.address1,
      address2: req.body.address2 || user.address2,
      transportation: req.body.transportation || user.transportation,
      image: req.file?.path || user.image,
      college: req.body.college || user.college,
    };

    // Update the user in the local database
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $set: updateDataLocal },
      { new: true }
    );
    if (!updatedUser) {
      return sendResponse(res, 500, "Failed to update profile");
    }

    // Prepare the name field to update on MeritHub
    const nameForMeritHub = `${updateDataLocal.firstName} ${updateDataLocal.lastName}`;

    // Update user details on MeritHub using the combined name
    const merithubUpdate = await updateUser(user.merithubUserId, {
      name: nameForMeritHub,
    });

    // Respond to the client with success or forward the error if the MeritHub update fails
    if (!merithubUpdate) {
      return sendResponse(res, 500, "Failed to update name on MeritHub");
    }

    return sendResponse(
      res,
      200,
      "Profile updated successfully on both platforms",
      updatedUser
    );
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, "Server error");
  }
};

// Controller to get all users' profiles
exports.getAllProfiles = async (req, res) => {
  try {
    const users = await User.find({});
    if (!users.length) {
      return sendResponse(res, 404, "No profiles found");
    }
    return sendResponse(res, 200, "Profiles retrieved successfully", users);
  } catch (error) {
    console.error(error);
    return sendResponse(res, 500, "Server error");
  }
};
// Controller to get a user profile by ID
exports.getUserProfileById = async (req, res) => {
  try {
    const { userId } = req.params;

    // Find user by ID
    const user = await User.findById(userId);

    console.log("auser at getUserProfileById is here :", user);

    if (!user) {
      return res.status(404).json({
        status: 404,
        message: "User not found",
        data: {},
      });
    }

    return res.status(200).json({
      status: 200,
      message: "User profile retrieved successfully",
      data: user,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Server error",
      data: {},
    });
  }
};

exports.resendOTP = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findOne({ _id: id, userType: "USER" });
    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }

    const otp = generateOTP();
    const expirationTime = 5 * 60; // 5 minutes

    const redisKey = `otp:${user._id}`;
    await redisClient.setEx(redisKey, expirationTime, otp);

    await User.findByIdAndUpdate(
      user._id,
      { accountVerification: false },
      { new: true }
    );

    // if (user.email) {
    //   await sendEmailOTP(user.email, otp);
    // } else if (user.phone) {
    //   await sendSMSOTP(user.phone, otp);
    // }

    let obj = {
      iid: user._id,
      phone: user.phone,
      email: user.email,
      otp: otp, // remove this in production
    };
    return res
      .status(200)
      .send({ status: 200, message: "OTP resent", data: obj });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .send({ status: 500, message: "Server error" + error.message });
  }
};
exports.updateLocation1 = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.user._id });
    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    } else {
      if (req.body.currentLat || req.body.currentLong) {
        coordinates = [
          parseFloat(req.body.currentLat),
          parseFloat(req.body.currentLong),
        ];
        req.body.currentLocation = { type: "Point", coordinates };
      }
      let update = await User.findByIdAndUpdate(
        { _id: user._id },
        {
          $set: {
            currentLocation: req.body.currentLocation,
            city: req.body.city,
            sector: req.body.sector,
          },
        },
        { new: true }
      );
      if (update) {
        let obj = {
          currentLocation: update.currentLocation,
          city: update.city,
          sector: update.sector,
        };
        return res.status(200).send({
          status: 200,
          message: "Location update successfully.",
          data: obj,
        });
      }
    }
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .send({ status: 500, message: "Server error" + error.message });
  }
};
exports.updateLocation = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.user._id });
    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }

    let updateFields = {};

    if (req.body.currentLat || req.body.currentLong) {
      const coordinates = [
        parseFloat(req.body.currentLat),
        parseFloat(req.body.currentLong),
      ];
      updateFields.currentLocation = { type: "Point", coordinates };
    }

    if (req.body.city) {
      updateFields.city = req.body.city;
      updateFields.isCity = true;
    }

    if (req.body.sector) {
      updateFields.sector = req.body.sector;
      updateFields.isSector = true;
    }

    const updatedUser = await User.findByIdAndUpdate(
      { _id: user._id },
      { $set: updateFields },
      { new: true }
    );

    if (updatedUser) {
      let obj = {
        currentLocation: updatedUser.currentLocation,
        city: updatedUser.city,
        sector: updatedUser.sector,
      };
      return res.status(200).send({
        status: 200,
        message: "Location update successful.",
        data: obj,
      });
    }
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .send({ status: 500, message: "Server error" + error.message });
  }
};
exports.getBanner = async (req, res) => {
  try {
    const Banners = await Banner.find().populate("course");
    
    // TEMPORARY FIX: Use working streaming endpoint until AWS permissions are fixed
    const processedBanners = Banners.map(banner => {
      const bannerObj = banner.toObject();
      
      // Convert S3 URLs to working streaming endpoint URLs
      if (bannerObj.image && bannerObj.image.includes('amazonaws.com/')) {
        const baseURL = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
        bannerObj.image = `${baseURL}/api/v1/stream/banner-image/${banner._id}`;
        console.log(`Using streaming URL for banner ${banner._id}`);
      }
      
      return bannerObj;
    });
    
    return res.status(200).json({ status: 200, data: processedBanners });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Error fetching Banners",
      error: error.message,
    });
  }
};
exports.getBannerById = async (req, res) => {
  try {
    const bannerId = req.params.id;
    const banner = await Banner.findById(bannerId);

    if (!banner) {
      return res.status(404).json({ status: 404, message: "Banner not found" });
    }

    // TEMPORARY FIX: Use working streaming endpoint until AWS permissions are fixed
    const bannerObj = banner.toObject();
    
    // Convert S3 URL to working streaming endpoint URL
    if (bannerObj.image && bannerObj.image.includes('amazonaws.com/')) {
      const baseURL = process.env.API_BASE_URL || `${req.protocol}://${req.get('host')}`;
      bannerObj.image = `${baseURL}/api/v1/stream/banner-image/${banner._id}`;
      console.log(`Using streaming URL for single banner ${banner._id}`);
    }

    return res.status(200).json({ status: 200, data: bannerObj });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Error fetching Banner",
      error: error.message,
    });
  }
};
exports.createUserSubscription = async (req, res) => {
  try {
    const { subscriptionId, validityType, validity } = req.body;
    const userId = req.user._id;

    const user = await User.findOne({ _id: userId });
    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }

    const subscription = await Subscription.findById(subscriptionId);
    if (!subscription) {
      return res
        .status(404)
        .json({ status: 404, message: "Subscription not found" });
    }

    const selectedValidity = subscription.validities.find(
      (v) => v.validityType === validityType && v.validity === validity
    );
    console.log(selectedValidity);
    if (!selectedValidity) {
      return res
        .status(400)
        .json({ status: 400, message: "Invalid validity period" });
    }

    let startDate = Date.now();
    const startDateTime = new Date(startDate);
    let endDateTime;

    if (validityType === "Month") {
      endDateTime = new Date(startDateTime);
      endDateTime.setMonth(startDateTime.getMonth() + validity);
    } else if (validityType === "Year") {
      endDateTime = new Date(startDateTime);
      endDateTime.setFullYear(startDateTime.getFullYear() + validity);
    }

    const newSubscription = new UserSubscription({
      user: userId,
      subscription: subscriptionId,
      course: subscription.course,
      startDate: startDateTime,
      endDate: endDateTime,
      validityType,
      validity,
      price: selectedValidity.price,
    });

    await newSubscription.save();

    return res.status(201).json({
      status: 201,
      message: "Subscription purchased successfully",
      data: newSubscription,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};
exports.getAllUserSubscriptions = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findOne({ _id: userId });
    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }
    const subscriptions = await UserSubscription.find({
      user: userId,
    }).populate("user subscription course");

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
      "user subscription course"
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
exports.updateUserSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, status, validityType, validity } = req.body;

    const existingSubscription = await UserSubscription.findById(id).populate(
      "subscription"
    );

    if (!existingSubscription) {
      return res
        .status(404)
        .json({ status: 404, message: "Subscription not found" });
    }

    const subscription = existingSubscription.subscription;

    let selectedValidity;
    if (validityType && validity) {
      selectedValidity = subscription.validities.find(
        (v) => v.validityType === validityType && v.validity === validity
      );

      if (!selectedValidity) {
        return res
          .status(400)
          .json({ status: 400, message: "Invalid validity period" });
      }
    } else {
      selectedValidity = {
        validityType: subscription.validityType,
        validity: subscription.validity,
      };
    }

    let endDate = existingSubscription.endDate;
    if (startDate) {
      const startDateTime = new Date(startDate);
      if (selectedValidity.validityType === "Month") {
        endDate = new Date(startDateTime);
        endDate.setMonth(startDateTime.getMonth() + selectedValidity.validity);
      } else if (selectedValidity.validityType === "Year") {
        endDate = new Date(startDateTime);
        endDate.setFullYear(
          startDateTime.getFullYear() + selectedValidity.validity
        );
      }
    }

    const updatedSubscription = await UserSubscription.findByIdAndUpdate(
      id,
      { startDate, endDate, status },
      { new: true }
    );

    if (!updatedSubscription) {
      return res
        .status(404)
        .json({ status: 404, message: "Subscription not found" });
    }

    return res.status(200).json({
      status: 200,
      message: "Subscription updated successfully",
      data: updatedSubscription,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};
exports.deleteUserSubscription = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedSubscription = await UserSubscription.findByIdAndDelete(id);

    if (!deletedSubscription) {
      return res
        .status(404)
        .json({ status: 404, message: "Subscription not found" });
    }

    return res
      .status(200)
      .json({ status: 200, message: "Subscription deleted successfully" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};
exports.markNotificationAsRead = async (req, res) => {
  try {
    const notificationId = req.params.notificationId;

    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      { status: "read" },
      { new: true }
    );

    if (!notification) {
      return res
        .status(404)
        .json({ status: 404, message: "Notification not found" });
    }

    return res.status(200).json({
      status: 200,
      message: "Notification marked as read",
      data: notification,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      message: "Error marking notification as read",
      error: error.message,
    });
  }
};
exports.markAllNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: 404, message: "User not found" });
    }

    const notifications = await Notification.updateMany(
      { recipient: userId },
      { status: "read" }
    );

    if (!notifications) {
      return res
        .status(404)
        .json({ status: 404, message: "No notifications found for the user" });
    }

    return res.status(200).json({
      status: 200,
      message: "All notifications marked as read for the user",
      data: notifications,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      message: "Error marking notifications as read",
      error: error.message,
    });
  }
};
exports.getNotificationsForUser = async (req, res) => {
  try {
    const userId = req.params.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: 404, message: "User not found" });
    }

    const notifications = await Notification.find({ recipient: userId });

    return res.status(200).json({
      status: 200,
      message: "Notifications retrieved successfully",
      data: notifications,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      message: "Error retrieving notifications",
      error: error.message,
    });
  }
};
exports.getAllNotificationsForUser = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ status: 404, message: "User not found", data: null });
    }
    const notifications = await Notification.find({ recipient: userId });

    return res.status(200).json({
      status: 200,
      message: "Notifications retrieved successfully",
      data: notifications,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      message: "Error retrieving notifications",
      error: error.message,
    });
  }
};
// DEPRECATED: Message functionality moved to chatController.js to avoid duplication
// Use /api/v1/chat/send endpoint instead
exports.sendMessage = async (req, res) => {
  return res.status(410).json({
    status: 410,
    message: "This endpoint is deprecated. Please use /api/v1/chat/send instead.",
    redirectTo: "/api/v1/chat/send"
  });
};
// DEPRECATED: Use /api/v1/chat/:requestedUserID instead
exports.getConversation = async (req, res) => {
  return res.status(410).json({
    status: 410,
    message: "This endpoint is deprecated. Please use /api/v1/chat/:requestedUserID instead.",
    redirectTo: "/api/v1/chat/:requestedUserID"
  });
};
// DEPRECATED: Message functionality moved to chatController.js
exports.updateMessage = async (req, res) => {
  return res.status(410).json({
    status: 410,
    message: "This endpoint is deprecated. Use chatController for message operations."
  });
};
// DEPRECATED: Message functionality moved to chatController.js
exports.deleteMessage = async (req, res) => {
  return res.status(410).json({
    status: 410,
    message: "This endpoint is deprecated. Use chatController for message operations."
  });
};
// DEPRECATED: Use /api/v1/chat/markAsRead/:partnerId instead
exports.markAsRead = async (req, res) => {
  return res.status(410).json({
    status: 410,
    message: "This endpoint is deprecated. Use /api/v1/chat/markAsRead/:partnerId instead.",
    redirectTo: "/api/v1/chat/markAsRead/:partnerId"
  });
};
// DEPRECATED: Message functionality moved to chatController.js
exports.getUnreadMessagesCount = async (req, res) => {
  return res.status(410).json({
    status: 410,
    message: "This endpoint is deprecated. Use chatController for message operations."
  });
};
exports.getAllSchedules = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ status: 404, message: "User not found", data: null });
    }

    const subscriptions = await UserSubscription.find({
      user: userId,
    }).populate("user subscription course");

    const subscribedCourses = subscriptions.map((sub) => sub.course._id);

    const schedules = await Schedule.find({
      course: { $in: subscribedCourses },
      status: "scheduled",
    }).populate("course");

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
exports.getAllLive = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ status: 404, message: "User not found", data: null });
    }

    const subscriptions = await UserSubscription.find({
      user: userId,
    }).populate("user subscription course");

    const subscribedCourses = subscriptions.map((sub) => sub.course._id);

    const schedules = await Schedule.find({
      course: { $in: subscribedCourses },
      status: "live",
    }).populate("course");

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
exports.getAllCompleted = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ status: 404, message: "User not found", data: null });
    }

    const subscriptions = await UserSubscription.find({
      user: userId,
    }).populate("user subscription course");

    const subscribedCourses = subscriptions.map((sub) => sub.course._id);

    const schedules = await Schedule.find({
      course: { $in: subscribedCourses },
      status: "completed",
    }).populate("course");

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
exports.getAllCancelled = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ status: 404, message: "User not found", data: null });
    }

    const subscriptions = await UserSubscription.find({
      user: userId,
    }).populate("user subscription course");

    const subscribedCourses = subscriptions.map((sub) => sub.course._id);

    const schedules = await Schedule.find({
      course: { $in: subscribedCourses },
      status: "cancelled",
    }).populate("course");

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
    const { search } = req.query;

    const productsCount = await Product.find().count();
    if (search) {
      let data1 = [
        {
          $lookup: {
            from: "categories",
            localField: "categoryId",
            foreignField: "_id",
            as: "categoryId",
          },
        },
        { $unwind: "$categoryId" },
        {
          $match: {
            $or: [
              { "categoryId.name": { $regex: search, $options: "i" } },
              { productName: { $regex: search, $options: "i" } },
              { description: { $regex: search, $options: "i" } },
            ],
          },
        },
        { $sort: { numOfReviews: -1 } },
      ];
      let apiFeature = await Product.aggregate(data1);
      return res.status(200).json({
        status: 200,
        message: "Product data found.",
        data: apiFeature,
        count: productsCount,
      });
    } else {
      let apiFeature = await Product.aggregate([
        {
          $lookup: {
            from: "categories",
            localField: "categoryId",
            foreignField: "_id",
            as: "categoryId",
          },
        },
        { $unwind: "$categoryId" },
        { $sort: { numOfReviews: -1 } },
      ]);

      return res.status(200).json({
        status: 200,
        message: "Product data found.",
        data: apiFeature,
        count: productsCount,
      });
    }
  } catch (error) {
    console.error(error);
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
    const { search, fromDate, toDate, categoryId, status, page, limit } =
      req.query;
    let query = {};
    if (search) {
      query.$or = [
        { productName: { $regex: req.query.search, $options: "i" } },
        { description: { $regex: req.query.search, $options: "i" } },
      ];
    }
    if (status) {
      query.status = status;
    }
    if (categoryId) {
      query.categoryId = categoryId;
    }
    if (fromDate && !toDate) {
      query.createdAt = { $gte: fromDate };
    }
    if (!fromDate && toDate) {
      query.createdAt = { $lte: toDate };
    }
    if (fromDate && toDate) {
      query.$and = [
        { createdAt: { $gte: fromDate } },
        { createdAt: { $lte: toDate } },
      ];
    }
    let options = {
      page: Number(page) || 1,
      limit: Number(limit) || 15,
      sort: { createdAt: -1 },
      populate: "categoryId",
    };
    let data = await Product.paginate(query, options);
    return res
      .status(200)
      .json({ status: 200, message: "Product data found.", data: data });
  } catch (err) {
    return res
      .status(500)
      .send({ msg: "internal server error ", error: err.message });
  }
};
exports.addToCart = async (req, res) => {
  try {
    const { productId, bookId, quantity, wallet } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ status: 404, message: "User not found" });
    }

    let item, itemType, itemPrice;

    if (productId) {
      const product = await Product.findById(productId);
      if (!product) {
        return res
          .status(404)
          .json({ status: 404, message: "Product not found" });
      }
      item = product;
      itemType = 'product';
      itemPrice = product.discountActive ? product.discountPrice : product.originalPrice;
    } else if (bookId) {
      const Book = require('../models/Book');
      const book = await Book.findById(bookId);
      if (!book) {
        return res
          .status(404)
          .json({ status: 404, message: "Book not found" });
      }
      item = book;
      itemType = 'book';
      itemPrice = book.price;
    } else {
      return res
        .status(400)
        .json({ status: 400, message: "Either productId or bookId is required" });
    }

    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
      const cartItem = {
        quantity,
        price: itemPrice,
        totalAmount: itemPrice * quantity,
        itemType
      };

      if (itemType === 'product') {
        cartItem.product = productId;
        cartItem.vendorId = item.vendorId;
      } else {
        cartItem.book = bookId;
      }

      cart = new Cart({
        user: userId,
        products: [cartItem],
        shippingPrice: 0,
      });
    } else {
      const existingItemIndex = cart.products.findIndex((cartItem) => {
        if (itemType === 'product') {
          return cartItem.product && cartItem.product.toString() === productId;
        } else {
          return cartItem.book && cartItem.book.toString() === bookId;
        }
      });

      if (existingItemIndex !== -1) {
        cart.products[existingItemIndex].quantity += quantity;
        cart.products[existingItemIndex].totalAmount =
          cart.products[existingItemIndex].price * cart.products[existingItemIndex].quantity;
      } else {
        const cartItem = {
          quantity,
          price: itemPrice,
          totalAmount: itemPrice * quantity,
          itemType
        };

        if (itemType === 'product') {
          cartItem.product = productId;
          cartItem.vendorId = item.vendorId;
        } else {
          cartItem.book = bookId;
        }

        cart.products.push(cartItem);
      }
    }

    let totalCartAmount = 0;

    if (wallet) {
      const userWallet = user.wallet;
      console.log("userWallet", userWallet);

      if (!userWallet) {
        return res
          .status(404)
          .json({ status: 404, message: "Wallet not found" });
      }

      if (userWallet.user.toString() !== userId) {
        return res
          .status(400)
          .json({ status: 400, message: "User and wallet user do not match" });
      }

      if (userWallet <= 0) {
        return res
          .status(400)
          .json({ status: 400, message: "Insufficient wallet balance" });
      }

      console.log("userWallet balance before deduction:", userWallet.balance);

      totalCartAmount =
        cart.products.reduce((total, item) => total + item.totalAmount, 0) -
        userWallet;
      if (totalCartAmount < 0) {
        totalCartAmount = 0;
      }

      userWallet = 0;
      await userWallet.save();
      cart.walletUsed = true;
      cart.wallet = wallet;
      cart.products.forEach((item) => {
        item.totalAmount = item.price * item.quantity;
      });
      console.log(totalCartAmount);
    } else {
      cart.products.forEach((item) => {
        item.totalAmount = item.price * item.quantity;
      });
      totalCartAmount = cart.products.reduce(
        (total, item) => total + item.totalAmount,
        0
      );
    }
    console.log(totalCartAmount);

    cart.totalPaidAmount = totalCartAmount;

    await cart.save();
    console.log(totalCartAmount);
    console.log("cart", cart);

    return res.status(201).json({
      status: 201,
      message: "Product added to cart successfully",
      data: cart,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Error adding product to cart", error: error.message });
  }
};
exports.getCart = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ status: 404, message: "User not found" });
    }

    const cart = await Cart.findOne({ user: userId })
      .populate({
        path: "products.product",
        select: "productName price image",
      })
      .populate({
        path: "products.book",
        select: "name author price imageUrl",
      })
      .populate("wallet", "balance");

    if (!cart) {
      return res.status(404).json({ status: 404, message: "Cart not found" });
    }

    return res.status(200).json({
      status: 200,
      message: "Cart retrieved successfully",
      data: cart,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Error fetching cart", error: error.message });
  }
};
exports.updateCart = async (req, res) => {
  try {
    const { productId, size, quantity } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ status: 404, message: "User not found" });
    }

    const product = await Product.findById(productId);

    if (!product) {
      return res
        .status(404)
        .json({ status: 404, message: "Product not found" });
    }

    const cart = await Cart.findOne({ user: userId });

    if (!cart) {
      return res.status(404).json({ status: 404, message: "Cart not found" });
    }

    const cartProduct = cart.products.find(
      (item) => item.product.toString() === productId
    );

    if (!cartProduct) {
      return res
        .status(404)
        .json({ status: 404, message: "Product not found in cart" });
    }

    cartProduct.size = size;
    cartProduct.quantity = quantity;
    cartProduct.totalAmount = product.discountActive
      ? product.discountPrice * quantity
      : product.originalPrice * quantity;

    const totalCartAmount = cart.products.reduce(
      (total, item) => total + item.totalAmount,
      0
    );

    cart.totalPaidAmount = totalCartAmount;
    await cart.save();

    return res
      .status(200)
      .json({ status: 200, message: "Cart updated successfully", data: cart });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Error updating cart", error: error.message });
  }
};
exports.deleteCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const cart = await Cart.findOneAndDelete({ user: userId });

    if (!cart) {
      return res.status(404).json({ status: 404, message: "Cart not found" });
    }

    return res
      .status(200)
      .json({ status: 200, message: "Cart cleared successfully" });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Error clearing cart", error: error.message });
  }
};
exports.updateCartQuantity = async (req, res) => {
  try {
    const { productId, bookId, quantity } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ status: 404, message: "User not found" });
    }

    let item, itemType, itemPrice;

    if (productId) {
      const product = await Product.findById(productId);
      if (!product) {
        return res
          .status(404)
          .json({ status: 404, message: "Product not found" });
      }
      item = product;
      itemType = 'product';
      itemPrice = product.discountActive === "true" ? product.discountPrice : product.originalPrice;
    } else if (bookId) {
      const Book = require('../models/Book');
      const book = await Book.findById(bookId);
      if (!book) {
        return res
          .status(404)
          .json({ status: 404, message: "Book not found" });
      }
      item = book;
      itemType = 'book';
      itemPrice = book.price;
    } else {
      return res
        .status(400)
        .json({ status: 400, message: "Either productId or bookId is required" });
    }

    const cart = await Cart.findOne({ user: userId });

    if (!cart) {
      return res.status(404).json({ status: 404, message: "Cart not found" });
    }

    const cartItemIndex = cart.products.findIndex((cartItem) => {
      if (itemType === 'product') {
        return cartItem.product && cartItem.product.toString() === productId;
      } else {
        return cartItem.book && cartItem.book.toString() === bookId;
      }
    });

    if (cartItemIndex === -1) {
      return res
        .status(404)
        .json({ status: 404, message: `${itemType === 'book' ? 'Book' : 'Product'} not found in cart` });
    }

    cart.products[cartItemIndex].quantity = quantity;
    cart.products[cartItemIndex].totalAmount = itemPrice * quantity;

    const totalCartAmount = cart.products.reduce(
      (total, item) => total + item.totalAmount,
      0
    );

    cart.totalPaidAmount = totalCartAmount;

    await cart.save();

    return res
      .status(200)
      .json({ status: 200, message: "Cart updated successfully", data: cart });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Error updating cart", error: error.message });
  }
};
exports.deleteCartProductById = async (req, res) => {
  try {
    const userId = req.user.id;
    const productId = req.params.productId;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ status: 404, message: "User not found" });
    }

    const cart = await Cart.findOne({ user: userId });

    if (!cart) {
      return res.status(404).json({ status: 404, message: "Cart not found" });
    }

    const productIndex = cart.products.findIndex(
      (item) => item.product.toString() === productId
    );

    if (productIndex === -1) {
      return res
        .status(404)
        .json({ status: 404, message: "Product not found in cart" });
    }

    cart.products.splice(productIndex, 1);

    await cart.save();

    return res.status(200).json({
      status: 200,
      message: "Cart product deleted successfully",
      data: cart,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Error deleting cart product", error: error.message });
  }
};
exports.createAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const addressData = req.body;

    const checkUser = await User.findById(userId);

    if (!checkUser) {
      return res.status(404).json({ status: 404, message: "User not found" });
    }

    const address = new Address({
      userId,
      ...addressData,
    });

    await address.save();

    res.status(201).json({
      status: 201,
      message: "Address created successfully",
      data: address,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Error creating address",
      error: error.message,
    });
  }
};
exports.updateAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.addressId;
    const addressData = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ status: 404, message: "User not found" });
    }

    const address = await Address.findOne({ _id: addressId, userId });

    if (!address) {
      return res
        .status(404)
        .json({ status: 404, message: "Address not found" });
    }

    Object.assign(address, addressData);
    await address.save();

    res.status(200).json({
      status: 200,
      message: "Address updated successfully",
      data: address,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Error updating address",
      error: error.message,
    });
  }
};
exports.getAddresses = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ status: 404, message: "User not found" });
    }

    const addresses = await Address.find({ userId });

    res.status(200).json({
      status: 200,
      message: "Addresses retrieved successfully",
      data: addresses,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Error fetching addresses",
      error: error.message,
    });
  }
};
exports.getAddressById = async (req, res) => {
  try {
    const addressId = req.params.addressId;

    const address = await Address.findById(addressId);

    if (!address) {
      return res
        .status(404)
        .json({ status: 404, message: "Address not found" });
    }

    return res.status(200).json({
      status: 200,
      message: "Address retrieved successfully",
      data: address,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Error fetching address",
      error: error.message,
    });
  }
};
exports.deleteAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.addressId;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ status: 404, message: "User not found" });
    }

    const address = await Address.findOneAndDelete({ _id: addressId, userId });

    if (!address) {
      return res
        .status(404)
        .json({ status: 404, message: "Address not found" });
    }

    res
      .status(200)
      .json({ status: 200, message: "Address deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Error deleting address",
      error: error.message,
    });
  }
};
const createOrderNotification = async (userId, orderId, totalAmount) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const orderMessage = `Thank you for your order! Your order ID is ${orderId} and the total amount is $${totalAmount}.`;

    const orderNotification = new Notification({
      recipient: user._id,
      content: orderMessage,
      type: "order",
    });

    await orderNotification.save();
  } catch (error) {
    console.error(error);
    throw new Error("Error creating order notification");
  }
};
exports.createOrder = async (req, res) => {
  try {
    const { shippingAddressId } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: 404, message: "User not found" });
    }

    const cart = await Cart.findOne({
      user: userId,
    }); /*.populate('products.product vendorId')*/
    if (!cart) {
      return res.status(404).json({ status: 404, message: "Cart not found" });
    }

    const address = await Address.findById(shippingAddressId);
    if (!address) {
      return res
        .status(404)
        .json({ status: 404, message: "Shipping address not found" });
    }

    const orderProducts = cart.products.map((cartProduct) => {
      return {
        product: cartProduct.product,
        vendorId: cartProduct.vendorId,
        size: cartProduct.size,
        quantity: cartProduct.quantity,
        price: cartProduct.price,
        totalAmount: cartProduct.totalAmount,
      };
    });

    // let totalAmount = orderProducts.reduce((total, cartProduct) => total + cartProduct.totalAmount, 0);

    let totalAmount = cart.totalPaidAmount;

    await cart.save();

    const order = new Order({
      user: userId,
      products: orderProducts,
      totalAmount,
      shippingAddress: shippingAddressId,
      trackingNumber: generateTrackingNumber(),
    });

    await order.save();

    await createOrderNotification(userId, order._id, totalAmount);

    return res.status(201).json({
      status: 201,
      message: "Order created successfully",
      data: order,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Error creating order",
      error: error.message,
    });
  }
};
exports.updatePaymentStatus = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const { paymentStatus } = req.body;

    const payment = await Order.findByIdAndUpdate(
      orderId,
      { paymentStatus },
      { new: true }
    );

    if (!payment) {
      return res
        .status(404)
        .json({ status: 404, message: "Order record not found" });
    }

    if (paymentStatus === "Completed") {
      payment.paymentStatus = "Completed";
      const currentDate = new Date();
      const deliveryDate = new Date(
        currentDate.setDate(currentDate.getDate() + 7)
      );
      payment.deliveryDate = deliveryDate;

      const userId = payment.user;

      await Cart.deleteMany({ user: userId });
    } else if (paymentStatus === "Failed") {
      payment.paymentStatus = "Failed";
    } else if (paymentStatus === "Pending") {
      payment.paymentStatus = "Pending";
    }

    await payment.save();

    return res.status(200).json({
      status: 200,
      message: "Payment status updated successfully",
      data: payment,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Error updating payment status",
      error: error.message,
    });
  }
};
exports.getOrderById = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    const order = await Order.findById(orderId)
      .populate({
        path: "products.product",
        select: "productName price image",
      })
      .populate({
        path: "user",
        select: "userName mobileNumber",
      })
      .populate({
        path: "shippingAddress",
        select:
          "fullName phone addressLine1 city state postalCode country isDefault",
      });

    if (!order) {
      return res.status(404).json({ status: 404, message: "Order not found" });
    }

    return res.status(200).json({
      status: 200,
      message: "Order retrieved successfully",
      data: order,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Error fetching order",
      error: error.message,
    });
  }
};
exports.getOrderHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const orders = await Order.find({ user: userId })
      .populate({
        path: "products.product",
        select: "productName price image",
      })
      .populate({
        path: "user",
        select: "userName mobileNumber",
      })
      .populate({
        path: "shippingAddress",
        select:
          "fullName phone addressLine1 city state postalCode country isDefault",
      });

    return res.status(200).json({
      status: 200,
      message: "Order history retrieved successfully",
      data: orders,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Error fetching order history", error: error.message });
  }
};
exports.createReturnRequest = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason, description } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: 404, message: "User not found" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ status: 404, message: "Order not found" });
    }

    if (order.status === "Shipped" && order.paymentStatus === "Completed") {
      (order.reason = reason),
        (order.description = description),
        (order.status = "Pending"),
        (order.isRefund = true),
        await order.save();

      return res.status(200).json({
        status: 200,
        message: "Return/Refund request added to the order successfully",
        data: order,
      });
    } else {
      return res.status(400).json({
        status: 400,
        message: "Order is not eligible for return/refund",
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Error creating return/refund request",
      error: error.message,
    });
  }
};
exports.getRefundOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(userId);
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: 404, message: "User not found" });
    }

    const refundOrders = await Order.find({ isRefund: true, user: userId })
      .populate({
        path: "products.product",
        select: "productName price image",
      })
      .populate({
        path: "user",
        select: "userName mobileNumber",
      })
      .populate({
        path: "shippingAddress",
        select:
          "fullName phone addressLine1 city state postalCode country isDefault",
      });

    const existingWallet = await UserWallet.findOne({ user: userId }).populate(
      "user"
    );

    return res.status(200).json({
      status: 200,
      message: "Refund orders status retrieved successfully",
      data: refundOrders,
      walletBalance: existingWallet || null,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Error retrieving refund orders",
      error: error.message,
    });
  }
};
exports.getUserEnrolledCourses = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ status: 404, message: "User not found", data: null });
    }

    const subscriptions = await UserSubscription.find({
      user: userId,
    }).populate("course");
    
    // Filter subscriptions to only include published courses
    const publishedSubscriptions = subscriptions.filter(sub => 
      sub.course && sub.course.isPublished
    );
    
    if (publishedSubscriptions.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "No enrolled courses found",
        data: null,
      });
    }

    const courses = publishedSubscriptions.map((sub) => sub.course);

    return res.status(200).json({
      status: 200,
      message: "Enrolled courses retrieved successfully",
      data: courses,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error: error.message });
  }
};
exports.getAllFreeCourses = async (req, res) => {
  try {
    // Only return free courses that are also published
    const freeCourses = await Course.find({ 
      courseType: "Free", 
      isPublished: true 
    });

    if (!freeCourses || freeCourses.length === 0) {
      return res
        .status(404)
        .json({ status: 404, message: "No free courses found", data: null });
    }

    return res.status(200).json({
      status: 200,
      message: "Free courses retrieved successfully",
      data: freeCourses,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error: error.message });
  }
};
exports.getAllCourses = async (req, res) => {
  try {
    const courses = await Course.find({});
    if (!courses || courses.length === 0) {
      return res
        .status(404)
        .json({ status: 404, message: "No courses found", data: null });
    }
    return res.status(200).json({
      status: 200,
      message: "Courses retrieved successfully",
      data: courses,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error: error.message });
  }
};

exports.getUserPurchasedCourses = async (req, res) => {
  try {
    const userId = req.user._id;
    console.log(`🔍 [DEBUG] Fetching purchased courses for user: ${userId}`);

    const user = await User.findById(userId).populate({
      path: 'purchasedCourses.course',
      model: 'Course',
      select: 'title description price courseImage category subCategory isPublished courseType rootFolder'
    });
    
    if (!user) {
      console.log(`❌ [DEBUG] User not found: ${userId}`);
      return res
        .status(404)
        .json({ status: 404, message: "User not found", data: null });
    }

    console.log(`🔍 [DEBUG] User found: ${user.firstName} ${user.lastName}`);
    console.log(`🔍 [DEBUG] Raw purchasedCourses count: ${user.purchasedCourses?.length || 0}`);
    console.log(`🔍 [DEBUG] Raw purchasedCourses:`, user.purchasedCourses?.map(pc => ({
      courseId: pc.course?._id || pc.course,
      courseTitle: pc.course?.title,
      courseType: pc.course?.courseType,
      isPublished: pc.course?.isPublished,
      rootFolder: pc.course?.rootFolder,
      rootFolderType: typeof pc.course?.rootFolder,
      assignedByAdmin: pc.assignedByAdmin?.isAssigned,
      expiresAt: pc.expiresAt
    })));
    
    // Additional debug: Log courses that have undefined rootFolder
    const coursesWithoutRootFolder = user.purchasedCourses?.filter(pc => 
      pc.course && !pc.course.rootFolder
    );
    if (coursesWithoutRootFolder?.length > 0) {
      console.log(`🚨 [DEBUG] Courses without rootFolder:`, coursesWithoutRootFolder.map(pc => ({
        courseId: pc.course._id,
        courseTitle: pc.course.title,
        courseType: pc.course.courseType
      })));
    }

    // Filter out expired courses and unpublished regular courses, but allow unpublished batch courses
    const activePurchasedCourses = user.purchasedCourses.filter(pc => {
      // Exclude expired courses
      if (pc.expiresAt && pc.expiresAt <= new Date()) {
        console.log(`🔍 [DEBUG] Filtering out expired course: ${pc.course?.title}`);
        return false;
      }
      
      // Exclude courses that don't exist
      if (!pc.course) {
        console.log(`🔍 [DEBUG] Filtering out course with no data: ${pc.course}`);
        return false;
      }
      
      // For batch courses, allow access even if unpublished (batches are invitation-only)
      if (pc.course.courseType === "Batch") {
        console.log(`🔍 [DEBUG] Including batch course: ${pc.course.title} (published: ${pc.course.isPublished})`);
        return true;
      }
      
      // For regular courses, only include published ones
      if (!pc.course.isPublished) {
        console.log(`🔍 [DEBUG] Filtering out unpublished regular course: ${pc.course.title}`);
        return false;
      }
      
      console.log(`🔍 [DEBUG] Including published regular course: ${pc.course.title}`);
      return true; // Include active published regular courses and all batch courses
    });

    console.log(`🔍 [DEBUG] Active purchased courses count after filtering: ${activePurchasedCourses.length}`);

    // Generate pre-signed URLs for course images (same as getAllPublishedCoursesForUser)
    const { generatePresignedUrl } = require('../configs/aws.config');
    const processedCourses = await Promise.all(activePurchasedCourses.map(async (pc) => {
      const courseObj = pc.course.toObject();
      
      // Process course images to use pre-signed URLs
      if (courseObj.courseImage && courseObj.courseImage.length > 0) {
        courseObj.courseImage = await Promise.all(courseObj.courseImage.map(async (imageUrl) => {
          if (imageUrl && imageUrl.includes('amazonaws.com/')) {
            try {
              const s3Key = imageUrl.split('amazonaws.com/')[1];
              const bucketName = process.env.S3_BUCKET || 'wakadclass';
              
              console.log(`🔗 [PRESIGN] Generating pre-signed URL for purchased course ${courseObj._id} image`);
              
              // Generate pre-signed URL with longer expiration (24 hours)
              const presignedUrl = await generatePresignedUrl(bucketName, s3Key, 86400);
              
              console.log(`✅ [PRESIGN] Generated pre-signed URL for purchased course ${courseObj._id}`);
              return presignedUrl;
              
            } catch (error) {
              console.error(`❌ [PRESIGN] Failed to generate pre-signed URL for purchased course ${courseObj._id}:`, error);
              // Keep original URL as fallback
              return imageUrl;
            }
          }
          return imageUrl;
        }));
      }
      
      return {
        ...courseObj,
        purchaseInfo: {
          purchasedAt: pc.assignedByAdmin?.assignedAt || pc.purchasedAt,
          expiresAt: pc.expiresAt,
          assignedByAdmin: pc.assignedByAdmin?.isAssigned || false,
          assignedBy: pc.assignedByAdmin?.assignedBy
        }
      };
    }));

    console.log(`🔍 [DEBUG] Final response - courses count: ${processedCourses.length}`);
    console.log(`🔍 [DEBUG] Final courses:`, processedCourses.map(c => ({
      id: c._id,
      title: c.title,
      courseType: c.courseType,
      isPublished: c.isPublished,
      hasImages: c.courseImage && c.courseImage.length > 0
    })));

    return res.status(200).json({
      status: 200,
      message: "Purchased courses retrieved successfully",
      data: processedCourses,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error: error.message });
  }
};

exports.getAllNotices = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }

    const subscriptions = await UserSubscription.find({
      user: userId,
    }).populate("course");
    if (subscriptions.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "No enrolled courses found",
        data: null,
      });
    }

    const courseIds = subscriptions.map((sub) => sub.course._id);
    console.log("User course IDs:", courseIds);

    const notices = await NoticeBoard.find({
      courseId: { $in: courseIds },
    }).populate("author courseId");

    notices.forEach((notice) => {
      console.log(
        "Notice Course ID:",
        notice.courseId ? notice.courseId._id : null
      );
    });

    if (notices.length === 0) {
      return res.status(404).json({ status: 404, message: "No notices found" });
    }

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
exports.getAllFreeCourseNotices = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }

    const freeCourses = await Course.find({ courseType: "Free" }, "_id");
    const freeCourseIds = freeCourses.map((course) => course._id);

    const notices = await NoticeBoard.find({
      courseId: { $in: freeCourseIds },
    }).populate("author courseId");

    if (!notices || notices.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "No free course notices found",
        data: null,
      });
    }

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
exports.markAttendance = async (req, res) => {
  try {
    const { courseId, date, status } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }

    if (courseId) {
      const course = await Course.findById(courseId);
      if (!course) {
        return res
          .status(404)
          .json({ status: 404, message: "Course not found" });
      }
    }

    const existingAttendance = await Attendance.findOne({
      user: userId,
      course: courseId,
      date,
    });
    if (existingAttendance) {
      return res.status(400).json({
        status: 400,
        message: "Attendance already marked for this date",
      });
    }

    const attendance = new Attendance({
      user: userId,
      course: courseId,
      date: date || new Date(),
      status: status || "Present",
    });

    await attendance.save();

    res.status(201).json({
      status: 201,
      message: "Attendance marked successfully",
      data: attendance,
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
exports.getAttendanceByUser = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }

    const attendanceRecords = await Attendance.find({ user: userId }).populate(
      "user course"
    );

    if (!attendanceRecords || attendanceRecords.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "No attendance records found",
        data: null,
      });
    }

    res.status(200).json({
      status: 200,
      message: "Attendance records retrieved successfully",
      data: attendanceRecords,
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
exports.getAttendanceFilter = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }

    const { year, month } = req.query;
    if (!year || !month) {
      return res.status(400).json({
        status: 400,
        message: "Year and month parameters are required",
      });
    }

    const numericYear = parseInt(year);
    const numericMonth = parseInt(month);

    if (
      isNaN(numericYear) ||
      isNaN(numericMonth) ||
      numericMonth < 1 ||
      numericMonth > 12
    ) {
      return res
        .status(400)
        .json({ status: 400, message: "Invalid month or year format" });
    }

    const startOfMonth = new Date(numericYear, numericMonth - 1, 1);
    const endOfMonth = new Date(numericYear, numericMonth, 0);

    const attendanceRecords = await Attendance.find({
      user: userId,
      date: {
        $gte: startOfMonth,
        $lte: endOfMonth,
      },
    }).populate("user course");

    if (!attendanceRecords || attendanceRecords.length === 0) {
      return res.status(404).json({
        status: 404,
        message: `No attendance records found for ${numericMonth}/${numericYear}`,
        data: null,
      });
    }

    const presentCount = attendanceRecords.filter(
      (record) => record.status === "Present"
    ).length;
    const absentCount = attendanceRecords.filter(
      (record) => record.status === "Absent"
    ).length;

    res.status(200).json({
      status: 200,
      message: "Attendance records retrieved successfully",
      data: {
        attendanceRecords,
        presentCount,
        absentCount,
      },
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
exports.getAttendanceByUserCurrentMonth = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }

    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0);

    const attendanceRecords = await Attendance.find({
      user: userId,
      date: {
        $gte: startOfMonth,
        $lte: endOfMonth,
      },
    }).populate("user course");

    if (!attendanceRecords || attendanceRecords.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "No attendance records found for the current month",
        data: null,
      });
    }

    const presentCount = attendanceRecords.filter(
      (record) => record.status === "Present"
    ).length;
    const absentCount = attendanceRecords.filter(
      (record) => record.status === "Absent"
    ).length;

    res.status(200).json({
      status: 200,
      message:
        "Attendance records for the current month retrieved successfully",
      data: {
        attendanceRecords,
        presentCount,
        absentCount,
      },
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
exports.getAttendanceByUserAndCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }

    const attendanceRecords = await Attendance.find({
      user: userId,
      course: courseId,
    }).populate("user course");

    if (!attendanceRecords || attendanceRecords.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "No attendance records found",
        data: null,
      });
    }

    res.status(200).json({
      status: 200,
      message: "Attendance records retrieved successfully",
      data: attendanceRecords,
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
exports.updateAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const attendance = await Attendance.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!attendance) {
      return res.status(404).json({
        status: 404,
        message: "Attendance record not found",
        data: null,
      });
    }

    res.status(200).json({
      status: 200,
      message: "Attendance updated successfully",
      data: attendance,
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
exports.deleteAttendance = async (req, res) => {
  try {
    const { id } = req.params;

    const attendance = await Attendance.findByIdAndDelete(id);

    if (!attendance) {
      return res.status(404).json({
        status: 404,
        message: "Attendance record not found",
        data: null,
      });
    }

    res.status(200).json({
      status: 200,
      message: "Attendance deleted successfully",
      data: attendance,
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
exports.addToWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const courseId = req.params.courseId;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ status: 404, message: "User not found" });
    }

    const courses = await Course.findOne({ _id: courseId });
    if (!courses) {
      return res
        .status(404)
        .json({ status: 404, message: "courses not found" });
    }

    const wishlist = await Wishlist.findOne({ user: userId });

    if (!wishlist) {
      const newWishlist = new Wishlist({
        user: userId,
        courses: [courseId],
      });

      await newWishlist.save();
    } else {
      if (!wishlist.courses.includes(courseId)) {
        wishlist.courses.push(courseId);
        await wishlist.save();
      }
    }

    res.status(200).json({
      status: 200,
      message: "courses added to wishlist successfully",
      data: wishlist,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Error adding courses to wishlist",
      error: error.message,
    });
  }
};
exports.getMyWishlist = async (req, res) => {
  try {
    const userId = req.user.id;

    const wishlist = await Wishlist.findOne({ user: userId }).populate(
      "courses"
    );

    if (!wishlist) {
      return res
        .status(404)
        .json({ status: 404, message: "Wishlist not found" });
    }

    res.status(200).json({ status: 200, data: wishlist.courses });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Error fetching wishlist",
      error: error.message,
    });
  }
};
exports.removeFromWishlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const courseId = req.params.courseId;

    const courses = await Course.findOne({ _id: courseId });
    if (!courses) {
      return res
        .status(404)
        .json({ status: 404, message: "courses not found" });
    }

    const wishlist = await Wishlist.findOne({ user: userId });

    if (!wishlist) {
      return res
        .status(404)
        .json({ status: 404, message: "Wishlist not found" });
    }

    wishlist.courses = wishlist.courses.filter(
      (id) => id.toString() !== courseId.toString()
    );

    await wishlist.save();

    res.status(200).json({
      status: 200,
      message: "courses removed from wishlist successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      message: "Error removing courses from wishlist",
      error: error.message,
    });
  }
};
exports.getAllSyllabus = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }

    const subscriptions = await UserSubscription.find({
      user: userId,
    }).populate("course");
    if (subscriptions.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "No enrolled courses found",
        data: null,
      });
    }

    const courseIds = subscriptions.map((sub) => sub.course._id);
    console.log("User course IDs:", courseIds);

    const syllabusEntries = await Syllabus.find({
      courseId: { $in: courseIds },
    });

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
exports.getAllTestSeries = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }

    const subscriptions = await UserSubscription.find({
      user: userId,
    }).populate("course");
    if (subscriptions.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "No enrolled courses found",
        data: null,
      });
    }

    const courseIds = subscriptions.map((sub) => sub.course._id);
    console.log("User course IDs:", courseIds);
    const testSeriesList = await TestSeries.find({
      courseId: { $in: courseIds },
    }).populate("courseId categoryId subCategoryId");

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
exports.getAllVideoLectures = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }

    const subscriptions = await UserSubscription.find({
      user: userId,
    }).populate("course");
    if (subscriptions.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "No enrolled courses found",
        data: null,
      });
    }

    const courseIds = subscriptions.map((sub) => sub.course._id);
    console.log("User course IDs:", courseIds);

    const videoLectures = await VideoLecture.find({
      courseId: { $in: courseIds },
    }).populate("courseId categoryId subCategoryId");

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
exports.getAllExamSchedules = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }

    const subscriptions = await UserSubscription.find({
      user: userId,
    }).populate("course");
    if (subscriptions.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "No enrolled courses found",
        data: null,
      });
    }

    const courseIds = subscriptions.map((sub) => sub.course._id);
    console.log("User course IDs:", courseIds);
    const examSchedules = await ExamSchedule.find({
      courseId: { $in: courseIds },
    }).populate("courseId categoryId subCategoryId");

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
exports.getAllRecordings = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }

    const subscriptions = await UserSubscription.find({
      user: userId,
    }).populate("course");
    if (subscriptions.length === 0) {
      return res.status(404).json({
        status: 404,
        message: "No enrolled courses found",
        data: null,
      });
    }

    const courseIds = subscriptions.map((sub) => sub.course._id);
    console.log("User course IDs:", courseIds);
    const recordings = await Recording.find({
      courseId: { $in: courseIds },
    }).populate("courseId categoryId subCategoryId");

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
exports.createSurveyForm = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      teacher,
      course,
      categoryId,
      subCategoryId,
      comment,
      rating,
      adminReply,
    } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }

    if (rating < 0 || rating > 5) {
      return res
        .status(400)
        .json({ status: 400, message: "Rating must be between 0 and 5" });
    }

    const newSurveyForm = new SurveyForm({
      user: userId,
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
exports.getAllSurveyForms = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }

    const surveyForms = await SurveyForm.find({ user: userId }).populate(
      "user teacher course categoryId subCategoryId"
    );
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
    const userId = req.user.id;
    const {
      teacher,
      course,
      categoryId,
      subCategoryId,
      comment,
      rating,
      adminReply,
    } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }

    if (rating < 0 || rating > 5) {
      return res
        .status(400)
        .json({ status: 400, message: "Rating must be between 0 and 5" });
    }

    const updatedSurveyForm = await SurveyForm.findByIdAndUpdate(
      req.params.id,
      {
        user: userId,
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
exports.searchCourses = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }

    const { search } = req.query;

    if (!search) {
      return res.status(400).json({
        status: 400,
        message: "Please provide a search parameter",
      });
    }

    const query = {
      $or: [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ],
    };

    const courses = await Course.find(query);

    res.status(200).json({
      status: 200,
      message: "Courses retrieved successfully",
      data: courses,
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
exports.getAllBehaviorNotes = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(userId);
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send({ status: 404, message: "User not found" });
    }

    const behaviorNotes = await BehaviorNote.find({ user: userId }).populate(
      "user teacher"
    );
    res.status(200).json({
      status: 200,
      message: "Behavior notes retrieved successfully",
      data: behaviorNotes,
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
exports.getBehaviorNoteById = async (req, res) => {
  try {
    const behaviorNote = await BehaviorNote.findById(req.params.id).populate(
      "user teacher"
    );
    if (!behaviorNote) {
      return res
        .status(404)
        .json({ status: 404, message: "Behavior note not found" });
    }
    res.status(200).json({
      status: 200,
      message: "Behavior note retrieved successfully",
      data: behaviorNote,
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

exports.updateUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions = {} } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (req.user.userType !== "ADMIN") {
      return res
        .status(403)
        .json({ message: "Unauthorized: Only admins can update permissions" });
    }

    if (user.userType !== "TEACHER" || user.userType !== "TEAM") {
      return res.status(400).json({ message: "Invalid user type" });
    }

    const permissionFields = [
      "coursesPermission",
      "bookStorePermission",
      "planPermission",
      "reportAndAnalyticPermission",
      "chatPermission",
      "marketingServicesPermission",
      "testPortalPermission",
      "peoplePermission",
    ];

    permissionFields.forEach((field) => {
      if (permissions.hasOwnProperty(field)) {
        user[field] = permissions[field];
      }
    });

    await user.save();

    return res.status(200).json({
      message: "Permissions updated successfully",
      user: {
        _id: user._id,
        userType: user.userType,
        permissions: permissionFields.reduce((acc, field) => {
          acc[field] = user[field];
          return acc;
        }, {}),
      },
    });
  } catch (error) {
    console.error("Error updating user permissions:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.getUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select(`
      userType 
      coursesPermission,
      bookStorePermission,
      planPermission,      
      reportAndAnalyticPermission,
      chatPermission,
      marketingServicesPermission,
      testPortalPermission,
      peoplePermission
    `);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (req.user.userType !== "ADMIN") {
      return res
        .status(403)
        .json({ message: "Unauthorized to view permissions" });
    }

    return res.status(200).json({
      message: "User permissions retrieved",
      permissions: {
        userType: user.userType,
        coursesPermission: user.coursesPermission,
        bookStorePermission: user.bookStorePermission,
        planPermission: user.planPermission,
        reportAndAnalyticPermission: user.reportAndAnalyticPermission,
        chatPermission: user.chatPermission,
        marketingServicesPermission: user.marketingServicesPermission,
        testPortalPermission: user.testPortalPermission,
        peoplePermission: user.peoplePermission,
      },
    });
  } catch (error) {
    console.error("Error retrieving user permissions:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ============================================================================
// 📝 ASSIGNMENT SUBMISSION FUNCTIONS
// ============================================================================

// Submit assignment for batch course
exports.submitAssignment = async (req, res) => {
  try {
    const AssignmentSubmission = require("../models/assignmentSubmissionModel");
    const Folder = require("../models/folderModel");
    const File = require("../models/fileModel");
    const multer = require('multer');
    const path = require('path');
    
    const userId = req.user._id;
    const { courseId, assignmentTitle, assignmentDescription, studentNotes } = req.body;
    
    console.log(`🔍 [DEBUG] Assignment submission for user ${userId}, courseRootFolder ${courseId}`);
    
    // Validate required fields
    if (!courseId || !assignmentTitle) {
      return res.status(400).json({
        status: 400,
        message: "Course ID and assignment title are required"
      });
    }
    
    // Check if user has access to the course
    const User = require("../models/userModel");
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        status: 404,
        message: "User not found"
      });
    }
    
    // Find the course by rootFolder ID
    const Course = require("../models/courseModel");
    const course = await Course.findOne({ rootFolder: courseId });
    
    if (!course) {
      return res.status(404).json({
        status: 404,
        message: "Course not found"
      });
    }
    
    // Check if user has access to this course
    const hasAccess = user.purchasedCourses.some(
      pc => pc.course.toString() === course._id.toString()
    );
    
    if (!hasAccess) {
      return res.status(403).json({
        status: 403,
        message: "You don't have access to this course"
      });
    }
    
    // Create or find Assignment folder in course structure
    let assignmentFolder = await Folder.findOne({ 
      name: "Assignments", 
      parentFolderId: courseId 
    });
    
    if (!assignmentFolder) {
      // Create Assignment folder
      assignmentFolder = new Folder({
        name: "Assignments",
        parentFolderId: courseId,
        files: [],
        folders: [],
        isSystemFolder: true,
        folderType: 'assignments'
      });
      await assignmentFolder.save();
      
      // Add to parent folder
      const parentFolder = await Folder.findById(courseId);
      if (parentFolder) {
        parentFolder.folders.push(assignmentFolder._id);
        await parentFolder.save();
      }
    }
    
    // Create student-specific folder inside Assignments
    const studentFolderName = `${user.firstName || 'Student'}_${user.phone || userId}`;
    let studentFolder = await Folder.findOne({ 
      name: studentFolderName, 
      parentFolderId: assignmentFolder._id 
    });
    
    if (!studentFolder) {
      studentFolder = new Folder({
        name: studentFolderName,
        parentFolderId: assignmentFolder._id,
        files: [],
        folders: [],
        isSystemFolder: true,
        folderType: 'student_assignments'
      });
      await studentFolder.save();
      
      // Add to assignment folder
      assignmentFolder.folders.push(studentFolder._id);
      await assignmentFolder.save();
    }
    
    // Process uploaded files and save to student folder
    const submittedFiles = [];
    
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const fileType = path.extname(file.originalname).toLowerCase();
        let fileTypeCategory = 'other';
        
        if (['.jpg', '.jpeg', '.png', '.gif', '.bmp'].includes(fileType)) {
          fileTypeCategory = 'image';
        } else if (fileType === '.pdf') {
          fileTypeCategory = 'pdf';
        } else if (['.doc', '.docx'].includes(fileType)) {
          fileTypeCategory = 'document';
        }
        
        // Create File model instance
        const fileDoc = new File({
          name: file.originalname,
          url: file.location, // AWS S3 URL (multerS3 provides this)
          type: fileTypeCategory,
          isViewable: true,
          isDownloadable: true
        });
        
        await fileDoc.save();
        
        // Add file to student folder
        studentFolder.files.push(fileDoc._id);
        
        submittedFiles.push({
          fileId: fileDoc._id, // Add the File model ID for streaming
          fileName: file.originalname,
          fileUrl: file.location,
          fileType: fileTypeCategory,
          fileSize: file.size,
          uploadedAt: new Date()
        });
      }
      
      await studentFolder.save();
    }
    
    // Create assignment submission record
    const assignmentSubmission = new AssignmentSubmission({
      student: userId,
      courseRootFolder: courseId,
      assignmentTitle: assignmentTitle.trim(),
      assignmentDescription: assignmentDescription ? assignmentDescription.trim() : '',
      submittedFiles: submittedFiles,
      studentNotes: studentNotes ? studentNotes.trim() : '',
      submissionStatus: 'submitted'
    });
    
    await assignmentSubmission.save();
    
    console.log(`✅ [DEBUG] Assignment submitted successfully: ${assignmentSubmission._id}`);
    
    res.status(201).json({
      status: 201,
      message: "Assignment submitted successfully",
      data: assignmentSubmission
    });
    
  } catch (error) {
    console.error("❌ Error submitting assignment:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to submit assignment",
      error: error.message
    });
  }
};

// Get user's assignment submissions
exports.getUserAssignments = async (req, res) => {
  try {
    const AssignmentSubmission = require("../models/assignmentSubmissionModel");
    const userId = req.user._id;
    
    console.log(`🔍 [DEBUG] Fetching assignments for user: ${userId}`);
    
    const assignments = await AssignmentSubmission.find({ student: userId })
      .populate('courseRootFolder', 'name')
      .populate('adminReview.reviewedBy', 'firstName lastName')
      .sort({ createdAt: -1 });
    
    console.log(`✅ [DEBUG] Found ${assignments.length} assignments for user`);
    console.log(`🔍 [DEBUG] Assignment details:`, assignments.map(a => ({
      id: a._id,
      title: a.assignmentTitle,
      courseRootFolder: a.courseRootFolder,
      submittedFiles: a.submittedFiles.length,
      createdAt: a.createdAt
    })));
    
    res.status(200).json({
      status: 200,
      message: "User assignments retrieved successfully",
      data: assignments
    });
    
  } catch (error) {
    console.error("❌ Error fetching user assignments:", error);
    res.status(500).json({
      status: 500,
      message: "Failed to fetch user assignments",
      error: error.message
    });
  }
};
