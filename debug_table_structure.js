require('dotenv').config();
const mongoose = require('mongoose');
const Question = require('./models/questionModel');

async function debugTableStructure() {
  try {
    await mongoose.connect(process.env.DB_URL);
    console.log('🔍 DEBUGGING TABLE STRUCTURE...\n');
    
    // Get the most recent questions with table data
    const questionsWithTables = await Question.find({ 
      tables: { $exists: true, $ne: [] } 
    })
    .sort({ createdAt: -1 })
    .limit(3)
    .lean();
    
    if (questionsWithTables.length === 0) {
      console.log('❌ No questions with table data found');
      process.exit(1);
    }
    
    console.log(`📊 Found ${questionsWithTables.length} questions with table data\n`);
    
    questionsWithTables.forEach((question, qIndex) => {
      console.log(`🔍 QUESTION ${qIndex + 1} (ID: ${question._id}):`);
      console.log(`📝 Question Text: "${question.questionText?.substring(0, 100)}..."`);
      console.log(`📊 Tables Count: ${question.tables?.length || 0}`);
      
      if (question.tables && question.tables.length > 0) {
        question.tables.forEach((table, tIndex) => {
          console.log(`\n📋 TABLE ${tIndex + 1} STRUCTURE:`);
          console.log(`   📊 Table Type: ${typeof table}`);
          console.log(`   📊 Table Length: ${Array.isArray(table) ? table.length : 'Not an array'}`);
          
          if (Array.isArray(table)) {
            table.forEach((row, rIndex) => {
              console.log(`   📝 Row ${rIndex + 1}:`, JSON.stringify(row));
              
              if (Array.isArray(row)) {
                row.forEach((cell, cIndex) => {
                  console.log(`      Cell ${cIndex + 1}: "${cell}"`);
                });
              }
            });
          } else {
            console.log(`   📄 Table Content: ${JSON.stringify(table).substring(0, 200)}...`);
          }
        });
      }
      
      console.log(`\n📊 OPTIONS STRUCTURE:`);
      if (question.options && question.options.length > 0) {
        question.options.forEach((option, oIndex) => {
          console.log(`   ${String.fromCharCode(65 + oIndex)}) "${option.optionText}" (Correct: ${option.isCorrect})`);
        });
      } else {
        console.log(`   ❌ No options found`);
      }
      
      console.log(`\n${'='.repeat(80)}\n`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Debug Error:', err);
    process.exit(1);
  }
}

debugTableStructure();
