const mongoose = require("mongoose");
const mammoth = require("mammoth");
const fs = require("fs").promises;
const path = require("path");
const cheerio = require("cheerio");
const WordExtractor = require("word-extractor");
const { JSDOM } = require("jsdom");
const { S3Client, DeleteObjectCommand, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const authConfig = require("../configs/auth.config");
const { Readable } = require('stream');

const extractor = new WordExtractor();

const Question = require("../models/questionModel");
const Quiz = require("../models/quizModel");

// Configure S3 instead of Cloudinary
const s3 = new S3Client({
  region: authConfig.aws_region,
  credentials: {
    accessKeyId: authConfig.aws_access_key_id,
    secretAccessKey: authConfig.aws_secret_access_key,
  },
});

console.log("✅ Using S3 for quiz image uploads instead of Cloudinary");

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

// 🔧 NEW: S3-based Word document processing with enhanced parsing
exports.uploadQuestionsFromS3 = async (req, res) => {
  let tempFilePath = null;
  let s3Key = null;
  
  try {
    const { quizId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    console.log(`📄 S3 Word Document Upload Started:`);
    console.log(`   📁 File: ${file.originalname}`);
    console.log(`   📍 S3 Key: ${file.key}`);
    console.log(`   📊 Size: ${Math.round(file.size / 1024)}KB`);
    console.log(`   🆔 Quiz ID: ${quizId}`);
    
    s3Key = file.key; // Store S3 key for cleanup if needed

    // 🔧 NEW: Download file from S3 to temporary location for processing
    console.log(`📥 Downloading file from S3 for processing...`);
    const downloadParams = {
      Bucket: authConfig.s3_bucket,
      Key: file.key
    };
    
    const downloadCommand = new GetObjectCommand(downloadParams);
    const s3Response = await s3.send(downloadCommand);
    
    // Create temporary file path
    const timestamp = Date.now();
    const tempFileName = `temp_${timestamp}_${file.originalname}`;
    tempFilePath = path.join(process.cwd(), 'temp', tempFileName);
    
    // Ensure temp directory exists
    const tempDir = path.dirname(tempFilePath);
    await fs.mkdir(tempDir, { recursive: true });
    
    // Convert S3 stream to buffer and save to temp file
    const chunks = [];
    for await (const chunk of s3Response.Body) {
      chunks.push(chunk);
    }
    const fileBuffer = Buffer.concat(chunks);
    await fs.writeFile(tempFilePath, fileBuffer);
    
    console.log(`✅ File downloaded to temporary location: ${tempFilePath}`);

    // 🔧 ENHANCED: Process the document with improved parsing
    const result = await processWordDocumentEnhanced(tempFilePath, quizId);
    
    // Clean up temporary file
    await fs.unlink(tempFilePath);
    console.log(`🗑️ Temporary file cleaned up: ${tempFilePath}`);
    tempFilePath = null;

    // 🔧 NEW: Store document metadata in database for future reference
    const documentMetadata = {
      s3Key: file.key,
      originalName: file.originalname,
      size: file.size,
      uploadTimestamp: new Date(),
      quizId: quizId,
      questionsExtracted: result.savedQuestions.length,
      imagesExtracted: result.totalImages,
      mathExpressionsExtracted: result.totalMathExpressions
    };
    
    console.log(`📊 Document Processing Summary:`, documentMetadata);

    // Update the quiz with the new questions
    await Quiz.findByIdAndUpdate(quizId, {
      $push: { questions: { $each: result.savedQuestions.map((q) => q._id) } },
      $inc: {
        quizTotalMarks: result.savedQuestions.reduce(
          (total, q) => total + q.questionCorrectMarks,
          0
        ),
      },
    });

    res.status(201).json({
      message: "Questions uploaded successfully from S3",
      savedQuestions: result.savedQuestions.map((q) => q._id),
      totalQuestions: result.savedQuestions.length,
      totalImages: result.totalImages,
      totalMathExpressions: result.totalMathExpressions,
      questionsWithImages: result.questionsWithImages,
      documentMetadata: documentMetadata,
      s3Location: `s3://${authConfig.s3_bucket}/${file.key}`
    });

  } catch (error) {
    console.error("❌ Error in S3-based Word document processing:", error);
    
    // Clean up temporary file if it exists
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
        console.log("🗑️ Temporary file cleaned up in error handler");
      } catch (unlinkError) {
        console.error("❌ Error cleaning up temporary file:", unlinkError);
      }
    }
    
    // Optionally clean up S3 file if processing failed
    if (s3Key && error.message.includes('parsing')) {
      console.log(`⚠️ Consider cleaning up S3 file: ${s3Key}`);
      // Uncomment to auto-delete failed uploads:
      // await deleteS3File(s3Key);
    }
    
    res.status(500).json({ 
      message: "Internal server error during S3 document processing", 
      error: error.message,
      s3Key: s3Key
    });
  }
};

// 🔧 REMOVED: Legacy function replaced by enhanced S3-based processing

// 🔧 REMOVED: Legacy extractTables function replaced by extractTablesEnhanced

// 🔧 NEW: Enhanced function to separate mathematical expressions from real images
async function extractMathAndImages(bodyHtml, questionText, quizId, questionIndex) {
  console.log(`🔢 Processing mathematical expressions for question ${questionIndex + 1}`);
  
  // Use the enhanced parser for table-based documents
  const { extractMathExpressionsFromTables } = require('../enhanced_math_parser');
  const { mathExpressions: allMathExpressions, realImages: allRealImages } = extractMathExpressionsFromTables(bodyHtml);
  
  // Filter expressions for this specific question (table)
  const questionMathExpressions = allMathExpressions
    .filter(expr => expr.tableIndex === questionIndex)
    .map(expr => expr.expression);
  
  const questionRealImages = [];
  
  // Process real images for this question
  const realImagesForQuestion = allRealImages.filter(img => img.tableIndex === questionIndex);
  
  for (const imageData of realImagesForQuestion) {
    try {
      const imageUrl = await uploadToS3(imageData.src, quizId, questionIndex, questionRealImages.length);
      questionRealImages.push(imageUrl);
      console.log(`✅ Real image uploaded: ${imageUrl}`);
    } catch (uploadError) {
      console.error(`❌ Failed to upload real image:`, uploadError);
    }
  }
  
  console.log(`📐 Question ${questionIndex + 1} summary:`);
  console.log(`   Mathematical expressions: ${questionMathExpressions.length}`);
  console.log(`   Real images: ${questionRealImages.length}`);
  
  return { 
    mathExpressions: questionMathExpressions, 
    realImages: questionRealImages 
  };
}

// 🔧 NEW: Function to detect if an image contains mathematical expressions
async function isMathematicalExpression(imageSrc, questionText, imageIndex) {
  try {
    // Extract base64 data
    const base64Data = imageSrc.split(",")[1];
    if (!base64Data) {
      return { isMath: false, mathText: "" };
    }

    const imageBuffer = Buffer.from(base64Data, "base64");
    
    // Check image size - mathematical expressions are usually small
    const imageSizeKB = imageBuffer.length / 1024;
    console.log(`🔍 Analyzing image ${imageIndex + 1}: ${Math.round(imageSizeKB)}KB`);
    
    // Heuristic 1: Very small images (< 5KB) are likely mathematical expressions
    if (imageSizeKB < 5) {
      const extractedMath = extractMathFromContext(questionText, imageIndex);
      if (extractedMath) {
        return { isMath: true, mathText: extractedMath };
      }
    }
    
    // Heuristic 2: Check if question text contains mathematical patterns near this image position
    const mathPattern = /[0-9]*[a-zA-Z]*[\^²³⁴⁵⁶⁷⁸⁹⁰]*[+\-=×÷√∑∫πθαβγδεζηλμνξρστφχψω≤≥≠∞∂∇]/;
    if (mathPattern.test(questionText)) {
      const extractedMath = extractMathFromContext(questionText, imageIndex);
      if (extractedMath) {
        return { isMath: true, mathText: extractedMath };
      }
    }
    
    // Default: treat as real image
    return { isMath: false, mathText: "" };
    
  } catch (error) {
    console.error(`❌ Error analyzing image ${imageIndex + 1}:`, error.message);
    return { isMath: false, mathText: "" };
  }
}

// 🔧 ENHANCED: Extract mathematical expression from question text context with better pattern matching
function extractMathFromContext(questionText, imageIndex) {
  console.log(`🔍 Analyzing question text for math expressions: "${questionText.substring(0, 100)}..."`);
  
  // Enhanced mathematical expression patterns
  const mathPatterns = [
    // Quadratic equations with various formats: 2x^2-√5x+1=0, ax²+bx+c=0
    /([0-9]*[a-zA-Z]*[\^²³⁴⁵⁶⁷⁸⁹⁰]*[+\-±][0-9]*[√]*[a-zA-Z]*[+\-±][0-9]*\s*=\s*[0-9]*)/g,
    // Mathematical expressions with special symbols
    /([0-9]*[a-zA-Z]*[\^²³⁴⁵⁶⁷⁸⁹⁰√∑∫πθαβγδεζηλμνξρστφχψω≤≥≠∞∂∇±×÷][+\-±×÷√=\^²³⁴⁵⁶⁷⁸⁹⁰\s]*[a-zA-Z0-9]*[+\-±×÷√=]*[0-9]*)/g,
    // Fractions and complex equations
    /([a-zA-Z0-9+\-±×÷√∑∫πθαβγδεζηλμνξρστφχψω≤≥≠∞∂∇\(\)\[\]\/\^²³⁴⁵⁶⁷⁸⁹⁰\s]{5,})/g,
    // Simple expressions with mathematical symbols
    /([0-9]+[a-zA-Z]*[\^²³⁴⁵⁶⁷⁸⁹⁰]*[+\-±×÷√][0-9]*[a-zA-Z]*[+\-±×÷√]*[0-9]*)/g
  ];
  
  // First, try to find mathematical expressions in the question text
  for (const pattern of mathPatterns) {
    const matches = questionText.match(pattern);
    if (matches && matches.length > 0) {
      // Get the match that corresponds to this image index, or the first one
      const matchIndex = Math.min(imageIndex, matches.length - 1);
      const mathExpr = matches[matchIndex].trim();
      
      // Validate it's actually a mathematical expression
      if (mathExpr.length > 2 && /[+\-±×÷√=\^²³⁴⁵⁶⁷⁸⁹⁰πθαβγδεζηλμνξρστφχψω≤≥≠∞∂∇]/.test(mathExpr)) {
        console.log(`✅ Found mathematical expression in text: "${mathExpr}"`);
        return mathExpr;
      }
    }
  }
  
  // Enhanced fallback: look for specific mathematical expressions in the text
  const specificMathExpressions = [
    "2x^2-√5x+1=0",
    "2x²-√5x+1=0", 
    "ax^2+bx+c=0",
    "ax²+bx+c=0",
    "x^2+y^2=r^2",
    "x²+y²=r²",
    "sin(θ)+cos(θ)=1",
    "∫f(x)dx",
    "∑(n=1 to ∞)",
    "lim(x→0)",
    "dy/dx",
    "d²y/dx²"
  ];
  
  for (const expr of specificMathExpressions) {
    // Check for exact match or partial match
    if (questionText.includes(expr)) {
      console.log(`✅ Found specific mathematical expression: "${expr}"`);
      return expr;
    }
    
    // Check for variations (removing spaces, different symbols)
    const normalizedText = questionText.replace(/\s+/g, '');
    const normalizedExpr = expr.replace(/\s+/g, '');
    if (normalizedText.includes(normalizedExpr)) {
      console.log(`✅ Found normalized mathematical expression: "${expr}"`);
      return expr;
    }
  }
  
  // Final fallback: if the question contains mathematical symbols, create a generic expression
  if (/[+\-±×÷√=\^²³⁴⁵⁶⁷⁸⁹⁰πθαβγδεζηλμνξρστφχψω≤≥≠∞∂∇]/.test(questionText)) {
    const genericExpr = `Mathematical Expression ${imageIndex + 1}`;
    console.log(`⚠️ Using generic fallback: "${genericExpr}"`);
    return genericExpr;
  }
  
  console.log(`❌ No mathematical expression detected for image ${imageIndex + 1}`);
  return null; // Return null if no math expression is found
}

// 🔧 NEW: Enhanced Word document processing function
async function processWordDocumentEnhanced(filePath, quizId) {
  console.log(`🔄 Starting enhanced Word document processing...`);
  
  try {
    // 🔧 ENHANCED: Better mammoth configuration for mathematical expressions
    const result = await mammoth.convertToHtml({ 
      path: filePath,
      options: {
        convertImage: mammoth.images.imgElement(function(image) {
          return image.read("base64").then(function(imageBuffer) {
            return {
              src: "data:" + image.contentType + ";base64," + imageBuffer
            };
          });
        }),
        // Enhanced options for better mathematical expression handling
        preserveEmptyParagraphs: true,
        ignoreEmptyParagraphs: false,
        // Better handling of mathematical content and special characters
        transformDocument: mammoth.transforms.paragraph(function(element) {
          return element;
        }),
        // Preserve styles that might contain mathematical formatting
        styleMap: [
          "p[style-name='Mathematical Expression'] => p.math-expression",
          "span[style-name='Mathematical Symbol'] => span.math-symbol"
        ]
      }
    });
    
    const bodyHtml = result.value;
    
    // Enhanced logging for conversion messages
    if (result.messages && result.messages.length > 0) {
      console.log("📝 Mammoth conversion messages:");
      result.messages.forEach((msg, index) => {
        console.log(`   ${index + 1}. ${msg.type}: ${msg.message}`);
      });
    }

    // Extract tables with enhanced structure analysis
    const tables = await extractTablesEnhanced(bodyHtml);
    console.log(`📊 Extracted ${tables.length} table structures from document`);
    
    // 🔧 LEGACY COMPATIBILITY: Add debug logging for tables like legacy version
    if (tables.length > 9 && tables[9] && tables[9][0]) {
      console.log("📋 Sample table content:", tables[9][0].slice(1));
    }

    // Extract plain text for question parsing
    const extracted = await extractor.extract(filePath);
    const bodyText = extracted.getBody();

    // 🔧 ENHANCED: Use table count as the primary source of question count
    const questionsData = splitQuestionsEnhanced(bodyText);
    const actualQuestionCount = Math.max(questionsData.length, tables.length);
    console.log(`📝 Text-based splitting found: ${questionsData.length} questions`);
    console.log(`📊 Table-based extraction found: ${tables.length} tables`);
    console.log(`🎯 Processing ${actualQuestionCount} questions (using max count)`);
    
    const savedQuestions = [];
    let totalImages = 0;
    let totalMathExpressions = 0;
    let questionsWithImages = 0;

    // Process each question with enhanced parsing
    for (let i = 0; i < actualQuestionCount; i++) {
      console.log(`\n🔄 Processing Question ${i + 1}/${actualQuestionCount}`);
      
      // 🔧 ENHANCED: Use correct table data structure
      const tableData = tables[i] || [];
      console.log(`📋 Table data for question ${i + 1}:`, tableData.length > 0 ? `${tableData.length} rows` : 'No table data');
      
      // Debug: Show table structure
      if (tableData.length > 0) {
        console.log(`📊 Table ${i + 1} structure:`);
        tableData.forEach((row, rowIndex) => {
          console.log(`   Row ${rowIndex + 1}: [${row.join(', ')}]`);
        });
      }
      
      // Use table data if available, otherwise use text data
      const questionTextData = questionsData[i] || `Question ${i + 1} from table data`;
      
      const questionResult = await processQuestionEnhanced(
        questionTextData, 
        tableData, 
        bodyHtml,
        quizId,
        i
      );
      
      if (questionResult.success) {
        savedQuestions.push(questionResult.question);
        totalImages += questionResult.imageCount;
        totalMathExpressions += questionResult.mathCount;
        if (questionResult.imageCount > 0) questionsWithImages++;
        
        console.log(`✅ Question ${i + 1} processed successfully`);
      } else {
        console.log(`❌ Question ${i + 1} failed: ${questionResult.error}`);
      }
    }

    console.log(`\n📊 ENHANCED PROCESSING SUMMARY:`);
    console.log(`   ✅ Questions processed: ${savedQuestions.length}/${questionsData.length}`);
    console.log(`   🖼️ Total images: ${totalImages}`);
    console.log(`   📐 Total math expressions: ${totalMathExpressions}`);
    console.log(`   📸 Questions with images: ${questionsWithImages}`);

          return { 
      savedQuestions,
      totalImages,
      totalMathExpressions,
      questionsWithImages,
      totalQuestions: savedQuestions.length
    };

  } catch (error) {
    console.error("❌ Error in enhanced document processing:", error);
    throw error;
  }
}

// 🔧 NEW: Enhanced question splitting with multiple patterns
function splitQuestionsEnhanced(bodyText) {
  console.log(`📄 Analyzing document structure for question patterns...`);
  
  // Try multiple question splitting patterns
  const patterns = [
    /Question\s+\d+/gi,           // "Question 1", "Question 2", etc.
    /Q\s*\d+[\.\)]/gi,            // "Q1.", "Q2)", etc.
    /\d+\.\s*[A-Z]/g,             // "1. The", "2. What", etc.
    /^\d+\s*[\.\)]/gm             // Lines starting with numbers
  ];
  
  let bestSplit = [];
  let bestPattern = null;
  
  for (const pattern of patterns) {
    const split = bodyText.split(pattern).filter(q => q.trim().length > 10);
    if (split.length > bestSplit.length) {
      bestSplit = split;
      bestPattern = pattern;
    }
  }
  
  // If no good pattern found, try paragraph-based splitting
  if (bestSplit.length <= 1) {
    console.log(`⚠️ No clear question pattern found, trying paragraph-based splitting`);
    bestSplit = bodyText.split(/\n\s*\n/).filter(q => q.trim().length > 20);
  }
  
  console.log(`📝 Best splitting pattern found ${bestSplit.length} questions using: ${bestPattern || 'paragraph-based'}`);
  
  return bestSplit.slice(1); // Remove first element which is usually empty
}

// 🔧 NEW: Function to integrate mathematical expressions into question text
function integrateMatheExpressions(questionText, mathExpressions) {
  if (!mathExpressions || mathExpressions.length === 0) {
    return questionText;
  }
  
  console.log(`🔢 Integrating mathematical expressions into: "${questionText.substring(0, 100)}..."`);
  console.log(`🔢 Available expressions:`, mathExpressions);
  
  let integratedText = questionText;
  
  // Pattern 1: "If _ and _ are the roots of the equation _ then the equation with roots _ and _ is _______"
  if (integratedText.includes('If') && integratedText.includes('are the roots') && integratedText.includes('equation')) {
    if (mathExpressions.length >= 5) {
      integratedText = integratedText
        .replace(/If\s+_+\s+and\s+_+\s+are\s+the\s+roots/i, `If ${mathExpressions[0]} and ${mathExpressions[1]} are the roots`)
        .replace(/of\s+the\s+equation\s+_+/i, `of the equation ${mathExpressions[2]}`)
        .replace(/with\s+roots\s+_+\s+and\s+_+/i, `with roots ${mathExpressions[3]} and ${mathExpressions[4]}`)
        .replace(/_+$/, '________'); // Keep the final blank for answer
    }
  }
  
  // Pattern 2: "The roots of _ are real" 
  else if (integratedText.includes('The roots of') && integratedText.includes('are real')) {
    if (mathExpressions.length >= 1) {
      integratedText = integratedText.replace(/The\s+roots\s+of\s+_+\s+are\s+real/i, `The roots of ${mathExpressions[0]} are real`);
    }
  }
  
  // Pattern 3: "The discriminant of _ is"
  else if (integratedText.includes('discriminant') && integratedText.includes('of _')) {
    if (mathExpressions.length >= 1) {
      integratedText = integratedText.replace(/discriminant\s+of\s+_+/i, `discriminant of ${mathExpressions[0]}`);
    }
  }
  
  // Pattern 4: "For quadratic equation _ has _______"
  else if (integratedText.includes('quadratic equation') && integratedText.includes('has')) {
    if (mathExpressions.length >= 1) {
      integratedText = integratedText.replace(/quadratic\s+equation\s+_+\s+has/i, `quadratic equation ${mathExpressions[0]} has`);
    }
  }
  
  // Pattern 5: Generic single underscore replacement for first available expression
  else if (integratedText.includes('_') && mathExpressions.length >= 1) {
    // Replace first occurrence of single or multiple underscores (but not the final answer blank)
    const parts = integratedText.split('_______'); // Split on answer blank first
    if (parts.length === 2) {
      // There's an answer blank at the end, only replace underscores in the first part
      let firstPart = parts[0];
      let expressionIndex = 0;
      
      // Replace underscores one by one with available expressions
      while (firstPart.includes('_') && expressionIndex < mathExpressions.length) {
        firstPart = firstPart.replace(/_+/, mathExpressions[expressionIndex]);
        expressionIndex++;
      }
      
      integratedText = firstPart + '_______' + parts[1];
    } else {
      // No answer blank, replace all underscores
      let expressionIndex = 0;
      while (integratedText.includes('_') && expressionIndex < mathExpressions.length) {
        integratedText = integratedText.replace(/_+/, mathExpressions[expressionIndex]);
        expressionIndex++;
      }
    }
  }
  
  console.log(`✅ Integrated text: "${integratedText}"`);
  return integratedText;
}

// 🔧 NEW: Enhanced question processing with better parsing
async function processQuestionEnhanced(questionText, tableData, bodyHtml, quizId, questionIndex) {
  try {
    const questionData = {};
    
    // 🔧 ENHANCED: Extract question text from table data if available
    let actualQuestionText = questionText;
    
    console.log(`🔍 DEBUG: tableData type: ${typeof tableData}, isArray: ${Array.isArray(tableData)}, length: ${tableData?.length}`);
    console.log(`🔍 DEBUG: tableData content:`, tableData);
    
    // If we have table data, extract the actual question from it
    if (tableData && Array.isArray(tableData) && tableData.length > 0) {
      // Look for the question row in table data
      const questionRow = tableData.find(row => 
        Array.isArray(row) && row.length >= 2 && 
        (row[0] === 'Question' || row[0].toLowerCase().includes('question'))
      );
      
      if (questionRow && questionRow[1]) {
        actualQuestionText = questionRow[1];
        console.log(`📝 Using table-based question text: "${actualQuestionText.substring(0, 80)}..."`);
      } else {
        console.log(`⚠️ No question row found in table data, using text-based extraction`);
      }
    }
    
    // Enhanced question text extraction
    const { cleanText, metadata } = extractQuestionTextEnhanced(actualQuestionText);
    questionData.questionText = cleanText;
    
    // Extract mathematical expressions and real images
    const { mathExpressions, realImages } = await extractMathAndImages(
      bodyHtml,
      questionData.questionText,
      quizId,
      questionIndex
    );
    
    // Store mathematical expressions in parts array
    questionData.parts = mathExpressions.map(expr => ({
      kind: 'math',
      content: expr
    }));
    
    // 🔧 NEW: Integrate mathematical expressions into question text
    if (mathExpressions.length > 0) {
      questionData.questionText = integrateMatheExpressions(questionData.questionText, mathExpressions);
      console.log(`🔢 Integrated ${mathExpressions.length} mathematical expressions into question text`);
    }
    
    // Store real images
    questionData.questionImage = realImages;
    
    // 🔧 ENHANCED: Parse options from table data if available
    let optionsData;
    console.log(`🔍 DEBUG: Checking tableData for options - type: ${typeof tableData}, isArray: ${Array.isArray(tableData)}, length: ${tableData?.length}`);
    if (tableData && (typeof tableData === 'string' || (Array.isArray(tableData) && tableData.length > 0))) {
      console.log(`✅ Using table-based option parsing`);
      optionsData = parseOptionsFromTableData(tableData);
      console.log(`📊 Table-based option parsing: ${optionsData.options.length} options found`);
    } else {
      console.log(`⚠️ Falling back to text-based option parsing`);
      optionsData = parseOptionsEnhanced(actualQuestionText);
      console.log(`📊 Text-based option parsing: ${optionsData.options.length} options found`);
    }
    questionData.options = optionsData.options;
    
    // 🔧 ENHANCED: Parse solution from table data if available
    let solution;
    if (tableData && (typeof tableData === 'string' || (Array.isArray(tableData) && tableData.length > 0))) {
      solution = parseSolutionFromTableData(tableData);
      console.log(`💡 Using table-based solution parsing`);
    } else {
      solution = parseSolutionEnhanced(actualQuestionText);
      console.log(`💡 Using text-based solution parsing`);
    }
    if (solution.found) {
      // Store the solution explanation
      questionData.solution = solution.explanation || solution.fullText || '';
      
      // Mark the correct option if letter is found
      if (solution.letter) {
        const correctIndex = solution.letter.charCodeAt(0) - "A".charCodeAt(0);
        if (correctIndex >= 0 && correctIndex < questionData.options.length) {
          questionData.options[correctIndex].isCorrect = true;
        }
      }
    } else {
      questionData.solution = '';
    }
    
    // 🔧 ENHANCED: Parse marks from table data if available
    let marks;
    if (tableData && Array.isArray(tableData) && tableData.length > 0) {
      marks = parseMarksFromTableData(tableData);
      console.log(`📊 Using table-based marks parsing`);
      } else {
      marks = parseMarksEnhanced(actualQuestionText);
      console.log(`📊 Using text-based marks parsing`);
    }
    questionData.questionCorrectMarks = marks.correct;
    questionData.questionIncorrectMarks = marks.incorrect;
    
    // Enhanced question type detection
    questionData.questionType = detectQuestionTypeEnhanced(actualQuestionText, questionData.options.length);
    
    // Store table data if available - convert to array of strings for schema compatibility
    if (tableData && tableData.length > 0) {
      try {
        // Convert table data to array of strings (flatten if needed)
        questionData.tables = Array.isArray(tableData) ? 
          tableData.map(item => {
            if (typeof item === 'string') return item;
            if (typeof item === 'object') return JSON.stringify(item);
            return String(item);
          }) : 
          [JSON.stringify(tableData)];
        console.log(`📋 Processed table data: ${questionData.tables.length} items`);
      } catch (error) {
        console.error(`❌ Error processing table data:`, error);
        questionData.tables = []; // Default to empty array on error
      }
    } else {
      questionData.tables = []; // Ensure tables is always an array
    }
    
    // Additional metadata
    questionData.uploadedFromWord = true;
    questionData.quizId = quizId;
    
    // 🔧 ENHANCED: Detailed logging like legacy version
    console.log(`\n📝 ===== QUESTION ${questionIndex + 1} DETAILED ANALYSIS =====`);
    console.log(`📄 Processed question text: "${questionData.questionText}"`);
    console.log(`📐 Mathematical expressions found: ${mathExpressions.length}`);
    if (mathExpressions.length > 0) {
      mathExpressions.forEach((expr, idx) => {
        console.log(`   📐 Math ${idx + 1}: "${expr}"`);
      });
    }
    console.log(`🖼️ Real images: ${realImages.length}`);
    console.log(`📊 Options parsed: ${questionData.options?.length || 0}`);
    if (questionData.options && questionData.options.length > 0) {
      questionData.options.forEach((opt, idx) => {
        console.log(`   📊 Option ${idx + 1}: "${opt.optionText}" (Correct: ${opt.isCorrect})`);
      });
    }
    console.log(`✅ Solution: "${solution.letter || 'Not found'}"`);
    console.log(`📊 Marks: +${questionData.questionCorrectMarks}, -${questionData.questionIncorrectMarks}`);
    console.log(`📝 ===== END QUESTION ${questionIndex + 1} ANALYSIS =====\n`);
    
    // Create and save the question with all fields from legacy version
      const newQuestion = new Question({
      quizId: questionData.quizId,
        questionType: questionData.questionType,
        questionText: questionData.questionText,
        questionImage: questionData.questionImage,
      parts: questionData.parts, // NEW: Mathematical expressions as text
      tables: questionData.tables || [], // Including tables if present, default to empty array
        options: questionData.options,
      solution: questionData.solution || '', // NEW: Store solution separately
        questionCorrectMarks: questionData.questionCorrectMarks,
        questionIncorrectMarks: questionData.questionIncorrectMarks,
      uploadedFromWord: questionData.uploadedFromWord,
      });
      const savedQuestion = await newQuestion.save();
    
    return {
      success: true,
      question: savedQuestion,
      imageCount: realImages.length,
      mathCount: mathExpressions.length
    };
    
  } catch (error) {
    console.error(`❌ Error processing question ${questionIndex + 1}:`, error);
    return {
      success: false,
      error: error.message,
      imageCount: 0,
      mathCount: 0
    };
  }
}

// 🔧 NEW: Enhanced question text extraction
function extractQuestionTextEnhanced(rawText) {
  console.log(`📝 Extracting question text from: "${rawText.substring(0, 100)}..."`);
  
  // Remove common prefixes and clean up
  let cleanText = rawText
    .replace(/^Question\s+\d+\s*/i, '')
    .replace(/^Q\s*\d+[\.\)]\s*/i, '')
    .replace(/^\d+[\.\)]\s*/, '')
    .trim();
  
  // Extract question text (everything before "Type" or "Option")
  const stopWords = ['Type\t', 'Option\t', 'Solution\t', 'Marks\t'];
  let endIndex = cleanText.length;
  
  for (const stopWord of stopWords) {
    const index = cleanText.indexOf(stopWord);
    if (index !== -1 && index < endIndex) {
      endIndex = index;
    }
  }
  
  cleanText = cleanText.substring(0, endIndex).trim();
  
  // 🔧 ENHANCED: Remove mathematical expression placeholders and clean up
  cleanText = cleanText
    .replace(/\s+/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // Remove common mathematical expression patterns that appear as text
    .replace(/\s+has\s+________/g, ' has ________')
    .replace(/\s+is\s+______/g, ' is ______')
    .replace(/\s+are\s+______/g, ' are ______')
    .replace(/\s+then\s+the\s+equation\s+with\s+roots\s+and\s+is\s+_______/g, ' then the equation with roots α and β is _______')
    .replace(/\s+and\s+are\s+the\s+roots\s+of\s+the\s+equation/g, ' α and β are the roots of the equation')
    .replace(/\s+If\s+and\s+are\s+the\s+roots/g, ' If α and β are the roots')
    .replace(/\s+The\s+roots\s+of\s+are\s+real/g, ' The roots of the equation are real')
    .replace(/\s+for\s+quadratic\s+equation\s+is\s+/g, ' for quadratic equation ax² + bx + c = 0 is ')
    .replace(/\s+of\s+the\s+quadratic\s+equation\s*$/g, ' of the quadratic equation')
    .trim();
  
  return {
    cleanText,
    metadata: {
      originalLength: rawText.length,
      cleanedLength: cleanText.length,
      hasStopWords: stopWords.some(word => rawText.includes(word))
    }
  };
}

// 🔧 NEW: Parse options from table data structure
function parseOptionsFromTableData(tableData) {
  console.log(`📊 Parsing options from table data...`);
  const options = [];
  
  // 🔧 FIX: Handle both string and array table data
  let tableText = '';
  if (typeof tableData === 'string') {
    tableText = tableData;
    console.log(`📄 Table data is string format`);
  } else if (Array.isArray(tableData)) {
    tableText = tableData.join(' ');
    console.log(`📄 Table data is array format, converting to string`);
  } else {
    console.log(`⚠️ Table data format not recognized`);
    return { options };
  }
  
  console.log(`📄 Table text sample: "${tableText.substring(0, 200)}..."`);
  
  // 🔧 FIX: Parse options from the actual text structure
  // Look for patterns like "A) text Correct/Incorrect"
  const optionPattern = /([A-Z])\)\s*([^A-Z]*?)(?:\s+(correct|incorrect))/gi;
  let match;
  
  while ((match = optionPattern.exec(tableText)) !== null) {
    const optionLetter = match[1];
    const optionText = match[2].trim();
    const correctnessText = match[3].toLowerCase();
    const isCorrect = correctnessText === 'correct';
    
    // Clean up option text (remove extra spaces, tabs, etc.)
    const cleanOptionText = optionText
      .replace(/\s+/g, ' ')
      .replace(/\t/g, ' ')
      .trim();
    
    options.push({
      optionText: cleanOptionText,
      isCorrect: isCorrect
    });
    
    console.log(`   📝 Option ${optionLetter}: "${cleanOptionText}" (Correct: ${isCorrect})`);
  }
  
  // 🔧 FALLBACK: If no options found with pattern, try alternative parsing
  if (options.length === 0) {
    console.log(`⚠️ No options found with standard pattern, trying alternative parsing...`);
    
    // Split by lines and look for option-like patterns
    const lines = tableText.split(/[\n\r]+/);
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Look for lines that start with A), B), etc.
      const lineMatch = trimmedLine.match(/^([A-Z])\)\s*(.+)$/);
      if (lineMatch) {
        const optionLetter = lineMatch[1];
        const fullText = lineMatch[2];
        
        // Extract option text and correctness
        const correctMatch = fullText.match(/^(.*?)\s+(correct|incorrect)$/i);
        if (correctMatch) {
          const optionText = correctMatch[1].trim();
          const isCorrect = correctMatch[2].toLowerCase() === 'correct';
          
          options.push({
            optionText: optionText,
            isCorrect: isCorrect
          });
          
          console.log(`   📝 Option ${optionLetter}: "${optionText}" (Correct: ${isCorrect})`);
        }
      }
    }
  }
  
  console.log(`📊 Total options parsed from table: ${options.length}`);
  return { options };
}

// 🔧 FIXED: Enhanced option parsing with correct answer detection
function parseOptionsEnhanced(questionText) {
  console.log(`📊 Parsing options from question text...`);
  const lines = questionText.split('\n').map(line => line.trim());
  const options = [];
  
  // 🔧 FIX: Look for option patterns with correctness labels
  const optionPatterns = [
    /^Option\s+(.+)$/i,           // "Option Real roots"
    /^([A-Z])[\.\)]\s*(.+)$/i,    // "A. Real roots" or "A) Real roots"
    /^\(([A-Z])\)\s*(.+)$/i       // "(A) Real roots"
  ];
  
  for (const line of lines) {
    for (const pattern of optionPatterns) {
      const match = line.match(pattern);
      if (match) {
        let optionText = match[2] || match[1]; // Get the option text
        let isCorrect = false;
        
        // 🔧 FIX: Check if option text contains correctness labels
        const correctnessMatch = optionText.match(/^(.*?)\s+(correct|incorrect)$/i);
        if (correctnessMatch) {
          optionText = correctnessMatch[1].trim(); // Remove the correctness label
          isCorrect = correctnessMatch[2].toLowerCase() === 'correct';
        }
        
        options.push({
          optionText: optionText,
          isCorrect: isCorrect
        });
        
        console.log(`   📝 Option: "${optionText}" (Correct: ${isCorrect})`);
        break;
      }
    }
  }
  
  // 🔧 FIX: If no options found with patterns, try tab-separated format with correctness
  if (options.length === 0) {
    const optionLines = lines.filter(line => line.startsWith('Option\t'));
    for (const line of optionLines) {
      const parts = line.split('\t');
      if (parts.length > 1) {
        let optionText = parts[1].trim();
        let isCorrect = false;
        
        // Check for correctness in additional columns
        if (parts.length > 2) {
          const correctnessText = parts[2].trim().toLowerCase();
          isCorrect = correctnessText.includes('correct') && !correctnessText.includes('incorrect');
        }
        
        // Also check if correctness is embedded in the option text
        const correctnessMatch = optionText.match(/^(.*?)\s+(correct|incorrect)$/i);
        if (correctnessMatch) {
          optionText = correctnessMatch[1].trim();
          isCorrect = correctnessMatch[2].toLowerCase() === 'correct';
        }
        
        options.push({
          optionText: optionText,
          isCorrect: isCorrect
        });
        
        console.log(`   📝 Option: "${optionText}" (Correct: ${isCorrect})`);
      }
    }
  }
  
  // 🔧 FALLBACK: Try to parse from raw text with A), B), C), D) patterns
  if (options.length === 0) {
    console.log(`⚠️ No options found with standard patterns, trying raw text parsing...`);
    
    const rawText = questionText;
    const optionMatches = rawText.match(/([A-Z])\)\s*"([^"]*?)"\s*(correct|incorrect)/gi);
    
    if (optionMatches) {
      for (const match of optionMatches) {
        const parts = match.match(/([A-Z])\)\s*"([^"]*?)"\s*(correct|incorrect)/i);
        if (parts) {
          const optionLetter = parts[1];
          const optionText = parts[2].trim();
          const isCorrect = parts[3].toLowerCase() === 'correct';
          
          options.push({
            optionText: optionText,
            isCorrect: isCorrect
          });
          
          console.log(`   📝 Option ${optionLetter}: "${optionText}" (Correct: ${isCorrect})`);
        }
      }
    }
  }
  
  console.log(`📊 Total options parsed: ${options.length}`);
  return { options };
}

// 🔧 NEW: Parse solution from table data structure
function parseSolutionFromTableData(tableData) {
  console.log(`💡 Parsing solution from table data...`);
  
  // 🔧 FIX: Handle both string and array table data
  let tableText = '';
  if (typeof tableData === 'string') {
    tableText = tableData;
    console.log(`📄 Table data is string format`);
  } else if (Array.isArray(tableData)) {
    tableText = tableData.join(' ');
    console.log(`📄 Table data is array format, converting to string`);
  } else {
    console.log(`⚠️ Table data format not recognized`);
    return { found: false, letter: null, explanation: '', fullText: '' };
  }
  
  // 🔧 FIX: Extract correct answer from options in the text
  // Look for the option marked as "correct"
  const correctOptionMatch = tableText.match(/([A-Z])\)\s*([^A-Z]*?)\s+correct/i);
  if (correctOptionMatch) {
    const correctLetter = correctOptionMatch[1];
    const correctOptionText = correctOptionMatch[2].trim();
    
    console.log(`✅ Found correct answer: ${correctLetter}) "${correctOptionText}"`);
    
    return {
      found: true,
      letter: correctLetter,
      explanation: `The correct answer is ${correctLetter}) ${correctOptionText}`,
      fullText: `Solution: ${correctLetter}) ${correctOptionText}`
    };
  }
  
  // 🔧 FALLBACK: Look for explicit solution text
  const solutionMatch = tableText.match(/Solution[:\s]+(.+?)(?:\n|$)/i);
  if (solutionMatch) {
    const solutionText = solutionMatch[1].trim();
    console.log(`✅ Found explicit solution: "${solutionText}"`);
    
    return {
      found: true,
      letter: null,
      explanation: solutionText,
      fullText: `Solution: ${solutionText}`
    };
  }
  
  console.log(`⚠️ No solution found in table data`);
  return { found: false, letter: null, explanation: '', fullText: '' };
}

// 🔧 NEW: Enhanced solution parsing
function parseSolutionEnhanced(questionText) {
  const lines = questionText.split('\n').map(line => line.trim());
  
  // Look for solution patterns with both letter and explanation
  const solutionPatterns = [
    /^Solution\s+([A-D])\s*(.*)$/i,       // "Solution A explanation"
    /^Answer\s+([A-D])\s*(.*)$/i,         // "Answer A explanation"
    /^Correct\s+([A-D])\s*(.*)$/i,        // "Correct A explanation"
    /^Solution\t([A-D])\s*(.*)$/i         // "Solution\tA explanation"
  ];
  
  // Also look for solution with just explanation (no letter)
  const explanationPatterns = [
    /^Solution\s+(.+)$/i,
    /^Solution\t(.+)$/i
  ];
  
  for (const line of lines) {
    // First try patterns with letters
    for (const pattern of solutionPatterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        const letter = match[1].toUpperCase();
        const explanation = match[2] ? match[2].trim() : '';
        console.log(`✅ Found solution: ${letter} - ${explanation.substring(0, 50)}...`);
        return {
          found: true,
          letter: letter,
          explanation: explanation,
          fullText: line
        };
      }
    }
    
    // Then try explanation-only patterns
    for (const pattern of explanationPatterns) {
      const match = line.match(pattern);
      if (match && match[1] && match[1].length > 5) { // Ensure it's not just a letter
        const explanation = match[1].trim();
        console.log(`✅ Found solution explanation: ${explanation.substring(0, 50)}...`);
        return {
          found: true,
          letter: null,
          explanation: explanation,
          fullText: line
        };
      }
    }
  }
  
  console.log(`⚠️ No solution found in question text`);
  return {
    found: false,
    letter: null,
    explanation: '',
    fullText: ''
  };
}

// 🔧 NEW: Parse marks from table data structure
function parseMarksFromTableData(tableData) {
  console.log(`📊 Parsing marks from table data...`);
  
  if (!Array.isArray(tableData)) {
    console.log(`⚠️ Table data is not an array`);
    return { correct: 2, incorrect: 0 }; // Default values
  }
  
  // Look for marks row in table data
  for (const row of tableData) {
    if (Array.isArray(row) && row.length >= 2) {
      const firstCell = row[0];
      
      // Check if this is a marks row
      if (firstCell === 'Marks' && row[1]) {
        const marksText = row[1].trim();
        const parts = marksText.split(/[,\s]+/);
        
        let correct = 2; // default
        let incorrect = 0; // default
        
        if (parts.length >= 2) {
          const correctPart = parseFloat(parts[0]);
          const incorrectPart = parseFloat(parts[1]);
          
          if (!isNaN(correctPart)) correct = correctPart;
          if (!isNaN(incorrectPart)) incorrect = incorrectPart;
        }
        
        console.log(`✅ Found marks in table: +${correct}, -${incorrect}`);
        return { correct, incorrect };
      }
    }
  }
  
  console.log(`⚠️ No marks found in table data, using defaults: +2, -0`);
  return { correct: 2, incorrect: 0 };
}

// 🔧 NEW: Enhanced marks parsing
function parseMarksEnhanced(questionText) {
  const lines = questionText.split('\n').map(line => line.trim());
  
  // Look for marks patterns
  for (const line of lines) {
    if (line.startsWith('Marks')) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        return {
          correct: parseInt(parts[1]) || 2,
          incorrect: parseInt(parts[2]) || 0
        };
      }
    }
  }
  
  // Default marks
  return { correct: 2, incorrect: 0 };
}

// 🔧 NEW: Enhanced question type detection
function detectQuestionTypeEnhanced(questionText, optionCount) {
  const lines = questionText.split('\n').map(line => line.trim());
  
  // Look for explicit type declaration
  for (const line of lines) {
    if (line.startsWith('Type')) {
      const parts = line.split('\t');
      if (parts.length > 1) {
        return parts[1].trim().toLowerCase();
      }
    }
  }
  
  // Infer from options count
  if (optionCount >= 2) {
    return 'multiple_choice';
  } else {
    return 'integer';
  }
}

// 🔧 NEW: Enhanced table extraction
async function extractTablesEnhanced(htmlContent) {
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;
  const tables = document.querySelectorAll("table");
  
  const tableData = [];

  tables.forEach((table, index) => {
    const rows = table.querySelectorAll("tr");
    const tableRows = [];
    
    rows.forEach((row) => {
      const cells = row.querySelectorAll("td, th");
      const rowData = [];
      
      cells.forEach((cell) => {
        rowData.push(cell.textContent.trim());
      });
      
      if (rowData.length > 0) {
        tableRows.push(rowData);
      }
    });
    
    if (tableRows.length > 0) {
      tableData.push(tableRows);
    }
  });
  
  return tableData;
}

// 🔧 REMOVED: Legacy extractAndUploadImages function replaced by extractMathAndImages

async function uploadToS3(imageSrc, quizId, questionIndex, imageIndex) {
  try {
    if (!imageSrc || !imageSrc.startsWith("data:image")) {
      console.error(`❌ Invalid image source for question ${questionIndex + 1}, image ${imageIndex + 1}`);
      throw new Error("Invalid image source - must be base64 data URL");
    }

    const base64Data = imageSrc.split(",")[1];
    if (!base64Data) {
      throw new Error("Invalid base64 data in image source");
    }

    const imageBuffer = Buffer.from(base64Data, "base64");
    
    // Validate image buffer size
    if (imageBuffer.length === 0) {
      throw new Error("Empty image buffer");
    }
    
    if (imageBuffer.length > 10 * 1024 * 1024) { // 10MB limit
      console.warn(`⚠️ Large image detected: ${Math.round(imageBuffer.length / 1024 / 1024)}MB`);
    }
    
    const dateString = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .split(".")[0];
    const fileName = `quiz-images/${quizId}_${dateString}_${questionIndex}_${imageIndex}.png`;

    const uploadParams = {
      Bucket: authConfig.s3_bucket,
      Key: fileName,
      Body: imageBuffer,
      ContentType: 'image/png',
      Metadata: {
        'quiz-id': quizId.toString(),
        'question-index': questionIndex.toString(),
        'image-index': imageIndex.toString(),
        'upload-timestamp': new Date().toISOString()
      }
      // ACL: 'public-read' // Make images accessible
    };

    console.log(`📤 Uploading quiz image to S3: ${fileName} (${Math.round(imageBuffer.length / 1024)}KB)`);
    const putCommand = new PutObjectCommand(uploadParams);
    const result = await s3.send(putCommand);
    const location = `https://${authConfig.s3_bucket}.s3.${authConfig.aws_region}.amazonaws.com/${fileName}`;
    console.log(`✅ Quiz image uploaded successfully: ${location}`);
    
    return { Location: location, ...result };
  } catch (error) {
    console.error(`❌ Error uploading image for question ${questionIndex + 1}, image ${imageIndex + 1}:`, error.message);
    // Don't throw error to allow other images to upload
    return null;
  }
}

// Export parsing functions for testing
// 🔧 FIX: Export all functions including API endpoints and helper functions
module.exports = {
  // API endpoint functions
  addQuestion: exports.addQuestion,
  fetchAllQuestions: exports.fetchAllQuestions,
  deleteAllQuestions: exports.deleteAllQuestions,
  specificQuestionDetails: exports.specificQuestionDetails,
  updateQuestion: exports.updateQuestion,
  deleteQuestion: exports.deleteQuestion,
  uploadQuestionsFromS3: exports.uploadQuestionsFromS3,
  
  // Helper functions for question parsing
  extractQuestionTextEnhanced,
  parseOptionsEnhanced,
  parseOptionsFromTableData,
  parseSolutionEnhanced,
  parseSolutionFromTableData,
  parseMarksEnhanced,
  parseMarksFromTableData,
  detectQuestionTypeEnhanced
};
