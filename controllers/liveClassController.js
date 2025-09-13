const LiveClass = require("../models/LiveClass");
const Course = require("../models/courseModel");
const User = require("../models/userModel");
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
  try {
    const { userId, courseIds, title, startTime, platform, zoomMeetingLink, zoomMeetingId, zoomPasscode } = req.body;

    // Validate required fields
    if (!title || title.trim() === "") {
      return res.status(400).json({
        error: "Title is required to create a live class.",
      });
    }

    if (!courseIds || courseIds.length === 0) {
      return res.status(400).json({
        error: "At least one course ID is required to create a live class.",
      });
    }

    if (!startTime) {
      return res.status(400).json({
        error: "Start time is required to create a live class.",
      });
    }

    // Validate platform-specific requirements
    if (platform === "zoom") {
      if (!zoomMeetingLink || zoomMeetingLink.trim() === "") {
        return res.status(400).json({
          error: "Zoom meeting link is required when using Zoom platform.",
        });
      }
    } else if (platform === "merithub") {
      // MeritHub validation (existing logic)
      if (!userId) {
        return res.status(400).json({
          error: "User ID is required for MeritHub integration.",
        });
      }
    }

    // Validate that startTime is a valid date and not in the past (for scheduled classes)
    const classStartTime = new Date(startTime);
    if (isNaN(classStartTime.getTime())) {
      return res.status(400).json({
        error: "Invalid start time format.",
      });
    }

    const now = new Date();
    const timeDifference = classStartTime.getTime() - now.getTime();
    // Allow immediate classes (within 1 minute) or future scheduled classes
    if (timeDifference < -60000) { // More than 1 minute in the past
      return res.status(400).json({
        error: "Start time cannot be in the past.",
      });
    }

    // Prepare live class details
    // Calculate end time (1 hour after start time)
    const startTimeDate = new Date(startTime);
    const endTimeDate = new Date(startTimeDate.getTime() + 60 * 60 * 1000);
    
    const liveClassDetails = {
      title,
      startTime,
      endDate: endTimeDate.toISOString(), // Required by MeritHub API
      recordingDownload: false, // Required by MeritHub API
      courseIds, // Now handling an array of course IDs
      platform: platform || "merithub", // Default to MeritHub
      duration: 60,
      lang: "en",
      timeZoneId: "Asia/Kolkata",
      description: `Live class for ${title}`, // Required by MeritHub API
      type: "oneTime",
      access: "private",
      login: false,
      layout: "CR",
      status: "up",
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
      schedule: [2, 4, 5], // For perma class (as per API doc)
      totalClasses: 20, // For perma class (as per API doc)
      
      // Add Zoom-specific fields
      ...(platform === "zoom" && {
        zoomMeetingLink,
        zoomMeetingId,
        zoomPasscode,
      }),
    };

    // Create and save the live class
    const liveClass = new LiveClass(liveClassDetails);
    await liveClass.save();

    // Handle platform-specific logic
    if (platform === "zoom") {
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
      // MeritHub logic - get user's MeritHub token for class creation
      const instructor = await User.findOne({ merithubUserId: userId });
      if (!instructor) {
        return res.status(400).json({
          error: "Instructor not found in database. Please ensure the user is properly registered.",
        });
      }
      
      if (!instructor.merithubUserToken) {
        return res.status(400).json({
          error: "Instructor's MeritHub token not found. Please re-register the instructor in MeritHub.",
        });
      }
      
      console.log(`🎥 [MERITHUB] Creating class for instructor: ${instructor.firstName} ${instructor.lastName}`);
      const apiResponse = await scheduleLiveClass(userId, liveClassDetails, instructor.merithubUserToken);
      if (!apiResponse || !apiResponse.classId || !apiResponse.commonLinks) {
        return res
          .status(400)
          .json({ error: "Failed to schedule the class on MeritHub." });
      }

      // Handle API response and generate links (based on actual MeritHub response format)
      const { classId, commonLinks, hostLink } = apiResponse;
      const { commonHostLink } = commonLinks;
      
      // Format links properly for MeritHub live classroom
      const CLIENT_ID = process.env.MERIT_HUB_CLIENT_ID;
      const formattedInstructorLink = `https://live.merithub.com/info/room/${CLIENT_ID}/${commonHostLink}`;
      
      // Store only instructor/live link - no common participant link
      liveClass.liveLink = formattedInstructorLink; // Instructor link for "Go Live" button
      liveClass.instructorLink = formattedInstructorLink; // Dedicated instructor link field
      liveClass.classId = classId;
      
      console.log('✅ [MERITHUB] Links formatted and stored successfully:');
      console.log(`   Class ID: ${classId}`);
      console.log(`   Instructor Link: ${formattedInstructorLink}`);
      console.log(`   Raw Host Link: ${hostLink}`);
      console.log('🚫 [REMOVED] Common participant link - using individual user links only');
      await liveClass.save();

      // Find users associated with any of the course IDs
      const users = await User.find({
        "purchasedCourses.course": { $in: courseIds },
      });
      const merithubUserIds = users.map((user) => user.merithubUserId);

      // Add users to the live class (non-blocking - don't fail if this fails)
      if (merithubUserIds.length > 0) {
        try {
          console.log(`👥 [MERITHUB] Attempting to add ${merithubUserIds.length} users to class`);
          const addUsersResponse = await addUsersToClass(
            classId,
            merithubUserIds
          );
          
          if (addUsersResponse) {
            console.log(`✅ [MERITHUB] Successfully added users to class`);
            
            // Update each user with the live class info using individual user links
            const liveClassInfo = {
              courseIds, // Notice courseIds is an array
              title,
              startTime,
              duration: liveClassDetails.duration,
              classId: liveClass.classId,
              platform: "merithub",
            };

        const addUserPromises = addUsersResponse.map(async (userResponse) => {
          const { userLink, userId: merithubUserId } = userResponse;
          const liveUserLink = `https://live.merithub.com/info/room/${process.env.MERIT_HUB_CLIENT_ID}/${userLink}?iframe=true`;
          const userLiveClassInfo = {
            ...liveClassInfo,
            liveLink: liveUserLink, // Use individual user link as liveLink
          };

          console.log(`👤 [USER] Adding individual link for user ${merithubUserId}: ${liveUserLink}`);

          return User.findOneAndUpdate(
            { merithubUserId },
            { $push: { liveClasses: userLiveClassInfo } },
            { new: true }
          );
        });

            await Promise.all(addUserPromises);
            
            // 🔥 CACHE FIX: Invalidate user profile cache for all affected users
            console.log("🗑️ [CACHE] Invalidating user profile cache for MeritHub live class creation");
            await invalidateCache("profile:*");
            console.log("✅ [CACHE] User profile cache invalidated");
          } else {
            console.log(`⚠️ [MERITHUB] Failed to add users to class, but class was created successfully`);
          }
        } catch (userAddError) {
          console.error(`❌ [MERITHUB] Error adding users to class: ${userAddError.message}`);
          console.log(`✅ [MERITHUB] Class created successfully despite user addition failure`);
          
          // Fallback: Skip adding to users without individual MeritHub links
          console.log(`⚠️ [FALLBACK] Skipping fallback - only users with individual MeritHub links will have access`);
          console.log(`ℹ️ [INFO] Users without MeritHub IDs will need to be registered in MeritHub to access live classes`);
        }
      } else {
        console.log(`ℹ️ [MERITHUB] No users found to add to class`);
      }

      // No final fallback - users must have individual MeritHub links to access live classes
      console.log(`ℹ️ [POLICY] Only users with individual MeritHub links will have access to live classes`);
      console.log(`ℹ️ [POLICY] Common participant links are no longer used for security and tracking purposes`);

      // Always respond with success if class was created (regardless of user addition status)
      res.status(201).json({
        message: "Live class scheduled successfully",
        liveClass,
        note: merithubUserIds.length > 0 ? "Users will be added to class automatically" : "No enrolled users found for selected courses"
      });
    }
  } catch (error) {
    console.error("Error scheduling live class:", error.message);
    res.status(500).json({
      error:
        error.message ||
        "An unexpected error occurred while scheduling the live class.",
    });
  }
};

const fetchAllClasses = async (req, res) => {
  try {
    // Fetch all live classes from the database
    const classes = await LiveClass.find({}).sort({ startTime: -1 }); // Sort by start time in ascending order

    if (!classes || classes.length === 0) {
      return res.status(200).json({
        message: "No classes found.",
        classes: [],
      });
    }

    // Respond with the list of classes
    res.status(200).json({
      message: "Live classes fetched successfully",
      classes: classes,
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

/**
 * Edit an existing live class
 */
const editLiveClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const inputDetails = req.body;

    // Retrieve the current live class details from the database - try both classId and _id
    let existingClass = await LiveClass.findOne({ classId });
    if (!existingClass) {
      // If not found by classId, try finding by _id (for backward compatibility)
      existingClass = await LiveClass.findById(classId);
    }
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
    
    // Find the live class first - try both classId and _id
    let liveClass = await LiveClass.findOne({ classId });
    console.log(`🔍 [DELETE] Found by classId: ${!!liveClass}`);
    
    if (!liveClass) {
      // If not found by classId, try finding by _id (for backward compatibility)
      console.log(`🔍 [DELETE] Trying to find by _id...`);
      try {
        liveClass = await LiveClass.findById(classId);
        console.log(`🔍 [DELETE] Found by _id: ${!!liveClass}`);
      } catch (error) {
        console.log(`🔍 [DELETE] Error finding by _id: ${error.message}`);
      }
    }
    
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
    const liveClass = await LiveClass.findOne({ 
      $or: [
        { classId: classId },
        { _id: classId }
      ]
    });
    
    if (!liveClass) {
      return res.status(404).json({ error: "Class not found" });
    }
    
    // If class is already marked as live, don't allow deletion
    if (liveClass.status === "lv") {
      return res.json({
        status: "live",
        canDelete: false,
        message: "Class is currently live and cannot be deleted",
        classData: liveClass
      });
    }
    
    // Try to get status from MeritHub if we have a MeritHub class ID
    if (liveClass.classId && liveClass.platform === "merithub") {
      try {
        const meritHubStatus = await getClassStatus(liveClass.classId);
        
        // Update our database with the latest status
        if (meritHubStatus.status === "lv") {
          await LiveClass.findByIdAndUpdate(liveClass._id, {
            status: "lv",
            actualStartTime: new Date()
          });
          
          return res.json({
            status: "live",
            canDelete: false,
            message: "Class is currently live and cannot be deleted",
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
        
        return res.json({
          status: meritHubStatus.status || "scheduled",
          canDelete: true,
          message: "Class is not live yet",
          meritHubStatus,
          classData: liveClass
        });
        
      } catch (statusError) {
        console.log(`⚠️ [STATUS CHECK] Could not get MeritHub status: ${statusError.message}`);
        // Fall back to our database status
      }
    }
    
    // For non-MeritHub classes or when MeritHub API fails
    const now = new Date();
    const startTime = new Date(liveClass.startTime);
    const timeDiff = now - startTime;
    
    // If class started more than 2 hours ago and not marked as live, consider it ended
    if (timeDiff > 2 * 60 * 60 * 1000 && liveClass.status !== "lv") {
      return res.json({
        status: "expired",
        canDelete: true,
        message: "Class has expired and can be deleted",
        classData: liveClass
      });
    }
    
    // Class is scheduled but not started yet
    return res.json({
      status: liveClass.status || "scheduled",
      canDelete: true,
      message: "Class is scheduled and can be deleted",
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
          `Class with ID ${payload.classId} has ended. Deleting class and updating users.`
        );

        // Find the class to retrieve associated data before deletion
        const liveClass = await LiveClass.findOne({ classId: payload.classId });

        if (!liveClass) {
          console.error(`No class found with ID: ${payload.classId}`);
          return res.status(404).json({ error: "Class not found." });
        }

        // Delete the live class
        await LiveClass.deleteOne({ classId: payload.classId });
        console.log(`Live class with ID ${payload.classId} deleted.`);

        // Remove the class from users
        const usersUpdated = await User.updateMany(
          { "liveClasses.title": liveClass.title },
          { $pull: { liveClasses: { title: liveClass.title } } }
        );

        console.log(
          `${usersUpdated.modifiedCount} users updated to remove live class ${liveClass.title}.`
        );
      } else {
        console.log(`Unhandled status: ${payload.status}`);
      }
    } else if (payload.requestType === "attendance") {
      console.log("Attendance data received. Processing attendance...");
      console.log("Attendance details:", payload.attendance);
    } else {
      console.log(`Unknown request type: ${payload.requestType}`);
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

module.exports = {
  createLiveClass,
  createUser,
  updateUserDetails,
  fetchAllClasses,
  editLiveClass,
  deleteLiveClass,
  checkClassStatus,
  getRecordedVideos,
  handleMeritHubStatusPing,
  migrateUserLiveClassLinks,
};
