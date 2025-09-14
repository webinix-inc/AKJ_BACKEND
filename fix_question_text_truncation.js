require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/questionModel');

async function fixQuestionTextTruncation() {
  try {
    await mongoose.connect(process.env.DB_URL);
    console.log('🔧 FIXING QUESTION TEXT TRUNCATION ISSUES...\n');
    
    // Get questions with truncated text (starting with lowercase letters)
    const truncatedQuestions = await Question.find({
      questionText: /^[a-z]/  // Starts with lowercase letter
    }).lean();
    
    console.log(`📊 Found ${truncatedQuestions.length} questions with potentially truncated text\n`);
    
    let fixedCount = 0;
    
    for (const question of truncatedQuestions) {
      console.log(`🔧 Checking Question ID: ${question._id}`);
      console.log(`📝 Original Text: "${question.questionText?.substring(0, 100)}..."`);
      
      let fixedText = question.questionText;
      let wasFixed = false;
      
      // Common truncation patterns and their fixes
      const truncationFixes = [
        { pattern: /^he\s+/, replacement: 'The ' },
        { pattern: /^hat\s+/, replacement: 'What ' },
        { pattern: /^hich\s+/, replacement: 'Which ' },
        { pattern: /^hen\s+/, replacement: 'When ' },
        { pattern: /^here\s+/, replacement: 'Where ' },
        { pattern: /^ow\s+/, replacement: 'How ' },
        { pattern: /^n\s+/, replacement: 'In ' },
        { pattern: /^f\s+/, replacement: 'If ' },
        { pattern: /^or\s+/, replacement: 'For ' },
        { pattern: /^t\s+/, replacement: 'At ' },
        { pattern: /^y\s+/, replacement: 'By ' }
      ];
      
      for (const fix of truncationFixes) {
        if (fix.pattern.test(fixedText)) {
          fixedText = fixedText.replace(fix.pattern, fix.replacement);
          wasFixed = true;
          console.log(`   ✅ Applied fix: "${fix.pattern}" → "${fix.replacement}"`);
          break;
        }
      }
      
      // Additional check for common scientific/academic terms
      const academicFixes = [
        { pattern: /^eory\s+/, replacement: 'Theory ' },
        { pattern: /^oncept\s+/, replacement: 'Concept ' },
        { pattern: /^rinciple\s+/, replacement: 'Principle ' },
        { pattern: /^aw\s+/, replacement: 'Law ' },
        { pattern: /^quation\s+/, replacement: 'Equation ' },
        { pattern: /^ormula\s+/, replacement: 'Formula ' }
      ];
      
      if (!wasFixed) {
        for (const fix of academicFixes) {
          if (fix.pattern.test(fixedText)) {
            fixedText = fixedText.replace(fix.pattern, fix.replacement);
            wasFixed = true;
            console.log(`   ✅ Applied academic fix: "${fix.pattern}" → "${fix.replacement}"`);
            break;
          }
        }
      }
      
      if (wasFixed) {
        // Update the question in database
        await Question.updateOne(
          { _id: question._id },
          { $set: { questionText: fixedText } }
        );
        
        fixedCount++;
        console.log(`   📝 Fixed Text: "${fixedText.substring(0, 100)}..."`);
        console.log(`   ✅ Updated in database\n`);
      } else {
        console.log(`   ⚠️ No automatic fix applied - manual review may be needed\n`);
      }
    }
    
    console.log(`🎉 TRUNCATION FIXING COMPLETE!`);
    console.log(`📊 Questions checked: ${truncatedQuestions.length}`);
    console.log(`🔧 Questions fixed: ${fixedCount}`);
    
    // Verify the fixes
    console.log(`\n🔍 VERIFYING FIXES...`);
    const verifyQuestions = await Question.find({
      _id: { $in: truncatedQuestions.map(q => q._id) }
    }).lean();
    
    let properlyCapitalized = 0;
    
    for (const question of verifyQuestions) {
      if (/^[A-Z]/.test(question.questionText)) {
        properlyCapitalized++;
      }
    }
    
    console.log(`✅ Questions now properly capitalized: ${properlyCapitalized}/${truncatedQuestions.length}`);
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Fix Error:', err);
    process.exit(1);
  }
}

fixQuestionTextTruncation();
