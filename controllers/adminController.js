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
const Product = require("../models/ProductModel");
const Cart = require("../models/cartModel");
const Address = require("../models/addressModel");
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
const { kpUpload1 } = require("../middlewares/fileUpload");

//
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const Faq = require("../models/faqModel");
const { createFolder } = require("./courseController");
const cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET,
});
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "Amitesh-Project/images/course",
    resource_type: "video",
    allowed_formats: ["mp4", "mov", "avi"],
  },
});
const upload = multer({ storage: storage }).array("courseVideo", 100);

const storage13 = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "Amitesh-Project/images/testSeries",
    resource_type: "raw",
    allowed_formats: [
      "jpg",
      "jpeg",
      "png",
      "PNG",
      "xlsx",
      "xls",
      "pdf",
      "PDF",
      "DOC",
      "DOCX",
      "doc",
      "docx",
      "txt",
    ],
  },
});
const TestSeriesUpload = multer({ storage: storage13 }).array("documents", 100);
//

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
      return res
        .status(200)
        .send({ message: "registered successfully ", data: userCreate });
    } else {
      return res.status(409).send({ message: "Already Exist", data: [] });
    }
  } catch (error) {
    console.error(error);
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

    // Send token in the header
    res.setHeader("Authorization", `Bearer ${accessToken}`);

    // Send response
    return res.status(201).send({ data: responseObj, accessToken });
  } catch (error) {
    console.error(error);
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
        return res
          .status(200)
          .send({ message: "Password update successfully.", data: updated });
      } else {
        return res
          .status(501)
          .send({ message: "Password Not matched.", data: {} });
      }
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
    console.error(error);
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

//Banner start from here
exports.getBannerById = async (req, res) => {
  try {
    const bannerId = req.params.bannerId;
    const Banner = await Banner.findById(bannerId).populate(
      "course subscription"
    );

    if (!Banner) {
      return res.status(404).json({ status: 404, message: "Banner not found" });
    }

    return res.status(200).json({ status: 200, data: Banner });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Error fetching Banner",
      error: error.message,
    });
  }
};

// Add a new banner// Add a new banner
exports.AddBanner = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ status: 400, error: "Image file is required" });
    }

    const {
      product,
      title,
      description,
      code,
      discountPercentage,
      validFrom,
      validTo,
      course,
      subscription,
      link,
    } = req.body;

    if (course && subscription) {
      const checkCategory = await Course.findById(course);
      const checkSubCategory = await Subscription.findById(subscription);
      // const checkProduct = await Product.findById(product);

      if (!checkCategory || !checkSubCategory) {
        return res.status(404).json({
          status: 404,
          message: "course subscription or Product not found",
        });
      }
    }

    const checkTitle = await Banner.findOne({ title });
    if (checkTitle) {
      return res
        .status(404)
        .json({ status: 404, message: "Title exists with this name" });
    }

    // const checkCode = await Banner.findOne({ code });
    // if (checkCode) {
    //     return res.status(404).json({ status: 404, message: 'Code exists with this name' });
    // }

    const banner = new Banner({
      // product,
      title,
      image: req.file.path,
      description,
      code,
      discountPercentage,
      validFrom,
      validTo,
      course,
      subscription,
      link,
    });

    await banner.save();

    return res.status(201).json({
      status: 201,
      message: "Banner created successfully",
      data: banner,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Error creating Banner",
      error: error.message,
    });
  }
};

exports.getBanner = async (req, res) => {
  try {
    const Banners = await Banner.find().populate("course subscription");
    return res.status(200).json({ status: 200, data: Banners });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Error fetching Banners",
      error: error.message,
    });
  }
};

exports.getBanner = async (req, res) => {
  try {
    const Banners = await Banner.find().populate("course subscription");
    return res.status(200).json({ status: 200, data: Banners });
  } catch (error) {
    console.error(error);
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
    const updateData = { ...req.body };

    if (req.file) {
      updateData.image = req.file.path;
    }

    const updatedBanner = await Banner.findByIdAndUpdate(id, updateData, {
      new: true,
    });
    if (!updatedBanner) {
      return res.status(404).json({ status: 404, message: "Banner not found" });
    }

    return res.status(200).json({
      status: 200,
      message: "Banner updated successfully",
      data: updatedBanner,
    });
  } catch (error) {
    console.error("Error updating Banner:", error);
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
    const deletedBanner = await Banner.findByIdAndDelete(id);
    if (!deletedBanner) {
      return res.status(404).json({ error: "Banner not found" });
    }

    res.status(200).json({ message: "Banner deleted successfully" });
  } catch (error) {
    console.error("Error deleting banner:", error);
    res.status(500).json({ error: "Failed to delete banner" });
  }
};

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

    // Validate courseId
    if (!courseId) {
      throw new Error("Invalid courseId: courseId is required.");
    }
    // Validate validities array
    if (!Array.isArray(validities) || validities.length === 0) {
      throw new Error("Invalid validities: must be a non-empty array.");
    }
    // Validate gst and internetHandling
    const gstPercentage = typeof gst === "number" && gst >= 0 ? gst : 0;
    const internetHandlingPercentage =
      typeof internetHandling === "number" && internetHandling >= 0
        ? internetHandling
        : 0;

    for (const validity of validities) {
      const planType = `${validity.validity} months`;
      const price = validity.price;
      const discount = validity.discount || 0;

      console.log(
        `Creating plan for ${planType} → Price: ${price}, Discount: ${discount}%`
      );

      const discountAmount = (price * discount) / 100;
      let totalAmount = price - discountAmount;

      const gstAmount = (totalAmount * gstPercentage) / 100;
      const internetHandlingCharge =
        (totalAmount * internetHandlingPercentage) / 100;

      totalAmount += gstAmount + internetHandlingCharge;

      console.log(`total Amount for ${planType} validity is ${totalAmount}`);

      const existingPlan = await Installment.findOne({ courseId, planType });

      const oneTimeInstallments = [
        {
          amount: totalAmount.toFixed(2),
          dueDate: "DOP",
          isPaid: false,
        },
      ];

      if (existingPlan) {
        // Update existing one-time plan
        existingPlan.numberOfInstallments = 1;
        existingPlan.installments = oneTimeInstallments;
        existingPlan.totalAmount = totalAmount.toFixed(2);
        existingPlan.remainingAmount = totalAmount.toFixed(2);

        await existingPlan.save();
        console.log(`Updated one-time plan for ${planType}`);
      } else {
        // Create new one-time plan
        const newInstallmentPlan = new Installment({
          courseId,
          planType,
          numberOfInstallments: 1,
          installments: oneTimeInstallments,
          totalAmount: totalAmount.toFixed(2),
          remainingAmount: totalAmount.toFixed(2),
        });

        await newInstallmentPlan.save();
        console.log(`Created one-time plan for ${planType}`);
      }
    }
  } catch (error) {
    console.error("Error in createOneTimeInstallmentsForValidities:", error);
  }
};

exports.createSubscription = async (req, res) => {
  try {
    // Destructure the request body
    const {
      course, // This should still be the course ID from the request
      name,
      description,
      type,
      validities,
      features, // New field for subscription features
      pdfDownloadPermissionsApp,
      pdfDownloadInDevice,
      pdfDownloadWithinApp,
      pdfPermissionsWeb,
      pdfViewAccess,
      pdfDownloadAccess,
      gst, // New GST field
      internetHandling, // New Internet Handling Charges field
    } = req.body;

    // Validate course existence and fetch full course data
    console.log("course from createSubscription :", req.body);
    let courseData = null;
    if (course) {
      courseData = await Course.findById(course);
      if (!courseData) {
        return res
          .status(404)
          .json({ status: 404, message: "Course not found" });
      }
    }

    // Check if a subscription already exists for this course
    const existingSubscription = await Subscription.findOne({
      course: courseData._id,
    });
    if (existingSubscription) {
      return res.status(400).json({
        status: 400,
        message: "A subscription for this course already exists",
      });
    }

    // Validate type of subscription
    const validTypes = ["Basic", "Premium", "Recording"];
    if (type && !validTypes.includes(type)) {
      return res.status(400).json({
        status: 400,
        message: `Invalid subscription type. Allowed types: ${validTypes.join(
          ", "
        )}`,
      });
    }

    // Validate validities
    if (validities && !Array.isArray(validities)) {
      return res
        .status(400)
        .json({ status: 400, message: "Validities should be an array" });
    }

    // Validate features if provided
    if (features && !Array.isArray(features)) {
      return res
        .status(400)
        .json({ status: 400, message: "Features should be an array" });
    }

    // Validate GST and Internet Handling Charges
    if (gst && (typeof gst !== "number" || gst < 0)) {
      return res.status(400).json({
        status: 400,
        message: "GST must be a non-negative number",
      });
    }

    if (
      internetHandling &&
      (typeof internetHandling !== "number" || internetHandling < 0)
    ) {
      return res.status(400).json({
        status: 400,
        message: "Internet Handling Charges must be a non-negative number",
      });
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

    // Find the lowest price in validities
    if (validities.length > 0) {
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

      courseData.price = lowestDiscountedPrice;
      courseData.discount = correspondingDiscount;
      courseData.oldPrice = basePrice;

      await courseData.save();
    }

    // Save the subscription to the database
    const savedSubscription = await newSubscription.save();
    console.log("here is the  Newly saved subscription :", savedSubscription);
    // console.log("couserData from Newly created subscription :", courseData);
    try {
      await createOneTimeInstallmentsForValidities(
        courseData._id,
        validities,
        savedSubscription.gst,
        savedSubscription.internetHandling
      );
    } catch (err) {
      console.error("Error creating one-time installments:", err);
      // Optional: log it somewhere or alert admin if mission-critical
    }

    return res.status(201).json({
      status: 201,
      message: "Subscription created successfully",
      data: savedSubscription,
    });
  } catch (error) {
    console.error("Error in creating subscription:", error.message);
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
    const { id } = req.params; // Get subscription ID from URL parameters
    const updateData = req.body; // Data to update from the request body

    // Fetch the current subscription to compare changes, particularly for validities
    const currentSubscription = await Subscription.findById(id).populate(
      "course"
    );

    // Validate the provided course ID, if it's being updated
    if (
      updateData.course &&
      updateData.course.toString() !== currentSubscription.course._id.toString()
    ) {
      const courseData = await Course.findById(updateData.course);
      if (!courseData) {
        return res
          .status(404)
          .json({ status: 404, message: "Course not found" });
      }
      updateData.course = courseData._id; // Ensure only the course ID is stored
    }

    // Validate the type of subscription, if it's being updated
    const validTypes = ["Basic", "Premium", "Recording"];
    if (updateData.type && !validTypes.includes(updateData.type)) {
      return res.status(400).json({
        status: 400,
        message: `Invalid subscription type. Allowed types: ${validTypes.join(
          ", "
        )}`,
      });
    }

    // Handling removed validities
    const removedValidities = currentSubscription.validities.filter(
      (v) => !updateData.validities.some((uv) => uv.validity === v.validity)
    );

    for (const validity of removedValidities) {
      const associatedInstallments = await Installment.find({
        courseId: currentSubscription.course,
        planType: `${validity.validity} months`,
      });
      if (associatedInstallments.length > 0) {
        return res.status(400).json({
          status: 400,
          message: `Cannot remove validity of ${validity.validity} months as there are existing installments linked to it.`,
        });
      }
    }

    // Validate validities, if being updated
    if (updateData.validities && !Array.isArray(updateData.validities)) {
      return res
        .status(400)
        .json({ status: 400, message: "Validities should be an array" });
    }

    // Validate features, if being updated
    if (updateData.features && !Array.isArray(updateData.features)) {
      return res
        .status(400)
        .json({ status: 400, message: "Features should be an array" });
    }

    // Validate GST, if being updated
    if (
      updateData.gst !== undefined &&
      (typeof updateData.gst !== "number" || updateData.gst < 0)
    ) {
      return res.status(400).json({
        status: 400,
        message: "GST must be a non-negative number",
      });
    }

    // Validate Internet Handling Charges, if being updated
    if (
      updateData.internetHandling !== undefined &&
      (typeof updateData.internetHandling !== "number" ||
        updateData.internetHandling < 0)
    ) {
      return res.status(400).json({
        status: 400,
        message: "Internet Handling Charges must be a non-negative number",
      });
    }

    // Update the subscription
    await Subscription.findByIdAndUpdate(id, updateData, { new: true });

    // Re-fetch the subscription to include populated course data
    const updatedSubscription = await Subscription.findById(id).populate(
      "course"
    );

    if (!updatedSubscription) {
      return res.status(404).json({
        status: 404,
        message: "Subscription not found",
        data: null,
      });
    }

    return res.status(200).json({
      status: 200,
      message: "Subscription updated successfully",
      data: updatedSubscription,
    });
  } catch (error) {
    console.error("Error updating subscription:", error.message);
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

    // First, find the subscription by ID to access the course ID before deleting
    const subscription = await Subscription.findById(id);
    if (!subscription) {
      return res.status(404).json({
        status: 404,
        message: "Subscription not found",
        data: null,
      });
    }

    // Delete the subscription
    const deletedSubscription = await Subscription.findByIdAndDelete(id);
    if (!deletedSubscription) {
      return res.status(404).json({
        status: 404,
        message: "Subscription not found",
        data: null,
      });
    }

    // Delete related installments based on the course ID of the deleted subscription
    const { course } = deletedSubscription;
    await Installment.deleteMany({ courseId: course });

    return res.status(200).json({
      status: 200,
      message: "Subscription and related installments deleted successfully",
      data: {
        subscription: deletedSubscription,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message:
        "Server error while deleting subscription and related installments",
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
exports.createCourse = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      title,
      description,
      subject,
      price,
      oldPrice,
      startDate,
      endDate,
      discount,
      duration,
      lessons,
      weeks,
      subCategory,
      approvalStatus,
      courseType,
      faqs,
    } = req.body;

    console.log("FAQs:", faqs);
    console.log("Type of FAQs:", typeof faqs);

    // Ensure description is an array
    const descriptionArray = Array.isArray(description)
      ? description
      : [description];

    // Validate subCategory ID
    if (!subCategory || !mongoose.Types.ObjectId.isValid(subCategory)) {
      return res
        .status(400)
        .json({ message: "Invalid or missing subCategory ID." });
    }

    // Check for duplicate course
    const existingCourse = await Course.findOne({ title });
    if (existingCourse) {
      return res
        .status(400)
        .json({ message: "Course with this title already exists." });
    }

    // Validate subCategory and get category ID
    const categoryDoc = await CourseCategory.findOne({
      "subCategories._id": subCategory,
    });
    if (!categoryDoc) {
      return res
        .status(404)
        .json({ message: "Specified subCategory does not exist." });
    }
    const category = categoryDoc._id;

    // Handle file uploads
    let courseImage = [];
    let courseNotes = [];
    let courseVideo = [];
    if (req.files) {
      if (req.files["courseImage"]) {
        courseImage = req.files["courseImage"].map((file) => file.location);
      }
      if (req.files["courseNotes"]) {
        courseNotes = req.files["courseNotes"].map((file) => file.location);
      }
      if (req.files["courseVideo"]) {
        courseVideo = req.files["courseVideo"].map((file) => ({
          url: file.location,
          type: "Free",
        }));
      }
    }

    // Create the course
    const course = new Course({
      title,
      description: descriptionArray,
      subject,
      price,
      oldPrice,
      startDate,
      endDate,
      discount,
      duration,
      lessons,
      weeks,
      courseImage,
      courseNotes,
      courseVideo,
      category,
      subCategory,
      approvalStatus,
      courseType,
    });

    await course.save({ session });

    // Handle FAQs
    let faqIds = [];
    if (faqs && faqs.length > 0) {
      const parsedFaqs = typeof faqs === "string" ? JSON.parse(faqs) : faqs;
      if (!Array.isArray(parsedFaqs)) {
        return res.status(400).json({ message: "FAQs must be an array." });
      }
      const faqsToInsert = parsedFaqs.map((faq) => ({
        ...faq,
        course: course._id,
      }));
      const newFaqs = await Faq.insertMany(faqsToInsert, { session });
      faqIds = newFaqs.map((faq) => faq._id);
    }
    course.faqs = faqIds;
    await course.save({ session });

    // Add course to subCategory
    await CourseCategory.updateOne(
      { "subCategories._id": subCategory },
      { $push: { "subCategories.$.courses": course._id } },
      { session }
    );

    // Automatically create a root folder for the course by calling createFolder controller
    const folderReqBody = {
      name: `${title}`, // Root folder name
      courseId: course._id, // Attach course ID
    };
    const folderReq = { body: folderReqBody }; // Mock the request to pass to createFolder controller
    // Call createFolder controller and get the folder response
    const folderResponse = await createFolder(folderReq);
    const rootFolderId = folderResponse._id; // Assuming createFolder returns the created folder object

    // Step 4: Update course with rootFolder
    course.rootFolder = rootFolderId;
    await course.save({ session });
    // Commit the transaction
    await session.commitTransaction();
    session.endSession();
    res
      .status(201)
      .json({ message: "Course created successfully.", data: { course } });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error at createCourse:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.getAllCourses = async (req, res) => {
  try {
    // const {userType}=req.user;
    // const filter = userType === "USER"
    //     ? { isPublished: true } // Show only published courses for users
    //     : {}; // No filter for other user types (e.g., admin)

    const courses = await Course.find().populate("subjects");
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
    const {
      title,
      description,
      subject,
      price,
      oldPrice,
      startDate,
      endDate,
      discount,
      duration,
      lessons,
      weeks,
      subCategory,
      approvalStatus,
      courseType,
    } = req.body;

    // Find the existing course
    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({ status: 404, message: "Course not found" });
    }

    // Ensure description is an array
    if (description) {
      var descriptionArray = Array.isArray(description)
        ? description
        : [description];
    }

    // Validate subCategory if provided and different from current
    if (subCategory && subCategory !== course.subCategory) {
      if (!mongoose.Types.ObjectId.isValid(subCategory)) {
        return res
          .status(400)
          .json({ status: 400, message: "Invalid subCategory ID format." });
      }
      const categoryDoc = await CourseCategory.findOne({
        "subCategories._id": subCategory,
      });
      if (!categoryDoc) {
        return res.status(404).json({
          status: 404,
          message: "Specified subCategory does not exist.",
        });
      }

      // Update category if subCategory is changed
      await CourseCategory.updateOne(
        { "subCategories._id": course.subCategory },
        { $pull: { "subCategories.$.courses": course._id } }
      );
      await CourseCategory.updateOne(
        { "subCategories._id": subCategory },
        { $push: { "subCategories.$.courses": course._id } }
      );

      course.subCategory = subCategory;
      course.category = categoryDoc._id;
    }

    // Check for unique title, excluding the current course
    if (title && title !== course.title) {
      const existingCourse = await Course.findOne({ title });
      if (existingCourse) {
        return res.status(400).json({
          status: 400,
          message: "Course with this title already exists.",
        });
      }
      course.title = title;
    }

    // Handle file uploads
    if (req.files) {
      if (req.files["courseImage"]) {
        course.courseImage = req.files["courseImage"].map(
          (file) => file.location
        );
      }
      if (req.files["courseNotes"]) {
        course.courseNotes = req.files["courseNotes"].map(
          (file) => file.location
        );
      }
      if (req.files["courseVideo"]) {
        course.courseVideo = req.files["courseVideo"].map((file) => ({
          url: file.location,
          type: "Free",
        }));
      }
    }

    // Update fields only if values are provided
    course.description = descriptionArray || course.description;
    course.subject = subject || course.subject;
    course.price = price || course.price;
    course.oldPrice = oldPrice || course.oldPrice;
    course.startDate = startDate || course.startDate;
    course.endDate = endDate || course.endDate;
    course.discount = discount || course.discount;
    course.duration = duration || course.duration;
    course.lessons = lessons || course.lessons;
    course.weeks = weeks || course.weeks;
    course.approvalStatus = approvalStatus || course.approvalStatus;
    course.courseType = courseType || course.courseType;

    // Save the updated course in the database
    await course.save();

    return res.status(200).json({
      status: 200,
      message: "Course updated successfully.",
      data: course,
    });
  } catch (error) {
    console.error("Error:", error);
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

    // Find and delete the course
    const course = await Course.findById(id).populate("rootFolder");
    if (!course) {
      return res.status(404).json({ status: 404, message: "Course not found" });
    }

    //recursively delete its rootfolder and everything inside
    if (course.rootFolder) {
      await deleteFolder(course.rootFolder);
    }

    await course.deleteOne();

    return res.status(200).json({
      status: 200,
      message: "Course and related content deleted successfully",
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};

async function deleteFolder(folder) {
  if (!folder) return;

  try {
    // Delete all subfolders recursively
    if (folder.folders && Array.isArray(folder.folders)) {
      for (const subfolderId of folder.folders) {
        const subfolder = await Folder.findById(subfolderId);
        if (subfolder) {
          await deleteFolder(subfolder);
        }
      }
    }

    // Delete all files
    if (folder.files && Array.isArray(folder.files)) {
      for (const fileId of folder.files) {
        const file = await File.findById(fileId);
        if (file) {
          await file.deleteOne();
        }
      }
    }

    // Delete the folder itself
    await folder.deleteOne();
  } catch (error) {
    console.error(`Error deleting folder: ${error.message}`);
    // You might want to throw the error here depending on your error handling strategy
  }
}

exports.togglePublishCourse = async (req, res) => {
  try {
    const { id } = req.params; // Extract course ID from the request parameters
    const { isPublished } = req.body; // Extract isPublished flag from the request body

    // Validate input
    if (typeof isPublished !== "boolean") {
      return res.status(400).json({
        status: 400,
        message: "'isPublished' must be a boolean value (true or false).",
      });
    }

    // Find the course by ID
    const course = await Course.findById(id);

    if (!course) {
      return res.status(404).json({
        status: 404,
        message: "Course not found.",
      });
    }

    // Update the isPublished field
    course.isPublished = isPublished;
    await course.save();

    return res.status(200).json({
      status: 200,
      message: `Course successfully ${
        isPublished ? "published" : "unpublished"
      }.`,
      data: course,
    });
  } catch (error) {
    console.error("Error in togglePublishCourse:", error);
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

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ status: 404, message: "Course not found" });
    }

    const teacher = await User.findById(teacherId);
    if (!teacher || teacher.userType !== "TEACHER") {
      return res
        .status(404)
        .json({ status: 404, message: "Teacher not found" });
    }
    course.teacher = teacherId;
    await course.save();

    return res.status(200).json({
      status: 200,
      message: "Teacher added to course successfully",
      data: course,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};
exports.removeTeacherFromCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ status: 404, message: "Course not found" });
    }

    course.teacher = null;
    await course.save();

    return res.status(200).json({
      status: 200,
      message: "Teacher removed from course successfully",
      data: course,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: 500, message: "Server error", error });
  }
};

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
  let findCategory = await CourseCategory.find();

  return res
    .status(200)
    .json({ message: "Category Found", status: 200, data: findCategory });
  // } else {
  //     return res.status(404).json({ message: "Category not Found", status: 404, data: {}, });
  // }
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
  const { id } = req.params;
  const category = await CourseCategory.findById(id);
  if (!category) {
    return res
      .status(404)
      .json({ message: "Sub Category Not Found", status: 404, data: {} });
  } else {
    await CourseCategory.findByIdAndDelete(category._id);
    return res
      .status(200)
      .json({ message: "Sub Category Deleted Successfully !" });
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
          const newFile = new File({
            url: file.location, // S3 URL
            name: title || file.originalname, // File name
            description: description || "", // Description
          });

          const savedFile = await newFile.save();
          createdFiles.push(savedFile._id);
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

          const newFile = new File({
            name: title || file.originalname, // Default to filename if title is not provided
            url: directUrl,
            description: description || "", // Default to empty string if description is not provided
          });

          return newFile.save(); // Save each file document
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
exports.createProduct = async (req, res) => {
  try {
    const { productName, description, price, categoryId, color, stock } =
      req.body;

    const images = req.files.map((file) => ({
      url: file.path,
    }));

    const categories = await Category.findById(categoryId);
    if (!categories) {
      return res
        .status(404)
        .json({ status: 404, message: "categories not found" });
    }

    const product = new Product({
      productName,
      description,
      image: images,
      price,
      categoryId,
      color,
      stock,
    });

    await product.save();

    return res.status(201).json({
      status: 201,
      message: "Product created successfully",
      data: product,
    });
  } catch (error) {
    console.error(error);
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

    let updatedFields = {
      ...req.body,
    };

    if (updatedFields.subCategoryId) {
      const subCategories = await SubCategory.findById(
        updatedFields.subcategoryId
      );

      if (!subCategories) {
        return res
          .status(404)
          .json({ status: 404, message: "subCategories not found" });
      }
    }

    if (updatedFields.categoryId) {
      const categories = await Category.findById(updatedFields.categoryId);
      if (!categories) {
        return res
          .status(404)
          .json({ status: 404, message: "categories not found" });
      }
    }
    if (updatedFields.subCategoryId) {
      const subCategories = await Category.findById(
        updatedFields.subCategoryId
      );
      if (!subCategories) {
        return res
          .status(404)
          .json({ status: 404, message: "subCategories not found" });
      }
    }

    if (req.files && req.files.length > 0) {
      const images = req.files.map((file) => ({
        url: file.path,
      }));

      updatedFields.image = images;
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      updatedFields,
      { new: true }
    );

    if (!updatedProduct) {
      return res
        .status(404)
        .json({ status: 404, message: "Product not found" });
    }

    return res.status(200).json({
      status: 200,
      message: "Product updated successfully",
      data: updatedProduct,
    });
  } catch (error) {
    console.error(error);
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
