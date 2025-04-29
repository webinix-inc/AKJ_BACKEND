// const redisClient = quizQueue.client;

// // Constants for Redis keys and timing
// const CACHE_KEYS = {
//     SCORECARD: (id) => `scorecard:${id}`,
//     ANSWERS: (id) => `answers:${id}`,
//     PENDING_SAVES: 'pending_saves'
// };

// const BATCH_SAVE_INTERVAL = 5 * 60 * 1000; // 5 minutes
// const CACHE_CLEANUP_DELAY = 2 * 60 * 1000;

// // New endpoint for viewing score details
// exports.viewScore = async (req, res) => {
//     try {
//         const { scorecardId } = req.params;

//         // Try cache first
//         const [cachedScorecard, cachedAnswers] = await Promise.all([
//             redisClient.hgetall(CACHE_KEYS.SCORECARD(scorecardId)),
//             redisClient.hgetall(CACHE_KEYS.ANSWERS(scorecardId))
//         ]);

//         let scoreDetails;
//         if (cachedScorecard && cachedAnswers) {
//             scoreDetails = {
//                 score: parseInt(cachedScorecard.score),
//                 correctQuestions: parseInt(cachedScorecard.correctQuestions),
//                 incorrectQuestions: parseInt(cachedScorecard.incorrectQuestions),
//                 answers: Object.entries(cachedAnswers).map(([questionId, answerStr]) => ({
//                     questionId,
//                     ...JSON.parse(answerStr)
//                 }))
//             };
//         } else {
//             // Fallback to MongoDB
//             const scorecard = await Scorecard.findById(scorecardId)
//                 .populate('answers.questionId', 'questionText questionType');

//             if (!scorecard) {
//                 return res.status(404).json({ message: 'Scorecard not found' });
//             }

//             scoreDetails = {
//                 score: scorecard.score,
//                 correctQuestions: scorecard.correctQuestions,
//                 incorrectQuestions: scorecard.incorrectQuestions,
//                 answers: scorecard.answers
//             };
//         }

//         res.status(200).json({
//             message: 'Score details retrieved',
//             scoreDetails
//         });
//     } catch (error) {
//         console.error('Error in viewing score:', error);
//         res.status(500).json({ message: 'Internal server error', error: error.message });
//     }
// };

// exports.getQuizResults = async (req, res) => {
//     try {
//         const { quizId } = req.params;

//         // Fetch the quiz
//         const quiz = await Quiz.findById(quizId);
//         if (!quiz) {
//             return res.status(404).json({ message: 'Quiz not found' });
//         }

//         // Fetch all completed scorecards for this quiz
//         const scorecards = await Scorecard.find({
//             quizId: quizId,
//             status: 'completed'|| 'auto-submitted'
//         }).populate('userId', 'firstName email');

//         // Process the scorecards to get the required information
//         const results = await Promise.all(scorecards.map(async (scorecard) => {
//             const notAttempted = quiz.questions.length - (scorecard.correctQuestions + scorecard.incorrectQuestions);

//             return {
//                 studentName: scorecard.userId.firstName,
//                 studentEmail: scorecard.userId.email,
//                 score: scorecard.score,
//                 correctQuestions: scorecard.correctQuestions,
//                 incorrectQuestions: scorecard.incorrectQuestions,
//                 notAttempted: notAttempted,
//                 totalQuestions: quiz.questions.length
//             };
//         }));

//         res.status(200).json({
//             quizName: quiz.quizName,
//             totalParticipants: results.length,
//             results: results
//         });

//     } catch (error) {
//         console.error('Error in getQuizResults:', error);
//         res.status(500).json({ message: 'Internal server error' });
//     }
// };

const moment = require("moment-timezone");

const Scorecard = require("../models/scorecardModel");
const Quiz = require("../models/quizModel");
const Question = require("../models/questionModel");
const User = require("../models/userModel");
const quizQueue = require("../utils/quizQueue");
const {
  startCronJob,
  stopCronJob,
  processPendingWrites,
  getAnswersCacheKey,
  getPendingWritesKey,
} = require("../utils/cronJobs");
const { calculateScores, finishQuizHelper } = require("../utils/scoreUtils");
const redisClient = require("../configs/redisTest");

const CACHE_EXPIRY = 60 * 5; // 5 minutes
const BATCH_WRITE_INTERVAL = 60 * 3; // 3 minutes

// const getAnswersCacheKey = (scorecardId) => `quiz:answers:${scorecardId}`;
// const getPendingWritesKey = () => 'quiz:pending_writes';

exports.validateQuizStart = async (req, res) => {
  try {
      const { quizId } = req.params;
      const userId = req.user._id;
      const indianTimeZone = "Asia/Kolkata";
      const now = moment.tz(indianTimeZone);

      const quiz = await Quiz.findById(quizId);
      if (!quiz) {
          return res.status(404).json({ 
              success: false,
              message: "Quiz not found" 
          });
      }

      let canStartQuiz = false;
      let endDateTime;

      if (quiz.availabilityType === "always") {
          canStartQuiz = quiz.isActive;
          if (!canStartQuiz) {
              return res.status(403).json({ 
                  success: false,
                  message: "This quiz is not currently active." 
              });
          }
      } else if (quiz.availabilityType === "scheduled") {
          const startDateTime = moment.tz(
              `${quiz.scheduledStartDate} ${quiz.scheduledStartTime}`,
              "DD-MM-YYYY HH:mm",
              indianTimeZone
          );
          endDateTime = moment.tz(
              `${quiz.scheduledEndDate} ${quiz.scheduledEndTime}`,
              "DD-MM-YYYY HH:mm",
              indianTimeZone
          );

          if (now.isBefore(startDateTime)) {
              return res.status(403).json({ 
                  success: false,
                  message: "This quiz is not available yet." 
              });
          }
          if (now.isAfter(endDateTime)) {
              return res.status(403).json({ 
                  success: false,
                  message: "The time for this quiz has passed." 
              });
          }
          canStartQuiz = true;
      }

      if (!canStartQuiz) {
          return res.status(403).json({ 
              success: false,
              message: "Unable to start the quiz at this time." 
          });
      }

      let userAttempt = quiz.userAttempts.find(
          (attempt) => attempt.userId.toString() === userId
      );
      
      if (!userAttempt) {
          userAttempt = { userId, attemptCount: 0 };
      }

      if (userAttempt.attemptCount >= quiz.maxAttempts) {
          return res.status(403).json({
              success: false,
              message: 'Maximum attempts reached for this quiz',
              maxAttempts: quiz.maxAttempts,
              userAttempts: userAttempt.attemptCount
          });
      }

      const existingScorecard = await Scorecard.findOne({
          userId,
          quizId,
          completed: false,
      });
      
      if (existingScorecard) {
          return res.status(400).json({ 
              success: false,
              message: "You have an ongoing attempt for this quiz" 
          });
      }

      const fullDurationInMinutes = quiz.duration.hours * 60 + quiz.duration.minutes;
      const endTimeByDuration = now.clone().add(fullDurationInMinutes, "minutes");
      
      let actualEndTime;
      if (quiz.availabilityType === "scheduled" && endDateTime) {
          actualEndTime = moment.min(endTimeByDuration, endDateTime);
      } else {
          actualEndTime = endTimeByDuration;
      }

      const actualDurationMinutes = actualEndTime.diff(now, "minutes");

      if (actualDurationMinutes < 1) {
          return res.status(403).json({
              success: false,
              message: "Not enough time remaining to start the quiz",
              remainingMinutes: actualDurationMinutes,
          });
      }

      return res.status(200).json({
          success: true,
          message: "Quiz can be started",
          quizDetails: {
              quizId,
              currentAttempts: userAttempt.attemptCount,
              maxAttempts: quiz.maxAttempts,
              durationMinutes: actualDurationMinutes,
              startTime: now.format("DD-MM-YYYY HH:mm"),
              expectedEndTime: actualEndTime.format("DD-MM-YYYY HH:mm")
          }
      });

  } catch (error) {
      console.error("Error in validating quiz:", error);
      res.status(500).json({ 
          success: false,
          message: "Internal server error", 
          error: error.message 
      });
  }
};

exports.startQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    const userId = req.user._id;
    const indianTimeZone = "Asia/Kolkata";
    const currentTime = moment.tz(indianTimeZone);

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }
    // console.log('Quiz:', quiz);

    // let canStartQuiz = false;
    // let startDateTime, endDateTime;

    // if (quiz.availabilityType === "always") {
    //   canStartQuiz = quiz.isActive;
    //   if (!canStartQuiz) {
    //     return res
    //       .status(403)
    //       .json({ message: "This quiz is not currently active." });
    //   }
    // } else if (quiz.availabilityType === "scheduled") {
    //   startDateTime = moment.tz(
    //     `${quiz.scheduledStartDate} ${quiz.scheduledStartTime}`,
    //     "DD-MM-YYYY HH:mm",
    //     indianTimeZone
    //   );
    //   endDateTime = moment.tz(
    //     `${quiz.scheduledEndDate} ${quiz.scheduledEndTime}`,
    //     "DD-MM-YYYY HH:mm",
    //     indianTimeZone
    //   );

    //   if (now.isBefore(startDateTime)) {
    //     return res
    //       .status(403)
    //       .json({ message: "This quiz is not available yet." });
    //   }
    //   if (now.isAfter(endDateTime)) {
    //     return res
    //       .status(403)
    //       .json({ message: "The time for this quiz has passed." });
    //   }

    //   canStartQuiz = true;
    // }

    // if (!canStartQuiz) {
    //   return res
    //     .status(403)
    //     .json({ message: "Unable to start the quiz at this time." });
    // }

    // Validate attempt limits
    let userAttempt = quiz.userAttempts.find(
      (attempt) => attempt.userId.toString() === userId
    );
    if (!userAttempt) {
      userAttempt = { userId, attemptCount: 0 };
      quiz.userAttempts.push(userAttempt);
    }

    if (userAttempt.attemptCount >= quiz.maxAttempts) {
        return res.status(403).json({
            message: 'Maximum attempts reached for this quiz',
            maxAttempts: quiz.maxAttempts,
            userAttempts: userAttempt.attemptCount
        });
    }

    // Check for ongoing attempts
    // const existingScorecard = await Scorecard.findOne({
    //   userId,
    //   quizId,
    //   completed: false,
    // });
    // if (existingScorecard) {
    //   return res
    //     .status(400)
    //     .json({ message: "You have an ongoing attempt for this quiz" });
    // }

    userAttempt.attemptCount++;
    await quiz.save();

    // Calculate end time
    const fullDurationInMinutes = quiz.duration.hours * 60 + quiz.duration.minutes;
    const endTimeByDuration = currentTime.clone().add(fullDurationInMinutes, "minutes");
    
    let actualEndTime;
    if (quiz.availabilityType === "scheduled") {
        const endDateTime = moment.tz(
            `${quiz.scheduledEndDate} ${quiz.scheduledEndTime}`,
            "DD-MM-YYYY HH:mm",
            indianTimeZone
        );
        actualEndTime = moment.min(endTimeByDuration, endDateTime);
    } else {
        actualEndTime = endTimeByDuration;
    }

    const scorecard = new Scorecard({
      userId,
      quizId,
      startTime: currentTime.toDate(),
      expectedEndTime: actualEndTime.toDate(),
      totalMarks: quiz.quizTotalMarks,
    });

    await scorecard.save();

    // Schedule auto-submission job
    await quizQueue.add(
      "autoSubmit",
      { scorecardId: scorecard._id },
      {
        delay: actualEndTime.valueOf() - currentTime.valueOf(),
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      }
    );

    // Start the cron job
    startCronJob();

    res.status(201).json({
      message: "Quiz started",
      scorecardId: scorecard._id,
      startTime: currentTime.format("DD-MM-YYYY HH:mm"),
      expectedEndTime: actualEndTime.format("DD-MM-YYYY HH:mm"),
      durationMinutes: actualEndTime.diff(currentTime, "minutes"),
      attemptNumber: userAttempt.attemptCount,
    });
  } catch (error) {
    console.error("Error in starting quiz:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.submitAnswer = async (req, res) => {
  try {
    const { scorecardId, questionId } = req.params;
    const { selectedOptions } = req.body;

    const indianTimeZone = "Asia/Kolkata";
    const now = moment.tz(indianTimeZone);

    const scorecard = await Scorecard.findById(scorecardId);
    if (!scorecard) {
      return res.status(404).json({ message: "Scorecard not found" });
    }

    if (scorecard.completed) {
      console.log("Scorecard completed");
      return res
        .status(400)
        .json({ message: "Quiz has already been completed or auto-submitted" });
    }

    // if (new Date() > scorecard.expectedEndTime) {
    //     await finishQuizHelper(scorecard);
    //     return res.status(400).json({ message: 'Quiz time has expired' });
    // }

    const expectedEndTime = moment(scorecard.expectedEndTime);
    console.log("expected end time: ", expectedEndTime);
    console.log("now: ", now);
    if (now.isAfter(expectedEndTime)) {
      await finishQuizHelper(scorecard);
      return res.status(400).json({ message: "Quiz time has expired" });
    }

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }

    const isCorrect = question.options.every(
      (option) =>
        (selectedOptions.includes(option._id.toString()) && option.isCorrect) ||
        (!selectedOptions.includes(option._id.toString()) && !option.isCorrect)
    );

    const marks = isCorrect
      ? question.questionCorrectMarks
      : question.questionIncorrectMarks;

    const cacheKey = getAnswersCacheKey(scorecardId);
    console.log("Cache key:", cacheKey);
    let cachedAnswers = await redisClient.get(cacheKey);
    console.log("Initial cached answers:", cachedAnswers);
    cachedAnswers = cachedAnswers ? JSON.parse(cachedAnswers) : [];

    if (!Array.isArray(cachedAnswers)) {
      cachedAnswers = [];
      console.warn('Initialized empty answers array for scorecard:', scorecardId);
  }

    const answerData = {
      questionId,
      selectedOptions,
      isCorrect,
      marks,
      timestamp: new Date().toISOString(),
    };
    console.log("New answer data:", answerData);

    const existingIndex = cachedAnswers.findIndex(
      (a) => a.questionId === questionId
    );
    if (existingIndex !== -1) {
      console.log("Updating existing answer at index:", existingIndex);
      cachedAnswers[existingIndex] = answerData;
    } else {
      console.log("Adding new answer");
      cachedAnswers.push(answerData);
    }

    // Save to Redis with expiry
    console.log("Saving to Redis:", JSON.stringify(cachedAnswers));
    await redisClient.setex(
      cacheKey,
      CACHE_EXPIRY,
      JSON.stringify(cachedAnswers)
    );

    // Add to pending writes set
    // await redisClient.sadd(getPendingWritesKey(), scorecardId);
    const pendingWritesKey = getPendingWritesKey();
    console.log("Adding to pending writes set:", pendingWritesKey);
    await redisClient.sadd(pendingWritesKey, scorecardId);

    // Calculate current scores
    const currentScores = calculateScores(cachedAnswers);
    console.log("Adding to pending writes set:", pendingWritesKey);
    await redisClient.sadd(pendingWritesKey, scorecardId);

    res.status(200).json({
      message: existingIndex !== -1 ? "Answer updated" : "Answer submitted",
      isCorrect,
      currentScores,
    });
  } catch (error) {
    console.error("Error in submitting answer:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.finishQuiz = async (req, res) => {
  try {
    const { scorecardId } = req.params;

    console.log(`Finishing quiz for scorecard: ${scorecardId}`);

    // Process any pending writes
    console.log("Processing pending writes before finishing quiz");
    try {
      await processPendingWrites();
    } catch (error) {
      console.error("Error processing pending writes:", error);
    }

    const scorecard = await Scorecard.findById(scorecardId);
    if (!scorecard) {
      return res.status(404).json({ message: "Scorecard not found" });
    }

    if (scorecard.completed) {
      return res
        .status(400)
        .json({ message: "Quiz has already been completed or auto-submitted" });
    }

    await processPendingWrites();

    let cacheKey = getAnswersCacheKey(scorecardId);
    let finalAnswers = scorecard.answers || [];
    const cachedAnswers = await redisClient.get(cacheKey);

    if (cachedAnswers) {
      console.log("Found last-minute cached answers:", cachedAnswers);
      const answers = JSON.parse(cachedAnswers);
      if (Array.isArray(parsedAnswers) && parsedAnswers.length > 0) {
        finalAnswers = [...finalAnswers, ...parsedAnswers];
      }
    }

    finalAnswers = finalAnswers.reduce((acc, answer) => {
      const existingIndex = acc.findIndex(a => a.questionId === answer.questionId);
      if (existingIndex !== -1) {
        acc[existingIndex] = answer; // to replace with latest answer
      } else {
        acc.push(answer);
      }
      return acc;
    }, []);

    scorecard.answers = finalAnswers;

    const finalScores = calculateScores(finalAnswers);
    Object.assign(scorecard, finalScores);

    scorecard.completed = true;
    scorecard.status = "completed";

    const finishedScorecard = await finishQuizHelper(scorecard);
    console.log("Quiz finished successfully:", finishedScorecard);

    await redisClient.del(getAnswersCacheKey(scorecardId));
    await redisClient.srem(getPendingWritesKey(), scorecardId);

    // Check if there are any ongoing quizzes
    const ongoingQuizzes = await Scorecard.findOne({ completed: false });
    if (!ongoingQuizzes) {
      stopCronJob(); // Stop the cron job if there are no ongoing quizzes
    }

    res.status(200).json({
      message: scorecard.autoSubmitted
        ? "Quiz auto-submitted due to time expiration"
        : "Quiz completed",
      scorecard: finishedScorecard,
    });
  } catch (error) {
    console.error("Error in finishing quiz:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.getScorecardDetails = async (req, res) => {
  try {
    const { scorecardId } = req.params;

    const scorecard = await Scorecard.findById(scorecardId)
      .populate("quizId", "quizName category")
      .populate("answers.questionId", "questionText questionType");

    if (!scorecard) {
      return res.status(404).json({ message: "Scorecard not found" });
    }

    res.status(200).json({ message: "Scorecard details", scorecard });
  } catch (error) {
    console.error("Error in getting scorecard details:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// const Scorecard = require('../models/Scorecard');
// const Quiz = require('../models/Quiz');

exports.getUserQuizHistory = async (req, res) => {
    try {
        const { quizId } = req.params;
        const userId = req.user._id;

        const scorecards = await Scorecard.find({userId, quizId})
        .sort({ createdAt: -1 })
        .populate('answers.questionId', 'questionText marks') 
        .lean(); 
        
        const quiz = await Quiz.findById(quizId)
            .select('title quizTotalMarks maxAttempts')
            .lean();

        if (!quiz) {
            return res.status(404).json({
                success: false,
                message: "Quiz not found"
            });
        }

        const formattedScoreCards = scorecards.map((scorecard, index) => {
            const attemptNumber = scorecards.length - index;
            
            const startTime = new Date(scorecard.startTime);
            const endTime = scorecard.endTime ? new Date(scorecard.endTime) : null;
            const timeTaken = endTime ? Math.floor((endTime - startTime) / 1000 / 60) : null; 

            const scorePercentage = ((scorecard.score / scorecard.totalMarks) * 100).toFixed(2);

            return {
                attemptId: scorecard._id,
                attemptNumber,
                startTime: startTime.toISOString(),
                endTime: endTime?.toISOString() || null,
                timeTaken, 
                status: scorecard.status,
                score: {
                    obtained: scorecard.score,
                    total: scorecard.totalMarks,
                    percentage: scorePercentage,
                },
                questions: {
                    correct: scorecard.correctQuestions,
                    incorrect: scorecard.incorrectQuestions,
                    total: scorecard.answers.length,
                },
                isAutoSubmitted: scorecard.autoSubmitted,
                completed: scorecard.completed,
                questionDetails: scorecard.answers.map(answer => ({
                    questionId: answer.questionId._id,
                    questionText: answer.questionId.questionText,
                    marksObtained: answer.marks,
                    maxMarks: answer.questionId.marks,
                    isCorrect: answer.isCorrect,
                    answeredAt: answer.answeredAt
                }))
            };
        });

        const summary = {
            quizTitle: quiz.title,
            totalAttempts: scorecards.length,
            maxAttempts: quiz.maxAttempts,
            attemptsRemaining: quiz.maxAttempts - scorecards.length,
            highestScore: Math.max(...scorecards.map(s => s.score), 0),
            averageScore: (scorecards.reduce((sum, s) => sum + s.score, 0) / scorecards.length || 0).toFixed(2),
            quizTotalMarks: quiz.quizTotalMarks,
            lastAttemptDate: scorecards[0]?.createdAt || null,
        };

        res.status(200).json({
            success: true,
            summary,
            attempts: formattedScoreCards
        });

    } catch (error) {
        console.error("Error fetching quiz history:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

exports.processAutoSubmit = async (job) => {
  try {
    const { scorecardId } = job.data;
    console.log(`Processing auto-submit for scorecard ${scorecardId}`);

    const scorecard = await Scorecard.findById(scorecardId);
    if (!scorecard || scorecard.completed) {
      console.log(`Scorecard ${scorecardId} already completed or invalid`);
      return;
    }

    await finishQuizHelper(scorecard);
    console.log(`Auto-submitted scorecard ${scorecardId}`);

    // Check if there are any ongoing quizzes
    const ongoingQuizzes = await Scorecard.findOne({ completed: false });
    if (!ongoingQuizzes) {
      stopCronJob(); // Stop the cron job if there are no ongoing quizzes
    }
  } catch (error) {
    console.error(
      `Error auto-submitting scorecard ${job.data.scorecardId}:`,
      error
    );
    throw error; // Rethrow the error to trigger job retry
  }
};