require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/questionModel');

async function fixExistingQuestions() {
  try {
    await mongoose.connect(process.env.DB_URL);
    console.log('🔧 FIXING EXISTING QUESTIONS WITH PARSING ISSUES...\n');
    
    // Get questions with corrupted option text (containing "Correct/Incorrect")
    const corruptedQuestions = await Question.find({
      $or: [
        { 'options.optionText': /correct$/i },
        { 'options.optionText': /incorrect$/i }
      ]
    }).lean();
    
    console.log(`📊 Found ${corruptedQuestions.length} questions with corrupted options\n`);
    
    let fixedCount = 0;
    let totalCorrectAnswersFixed = 0;
    
    for (const question of corruptedQuestions) {
      console.log(`🔧 Fixing Question ID: ${question._id}`);
      console.log(`📝 Original Question Text: "${question.questionText?.substring(0, 80)}..."`);
      
      const fixedOptions = [];
      let hasCorrectAnswer = false;
      
      for (const [index, option] of question.options.entries()) {
        let optionText = option.optionText;
        let isCorrect = false;
        
        // Extract correctness from option text
        const correctnessMatch = optionText.match(/^(.*?)\s+(correct|incorrect)$/i);
        if (correctnessMatch) {
          optionText = correctnessMatch[1].trim();
          isCorrect = correctnessMatch[2].toLowerCase() === 'correct';
          
          if (isCorrect) {
            hasCorrectAnswer = true;
            totalCorrectAnswersFixed++;
          }
        }
        
        // Clean up option text (remove extra spaces)
        optionText = optionText
          .replace(/\s+/g, ' ')
          .trim();
        
        fixedOptions.push({
          optionText: optionText,
          isCorrect: isCorrect
        });
        
        console.log(`   ${String.fromCharCode(65 + index)}) "${optionText}" (Correct: ${isCorrect})`);
      }
      
      // Update the question in database
      await Question.updateOne(
        { _id: question._id },
        { 
          $set: { 
            options: fixedOptions,
            // Also try to extract solution if we found a correct answer
            solution: hasCorrectAnswer ? 
              `The correct answer is ${String.fromCharCode(65 + fixedOptions.findIndex(opt => opt.isCorrect))}` : 
              question.solution || ''
          }
        }
      );
      
      fixedCount++;
      console.log(`✅ Fixed question ${question._id} - ${hasCorrectAnswer ? 'Correct answer identified' : 'No correct answer found'}\n`);
    }
    
    console.log(`🎉 FIXING COMPLETE!`);
    console.log(`📊 Questions fixed: ${fixedCount}`);
    console.log(`🎯 Correct answers restored: ${totalCorrectAnswersFixed}`);
    
    // Verify the fixes
    console.log(`\n🔍 VERIFYING FIXES...`);
    const verifyQuestions = await Question.find({
      _id: { $in: corruptedQuestions.map(q => q._id) }
    }).lean();
    
    let verifiedCorrectAnswers = 0;
    let verifiedCleanOptions = 0;
    
    for (const question of verifyQuestions) {
      const correctCount = question.options.filter(opt => opt.isCorrect).length;
      const cleanOptions = question.options.filter(opt => 
        !opt.optionText.match(/\s+(correct|incorrect)$/i)
      ).length;
      
      verifiedCorrectAnswers += correctCount;
      if (cleanOptions === question.options.length) {
        verifiedCleanOptions++;
      }
    }
    
    console.log(`✅ Verified correct answers: ${verifiedCorrectAnswers}`);
    console.log(`✅ Questions with clean options: ${verifiedCleanOptions}/${corruptedQuestions.length}`);
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Fix Error:', err);
    process.exit(1);
  }
}

fixExistingQuestions();
