require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/questionModel');
const fs = require('fs');
const path = require('path');

// Import the Word processing functions
const { processWordDocumentEnhanced } = require('./controllers/questionController');

async function testWordUpload() {
  try {
    await mongoose.connect(process.env.DB_URL);
    console.log('📄 TESTING WORD DOCUMENT UPLOAD WITH MATHEMATICAL EQUATIONS...\n');
    
    const quizId = '68c6587228b940716f55e15b';
    
    // Create a sample Word document content (simulating what would come from a real .docx file)
    const sampleWordContent = `
Question 1
Solve the quadratic equation: x² - 5x + 6 = 0

A) x = 2, x = 3     Correct
B) x = 1, x = 6     Incorrect  
C) x = -2, x = -3   Incorrect
D) x = 0, x = 5     Incorrect

Question 2  
Find the value of x in the equation: 2x + 8 = 20

A) x = 4    Incorrect
B) x = 6    Correct
C) x = 8    Incorrect  
D) x = 10   Incorrect

Question 3
What is the derivative of f(x) = x³ + 2x² - 5x + 1?

A) f'(x) = 3x² + 4x - 5    Correct
B) f'(x) = x² + 2x - 5     Incorrect
C) f'(x) = 3x² + 2x - 5    Incorrect
D) f'(x) = 3x + 4x - 5     Incorrect

Question 4
Evaluate the integral: ∫(3x² + 2x)dx

A) x³ + x² + C      Correct
B) 6x + 2 + C       Incorrect
C) 3x³ + 2x² + C    Incorrect
D) x³ + 2x² + C     Incorrect

Question 5
If sin(A) = 0.6 and A is acute, find cos(A)

A) 0.8      Correct
B) 0.4      Incorrect
C) 1.2      Incorrect
D) 0.6      Incorrect
`;

    console.log('📝 Sample Word Document Content:');
    console.log('='.repeat(60));
    console.log(sampleWordContent.substring(0, 300) + '...\n');
    
    // Test the Word document processing
    console.log('🔧 Processing Word document content...\n');
    
    try {
      const result = await processWordDocumentEnhanced(
        sampleWordContent,
        '<html><body>' + sampleWordContent.replace(/\n/g, '<br>') + '</body></html>',
        quizId,
        'test-document.docx'
      );
      
      console.log('📊 PROCESSING RESULTS:');
      console.log('='.repeat(60));
      console.log(`✅ Success: ${result.success}`);
      console.log(`📝 Questions processed: ${result.questionsProcessed || 0}`);
      console.log(`🖼️ Images uploaded: ${result.totalImages || 0}`);
      console.log(`🧮 Math expressions: ${result.totalMathExpressions || 0}`);
      
      if (result.questions && result.questions.length > 0) {
        console.log(`\n📋 PROCESSED QUESTIONS:`);
        result.questions.forEach((question, index) => {
          console.log(`\n🔍 Question ${index + 1}:`);
          console.log(`   📝 Text: "${question.questionText?.substring(0, 60)}..."`);
          console.log(`   📊 Options: ${question.options?.length || 0}`);
          console.log(`   ✅ Correct answers: ${question.options?.filter(opt => opt.isCorrect).length || 0}`);
          console.log(`   💡 Solution: ${question.solution ? 'YES' : 'NO'}`);
          console.log(`   🧮 Math parts: ${question.parts?.length || 0}`);
          
          // Show options
          if (question.options && question.options.length > 0) {
            question.options.forEach((option, optIndex) => {
              const correctFlag = option.isCorrect ? '✅' : '❌';
              console.log(`      ${correctFlag} ${String.fromCharCode(65 + optIndex)}) "${option.optionText}"`);
            });
          }
        });
      }
      
    } catch (processingError) {
      console.error('❌ Processing Error:', processingError);
    }
    
    // Now check what's actually stored in the database
    console.log('\n🔍 CHECKING DATABASE STORAGE:');
    console.log('='.repeat(60));
    
    const storedQuestions = await Question.find({ quizId }).sort({ createdAt: -1 }).limit(10).lean();
    
    console.log(`📊 Total questions in database: ${storedQuestions.length}`);
    
    storedQuestions.forEach((question, index) => {
      console.log(`\n📝 DB Question ${index + 1} (ID: ${question._id}):`);
      console.log(`   📅 Created: ${new Date(question.createdAt).toLocaleString()}`);
      console.log(`   📝 Text: "${question.questionText?.substring(0, 80)}..."`);
      console.log(`   📊 Options: ${question.options?.length || 0}`);
      console.log(`   ✅ Correct answers: ${question.options?.filter(opt => opt.isCorrect).length || 0}`);
      console.log(`   💡 Solution: ${question.solution ? 'YES' : 'NO'} (${question.solution?.length || 0} chars)`);
      console.log(`   🧮 Math parts: ${question.parts?.length || 0}`);
      console.log(`   📋 Tables: ${question.tables?.length || 0}`);
      console.log(`   🖼️ Images: ${question.questionImage?.length || 0}`);
      console.log(`   📊 Type: ${question.questionType}`);
      console.log(`   📈 Marks: +${question.questionCorrectMarks}, -${question.questionIncorrectMarks}`);
      
      // Show mathematical expressions
      if (question.parts && question.parts.length > 0) {
        console.log(`   🧮 Math expressions:`);
        question.parts.forEach((part, partIndex) => {
          if (part.kind === 'math') {
            console.log(`      ${partIndex + 1}. "${part.content}"`);
          }
        });
      }
      
      // Show table data structure
      if (question.tables && question.tables.length > 0) {
        console.log(`   📋 Table data type: ${typeof question.tables[0]}`);
        console.log(`   📋 Table content: "${question.tables[0]?.substring(0, 100)}..."`);
      }
      
      // Check for data quality issues
      const issues = [];
      if (!question.questionText || question.questionText.trim() === '') {
        issues.push('Empty question text');
      }
      if (!question.options || question.options.length === 0) {
        issues.push('No options');
      }
      if (question.options && !question.options.some(opt => opt.isCorrect)) {
        issues.push('No correct answer');
      }
      if (question.options && question.options.some(opt => opt.optionText.match(/\s+(correct|incorrect)$/i))) {
        issues.push('Corrupted option text');
      }
      
      if (issues.length > 0) {
        console.log(`   ⚠️ Issues: ${issues.join(', ')}`);
      } else {
        console.log(`   ✅ Data quality: Good`);
      }
    });
    
    // Test frontend data retrieval simulation
    console.log('\n🌐 SIMULATING FRONTEND DATA RETRIEVAL:');
    console.log('='.repeat(60));
    
    const frontendData = {
      message: "All questions",
      questions: storedQuestions
    };
    
    console.log(`📦 API Response Structure:`);
    console.log(`   📊 Status: 200`);
    console.log(`   📝 Message: "${frontendData.message}"`);
    console.log(`   📋 Questions Array Length: ${frontendData.questions.length}`);
    console.log(`   📄 Sample Question Keys:`, Object.keys(frontendData.questions[0] || {}));
    
    // Analyze mathematical equation handling
    console.log('\n🧮 MATHEMATICAL EQUATION ANALYSIS:');
    console.log('='.repeat(60));
    
    let totalMathExpressions = 0;
    let questionsWithMath = 0;
    
    storedQuestions.forEach((question, index) => {
      if (question.parts && question.parts.length > 0) {
        const mathParts = question.parts.filter(part => part.kind === 'math');
        if (mathParts.length > 0) {
          questionsWithMath++;
          totalMathExpressions += mathParts.length;
          
          console.log(`📐 Question ${index + 1}: ${mathParts.length} math expressions`);
          mathParts.forEach((mathPart, mathIndex) => {
            console.log(`   ${mathIndex + 1}. "${mathPart.content}"`);
          });
        }
      }
    });
    
    console.log(`\n📊 Math Summary:`);
    console.log(`   🧮 Total math expressions: ${totalMathExpressions}`);
    console.log(`   📝 Questions with math: ${questionsWithMath}/${storedQuestions.length}`);
    
    console.log('\n✅ WORD DOCUMENT UPLOAD TEST COMPLETE!');
    console.log(`🎯 Quiz ID for frontend testing: ${quizId}`);
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Test Error:', err);
    process.exit(1);
  }
}

testWordUpload();
