require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/questionModel');

async function createMathTest() {
  try {
    await mongoose.connect(process.env.DB_URL);
    console.log('🔢 CREATING MATHEMATICAL QUESTIONS TEST...\n');
    
    // Use the same quiz ID from our previous tests
    const quizId = '68c6587228b940716f55e15b';
    
    // Clear existing questions for clean test
    console.log('🗑️ Clearing existing questions for clean test...');
    await Question.deleteMany({ quizId });
    
    // Create 5 mathematical questions with embedded equations
    const mathQuestions = [
      {
        questionText: "Solve the quadratic equation: 2x² - 5x + 3 = 0",
        options: [
          { optionText: "x = 1, x = 3/2", isCorrect: true },
          { optionText: "x = 2, x = 1/2", isCorrect: false },
          { optionText: "x = 3, x = 1", isCorrect: false },
          { optionText: "x = 0, x = 5/2", isCorrect: false }
        ],
        parts: [
          { kind: 'math', content: '2x² - 5x + 3 = 0' },
          { kind: 'math', content: 'x = 1' },
          { kind: 'math', content: 'x = 3/2' }
        ],
        solution: "Using the quadratic formula: x = (5 ± √(25-24))/4 = (5 ± 1)/4, so x = 1 or x = 3/2"
      },
      {
        questionText: "Find the derivative of f(x) = 3x³ - 2x² + 5x - 1",
        options: [
          { optionText: "f'(x) = 9x² - 4x + 5", isCorrect: true },
          { optionText: "f'(x) = 6x² - 2x + 5", isCorrect: false },
          { optionText: "f'(x) = 9x² - 4x + 1", isCorrect: false },
          { optionText: "f'(x) = 3x² - 4x + 5", isCorrect: false }
        ],
        parts: [
          { kind: 'math', content: 'f(x) = 3x³ - 2x² + 5x - 1' },
          { kind: 'math', content: "f'(x) = 9x² - 4x + 5" }
        ],
        solution: "Using power rule: d/dx(3x³) = 9x², d/dx(-2x²) = -4x, d/dx(5x) = 5, d/dx(-1) = 0"
      },
      {
        questionText: "Evaluate the integral: ∫(2x + 3)dx",
        options: [
          { optionText: "x² + 3x + C", isCorrect: true },
          { optionText: "2x² + 3x + C", isCorrect: false },
          { optionText: "x² + 6x + C", isCorrect: false },
          { optionText: "2x + 3x + C", isCorrect: false }
        ],
        parts: [
          { kind: 'math', content: '∫(2x + 3)dx' },
          { kind: 'math', content: 'x² + 3x + C' }
        ],
        solution: "∫(2x + 3)dx = ∫2x dx + ∫3 dx = x² + 3x + C"
      },
      {
        questionText: "If sin(θ) = 3/5 and θ is in the first quadrant, find cos(θ)",
        options: [
          { optionText: "4/5", isCorrect: true },
          { optionText: "3/4", isCorrect: false },
          { optionText: "5/4", isCorrect: false },
          { optionText: "5/3", isCorrect: false }
        ],
        parts: [
          { kind: 'math', content: 'sin(θ) = 3/5' },
          { kind: 'math', content: 'cos(θ) = 4/5' },
          { kind: 'math', content: 'sin²(θ) + cos²(θ) = 1' }
        ],
        solution: "Using Pythagorean identity: cos²(θ) = 1 - sin²(θ) = 1 - (3/5)² = 1 - 9/25 = 16/25, so cos(θ) = 4/5"
      },
      {
        questionText: "Find the limit: lim(x→0) (sin(x)/x)",
        options: [
          { optionText: "1", isCorrect: true },
          { optionText: "0", isCorrect: false },
          { optionText: "∞", isCorrect: false },
          { optionText: "undefined", isCorrect: false }
        ],
        parts: [
          { kind: 'math', content: 'lim(x→0) (sin(x)/x)' },
          { kind: 'math', content: 'lim(x→0) (sin(x)/x) = 1' }
        ],
        solution: "This is a standard limit in calculus. Using L'Hôpital's rule or the squeeze theorem, lim(x→0) (sin(x)/x) = 1"
      }
    ];
    
    console.log('📝 Creating mathematical questions...\n');
    
    const savedQuestions = [];
    
    for (const [index, questionData] of mathQuestions.entries()) {
      console.log(`🔢 Creating Question ${index + 1}:`);
      console.log(`   📝 Text: "${questionData.questionText}"`);
      console.log(`   📊 Options: ${questionData.options.length}`);
      console.log(`   🧮 Math expressions: ${questionData.parts.length}`);
      console.log(`   💡 Solution: "${questionData.solution.substring(0, 50)}..."`);
      
      const newQuestion = new Question({
        quizId: quizId,
        questionType: 'multiple_choice',
        questionText: questionData.questionText,
        questionImage: [],
        parts: questionData.parts,
        tables: [`Mathematical question ${index + 1} with embedded equations`],
        options: questionData.options,
        solution: questionData.solution,
        questionCorrectMarks: 4,
        questionIncorrectMarks: -1,
        uploadedFromWord: true,
      });
      
      const savedQuestion = await newQuestion.save();
      savedQuestions.push(savedQuestion);
      
      console.log(`   ✅ Saved with ID: ${savedQuestion._id}\n`);
    }
    
    console.log('🎉 MATHEMATICAL TEST CREATED SUCCESSFULLY!');
    console.log(`📊 Total questions created: ${savedQuestions.length}`);
    console.log(`🎯 Quiz ID: ${quizId}`);
    
    // Verify the data structure
    console.log('\n🔍 VERIFYING DATA STRUCTURE:');
    console.log('='.repeat(60));
    
    const verifyQuestions = await Question.find({ quizId }).lean();
    
    for (const [index, question] of verifyQuestions.entries()) {
      console.log(`\n📝 Question ${index + 1} Verification:`);
      console.log(`   📊 ID: ${question._id}`);
      console.log(`   📝 Text: "${question.questionText.substring(0, 60)}..."`);
      console.log(`   🔢 Math parts: ${question.parts?.length || 0}`);
      console.log(`   📋 Options: ${question.options?.length || 0}`);
      console.log(`   ✅ Correct answers: ${question.options?.filter(opt => opt.isCorrect).length || 0}`);
      console.log(`   💡 Solution: ${question.solution ? 'YES' : 'NO'} (${question.solution?.length || 0} chars)`);
      console.log(`   📊 Tables: ${question.tables?.length || 0}`);
      
      // Show math expressions
      if (question.parts && question.parts.length > 0) {
        console.log(`   🧮 Math expressions:`);
        question.parts.forEach((part, partIndex) => {
          if (part.kind === 'math') {
            console.log(`      ${partIndex + 1}. "${part.content}"`);
          }
        });
      }
      
      // Show options with correctness
      console.log(`   📝 Options:`);
      question.options?.forEach((option, optIndex) => {
        const correctFlag = option.isCorrect ? '✅' : '❌';
        console.log(`      ${correctFlag} ${String.fromCharCode(65 + optIndex)}) "${option.optionText}"`);
      });
    }
    
    console.log('\n✅ MATHEMATICAL TEST READY FOR FRONTEND TESTING!');
    console.log(`🌐 Access the admin panel and navigate to Quiz ID: ${quizId}`);
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error creating math test:', err);
    process.exit(1);
  }
}

createMathTest();
