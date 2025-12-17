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
const QuizFolder = require("../models/quizFolder");

// Configure S3 instead of Cloudinary
const s3 = new S3Client({
  region: authConfig.aws_region,
  credentials: {
    accessKeyId: authConfig.aws_access_key_id,
    secretAccessKey: authConfig.aws_secret_access_key,
  },
});

console.log("✅ Using S3 for quiz image uploads instead of Cloudinary");

// Helper function to upload image to S3 with proper path structure
async function uploadQuestionImageToS3(imageSrc, folderName, testName, imageName) {
  try {
    if (!imageSrc || !imageSrc.startsWith("data:image")) {
      throw new Error("Invalid image source - must be base64 data URL");
    }

    const base64Data = imageSrc.split(",")[1];
    if (!base64Data) {
      throw new Error("Invalid base64 data in image source");
    }

    const imageBuffer = Buffer.from(base64Data, "base64");
    
    if (imageBuffer.length === 0) {
      throw new Error("Empty image buffer");
    }
    
    if (imageBuffer.length > 10 * 1024 * 1024) { // 10MB limit
      console.warn(`⚠️ Large image detected: ${Math.round(imageBuffer.length / 1024 / 1024)}MB`);
    }
    
    // Sanitize folder name, test name, and image name
    const sanitizeName = (name) => name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const sanitizedFolderName = sanitizeName(folderName);
    const sanitizedTestName = sanitizeName(testName);
    const sanitizedImageName = sanitizeName(imageName);
    
    // Extract file extension from image data URL or default to png
    const mimeMatch = imageSrc.match(/data:image\/(\w+);base64/);
    const extension = mimeMatch ? mimeMatch[1] : 'png';
    const fileName = `test/${sanitizedFolderName}/${sanitizedTestName}/${sanitizedImageName}.${extension}`;

    const uploadParams = {
      Bucket: authConfig.s3_bucket,
      Key: fileName,
      Body: imageBuffer,
      ContentType: `image/${extension}`,
      Metadata: {
        'folder-name': folderName,
        'test-name': testName,
        'image-name': imageName,
        'upload-timestamp': new Date().toISOString()
      }
    };

    console.log(`📤 Uploading question image to S3: ${fileName} (${Math.round(imageBuffer.length / 1024)}KB)`);
    const putCommand = new PutObjectCommand(uploadParams);
    const result = await s3.send(putCommand);
    const location = `https://${authConfig.s3_bucket}.s3.${authConfig.aws_region}.amazonaws.com/${fileName}`;
    console.log(`✅ Question image uploaded successfully: ${location}`);
    
    // Return the S3 key (fileName) instead of full URL so presigned URLs can be generated later
    return fileName;
  } catch (error) {
    console.error(`❌ Error uploading question image:`, error.message);
    throw error;
  }
}

exports.addQuestion = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { questionText, options, questionCorrectMarks, questionIncorrectMarks, questionImage, questionType, solution } = req.body;

    // Validate quizId
    if (!quizId) {
      return res.status(400).json({ error: "Quiz ID is required" });
    }

    // Validate questionText - allow HTML content, check if it has actual content
    // Strip HTML tags to check for actual text content
    const stripHtml = (html) => {
      if (!html) return '';
      return html.replace(/<[^>]*>/g, '').trim();
    };
    
    const hasQuestionText = questionText && typeof questionText === 'string' && stripHtml(questionText).length > 0;
    const hasQuestionImage = questionImage && Array.isArray(questionImage) && questionImage.length > 0;
    
    // Question must have either text or image
    if (!hasQuestionText && !hasQuestionImage) {
      return res.status(400).json({ 
        error: "Question must have either text or image",
        details: {
          hasText: !!questionText,
          textLength: questionText ? questionText.length : 0,
          hasImage: hasQuestionImage
        }
      });
    }

    // Validate options
    if (!options || !Array.isArray(options) || options.length !== 4) {
      return res.status(400).json({ error: "Exactly 4 options are required" });
    }

    // Validate that at least one option has content (text or image)
    const hasValidOptions = options.some(opt => {
      const hasOptionText = opt.optionText && opt.optionText.trim().length > 0;
      const hasOptionImage = opt.optionImage && Array.isArray(opt.optionImage) && opt.optionImage.length > 0;
      return hasOptionText || hasOptionImage;
    });

    if (!hasValidOptions) {
      return res.status(400).json({ error: "At least one option must have text or image" });
    }

    // Validate marks
    if (!questionCorrectMarks || typeof questionCorrectMarks !== 'number' || questionCorrectMarks <= 0) {
      return res.status(400).json({ error: "Valid question marks (greater than 0) are required" });
    }

    // Get quiz and folder information
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    // Find the folder that contains this quiz
    const folder = await QuizFolder.findOne({ quizzes: quizId });
    if (!folder) {
      return res.status(404).json({ message: "Folder not found for this quiz" });
    }

    const folderName = folder.name;
    const testName = quiz.quizName;

    // Check for duplicate question
    const existingQuestion = await Question.findOne({
      quizId,
      questionText,
    }).lean();

    if (existingQuestion) {
      return res
        .status(400)
        .json({ message: "This question already exists in the quiz" });
    }

    // Upload question images if provided
    let uploadedQuestionImages = [];
    if (questionImage && Array.isArray(questionImage) && questionImage.length > 0) {
      for (let i = 0; i < questionImage.length; i++) {
        const imageData = questionImage[i];
        if (imageData && imageData.src && imageData.name) {
          try {
            const imageUrl = await uploadQuestionImageToS3(
              imageData.src,
              folderName,
              testName,
              imageData.name
            );
            uploadedQuestionImages.push(imageUrl);
          } catch (error) {
            console.error(`Error uploading question image ${i + 1}:`, error);
            // Continue with other images even if one fails
          }
        }
      }
    }

    // Process options and upload option images
    const processedOptions = [];
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      const processedOption = {
        optionText: option.optionText || "",
        isCorrect: option.isCorrect || false,
        optionImage: []
      };

      // Upload option images if provided
      if (option.optionImage && Array.isArray(option.optionImage) && option.optionImage.length > 0) {
        for (let j = 0; j < option.optionImage.length; j++) {
          const imageData = option.optionImage[j];
          if (imageData && imageData.src && imageData.name) {
            try {
              const imageName = `option_${String.fromCharCode(65 + i)}_${imageData.name}`;
              const imageUrl = await uploadQuestionImageToS3(
                imageData.src,
                folderName,
                testName,
                imageName
              );
              processedOption.optionImage.push(imageUrl);
            } catch (error) {
              console.error(`Error uploading option ${i + 1} image ${j + 1}:`, error);
              // Continue with other images even if one fails
            }
          }
        }
      }

      processedOptions.push(processedOption);
    }

    // Create question with default questionType as 'mcq' if not provided
    const newQuestion = new Question({
      quizId,
      questionType: questionType || 'mcq',
      questionText,
      questionImage: uploadedQuestionImages,
      options: processedOptions,
      questionCorrectMarks: questionCorrectMarks || 2,
      questionIncorrectMarks: questionIncorrectMarks || 0,
      solution: solution || '',
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
    const { generatePresignedUrl } = require('../configs/aws.config');
    const authConfig = require('../configs/auth.config');
    
    const questions = await Question.find({ quizId }).lean();
    
    // Generate presigned URLs for question images and option images
    for (let question of questions) {
      // Process question images
      if (question.questionImage && Array.isArray(question.questionImage) && question.questionImage.length > 0) {
        const presignedQuestionImages = [];
        for (let imageUrl of question.questionImage) {
          if (imageUrl) {
            try {
              // Extract S3 key from URL
              let s3Key = imageUrl;
              
              // If it's a full S3 URL, extract the key
              if (imageUrl.includes('amazonaws.com/')) {
                const urlParts = imageUrl.split('amazonaws.com/');
                if (urlParts.length > 1) {
                  s3Key = urlParts[1];
                  // Remove query parameters if any
                  if (s3Key.includes('?')) {
                    s3Key = s3Key.split('?')[0];
                  }
                }
              } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                // Handle other URL formats - extract path after domain
                try {
                  const url = new URL(imageUrl);
                  s3Key = url.pathname.substring(1); // Remove leading '/'
                } catch (e) {
                  // If URL parsing fails, assume it's already a key
                  s3Key = imageUrl;
                }
              }
              
              // Decode URL encoding if present
              s3Key = decodeURIComponent(s3Key);
              
              console.log(`🔗 Generating presigned URL for question image: ${s3Key.substring(0, 50)}...`);
              const presignedUrl = await generatePresignedUrl(authConfig.s3_bucket, s3Key, 86400); // 24 hours
              presignedQuestionImages.push(presignedUrl);
            } catch (error) {
              console.error('❌ Error generating presigned URL for question image:', error);
              console.error('   Image URL:', imageUrl?.substring(0, 100));
              presignedQuestionImages.push(imageUrl); // Fallback to original URL
            }
          }
        }
        question.questionImage = presignedQuestionImages;
      }
      
      // Process option images
      if (question.options && Array.isArray(question.options)) {
        for (let option of question.options) {
          if (option.optionImage && Array.isArray(option.optionImage) && option.optionImage.length > 0) {
            const presignedOptionImages = [];
            for (let imageUrl of option.optionImage) {
              if (imageUrl) {
                try {
                  // Extract S3 key from URL
                  let s3Key = imageUrl;
                  
                  // If it's a full S3 URL, extract the key
                  if (imageUrl.includes('amazonaws.com/')) {
                    const urlParts = imageUrl.split('amazonaws.com/');
                    if (urlParts.length > 1) {
                      s3Key = urlParts[1];
                      // Remove query parameters if any
                      if (s3Key.includes('?')) {
                        s3Key = s3Key.split('?')[0];
                      }
                    }
                  } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
                    // Handle other URL formats - extract path after domain
                    try {
                      const url = new URL(imageUrl);
                      s3Key = url.pathname.substring(1); // Remove leading '/'
                    } catch (e) {
                      // If URL parsing fails, assume it's already a key
                      s3Key = imageUrl;
                    }
                  }
                  
                  // Decode URL encoding if present
                  s3Key = decodeURIComponent(s3Key);
                  
                  console.log(`🔗 Generating presigned URL for option image: ${s3Key.substring(0, 50)}...`);
                  const presignedUrl = await generatePresignedUrl(authConfig.s3_bucket, s3Key, 86400); // 24 hours
                  presignedOptionImages.push(presignedUrl);
                } catch (error) {
                  console.error('❌ Error generating presigned URL for option image:', error);
                  console.error('   Image URL:', imageUrl?.substring(0, 100));
                  presignedOptionImages.push(imageUrl); // Fallback to original URL
                }
              }
            }
            option.optionImage = presignedOptionImages;
          }
        }
      }
    }
    
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
    const { questionId, quizId } = req.params;
    const { questionText, questionType, questionImage, options, solution, questionCorrectMarks, questionIncorrectMarks } = req.body;
    
    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }

    // Get quiz and folder information for image uploads
    const quiz = await Quiz.findById(quizId || question.quizId);
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    const folder = await QuizFolder.findOne({ quizzes: quizId || question.quizId });
    if (!folder) {
      return res.status(404).json({ message: "Folder not found for this quiz" });
    }

    const folderName = folder.name;
    const testName = quiz.quizName;

    const updateFields = {};

    // Update basic fields
    if (questionText !== undefined) updateFields.questionText = questionText;
    if (questionType !== undefined) updateFields.questionType = questionType;
    if (solution !== undefined) updateFields.solution = solution;
    if (questionCorrectMarks !== undefined) updateFields.questionCorrectMarks = questionCorrectMarks;
    if (questionIncorrectMarks !== undefined) updateFields.questionIncorrectMarks = questionIncorrectMarks;

    // Process question images
    if (questionImage !== undefined && Array.isArray(questionImage)) {
      const uploadedQuestionImages = [];
      
      for (let i = 0; i < questionImage.length; i++) {
        const imageData = questionImage[i];
        
        if (typeof imageData === 'string') {
          // Existing URL - check if it's a base64 data URL
          if (imageData.startsWith('data:image')) {
            // New image to upload
            const imageName = `question_img_${Date.now()}_${i}`;
            try {
              const uploadedUrl = await uploadQuestionImageToS3(imageData, folderName, testName, imageName);
              if (uploadedUrl) {
                uploadedQuestionImages.push(uploadedUrl);
              }
            } catch (error) {
              console.error(`Error uploading question image ${i}:`, error);
            }
          } else {
            // Existing S3 URL, keep it
            uploadedQuestionImages.push(imageData);
          }
        } else if (imageData && imageData.src) {
          // Object with src property
          if (imageData.src.startsWith('data:image')) {
            // New image to upload
            const imageName = imageData.name || `question_img_${Date.now()}_${i}`;
            try {
              const uploadedUrl = await uploadQuestionImageToS3(imageData.src, folderName, testName, imageName);
              if (uploadedUrl) {
                uploadedQuestionImages.push(uploadedUrl);
              }
            } catch (error) {
              console.error(`Error uploading question image ${i}:`, error);
            }
          } else {
            // Existing URL
            uploadedQuestionImages.push(imageData.src);
          }
        }
      }
      
      updateFields.questionImage = uploadedQuestionImages;
    }

    // Process options
    if (options !== undefined && Array.isArray(options)) {
      // Ensure we have exactly 4 options
      if (options.length !== 4) {
        return res.status(400).json({ message: "Must have exactly 4 options" });
      }

      const processedOptions = [];
      
      for (let i = 0; i < options.length; i++) {
        const option = options[i];
        const processedOption = {
          optionText: option.optionText || "",
          isCorrect: option.isCorrect || false,
          optionImage: []
        };

        // Process option images
        if (option.optionImage && Array.isArray(option.optionImage)) {
          for (let j = 0; j < option.optionImage.length; j++) {
            const imageData = option.optionImage[j];
            
            if (typeof imageData === 'string') {
              // Existing URL - check if it's a base64 data URL
              if (imageData.startsWith('data:image')) {
                // New image to upload
                const imageName = `option_${String.fromCharCode(65 + i)}_img_${Date.now()}_${j}`;
                try {
                  const uploadedUrl = await uploadQuestionImageToS3(imageData, folderName, testName, imageName);
                  if (uploadedUrl) {
                    processedOption.optionImage.push(uploadedUrl);
                  }
                } catch (error) {
                  console.error(`Error uploading option ${i} image ${j}:`, error);
                }
              } else {
                // Existing S3 URL, keep it
                processedOption.optionImage.push(imageData);
              }
            } else if (imageData && imageData.src) {
              // Object with src property
              if (imageData.src.startsWith('data:image')) {
                // New image to upload
                const imageName = imageData.name || `option_${String.fromCharCode(65 + i)}_img_${Date.now()}_${j}`;
                try {
                  const uploadedUrl = await uploadQuestionImageToS3(imageData.src, folderName, testName, imageName);
                  if (uploadedUrl) {
                    processedOption.optionImage.push(uploadedUrl);
                  }
                } catch (error) {
                  console.error(`Error uploading option ${i} image ${j}:`, error);
                }
              } else {
                // Existing URL
                processedOption.optionImage.push(imageData.src);
              }
            }
          }
        }

        processedOptions.push(processedOption);
      }

      updateFields.options = processedOptions;
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
  
  console.log(`🖼️ Found ${realImagesForQuestion.length} images for question ${questionIndex + 1}`);
  
  // Get quiz and folder information for proper S3 path
  const quiz = await Quiz.findById(quizId);
  if (!quiz) {
    console.error(`❌ Quiz not found: ${quizId}`);
  }
  
  const folder = await QuizFolder.findOne({ quizzes: quizId });
  if (!folder) {
    console.error(`❌ Folder not found for quiz: ${quizId}`);
  }
  
  const folderName = folder?.name || 'default';
  const testName = quiz?.quizName || 'default';
  
      for (let i = 0; i < realImagesForQuestion.length; i++) {
        const imageData = realImagesForQuestion[i];
        try {
          if (!imageData.src || !imageData.src.startsWith('data:image')) {
            console.error(`❌ Invalid image source for question ${questionIndex + 1}, image ${i + 1}`);
            console.error(`   Source: ${imageData.src?.substring(0, 100)}...`);
            continue;
          }
          
          // Use the proper path structure: test/{folderName}/{testName}/{imageName}
          const imageName = `question_${questionIndex + 1}_img_${i + 1}_${Date.now()}`;
          console.log(`📤 Uploading image ${i + 1} for question ${questionIndex + 1}...`);
          console.log(`   Folder: ${folderName}, Test: ${testName}, Name: ${imageName}`);
          
          const imageUrl = await uploadQuestionImageToS3(imageData.src, folderName, testName, imageName);
          
          // uploadQuestionImageToS3 returns the S3 key (path), store it directly
          if (imageUrl) {
            questionRealImages.push(imageUrl);
            console.log(`✅ Real image ${i + 1} uploaded successfully: ${imageUrl}`);
          } else {
            console.error(`❌ Upload returned null/undefined for image ${i + 1}`);
          }
        } catch (uploadError) {
          console.error(`❌ Failed to upload real image ${i + 1} for question ${questionIndex + 1}:`, uploadError);
          console.error(`   Error message: ${uploadError.message}`);
          console.error(`   Image data length: ${imageData.src?.length || 0}`);
          console.error(`   Image data preview: ${imageData.src?.substring(0, 100)}...`);
        }
      }
      
      console.log(`📊 Question ${questionIndex + 1} image upload summary: ${questionRealImages.length}/${realImagesForQuestion.length} images uploaded`);
  
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
    
    let bodyHtml = result.value;
    
    // 🔧 NEW: Process OMath/equation objects that mammoth might have converted
    // Mammoth converts Word equations to MathML or special HTML, we need to extract them
    // Check for MathML elements and convert them to images or extract as text
    const $ = cheerio.load(bodyHtml);
    
    // Find all MathML elements (m:oMath, m:math, etc.)
    const mathElements = $('m\\:oMath, m\\:math, math, [class*="math"], [class*="equation"]');
    console.log(`🔢 Found ${mathElements.length} MathML/equation elements in document`);
    
    // Also check for elements that might contain equation data
    const potentialMathElements = $('span, p, div').filter(function() {
      const text = $(this).text();
      // Check if it contains mathematical symbols that suggest it's an equation
      return /[²³⁴⁵⁶⁷⁸⁹⁰√∑∫πθαβγδεζηλμνξρστφχψω≤≥≠∞∂∇±×÷\^]/.test(text) && 
             /[0-9]/.test(text) && 
             text.length < 100; // Equations are usually short
    });
    
    console.log(`🔢 Found ${potentialMathElements.length} potential equation text elements`);
    
    // Log the HTML structure to see what mammoth is producing
    if (mathElements.length > 0 || potentialMathElements.length > 0) {
      console.log(`📝 Sample HTML structure (first 500 chars): ${bodyHtml.substring(0, 500)}`);
      
      // Try to extract equation text from MathML or HTML
      mathElements.each((index, elem) => {
        const $elem = $(elem);
        const mathText = $elem.text().trim();
        const mathHtml = $elem.html() || '';
        console.log(`  📐 Math element ${index + 1}: "${mathText}" (HTML: ${mathHtml.substring(0, 100)})`);
      });
      
      potentialMathElements.each((index, elem) => {
        const $elem = $(elem);
        const mathText = $elem.text().trim();
        if (mathText.length > 0) {
          console.log(`  📐 Potential equation ${index + 1}: "${mathText}"`);
        }
      });
    }
    
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
    
    // 🔧 NEW: Log the plain text to see if equations are there
    console.log(`📄 Plain text extraction (first 1000 chars): "${bodyText.substring(0, 1000)}"`);
    
    // 🔧 NEW: Also check plain text for equations that might not be in HTML
    const plainTextEquations = [];
    const equationPatternsInText = [
      // Pattern for: 2x^2-√5x+1=0
      /([0-9]+[a-zA-Z]+\^?[0-9]*[+\-±×÷√][0-9]*[√]*[a-zA-Z]*[+\-±×÷√][0-9]*\s*=\s*[0-9]+)/g,
      // Pattern for: 2x²-√5x+1=0 (with superscript)
      /([0-9]+[a-zA-Z]+[²³⁴⁵⁶⁷⁸⁹⁰][+\-±×÷√][0-9]*[√]*[a-zA-Z]*[+\-±×÷√][0-9]*\s*=\s*[0-9]+)/g,
      // More flexible pattern
      /([0-9]*[a-zA-Z]*[\^²³⁴⁵⁶⁷⁸⁹⁰]*[+\-±×÷√][0-9]*[√]*[a-zA-Z]*[+\-±×÷√][0-9]*\s*=\s*[0-9]+)/g
    ];
    
    equationPatternsInText.forEach(pattern => {
      const matches = bodyText.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const cleanMatch = match.trim();
          if (cleanMatch.length > 0 && !plainTextEquations.includes(cleanMatch)) {
            plainTextEquations.push(cleanMatch);
            console.log(`📐 Found equation in plain text: "${cleanMatch}"`);
          }
        });
      }
    });
    
    // Store plain text equations for later use in question processing
    bodyHtml = bodyHtml + `<!-- PLAINTEXT_EQUATIONS: ${JSON.stringify(plainTextEquations)} -->`;

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
        i,
        bodyText // Pass plain text for equation extraction
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

// 🔧 NEW: Helper function to parse JSON stringified table data
function parseTableDataArray(tableData) {
  if (!tableData) return [];
  
  // If it's already an array of arrays, return as is
  if (Array.isArray(tableData) && tableData.length > 0) {
    // Check if first element is a string that looks like JSON
    if (typeof tableData[0] === 'string' && tableData[0].startsWith('[')) {
      // Parse JSON strings to arrays
      return tableData.map(item => {
        if (typeof item === 'string' && item.startsWith('[')) {
          try {
            return JSON.parse(item);
          } catch (e) {
            return item;
          }
        }
        return item;
      });
    }
    // If it's already array of arrays, return as is
    if (Array.isArray(tableData[0])) {
      return tableData;
    }
  }
  
  return [];
}

// 🔧 NEW: Enhanced question processing with better parsing
async function processQuestionEnhanced(questionText, tableData, bodyHtml, quizId, questionIndex, plainText = '') {
  try {
    const questionData = {};
    
    // 🔧 ENHANCED: Parse table data if it contains JSON strings
    const parsedTableData = parseTableDataArray(tableData);
    
    // 🔧 ENHANCED: Extract question text from table data if available
    let actualQuestionText = questionText;
    let questionTypeFromTable = null;
    
    console.log(`🔍 DEBUG: tableData type: ${typeof tableData}, isArray: ${Array.isArray(tableData)}, length: ${tableData?.length}`);
    console.log(`🔍 DEBUG: parsedTableData length: ${parsedTableData.length}`);
    
    // If we have parsed table data, extract the actual question from it
    if (parsedTableData && Array.isArray(parsedTableData) && parsedTableData.length > 0) {
      // Look for the question row in table data
      const questionRow = parsedTableData.find(row => 
        Array.isArray(row) && row.length >= 2 && 
        (row[0] === 'Question' || (typeof row[0] === 'string' && row[0].toLowerCase().includes('question')))
      );
      
      if (questionRow && questionRow[1]) {
        actualQuestionText = questionRow[1];
        console.log(`📝 Using table-based question text: "${actualQuestionText.substring(0, 80)}..."`);
      } else {
        console.log(`⚠️ No question row found in table data, using text-based extraction`);
      }
      
      // Extract question type from table data
      const typeRow = parsedTableData.find(row => 
        Array.isArray(row) && row.length >= 2 && 
        (row[0] === 'Type' || (typeof row[0] === 'string' && row[0].toLowerCase().includes('type')))
      );
      
      if (typeRow && typeRow[1]) {
        questionTypeFromTable = typeRow[1].toLowerCase().trim();
        console.log(`📝 Using table-based question type: "${questionTypeFromTable}"`);
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
    
    // 🔧 NEW: Also extract equation text directly from HTML
    // Word equations (OMath) might be converted to text that we need to capture
    const $ = cheerio.load(bodyHtml);
    const equationTexts = [];
    
    // Find the question table and cell
    const tables = $('table');
    if (tables.length > questionIndex) {
      const questionTable = $(tables[questionIndex]);
      const questionRow = questionTable.find('tr').filter(function() {
        return $(this).find('td, th').first().text().trim().toLowerCase() === 'question';
      });
      
      if (questionRow.length > 0) {
        const questionCell = questionRow.find('td, th').eq(1);
        const cellText = questionCell.text();
        const cellHtml = questionCell.html() || '';
        
        console.log(`🔍 Question cell text: "${cellText.substring(0, 200)}"`);
        console.log(`🔍 Question cell HTML preview: "${cellHtml.substring(0, 300)}"`);
        
        // Look for equation patterns in the cell text
        // Pattern: 2x^2-√5x+1=0 or 2x²-√5x+1=0 or similar
        const equationPatterns = [
          // Specific pattern for: 2x^2-√5x+1=0
          /([0-9]+[a-zA-Z]+\^?[0-9]+[+\-±×÷√][0-9]*[√]*[0-9]*[a-zA-Z]*[+\-±×÷√][0-9]+\s*=\s*[0-9]+)/g,
          // Pattern with superscript: 2x²-√5x+1=0
          /([0-9]+[a-zA-Z]+[²³⁴⁵⁶⁷⁸⁹⁰][+\-±×÷√][0-9]*[√]*[0-9]*[a-zA-Z]*[+\-±×÷√][0-9]+\s*=\s*[0-9]+)/g,
          // More general patterns
          /([0-9]+[a-zA-Z]*[\^²³⁴⁵⁶⁷⁸⁹⁰]*[+\-±×÷√][0-9]*[√]*[a-zA-Z]*[+\-±×÷√][0-9]+\s*=\s*[0-9]+)/g,
          /([0-9]*[a-zA-Z]*[\^²³⁴⁵⁶⁷⁸⁹⁰]*[+\-±×÷√][0-9]*[√]*[a-zA-Z]*[+\-±×÷√][0-9]*\s*=\s*[0-9]+)/g
        ];
        
        equationPatterns.forEach(pattern => {
          const matches = cellText.match(pattern);
          if (matches) {
            matches.forEach(match => {
              const cleanMatch = match.trim();
              if (cleanMatch.length > 0 && !equationTexts.includes(cleanMatch)) {
                equationTexts.push(cleanMatch);
                console.log(`📐 Found equation pattern in cell text: "${cleanMatch}"`);
              }
            });
          }
        });
        
        // 🔧 NEW: Also check the full HTML of the cell for equations that might be in spans or other elements
        // Sometimes equations are split across multiple elements
        const allCellText = questionCell.text(); // Get all text including nested elements
        const cellTextWithSpaces = allCellText.replace(/\s+/g, ' '); // Normalize spaces
        
        // Look for equations in normalized text
        equationPatterns.forEach(pattern => {
          const matches = cellTextWithSpaces.match(pattern);
          if (matches) {
            matches.forEach(match => {
              const cleanMatch = match.trim();
              if (cleanMatch.length > 0 && !equationTexts.includes(cleanMatch)) {
                equationTexts.push(cleanMatch);
                console.log(`📐 Found equation in normalized cell text: "${cleanMatch}"`);
              }
            });
          }
        });
        
        // 🔧 NEW: Extract equations from HTML comments (if we stored them from plain text)
        const htmlComments = cellHtml.match(/<!-- PLAINTEXT_EQUATIONS: (.*?) -->/);
        if (htmlComments && htmlComments[1]) {
          try {
            const storedEquations = JSON.parse(htmlComments[1]);
            storedEquations.forEach(eq => {
              if (!equationTexts.includes(eq)) {
                equationTexts.push(eq);
                console.log(`📐 Found equation from plain text storage: "${eq}"`);
              }
            });
          } catch (e) {
            console.error('Error parsing stored equations:', e);
          }
        }
        
        // Also check HTML for MathML or special equation elements
        const mathElements = questionCell.find('m\\:oMath, m\\:math, math, [class*="math"], [class*="equation"]');
        mathElements.each((idx, elem) => {
          const mathText = $(elem).text().trim();
          if (mathText && mathText.length > 0 && !equationTexts.includes(mathText)) {
            equationTexts.push(mathText);
            console.log(`📐 Found equation in MathML/HTML: "${mathText}"`);
          }
        });
      }
    }
    
    // 🔧 NEW: Also search in plain text for equations near this question
    if (plainText && plainText.length > 0) {
      // Try to find equations in the plain text that might be related to this question
      // Look for patterns like "2x^2-√5x+1=0" or "2x²-√5x+1=0"
      const plainTextEquationPatterns = [
        // Pattern for: 2x^2-√5x+1=0
        /([0-9]+[a-zA-Z]+\^?[0-9]+[+\-±×÷√][0-9]*[√]*[0-9]*[a-zA-Z]*[+\-±×÷√][0-9]+\s*=\s*[0-9]+)/g,
        // Pattern with superscript: 2x²-√5x+1=0
        /([0-9]+[a-zA-Z]+[²³⁴⁵⁶⁷⁸⁹⁰][+\-±×÷√][0-9]*[√]*[0-9]*[a-zA-Z]*[+\-±×÷√][0-9]+\s*=\s*[0-9]+)/g,
        // More flexible pattern
        /([0-9]+[a-zA-Z]*[\^²³⁴⁵⁶⁷⁸⁹⁰]*[+\-±×÷√][0-9]*[√]*[a-zA-Z]*[+\-±×÷√][0-9]+\s*=\s*[0-9]+)/g
      ];
      
      // Check if question text mentions "quadratic equation" - then look for equations nearby
      const questionTextLower = questionData.questionText.toLowerCase();
      if (questionTextLower.includes('quadratic equation') || questionTextLower.includes('equation')) {
        plainTextEquationPatterns.forEach(pattern => {
          const matches = plainText.match(pattern);
          if (matches) {
            matches.forEach(match => {
              const cleanMatch = match.trim();
              // Only add if it looks like a quadratic equation (has x^2 or x²)
              if (cleanMatch.match(/x[\^²]/) && !equationTexts.includes(cleanMatch)) {
                equationTexts.push(cleanMatch);
                console.log(`📐 Found equation in plain text: "${cleanMatch}"`);
              }
            });
          }
        });
      }
    }
    
    // Combine extracted equations with math expressions
    const allMathExpressions = [...mathExpressions];
    equationTexts.forEach(eq => {
      if (!allMathExpressions.includes(eq)) {
        allMathExpressions.push(eq);
        console.log(`✅ Added equation to math expressions: "${eq}"`);
      }
    });
    
    // Store mathematical expressions in parts array
    questionData.parts = allMathExpressions.map(expr => ({
      kind: 'math',
      content: expr
    }));
    
    // 🔧 NEW: Integrate mathematical expressions into question text
    if (allMathExpressions.length > 0) {
      questionData.questionText = integrateMatheExpressions(questionData.questionText, allMathExpressions);
      console.log(`🔢 Integrated ${allMathExpressions.length} mathematical expressions into question text`);
    }
    
    // Store real images
    questionData.questionImage = realImages;
    
    // 🔧 ENHANCED: Parse options from table data if available
    let optionsData;
    console.log(`🔍 DEBUG: Checking parsedTableData for options - length: ${parsedTableData?.length}`);
    if (parsedTableData && Array.isArray(parsedTableData) && parsedTableData.length > 0) {
      console.log(`✅ Using table-based option parsing`);
      optionsData = parseOptionsFromTableData(parsedTableData);
      console.log(`📊 Table-based option parsing: ${optionsData.options.length} options found`);
    } else {
      console.log(`⚠️ Falling back to text-based option parsing`);
      optionsData = parseOptionsEnhanced(actualQuestionText);
      console.log(`📊 Text-based option parsing: ${optionsData.options.length} options found`);
    }
    questionData.options = optionsData.options;
    
    // 🔧 ENHANCED: Parse solution from table data if available
    let solution;
    if (parsedTableData && Array.isArray(parsedTableData) && parsedTableData.length > 0) {
      solution = parseSolutionFromTableData(parsedTableData);
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
    if (parsedTableData && Array.isArray(parsedTableData) && parsedTableData.length > 0) {
      marks = parseMarksFromTableData(parsedTableData);
      console.log(`📊 Using table-based marks parsing`);
    } else {
      marks = parseMarksEnhanced(actualQuestionText);
      console.log(`📊 Using text-based marks parsing`);
    }
    questionData.questionCorrectMarks = marks.correct;
    questionData.questionIncorrectMarks = marks.incorrect;
    
    // Enhanced question type detection - use type from table if available
    if (questionTypeFromTable) {
      questionData.questionType = questionTypeFromTable;
      console.log(`📝 Using question type from table: "${questionTypeFromTable}"`);
    } else {
      questionData.questionType = detectQuestionTypeEnhanced(actualQuestionText, questionData.options.length);
      console.log(`📝 Detected question type: "${questionData.questionType}"`);
    }
    
    // Store table data if available - convert to array of strings for schema compatibility
    if (parsedTableData && parsedTableData.length > 0) {
      try {
        // Convert parsed table data to array of JSON strings for schema compatibility
        questionData.tables = parsedTableData.map(item => {
          if (typeof item === 'string') return item;
          if (Array.isArray(item)) return JSON.stringify(item);
          if (typeof item === 'object') return JSON.stringify(item);
          return String(item);
        });
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
  
  // 🔧 FIX: Handle parsed array structure where each row is ["Option", "text", "Correct/Incorrect"]
  if (Array.isArray(tableData)) {
    // Look for rows that start with "Option"
    const optionRows = tableData.filter(row => 
      Array.isArray(row) && row.length >= 2 && 
      (row[0] === 'Option' || (typeof row[0] === 'string' && row[0].toLowerCase().includes('option')))
    );
    
    console.log(`📊 Found ${optionRows.length} option rows in table data`);
    
    for (const row of optionRows) {
      if (row.length >= 3) {
        // Format: ["Option", "text", "Correct/Incorrect"]
        const optionText = row[1] || '';
        const correctnessText = (row[2] || '').toLowerCase().trim();
        const isCorrect = correctnessText === 'correct';
        
        if (optionText.trim()) {
          options.push({
            optionText: optionText.trim(),
            isCorrect: isCorrect,
            optionImage: []
          });
          
          console.log(`   📝 Option: "${optionText.trim()}" (Correct: ${isCorrect})`);
        }
      } else if (row.length === 2) {
        // Format: ["Option", "text"] - assume incorrect if no correctness specified
        const optionText = row[1] || '';
        if (optionText.trim()) {
          options.push({
            optionText: optionText.trim(),
            isCorrect: false,
            optionImage: []
          });
          
          console.log(`   📝 Option: "${optionText.trim()}" (Correct: false - default)`);
        }
      }
    }
  }
  
  // 🔧 FALLBACK: If no options found, try text-based parsing
  if (options.length === 0) {
    console.log(`⚠️ No options found in table structure, trying text-based parsing...`);
    
    let tableText = '';
    if (typeof tableData === 'string') {
      tableText = tableData;
    } else if (Array.isArray(tableData)) {
      tableText = tableData.map(row => Array.isArray(row) ? row.join(' ') : String(row)).join(' ');
    }
    
    // Look for patterns like "A) text Correct/Incorrect"
    const optionPattern = /([A-Z])\)\s*([^A-Z]*?)(?:\s+(correct|incorrect))/gi;
    let match;
    
    while ((match = optionPattern.exec(tableText)) !== null) {
      const optionText = match[2].trim();
      const correctnessText = match[3].toLowerCase();
      const isCorrect = correctnessText === 'correct';
      
      options.push({
        optionText: optionText,
        isCorrect: isCorrect,
        optionImage: []
      });
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
  
  // 🔧 FIX: Handle parsed array structure where solution row is ["Solution", "text"]
  if (Array.isArray(tableData)) {
    // Look for solution row
    const solutionRow = tableData.find(row => 
      Array.isArray(row) && row.length >= 2 && 
      (row[0] === 'Solution' || (typeof row[0] === 'string' && row[0].toLowerCase().includes('solution')))
    );
    
    if (solutionRow && solutionRow[1]) {
      const solutionText = solutionRow[1].trim();
      console.log(`✅ Found solution in table: "${solutionText}"`);
      
      // Also try to find the correct option from option rows
      const optionRows = tableData.filter(row => 
        Array.isArray(row) && row.length >= 3 && 
        (row[0] === 'Option' || (typeof row[0] === 'string' && row[0].toLowerCase().includes('option')))
      );
      
      let correctLetter = null;
      for (let i = 0; i < optionRows.length; i++) {
        const row = optionRows[i];
        if (row.length >= 3 && (row[2] || '').toLowerCase().trim() === 'correct') {
          correctLetter = String.fromCharCode(65 + i); // A, B, C, D
          break;
        }
      }
      
      return {
        found: true,
        letter: correctLetter,
        explanation: solutionText,
        fullText: solutionText
      };
    }
    
    // Fallback: Find correct option from option rows
    const optionRows = tableData.filter(row => 
      Array.isArray(row) && row.length >= 3 && 
      (row[0] === 'Option' || (typeof row[0] === 'string' && row[0].toLowerCase().includes('option')))
    );
    
    for (let i = 0; i < optionRows.length; i++) {
      const row = optionRows[i];
      if (row.length >= 3 && (row[2] || '').toLowerCase().trim() === 'correct') {
        const correctLetter = String.fromCharCode(65 + i);
        const correctOptionText = row[1] || '';
        console.log(`✅ Found correct answer from options: ${correctLetter}) "${correctOptionText}"`);
        
        return {
          found: true,
          letter: correctLetter,
          explanation: `The correct answer is ${correctLetter}) ${correctOptionText}`,
          fullText: `Solution: ${correctLetter}) ${correctOptionText}`
        };
      }
    }
  }
  
  // 🔧 FALLBACK: Text-based parsing
  let tableText = '';
  if (typeof tableData === 'string') {
    tableText = tableData;
  } else if (Array.isArray(tableData)) {
    tableText = tableData.map(row => Array.isArray(row) ? row.join(' ') : String(row)).join(' ');
  }
  
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
  
  // Look for marks row in table data - format: ["Marks", "2", "0"]
  for (const row of tableData) {
    if (Array.isArray(row) && row.length >= 2) {
      const firstCell = row[0];
      
      // Check if this is a marks row
      if ((firstCell === 'Marks' || (typeof firstCell === 'string' && firstCell.toLowerCase().includes('marks'))) && row.length >= 2) {
        let correct = 2; // default
        let incorrect = 0; // default
        
        // If row has 3 elements: ["Marks", "2", "0"]
        if (row.length >= 3) {
          const correctPart = parseFloat(row[1]);
          const incorrectPart = parseFloat(row[2]);
          
          if (!isNaN(correctPart)) correct = correctPart;
          if (!isNaN(incorrectPart)) incorrect = incorrectPart;
        } else if (row.length === 2) {
          // If row has 2 elements: ["Marks", "2 0"] or ["Marks", "2,0"]
          const marksText = String(row[1] || '').trim();
          const parts = marksText.split(/[,\s]+/);
          
          if (parts.length >= 2) {
            const correctPart = parseFloat(parts[0]);
            const incorrectPart = parseFloat(parts[1]);
            
            if (!isNaN(correctPart)) correct = correctPart;
            if (!isNaN(incorrectPart)) incorrect = incorrectPart;
          } else if (parts.length === 1) {
            const correctPart = parseFloat(parts[0]);
            if (!isNaN(correctPart)) correct = correctPart;
          }
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
