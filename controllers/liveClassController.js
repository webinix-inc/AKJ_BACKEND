const LiveClass = require("../models/LiveClass");
const Course = require("../models/courseModel");
const User = require("../models/userModel");
const {
  scheduleLiveClass,
  addUser,
  addUsersToClass,
  editClass,
  deleteLiveClass: deleteClassAPI,
  updateUser,
} = require("../configs/merithub.config");

const fs = require("fs").promises; // Use promise-based fs
const path = require("path");

const AWS = require("aws-sdk");
const { default: mongoose } = require("mongoose");

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
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
    const { userId, courseIds, title, startTime } = req.body;

    // Validate course IDs
    if (!courseIds || courseIds.length === 0) {
      return res.status(400).json({
        error: "At least one course ID is required to create a live class.",
      });
    }

    // Validate title and startTime
    if (!title || !startTime) {
      return res.status(400).json({
        error: "Title and Start Time are required to create a live class.",
      });
    }

    // Prepare live class details
    const liveClassDetails = {
      title,
      startTime,
      courseIds, // Now handling an array of course IDs
      duration: 60,
      lang: "en",
      timeZoneId: "Asia/Kolkata",
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
      schedule: [],
      totalClasses: 0,
    };

    // Create and save the live class
    const liveClass = new LiveClass(liveClassDetails);
    await liveClass.save();

    // Schedule the live class using your API
    const apiResponse = await scheduleLiveClass(userId, liveClassDetails);
    if (!apiResponse || !apiResponse.classId || !apiResponse.commonLinks) {
      return res
        .status(400)
        .json({ error: "Failed to schedule the class on MeritHub." });
    }

    // Handle API response and generate links
    const { classId, commonLinks, hostLink } = apiResponse;
    const { commonParticipantLink } = commonLinks;
    const liveLink = `https://live.merithub.com/info/room/${process.env.MERIT_HUB_CLIENT_ID}/${hostLink}?iframe=true`;
    liveClass.liveLink = liveLink;
    liveClass.classId = classId;
    liveClass.commonParticipantLink = commonParticipantLink;
    await liveClass.save();

    // Find users associated with any of the course IDs
    const users = await User.find({
      "purchasedCourses.course": { $in: courseIds },
    });
    const merithubUserIds = users.map((user) => user.merithubUserId);

    // Add users to the live class
    if (merithubUserIds.length > 0) {
      const addUsersResponse = await addUsersToClass(
        classId,
        merithubUserIds,
        commonParticipantLink
      );
      if (!addUsersResponse) {
        return res
          .status(400)
          .json({ error: "Failed to add users to the class." });
      }

      // Update each user with the live class info
      const liveClassInfo = {
        courseIds, // Notice courseIds is an array
        title,
        startTime,
        duration: liveClassDetails.duration,
        classId: liveClass.classId,
      };

      const addUserPromises = addUsersResponse.map(async (userResponse) => {
        const { userLink, userId: merithubUserId } = userResponse;
        const liveUserLink = `https://live.merithub.com/info/room/${process.env.MERIT_HUB_CLIENT_ID}/${userLink}?iframe=true`;
        const userLiveClassInfo = {
          ...liveClassInfo,
          participantLink: liveUserLink,
        };

        return User.findOneAndUpdate(
          { merithubUserId },
          { $push: { liveClasses: userLiveClassInfo } },
          { new: true }
        );
      });

      await Promise.all(addUserPromises);
    }

    // Respond to the client
    res.status(201).json({
      message: "Live class scheduled and users added successfully",
      liveClass,
    });
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
      return res.status(400).json({
        message: "No classes found.",
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

    // Retrieve the current live class details from the database
    const existingClass = await LiveClass.findOne({ classId });
    if (!existingClass) {
      return res.status(400).json({ error: "Live class not found." });
    }

    // Prepare updated details
    const updatedDetails = {
      title: inputDetails.title || existingClass.title,
      startTime: inputDetails.startTime || existingClass.startTime,
      duration: inputDetails.duration || existingClass.duration,
      lang: inputDetails.lang || existingClass.lang,
      timeZoneId: inputDetails.timeZoneId || existingClass.timeZoneId,
      description: inputDetails.description || existingClass.description,
      layout: inputDetails.layout || existingClass.layout,
      recording: {
        record:
          inputDetails.record !== undefined
            ? inputDetails.record
            : existingClass.recording.record,
        autoRecord:
          inputDetails.autoRecord !== undefined
            ? inputDetails.autoRecord
            : existingClass.recording.autoRecord,
        recordingControl:
          inputDetails.recordingControl !== undefined
            ? inputDetails.recordingControl
            : existingClass.recording.recordingControl,
      },
      participantControl: {
        write:
          inputDetails.write !== undefined
            ? inputDetails.write
            : existingClass.participantControl.write,
        audio:
          inputDetails.audio !== undefined
            ? inputDetails.audio
            : existingClass.participantControl.audio,
        video:
          inputDetails.video !== undefined
            ? inputDetails.video
            : existingClass.participantControl.video,
      },
    };

    // Update external API first
    await editClass(classId, updatedDetails);

    // Update the live class in the database
    const updatedLiveClass = await LiveClass.findOneAndUpdate(
      { classId },
      { $set: updatedDetails },
      { new: true }
    );

      // Update the live class details in user documents
      const userUpdateResult = await User.updateMany(
        { "liveClasses.classId": classId }, // Match the specific live class entry in users
        {
          $set: {
            "liveClasses.$.title": updatedDetails.title,
            "liveClasses.$.startTime": updatedDetails.startTime,
            "liveClasses.$.duration": updatedDetails.duration,
          },
        }
      );
  
      console.log(`Users updated: ${userUpdateResult.modifiedCount}`);

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
  try {
    const { classId } = req.params;
    // if (!mongoose.Types.ObjectId.isValid(classId)) {
    //   return res.status(400).json({ error: "Invalid class ID." });
    // }

    // Find and delete the live class
    const liveClass = await LiveClass.findOne({classId});
    if (!liveClass) {
      return res.status(404).json({ error: "Live class not found." });
    }

    await LiveClass.deleteOne({ classId });

    console.log(`Live class deleted: ${classId}`);

    // Remove live class reference from all users
    const updateResult = await User.updateMany(
      {
        "liveClasses.courseIds": { $in: liveClass.courseIds }, // Match any courseId
        "liveClasses.startTime": liveClass.startTime,
      },
      {
        $pull: {
          liveClasses: {
            courseIds: { $in: liveClass.courseIds },
            startTime: liveClass.startTime,
          },
        },
      }
    );

    console.log(`Users updated: ${updateResult.modifiedCount}`);

    return res.status(200).json({ message: "Live class deleted successfully" });
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

    const s3Data = await s3.listObjectsV2(params).promise();

    const videos = await Promise.all(
      s3Data.Contents.map(async (object) => {
        const signedUrl = await s3.getSignedUrlPromise("getObject", {
          Bucket: process.env.S3_BUCKET,
          Key: object.Key,
          Expires: 3600,
        });

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

module.exports = {
  createLiveClass,
  createUser,
  updateUserDetails,
  fetchAllClasses,
  editLiveClass,
  deleteLiveClass,
  getRecordedVideos,
  handleMeritHubStatusPing,
};
