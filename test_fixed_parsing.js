require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/questionModel');

// Import the fixed parsing functions
const { 
  parseOptionsFromTableData, 
  parseSolutionFromTableData 
} = require('./controllers/questionController');

async function testFixedParsing() {
  try {
    await mongoose.connect(process.env.DB_URL);
    console.log('🔧 TESTING FIXED PARSING LOGIC...\n');
    
    // Get a sample question with table data
    const sampleQuestion = await Question.findOne({ 
      tables: { $exists: true, $ne: [] } 
    }).lean();
    
    if (!sampleQuestion) {
      console.log('❌ No sample question found');
      process.exit(1);
    }
    
    console.log(`🔍 Testing with Question ID: ${sampleQuestion._id}`);
    console.log(`📝 Original Question Text: "${sampleQuestion.questionText?.substring(0, 100)}..."`);
    console.log(`📊 Original Options Count: ${sampleQuestion.options?.length || 0}`);
    
    // Test the table data
    const tableData = sampleQuestion.tables[0];
    console.log(`\n📋 TABLE DATA ANALYSIS:`);
    console.log(`   Type: ${typeof tableData}`);
    console.log(`   Content: "${tableData?.substring(0, 200)}..."`);
    
    // Test fixed option parsing
    console.log(`\n🔧 TESTING FIXED OPTION PARSING:`);
    console.log('='.repeat(50));
    const optionsResult = parseOptionsFromTableData(tableData);
    
    console.log(`\n📊 PARSING RESULTS:`);
    console.log(`   Options found: ${optionsResult.options.length}`);
    
    optionsResult.options.forEach((option, index) => {
      console.log(`   ${String.fromCharCode(65 + index)}) "${option.optionText}" (Correct: ${option.isCorrect})`);
    });
    
    // Test fixed solution parsing
    console.log(`\n🔧 TESTING FIXED SOLUTION PARSING:`);
    console.log('='.repeat(50));
    const solutionResult = parseSolutionFromTableData(tableData);
    
    console.log(`\n💡 SOLUTION RESULTS:`);
    console.log(`   Found: ${solutionResult.found}`);
    console.log(`   Letter: ${solutionResult.letter || 'None'}`);
    console.log(`   Explanation: "${solutionResult.explanation}"`);
    
    // Compare with original data
    console.log(`\n📊 COMPARISON WITH ORIGINAL DATA:`);
    console.log('='.repeat(50));
    
    console.log(`🔍 Original vs Fixed Options:`);
    const originalCorrectCount = sampleQuestion.options?.filter(opt => opt.isCorrect).length || 0;
    const fixedCorrectCount = optionsResult.options.filter(opt => opt.isCorrect).length;
    
    console.log(`   Original correct answers: ${originalCorrectCount}`);
    console.log(`   Fixed correct answers: ${fixedCorrectCount}`);
    
    console.log(`\n🔍 Original vs Fixed Solutions:`);
    console.log(`   Original solution: "${sampleQuestion.solution || 'None'}"`);
    console.log(`   Fixed solution: "${solutionResult.explanation || 'None'}"`);
    
    // Show improvement
    console.log(`\n✅ IMPROVEMENTS:`);
    if (fixedCorrectCount > originalCorrectCount) {
      console.log(`   🎯 Fixed correct answer identification (+${fixedCorrectCount - originalCorrectCount})`);
    }
    if (solutionResult.found && !sampleQuestion.solution) {
      console.log(`   💡 Fixed solution extraction`);
    }
    
    // Test with multiple questions
    console.log(`\n🔧 TESTING WITH MULTIPLE QUESTIONS:`);
    console.log('='.repeat(50));
    
    const multipleQuestions = await Question.find({ 
      tables: { $exists: true, $ne: [] } 
    }).limit(3).lean();
    
    for (const [index, question] of multipleQuestions.entries()) {
      console.log(`\n📝 Question ${index + 1} (ID: ${question._id}):`);
      const qTableData = question.tables[0];
      const qOptionsResult = parseOptionsFromTableData(qTableData);
      const qSolutionResult = parseSolutionFromTableData(qTableData);
      
      const qOriginalCorrect = question.options?.filter(opt => opt.isCorrect).length || 0;
      const qFixedCorrect = qOptionsResult.options.filter(opt => opt.isCorrect).length;
      
      console.log(`   Options: ${qOptionsResult.options.length} found`);
      console.log(`   Correct answers: ${qOriginalCorrect} → ${qFixedCorrect}`);
      console.log(`   Solution found: ${qSolutionResult.found ? 'YES' : 'NO'}`);
      
      if (qFixedCorrect > qOriginalCorrect) {
        console.log(`   ✅ IMPROVEMENT: Fixed correct answer identification`);
      }
    }
    
    console.log(`\n🎉 FIXED PARSING LOGIC TEST COMPLETE!`);
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Test Error:', err);
    process.exit(1);
  }
}

testFixedParsing();
