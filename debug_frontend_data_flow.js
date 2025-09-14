require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/questionModel');

async function debugFrontendDataFlow() {
  try {
    await mongoose.connect(process.env.DB_URL);
    console.log('🔍 DEBUGGING FRONTEND DATA FLOW ISSUES...\n');
    
    // Get the most recent quiz with questions
    const recentQuestions = await Question.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    
    if (recentQuestions.length === 0) {
      console.log('❌ No questions found in database');
      process.exit(1);
    }
    
    const quizId = recentQuestions[0].quizId;
    console.log(`🎯 Testing with Quiz ID: ${quizId}`);
    
    // 1. Check what fetchAllQuestions returns (simulating backend API)
    console.log('\n📊 1. BACKEND API RESPONSE (fetchAllQuestions):');
    console.log('='.repeat(60));
    
    const questions = await Question.find({ quizId }).lean();
    console.log(`📁 Total questions found: ${questions.length}`);
    
    questions.forEach((question, index) => {
      console.log(`\n🔍 Question ${index + 1} (ID: ${question._id}):`);
      console.log(`   📝 Question Text: "${question.questionText?.substring(0, 100)}..."`);
      console.log(`   📊 Options Count: ${question.options?.length || 0}`);
      console.log(`   ✅ Solution: ${question.solution ? 'YES' : 'NO'} (${question.solution?.length || 0} chars)`);
      console.log(`   🖼️ Images: ${question.questionImage?.length || 0}`);
      console.log(`   📋 Parts: ${question.parts?.length || 0}`);
      console.log(`   📊 Tables: ${question.tables?.length || 0}`);
      console.log(`   🎯 Type: ${question.questionType}`);
      console.log(`   📈 Correct Marks: ${question.questionCorrectMarks}`);
      console.log(`   📉 Incorrect Marks: ${question.questionIncorrectMarks}`);
      
      // Check options structure
      if (question.options && question.options.length > 0) {
        console.log(`   📝 Options Details:`);
        question.options.forEach((option, optIdx) => {
          console.log(`      ${String.fromCharCode(65 + optIdx)}) "${option.optionText}" (Correct: ${option.isCorrect})`);
        });
      }
      
      // Check if there are any data inconsistencies
      const issues = [];
      if (!question.questionText || question.questionText.trim() === '') {
        issues.push('Empty question text');
      }
      if (!question.options || question.options.length === 0) {
        issues.push('No options');
      }
      if (question.options && !question.options.some(opt => opt.isCorrect)) {
        issues.push('No correct answer marked');
      }
      if (question.questionCorrectMarks === undefined || question.questionCorrectMarks === null) {
        issues.push('No correct marks set');
      }
      
      if (issues.length > 0) {
        console.log(`   ⚠️ ISSUES: ${issues.join(', ')}`);
      } else {
        console.log(`   ✅ Question structure looks good`);
      }
    });
    
    // 2. Check what the frontend receives (simulating API response)
    console.log('\n📱 2. FRONTEND RECEIVES (API Response Format):');
    console.log('='.repeat(60));
    
    const apiResponse = {
      message: "All questions",
      questions: questions
    };
    
    console.log(`📦 API Response Structure:`);
    console.log(`   📊 Status: 200`);
    console.log(`   📝 Message: "${apiResponse.message}"`);
    console.log(`   📋 Questions Array Length: ${apiResponse.questions.length}`);
    console.log(`   📄 Sample Question Keys:`, Object.keys(apiResponse.questions[0] || {}));
    
    // 3. Check for common frontend issues
    console.log('\n🔧 3. COMMON FRONTEND ISSUES CHECK:');
    console.log('='.repeat(60));
    
    // Check question counting
    const questionCount = questions.length;
    console.log(`📊 Question Count Check:`);
    console.log(`   Database Count: ${questionCount}`);
    console.log(`   Frontend Should Display: ${questionCount}`);
    
    // Check for rendering issues
    console.log(`\n🎨 Rendering Issues Check:`);
    questions.forEach((question, index) => {
      const renderingIssues = [];
      
      // Check if question text is properly formatted
      if (question.questionText && question.questionText.includes('undefined')) {
        renderingIssues.push('Contains "undefined" text');
      }
      
      // Check if options are properly structured
      if (question.options) {
        question.options.forEach((option, optIdx) => {
          if (!option.optionText || option.optionText.trim() === '') {
            renderingIssues.push(`Option ${optIdx + 1} is empty`);
          }
          if (option.isCorrect === undefined) {
            renderingIssues.push(`Option ${optIdx + 1} missing isCorrect flag`);
          }
        });
      }
      
      // Check for mathematical expressions handling
      if (question.parts && question.parts.length > 0) {
        const mathParts = question.parts.filter(part => part.kind === 'math');
        if (mathParts.length > 0) {
          console.log(`   📐 Question ${index + 1}: ${mathParts.length} math expressions found`);
        }
      }
      
      if (renderingIssues.length > 0) {
        console.log(`   ⚠️ Question ${index + 1} Rendering Issues: ${renderingIssues.join(', ')}`);
      }
    });
    
    // 4. Check for Redux state management issues
    console.log('\n🔄 4. STATE MANAGEMENT ANALYSIS:');
    console.log('='.repeat(60));
    
    console.log(`📊 Frontend State Analysis:`);
    console.log(`   ✅ No Redux slice for questions (using local state)`);
    console.log(`   📱 Using useState for questions array`);
    console.log(`   🔄 fetchQuestions() called on component mount`);
    console.log(`   📊 questions.length used for counting`);
    
    // Check if there are any async issues
    console.log(`\n⏱️ Async Operations Check:`);
    console.log(`   📥 fetchQuestions() - API call timing`);
    console.log(`   📤 handleUpload() - File upload timing`);
    console.log(`   🔄 State updates after upload`);
    
    // 5. Identify specific issues
    console.log('\n🚨 5. IDENTIFIED ISSUES:');
    console.log('='.repeat(60));
    
    const globalIssues = [];
    
    // Check for data consistency
    const questionsWithoutText = questions.filter(q => !q.questionText || q.questionText.trim() === '');
    if (questionsWithoutText.length > 0) {
      globalIssues.push(`${questionsWithoutText.length} questions have empty text`);
    }
    
    const questionsWithoutOptions = questions.filter(q => !q.options || q.options.length === 0);
    if (questionsWithoutOptions.length > 0) {
      globalIssues.push(`${questionsWithoutOptions.length} questions have no options`);
    }
    
    const questionsWithoutCorrectAnswer = questions.filter(q => 
      !q.options || !q.options.some(opt => opt.isCorrect)
    );
    if (questionsWithoutCorrectAnswer.length > 0) {
      globalIssues.push(`${questionsWithoutCorrectAnswer.length} questions have no correct answer`);
    }
    
    const questionsWithoutMarks = questions.filter(q => 
      q.questionCorrectMarks === undefined || q.questionCorrectMarks === null
    );
    if (questionsWithoutMarks.length > 0) {
      globalIssues.push(`${questionsWithoutMarks.length} questions have no marks set`);
    }
    
    if (globalIssues.length > 0) {
      console.log('❌ CRITICAL ISSUES FOUND:');
      globalIssues.forEach(issue => console.log(`   🔴 ${issue}`));
    } else {
      console.log('✅ No critical data issues found');
    }
    
    // 6. Recommendations
    console.log('\n💡 6. RECOMMENDATIONS:');
    console.log('='.repeat(60));
    
    console.log('🔧 Frontend Fixes Needed:');
    console.log('   1. Add error handling for empty question data');
    console.log('   2. Add loading states during API calls');
    console.log('   3. Add validation before rendering questions');
    console.log('   4. Fix React className vs class attributes');
    console.log('   5. Add fallback content for missing data');
    
    console.log('\n🔧 Backend Fixes Needed:');
    console.log('   1. Validate question data before saving');
    console.log('   2. Ensure all required fields are populated');
    console.log('   3. Add data consistency checks');
    console.log('   4. Improve error responses');
    
    console.log('\n✅ DEBUGGING COMPLETE!');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Debug Error:', err);
    process.exit(1);
  }
}

debugFrontendDataFlow();
