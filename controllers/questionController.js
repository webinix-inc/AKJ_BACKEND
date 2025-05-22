const mongoose = require("mongoose");
const mammoth = require("mammoth");
const fs = require("fs").promises;
const path = require("path");
const cloudinary = require("cloudinary").v2;
const cheerio = require("cheerio");
const WordExtractor = require("word-extractor");
const { JSDOM } = require("jsdom");

const extractor = new WordExtractor();

const Question = require("../models/questionModel");
const Quiz = require("../models/quizModel");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

exports.addQuestion = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { questionType, questionText, options, questionCorrectMarks } =
      req.body;

    if (
      !quizId ||
      !questionType ||
      !questionText ||
      !options ||
      options.length !== 4 ||
      !questionCorrectMarks
    ) {
      return res.status(400).json({ error: "Invalid question data provided" });
    }

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    const existingQuestion = await Question.findOne({
      quizId,
      questionText,
    }).lean();

    if (existingQuestion) {
      return res
        .status(400)
        .json({ message: "This question already exists in the quiz" });
    }

    const newQuestion = new Question({
      quizId,
      questionType,
      questionText,
      options,
      questionCorrectMarks,
    });

    const savedQuestion = await newQuestion.save();

    // atomically update the quiz
    await Quiz.findByIdAndUpdate(
      quizId,
      {
        $push: { questions: savedQuestion._id },
        $inc: { quizTotalMarks: questionCorrectMarks },
      },
      { new: true, runValidators: true }
    );

    res
      .status(201)
      .json({ message: "Question added successfully", savedQuestion });
  } catch (error) {
    console.error("Error in adding question:", error);

    // If the question was saved but not added to the quiz, clean it up
    if (error.savedQuestion) {
      await Question.findByIdAndDelete(error.savedQuestion._id);
    }

    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.fetchAllQuestions = async (req, res) => {
  const { quizId } = req.params;

  try {
    const questions = await Question.find({ quizId }).lean();
    res.status(200).json({ message: "All questions", questions });
  } catch (error) {
    console.error("Error in fetching questions", error);
    res.status(400).json({ error });
  }
};

exports.deleteAllQuestions = async (req, res) => {
  const { quizId } = req.params;

  try {
    // Delete all questions related to the quizId
    const result = await Question.deleteMany({ quizId });
    res.status(200).json({
      message: "All questions deleted successfully",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error in deleting all questions", error);
    res.status(400).json({ error });
  }
};

exports.specificQuestionDetails = async (req, res) => {
  try {
    const { questionId } = req.params;
    const question = await Question.findById(questionId).lean();
    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }
    res.status(200).json({ message: "Question details", question });
  } catch (error) {
    console.error("Error in fetching specific question", error);
    res.status(400).json({ error });
  }
};

exports.updateQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const updateFields = {};

    ["questionType", "questionText"].forEach((field) => {
      if (req.body[field] !== undefined) {
        updateFields[field] = req.body[field];
      }
    });

    // Process options
    if (req.body.options) {
      const question = await Question.findById(questionId);
      if (!question) {
        return res.status(404).json({ message: "Question not found" });
      }

      updateFields.options = question.options.map((existingOption, index) => {
        if (
          req.body.options[index] !== undefined &&
          req.body.options[index] !== null
        ) {
          return {
            ...existingOption.toObject(),
            ...req.body.options[index],
            _id: existingOption._id, // to preserve the original _id
          };
        }
        return existingOption; // to keep the existing option unchanged
      });

      // to ensure we're not accidentally removing options
      if (updateFields.options.length !== question.options.length) {
        return res
          .status(400)
          .json({ message: "Cannot change the number of options" });
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return res
        .status(400)
        .json({ message: "No valid fields provided for update" });
    }

    const updatedQuestion = await Question.findByIdAndUpdate(
      questionId,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedQuestion) {
      return res.status(404).json({ message: "Question not found" });
    }

    console.log("the updated Question is this :", updatedQuestion);

    res
      .status(200)
      .json({ message: "Question updated successfully", updatedQuestion });
  } catch (error) {
    console.error("Error in updating question:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.deleteQuestion = async (req, res) => {
  const { quizId, questionId } = req.params;
  try {
    const question = await Question.findByIdAndDelete({
      _id: questionId,
      quizId,
    });
    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }
    await Quiz.findByIdAndUpdate(quizId, { $pull: { questions: questionId } });

    res.status(200).json({ message: "Question deleted successfully" });
  } catch (error) {
    console.error("Error in deleting question", error);
    res.status(400).json({ error });
  }
};

exports.uploadQuestionsFromWord = async (req, res) => {
  let tempFilePath = null;
  try {
    const { quizId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    console.log("File uploaded:", file.originalname);
    console.log("Temporary file path:", file.path);
    tempFilePath = file.path;

    const result = await mammoth.convertToHtml({ path: file.path });
    const bodyHtml = result.value;

    // Extract tables as structured data from HTML
    const tables = await extractTables(bodyHtml);

    let tableIndex = 0;

    console.log("Print upper table:", tables[9][0].slice(1));

    // for text content
    const extracted = await extractor.extract(file.path);
    const bodyText = extracted.getBody();

    // Split the body text into questions
    const questionsData = bodyText.split(/Question\s+/g).slice(1);
    const savedQuestions = [];

    for (let i = 0; i < questionsData.length; i++) {
      const questionText = questionsData[i];
      const questionData = {};

      questionData.table = tables[i][0].slice(1);

      const typeeIndex = questionText.indexOf("Type\t");
      if (typeeIndex !== -1) {
        questionData.questionText = questionText
          .substring(0, typeeIndex)
          .trim();
      } else {
        questionData.questionText = questionText.trim();
      }

      const lines = questionText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line);

      // Extract and upload images for this question
      questionData.questionImage = await extractAndUploadImages(
        bodyHtml,
        quizId,
        i
      );

      // Add tables as part of the question data if applicable
      if (tables[i]) {
        questionData.tables = tables[i];
      }

      // Parse question type
      const typeIndex = lines.findIndex((line) => line.startsWith("Type"));
      questionData.questionType = lines[typeIndex].split("\t")[1].trim();

      // Extract the correct answer letter (A, B, C, or D)
      const solutionLine = lines.find((line) => line.startsWith("Solution"));
      const correctAnswerLetter = solutionLine
        ? solutionLine.split("\t")[1].trim()
        : "";

      // Parse and set options
      questionData.options = lines
        .filter((line) => line.startsWith("Option"))
        .map((line) => {
          const [, optionText] = line.split("\t");
          return { optionText: optionText.trim(), isCorrect: false };
        });

      // Set the correct answer based on the solution letter
      if (correctAnswerLetter) {
        const correctIndex =
          correctAnswerLetter.charCodeAt(0) - "A".charCodeAt(0);
        if (correctIndex >= 0 && correctIndex < questionData.options.length) {
          questionData.options[correctIndex].isCorrect = true;
        }
      }

      // Parse marks
      const marksLine = lines.find((line) => line.startsWith("Marks"));
      if (marksLine) {
        const [, correctMarks, incorrectMarks] = marksLine.split("\t");
        questionData.questionCorrectMarks = parseInt(correctMarks.trim()) || 0;
        questionData.questionIncorrectMarks =
          parseInt(incorrectMarks.trim()) || 0;
      }

      // Create and save the question
      const newQuestion = new Question({
        quizId,
        questionType: questionData.questionType,
        questionText: questionData.questionText,
        questionImage: questionData.questionImage,
        tables: questionData.table, // Including tables if present
        options: questionData.options,
        questionCorrectMarks: questionData.questionCorrectMarks,
        questionIncorrectMarks: questionData.questionIncorrectMarks,
        uploadedFromWord: true,
      });

      // console.log("Table data:", questionData.tables);
      console.log("Saving question:", newQuestion);
      const savedQuestion = await newQuestion.save();
      savedQuestions.push(savedQuestion);
    }

    // Clean up temporary file
    try {
      await fs.unlink(file.path);
      console.log("Temporary file deleted successfully:", file.path);
    } catch (unlinkError) {
      console.error("Error deleting temporary file:", unlinkError);
      throw unlinkError;
    }

    // Update the quiz with the new questions
    await Quiz.findByIdAndUpdate(quizId, {
      $push: { questions: { $each: savedQuestions.map((q) => q._id) } },
      $inc: {
        quizTotalMarks: savedQuestions.reduce(
          (total, q) => total + q.questionCorrectMarks,
          0
        ),
      },
    });

    res.status(201).json({
      message: "Questions uploaded successfully",
      savedQuestions: savedQuestions.map((q) => q._id),
      totalQuestions: savedQuestions.length,
    });
  } catch (error) {
    console.error("Error in processing Word document:", error);
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
        console.log("Temporary file deleted in error handler:", tempFilePath);
      } catch (unlinkError) {
        console.error(
          "Error deleting temporary file in error handler:",
          unlinkError
        );
      }
    }
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

async function extractTables(htmlContent) {
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;
  const tables = document.querySelectorAll("table");
  const tableData = [];

  tables.forEach((table) => {
    const rows = table.querySelectorAll("tr");
    const rowData = [];
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      const cellData = [];
      cells.forEach((cell) => {
        // Use innerHTML to get HTML content of each cell
        cellData.push(cell.innerHTML);
      });
      rowData.push(cellData);
    });
    tableData.push(rowData);
  });

  return tableData;
}

async function extractAndUploadImages(bodyHtml, quizId, questionIndex) {
  const $ = cheerio.load(bodyHtml);
  const tables = $("table");

  if (questionIndex >= tables.length) {
    return []; // No images for this question
  }

  const questionTable = tables.eq(questionIndex);
  const images = questionTable.find("img");

  if (images.length === 0) {
    return []; // No images in this question
  }

  const imageUrls = await Promise.all(
    images
      .map((index, img) => {
        const imageSrc = $(img).attr("src");
        return uploadToCloudinary(imageSrc, quizId, questionIndex, index);
      })
      .get()
  );

  return imageUrls.map((result) => result.secure_url);
}

async function uploadToCloudinary(imageSrc, quizId, questionIndex, imageIndex) {
  try {
    if (!imageSrc.startsWith("data:image")) {
      throw new Error("Invalid image source");
    }

    const base64Data = imageSrc.split(",")[1];
    const imageBuffer = Buffer.from(base64Data, "base64");
    const tempPath = path.join(
      __dirname,
      `temp_image_${questionIndex}_${imageIndex}.png`
    );
    await fs.writeFile(tempPath, imageBuffer);

    const dateString = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .split(".")[0];
    const fileName = `${quizId}_${dateString}_${questionIndex}_${imageIndex}.png`;

    const result = await cloudinary.uploader.upload(tempPath, {
      folder: "testQuiz",
      public_id: fileName.split(".")[0],
      use_filename: false,
      unique_filename: false,
    });

    await fs.unlink(tempPath);
    return result;
  } catch (error) {
    console.error("Error uploading to Cloudinary:", error);
    throw error;
  }
}
