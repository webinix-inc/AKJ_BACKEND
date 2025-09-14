const fs = require('fs');
const path = require('path');

// Sample document content with proper formatting
const SAMPLE_DOCUMENT_CONTENT = `Question 1
Solve the quadratic equation: x² - 5x + 6 = 0

Option	A) x = 2, x = 3	Correct
Option	B) x = 1, x = 6	Incorrect
Option	C) x = -2, x = -3	Incorrect
Option	D) x = 0, x = 5	Incorrect

Question 2
Find the derivative of f(x) = 3x³ - 2x² + 5x - 1

Option	A) f'(x) = 9x² - 4x + 5	Correct
Option	B) f'(x) = 6x² - 2x + 5	Incorrect
Option	C) f'(x) = 9x² - 4x + 1	Incorrect
Option	D) f'(x) = 3x² - 4x + 5	Incorrect

Question 3
Evaluate the integral: ∫(2x + 3)dx

Option	A) x² + 3x + C	Correct
Option	B) 2x² + 3x + C	Incorrect
Option	C) x² + 6x + C	Incorrect
Option	D) 2x + 3x + C	Incorrect

Question 4
If sin(θ) = 3/5 and θ is in the first quadrant, find cos(θ)

Option	A) 4/5	Correct
Option	B) 3/4	Incorrect
Option	C) 5/4	Incorrect
Option	D) 5/3	Incorrect

Question 5
Find the limit: lim(x→0) (sin(x)/x)

Option	A) 1	Correct
Option	B) 0	Incorrect
Option	C) ∞	Incorrect
Option	D) undefined	Incorrect

INSTRUCTIONS FOR USE:
====================

1. QUESTION FORMAT:
   - Start each question with "Question [number]"
   - Write the question text on the next line
   - Leave a blank line after the question text

2. OPTION FORMAT:
   - Each option must start with "Option" followed by a TAB character
   - Format: Option[TAB]A) option text[TAB]Correct/Incorrect
   - Use exactly one TAB character between each part
   - Mark only ONE option as "Correct" per question
   - Mark all other options as "Incorrect"

3. MATHEMATICAL EXPRESSIONS:
   - Use standard mathematical notation
   - Supported symbols: x², x³, ∫, √, θ, π, ∞, ±, ≤, ≥
   - For fractions, use format: 3/5, 4/7, etc.
   - For equations, use format: x² + 2x - 3 = 0
   - For derivatives, use format: f'(x) = 3x² + 2x
   - For integrals, use format: ∫(2x + 3)dx

4. IMPORTANT NOTES:
   - Save the file as .docx format
   - Do not change the tab structure
   - Each question must have exactly 4 options (A, B, C, D)
   - Only one option should be marked as "Correct"
   - Question numbering should be sequential (1, 2, 3, ...)

5. EXAMPLE STRUCTURE:
   Question 1
   Your question text here with mathematical expressions like x² + 5x = 0
   
   Option[TAB]A) First option text[TAB]Incorrect
   Option[TAB]B) Second option text[TAB]Correct
   Option[TAB]C) Third option text[TAB]Incorrect
   Option[TAB]D) Fourth option text[TAB]Incorrect

Replace these sample questions with your own content following the same format.`;

/**
 * Download sample document for question upload format
 */
exports.downloadSampleDocument = async (req, res) => {
  try {
    console.log('📥 Sample document download requested');
    
    // Set headers for file download
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="sample-math-questions-template.txt"');
    res.setHeader('Cache-Control', 'no-cache');
    
    // Send the sample content
    res.status(200).send(SAMPLE_DOCUMENT_CONTENT);
    
    console.log('✅ Sample document sent successfully');
    
  } catch (error) {
    console.error('❌ Error serving sample document:', error);
    res.status(500).json({
      message: 'Failed to download sample document',
      error: error.message
    });
  }
};

/**
 * Get sample document info (for frontend to display before download)
 */
exports.getSampleDocumentInfo = async (req, res) => {
  try {
    console.log('📊 Sample document info requested');
    
    // Analyze the sample content
    const lines = SAMPLE_DOCUMENT_CONTENT.split('\n');
    const questionCount = lines.filter(line => line.startsWith('Question ')).length;
    const optionCount = lines.filter(line => line.startsWith('Option\t')).length;
    
    // Extract mathematical expressions
    const mathExpressions = [];
    lines.forEach(line => {
      const mathPatterns = [
        /x²[^a-zA-Z]*/g,
        /x³[^a-zA-Z]*/g,
        /f'\([^)]+\)/g,
        /∫[^a-zA-Z]*/g,
        /sin\([^)]+\)/g,
        /cos\([^)]+\)/g,
        /lim\([^)]+\)/g
      ];
      
      mathPatterns.forEach(pattern => {
        const matches = line.match(pattern);
        if (matches) {
          mathExpressions.push(...matches.map(match => match.trim()));
        }
      });
    });
    
    const uniqueMathExpressions = [...new Set(mathExpressions)];
    
    const info = {
      fileName: 'sample-math-questions-template.txt',
      description: 'Sample template for uploading mathematical questions with proper formatting',
      questionCount: questionCount,
      optionCount: optionCount,
      mathExpressions: uniqueMathExpressions.length,
      fileSize: Buffer.byteLength(SAMPLE_DOCUMENT_CONTENT, 'utf8'),
      format: 'Tab-separated text file (.txt)',
      instructions: [
        'Download this template file',
        'Copy content to Microsoft Word',
        'Save as .docx format',
        'Replace sample questions with your own',
        'Maintain exact tab structure',
        'Upload through admin panel'
      ],
      features: [
        'Quadratic equations',
        'Calculus (derivatives, integrals, limits)',
        'Trigonometry',
        'Mathematical notation support',
        'Proper option formatting',
        'Correct answer marking'
      ],
      supportedMathSymbols: [
        'x², x³ (superscripts)',
        '∫ (integral)',
        '√ (square root)',
        'θ, π (Greek letters)',
        '∞ (infinity)',
        '±, ≤, ≥ (operators)'
      ]
    };
    
    res.status(200).json({
      message: 'Sample document information',
      info: info
    });
    
    console.log('✅ Sample document info sent successfully');
    
  } catch (error) {
    console.error('❌ Error getting sample document info:', error);
    res.status(500).json({
      message: 'Failed to get sample document information',
      error: error.message
    });
  }
};

/**
 * Validate uploaded document format (helper function)
 */
exports.validateDocumentFormat = (documentContent) => {
  const lines = documentContent.split('\n');
  const validation = {
    isValid: true,
    errors: [],
    warnings: [],
    questionCount: 0,
    optionCount: 0
  };
  
  let currentQuestion = 0;
  let optionsForCurrentQuestion = 0;
  let hasCorrectAnswer = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check question format
    if (line.startsWith('Question ')) {
      // Validate previous question if exists
      if (currentQuestion > 0) {
        if (optionsForCurrentQuestion !== 4) {
          validation.errors.push(`Question ${currentQuestion}: Expected 4 options, found ${optionsForCurrentQuestion}`);
          validation.isValid = false;
        }
        if (!hasCorrectAnswer) {
          validation.errors.push(`Question ${currentQuestion}: No correct answer marked`);
          validation.isValid = false;
        }
      }
      
      currentQuestion++;
      optionsForCurrentQuestion = 0;
      hasCorrectAnswer = false;
      validation.questionCount++;
    }
    
    // Check option format
    if (line.startsWith('Option\t')) {
      const parts = line.split('\t');
      if (parts.length !== 3) {
        validation.errors.push(`Line ${i + 1}: Invalid option format. Expected: Option[TAB]A) text[TAB]Correct/Incorrect`);
        validation.isValid = false;
      } else {
        optionsForCurrentQuestion++;
        validation.optionCount++;
        
        const correctness = parts[2].trim().toLowerCase();
        if (correctness === 'correct') {
          if (hasCorrectAnswer) {
            validation.errors.push(`Question ${currentQuestion}: Multiple correct answers found`);
            validation.isValid = false;
          }
          hasCorrectAnswer = true;
        } else if (correctness !== 'incorrect') {
          validation.errors.push(`Line ${i + 1}: Invalid correctness value. Use "Correct" or "Incorrect"`);
          validation.isValid = false;
        }
      }
    }
  }
  
  // Validate last question
  if (currentQuestion > 0) {
    if (optionsForCurrentQuestion !== 4) {
      validation.errors.push(`Question ${currentQuestion}: Expected 4 options, found ${optionsForCurrentQuestion}`);
      validation.isValid = false;
    }
    if (!hasCorrectAnswer) {
      validation.errors.push(`Question ${currentQuestion}: No correct answer marked`);
      validation.isValid = false;
    }
  }
  
  // Add warnings for best practices
  if (validation.questionCount === 0) {
    validation.errors.push('No questions found in document');
    validation.isValid = false;
  }
  
  if (validation.questionCount < 5) {
    validation.warnings.push(`Only ${validation.questionCount} questions found. Consider adding more for a comprehensive test.`);
  }
  
  return validation;
};
