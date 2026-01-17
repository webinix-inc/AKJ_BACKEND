const LiveClass = require("../models/LiveClass");
const Course = require("../models/courseModel");
const User = require("../models/userModel");
const Attendance = require("../models/attendanceModel");
const Message = require("../models/messageModel");
const { invalidateCache } = require("../middlewares/cacheMiddleware");
const {
  scheduleLiveClass,
  addUser,
  addUsersToClass,
  getClassStatus,
  editClass,
  deleteLiveClass: deleteClassAPI,
  updateUser,
} = require("../configs/merithub.config");

const fs = require("fs").promises; // Use promise-based fs
const path = require("path");

const { S3Client, ListObjectsV2Command, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { default: mongoose } = require("mongoose");

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const LOG_FILE_PATH = path.join(__dirname, "../logs/status_pings.txt");

/**
 * Process attendance data from MeritHub webhook
 * MeritHub sends attendance data in format:
 * {
 *   "classId": "class_Id",
 *   "networkId": "network_Id",
 *   "requestType": "attendance",
 *   "subClassId": "Subclass___ID",
 *   "attendance": [
 *     {
 *       "userId": "user_Id_1",
 *       "startTime": "2022-10-16T17:53:00Z",
 *       "endTime": "2022-10-16T17:57:04Z",
 *       "totalTime": 244, // in seconds
 *       "role": "host",
 *       "userType": "mu",
 *       "analytics": { ... },
 *       "browser": { ... },
 *       "os": { ... },
 *       "ip": "ip_address"
 *     }
 *   ]
 * }
 */
const processAttendanceData = async (payload) => {
  try {
    const { classId, attendance, subClassId, networkId } = payload;

    if (!classId || !attendance || !Array.isArray(attendance)) {
      console.error("❌ [ATTENDANCE] Invalid attendance data format");
      console.error("❌ [ATTENDANCE] Payload:", JSON.stringify(payload, null, 2));
      return;
    }

    // Find the live class
    const liveClass = await LiveClass.findOne({ classId });
    if (!liveClass) {
      console.error(`❌ [ATTENDANCE] Live class not found for classId: ${classId}`);
      return;
    }

    console.log(`📊 [ATTENDANCE] Processing attendance for class: ${liveClass.title}`);
    console.log(`📊 [ATTENDANCE] Found ${attendance.length} attendance records`);
    console.log(`📊 [ATTENDANCE] SubClassId: ${subClassId}, NetworkId: ${networkId}`);

    // Find admin user for sending messages
    const adminUser = await User.findOne({ userType: "ADMIN" }).select("_id firstName lastName");
    if (!adminUser) {
      console.warn("⚠️ [ATTENDANCE] No admin user found for sending messages");
    }

    // Process each attendance record
    for (const attendanceRecord of attendance) {
      try {
        const {
          userId: merithubUserId,
          startTime,
          endTime,
          totalTime, // in seconds
          role,
          userType,
          analytics,
          browser,
          os,
          ip
        } = attendanceRecord;

        // Find user by MeritHub user ID
        const user = await User.findOne({ merithubUserId });
        if (!user) {
          console.warn(`⚠️ [ATTENDANCE] User not found for MeritHub userId: ${merithubUserId}`);
          continue;
        }

        // Convert totalTime from seconds to minutes
        const durationMinutes = totalTime ? Math.round(totalTime / 60) : 0;

        // Calculate attendance percentage based on class duration
        let attendancePercent = 0;
        if (liveClass.duration && durationMinutes > 0) {
          attendancePercent = Math.round((durationMinutes / liveClass.duration) * 100);
          // Cap at 100%
          attendancePercent = Math.min(attendancePercent, 100);
        }

        // Determine status based on attendance percentage (50% threshold)
        const status = attendancePercent >= 50 ? 'Present' : 'Absent';

        // Parse dates
        const joinTime = startTime ? new Date(startTime) : null;
        const leaveTime = endTime ? new Date(endTime) : null;

        // Check if attendance already exists
        const existingAttendance = await Attendance.findOne({
          user: user._id,
          liveClass: liveClass._id,
          liveClassId: classId,
          date: {
            $gte: new Date(new Date().setHours(0, 0, 0, 0)),
            $lt: new Date(new Date().setHours(23, 59, 59, 999))
          }
        });

        if (existingAttendance) {
          // Update existing attendance
          existingAttendance.joinTime = joinTime || existingAttendance.joinTime;
          existingAttendance.leaveTime = leaveTime || existingAttendance.leaveTime;
          existingAttendance.duration = durationMinutes;
          existingAttendance.attendancePercentage = attendancePercent;
          existingAttendance.status = status;
          // Store analytics data if needed (optional)
          if (analytics) {
            existingAttendance.analytics = analytics;
          }
          await existingAttendance.save();
          console.log(`✅ [ATTENDANCE] Updated attendance for user: ${user.firstName} ${user.lastName} (${durationMinutes} mins, ${attendancePercent}%)`);
        } else {
          // Create new attendance record
          const newAttendance = new Attendance({
            user: user._id,
            course: liveClass.courseIds[0], // Use first course ID
            liveClass: liveClass._id,
            liveClassId: classId,
            date: new Date(),
            status,
            joinTime,
            leaveTime,
            duration: durationMinutes,
            attendancePercentage: attendancePercent,
            merithubUserId,
            // Store additional data if needed
            analytics: analytics || null,
            role: role || null,
            userType: userType || null,
          });

          await newAttendance.save();
          console.log(`✅ [ATTENDANCE] Created attendance record for user: ${user.firstName} ${user.lastName} (${durationMinutes} mins, ${attendancePercent}%)`);
        }

        // Send message to student about attendance (only for students, not hosts/instructors)
        if (adminUser && role !== 'host' && userType !== 'instructor') {
          await sendAttendanceMessage(adminUser._id, user._id, liveClass, {
            duration: durationMinutes,
            attendancePercentage: attendancePercent,
            status,
            joinTime,
            leaveTime,
            totalTimeSeconds: totalTime,
          });
        }

      } catch (attendanceError) {
        console.error(`❌ [ATTENDANCE] Error processing attendance record:`, attendanceError);
        console.error(`❌ [ATTENDANCE] Record data:`, JSON.stringify(attendanceRecord, null, 2));
      }
    }

    console.log(`✅ [ATTENDANCE] Finished processing attendance for class: ${liveClass.title}`);

  } catch (error) {
    console.error("❌ [ATTENDANCE] Error processing attendance data:", error);
    console.error("❌ [ATTENDANCE] Error stack:", error.stack);
  }
};

/**
 * Process recording data from MeritHub webhook
 * MeritHub sends recording data in format:
 * {
 *   "networkId": "networkId",
 *   "classId": "classId",
 *   "subClassId": "subClassId",
 *   "requestType": "recording",
 *   "status": "recorded",
 *   "startTime": "2021-04-16T13:14:48",
 *   "duration": "0:00",
 *   "url": "player_url"
 * }
 */
const processRecordingData = async (payload) => {
  try {
    const { classId, status, url, startTime, duration } = payload;

    if (!classId) {
      console.error("❌ [RECORDING] Invalid recording data format - missing classId");
      return;
    }

    // Find the live class
    const liveClass = await LiveClass.findOne({ classId });
    if (!liveClass) {
      console.error(`❌ [RECORDING] Live class not found for classId: ${classId}`);
      return;
    }

    if (status === "recorded" && url) {
      // Update live class with recording URL
      liveClass.recordingUrl = url;
      liveClass.recordingStatus = "recorded";
      liveClass.recordingStartTime = startTime ? new Date(startTime) : null;
      liveClass.recordingDuration = duration || null;
      await liveClass.save();

      console.log(`✅ [RECORDING] Recording URL saved for class: ${liveClass.title}`);
      console.log(`📹 [RECORDING] Recording URL: ${url}`);

      // Invalidate cache
      await invalidateCache("profile:*");
      console.log("🗑️ [CACHE] User profile cache invalidated after recording update");
    } else {
      console.log(`⚠️ [RECORDING] Recording status: ${status}, URL: ${url || 'not provided'}`);
    }

  } catch (error) {
    console.error("❌ [RECORDING] Error processing recording data:", error);
  }
};

/**
 * Send attendance message to student
 */
const sendAttendanceMessage = async (adminId, userId, liveClass, attendanceData) => {
  try {
    const { duration, attendancePercentage, status, joinTime, leaveTime } = attendanceData;

    // Format time
    const formatTime = (date) => {
      if (!date) return "N/A";
      return new Date(date).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    };

    // Format duration
    const formatDuration = (minutes) => {
      if (!minutes) return "0 minutes";
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''} ${mins > 0 ? `${mins} minute${mins > 1 ? 's' : ''}` : ''}`;
      }
      return `${mins} minute${mins > 1 ? 's' : ''}`;
    };

    // Format duration from seconds if provided
    const formatDurationFromSeconds = (seconds) => {
      if (!seconds) return "0 minutes";
      const minutes = Math.floor(seconds / 60);
      return formatDuration(minutes);
    };

    // Use totalTimeSeconds if available for more accurate duration
    const displayDuration = attendanceData.totalTimeSeconds
      ? formatDurationFromSeconds(attendanceData.totalTimeSeconds)
      : formatDuration(duration);

    const messageContent = `📊 Your attendance has been marked for the live class "${liveClass.title}"

📅 Class Date: ${formatTime(new Date(liveClass.startTime))}
⏰ Join Time: ${formatTime(joinTime)}
⏰ Leave Time: ${formatTime(leaveTime)}
⏱️ Duration Attended: ${displayDuration}
📈 Attendance: ${attendancePercentage}%
✅ Status: ${status}

${status === 'Present' ? '🎉 Great job attending the class!' : '⚠️ Please try to attend the full class next time.'}

Thank you for your participation!`;

    const message = new Message({
      sender: adminId,
      receiver: userId,
      content: messageContent,
      attachments: [],
      isRead: false,
      isBroadcast: false,
      status: "sent",
      timestamp: new Date(),
    });

    await message.save();
    console.log(`✅ [MESSAGE] Attendance message sent to user: ${userId}`);

    // Emit socket event if available
    if (global.io) {
      global.io.to(userId.toString()).emit("message", {
        _id: message._id,
        sender: message.sender,
        receiver: message.receiver,
        content: message.content,
        attachments: message.attachments,
        createdAt: message.createdAt,
        timestamp: message.timestamp,
        isRead: message.isRead,
        isBroadcast: message.isBroadcast
      });
    }

  } catch (error) {
    console.error("❌ [MESSAGE] Error sending attendance message:", error);
  }
};

/**
 * Utility function to safely find a live class by ID
 * Handles both MeritHub classId (string) and MongoDB ObjectId
 */
const findLiveClassById = async (classId) => {
  console.log(`🔍 [FIND] Looking for live class with ID: ${classId}`);

  // First try to find by classId field (works for both MeritHub and MongoDB IDs)
  let liveClass = await LiveClass.findOne({ classId });
  console.log(`🔍 [FIND] Found by classId: ${!!liveClass}`);

  if (!liveClass) {
    // If not found and the ID looks like a valid MongoDB ObjectId, try _id field
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(classId);
    console.log(`🔍 [FIND] Is valid ObjectId: ${isValidObjectId}`);

    if (isValidObjectId) {
      try {
        liveClass = await LiveClass.findById(classId);
        console.log(`🔍 [FIND] Found by _id: ${!!liveClass}`);
      } catch (error) {
        console.log(`🔍 [FIND] Error finding by _id: ${error.message}`);
      }
    } else {
      console.log(`🔍 [FIND] Not a valid ObjectId, skipping _id search`);
    }
  }

  if (!liveClass) {
    console.log(`❌ [FIND] Live class not found with ID: ${classId}`);
  }

  return liveClass;
};

const createUser = async (req, res) => {
  try {
    const userDetails = req.body;

    // Add user to MeritHub and retrieve their MeritHub User ID
    const response = await addUser(userDetails);
    if (!response || !response.userId) {
      return res
        .status(400)
        .json({ error: "Failed to retrieve MeritHub User ID." });
    }

    const merithubUserId = response.userId;

    // Save the user in the database with the returned MeritHub User ID
    const user = new User({ ...userDetails, merithubUserId });
    await user.save();

    res.status(201).json({
      message: "User added successfully",
      user,
    });
  } catch (error) {
    console.error("Error adding user:", error.message);
    res.status(500).json({
      error:
        error.message || "An unexpected error occurred while adding the user.",
    });
  }
};

/**
 * Update user details
 */
const updateUserDetails = async (req, res) => {
  try {
    const { userId } = req.params; // Extract the user ID from the request parameters
    const userDetails = req.body; // Extract the user details from the request body

    // Validate the user details
    if (!userId || !userDetails) {
      return res
        .status(400)
        .json({ error: "User ID and user details are required." });
    }

    // Update the user on the MeritHub platform
    const updatedUser = await updateUser(userId, userDetails);

    // If successful, update the user in the local database
    const user = await User.findOneAndUpdate(
      { merithubUserId: userId },
      { $set: userDetails },
      { new: true } // Return the updated document
    );

    if (!user) {
      return res.status(404).json({ error: "User not found in the database." });
    }

    res.status(200).json({
      message: "User updated successfully",
      user,
    });
  } catch (error) {
    console.error("Error updating user:", error.message);
    res.status(500).json({
      error:
        error.message ||
        "An unexpected error occurred while updating the user.",
    });
  }
};

/**
 * Schedule a new live class
 */
const createLiveClass = async (req, res) => {
  console.log('\n🚨🚨🚨 [CONTROLLER_DEBUG] createLiveClass function called! 🚨🚨🚨');
  console.log('🚨 [CONTROLLER_DEBUG] This log should appear if our controller is being used!');
  console.log('\n🎬 ============================================');
  console.log('🎬 LIVE CLASS CREATION STARTED');
  console.log('🎬 ============================================');
  console.log('📅 Timestamp:', new Date().toISOString());
  console.log('📤 Request Body:', JSON.stringify(req.body, null, 2));

  try {
    const {
      userId,
      courseIds,
      title,
      startTime,
      platform,
      zoomMeetingLink,
      zoomMeetingId,
      zoomPasscode,
      // MeritHub class configuration parameters
      type = "oneTime", // "oneTime" or "perma"
      duration = 60, // Duration in minutes
      timeZoneId = "Asia/Kolkata",
      description,
      layout = "CR", // "CR", "GL", "WB", "SS"
      login = false, // Guest access by default
      recordingDownload = false,
      // Perma class specific parameters
      endDate, // For perma class - when series ends
      schedule, // For perma class - [0,1,2,3,4,5,6] for days of week
      totalClasses // For perma class - total number of classes
    } = req.body;

    // Validate required fields
    console.log('✅ [VALIDATION] Starting field validation...');

    if (!title || title.trim() === "") {
      console.log('❌ [VALIDATION] Title validation failed');
      return res.status(400).json({
        error: "Title is required to create a live class.",
      });
    }
    console.log('✅ [VALIDATION] Title is valid:', title);

    if (!courseIds || courseIds.length === 0) {
      console.log('❌ [VALIDATION] CourseIds validation failed');
      return res.status(400).json({
        error: "At least one course ID is required to create a live class.",
      });
    }
    console.log('✅ [VALIDATION] CourseIds are valid:', courseIds.length, 'courses');

    if (!startTime) {
      console.log('❌ [VALIDATION] StartTime validation failed');
      return res.status(400).json({
        error: "Start time is required to create a live class.",
      });
    }
    console.log('✅ [VALIDATION] StartTime is valid:', startTime);

    // Validate platform-specific requirements
    console.log('🔍 [PLATFORM] Validating platform-specific requirements...');
    console.log('   Platform:', platform);

    if (platform === "zoom") {
      console.log('🔍 [ZOOM] Validating Zoom requirements...');
      if (!zoomMeetingLink || zoomMeetingLink.trim() === "") {
        console.log('❌ [ZOOM] Zoom meeting link validation failed');
        return res.status(400).json({
          error: "Zoom meeting link is required when using Zoom platform.",
        });
      }
      console.log('✅ [ZOOM] Zoom meeting link is valid');
    } else if (platform === "merithub") {
      console.log('🔍 [MERITHUB] Validating MeritHub requirements...');
      // MeritHub validation (existing logic)
      if (!userId) {
        console.log('❌ [MERITHUB] UserId (merithubUserId) validation failed');
        return res.status(400).json({
          error: "User ID is required for MeritHub integration.",
        });
      }
      console.log('✅ [MERITHUB] UserId (merithubUserId) is valid:', userId);
    }

    // Validate that startTime is a valid date and not in the past (for scheduled classes)
    console.log('🕐 [TIME] Validating start time...');
    const classStartTime = new Date(startTime);
    console.log('   Parsed start time:', classStartTime);

    if (isNaN(classStartTime.getTime())) {
      console.log('❌ [TIME] Invalid start time format');
      return res.status(400).json({
        error: "Invalid start time format.",
      });
    }

    const now = new Date();
    const timeDifference = classStartTime.getTime() - now.getTime();
    console.log('   Current time:', now);
    console.log('   Time difference (ms):', timeDifference);
    console.log('   Time difference (minutes):', Math.round(timeDifference / 60000));

    // Allow immediate classes (within 1 minute) or future scheduled classes
    if (timeDifference < -60000) { // More than 1 minute in the past
      console.log('❌ [TIME] Start time is too far in the past');
      return res.status(400).json({
        error: "Start time cannot be in the past.",
      });
    }
    console.log('✅ [TIME] Start time validation passed');

    // Validate class type specific requirements
    if (type === "perma") {
      // For perma class, either endDate or totalClasses must be provided
      if (!endDate && !totalClasses) {
        return res.status(400).json({
          error: "For perma class, either endDate or totalClasses must be provided.",
        });
      }

      // If schedule is provided, validate it
      if (schedule && (!Array.isArray(schedule) || schedule.some(day => day < 0 || day > 6))) {
        return res.status(400).json({
          error: "Schedule must be an array of numbers from 0 (Sunday) to 6 (Saturday).",
        });
      }
    }

    // Validate layout parameter
    const validLayouts = ["CR", "GL", "WB", "SS"];
    if (!validLayouts.includes(layout)) {
      return res.status(400).json({
        error: `Layout must be one of: ${validLayouts.join(", ")} (CR=Classroom, GL=Gallery, WB=Whiteboard, SS=Split Screen)`,
      });
    }

    // Prepare live class details according to MeritHub API specification
    const liveClassDetails = {
      title,
      startTime,
      recordingDownload,
      courseIds, // Now handling an array of course IDs
      platform: platform || "merithub", // Default to MeritHub
      duration,
      lang: "en",
      timeZoneId,
      description: description || `Live class for ${title}`,
      type, // "oneTime" or "perma"
      access: "private",
      login, // Guest access control
      layout, // Classroom layout
      status: "up", // Upcoming class
      recording: {
        record: true,
        autoRecord: false,
        recordingControl: true,
      },
      participantControl: {
        write: false,
        audio: false,
        video: false,
      },
      ...(platform === "merithub" && { merithubInstructorId: userId }),

      // Add perma class specific fields only if type is "perma"
      ...(type === "perma" && {
        ...(endDate && { endDate }),
        ...(schedule && { schedule }),
        ...(totalClasses && { totalClasses }),
      }),

      // Add Zoom-specific fields
      ...(platform === "zoom" && {
        zoomMeetingLink,
        zoomMeetingId,
        zoomPasscode,
      }),
    };

    console.log('✅ [PREPARATION] Live class details prepared successfully');
    console.log('📊 [PREPARATION] Details summary:');
    console.log('   - Title:', liveClassDetails.title);
    console.log('   - Platform:', liveClassDetails.platform);
    console.log('   - Duration:', liveClassDetails.duration, 'minutes');
    console.log('   - Access:', liveClassDetails.access);
    console.log('   - Course IDs:', liveClassDetails.courseIds.length, 'courses');

    // Create and save the live class
    console.log('\n💾 [DATABASE] Creating live class in database...');
    const liveClass = new LiveClass(liveClassDetails);
    console.log('📋 [DATABASE] Live class object created');

    console.log('💾 [DATABASE] Saving live class to database...');
    await liveClass.save();
    console.log('✅ [DATABASE] Live class saved successfully with ID:', liveClass._id);

    // Handle platform-specific logic
    console.log('\n🔀 [PLATFORM] Processing platform-specific logic...');
    if (platform === "zoom") {
      console.log('🔍 [ZOOM] Processing Zoom platform...');
      // For Zoom, we generate a classId using the MongoDB _id
      // This ensures Zoom classes have a classId for delete/edit operations
      liveClass.classId = liveClass._id.toString();
      await liveClass.save();

      console.log("🎥 [ZOOM] Creating Zoom-based live class");
      console.log("🎥 [ZOOM] Live class details:", liveClassDetails);
      console.log("🎥 [ZOOM] Generated classId:", liveClass.classId);
      console.log("🎥 [ZOOM] Zoom meeting link:", zoomMeetingLink);

      // Find users associated with any of the course IDs
      const users = await User.find({
        "purchasedCourses.course": { $in: courseIds },
      });

      console.log(`🎥 [ZOOM] Found ${users.length} users for courses:`, courseIds);

      // Add live class info to users
      if (users.length > 0) {
        const liveClassInfo = {
          courseIds,
          title,
          startTime,
          duration: liveClassDetails.duration,
          classId: liveClass.classId, // Add classId for consistency
          platform: "zoom",
          liveLink: zoomMeetingLink, // Use Zoom link as liveLink
        };

        console.log("🎥 [ZOOM] Adding live class info to users:", liveClassInfo);

        const updatePromises = users.map(async (user) => {
          return User.findByIdAndUpdate(
            user._id,
            { $push: { liveClasses: liveClassInfo } },
            { new: true }
          );
        });

        await Promise.all(updatePromises);
        console.log(`🎥 [ZOOM] Successfully updated ${users.length} users with live class info`);

        // 🔥 CACHE FIX: Invalidate user profile cache for all affected users
        console.log("🗑️ [CACHE] Invalidating user profile cache for live class creation");
        await invalidateCache("profile:*");
        console.log("✅ [CACHE] User profile cache invalidated");
      } else {
        console.log("🎥 [ZOOM] No users found for the selected courses");
      }

      // Respond to the client
      console.log("🎥 [ZOOM] Zoom live class created successfully:", liveClass._id);
      res.status(201).json({
        message: "Zoom live class scheduled successfully",
        liveClass,
      });

    } else {
      console.log('🔍 [MERITHUB] Processing MeritHub platform...');

      // MeritHub logic - get user's MeritHub token for class creation
      console.log('👤 [MERITHUB] Looking up instructor in database...');
      console.log('   Searching for merithubUserId:', userId);

      const instructor = await User.findOne({ merithubUserId: userId });
      if (!instructor) {
        console.log('❌ [MERITHUB] Instructor not found in database');
        console.log('   Searched merithubUserId:', userId);
        return res.status(400).json({
          error: "Instructor not found in database. Please ensure the user is properly registered.",
        });
      }

      console.log(`🎥 [MERITHUB] Creating class for instructor: ${instructor.firstName} ${instructor.lastName}`);
      console.log('🚨🚨🚨 [DEBUG] OUR CONTROLLER IS BEING USED! 🚨🚨🚨');
      console.log('📤 [MERITHUB] Calling scheduleLiveClass API...');
      console.log('   Instructor merithubUserId:', userId);
      // Note: scheduleLiveClass uses service account token, not user token
      // The userToken parameter is accepted but not used in the implementation
      const apiResponse = await scheduleLiveClass(userId, liveClassDetails, null);

      console.log('📥 [MERITHUB] Received API response');
      console.log('   Response type:', typeof apiResponse);
      console.log('   Has classId:', !!(apiResponse && apiResponse.classId));
      console.log('   Has commonLinks:', !!(apiResponse && apiResponse.commonLinks));

      if (!apiResponse || !apiResponse.classId || !apiResponse.commonLinks) {
        console.log('❌ [MERITHUB] Invalid API response structure');
        console.log('   Full response:', apiResponse);
        return res
          .status(400)
          .json({ error: "Failed to schedule the class on MeritHub." });
      }

      // Handle MeritHub API response structure:
      // {
      //   "classId": "Scheduled_Class_ID",
      //   "commonLinks": {
      //     "commonHostLink": "Common__Host__Link__To__Join",
      //     "commonModeratorLink": "Common__Moderator__Link__To__Join",
      //     "commonParticipantLink": "Common__Participant__Link__To__Join"
      //   },
      //   "hostLink": "Unique__User__Link__For___User_"
      // }
      const { classId, commonLinks, hostLink } = apiResponse;
      const { commonHostLink, commonParticipantLink, commonModeratorLink } = commonLinks;

      // Format links properly for MeritHub live classroom
      const CLIENT_ID = process.env.MERIT_HUB_CLIENT_ID;

      // 🔧 FIX: Use role-based links as per MeritHub documentation
      // MeritHub provides different links for different roles:
      // - hostLink: For instructors (full control)
      // - commonParticipantLink: For students (participant permissions)
      // - commonModeratorLink: For moderators (moderator permissions)

      // Format instructor link (hostLink - full control)
      const formattedInstructorLink = hostLink ?
        `https://live.merithub.com/info/room/${CLIENT_ID}/${hostLink}` : null;

      // Format participant link (for students - participant permissions)
      const formattedParticipantLink = commonParticipantLink ?
        `https://live.merithub.com/info/room/${CLIENT_ID}/${commonParticipantLink}` : null;

      // Format moderator link (for co-teachers - moderator permissions)
      const formattedModeratorLink = commonModeratorLink ?
        `https://live.merithub.com/info/room/${CLIENT_ID}/${commonModeratorLink}` : null;

      // Device test links for each role
      const formattedInstructorDeviceTestLink = hostLink ?
        `https://live.merithub.com/info/room/${CLIENT_ID}/${hostLink}?devicetest=true` : null;
      const formattedParticipantDeviceTestLink = commonParticipantLink ?
        `https://live.merithub.com/info/room/${CLIENT_ID}/${commonParticipantLink}?devicetest=true` : null;

      // Store role-based links
      liveClass.liveLink = formattedInstructorLink; // Primary instructor link (hostLink)
      liveClass.instructorLink = formattedInstructorLink; // Instructor link (hostLink - full control)
      liveClass.participantLink = formattedParticipantLink; // Participant link (students - limited permissions)
      liveClass.moderatorLink = formattedModeratorLink; // Moderator link (co-teachers)
      liveClass.deviceTestLink = formattedParticipantDeviceTestLink; // Device test for participants
      liveClass.instructorDeviceTestLink = formattedInstructorDeviceTestLink; // Device test for instructor
      liveClass.classId = classId;

      console.log('✅ [MERITHUB] MeritHub API Response processed successfully:');
      console.log(`   Class ID: ${classId}`);
      console.log(`   Host Link (Primary): ${hostLink ? 'Available' : 'Not provided'}`);
      console.log(`   Common Host Link: ${commonHostLink ? 'Available (reference only)' : 'Not provided'}`);
      console.log(`   Common Participant Link: ${commonParticipantLink ? 'Available (reference only)' : 'Not provided'}`);
      console.log(`   Common Moderator Link: ${commonModeratorLink ? 'Available' : 'Not provided'}`);
      console.log('');

      // 🔍 DEBUG: Check if all links are the same
      console.log('🔍 [DEBUG] Raw MeritHub API Response Links:');
      console.log(`   hostLink: ${hostLink}`);
      console.log(`   commonHostLink: ${commonHostLink}`);
      console.log(`   commonParticipantLink: ${commonParticipantLink}`);
      console.log(`   commonModeratorLink: ${commonModeratorLink}`);
      console.log('');

      const allLinksAreSame = hostLink === commonHostLink &&
        commonHostLink === commonParticipantLink &&
        commonParticipantLink === commonModeratorLink;

      console.log('🎯 [LINK ANALYSIS] Are all MeritHub links identical?', allLinksAreSame ? '❌ YES (PROBLEM!)' : '✅ NO');
      if (allLinksAreSame) {
        console.log('   🚨 MeritHub API returned identical links for all roles');
        console.log('   This will cause all users to get the same permissions');
      }
      console.log('');
      console.log('🔗 [FORMATTED LINKS] Following MeritHub best practices:');
      console.log(`   Primary Classroom Link (hostLink): ${formattedInstructorLink}`);
      console.log(`   Device Test Link: ${formattedInstructorDeviceTestLink}`);
      console.log(`   Instructor Link: ${formattedInstructorLink}`);
      console.log(`   Participant Link: ${formattedParticipantLink}`);
      console.log(`   Moderator Link: ${formattedModeratorLink}`);
      console.log('');
      console.log('💡 [MERITHUB DOCS] All users should use the hostLink to open the classroom');
      console.log('💡 [MERITHUB DOCS] Do not use commonLinks to open the classroom');
      await liveClass.save();

      console.log('🚨 [DEBUG] CHECKPOINT: liveClass.save() completed successfully!');

      // Find users associated with any of the course IDs
      console.log('\n👥 [USER_SEARCH] Finding users for live class...');
      console.log('🔍 [USER_SEARCH] Searching for users with purchased courses:', courseIds);

      const users = await User.find({
        "purchasedCourses.course": { $in: courseIds },
      });

      console.log(`📊 [USER_SEARCH] Database query completed`);
      console.log(`   Total users found: ${users.length}`);

      // 🔧 FIX: Filter out users without merithubUserId and log details
      console.log('🔍 [USER_FILTER] Filtering users with merithubUserId...');
      const usersWithMerithubId = users.filter(user => user.merithubUserId);
      const merithubUserIds = usersWithMerithubId.map((user) => user.merithubUserId);

      console.log(`📊 [USER_FILTER] Filtering results:`);
      console.log(`   Total users found: ${users.length}`);
      console.log(`   Users with merithubUserId: ${usersWithMerithubId.length}`);
      console.log(`   Users missing merithubUserId: ${users.length - usersWithMerithubId.length}`);

      if (usersWithMerithubId.length > 0) {
        console.log(`👥 [USER_LIST] Users eligible for live class:`);
        usersWithMerithubId.forEach((user, index) => {
          console.log(`   ${index + 1}. ${user.firstName} ${user.lastName} (${user.merithubUserId}) - ${user.email || 'No email'}`);
        });
        console.log(`📋 [USER_LIST] MerithubUserIds to send to API:`, merithubUserIds);
      } else {
        console.log('⚠️ [USER_LIST] No users with merithubUserId found for this course');
      }

      // Add users to the live class (REQUIRED when commonParticipantLink is available)
      if (merithubUserIds.length > 0) {
        console.log(`👥 [MERITHUB] Attempting to add ${merithubUserIds.length} users to class`);
        console.log(`🔗 [MERITHUB] Using commonParticipantLink: ${commonParticipantLink}`);

        if (!commonParticipantLink) {
          console.error(`❌ [MERITHUB] No commonParticipantLink available - cannot add users to class`);
          return res.status(500).json({
            error: "MeritHub class creation failed - no participant link available"
          });
        }

        // 🔧 FIX: Use common participant link for guest access (no login required)
        // Since login: false is set, users can join directly with commonParticipantLink
        console.log(`✅ [MERITHUB] Using common participant link for guest access (no login required)`);
        console.log(`🔗 [MERITHUB] Common participant link: ${commonParticipantLink}`);

        // Find users associated with any of the course IDs
        const users = await User.find({
          "purchasedCourses.course": { $in: courseIds },
        });

        console.log(`👥 [MERITHUB] Found ${users.length} users for courses:`, courseIds);

        // 🔧 CRITICAL FIX: Call addUsersToClass and process individual user links (like working code)
        console.log(`👥 [MERITHUB] Calling addUsersToClass API...`);

        // Add 2-second delay to ensure class is ready (as per previous working implementation)
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
          const addUsersResponse = await addUsersToClass(classId, merithubUserIds, commonParticipantLink);

          if (!addUsersResponse || !Array.isArray(addUsersResponse)) {
            console.error(`❌ [MERITHUB] Invalid addUsersResponse:`, addUsersResponse);
            // Delete the created class if user addition fails
            await LiveClass.deleteOne({ _id: liveClass._id });
            return res.status(500).json({
              error: "Failed to add users to class - invalid MeritHub response"
            });
          }

          console.log(`✅ [MERITHUB] Successfully added ${addUsersResponse.length} users to class`);

          // 🔧 CRITICAL: Process individual user links from MeritHub response
          // Each user gets their own unique individual link from MeritHub
          const CLIENT_ID = process.env.MERIT_HUB_CLIENT_ID;

          console.log(`🔗 [STUDENT LINKS] Processing individual user links from MeritHub:`);
          console.log(`   Total users added: ${addUsersResponse.length}`);

          const addUserPromises = addUsersResponse.map(async (userResponse) => {
            const { userLink, userId: merithubUserId } = userResponse;

            if (!userLink || !merithubUserId) {
              console.warn(`⚠️ [MERITHUB] Missing userLink or userId for user:`, userResponse);
              return null;
            }

            // Format individual user link (each user gets their own unique link)
            const individualUserLink = `https://live.merithub.com/info/room/${CLIENT_ID}/${userLink}?iframe=true`;

            console.log(`👤 [MERITHUB] User ${merithubUserId} got individual link: ${individualUserLink}`);

            const userLiveClassInfo = {
              courseIds,
              title,
              startTime,
              duration: liveClassDetails.duration,
              classId: liveClass.classId,
              platform: "merithub",
              liveLink: individualUserLink, // Use individual user link (unique per user)
              participantLink: individualUserLink, // Same as liveLink for consistency
            };

            console.log(`👤 [MERITHUB] Updating user ${merithubUserId} with individual link`);

            return User.findOneAndUpdate(
              { merithubUserId },
              { $push: { liveClasses: userLiveClassInfo } },
              { new: true }
            );
          });

          const updateResults = await Promise.all(addUserPromises);
          const successfulUpdates = updateResults.filter(result => result !== null);
          console.log(`✅ [MERITHUB] Successfully updated ${successfulUpdates.length} users with individual links`);

        } catch (addUsersError) {
          console.error(`❌ [MERITHUB] Failed to add users to class:`, addUsersError.message);
          // Delete the created class if user addition fails (as per requirement)
          await LiveClass.deleteOne({ _id: liveClass._id });
          return res.status(500).json({
            error: `Failed to add users to class: ${addUsersError.message}`
          });
        }

        // 🔥 CACHE FIX: Invalidate user profile cache for all affected users
        console.log("🗑️ [CACHE] Invalidating user profile cache for live class creation");
        await invalidateCache("profile:*");
        console.log("✅ [CACHE] User profile cache invalidated");
      } else {
        console.log(`ℹ️ [MERITHUB] No users found to add to class`);
      }

      // No final fallback - users must have individual MeritHub links to access live classes
      console.log(`ℹ️ [POLICY] Only users with individual MeritHub links will have access to live classes`);
      console.log(`ℹ️ [POLICY] Common participant links are no longer used for security and tracking purposes`);

      // Always respond with success if class was created (regardless of user addition status)
      console.log('\n🎉 [SUCCESS] Live class creation completed successfully!');
      console.log('📊 [SUMMARY] Final summary:');
      console.log(`   Class ID: ${liveClass.classId}`);
      console.log(`   Database ID: ${liveClass._id}`);
      console.log(`   Title: ${liveClass.title}`);
      console.log(`   Platform: ${liveClass.platform}`);
      console.log(`   Users processed: ${merithubUserIds ? merithubUserIds.length : 0}`);
      console.log(`   Response sent to client: SUCCESS`);

      res.status(201).json({
        message: "Live class scheduled successfully",
        liveClass,
        note: merithubUserIds.length > 0 ? "Users will be added to class automatically" : "No enrolled users found for selected courses"
      });
    }
  } catch (error) {
    console.error('\n❌ [ERROR] Live class creation failed!');
    console.error("Error details:", error.message);
    console.error("Stack trace:", error.stack);
    res.status(500).json({
      error:
        error.message ||
        "An unexpected error occurred while scheduling the live class.",
    });
  }

  console.log('\n🎬 ============================================');
  console.log('🎬 LIVE CLASS CREATION ENDED');
  console.log('🎬 ============================================');
};

const fetchAllClasses = async (req, res) => {
  try {
    // Fetch all live classes from the database, excluding only soft-deleted entries.
    // Admins can now see upcoming, live, and completed classes until they delete them manually.
    const classes = await LiveClass.find({
      status: { $ne: "deleted" },
    }).sort({ startTime: -1 });

    if (!classes || classes.length === 0) {
      return res.status(200).json({
        message: "No classes found.",
        classes: [],
      });
    }

    res.status(200).json({
      message: "Live classes fetched successfully",
      classes,
    });
  } catch (error) {
    console.error("Error fetching live classes:", error.message);
    res.status(500).json({
      error:
        error.message ||
        "An unexpected error occurred while fetching live classes.",
    });
  }
};

// New function to fetch user-specific live classes
const fetchUserLiveClasses = async (req, res) => {
  try {
    const userId = req.user._id;
    console.log(`🔍 [USER LIVE CLASSES] Fetching live classes for user: ${userId}`);

    // First, get the user's purchased courses
    const user = await User.findById(userId).select('purchasedCourses');
    if (!user) {
      return res.status(404).json({
        message: "User not found",
        classes: [],
      });
    }

    console.log(`📚 [USER COURSES] User has ${user.purchasedCourses.length} purchased courses`);

    // Extract course IDs from purchased courses
    const userCourseIds = user.purchasedCourses.map(pc => pc.course.toString());
    console.log(`🎯 [COURSE IDS] User course IDs:`, userCourseIds);

    // Find live classes that match any of the user's purchased courses
    // Exclude completed, deleted, and expired classes
    const classes = await LiveClass.find({
      courseIds: { $in: userCourseIds },
      status: { $ne: "deleted" }
    }).sort({ startTime: -1 });

    console.log(`🎥 [LIVE CLASSES] Found ${classes.length} live classes for user's courses`);

    if (!classes || classes.length === 0) {
      return res.status(200).json({
        message: "No live classes found for your courses.",
        classes: [],
      });
    }

    // Requirement: keep classes visible for students until admins delete them.
    // So we only exclude hard deleted ones above and return the full list here.
    const activeClasses = classes;
    console.log(`✅ [FILTERED] ${activeClasses.length} classes returned to user (no auto-removal)`);

    // 🔧 FIX: Use individual user links from user profiles (like working code)
    console.log(`🔗 [INDIVIDUAL_LINKS] Users will get their individual MeritHub links`);

    // Get user's individual live class links from their profile
    const userWithLiveClasses = await User.findById(userId).select('liveClasses userType');
    const userLiveClasses = userWithLiveClasses?.liveClasses || [];

    console.log(`👤 [USER_PROFILE] Found ${userLiveClasses.length} live classes in user profile`);

    // Determine user role
    const isInstructor = userWithLiveClasses?.userType === 'ADMIN' || req.user.userType === 'ADMIN';
    console.log(`👤 [USER_ROLE] User ${userId} is ${isInstructor ? 'Instructor' : 'Student'}`);

    // Enhanced classes with individual user links from profile
    const enhancedClasses = activeClasses.map(liveClass => {
      // Find user's individual link for this class from their profile
      const userClassInfo = userLiveClasses.find(uc =>
        uc.classId === liveClass.classId ||
        (uc.title === liveClass.title && new Date(uc.startTime).getTime() === new Date(liveClass.startTime).getTime())
      );

      let individualUserLink, accessType, deviceTestLink;

      if (isInstructor) {
        // Instructor gets instructor link (full control)
        individualUserLink = liveClass.instructorLink || liveClass.liveLink || null;
        deviceTestLink = liveClass.instructorDeviceTestLink || null;
        accessType = 'instructor';
      } else {
        // Students get their individual user link from profile (like working code)
        individualUserLink = userClassInfo?.liveLink || userClassInfo?.participantLink || liveClass.participantLink || null;
        deviceTestLink = liveClass.deviceTestLink || null;
        accessType = 'participant';
      }

      const enhancedClass = {
        ...liveClass.toObject(),
        individualUserLink,
        individualUserToken: null,
        hasIndividualAccess: !!individualUserLink,
        accessType,
        deviceTestLink,
        // Include user profile info for debugging
        userProfileLinkAvailable: !!userClassInfo?.liveLink
      };

      console.log(`🔗 [CLASS_${liveClass.classId}] ${accessType} access: ${enhancedClass.individualUserLink ? 'Available' : 'Not available'}`);
      console.log(`👤 [CLASS_${liveClass.classId}] User profile link: ${userClassInfo?.liveLink ? 'Available' : 'Not available'}`);
      if (enhancedClass.deviceTestLink) {
        console.log(`🔧 [CLASS_${liveClass.classId}] Device test link: Available`);
      }

      return enhancedClass;
    });

    console.log(`✅ [ENHANCED] Enhanced ${enhancedClasses.length} classes with role-based access`);
    const classesWithLinks = enhancedClasses.filter(c => c.hasIndividualAccess);
    console.log(`🔗 [ENHANCED] ${classesWithLinks.length} classes have role-based access`);

    // Respond with the enhanced list of classes
    res.status(200).json({
      message: "Live classes fetched successfully",
      classes: enhancedClasses,
    });
  } catch (error) {
    console.error("❌ [USER LIVE CLASSES] Error fetching user live classes:", error.message);
    res.status(500).json({
      error:
        error.message ||
        "An unexpected error occurred while fetching live classes.",
    });
  }
};

/**
 * Edit an existing live class
 */
const editLiveClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const inputDetails = req.body;

    // Retrieve the current live class details from the database
    const existingClass = await findLiveClassById(classId);
    if (!existingClass) {
      return res.status(400).json({ error: "Live class not found." });
    }

    console.log(`🔄 [EDIT] Editing live class: ${classId}, Platform: ${existingClass.platform}`);

    // Prepare updated details based on platform
    let updatedDetails = {
      title: inputDetails.title || existingClass.title,
      startTime: inputDetails.startTime || existingClass.startTime,
      duration: inputDetails.duration || existingClass.duration,
      platform: inputDetails.platform || existingClass.platform,
      courseIds: inputDetails.courseIds || existingClass.courseIds,
    };

    // Platform-specific updates
    if (existingClass.platform === "zoom" || inputDetails.platform === "zoom") {
      // For Zoom classes, update Zoom-specific fields
      updatedDetails = {
        ...updatedDetails,
        zoomMeetingLink: inputDetails.zoomMeetingLink || existingClass.zoomMeetingLink,
        zoomMeetingId: inputDetails.zoomMeetingId || existingClass.zoomMeetingId,
        zoomPasscode: inputDetails.zoomPasscode || existingClass.zoomPasscode,
      };
      console.log(`🎥 [ZOOM] Updating Zoom class fields`);
    } else {
      // For MeritHub classes, update MeritHub-specific fields
      updatedDetails = {
        ...updatedDetails,
        lang: inputDetails.lang || existingClass.lang,
        timeZoneId: inputDetails.timeZoneId || existingClass.timeZoneId,
        description: inputDetails.description || existingClass.description,
        layout: inputDetails.layout || existingClass.layout,
        recording: {
          record: inputDetails.record !== undefined ? inputDetails.record : existingClass.recording?.record,
          autoRecord: inputDetails.autoRecord !== undefined ? inputDetails.autoRecord : existingClass.recording?.autoRecord,
          recordingControl: inputDetails.recordingControl !== undefined ? inputDetails.recordingControl : existingClass.recording?.recordingControl,
        },
        participantControl: {
          write: inputDetails.write !== undefined ? inputDetails.write : existingClass.participantControl?.write,
          audio: inputDetails.audio !== undefined ? inputDetails.audio : existingClass.participantControl?.audio,
          video: inputDetails.video !== undefined ? inputDetails.video : existingClass.participantControl?.video,
        },
      };

      // Update external MeritHub API first
      try {
        console.log(`📺 [MERITHUB] Updating MeritHub API for class: ${classId}`);
        await editClass(classId, updatedDetails);
      } catch (apiError) {
        console.warn("Failed to update class in MeritHub API:", apiError.message);
        // Continue with local update even if external API fails
      }
    }

    // Update the live class in the database - use the actual database identifier
    const updateQuery = existingClass.classId ? { classId } : { _id: classId };
    const updatedLiveClass = await LiveClass.findOneAndUpdate(
      updateQuery,
      { $set: updatedDetails },
      { new: true }
    );

    // Update the live class details in user documents
    const userUpdateResult = await User.updateMany(
      { "liveClasses.classId": classId },
      {
        $set: {
          "liveClasses.$.title": updatedDetails.title,
          "liveClasses.$.startTime": updatedDetails.startTime,
          "liveClasses.$.duration": updatedDetails.duration,
          ...(updatedDetails.platform === "zoom" && {
            "liveClasses.$.liveLink": updatedDetails.zoomMeetingLink,
          }),
        },
      }
    );

    console.log(`Users updated: ${userUpdateResult.modifiedCount}`);

    // 🔥 CACHE FIX: Invalidate user profile cache for all affected users
    console.log("🗑️ [CACHE] Invalidating user profile cache for live class edit");
    await invalidateCache("profile:*");
    console.log("✅ [CACHE] User profile cache invalidated");

    if (!updatedLiveClass) {
      return res
        .status(400)
        .json({ error: "Failed to update the live class in the database." });
    }

    res.status(200).json({
      message: "Live class updated successfully",
      liveClass: updatedLiveClass,
    });
  } catch (error) {
    console.error("Error updating live class:", error.message);
    res.status(500).json({
      error:
        error.message ||
        "An unexpected error occurred while updating the live class.",
    });
  }
};

/**
 * Deletes an existing live class.
 */
const deleteLiveClass = async (req, res) => {
  console.log('🚀 [DELETE] Delete function called with classId:', req.params.classId);
  try {
    const { classId } = req.params;

    console.log(`🔍 [DELETE] Searching for class with ID: ${classId}`);

    // Find the live class first
    const liveClass = await findLiveClassById(classId);
    console.log(`🔍 [DELETE] Found live class: ${!!liveClass}`);

    if (!liveClass) {
      console.log(`❌ [DELETE] Live class not found with ID: ${classId}`);
      return res.status(404).json({ error: "Live class not found." });
    }

    console.log(`🗑️ [DELETE] Deleting live class: ${classId}`);
    console.log(`🗑️ [DELETE] Found class: ${liveClass.title}, Platform: ${liveClass.platform}`);
    console.log(`🗑️ [DELETE] Class _id: ${liveClass._id}, classId: ${liveClass.classId}`);

    // Delete from external API only for MeritHub classes
    if (liveClass.platform === "merithub") {
      try {
        console.log(`📺 [MERITHUB] Deleting from MeritHub API: ${classId}`);
        await deleteClassAPI(classId);
      } catch (apiError) {
        console.warn("Failed to delete class from MeritHub API:", apiError.message);
        // Continue with local deletion even if external API fails
      }
    } else if (liveClass.platform === "zoom") {
      console.log(`🎥 [ZOOM] Skipping external API deletion for Zoom class: ${classId}`);
    }

    // Delete from local database - use the actual database identifier
    const deleteQuery = liveClass.classId ? { classId } : { _id: classId };
    await LiveClass.deleteOne(deleteQuery);
    console.log(`Live class deleted from database: ${classId}`);

    // Remove live class reference from all users
    // Try multiple approaches to ensure complete removal
    let totalUsersUpdated = 0;

    // Method 1: Remove by classId (most reliable)
    if (liveClass.classId) {
      console.log(`🔍 [DELETE] Searching for users with classId: ${liveClass.classId}`);
      const usersWithClass = await User.find({ "liveClasses.classId": liveClass.classId });
      console.log(`🔍 [DELETE] Found ${usersWithClass.length} users with this classId`);

      const updateByClassId = await User.updateMany(
        { "liveClasses.classId": liveClass.classId },
        { $pull: { liveClasses: { classId: liveClass.classId } } }
      );
      totalUsersUpdated += updateByClassId.modifiedCount;
      console.log(`🔍 [DELETE] Removed by classId: ${updateByClassId.modifiedCount} users`);
    }

    // Method 2: Remove by title (fallback for classes without classId)
    console.log(`🔍 [DELETE] Searching for users with title: ${liveClass.title}`);
    const usersWithTitle = await User.find({ "liveClasses.title": liveClass.title });
    console.log(`🔍 [DELETE] Found ${usersWithTitle.length} users with this title`);

    const updateByTitle = await User.updateMany(
      { "liveClasses.title": liveClass.title },
      { $pull: { liveClasses: { title: liveClass.title } } }
    );
    totalUsersUpdated += updateByTitle.modifiedCount;
    console.log(`🔍 [DELETE] Removed by title: ${updateByTitle.modifiedCount} users`);

    // Method 3: Remove by exact startTime match (additional cleanup)
    console.log(`🔍 [DELETE] Searching for users with startTime: ${liveClass.startTime}`);
    const usersWithStartTime = await User.find({ "liveClasses.startTime": liveClass.startTime });
    console.log(`🔍 [DELETE] Found ${usersWithStartTime.length} users with this startTime`);

    const updateByStartTime = await User.updateMany(
      { "liveClasses.startTime": liveClass.startTime },
      { $pull: { liveClasses: { startTime: liveClass.startTime } } }
    );
    console.log(`🔍 [DELETE] Removed by startTime: ${updateByStartTime.modifiedCount} users`);

    console.log(`🎯 [DELETE] Total users updated: ${totalUsersUpdated}`);

    // Final verification: Check if any users still have this class
    const remainingUsers = await User.find({
      $or: [
        { "liveClasses.classId": liveClass.classId },
        { "liveClasses.title": liveClass.title },
        { "liveClasses.startTime": liveClass.startTime }
      ]
    });

    if (remainingUsers.length > 0) {
      console.warn(`⚠️ [DELETE] Warning: ${remainingUsers.length} users still have references to this class`);
      remainingUsers.forEach(user => {
        const matchingClasses = user.liveClasses.filter(lc =>
          lc.classId === liveClass.classId ||
          lc.title === liveClass.title ||
          lc.startTime.getTime() === liveClass.startTime.getTime()
        );
        console.warn(`⚠️ [DELETE] User ${user._id} still has ${matchingClasses.length} matching classes`);
      });
    } else {
      console.log("✅ [DELETE] Verification passed: No users have references to this class");
    }

    // 🔥 CACHE FIX: Invalidate user profile cache for all affected users
    console.log("🗑️ [CACHE] Invalidating user profile cache for live class deletion");
    await invalidateCache("profile:*");
    console.log("✅ [CACHE] User profile cache invalidated");

    return res.status(200).json({
      message: "Live class deleted successfully",
      usersUpdated: totalUsersUpdated,
      remainingReferences: remainingUsers.length
    });
  } catch (error) {
    console.error("Error deleting live class:", error.message);
    return res.status(500).json({
      error: error.message || "An unexpected error occurred.",
    });
  }
};


const getRecordedVideos = async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user._id;

    const hasAccess = await Course.exists({
      _id: courseId,
      "purchasedBy.userId": userId,
    });

    if (!hasAccess) {
      return res
        .status(403)
        .json({ message: "You do not have access to this course" });
    }

    const params = {
      Bucket: process.env.S3_BUCKET,
      Prefix: `courses/${courseId}/recordings/`,
    };

    const command = new ListObjectsV2Command(params);
    const s3Data = await s3.send(command);

    const videos = await Promise.all(
      s3Data.Contents.map(async (object) => {
        const getObjectCommand = new GetObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: object.Key,
        });
        const signedUrl = await getSignedUrl(s3, getObjectCommand, { expiresIn: 3600 });

        return {
          title: object.Key.split("/").pop(),
          url: signedUrl,
          duration: object.Size,
          uploadedAt: object.LastModified,
        };
      })
    );

    res
      .status(200)
      .json({ message: "Recorded videos fetched successfully", videos });
  } catch (error) {
    console.error("Error fetching recorded videos:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch videos",
      error: error.message,
    });
  }
};

// Check live class status from MeritHub
const checkClassStatus = async (req, res) => {
  try {
    const { classId } = req.params;

    if (!classId) {
      return res.status(400).json({ error: "Class ID is required" });
    }

    console.log(`📊 [STATUS CHECK] Checking status for class: ${classId}`);

    // Find the class in our database
    const liveClass = await findLiveClassById(classId);

    if (!liveClass) {
      return res.status(404).json({ error: "Class not found" });
    }

    // If our DB already marks this class as completed/expired/deleted, allow admin deletion right away
    if (["completed", "expired", "deleted"].includes(liveClass.status)) {
      return res.json({
        status: liveClass.status,
        canDelete: true,
        message: "Class has ended and can be deleted",
        classData: liveClass,
      });
    }

    // Try to get status from MeritHub if we have a MeritHub class ID
    // IMPORTANT: Always check MeritHub's actual status, even if our DB says "lv"
    // This ensures we detect when a class has ended even if the webhook hasn't been processed yet
    if (liveClass.classId && liveClass.platform === "merithub") {
      try {
        // First check if class has passed its end time - if so, mark as completed
        const now = new Date();
        const startTime = new Date(liveClass.startTime);
        const duration = liveClass.duration || 60;
        const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
        const timeSinceEnd = now - endTime;

        // If class has passed its end time, mark as completed immediately
        if (timeSinceEnd > 0 && liveClass.status !== "lv") {
          console.log(`⏰ [STATUS CHECK] Class has passed its end time (${Math.round(timeSinceEnd / 60000)} minutes ago) - marking as completed`);
          await LiveClass.findByIdAndUpdate(liveClass._id, {
            status: "completed"
          });
          return res.json({
            status: "completed",
            canDelete: true,
            message: "Class has ended and can be deleted",
            classData: { ...liveClass.toObject(), status: "completed" }
          });
        }

        // Try to get status from MeritHub - try direct classId query first, then instructor query
        let meritHubStatus = null;
        let statusError = null;

        try {
          // First try: Query directly by classId (more reliable)
          console.log(`📊 [STATUS CHECK] Attempting direct classId query: ${liveClass.classId}`);
          meritHubStatus = await getClassStatus(liveClass.classId, null);
          console.log(`✅ [STATUS CHECK] Direct classId query succeeded`);
        } catch (directError) {
          console.log(`⚠️ [STATUS CHECK] Direct classId query failed: ${directError.message}`);
          statusError = directError;

          // Fallback: Try instructor query if we have instructor ID
          if (liveClass.merithubInstructorId) {
            try {
              console.log(`📊 [STATUS CHECK] Attempting instructor query: ${liveClass.merithubInstructorId} with classId: ${liveClass.classId}`);
              meritHubStatus = await getClassStatus(liveClass.classId, liveClass.merithubInstructorId);
              console.log(`✅ [STATUS CHECK] Instructor query succeeded`);
            } catch (instructorError) {
              console.log(`⚠️ [STATUS CHECK] Instructor query also failed: ${instructorError.message}`);
              statusError = instructorError;
            }
          }
        }

        if (!meritHubStatus) {
          console.log(`❌ [STATUS CHECK] Both query methods failed - checking if class exists in MeritHub`);
          // If both queries failed, the class might not exist in MeritHub
          // Check if error indicates class doesn't exist
          const errorMsg = statusError?.message?.toLowerCase() || '';
          if (errorMsg.includes('not found') || errorMsg.includes('does not exist') || errorMsg.includes('404')) {
            console.log(`✅ [STATUS CHECK] MeritHub confirms class does not exist - marking as completed`);
            await LiveClass.findByIdAndUpdate(liveClass._id, {
              status: "completed"
            });
            return res.json({
              status: "completed",
              canDelete: true,
              message: "Class does not exist in MeritHub (may have been deleted)",
              classData: { ...liveClass.toObject(), status: "completed" }
            });
          }
          // If we can't determine status, throw the error to be caught by outer catch
          throw statusError || new Error('Failed to get class status from MeritHub');
        }

        console.log(`📊 [STATUS CHECK] MeritHub status response:`, JSON.stringify(meritHubStatus, null, 2));

        const classesArray = Array.isArray(meritHubStatus.classes) ? meritHubStatus.classes : [];
        const activeMeritHubStatus = classesArray.length > 0 ? classesArray[0].status : null;
        const isMeritHubLive =
          meritHubStatus.status === "lv" ||
          meritHubStatus.status === "live" ||
          activeMeritHubStatus === "lv" ||
          activeMeritHubStatus === "live";

        // Trust MeritHub's response: if it returns empty classes array, check if class exists
        if (classesArray.length === 0) {
          console.log(`⚠️ [STATUS CHECK] MeritHub returned empty classes array`);
          console.log(`🔍 [STATUS CHECK] Class details: classId=${liveClass.classId}, createdAt=${liveClass.createdAt}, startTime=${liveClass.startTime}`);

          const createdAt = new Date(liveClass.createdAt);
          const protectionWindow = 2 * 60 * 1000; // 2 minutes after creation
          const timeSinceCreation = now - createdAt;

          // If MeritHub returns empty AND we have a valid classId, the class doesn't exist in MeritHub
          // This means either:
          // 1. Class creation failed silently
          // 2. Class was deleted from MeritHub
          // 3. ClassId is invalid
          // In all cases, we should allow deletion
          if (liveClass.classId && liveClass.classId !== liveClass._id.toString()) {
            console.log(`⚠️ [STATUS CHECK] Class has valid classId (${liveClass.classId}) but MeritHub returns empty`);
            console.log(`⚠️ [STATUS CHECK] This means the class does NOT exist in MeritHub`);
            console.log(`✅ [STATUS CHECK] Allowing deletion - class can be removed and recreated if needed`);

            // Mark as error/completed so it can be deleted
            await LiveClass.findByIdAndUpdate(liveClass._id, {
              status: "completed"
            });

            return res.json({
              status: "completed",
              canDelete: true,
              message: "Class does not exist in MeritHub (may have failed to create). You can delete and recreate it.",
              meritHubStatus,
              classData: { ...liveClass.toObject(), status: "completed" }
            });
          }

          // If class was just created and has no valid classId, protect it briefly
          if (timeSinceCreation < protectionWindow) {
            console.log(`⏳ [STATUS CHECK] Class was just created (${Math.round(timeSinceCreation / 1000)}s ago) and has no valid classId`);
            console.log(`⏳ [STATUS CHECK] Protecting from deletion - may still be creating in MeritHub`);
            return res.json({
              status: liveClass.status || "scheduled",
              canDelete: false,
              message: "Class is scheduled (recently created, MeritHub may still be syncing)",
              meritHubStatus,
              classData: liveClass
            });
          }

          // For older classes without valid classId: mark as completed
          console.log(`✅ [STATUS CHECK] MeritHub returned empty classes array for class created ${Math.round(timeSinceCreation / 60000)} minutes ago`);
          console.log(`✅ [STATUS CHECK] Marking as completed (trusting MeritHub response - class has ended or doesn't exist)`);
          await LiveClass.findByIdAndUpdate(liveClass._id, {
            status: "completed"
          });

          return res.json({
            status: "completed",
            canDelete: true,
            message: "Class has been completed (MeritHub shows session ended or class doesn't exist)",
            meritHubStatus,
            classData: { ...liveClass.toObject(), status: "completed" }
          });
        }

        // Check if MeritHub status explicitly indicates completion
        if (meritHubStatus.status === "cp" || meritHubStatus.status === "completed" || meritHubStatus.status === "ended") {
          console.log(`🗑️ [STATUS CHECK] MeritHub status indicates class is completed: ${meritHubStatus.status}`);

          // Update database status to "completed"
          await LiveClass.findByIdAndUpdate(liveClass._id, {
            status: "completed"
          });

          return res.json({
            status: "completed",
            canDelete: true,
            message: "Class has been completed",
            meritHubStatus,
            classData: { ...liveClass.toObject(), status: "completed" }
          });
        }

        // (second empty-array block removed; handled above)

        // Check if MeritHub status object itself indicates completion
        // Sometimes MeritHub might return status in a different format
        if (meritHubStatus.status === "cp" || meritHubStatus.status === "completed" || meritHubStatus.status === "ended") {
          console.log(`🗑️ [STATUS CHECK] MeritHub status indicates class is completed: ${meritHubStatus.status}`);
          return res.json({
            status: "completed",
            canDelete: true,
            message: "Class has been completed",
            meritHubStatus,
            classData: liveClass
          });
        }

        // Update our database with the latest status
        if (meritHubStatus.status === "lv") {
          await LiveClass.findByIdAndUpdate(liveClass._id, {
            status: "lv",
            actualStartTime: new Date()
          });

          return res.json({
            status: "live",
            canDelete: false,
            canEdit: false,
            message: "Class is currently live and cannot be deleted or edited",
            meritHubStatus,
            classData: liveClass
          });
        } else if (meritHubStatus.status === "cp") {
          // Class has ended, can be deleted
          return res.json({
            status: "completed",
            canDelete: true,
            message: "Class has ended and can be deleted",
            meritHubStatus,
            classData: liveClass
          });
        }

        // Check if MeritHub status indicates completion
        // MeritHub might return status in different formats, check for completion indicators
        const meritHubStatusStr = JSON.stringify(meritHubStatus).toLowerCase();
        if (meritHubStatusStr.includes('completed') || meritHubStatusStr.includes('ended') ||
          meritHubStatusStr.includes('finished') || meritHubStatus.status === 'cp') {
          console.log(`🗑️ [STATUS CHECK] MeritHub status indicates class is completed`);
          return res.json({
            status: "completed",
            canDelete: true,
            message: "Class has been completed",
            meritHubStatus,
            classData: liveClass
          });
        }

        // Check if class has passed its END time (start time + duration)
        const timeSinceStart = now - startTime;

        // If class has passed its start time and MeritHub doesn't show it as live,
        // it might be completed (especially if it's been a while since start)
        // Also check if MeritHub returned empty classes array - this is a strong indicator of completion
        if (timeSinceStart > 0 && liveClass.status !== "lv" && !isMeritHubLive) {
          // If MeritHub returned empty classes array, class has definitely ended
          if (classesArray.length === 0) {
            console.log(`🗑️ [STATUS CHECK] Class has passed start time and MeritHub returned empty classes array - marking as completed`);
            return res.json({
              status: "completed",
              canDelete: true,
              message: "Class has been completed (MeritHub shows session ended)",
              meritHubStatus,
              classData: liveClass
            });
          }

          // If class has passed start time by more than duration, it's likely completed
          if (timeSinceStart > duration * 60 * 1000 && !isMeritHubLive) {
            console.log(`🗑️ [STATUS CHECK] Class has passed start time by more than duration and is not live - marking as completed`);
            return res.json({
              status: "completed",
              canDelete: true,
              message: "Class has been completed",
              meritHubStatus,
              classData: liveClass
            });
          }
        }

        // Only mark as deletable if class has passed its END time and is not live
        if (timeSinceEnd > 0 && meritHubStatus.status !== "lv" && !isMeritHubLive) {
          // Mark as completed if it has passed end time
          await LiveClass.findByIdAndUpdate(liveClass._id, {
            status: "completed"
          });
          return res.json({
            status: "completed",
            canDelete: true,
            message: "Class has ended and can be deleted",
            meritHubStatus,
            classData: { ...liveClass.toObject(), status: "completed" }
          });
        }

        // Final check: if class has passed its end time, mark as completed regardless of MeritHub status
        if (timeSinceEnd > 0 && liveClass.status !== "lv") {
          console.log(`⏰ [STATUS CHECK] Class has passed end time - marking as completed`);
          await LiveClass.findByIdAndUpdate(liveClass._id, {
            status: "completed"
          });
          return res.json({
            status: "completed",
            canDelete: true,
            message: "Class has ended and can be deleted",
            meritHubStatus,
            classData: { ...liveClass.toObject(), status: "completed" }
          });
        }

        // Check if class is currently live - block deletion if live
        if (isMeritHubLive) {
          console.log(`🔴 [STATUS CHECK] Class is currently live - blocking deletion`);
          return res.json({
            status: "live",
            canDelete: false,
            canEdit: false,
            message: "Class is currently live and cannot be deleted or edited",
            meritHubStatus,
            classData: liveClass
          });
        }

        // IMPORTANT: Explicitly handle "up" (upcoming) status - always allow delete/edit
        const currentStatus = meritHubStatus.status || liveClass.status || "scheduled";
        const isUpcoming = currentStatus === "up" || currentStatus === "scheduled";

        // Only disable delete/edit when class is ACTUALLY live, not just when scheduled time passes
        // If status is "up" or "scheduled", always allow delete/edit
        // This allows admin to delete/edit classes even after scheduled time if they haven't started yet
        const canDeleteEdit = !isMeritHubLive && (isUpcoming || currentStatus !== "lv" && currentStatus !== "live");

        console.log(`📊 [STATUS CHECK] Status: ${currentStatus}, isMeritHubLive: ${isMeritHubLive}, canDeleteEdit: ${canDeleteEdit}`);

        return res.json({
          status: currentStatus,
          canDelete: canDeleteEdit, // Allow deletion if class is not live
          canEdit: canDeleteEdit, // Allow edit if class is not live
          message: canDeleteEdit
            ? "Class can be deleted or edited"
            : "Class is currently live and cannot be deleted or edited",
          meritHubStatus,
          classData: liveClass
        });

      } catch (statusError) {
        console.log(`⚠️ [STATUS CHECK] Could not get MeritHub status: ${statusError.message}`);

        // Check if error message indicates class is completed
        const errorMessage = statusError.message?.toLowerCase() || '';
        if (errorMessage.includes('already completed') ||
          errorMessage.includes('session is already completed') ||
          errorMessage.includes('completed') && errorMessage.includes('session')) {
          console.log(`✅ [STATUS CHECK] MeritHub error indicates class is completed - marking as completed`);
          await LiveClass.findByIdAndUpdate(liveClass._id, {
            status: "completed"
          });
          return res.json({
            status: "completed",
            canDelete: true,
            message: "Class has been completed (MeritHub shows session ended)",
            classData: { ...liveClass.toObject(), status: "completed" }
          });
        }

        // If class has passed its end time, mark as completed even if API fails
        const nowCheck = new Date();
        const startTimeCheck = new Date(liveClass.startTime);
        const durationCheck = liveClass.duration || 60;
        const endTimeCheck = new Date(startTimeCheck.getTime() + durationCheck * 60 * 1000);
        const timeSinceEndCheck = nowCheck - endTimeCheck;

        if (timeSinceEndCheck > 0 && liveClass.status !== "lv") {
          console.log(`⏰ [STATUS CHECK] Class has passed end time and MeritHub API failed - marking as completed`);
          await LiveClass.findByIdAndUpdate(liveClass._id, {
            status: "completed"
          });
          return res.json({
            status: "completed",
            canDelete: true,
            message: "Class has ended and can be deleted",
            classData: { ...liveClass.toObject(), status: "completed" }
          });
        }

        // Fall back to our database status
      }
    }

    // For non-MeritHub classes or when MeritHub API fails
    // Check if class has passed its END time (start time + duration)
    const now = new Date();
    const startTime = new Date(liveClass.startTime);
    const duration = liveClass.duration || 60; // Default 60 minutes if not set
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000); // Add duration in milliseconds
    const timeSinceEnd = now - endTime;

    // Only mark as expired if class has passed its END time and is not live
    if (timeSinceEnd > 0 && liveClass.status !== "lv") {
      // Mark as completed if it has passed end time
      await LiveClass.findByIdAndUpdate(liveClass._id, {
        status: "completed"
      });
      return res.json({
        status: "completed",
        canDelete: true,
        message: "Class has ended and can be deleted",
        classData: { ...liveClass.toObject(), status: "completed" }
      });
    }

    // Check if class is currently live - block deletion if live
    // IMPORTANT: Only check our DB status if MeritHub check failed
    // Only disable if class is actually marked as live in our database
    if (liveClass.status === "lv" || liveClass.status === "live") {
      return res.json({
        status: "live",
        canDelete: false,
        canEdit: false,
        message: "Class is currently live and cannot be deleted or edited",
        classData: liveClass
      });
    }

    // IMPORTANT: Explicitly handle "up" (upcoming) status - always allow delete/edit
    const currentStatusFinal = liveClass.status || "scheduled";
    const isUpcomingFinal = currentStatusFinal === "up" || currentStatusFinal === "scheduled";

    // Only disable delete/edit when class is ACTUALLY live, not just when scheduled time passes
    // If status is "up" or "scheduled", always allow delete/edit
    // This allows admin to delete/edit classes even after scheduled time if they haven't started yet
    const canDeleteEditFinal = isUpcomingFinal || (currentStatusFinal !== "lv" && currentStatusFinal !== "live");

    console.log(`📊 [STATUS CHECK FALLBACK] Status: ${currentStatusFinal}, isUpcoming: ${isUpcomingFinal}, canDeleteEdit: ${canDeleteEditFinal}`);

    return res.json({
      status: currentStatusFinal,
      canDelete: canDeleteEditFinal, // Allow deletion if class is not live
      canEdit: canDeleteEditFinal, // Allow edit if class is not live
      message: canDeleteEditFinal
        ? "Class can be deleted or edited"
        : "Class is currently live and cannot be deleted or edited",
      classData: liveClass
    });

  } catch (error) {
    console.error("❌ [STATUS CHECK] Error checking class status:", error);
    res.status(500).json({ error: "Failed to check class status" });
  }
};

const handleMeritHubStatusPing = async (req, res) => {
  try {
    const payload = req.body;

    console.log("Received Payload:", payload);

    // Write the log entry to the file
    const logEntry = `${new Date().toISOString()} - Received Ping:\n${JSON.stringify(
      payload,
      null,
      2
    )}\n\n`;
    await fs.appendFile(LOG_FILE_PATH, logEntry); // Append the log entry without a callback
    console.log("Log written to file.");

    // Handle `classStatus` requests
    if (payload.requestType === "classStatus") {
      if (payload.status === "lv") {
        console.log(
          `Class with ID ${payload.classId} is live. Updating status to "up".`
        );

        // Mark the class as live
        const updatedClass = await LiveClass.findOneAndUpdate(
          { classId: payload.classId },
          {
            status: "lv",
            startTime: payload.startTime,
            timeZoneId: payload.timeZoneId,
          },
          { new: true }
        );

        if (!updatedClass) {
          console.error(`No class found with ID: ${payload.classId}`);
          return res.status(404).json({ error: "Class not found." });
        }

        console.log("Class marked as live:", updatedClass);
      } else if (payload.status === "cp") {
        console.log(
          `Class with ID ${payload.classId} has ended. Marking class as completed (no auto-delete).`
        );

        const liveClass = await LiveClass.findOne({ classId: payload.classId });

        if (!liveClass) {
          console.error(`No class found with ID: ${payload.classId}`);
          return res.status(404).json({ error: "Class not found." });
        }

        liveClass.status = "completed";
        liveClass.actualEndTime = payload.endTime
          ? new Date(payload.endTime)
          : new Date();
        liveClass.recordingStatus = liveClass.recordingStatus || "pending";

        await liveClass.save();
        console.log(`✅ Live class ${payload.classId} marked as completed.`);

        // Invalidate cache so users see updated status but keep the class record
        await invalidateCache("profile:*");
        console.log("🗑️ [CACHE] User profile cache invalidated after completion ping");
      } else {
        console.log(`Unhandled status: ${payload.status}`);
      }
    } else if (payload.requestType === "attendance") {
      console.log("📊 [ATTENDANCE] Attendance data received. Processing attendance...");
      console.log("📊 [ATTENDANCE] Attendance details:", JSON.stringify(payload.attendance, null, 2));

      await processAttendanceData(payload);
    } else if (payload.requestType === "recording") {
      console.log("📹 [RECORDING] Recording data received. Processing recording...");
      console.log("📹 [RECORDING] Recording details:", JSON.stringify(payload, null, 2));

      await processRecordingData(payload);
    } else if (payload.requestType === "classFiles") {
      console.log("📁 [FILES] Class files data received. Processing files...");
      console.log("📁 [FILES] Files details:", JSON.stringify(payload.Files, null, 2));

      // TODO: Handle class files if needed
      // You can store file URLs in the LiveClass model or create a separate model
    } else if (payload.requestType === "chats") {
      console.log("💬 [CHATS] Chat data received. Processing chats...");
      console.log("💬 [CHATS] Chat details:", JSON.stringify(payload.chats, null, 2));

      // TODO: Handle chat data if needed
      // You can store chat JSON links in the LiveClass model or create a separate model
    } else {
      console.log(`⚠️ [WEBHOOK] Unknown request type: ${payload.requestType}`);
      console.log(`⚠️ [WEBHOOK] Full payload:`, JSON.stringify(payload, null, 2));
    }

    // Delete the log file after processing
    await fs.unlink(LOG_FILE_PATH); // Remove the log file without a callback
    console.log("Log file deleted successfully.");

    // Respond to MeritHub
    res
      .status(200)
      .json({ message: "Ping processed successfully and logs deleted." });
  } catch (error) {
    console.error("Error processing MeritHub status ping:", error);

    // Attempt to delete logs even in case of error
    try {
      await fs.unlink(LOG_FILE_PATH); // Remove the log file without a callback
      console.log("Log file deleted despite error.");
    } catch (logDeleteError) {
      console.error("Failed to delete log file after error:", logDeleteError);
    }

    res.status(500).json({ error: "Failed to process status ping." });
  }
};

// Migration function to clean up old participantLink fields and remove duplicates
const migrateUserLiveClassLinks = async (req, res) => {
  try {
    console.log('🔄 [MIGRATION] Starting migration of user live class links...');

    // Find all users with live classes
    const allUsers = await User.find({
      'liveClasses': { $exists: true, $not: { $size: 0 } }
    });

    console.log(`📊 [MIGRATION] Found ${allUsers.length} users with live classes`);

    let totalMigrated = 0;
    let totalDuplicatesRemoved = 0;

    for (const user of allUsers) {
      let userNeedsUpdate = false;
      const seenClasses = new Map(); // Track unique classes by classId + title + startTime

      // Process each live class
      const cleanedLiveClasses = [];

      for (const liveClass of user.liveClasses) {
        // Create a unique key for this class
        const uniqueKey = `${liveClass.classId || 'no-id'}-${liveClass.title}-${liveClass.startTime}`;

        // Check if we've already seen this class
        if (seenClasses.has(uniqueKey)) {
          console.log(`🗑️ [DUPLICATE] Removing duplicate class ${liveClass.title} for user ${user._id}`);
          totalDuplicatesRemoved++;
          userNeedsUpdate = true;
          continue; // Skip this duplicate
        }

        // Mark this class as seen
        seenClasses.set(uniqueKey, true);

        // Migrate participantLink to liveLink if needed
        let updatedClass = liveClass.toObject();
        if (liveClass.participantLink && !liveClass.liveLink) {
          console.log(`🔄 [MIGRATION] Migrating class ${liveClass.title} for user ${user._id}`);
          updatedClass.liveLink = liveClass.participantLink;
          delete updatedClass.participantLink;
          userNeedsUpdate = true;
        }

        cleanedLiveClasses.push(updatedClass);
      }

      // Update user if changes were made
      if (userNeedsUpdate) {
        await User.findByIdAndUpdate(
          user._id,
          { $set: { liveClasses: cleanedLiveClasses } },
          { new: true }
        );
        totalMigrated++;
      }
    }

    console.log(`✅ [MIGRATION] Successfully migrated ${totalMigrated} users`);
    console.log(`🗑️ [CLEANUP] Removed ${totalDuplicatesRemoved} duplicate classes`);

    // Invalidate cache after migration
    await invalidateCache("profile:*");
    console.log("🗑️ [CACHE] User profile cache invalidated after migration");

    res.status(200).json({
      message: "Migration and cleanup completed successfully",
      usersMigrated: totalMigrated,
      duplicatesRemoved: totalDuplicatesRemoved,
      details: `Migrated participantLink to liveLink for ${totalMigrated} users and removed ${totalDuplicatesRemoved} duplicates`
    });

  } catch (error) {
    console.error('❌ [MIGRATION] Error during migration:', error);
    res.status(500).json({
      error: "Migration failed",
      details: error.message
    });
  }
};

/**
 * Add current user to a live class on-demand (when they try to join)
 * This ensures users who weren't added when the class was created can still join
 */
const addUserToLiveClass = async (req, res) => {
  try {
    const userId = req.user._id;
    const { classId } = req.params; // MeritHub classId or MongoDB _id

    console.log(`👤 [ADD_USER_TO_CLASS] Adding user ${userId} to live class ${classId}`);

    // Find the live class
    const liveClass = await findLiveClassById(classId);
    if (!liveClass) {
      return res.status(404).json({
        error: "Live class not found"
      });
    }

    // Check if user is enrolled in any of the courses for this live class
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    if (!user.merithubUserId) {
      return res.status(400).json({
        error: "User is not registered in MeritHub. Please contact admin."
      });
    }

    // Check if user has access to any of the courses
    const userCourseIds = user.purchasedCourses.map(pc => pc.course.toString());
    const hasAccess = liveClass.courseIds.some(courseId => {
      const courseIdStr = courseId?.toString();
      return userCourseIds.includes(courseIdStr);
    });

    if (!hasAccess) {
      return res.status(403).json({
        error: "You don't have access to this live class. Please enroll in the course first."
      });
    }

    // Check if user is already added to this class (check user profile)
    const existingClassInfo = user.liveClasses?.find(
      lc => lc.classId === liveClass.classId
    );

    if (existingClassInfo?.liveLink) {
      console.log(`✅ [ADD_USER_TO_CLASS] User already has access to this class`);
      console.log(`🔗 [ADD_USER_TO_CLASS] Existing link: ${existingClassInfo.liveLink}`);

      // Ensure the link has iframe parameter
      let existingLink = existingClassInfo.liveLink;
      if (!existingLink.includes('iframe=true')) {
        const separator = existingLink.includes('?') ? '&' : '?';
        existingLink = `${existingLink}${separator}iframe=true`;
      }

      return res.status(200).json({
        message: "User already has access to this class",
        individualUserLink: existingLink,
        alreadyAdded: true
      });
    }

    // Only proceed for MeritHub classes
    if (liveClass.platform !== "merithub") {
      return res.status(400).json({
        error: "This endpoint only supports MeritHub classes"
      });
    }

    if (!liveClass.classId) {
      return res.status(400).json({
        error: "Live class does not have a MeritHub classId"
      });
    }

    // Extract commonParticipantLink from the stored participantLink URL
    // Format: https://live.merithub.com/info/room/${CLIENT_ID}/${commonParticipantLink}
    let commonParticipantLink = null;

    if (liveClass.participantLink) {
      // Extract the link part from the full URL
      const urlParts = liveClass.participantLink.split('/');
      const linkPart = urlParts[urlParts.length - 1]; // Get last part
      commonParticipantLink = linkPart?.split('?')[0]; // Remove query params
    } else if (liveClass.liveLink) {
      // Fallback to liveLink if participantLink not available
      const urlParts = liveClass.liveLink.split('/');
      const linkPart = urlParts[urlParts.length - 1];
      commonParticipantLink = linkPart?.split('?')[0];
    }

    if (!commonParticipantLink) {
      console.error('❌ [ADD_USER_TO_CLASS] No participant link found in live class:', {
        participantLink: liveClass.participantLink,
        liveLink: liveClass.liveLink
      });
      return res.status(400).json({
        error: "Live class does not have a participant link. Please contact admin."
      });
    }

    console.log(`🔗 [ADD_USER_TO_CLASS] Extracted commonParticipantLink: ${commonParticipantLink}`);

    console.log(`👥 [ADD_USER_TO_CLASS] Adding user to MeritHub class ${liveClass.classId}`);

    // Add user to MeritHub class
    const { addUsersToClass } = require("../configs/merithub.config");
    const addUsersResponse = await addUsersToClass(
      liveClass.classId,
      [user.merithubUserId],
      commonParticipantLink
    );

    const userResponse = addUsersResponse.find(r => r.userId === user.merithubUserId);
    if (!userResponse?.userLink) {
      return res.status(500).json({
        error: "Failed to get individual user link from MeritHub"
      });
    }

    // Format the individual user link
    const CLIENT_ID = process.env.MERIT_HUB_CLIENT_ID;
    const individualUserLink = `https://live.merithub.com/info/room/${CLIENT_ID}/${userResponse.userLink}?iframe=true`;

    // Update user profile with the individual link
    const liveClassInfo = {
      title: liveClass.title,
      startTime: liveClass.startTime,
      duration: liveClass.duration,
      liveLink: individualUserLink,
      courseIds: liveClass.courseIds,
      classId: liveClass.classId,
      platform: "merithub",
    };

    // Check if user already has this class in their profile (update instead of duplicate)
    const classIndex = user.liveClasses?.findIndex(
      lc => lc.classId === liveClass.classId
    );

    if (classIndex >= 0) {
      // Update existing entry
      user.liveClasses[classIndex] = liveClassInfo;
    } else {
      // Add new entry
      if (!user.liveClasses) {
        user.liveClasses = [];
      }
      user.liveClasses.push(liveClassInfo);
    }

    await user.save();

    // Mark attendance immediately when user joins via app (one record per day/class)
    try {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      let attendanceRecord = await Attendance.findOne({
        user: user._id,
        liveClass: liveClass._id,
        date: { $gte: startOfDay, $lte: endOfDay },
      });

      if (!attendanceRecord) {
        attendanceRecord = await Attendance.create({
          user: user._id,
          course: liveClass.courseIds?.[0],
          liveClass: liveClass._id,
          liveClassId: liveClass.classId,
          date: new Date(),
          status: "Present",
          joinTime: new Date(),
          merithubUserId: user.merithubUserId,
          role: "participant",
          userType: user.userType || "student",
        });

        const adminUser = await User.findOne({ userType: "ADMIN" }).select("_id");
        if (adminUser) {
          await sendAttendanceMessage(adminUser._id, user._id, liveClass, {
            duration: 0,
            attendancePercentage: 0,
            status: "Present",
            joinTime: attendanceRecord.joinTime,
            leaveTime: null,
            totalTimeSeconds: 0,
          });
        }
      }
    } catch (attendanceError) {
      console.error("⚠️ [ADD_USER_TO_CLASS] Failed to mark quick attendance:", attendanceError.message);
    }

    // Invalidate cache to ensure fresh data
    await invalidateCache(`profile:${userId}`);
    console.log(`🗑️ [CACHE] Invalidated cache for user ${userId}`);

    console.log(`✅ [ADD_USER_TO_CLASS] Successfully added user to class and updated profile`);

    res.status(200).json({
      message: "Successfully added to live class",
      individualUserLink,
      alreadyAdded: false
    });

  } catch (error) {
    console.error("❌ [ADD_USER_TO_CLASS] Error adding user to live class:", error);
    res.status(500).json({
      error: error.message || "Failed to add user to live class"
    });
  }
};

module.exports = {
  createLiveClass,
  createUser,
  updateUserDetails,
  fetchAllClasses,
  fetchUserLiveClasses,
  editLiveClass,
  deleteLiveClass,
  checkClassStatus,
  getRecordedVideos,
  handleMeritHubStatusPing,
  migrateUserLiveClassLinks,
  addUserToLiveClass,
  findLiveClassById, // Export utility function for testing
};
