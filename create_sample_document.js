require('dotenv').config();
const fs = require('fs');
const path = require('path');

function createSampleWordDocument() {
  console.log('📄 CREATING SAMPLE WORD DOCUMENT FOR DOWNLOAD...\n');
  
  // Create sample content in the exact format expected by the system
  const sampleContent = `Question 1
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

6. SUPPORTED QUESTION TYPES:
   - Algebra: quadratic equations, linear equations, polynomials
   - Calculus: derivatives, integrals, limits
   - Trigonometry: sin, cos, tan functions
   - Geometry: area, volume, angles
   - Statistics: probability, mean, median

7. UPLOAD PROCESS:
   - After creating your document, save it as .docx
   - Use the "Upload Questions" button in the admin panel
   - Select your .docx file
   - The system will automatically parse and create questions
   - Review the uploaded questions in the admin interface

SAMPLE QUESTIONS INCLUDED:
- Question 1: Quadratic equation solving
- Question 2: Derivative calculation
- Question 3: Integration
- Question 4: Trigonometry
- Question 5: Limits

Replace these sample questions with your own content following the same format.`;

  // Create the sample file
  const sampleFilePath = path.join(__dirname, 'sample-math-questions.txt');
  
  try {
    fs.writeFileSync(sampleFilePath, sampleContent, 'utf8');
    console.log('✅ Sample document created successfully!');
    console.log(`📁 File location: ${sampleFilePath}`);
    console.log(`📄 File size: ${fs.statSync(sampleFilePath).size} bytes`);
    
    // Display the content structure
    console.log('\n📋 SAMPLE DOCUMENT STRUCTURE:');
    console.log('='.repeat(60));
    
    const lines = sampleContent.split('\n');
    let questionCount = 0;
    let optionCount = 0;
    let instructionLines = 0;
    
    lines.forEach(line => {
      if (line.startsWith('Question ')) {
        questionCount++;
      } else if (line.startsWith('Option\t')) {
        optionCount++;
      } else if (line.includes('INSTRUCTIONS') || line.includes('=====')) {
        instructionLines++;
      }
    });
    
    console.log(`📝 Sample questions: ${questionCount}`);
    console.log(`📊 Sample options: ${optionCount}`);
    console.log(`📋 Total lines: ${lines.length}`);
    console.log(`📖 Instruction sections: ${instructionLines}`);
    
    // Show format examples
    console.log('\n🔍 FORMAT EXAMPLES FROM SAMPLE:');
    console.log('='.repeat(60));
    
    const questionExample = lines.find(line => line.startsWith('Question '));
    const optionExample = lines.find(line => line.startsWith('Option\t'));
    
    if (questionExample) {
      console.log(`📝 Question format: "${questionExample}"`);
    }
    if (optionExample) {
      console.log(`📊 Option format: "${optionExample}"`);
    }
    
    // Mathematical expressions found
    console.log('\n🧮 MATHEMATICAL EXPRESSIONS IN SAMPLE:');
    console.log('='.repeat(60));
    
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
    console.log(`🔢 Mathematical expressions found: ${uniqueMathExpressions.length}`);
    uniqueMathExpressions.forEach((expr, index) => {
      console.log(`   ${index + 1}. "${expr}"`);
    });
    
    console.log('\n📥 DOWNLOAD INSTRUCTIONS:');
    console.log('='.repeat(60));
    console.log('1. Copy the content from the created file');
    console.log('2. Paste it into a new Microsoft Word document');
    console.log('3. Save as .docx format');
    console.log('4. Replace sample questions with your own');
    console.log('5. Maintain the exact tab structure');
    console.log('6. Upload through the admin panel');
    
    return {
      success: true,
      filePath: sampleFilePath,
      questionCount: questionCount,
      optionCount: optionCount,
      mathExpressions: uniqueMathExpressions.length
    };
    
  } catch (error) {
    console.error('❌ Error creating sample document:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Create the sample document
const result = createSampleWordDocument();

if (result.success) {
  console.log('\n🎉 SAMPLE DOCUMENT READY FOR DOWNLOAD!');
  console.log(`📁 Location: ${result.filePath}`);
  console.log(`📊 Contains: ${result.questionCount} questions, ${result.optionCount} options`);
  console.log(`🧮 Mathematical expressions: ${result.mathExpressions}`);
} else {
  console.log('\n❌ Failed to create sample document');
  console.log(`Error: ${result.error}`);
}
