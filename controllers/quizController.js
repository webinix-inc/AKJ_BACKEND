require("dotenv").config();

const mongoose = require("mongoose");
const cloudinary = require("cloudinary").v2;
// const moment = require('moment');
const moment = require("moment-timezone");
const schedule = require("node-schedule");

const Quiz = require("../models/quizModel");
const Question = require("../models/questionModel");
const QuizFolder = require("../models/quizFolder");

exports.createQuiz = async (req, res) => {
  // console.log("Inside createQuiz");
  // console.log("req.user: ", req.user);
  try {
    const { quizName, duration, category } = req.body;
    const { folderId } = req.params;
    if (!quizName || !duration || !category) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const quizExists = await Quiz.findOne({ quizName }).lean();

    if (quizExists) {
      return res.status(400).json({ message: "Quiz already exists" });
    }

    const quiz = await Quiz.create({
      creatorId: req.user._id,
      quizName,
      duration,
      category,
    });

    const folder = await QuizFolder.findById(folderId);
    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }

    folder.quizzes.push(quiz._id);
    await folder.save();

    res.status(201).json({ message: "Quiz created successfully", quiz });
  } catch (error) {
    res.status(400).json({ error });
  }
};

exports.fetchQuizzesByFolder = async (req, res) => {
  try {
    const { folderId } = req.params;

    // Validate folder existence
    const folder = await QuizFolder.findById(folderId)
      .populate("quizzes")
      .lean();
    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }

    // Fetch quizzes associated with the folder
    const quizzes = await Quiz.find({ _id: { $in: folder.quizzes } }).lean();

    res.status(200).json({
      message: "Quizzes retrieved successfully",
      folderId,
      quizzes,
    });
  } catch (error) {
    console.error("Error fetching quizzes by folder ID", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
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
    const quiz = await Quiz.findById(quizId);

    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    process.nextTick(async () => {
      try {
        const questions = await Question.find({ quizId: quiz._id });

        const deletedImages = new Set();
        for (let question of questions) {
          if (question.questionImage && question.questionImage.length > 0) {
            for (let imageUrl of question.questionImage) {
              if (!deletedImages.has(imageUrl)) {
                console.log("Deleting image:", imageUrl);
                const publicId = `testQuiz/${
                  imageUrl.split("/").slice(-1)[0].split(".")[0]
                }`;
                console.log("Public ID:", publicId);
                try {
                  await cloudinary.uploader.destroy(publicId);
                  deletedImages.add(imageUrl);
                } catch (cloudinaryError) {
                  console.error(
                    `Error deleting Cloudinary image ${publicId}:`,
                    cloudinaryError
                  );
                }
              }
            }
          }
        }

        await Question.deleteMany({ quizId: quiz._id });

        await Quiz.findByIdAndDelete(quiz._id);

        console.log(
          `Quiz ${quizId} and all associated data deleted successfully`
        );
      } catch (error) {
        console.error(`Error in background deletion of quiz ${quizId}:`, error);
      }
    });

    res
      .status(200)
      .json({ message: "Quiz deletion process initiated successfully" });
  } catch (error) {
    console.error("Error in initiating quiz deletion", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};
