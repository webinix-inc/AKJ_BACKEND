require("dotenv").config();

const mongoose = require("mongoose");
const AWS = require("aws-sdk");
const moment = require("moment-timezone");
const schedule = require("node-schedule");
const authConfig = require("../configs/auth.config");

const Quiz = require("../models/quizModel");
const Question = require("../models/questionModel");
const QuizFolder = require("../models/quizFolder");

// Configure S3 for image deletion
const s3 = new AWS.S3({
  accessKeyId: authConfig.aws_access_key_id,
  secretAccessKey: authConfig.aws_secret_access_key,
  region: authConfig.aws_region,
});

exports.createQuiz = async (req, res) => {
  console.log("Creating quiz - Request body:", req.body);
  console.log("Creating quiz - Folder ID:", req.params.folderId);
  console.log("Creating quiz - User:", req.user?._id);
  
  try {
    const { quizName, duration, category } = req.body;
    const { folderId } = req.params;
    
    // Validate input
    if (!quizName || !duration || !category) {
      console.log("Missing required fields:", { quizName, duration, category });
      return res.status(400).json({ 
        success: false,
        message: "All fields are required",
        missingFields: {
          quizName: !quizName,
          duration: !duration,
          category: !category
        }
      });
    }

    // Validate folderId
    if (!folderId || !mongoose.Types.ObjectId.isValid(folderId)) {
      console.log("Invalid folder ID:", folderId);
      return res.status(400).json({ 
        success: false,
        message: "Invalid folder ID provided" 
      });
    }

    // Check if quiz name already exists
    const quizExists = await Quiz.findOne({ quizName }).lean();
    if (quizExists) {
      console.log("Quiz already exists:", quizName);
      return res.status(400).json({ 
        success: false,
        message: "Quiz with this name already exists" 
      });
    }

    // Validate folder exists
    const folder = await QuizFolder.findById(folderId);
    if (!folder) {
      console.log("Folder not found:", folderId);
      return res.status(404).json({ 
        success: false,
        message: "Folder not found" 
      });
    }

    // Create quiz
    const quiz = await Quiz.create({
      creatorId: req.user._id,
      quizName,
      duration,
      category,
    });

    console.log("Quiz created successfully:", quiz._id);

    // Add quiz to folder
    folder.quizzes.push(quiz._id);
    await folder.save();

    console.log("Quiz added to folder successfully");

    // 🔧 FIX: Invalidate cache for this folder after quiz creation
    try {
      const { invalidateCache } = require('../middlewares/cacheMiddleware');
      await invalidateCache(`quiz:cache:/api/v1/admin/folder/${folderId}*`);
      console.log(`✅ [DEBUG] Cache invalidated for folder: ${folderId}`);
    } catch (cacheError) {
      console.error(`⚠️ [DEBUG] Cache invalidation failed:`, cacheError);
      // Continue execution even if cache invalidation fails
    }

    // Return success response with populated quiz data
    const populatedQuiz = await Quiz.findById(quiz._id)
      .populate('creatorId', 'firstName lastName')
      .lean();

    res.status(201).json({ 
      success: true,
      message: "Quiz created successfully", 
      quiz: populatedQuiz,
      folderId: folderId
    });
    
  } catch (error) {
    console.error("Error creating quiz:", error);
    res.status(500).json({ 
      success: false,
      message: "Internal server error while creating quiz",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

exports.fetchQuizzesByFolder = async (req, res) => {
  try {
    const { folderId } = req.params;

    console.log("Fetching quizzes for folder:", folderId);

    // Validate folderId
    if (!folderId || !mongoose.Types.ObjectId.isValid(folderId)) {
      console.log("Invalid folder ID:", folderId);
      return res.status(400).json({ 
        success: false,
        message: "Invalid folder ID provided" 
      });
    }

    // Validate folder existence and populate quizzes
    const folder = await QuizFolder.findById(folderId)
      .populate({
        path: 'quizzes',
        populate: {
          path: 'creatorId',
          select: 'firstName lastName'
        }
      })
      .lean();
      
    if (!folder) {
      console.log("Folder not found:", folderId);
      return res.status(404).json({ 
        success: false,
        message: "Folder not found" 
      });
    }

    console.log(`Found folder with ${folder.quizzes?.length || 0} quizzes`);

    res.status(200).json({
      success: true,
      message: "Quizzes retrieved successfully",
      folderId,
      quizzes: folder.quizzes || [],
      folderName: folder.name
    });
    
  } catch (error) {
    console.error("Error fetching quizzes by folder ID:", error);
    res.status(500).json({ 
      success: false,
      message: "Internal server error while fetching quizzes",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
};

exports.fetchAllQuizzes = async (req, res) => {
  try {
    const quizzes = await Quiz.find({}).populate("questions").lean();
    res.status(200).json({ message: "All Quizzes are", quizzes });
  } catch (error) {
    res.status(400).json({ error });
  }
};

exports.specificQuizDetails = async (req, res) => {
  try {
    const { quizId } = req.params;
    const quiz = await Quiz.findById(quizId).lean();
    res.status(200).json({ message: "Quiz details", quiz });
  } catch (error) {
    res.status(400).json({ error });
  }
};

exports.updateQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    const updateFields = {};

    ["quizName", "duration", "category"].forEach((field) => {
      if (req.body[field] !== undefined) {
        updateFields[field] = req.body[field];
      }
    });

    if (Object.keys(updateFields).length === 0) {
      return res
        .status(400)
        .json({ message: "No valid fields provided for update" });
    }

    const updatedQuiz = await Quiz.findByIdAndUpdate(quizId, updateFields, {
      new: true,
      runValidators: true,
    });

    if (!updatedQuiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    // 🔧 FIX: Invalidate cache after quiz update
    try {
      const { invalidateCache } = require('../middlewares/cacheMiddleware');
      await invalidateCache(`quiz:cache:*`);
      console.log(`✅ [DEBUG] Cache invalidated after quiz update: ${quizId}`);
    } catch (cacheError) {
      console.error(`⚠️ [DEBUG] Cache invalidation failed:`, cacheError);
    }

    res
      .status(200)
      .json({ message: "Quiz updated successfully", quiz: updatedQuiz });
  } catch (error) {
    console.error("Error in updating quiz", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.toggleQuizActive = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res
        .status(400)
        .json({ message: "isActive must be a boolean value" });
    }

    const quiz = await Quiz.findByIdAndUpdate(
      quizId,
      { isActive: isActive },
      { new: true, runValidators: true }
    );

    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    const action = isActive ? "activated" : "deactivated";
    res.status(200).json({
      message: `Quiz ${action} successfully`,
      quiz,
    });
  } catch (error) {
    console.error(`Error in toggling quiz active state`, error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// exports.updateQuizAvailability = async (req, res) => {
//     try {
//         // const { quizId } = req.params;
//
//         const quizId = "6773c02a7fd06a2ddf639b10";
//
//         const { availabilityType, scheduledStartDate, scheduledStartTime, scheduledEndDate,scheduledEndTime } = req.body;
//
//         // Sample request body for scheduled availability
//         // {
//         //     "availabilityType": "scheduled",
//         //     "scheduledStartDate": "16-10-2024",
//         //     "scheduledStartTime": "23:00",
//         //     "scheduledEndDate": "17-10-2024",  // Optional
//         //     "scheduledEndTime": "02:00"  // Optional
//         // }
//
//         const timeFormatRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
//
//         if (scheduledStartTime && !timeFormatRegex.test(scheduledStartTime)) {
//             return res.status(400).json({
//                 message: "Invalid start time format. Time should be in 24-hour format (HH:mm) between 00:00 and 23:59"
//             });
//         }
//
//         if (scheduledEndTime && !timeFormatRegex.test(scheduledEndTime)) {
//             return res.status(400).json({
//                 message: "Invalid end time format. Time should be in 24-hour format (HH:mm) between 00:00 and 23:59"
//             });
//         }
//
//         const quiz = await Quiz.findById(quizId).select('availabilityType scheduledStartDate scheduledStartTime scheduledEndDate scheduledEndTime duration').exec();
//         if (!quiz) {
//             return res.status(404).json({ message: "Quiz not found" });
//         }
//         // console.log("old Quiz:", quiz);
//
//         if (!['always', 'scheduled'].includes(availabilityType)) {
//             return res.status(400).json({ message: "Invalid availability type" });
//         }
//
//         quiz.availabilityType = availabilityType;
//
//         if (availabilityType === 'scheduled') {
//             if (!scheduledStartDate || !scheduledStartTime) {
//                 return res.status(400).json({ message: "Start date and time are required for scheduled availability" });
//             }
//
//             const indianTimeZone = 'Asia/Kolkata';
//             const startDateTime = moment.tz(`${scheduledStartDate} ${scheduledStartTime}`, 'DD-MM-YYYY HH:mm', indianTimeZone);
//
//             const now = moment.tz(indianTimeZone);
//             if (startDateTime.isBefore(now)) {
//                 return res.status(400).json({ message: "Scheduled start date and time cannot be in the past" });
//             }
//
//             quiz.scheduledStartDate = scheduledStartDate;
//             quiz.scheduledStartTime = scheduledStartTime;
//
//             let endDateTime;
//             if (scheduledEndDate && scheduledEndTime) {
//                 endDateTime = moment.tz(`${scheduledEndDate} ${scheduledEndTime}`, 'DD-MM-YYYY HH:mm', indianTimeZone);
//                 if (endDateTime.isBefore(startDateTime)) {
//                     return res.status(400).json({ message: "Scheduled end time should be after the start time" });
//                 }
//                 quiz.scheduledEndDate = scheduledEndDate;
//                 quiz.scheduledEndTime = scheduledEndTime;
//             } else {
//                 // Calculate end time based on quiz duration if not provided
//                 const durationInMinutes = (quiz.duration.hours * 60) + quiz.duration.minutes;
//                 endDateTime = startDateTime.clone().add(durationInMinutes, 'minutes');
//
//                 quiz.scheduledEndDate = endDateTime.format('DD-MM-YYYY');
//                 quiz.scheduledEndTime = endDateTime.format('HH:mm');
//             }
//         } else {
//             // Reset all scheduled fields if availability type is not 'scheduled'
//             quiz.scheduledStartDate = null;
//             quiz.scheduledStartTime = null;
//             quiz.scheduledEndDate = null;
//             quiz.scheduledEndTime = null;
//         }
//
//         await quiz.save();
//
//         // console.log("new Quiz:", quiz);
//
//         res.status(200).json({
//             message: "Quiz availability updated successfully",
//             quiz: {
//                 id: quiz._id,
//                 availabilityType: quiz.availabilityType,
//                 scheduledStartDate: quiz.scheduledStartDate,
//                 scheduledStartTime: quiz.scheduledStartTime,
//                 scheduledEndDate: quiz.scheduledEndDate,
//                 scheduledEndTime: quiz.scheduledEndTime
//             }
//         });
//     } catch (error) {
//         console.error(`Error updating quiz availability`, error);
//         res.status(500).json({ message: "Internal server error", error: error.message });
//     }
// };

exports.updateQuizAvailability = async (req, res) => {
  try {
    const { quizId } = req.params;
    console.log("Quize ID:", quizId);

    // Validate quizId
    if (!quizId || !mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({ message: "Invalid quiz ID" });
    }

    const {
      availabilityType,
      scheduledStartDate,
      scheduledStartTime,
      scheduledEndDate,
      scheduledEndTime,
    } = req.body;

    const validAvailabilityTypes = ["always", "scheduled"];
    if (!validAvailabilityTypes.includes(availabilityType)) {
      return res.status(400).json({ message: "Invalid availability type" });
    }

    const timeFormatRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (scheduledStartTime && !timeFormatRegex.test(scheduledStartTime)) {
      return res
        .status(400)
        .json({ message: "Invalid start time format (HH:mm)" });
    }
    if (scheduledEndTime && !timeFormatRegex.test(scheduledEndTime)) {
      return res
        .status(400)
        .json({ message: "Invalid end time format (HH:mm)" });
    }

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    // Process availability logic (as before)
    quiz.availabilityType = availabilityType;

    if (availabilityType === "scheduled") {
      if (!scheduledStartDate || !scheduledStartTime) {
        return res.status(400).json({
          message:
            "Start date and time are required for scheduled availability",
        });
      }

      const startDateTime = moment.tz(
        `${scheduledStartDate} ${scheduledStartTime}`,
        "DD-MM-YYYY HH:mm",
        "Asia/Kolkata"
      );

      // if (startDateTime.isBefore(moment.tz('Asia/Kolkata'))) {
      //     return res.status(400).json({
      //         message: "Scheduled start date and time cannot be in the past",
      //     });
      // }

      quiz.scheduledStartDate = scheduledStartDate;
      quiz.scheduledStartTime = scheduledStartTime;

      if (scheduledEndDate && scheduledEndTime) {
        const endDateTime = moment.tz(
          `${scheduledEndDate} ${scheduledEndTime}`,
          "DD-MM-YYYY HH:mm",
          "Asia/Kolkata"
        );

        if (endDateTime.isBefore(startDateTime)) {
          return res.status(400).json({
            message: "Scheduled end time must be after the start time",
          });
        }

        quiz.scheduledEndDate = scheduledEndDate;
        quiz.scheduledEndTime = scheduledEndTime;
      } else {
        const durationInMinutes =
          (quiz.duration?.hours || 0) * 60 + (quiz.duration?.minutes || 0);
        const calculatedEndDateTime = startDateTime
          .clone()
          .add(durationInMinutes, "minutes");
        quiz.scheduledEndDate = calculatedEndDateTime.format("DD-MM-YYYY");
        quiz.scheduledEndTime = calculatedEndDateTime.format("HH:mm");
      }
    } else {
      quiz.scheduledStartDate = null;
      quiz.scheduledStartTime = null;
      quiz.scheduledEndDate = null;
      quiz.scheduledEndTime = null;
    }

    await quiz.save();

    res.status(200).json({
      message: "Quiz availability updated successfully",
      quiz: {
        id: quiz._id,
        availabilityType: quiz.availabilityType,
        scheduledStartDate: quiz.scheduledStartDate,
        scheduledStartTime: quiz.scheduledStartTime,
        scheduledEndDate: quiz.scheduledEndDate,
        scheduledEndTime: quiz.scheduledEndTime,
      },
    });
  } catch (error) {
    console.error("Error updating quiz availability:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.getQuizAvailability = async (req, res) => {
  try {
    const { quizId } = req.params;
    const quiz = await Quiz.findById(quizId).select(
      "availabilityType scheduledStartDate scheduledStartTime scheduledEndTime"
    );

    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    const response = {
      availabilityType: quiz.availabilityType,
      isActive: quiz.isActive,
    };

    if (quiz.availabilityType === "scheduled") {
      response.scheduledStartDate = quiz.scheduledStartDate;
      response.scheduledStartTime = quiz.scheduledStartTime;
      response.scheduledEndTime = quiz.scheduledEndTime;
    }

    res.status(200).json({
      message: "Quiz availability details retrieved successfully",
      availability: response,
    });

    // res.status(200).json({ message: "Quiz availability details retrieved successfully", availability: quiz });
  } catch (error) {
    console.error(`Error fetching quiz availability`, error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.setQuizAttempts = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { maxAttempts } = req.body;

    // if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    //     return res.status(400).json({ message: "Max attempts must be a positive integer" });
    // }

    const quiz = await Quiz.findById(quizId);

    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    // Cuser has permission to modify the quiz
    if (quiz.creatorId.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ message: "You don't have permission to modify this quiz" });
    }

    quiz.maxAttempts = maxAttempts;
    await quiz.save();

    res.status(200).json({
      message: "Max attempts updated successfully",
      quiz: {
        id: quiz._id,
        name: quiz.quizName,
        maxAttempts: quiz.maxAttempts,
      },
    });
  } catch (error) {
    console.error(`Error in setting quiz attempts:`, error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.deleteQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    console.log(`🗑️ [DEBUG] Starting quiz deletion for ID: ${quizId}`);
    
    const quiz = await Quiz.findById(quizId);

    if (!quiz) {
      console.log(`❌ [DEBUG] Quiz not found: ${quizId}`);
      return res.status(404).json({ message: "Quiz not found" });
    }

    console.log(`📋 [DEBUG] Found quiz: ${quiz.quizName}`);

    // 🔧 FIX: Make deletion synchronous to ensure completion before response
    try {
      const questions = await Question.find({ quizId: quiz._id });
      console.log(`🔍 [DEBUG] Found ${questions.length} questions to delete`);

      const deletedImages = new Set();
      for (let question of questions) {
        if (question.questionImage && question.questionImage.length > 0) {
          for (let imageUrl of question.questionImage) {
            if (!deletedImages.has(imageUrl)) {
              console.log("Deleting S3 image:", imageUrl);
              
              // Extract S3 key from URL
              let s3Key;
              if (imageUrl.includes('amazonaws.com/')) {
                // Extract key from S3 URL
                s3Key = imageUrl.split('amazonaws.com/')[1];
              } else if (imageUrl.startsWith('quiz-images/')) {
                // Direct S3 key
                s3Key = imageUrl;
              } else {
                // Fallback: assume it's a filename in quiz-images folder
                const fileName = imageUrl.split("/").slice(-1)[0];
                s3Key = `quiz-images/${fileName}`;
              }
              
              console.log("S3 Key:", s3Key);
              try {
                await s3.deleteObject({
                  Bucket: authConfig.s3_bucket,
                  Key: s3Key
                }).promise();
                deletedImages.add(imageUrl);
                console.log(`✅ Deleted S3 image: ${s3Key}`);
              } catch (s3Error) {
                console.error(
                  `Error deleting S3 image ${s3Key}:`,
                  s3Error
                );
                // Continue with deletion even if S3 cleanup fails
              }
            }
          }
        }
      }

      // Delete all questions first
      const questionDeleteResult = await Question.deleteMany({ quizId: quiz._id });
      console.log(`🗑️ [DEBUG] Deleted ${questionDeleteResult.deletedCount} questions`);

      // Then delete the quiz
      const quizDeleteResult = await Quiz.findByIdAndDelete(quiz._id);
      console.log(`🗑️ [DEBUG] Quiz deleted: ${!!quizDeleteResult}`);

      console.log(`✅ Quiz ${quizId} and all associated data deleted successfully`);
      
      // 🔧 FIX: Invalidate cache after quiz deletion
      try {
        const { invalidateCache } = require('../middlewares/cacheMiddleware');
        await invalidateCache(`quiz:cache:*`);
        console.log(`✅ [DEBUG] Cache invalidated after quiz deletion: ${quizId}`);
      } catch (cacheError) {
        console.error(`⚠️ [DEBUG] Cache invalidation failed:`, cacheError);
      }
      
      res.status(200).json({ 
        message: "Quiz deleted successfully",
        deletedQuestions: questionDeleteResult.deletedCount,
        deletedImages: deletedImages.size
      });
      
    } catch (deletionError) {
      console.error(`❌ Error in quiz deletion process:`, deletionError);
      res.status(500).json({ 
        message: "Error during quiz deletion", 
        error: deletionError.message 
      });
    }

  } catch (error) {
    console.error("Error in quiz deletion controller:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};
