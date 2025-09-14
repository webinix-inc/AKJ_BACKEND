require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/questionModel');

// Import the actual upload function
const { uploadQuestionsFromS3 } = require('./controllers/questionController');

async function simulateWordUpload() {
  try {
    await mongoose.connect(process.env.DB_URL);
    console.log('📄 SIMULATING REAL WORD DOCUMENT UPLOAD PROCESS...\n');
    
    const quizId = '68c6587228b940716f55e15b';
    
    // Clear existing questions for clean test
    console.log('🗑️ Clearing existing questions for fresh test...');
    await Question.deleteMany({ quizId });
    
    // Create sample Word document content with mathematical equations in table format
    const wordDocumentContent = `
Question 1
Solve for x: x² - 7x + 12 = 0

Option	A) x = 3, x = 4	Correct
Option	B) x = 2, x = 6	Incorrect
Option	C) x = 1, x = 12	Incorrect
Option	D) x = -3, x = -4	Incorrect

Question 2
Find the derivative: d/dx(x³ + 4x² - 2x + 5)

Option	A) 3x² + 8x - 2	Correct
Option	B) x² + 4x - 2	Incorrect
Option	C) 3x² + 4x - 2	Incorrect
Option	D) 3x + 8x - 2	Incorrect

Question 3
Evaluate: ∫(4x³ - 2x)dx

Option	A) x⁴ - x² + C	Correct
Option	B) 12x² - 2 + C	Incorrect
Option	C) 4x⁴ - 2x² + C	Incorrect
Option	D) x³ - x + C	Incorrect

Question 4
If cos(θ) = 4/5, find sin(θ) (θ in first quadrant)

Option	A) 3/5	Correct
Option	B) 4/3	Incorrect
Option	C) 5/3	Incorrect
Option	D) 5/4	Incorrect

Question 5
Solve the system: 2x + 3y = 12, x - y = 1

Option	A) x = 3, y = 2	Correct
Option	B) x = 2, y = 3	Incorrect
Option	C) x = 4, y = 1	Incorrect
Option	D) x = 1, y = 4	Incorrect
`;

    console.log('📝 Word Document Content Structure:');
    console.log('='.repeat(60));
    console.log(wordDocumentContent.substring(0, 400) + '...\n');
    
    // Simulate the S3 upload and processing
    console.log('🔧 Simulating S3 upload and processing...\n');
    
    // Create a mock request object
    const mockReq = {
      params: { quizId: quizId },
      file: {
        location: 'https://mock-s3-bucket.com/quizes/files/test-math-questions.docx',
        originalname: 'mathematical-questions.docx',
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }
    };
    
    // Create a mock response object
    let responseData = null;
    let statusCode = null;
    
    const mockRes = {
      status: (code) => {
        statusCode = code;
        return mockRes;
      },
      json: (data) => {
        responseData = data;
        return mockRes;
      }
    };
    
    // Since we can't actually call the S3 upload function without a real file,
    // let's manually process the content using our parsing logic
    console.log('🔧 Processing document content with enhanced parsing...\n');
    
    // Split into questions
    const questions = wordDocumentContent.split(/Question \d+/).filter(q => q.trim());
    
    console.log(`📊 Found ${questions.length} questions to process\n`);
    
    const processedQuestions = [];
    
    for (const [index, questionContent] of questions.entries()) {
      console.log(`🔢 Processing Question ${index + 1}:`);
      
      const lines = questionContent.trim().split('\n').filter(line => line.trim());
      
      // Extract question text (first non-empty line)
      const questionText = lines[0]?.trim() || `Question ${index + 1}`;
      
      // Extract options
      const options = [];
      const optionLines = lines.filter(line => line.startsWith('Option\t'));
      
      for (const optionLine of optionLines) {
        const parts = optionLine.split('\t');
        if (parts.length >= 3) {
          const optionText = parts[1]?.trim() || '';
          const correctness = parts[2]?.trim().toLowerCase() || '';
          const isCorrect = correctness === 'correct';
          
          options.push({
            optionText: optionText,
            isCorrect: isCorrect
          });
        }
      }
      
      // Extract mathematical expressions from question text
      const mathExpressions = [];
      const mathPatterns = [
        /x²[^a-zA-Z]*/g,
        /x³[^a-zA-Z]*/g,
        /∫[^a-zA-Z]*/g,
        /d\/dx[^a-zA-Z]*/g,
        /cos\([^)]+\)/g,
        /sin\([^)]+\)/g,
        /[a-zA-Z]\s*=\s*[0-9\/\-\+\s,]+/g
      ];
      
      for (const pattern of mathPatterns) {
        const matches = questionText.match(pattern);
        if (matches) {
          mathExpressions.push(...matches.map(match => match.trim()));
        }
      }
      
      // Create question object
      const questionData = {
        quizId: quizId,
        questionType: 'multiple_choice',
        questionText: questionText,
        questionImage: [],
        parts: mathExpressions.map(expr => ({ kind: 'math', content: expr })),
        tables: [questionContent.trim()],
        options: options,
        solution: options.find(opt => opt.isCorrect) ? 
          `The correct answer is ${String.fromCharCode(65 + options.findIndex(opt => opt.isCorrect))}` : '',
        questionCorrectMarks: 4,
        questionIncorrectMarks: -1,
        uploadedFromWord: true,
      };
      
      console.log(`   📝 Text: "${questionText}"`);
      console.log(`   📊 Options: ${options.length}`);
      console.log(`   ✅ Correct answers: ${options.filter(opt => opt.isCorrect).length}`);
      console.log(`   🧮 Math expressions: ${mathExpressions.length}`);
      
      // Save to database
      const newQuestion = new Question(questionData);
      const savedQuestion = await newQuestion.save();
      processedQuestions.push(savedQuestion);
      
      console.log(`   ✅ Saved with ID: ${savedQuestion._id}\n`);
    }
    
    console.log('🎉 WORD DOCUMENT PROCESSING COMPLETE!');
    console.log(`📊 Questions processed: ${processedQuestions.length}`);
    console.log(`🎯 Quiz ID: ${quizId}`);
    
    // Verify the stored data
    console.log('\n🔍 VERIFYING STORED DATA:');
    console.log('='.repeat(60));
    
    const storedQuestions = await Question.find({ quizId }).lean();
    
    for (const [index, question] of storedQuestions.entries()) {
      console.log(`\n📝 Question ${index + 1} Verification:`);
      console.log(`   📊 ID: ${question._id}`);
      console.log(`   📝 Text: "${question.questionText}"`);
      console.log(`   📊 Options: ${question.options?.length || 0}`);
      console.log(`   ✅ Correct answers: ${question.options?.filter(opt => opt.isCorrect).length || 0}`);
      console.log(`   💡 Solution: ${question.solution ? 'YES' : 'NO'}`);
      console.log(`   🧮 Math parts: ${question.parts?.length || 0}`);
      console.log(`   📋 Tables: ${question.tables?.length || 0}`);
      
      // Show options with correctness
      if (question.options && question.options.length > 0) {
        console.log(`   📝 Options:`);
        question.options.forEach((option, optIndex) => {
          const correctFlag = option.isCorrect ? '✅' : '❌';
          console.log(`      ${correctFlag} ${String.fromCharCode(65 + optIndex)}) "${option.optionText}"`);
        });
      }
      
      // Show mathematical expressions
      if (question.parts && question.parts.length > 0) {
        console.log(`   🧮 Math expressions:`);
        question.parts.forEach((part, partIndex) => {
          if (part.kind === 'math') {
            console.log(`      ${partIndex + 1}. "${part.content}"`);
          }
        });
      }
    }
    
    // Test frontend API response format
    console.log('\n🌐 FRONTEND API RESPONSE SIMULATION:');
    console.log('='.repeat(60));
    
    const apiResponse = {
      message: "All questions",
      questions: storedQuestions
    };
    
    console.log(`📦 API Response:`);
    console.log(`   📊 Status: 200`);
    console.log(`   📝 Message: "${apiResponse.message}"`);
    console.log(`   📋 Questions: ${apiResponse.questions.length}`);
    console.log(`   🧮 Total math expressions: ${apiResponse.questions.reduce((sum, q) => sum + (q.parts?.length || 0), 0)}`);
    console.log(`   ✅ Questions with correct answers: ${apiResponse.questions.filter(q => q.options?.some(opt => opt.isCorrect)).length}`);
    
    // Check data quality
    console.log('\n📊 DATA QUALITY ANALYSIS:');
    console.log('='.repeat(60));
    
    let qualityScore = 0;
    const totalChecks = storedQuestions.length * 4; // 4 checks per question
    
    storedQuestions.forEach((question, index) => {
      const checks = {
        hasQuestionText: !!question.questionText && question.questionText.trim() !== '',
        hasOptions: question.options && question.options.length > 0,
        hasCorrectAnswer: question.options && question.options.some(opt => opt.isCorrect),
        hasSolution: !!question.solution && question.solution.trim() !== ''
      };
      
      const questionScore = Object.values(checks).filter(Boolean).length;
      qualityScore += questionScore;
      
      console.log(`📝 Question ${index + 1}: ${questionScore}/4 checks passed`);
      if (questionScore < 4) {
        const failedChecks = Object.entries(checks)
          .filter(([key, value]) => !value)
          .map(([key]) => key);
        console.log(`   ⚠️ Failed: ${failedChecks.join(', ')}`);
      }
    });
    
    const qualityPercentage = Math.round((qualityScore / totalChecks) * 100);
    console.log(`\n📊 Overall Data Quality: ${qualityScore}/${totalChecks} (${qualityPercentage}%)`);
    
    if (qualityPercentage >= 90) {
      console.log('✅ Excellent data quality!');
    } else if (qualityPercentage >= 75) {
      console.log('⚠️ Good data quality with minor issues');
    } else {
      console.log('❌ Data quality needs improvement');
    }
    
    console.log('\n✅ WORD DOCUMENT UPLOAD SIMULATION COMPLETE!');
    console.log(`🎯 Quiz ID for frontend testing: ${quizId}`);
    console.log(`📱 Access admin panel to view the mathematical questions`);
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Simulation Error:', err);
    process.exit(1);
  }
}

simulateWordUpload();
