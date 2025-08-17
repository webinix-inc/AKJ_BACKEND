const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const tmp = require('tmp');
const Question = require('../models/questionModel');
const Quiz = require('../models/quizModel');

/**
 * 🔧 DOCX to LaTeX Import Controller
 * Extracts Word equations (OMML) as LaTeX, not images
 * Stores mixed text/math content in parts array for KaTeX rendering
 */

const importDocxToQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    const file = req.file;

    console.log('📄 Starting DOCX import for quiz:', quizId);

    // 1. Validate quizId and file
    if (!quizId) {
      return res.status(400).json({
        success: false,
        message: 'Quiz ID is required'
      });
    }

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Validate file type
    if (!file.originalname.toLowerCase().endsWith('.docx')) {
      return res.status(400).json({
        success: false,
        message: 'Only .docx files are allowed'
      });
    }

    // Verify quiz exists
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    console.log('✅ File validation passed:', file.originalname);

    // 2. Save buffer to temp file
    const tempDir = tmp.dirSync({ unsafeCleanup: true });
    const inputPath = path.join(tempDir.name, 'input.docx');
    const outputPath = path.join(tempDir.name, 'output.tex');

    fs.writeFileSync(inputPath, file.buffer);
    console.log('📁 Temp files created:', { inputPath, outputPath });

    // 3. Run pandoc to convert DOCX → LaTeX
    const latexContent = await convertDocxToLatex(inputPath, outputPath);
    console.log('🔄 LaTeX conversion completed, length:', latexContent.length);

    // 4. Process LaTeX content into questions
    const questions = await processLatexToQuestions(latexContent, quizId);
    console.log('📝 Processed questions:', questions.length);

    // 5. Save questions to database
    const createdQuestions = await Question.insertMany(questions);
    const createdQuestionIds = createdQuestions.map(q => q._id);

    console.log('✅ Questions saved to database:', createdQuestionIds.length);

    // 6. Cleanup temp files
    tempDir.removeCallback();

    return res.status(201).json({
      success: true,
      message: `Successfully imported ${createdQuestionIds.length} questions from DOCX`,
      data: {
        createdQuestionIds,
        totalQuestions: createdQuestionIds.length,
        quizId
      }
    });

  } catch (error) {
    console.error('❌ Error in DOCX import:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to import DOCX file',
      error: error.message
    });
  }
};

/**
 * Convert DOCX to LaTeX using pandoc
 */
const convertDocxToLatex = (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    console.log('🔄 Running pandoc conversion...');
    
    // pandoc "<in.docx>" -f docx -t latex --wrap=none -o "<out.tex>"
    const pandoc = spawn('pandoc', [
      inputPath,
      '-f', 'docx',
      '-t', 'latex',
      '--wrap=none',
      '-o', outputPath
    ]);

    let stderr = '';

    pandoc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pandoc.on('close', (code) => {
      if (code !== 0) {
        console.error('❌ Pandoc error:', stderr);
        reject(new Error(`Pandoc conversion failed with code ${code}: ${stderr}`));
        return;
      }

      try {
        const latexContent = fs.readFileSync(outputPath, 'utf8');
        console.log('✅ Pandoc conversion successful');
        resolve(latexContent);
      } catch (readError) {
        reject(new Error(`Failed to read LaTeX output: ${readError.message}`));
      }
    });

    pandoc.on('error', (error) => {
      console.error('❌ Pandoc spawn error:', error);
      reject(new Error(`Failed to start pandoc: ${error.message}`));
    });
  });
};

/**
 * Process LaTeX content into questions with parts array
 */
const processLatexToQuestions = async (latexContent, quizId) => {
  console.log('🔍 Processing LaTeX content into questions...');

  // Split into questions using heuristic markers
  const questionStart = /(^|\n)\s*(Q\s*\.?\s*\d+|Q\d+|\(?\d+\)|\d+\.)\s+/i;
  const questionBlocks = latexContent.split(questionStart).filter(block => block.trim());

  console.log('📊 Found question blocks:', questionBlocks.length);

  const questions = [];

  for (let i = 0; i < questionBlocks.length; i++) {
    const block = questionBlocks[i].trim();
    if (!block) continue;

    // Skip question markers themselves
    if (questionStart.test(block)) continue;

    console.log(`🔍 Processing question block ${i + 1}:`, block.substring(0, 100) + '...');

    // Split block into text and math parts
    const parts = splitTextAndMath(block);
    
    if (parts.length === 0) continue;

    // Create question object
    const question = {
      quizId,
      questionType: 'mcq', // Default type
      questionText: block.substring(0, 500), // Keep original for compatibility
      questionCorrectMarks: 1, // Default marks
      questionIncorrectMarks: 0,
      uploadedFromWord: true,
      parts: parts,
      options: [] // Will be populated if options are detected
    };

    // Try to extract options from the text
    const extractedOptions = extractOptionsFromText(block);
    if (extractedOptions.length > 0) {
      question.options = extractedOptions;
    }

    questions.push(question);
    console.log(`✅ Question ${i + 1} processed with ${parts.length} parts`);
  }

  return questions;
};

/**
 * Split text into math and text parts using the specified regex
 */
const splitTextAndMath = (text) => {
  // Use the exact regex specified: /(\\\[([\s\S]*?)\\\])|(\$\$([\s\S]*?)\$\$)|(\\\(([\s\S]*?)\\\))/g
  const mathRegex = /(\\\[([\s\S]*?)\\\])|(\$\$([\s\S]*?)\$\$)|(\\\(([\s\S]*?)\\\))/g;
  
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = mathRegex.exec(text)) !== null) {
    // Add text before math
    if (match.index > lastIndex) {
      const textContent = text.substring(lastIndex, match.index).trim();
      if (textContent) {
        parts.push({
          kind: 'text',
          content: textContent
        });
      }
    }

    // Add math content
    const mathContent = match[2] || match[4] || match[6]; // Extract content from capture groups
    if (mathContent) {
      parts.push({
        kind: 'math',
        content: mathContent.trim()
      });
    }

    lastIndex = mathRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const textContent = text.substring(lastIndex).trim();
    if (textContent) {
      parts.push({
        kind: 'text',
        content: textContent
      });
    }
  }

  // If no math was found, treat entire text as text part
  if (parts.length === 0 && text.trim()) {
    parts.push({
      kind: 'text',
      content: text.trim()
    });
  }

  return parts;
};

/**
 * Extract multiple choice options from text
 */
const extractOptionsFromText = (text) => {
  const optionRegex = /(?:^|\n)\s*([A-D])\)\s*(.+?)(?=\n\s*[A-D]\)|$)/gi;
  const options = [];
  let match;

  while ((match = optionRegex.exec(text)) !== null) {
    options.push({
      optionText: match[2].trim(),
      isCorrect: false // Default, can be enhanced later
    });
  }

  return options;
};

module.exports = {
  importDocxToQuiz
};
