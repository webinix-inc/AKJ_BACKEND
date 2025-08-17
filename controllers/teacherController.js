require('dotenv').config()
const mongoose= require('mongoose');
const Teacher= require('../models/teacherModel');
const User = require('../models/userModel');
const authConfig = require("../configs/auth.config");
const jwt = require("jsonwebtoken");
const newOTP = require("otp-generators");
const bcrypt = require("bcryptjs");
const Banner = require('../models/bannerModel');
const Subscription = require('../models/subscriptionModel');
const UserSubscription = require('../models/userSubscriptionModel');
const Subject = require('../models/subjectModel');
// const Privacy = require("../models/privacyPolicyModel"); // UNUSED - Removed
// const AboutUs = require("../models/aboutUsModel"); // UNUSED - Removed
const Course = require('../models/courseModel');
const Notification = require('../models/notificationModel');
const Message = require('../models/messageModel');
const Schedule = require('../models/scheduleModel');
// const Category = require('../models/course/courseCategory'); // DUPLICATE - Removed (same as CourseCategory)
// const Product = require('../models/ProductModel'); // UNUSED - Removed
// const Cart = require('../models/cartModel'); // UNUSED - Removed
// const Address = require("../models/addressModel"); // UNUSED - Removed
// const Order = require('../models/orderModel'); // UNUSED - Removed
const CourseCategory = require('../models/course/courseCategory');
const CourseSubCategory = require('../models/course/courseSubCategory');
const NoticeBoard = require('../models/noticeBoardModel');
const Syllabus = require('../models/syllabusModel');
const TestSeries = require('../models/testSeriesModel');
const VideoLecture = require('../models/videoLectureModel');
const ExamSchedule = require('../models/examScheduleModel');
const Recording = require('../models/recordingModel');
const SurveyForm = require('../models/surveyModel');
const FollowUs = require('../models/followusModel');
const BehaviorNote = require('../models/behaviourModel');

const reffralCode = async () => {
    var digits = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let OTP = '';
    for (let i = 0; i < 9; i++) {
        OTP += digits[Math.floor(Math.random() * 36)];
    }
    return OTP;
}

exports.registerTeacher = async (req, res) => {
    try {
        const { 
            email, 
            mobileNumber, 
            password, 
            confirmPassword, 
            firstName, 
            lastName, 
            experience, 
            userBio, 
            courses,
            permissions // Include permissions in the request body
        } = req.body;

        const parsedPermissions = JSON.parse(permissions)

        // Validate admin access
        if (req.user.userType !== "ADMIN") {
            return res.status(401).json({ status: 401, message: "Unauthorized access! Only admins are allowed." });
        }

        // Validate phone number
        if (!mobileNumber || mobileNumber.trim() === '') {
            return res.status(400).json({ status: 400, message: "Phone number is required." });
        }
        const phoneRegex = /^[0-9]{10}$/;
        if (!phoneRegex.test(mobileNumber)) {
            return res.status(400).json({ status: 400, message: "Invalid phone number format." });
        }

        // Validate email
        if (!email || email.trim() === '') {
            return res.status(400).json({ status: 400, message: "Email is required." });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ status: 400, message: "Invalid email format." });
        }

        // Check if email is already registered
        const existingInstructor = await User.findOne({ email });
        if (existingInstructor) {
            return res.status(409).json({ status: 409, message: 'Email is already registered.' });
        }

        // Validate password match
        if (password !== confirmPassword) {
            return res.status(400).json({ status: 400, message: 'Password and confirm password do not match.' });
        }

        // Process image upload
        let image = '';
        if (req.file) {
            image = req.file.path;
        }

        // Generate OTP and hash password
        const otp = newOTP.generate(4, { alphabets: false, upperCase: false, specialChar: false });
        const otpExpiration = new Date(Date.now() + 5 * 60 * 1000);
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Default permissions
        const defaultPermissions = {
            coursesPermission: true,
            bookStorePermission: true,
            planPermission: true,
            reportAndAnalyticPermission: true,
            chatPermission: true,
            marketingServicesPermission: true,
            testPortalPermission: true,
            peoplePermission: true,
        };

        // Merge permissions with defaults (if provided)
        const finalPermissions = { ...defaultPermissions, ...(parsedPermissions || {})};
        
        // Create the new instructor
        const newInstructor = new User({
            email,
            password: hashedPassword,
            phone: mobileNumber,
            firstName,
            lastName,
            otherImage: image,
            otp,
            otpExpiration,
            accountVerification: false,
            userType: "TEACHER",
            experience,
            userBio,
            refferalCode: await reffralCode(),
            ...finalPermissions
        });


        await newInstructor.save();

        // Handle course assignments (if any)
        const courseAssignmentResult = {
            addedCourses: [],
            duplicateCourses: [],
            missingCourses: [],
            totalAddedCourses: 0
        };

        if (courses && Array.isArray(courses) && courses.length > 0) {
            setImmediate(async () => {
                try {
                    const validCourses = await Course.find({ _id: { $in: courses } });
                    const validCourseIds = validCourses.map(course => course._id.toString());

                    let teacher = await Teacher.findOne({ user: newInstructor._id });
                    if (!teacher) {
                        teacher = new Teacher({
                            user: newInstructor._id,
                            courses: []
                        });
                    }

                    const newCourses = courses.filter(courseId =>
                        validCourseIds.includes(courseId.toString()) &&
                        !teacher.courses.some(existingCourseId => existingCourseId.toString() === courseId.toString())
                    );

                    if (newCourses.length > 0) {
                        teacher.courses.push(...newCourses.map(courseId => new mongoose.Types.ObjectId(courseId)));
                        await teacher.save();

                        if (!newInstructor.teacherProfile) {
                            newInstructor.teacherProfile = teacher._id;
                            await newInstructor.save();
                        }

                        courseAssignmentResult.addedCourses = validCourses
                            .filter(course => newCourses.includes(course._id.toString()))
                            .map(course => ({
                                _id: course._id,
                                title: course.title,
                            }));

                        courseAssignmentResult.duplicateCourses = courses.filter(courseId =>
                            teacher.courses.some(existingCourseId => existingCourseId.toString() === courseId.toString())
                        );

                        courseAssignmentResult.missingCourses = courses.filter(courseId => 
                            !validCourseIds.includes(courseId.toString())
                        );

                        courseAssignmentResult.totalAddedCourses = newCourses.length;
                    }
                } catch (error) {
                    console.error('Error in background course assignment:', error);
                }
            });
        }

        return res.status(201).json({
            status: 201,
            message: 'Instructor registered successfully.',
            data: newInstructor
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: 500, message: 'An error occurred while registering the instructor.', error: error.message });
    }
};




exports.registration = async (req, res) => {
    try {
        const user = await User.findOne({ _id: req.user._id });
        if (user) {
            if (req.body.refferalCode == null || req.body.refferalCode == undefined) {
                req.body.otp = newOTP.generate(4, { alphabets: false, upperCase: false, specialChar: false, });
                // req.body.otpExpiration = new Date(Date.now() + 5 * 60 * 1000);
                req.body.otpExpiration = new Date(Date.now() + 30 * 1000);
                req.body.accountVerification = false;
                req.body.refferalCode = await reffralCode();
                req.body.completeProfile = true;
                const userCreate = await User.findOneAndUpdate({ _id: user._id }, req.body, { new: true, });
                let obj = { id: userCreate._id, completeProfile: userCreate.completeProfile, phone: userCreate.phone }
                return res.status(200).send({ status: 200, message: "Registered successfully ", data: obj, });
            } else {
                const findUser = await User.findOne({ refferalCode: req.body.refferalCode });
                if (findUser) {
                    req.body.otp = newOTP.generate(4, { alphabets: false, upperCase: false, specialChar: false, });
                    // req.body.otpExpiration = new Date(Date.now() + 5 * 60 * 1000);
                    req.body.otpExpiration = new Date(Date.now() + 30 * 1000);
                    req.body.accountVerification = false;
                    req.body.userType = "TEACHER";
                    req.body.refferalCode = await reffralCode();
                    req.body.refferUserId = findUser._id;
                    req.body.completeProfile = true;
                    const userCreate = await User.findOneAndUpdate({ _id: user._id }, req.body, { new: true, });
                    if (userCreate) {
                        let updateWallet = await User.findOneAndUpdate({ _id: findUser._id }, { $push: { joinUser: userCreate._id } }, { new: true });
                        let obj = { id: userCreate._id, completeProfile: userCreate.completeProfile, phone: userCreate.phone }
                        return res.status(200).send({ status: 200, message: "Registered successfully ", data: obj, });
                    }
                } else {
                    return res.status(404).send({ status: 404, message: "Invalid refferal code", data: {} });
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
        const user = await User.findOne({ $and: [{ $or: [{ email }, { phone }] }, { userType: "TEACHER" }] });
        if (user) {
            jwt.sign({ id: user._id }, authConfig.secret, (err, token) => {
                if (err) {
                    return res.status(401).send("Invalid Credentials");
                } else {
                    return res.status(200).json({ status: 200, msg: "Login successfully", userId: user._id, token: token, });
                }
            });
        } else {
            let refferalCode = await reffralCode();
            const newUser = await User.create({ firstName, lastName, phone, email, refferalCode, userType: "TEACHER" });
            if (newUser) {
                jwt.sign({ id: newUser._id }, authConfig.secret, (err, token) => {
                    if (err) {
                        return res.status(401).send("Invalid Credentials");
                    } else {
                        console.log(token);
                        return res.status(200).json({ status: 200, msg: "Login successfully", userId: newUser._id, token: token, });
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
        if (!phone || phone.trim() === '') {
            return res.status(400).json({ status: 400, message: "Phone number is required" });
        }

        const user = await User.findOne({ $and: [{ $or: [{ email: phone, }, { phone: phone, }], userType: "TEACHER" }] });
        if (!user) {
            return res.status(400).json({ status: 400, message: "User not registred" });
        }
        const userObj = {};
        userObj.otp = newOTP.generate(4, { alphabets: false, upperCase: false, specialChar: false, });
        // userObj.otpExpiration = new Date(Date.now() + 5 * 60 * 1000);
        userObj.otpExpiration = Date.now() + 30 * 1000;
        userObj.accountVerification = false;
        const updated = await User.findOneAndUpdate({ $and: [{ $or: [{ email: phone, }, { phone: phone, }], userType: "TEACHER" }] }, userObj, { new: true, });
        let obj = { id: updated._id, otp: updated.otp, phone: updated.phone }
        return res.status(200).send({ status: 200, message: "logged in successfully", data: obj });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Server error" });
    }
};

exports.verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).send({ message: "user not found" });
        }
        if (user.otp !== otp || user.otpExpiration < Date.now()) {
            return res.status(400).json({ message: "Invalid or expired OTP" });

        }
        const updated = await User.findByIdAndUpdate({ _id: user._id }, { accountVerification: true }, { new: true });
        const accessToken = await jwt.sign({ id: user._id }, authConfig.secret, {
            expiresIn: authConfig.accessTokenTime,
        });
        let obj = {
            userId: updated._id,
            otp: updated.otp,
            phone: updated.phone,
            token: accessToken,
            completeProfile: updated.completeProfile
        }
        return res.status(200).send({ status: 200, message: "logged in successfully", data: obj });
    } catch (err) {
        console.log(err.message);
        return res.status(500).send({ error: "internal server error" + err.message });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const data = await User.findOne({ _id: req.user._id, })
        if (data) {
            return res.status(200).json({ status: 200, message: "get Profile", data: data });
        } else {
            return res.status(404).json({ status: 404, message: "No data found", data: {} });
        }
    } catch (error) {
        console.log(error);
        return res.status(501).send({ status: 501, message: "server error.", data: {}, });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const data = await User.findOne({ _id: req.user._id });
        if (!data) {
            return res.status(404).json({ status: 404, message: "No data found", data: {} });
        }

        let image = data.image;
        let otherImage = data.otherImage;

        if (req.files) {
            if (req.files['image']) {
                image = req.files['image'][0].path;
            }
            if (req.files['otherImage']) {
                otherImage = req.files['otherImage'][0].path;
            }
        }

        let obj = {
            firstName: req.body.firstName || data.firstName,
            lastName: req.body.lastName || data.lastName,
            fullName: req.body.fullName || data.fullName,
            email: req.body.email || data.email,
            phone: req.body.phone || data.phone,
            gender: req.body.gender || data.gender,
            alternatePhone: req.body.alternatePhone || data.alternatePhone,
            dob: req.body.dob || data.dob,
            address1: req.body.address1 || data.address1,
            address2: req.body.address2 || data.address2,
            transportation: req.body.transportation || data.transportation,
            experience: req.body.experience || data.experience,
            image: image,
            otherImage: otherImage,
            completeProfile: true
        };

        console.log('Update Object:', obj);
        console.log('Request Body:', req.body);

        let update = await User.findByIdAndUpdate({ _id: data._id }, { $set: obj }, { new: true });

        if (update) {
            return res.status(200).json({ status: 200, message: "Update profile successfully.", data: update });
        } else {
            return res.status(404).json({ status: 404, message: "Failed to update profile", data: {} });
        }
    } catch (error) {
        console.error(error);
        return res.status(501).send({ status: 501, message: "Server error.", data: {}, });
    }
};

exports.resendOTP = async (req, res) => {
    const { id } = req.params;
    try {
        const user = await User.findOne({ _id: id, userType: "TEACHER" });
        if (!user) {
            return res.status(404).send({ status: 404, message: "User not found" });
        }
        const otp = newOTP.generate(4, { alphabets: false, upperCase: false, specialChar: false, });
        const otpExpiration = new Date(Date.now() + 5 * 60 * 1000);
        const accountVerification = false;
        const updated = await User.findOneAndUpdate({ _id: user._id }, { otp, otpExpiration, accountVerification }, { new: true });
        let obj = {
            id: updated._id,
            otp: updated.otp,
            phone: updated.phone
        }
        return res.status(200).send({ status: 200, message: "OTP resent", data: obj });
    } catch (error) {
        console.error(error);
        return res.status(500).send({ status: 500, message: "Server error" + error.message });
    }
};

exports.getAllCourses = async (req, res) => {
    try {
        const courses = await Course.find().populate('subject').populate('teacher');
        return res.status(200).json({ status: 200, data: courses });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: 500, message: 'Server error', error });
    }
};

exports.getAllCoursesForTeacher = async (req, res) => {
    try {
        const userId = req.user.id;
        console.log(userId);
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).send({ status: 404, message: "User not found" });
        }

        const courses = await Course.find({ teacher: userId }).populate('subject').populate('teacher');
        return res.status(200).json({ status: 200, data: courses });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: 500, message: 'Server error', error });
    }
};

exports.getCourseById = async (req, res) => {
    try {
        const { id } = req.params;
        const course = await Course.findById(id).populate('subject').populate('teacher');

        if (!course) {
            return res.status(404).json({ status: 404, message: 'Course not found' });
        }

        return res.status(200).json({ status: 200, data: course });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: 500, message: 'Server error', error });
    }
};

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
                return res.status(404).json({ status: 404, message: 'course not found' });
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
        res.status(201).json({ status: 201, message: 'Notice created successfully', data: notice });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 500, message: 'Internal server error', error: error.message });
    }
};

exports.getAllNotices = async (req, res) => {
    try {
        const userId = req.user.id
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).send({ message: "not found" });
        }
        const notices = await NoticeBoard.find({ author: userId }).populate('author courseId');
        res.status(200).json({ status: 200, message: 'Notices retrieved successfully', data: notices });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 500, message: 'Internal server error', error: error.message });
    }
};

exports.getNoticeById = async (req, res) => {
    try {
        const notice = await NoticeBoard.findById(req.params.id).populate('author courseId');
        if (!notice) {
            return res.status(404).json({ status: 404, message: 'Notice not found' });
        }
        res.status(200).json({ status: 200, message: 'Notice retrieved successfully', data: notice });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 500, message: 'Internal server error', error: error.message });
    }
};

exports.updateNotice = async (req, res) => {
    try {
        const { title, content, expiryDate, isActive } = req.body;

        const notice = await NoticeBoard.findByIdAndUpdate(
            req.params.id,
            { title, content, expiryDate, isActive },
            { new: true, runValidators: true }
        );

        if (!notice) {
            return res.status(404).json({ status: 404, message: 'Notice not found' });
        }

        res.status(200).json({ status: 200, message: 'Notice updated successfully', data: notice });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 500, message: 'Internal server error', error: error.message });
    }
};

exports.deleteNotice = async (req, res) => {
    try {
        const userId = req.user.id
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).send({ message: "not found" });
        }

        const notice = await NoticeBoard.findByIdAndDelete(req.params.id);
        if (!notice) {
            return res.status(404).json({ status: 404, message: 'Notice not found' });
        }
        res.status(200).json({ status: 200, message: 'Notice deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 500, message: 'Internal server error', error: error.message });
    }
};

exports.createTestSeries = async (req, res) => {
    try {
        const { courseId, categoryId, subCategoryId, title, description } = req.body;

        let document = [];
        // if (req.files) {
        //     document = req.files.map(file => file.path);
        // }
        if (req.files) {
            for (let i = 0; i < req.files.length; i++) {
                console.log(req.files[i])
                const imagePath = req.files[i].path;
                document.push(imagePath);
                console.log(document)
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
                documents: document
            });

            const savedTestSeries = await newTestSeries.save();
            res.status(201).json({ status: 201, message: 'Test series created successfully', data: savedTestSeries });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 500, message: 'Internal server error', error: error.message });
    }
};
exports.createTestSeries1 = async (req, res) => {
    TestSeriesUpload(req, res, async (err) => {
        if (err) {
            return res.status(500).json({ error: 'Error uploading documents' });
        }

        let document = [];
        console.log(req.files)

        if (req.files) {
            for (let i = 0; i < req.files.length; i++) {
                console.log(req.files[i])
                const imagePath = req.files[i].path;
                document.push(imagePath);
                console.log(document)
            }
        } else {
            console.log("No file uploaded");
        }
        // const documents = req.files.map((file) => file.path);
        // if (documents.length > 6) {
        //     return res.status(400).json({ status: 400, message: 'Exceeded maximum limit of 6 documents per test series' });
        // }

        try {
            const { courseId, categoryId, subCategoryId, title, description } = req.body;

            const newTestSeries = new TestSeries({
                courseId,
                categoryId,
                subCategoryId,
                title,
                description,
                document
            });

            const savedTestSeries = await newTestSeries.save();
            res.status(201).json({ status: 201, message: 'Test series created successfully', data: savedTestSeries });
        } catch (error) {
            console.error(error);
            res.status(500).json({ status: 500, message: 'Internal server error', error: error.message });
        }
    });
};
exports.getAllTestSeries = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).send({ status: 404, message: "User not found" });
        }

        const testSeriesList = await TestSeries.find({ teacher: userId })
            .populate('courseId categoryId subCategoryId');
        res.status(200).json({ status: 200, message: 'Test series retrieved successfully', data: testSeriesList });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 500, message: 'Internal server error', error: error.message });
    }
};
exports.getTestSeriesById = async (req, res) => {
    try {
        const testSeries = await TestSeries.findById(req.params.id)
            .populate('courseId categoryId subCategoryId');
        if (!testSeries) {
            return res.status(404).json({ status: 404, message: 'Test series not found', data: null });
        }
        res.status(200).json({ status: 200, message: 'Test series retrieved successfully', data: testSeries });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 500, message: 'Internal server error', error: error.message });
    }
};
exports.updateTestSeries = async (req, res) => {
    try {
        const { courseId, categoryId, subCategoryId, title, description } = req.body;
        let documents = [];
        if (req.files) {
            documents = req.files.map(file => file.path);
        }

        const testSeries = await TestSeries.findById(req.params.id);
        if (!testSeries) {
            return res.status(404).json({ status: 404, message: 'Test series not found', data: null });
        }

        testSeries.courseId = courseId || testSeries.courseId;
        testSeries.categoryId = categoryId || testSeries.categoryId;
        testSeries.subCategoryId = subCategoryId || testSeries.subCategoryId;
        testSeries.title = title || testSeries.title;
        testSeries.description = description || testSeries.description;
        testSeries.documents = documents.length > 0 ? documents : testSeries.documents;

        const updatedTestSeries = await testSeries.save();
        res.status(200).json({ status: 200, message: 'Test series updated successfully', data: updatedTestSeries });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 500, message: 'Internal server error', error: error.message });
    }
};
exports.deleteTestSeries = async (req, res) => {
    try {
        const testSeries = await TestSeries.findByIdAndDelete(req.params.id);
        if (!testSeries) {
            return res.status(404).json({ status: 404, message: 'Test series not found', data: null });
        }
        res.status(200).json({ status: 200, message: 'Test series deleted successfully', data: testSeries });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 500, message: 'Internal server error', error: error.message });
    }
};
exports.createBehaviorNote = async (req, res) => {
    try {
        const { user, name, class: className, rollNo, behaviorNote } = req.body;
        const userId = req.user.id;
        const teacher = await User.findById(userId);
        if (!teacher) {
            return res.status(404).send({ status: 404, message: "Teacher not found" });
        }

        if (user) {
            const checkUser = await User.findById(user);
            if (!checkUser) {
                return res.status(404).send({ status: 404, message: "User not found" });
            }
        }

        const image = req.file ? req.file.path : null;

        const newBehaviorNote = new BehaviorNote({
            user: user,
            teacher: userId,
            name,
            class: className,
            rollNo,
            image,
            behaviorNote
        });

        const savedBehaviorNote = await newBehaviorNote.save();
        res.status(201).json({ status: 201, message: 'Behavior note created successfully', data: savedBehaviorNote });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 500, message: 'Internal server error', error: error.message });
    };
};

exports.getAllBehaviorNotes = async (req, res) => {
    try {
        const userId = req.user.id;
        console.log(userId);
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).send({ status: 404, message: "User not found" });
        }

        const behaviorNotes = await BehaviorNote.find({ teacher: userId }).populate('user teacher');
        res.status(200).json({ status: 200, message: 'Behavior notes retrieved successfully', data: behaviorNotes });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 500, message: 'Internal server error', error: error.message });
    }
};

exports.getBehaviorNoteById = async (req, res) => {
    try {
        const behaviorNote = await BehaviorNote.findById(req.params.id).populate('user teacher');
        if (!behaviorNote) {
            return res.status(404).json({ status: 404, message: 'Behavior note not found' });
        }
        res.status(200).json({ status: 200, message: 'Behavior note retrieved successfully', data: behaviorNote });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 500, message: 'Internal server error', error: error.message });
    }
};
exports.updateBehaviorNote = async (req, res) => {
    try {
        const { user, name, class: className, rollNo, behaviorNote } = req.body;
        const userId = req.user.id;
        const teacher = await User.findById(userId);
        if (!teacher) {
            return res.status(404).send({ status: 404, message: "Teacher not found" });
        }

        if (user) {
            const checkUser = await User.findById(user);
            if (!checkUser) {
                return res.status(404).send({ status: 404, message: "User not found" });
            }
        }

        const image = req.file ? req.file.path : null;

        const behaviorNoteEntry = await BehaviorNote.findById(req.params.id);
        if (!behaviorNoteEntry) {
            return res.status(404).json({ status: 404, message: 'Behavior note not found' });
        }

        behaviorNoteEntry.user = user || behaviorNoteEntry.user;
        behaviorNoteEntry.teacher = userId || behaviorNoteEntry.teacher;
        behaviorNoteEntry.name = name || behaviorNoteEntry.name;
        behaviorNoteEntry.class = className || behaviorNoteEntry.class;
        behaviorNoteEntry.rollNo = rollNo || behaviorNoteEntry.rollNo;
        behaviorNoteEntry.behaviorNote = behaviorNote || behaviorNoteEntry.behaviorNote;
        behaviorNoteEntry.image = image || behaviorNoteEntry.image;

        const updatedBehaviorNote = await behaviorNoteEntry.save();
        res.status(200).json({ status: 200, message: 'Behavior note updated successfully', data: updatedBehaviorNote });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 500, message: 'Internal server error', error: error.message });
    }
};
exports.deleteBehaviorNote = async (req, res) => {
    try {
        const behaviorNote = await BehaviorNote.findByIdAndDelete(req.params.id);
        if (!behaviorNote) {
            return res.status(404).json({ status: 404, message: 'Behavior note not found' });
        }

        res.status(200).json({ status: 200, message: 'Behavior note deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 500, message: 'Internal server error', error: error.message });
    }
};
exports.getCourseCategories = async (req, res) => {
    const courseId = req.params.id
    const findMainCategory = await Course.findById({ _id: courseId });
    if (!findMainCategory) {
        return res.status(404).json({ message: "mainCategory Not Found", status: 404, data: {} });
    } else {
        let findCategory = await CourseCategory.find({ courseId: findMainCategory._id }).populate('courseId', 'name')
        if (findCategory.length > 0) {
            return res.status(200).json({ message: "Category Found", status: 200, data: findCategory, });
        } else {
            return res.status(404).json({ message: "Category not Found", status: 404, data: {}, });
        }
    }
};
exports.getSubCategories = async (req, res) => {
    const findMainCategory = await Course.findById({ _id: req.params.courseId });
    if (!findMainCategory) {
        return res.status(404).json({ message: "Main Category Not Found", status: 404, data: {} });
    } else {
        let findCategory = await CourseCategory.findOne({ courseId: findMainCategory._id, _id: req.params.categoryId });
        if (!findCategory) {
            return res.status(404).json({ message: "Category Not Found", status: 404, data: {} });
        } else {
            let findSubCategory = await CourseSubCategory.find({ courseId: findMainCategory._id, categoryId: findCategory._id, }).populate('courseId').populate('categoryId')
            if (findSubCategory.length > 0) {
                return res.status(200).json({ message: "Sub Category Found", status: 200, data: findSubCategory, });
            } else {
                return res.status(201).json({ message: "Sub Category not Found", status: 404, data: {}, });
            }
        }
    }
};
exports.UploadCourseImage = async (req, res) => {
    try {
        const subcategoryId = req.params.subcategoryId;

        const subCategory = await CourseSubCategory.findById(subcategoryId);
        if (!subCategory) {
            return res.status(404).json({ message: "Sub Category Not Found", status: 404, data: {} });
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

        return res.status(200).json({ message: "Course image uploaded successfully", status: 200, data: subCategory });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: "Internal server error", data: error.message });
    }
};
exports.UploadCourseDocument = async (req, res) => {
    try {
        const subcategoryId = req.params.subcategoryId;

        const subCategory = await CourseSubCategory.findById(subcategoryId);
        if (!subCategory) {
            return res.status(404).json({ message: "Sub Category Not Found", status: 404, data: {} });
        }

        if (req.files) {
            for (let i = 0; i < req.files.length; i++) {
                const imagePath = req.files[i].path;
                subCategory.courseNotes.push(imagePath);
                await subCategory.save();
            }
        } else {
            console.log("No file uploaded");
        }

        return res.status(200).json({ message: "Course Notes uploaded successfully", status: 200, data: subCategory });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: "Internal server error", data: error.message });
    }
};
exports.UploadCourseVideo1 = async (req, res) => {
    try {
        const subcategoryId = req.params.subcategoryId;

        const subCategory = await CourseSubCategory.findById(subcategoryId);
        if (!subCategory) {
            return res.status(404).json({ message: "Sub Category Not Found", status: 404, data: {} });
        }

        if (req.files) {
            req.files.forEach(file => {
                subCategory.courseVideo.push(file.path);
            });
            await subCategory.save();
        } else {
            console.log("No file uploaded");
            return res.status(400).json({ message: "No files uploaded", status: 400 });
        }
        console.log('Updated SubCategory:', subCategory);

        return res.status(200).json({ message: "Course image uploaded successfully", status: 200, data: subCategory });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ status: 500, message: "Internal server error", data: error.message });
    }
};
exports.UploadCourseVideo = async (req, res) => {
    try {
        upload(req, res, async (err) => {
            if (err) {
                return res.status(500).json({ error: 'Error uploading videos' });
            }
            const videoUrls = req.files.map((file) => file.path);
            if (videoUrls.length > 6) {
                return res.status(400).json({ status: 400, message: 'Exceeded maximum limit of 6 videos per course' });
            }
            try {
                const subcategoryId = req.params.subcategoryId;

                const subCategory = await CourseSubCategory.findById(subcategoryId);
                if (!subCategory) {
                    return res.status(404).json({ message: "Sub Category Not Found", status: 404, data: {} });
                }
                if (subCategory.courseVideo.length + videoUrls.length > 100) {
                    return res.status(400).json({ status: 400, message: 'Exceeded maximum limit of 100 videos per course' });
                }
                subCategory.courseVideo.push(...videoUrls);
                const updatedCourse = await subCategory.save();

                res.status(200).json({ status: 200, message: 'Course videos updated successfully', data: updatedCourse });
            } catch (error) {
                console.error(error);
                res.status(500).json({ error: 'Something went wrong' });
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'An error occurred while uploading the videos' });
    }
};
exports.createSchedule = async (req, res) => {
    try {
        const { course, title, date, startTime, endTime, duration, description, meetingLink, teachers, status } = req.body;
        const schedule = new Schedule({ course, title, date, startTime, endTime, duration, description, meetingLink, teachers, status });
        await schedule.save();
        return res.status(201).json({ status: 201, message: 'Schedule created successfully', data: schedule });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: 500, message: 'Server error', error: error.message });
    }
};
exports.getAllSchedules = async (req, res) => {
    try {
        const schedules = await Schedule.find().populate('course')/*.populate('teachers')*/;
        return res.status(200).json({ status: 200, message: 'Schedules retrieved successfully', data: schedules });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: 500, message: 'Server error', error: error.message });
    }
};
exports.getScheduleById = async (req, res) => {
    try {
        const { id } = req.params;
        const schedule = await Schedule.findById(id).populate('course');
        if (!schedule) {
            return res.status(404).json({ status: 404, message: 'Schedule not found' });
        }
        return res.status(200).json({ status: 200, message: 'Schedule retrieved successfully', data: schedule });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: 500, message: 'Server error', error: error.message });
    }
};
exports.updateSchedule = async (req, res) => {
    try {
        const { id } = req.params;
        const { course, title, date, startTime, endTime, duration, description, meetingLink, teachers, status } = req.body;
        const schedule = await Schedule.findByIdAndUpdate(
            id,
            { course, title, date, startTime, endTime, duration, description, meetingLink, teachers, status },
            { new: true }
        );
        if (!schedule) {
            return res.status(404).json({ status: 404, message: 'Schedule not found' });
        }
        return res.status(200).json({ status: 200, message: 'Schedule updated successfully', data: schedule });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: 500, message: 'Server error', error: error.message });
    }
};
exports.deleteSchedule = async (req, res) => {
    try {
        const { id } = req.params;
        const schedule = await Schedule.findByIdAndDelete(id);
        if (!schedule) {
            return res.status(404).json({ status: 404, message: 'Schedule not found' });
        }
        return res.status(200).json({ status: 200, message: 'Schedule deleted successfully' });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: 500, message: 'Server error', error: error.message });
    }
};
const scheduleUpdate = async () => {
    try {
        const currentDateTime = new Date();
        const currentDate = currentDateTime.toISOString().split('T')[0];
        const currentTime = currentDateTime.toTimeString().slice(0, 5);

        const schedules = await Schedule.find({
            status: 'scheduled',
            date: { $lte: currentDate },
            startTime: currentTime.toString()
        });

        for (const schedule of schedules) {
            schedule.status = 'live';
            await schedule.save();
        }

        const completedSchedules = await Schedule.find({
            status: { $in: ['scheduled', 'live'] },
            date: { $lte: currentDate },
            endTime: currentTime.toString()
        });

        for (const schedule of completedSchedules) {
            schedule.status = 'completed';
            await schedule.save();
        }

        // console.log(`Checked schedules at ${currentDateTime}`);
    } catch (error) {
        console.error('Error updating schedules:', error);
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

//add teacher to coures
exports.addTeacherToCourse = async (req, res) => {
    try{
        const {teacherId, courses} = req.body;

        if (req.user.userType !== "ADMIN") {
            return res.status(401).json({ status: 401, message: "Unauthorized access! Only admins are allowed." });
        }

        if(!teacherId || !courses || !Array.isArray(courses)){
            return res.status(400).json({message: 'Please provide teacherId and courseIds'});
        }

        const user= await User.findById(teacherId);
        if(!user){
            return res.status(404).json({message: 'Teacher not found'});
        }

        if(user.userType!== 'TEACHER'){
            return res.status(400).json({message: 'User is not a teacher, Only teachers can be assigned to courses'});
        }

        const validCourses= await Course.find({_id: {$in: courses}});

        const validCourseIds = validCourses.map(course => course._id.toString());
        const missingCourses = courses.filter(courseId => !validCourseIds.includes(courseId.toString()));

        let teacher= await Teacher.findOne({user: teacherId});
        if(!teacher){
            console.log("Creating new teacher profile");
            teacher= new Teacher({
                user: teacherId,
                courses:[]
            });
        }
        
        teacher.courses = Array.isArray(teacher.courses) ? teacher.courses : [];

        console.log("Existing Courses", teacher.courses);

        const duplicateCourses = courses.filter(courseId =>
            teacher.courses.some(existingCourseId => existingCourseId.toString() === courseId.toString())
        );

        const newCourses = courses.filter(courseId =>
            !teacher.courses.some(existingCourseId => existingCourseId.toString() === courseId.toString()) &&
            validCourseIds.includes(courseId.toString())
        );

        console.log("New Courses to Add:", newCourses);
        console.log("Duplicate Courses:", duplicateCourses);
        console.log("Missing Courses:", missingCourses);

        if (newCourses.length === 0) {
            return res.status(200).json({
                message: 'No courses were added.',
                details: {
                    duplicateCourses,
                    missingCourses
                }
            });
        }

        teacher.courses.push(...newCourses.map(courseId => new mongoose.Types.ObjectId(courseId)));
        await teacher.save();

        // console.log("Teacher Profile (After Save): ", teacher);

        if(!user.teacherProfile){
            user.teacherProfile= teacher._id;
            await user.save();
        }
            
        return res.status(200).json({
            message: 'Teacher added to courses successfully', 
            data: teacher,
            details: {
                addedCourses: newCourses,
                duplicateCourses,
                missingCourses
            }
        });
    } catch(error){
        console.error("Error adding courses to Teacher", error);
        return res.status(500).json({message: 'Internal server error', error: error.message});
    }
}

exports.removeTeacherFromCourse=async(req, res)=>{
    try{
        const {teacherId, courses} = req.body;
    
        if (req.user.userType !== "ADMIN") {
            return res.status(401).json({ status: 401, message: "Unauthorized access! Only admins are allowed." });
        }

        if(!teacherId || !courses || !Array.isArray(courses)){
            return res.status(400).json({message: 'Please provide teacherId and courseIds'});
        }

        const teacherProfile = await Teacher.findOne({ user: teacherId });
        
        if (!teacherProfile) {
            return res.status(404).json({ message: 'Teacher profile not found' });
        }

        const teacher = await User.findById(teacherId);
        if (!teacher || teacher.userType !== 'TEACHER') {
            return res.status(400).json({ message: 'User is not a teacher, Only teachers can be removed from courses' });
        }

        teacherProfile.courses = teacherProfile.courses || [];

        const courseObjectIds = courses.map(courseId => new mongoose.Types.ObjectId(courseId));
        console.log("courseObjectIds: ", courseObjectIds);

        console.log("Teacher Courses: ", teacherProfile.courses);

        if (!Array.isArray(teacherProfile.courses)) {
            console.error("Teacher courses are not defined or not an array.");
        }

        // Filter out courses to be removed
        const remainingCourses = teacherProfile.courses.filter(
            existingCourseId => !courseObjectIds.some(courseId => courseId.equals(existingCourseId))
        );

        // Check which courses were actually removed
        const removedCourses = teacherProfile.courses.filter(
            existingCourseId => courseObjectIds.some(courseId => courseId.equals(existingCourseId))
        );

        // Update teacher's courses
        teacherProfile.courses = remainingCourses;
        await teacherProfile.save();

        return res.status(200).json({
            message: 'Courses removed from teacher successfully',
            data: {
                removedCourses: removedCourses.map(id => id.toString()),
                remainingCourses: remainingCourses.map(id => id.toString())
            }
        });

    } catch (error) {
        console.error("Error removing courses from Teacher", error);
        return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};

exports.getTeacherCourses = async (req, res) => {
    try {
        const { teacherId } = req.params;

        if (req.user.userType !== "ADMIN") {
            return res.status(401).json({ status: 401, message: "Unauthorized access! Only admins are allowed." });
        }

        // Find the user
        const user = await User.findById(teacherId);
        if (!user) {
            return res.status(404).json({ message: 'Teacher not found' });
        }

        // Verify user is a teacher
        if (user.userType !== 'TEACHER') {
            return res.status(400).json({ message: 'User is not a teacher' });
        }

        // Find teacher profile and populate courses
        const teacher = await Teacher.findOne({ user: teacherId }).populate({
            path: 'courses',
            select: 'title description'
        });

        if (!teacher) {
            return res.status(404).json({ message: 'Teacher profile not found' });
        }

        return res.status(200).json({
            message: 'Teacher courses retrieved successfully',
            courses: teacher.courses
        });

    } catch (error) {
        console.error("Error retrieving teacher courses", error);
        return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};