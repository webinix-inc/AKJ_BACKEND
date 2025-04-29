const Notification = require('../models/notificationModel');
const User = require('../models/userModel');
const Course = require('../models/courseModel');
const mongoose = require("mongoose");

exports.getAllNotifications = async (req, res) => {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder || 'desc';

    try {
        const query = { recipient: userId };

        if (req.query.type) {
            query.type = req.query.type;
        }

        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const notifications = await Notification.find(query)
            .sort(sortOptions)
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('createdBy', 'firstName')
            .select('-recipient');
   
        const totalNotifications = await Notification.countDocuments(query);
        const totalPages = Math.ceil(totalNotifications / limit);

        res.status(200).json({ 
            message: 'Notifications fetched successfully',
            notifications, 
            totalPages, 
            currentPage: page, 
            totalNotifications 
        });
    } catch (error) {
        console.error('Error fetching user notifications:', error);
        res.status(500).json({ 
            message: 'Failed to fetch notifications', 
            error: error.message 
        });
    }
};

exports.getCourseNotifications = async (req, res) => {
    const { courseId } = req.params;
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder || 'desc';

    try {
        const user = await User.findOne({
            _id: userId,
            'purchasedCourses.course': courseId
        });
        // console.log('User:', user);

        if (!user) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You have not purchased this course.'
            });
        }

        const query = {
            courses: courseId,
            type: 'COURSE_SPECIFIC'
        };

        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const notifications = await Notification.find(query)
            .sort(sortOptions)
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('createdBy', 'firstName lastName')
            .populate('courses', 'courseTitle');

        const totalNotifications = await Notification.countDocuments(query);
        const totalPages = Math.ceil(totalNotifications / limit);

        res.status(200).json({
            success: true,
            message: 'Course notifications fetched successfully',
            notifications,
            totalPages,
            currentPage: page,
            totalNotifications
        });

    } catch (error) {
        console.error('Error fetching course notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch course notifications',
            error: error.message
  });
}
};

exports.sendBroadcastNotification = async (req, res) => {
    const { title, message, sendVia, metadata, priority } = req.body;
    const createdBy = req.user._id;

    try {       
        const users = await User.find({},{_id:1}).lean();
        const userIds = users.map((user) => user._id);
        const notification = new Notification({
            title,
            message,
            type: 'TO EVERYONE',
            recipient: userIds,
            sendVia,
            metadata,
            priority,
            createdBy 
        });

        await notification.save();

        if (req.io) {
            console.log("Emitting notification to receivers:", userIds);
            req.io.emit("broadcastNotification", { userIds, notification:{
                title,
                message,
                type: 'TO EVERYONE',
                metadata,
                createdAt: new Date()
            } });
          } else {
            console.warn("Socket.io not initialized");
          }

        res.status(201).json({success:true, message: 'Notification sent successfully', notification});
    } catch (error) {
        console.error('Error sending broadcast notification:', error);
        res.status(500).json({ message: 'Failed to send notification', error: error.message });
    }
}

exports.sendCourseSpecificNotification = async (req, res) => {
    const { title, courseIds, message, sendVia, metadata, priority } = req.body;
    const userId = req.user._id;
    console.log('courseIds:', courseIds);
    console.log('userId:', userId);

    try {
        // Validate courseIds
        if (!Array.isArray(courseIds) || !courseIds.length) {
            return res.status(400).json({ message: 'Please provide valid course IDs' });
        }

        // Aggregation to find users who have purchased any of the given courses
        const courseUsers = await User.find({
            'purchasedCourses.course': { $in: courseIds }
          }).populate('purchasedCourses.course', 'courseTitle courseDescription');

        console.log("Course Users:", courseUsers); 

        // Map to get user IDs
        const recipientIds = courseUsers.map(user => user._id);
        console.log("Recipient IDs:", recipientIds); // Log the recipient IDs to check

        if (recipientIds.length === 0) {
            return res.status(400).json({ message: 'No users found for the selected courses' });
        }

        // Creating notification
        const notification = new Notification({
            title,
            message,
            type: 'COURSE_SPECIFIC',
            recipient: recipientIds,
            courses: courseIds,
            sendVia,
            metadata,
            priority,
            createdBy: userId
        });

        // Save the notification
        await notification.save();

        // Emit via socket if available
        if (req.io) {
            console.log("Emitting notification to receivers:", recipientIds);
            req.io.emit("broadcastNotification", {
                userIds: recipientIds,
                notification: {
                    title,
                    message,
                    type: 'COURSE_PURCHASE',
                    metadata,
                    createdAt: new Date()
                }
            });
        } else {
            console.warn("Socket.io not initialized");
        }

        // Respond success
        res.status(201).json({ success: true, message: 'Notification sent successfully', notification });
    } catch (error) {
        console.error('Error sending course-specific notification:', error);
        res.status(500).json({ message: 'Failed to send notification', error: error.message });
    }
};

exports.sendCoursePurchaseNotification = async (req, res) => {
    const { title, courseId, message, sendVia, metadata, priority } = req.body;
    const createdBy = req.user._id;
    console.log('courseId:', courseId);
    console.log('createdBy:', createdBy);

    try {
        if (!mongoose.Types.ObjectId.isValid(courseId)) {
            return res.status(400).json({ message: 'Invalid course ID' });
        }

        const Notification = new Notification({
            title,
            message,
            type: 'NEW_COURSE_PURCHASE',
            recipient: [req.user._id],
            courses: [courseId],
            sendVia,
            metadata,
            priority,
            createdBy
        });

        await Notification.save();

        if (req.io) {
            console.log("Emitting notification to receivers:", req.user._id);
            req.io.emit("broadcastNotification", { userIds: [req.user._id], notification: {
                title,
                message,
                type: 'NEW_COURSE_PURCHASE',
                metadata,
                createdAt: new Date()
            } });
        } else {
            console.warn("Socket.io not initialized");
        }

        res.status(201).json({ success: true, message: 'Notification sent successfully For New Course Purchase', notification: Notification });

    } catch (error) {
        console.error('Error sending course purchase notification:', error);
        res.status(500).json({ message: 'Failed to send notification', error: error.message });
    }   
}