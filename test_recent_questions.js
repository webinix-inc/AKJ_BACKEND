require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/questionModel');

async function testRecentQuestions() {
  try {
    await mongoose.connect(process.env.DB_URL);
    console.log('🔍 CHECKING RECENT QUESTIONS WITH PARSING ISSUES...\n');
    
    // Get the most recent questions (uploaded today)
    const recentQuestions = await Question.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    
    if (recentQuestions.length === 0) {
      console.log('❌ No recent questions found');
      process.exit(1);
    }
    
    console.log(`📊 Found ${recentQuestions.length} recent questions\n`);
    
    recentQuestions.forEach((question, index) => {
      console.log(`🔍 QUESTION ${index + 1} (ID: ${question._id}):`);
      console.log(`📅 Created: ${new Date(question.createdAt).toLocaleString()}`);
      console.log(`📝 Question Text: "${question.questionText?.substring(0, 100)}..."`);
      console.log(`📊 Options Count: ${question.options?.length || 0}`);
      
      // Show options with their correctness
      if (question.options && question.options.length > 0) {
        console.log(`📝 Options:`);
        question.options.forEach((option, optIdx) => {
          const correctFlag = option.isCorrect ? '✅' : '❌';
          console.log(`   ${correctFlag} ${String.fromCharCode(65 + optIdx)}) "${option.optionText}"`);
        });
        
        const correctCount = question.options.filter(opt => opt.isCorrect).length;
        console.log(`   🎯 Correct answers: ${correctCount}`);
      }
      
      // Show table data structure
      if (question.tables && question.tables.length > 0) {
        console.log(`📋 Table Data:`);
        console.log(`   Type: ${typeof question.tables[0]}`);
        console.log(`   Content: "${question.tables[0]?.substring(0, 200)}..."`);
        
        // Check if it contains option patterns
        const tableText = question.tables[0];
        if (typeof tableText === 'string') {
          const hasOptions = /[A-Z]\)/.test(tableText);
          const hasCorrectIncorrect = /correct|incorrect/i.test(tableText);
          console.log(`   Contains A), B), etc.: ${hasOptions}`);
          console.log(`   Contains correct/incorrect: ${hasCorrectIncorrect}`);
          
          // Extract sample options if they exist
          if (hasOptions && hasCorrectIncorrect) {
            const optionMatches = tableText.match(/[A-Z]\)[^A-Z]*?(?:correct|incorrect)/gi);
            if (optionMatches) {
              console.log(`   Sample option patterns found: ${optionMatches.length}`);
              optionMatches.slice(0, 2).forEach((match, i) => {
                console.log(`      ${i + 1}. "${match.substring(0, 50)}..."`);
              });
            }
          }
        }
      }
      
      console.log(`${'='.repeat(80)}\n`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

testRecentQuestions();
