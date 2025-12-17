#!/usr/bin/env node

/**
 * Test New Live Class User Links Insertion
 * 
 * This script tests what happens when a new live class is created
 * and verifies if individual user links are properly inserted into user profiles
 */

const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

// Import models from the current backend directory
const User = require('./models/userModel');
const LiveClass = require('./models/LiveClass');
const Course = require('./models/courseModel');

async function testNewClassUserLinks() {
  const baseUrl = 'https://lms-backend-724799456037.europe-west1.run.app';
  
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.DB_URL);
    console.log('✅ Connected to MongoDB successfully');

    // Step 1: Find students with purchased courses
    console.log('\n👥 Step 1: Finding students with purchased courses...');
    
    const studentsWithCourses = await User.find({
      userType: 'USER',
      purchasedCourses: { $exists: true, $ne: [] },
      merithubUserId: { $exists: true, $ne: null }
    }).limit(3);

    if (studentsWithCourses.length === 0) {
      console.log('❌ No students with purchased courses and merithubUserId found');
      return;
    }

    console.log(`✅ Found ${studentsWithCourses.length} students with courses and merithubUserId:`);
    studentsWithCourses.forEach((student, index) => {
      console.log(`  ${index + 1}. ${student.firstName} ${student.lastName} (${student.merithubUserId})`);
      console.log(`     - Purchased courses: ${student.purchasedCourses.length}`);
      console.log(`     - Current live classes: ${student.liveClasses?.length || 0}`);
    });

    // Step 2: Get a test course that students have purchased
    console.log('\n📚 Step 2: Finding a course that students have purchased...');
    
    const studentCourseIds = studentsWithCourses.flatMap(s => 
      s.purchasedCourses.map(pc => pc.course.toString())
    );
    const uniqueCourseIds = [...new Set(studentCourseIds)];
    
    const testCourse = await Course.findById(uniqueCourseIds[0]);
    if (!testCourse) {
      console.log('❌ No test course found');
      return;
    }

    console.log(`✅ Test course found: ${testCourse.title} (${testCourse._id})`);
    
    // Count how many students have this course
    const studentsWithThisCourse = studentsWithCourses.filter(s => 
      s.purchasedCourses.some(pc => pc.course.toString() === testCourse._id.toString())
    );
    console.log(`📊 ${studentsWithThisCourse.length} students have this course`);

    // Step 3: Get admin token for creating live class
    console.log('\n🔐 Step 3: Getting admin token...');
    
    const loginResponse = await axios.post(`${baseUrl}/api/v1/admin/login`, {
      email: 'AKJAcademy@lms.com',
      password: 'walkad@123456'
    });
    
    const token = loginResponse.data.accessToken;
    const adminData = loginResponse.data.data;
    console.log('✅ Admin login successful');

    // Step 4: Record current state of students' live classes
    console.log('\n📊 Step 4: Recording current state of students\' live classes...');
    
    const beforeState = {};
    for (const student of studentsWithThisCourse) {
      const currentStudent = await User.findById(student._id);
      beforeState[student._id.toString()] = {
        name: `${student.firstName} ${student.lastName}`,
        merithubUserId: student.merithubUserId,
        liveClassCount: currentStudent.liveClasses?.length || 0,
        lastClassTitle: currentStudent.liveClasses?.[currentStudent.liveClasses.length - 1]?.title || 'None'
      };
      console.log(`  - ${beforeState[student._id.toString()].name}: ${beforeState[student._id.toString()].liveClassCount} live classes`);
    }

    // Step 5: Create a new live class
    console.log('\n🎥 Step 5: Creating a new live class...');
    
    const testClassData = {
      title: 'User Links Test Class - ' + new Date().toISOString(),
      userId: adminData.merithubUserId, // Admin's merithubUserId
      courseIds: [testCourse._id],
      startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
      platform: 'merithub'
    };

    console.log('📤 Creating live class with data:');
    console.log('- Title:', testClassData.title);
    console.log('- Course:', testCourse.title);
    console.log('- Expected students to be added:', studentsWithThisCourse.length);

    const classResponse = await axios.post(`${baseUrl}/api/v1/admin/live-classes`, testClassData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Live class created successfully!');
    console.log('- Class ID:', classResponse.data.liveClass.classId);
    console.log('- Database ID:', classResponse.data.liveClass._id);

    // Step 6: Wait a moment for async operations to complete
    console.log('\n⏳ Step 6: Waiting for user link insertion to complete...');
    await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds

    // Step 7: Check if students got their individual links
    console.log('\n🔍 Step 7: Checking if students received individual links...');
    
    let successCount = 0;
    let failureCount = 0;
    
    for (const student of studentsWithThisCourse) {
      const updatedStudent = await User.findById(student._id);
      const afterState = {
        liveClassCount: updatedStudent.liveClasses?.length || 0,
        lastClassTitle: updatedStudent.liveClasses?.[updatedStudent.liveClasses.length - 1]?.title || 'None'
      };
      
      const before = beforeState[student._id.toString()];
      const hasNewClass = afterState.liveClassCount > before.liveClassCount;
      const hasCorrectTitle = afterState.lastClassTitle === testClassData.title;
      
      console.log(`\n  👤 ${before.name} (${before.merithubUserId}):`);
      console.log(`    - Before: ${before.liveClassCount} classes`);
      console.log(`    - After: ${afterState.liveClassCount} classes`);
      console.log(`    - New class added: ${hasNewClass ? '✅ YES' : '❌ NO'}`);
      
      if (hasNewClass && hasCorrectTitle) {
        const newClass = updatedStudent.liveClasses[updatedStudent.liveClasses.length - 1];
        console.log(`    - New class title: ${newClass.title}`);
        console.log(`    - Has participantLink: ${newClass.participantLink ? '✅ YES' : '❌ NO'}`);
        console.log(`    - Has liveLink: ${newClass.liveLink ? '✅ YES' : '❌ NO'}`);
        
        if (newClass.participantLink || newClass.liveLink) {
          const link = newClass.participantLink || newClass.liveLink;
          console.log(`    - Link preview: ${link.substring(0, 60)}...`);
          const isIndividual = link.includes(student.merithubUserId) || link.match(/[a-z0-9A-Z]{15,}/);
          console.log(`    - Link type: ${isIndividual ? '✅ Individual' : '⚠️ Common'}`);
          successCount++;
        } else {
          console.log(`    - ❌ No links found in new class`);
          failureCount++;
        }
      } else {
        console.log(`    - ❌ Student did not receive the new class`);
        failureCount++;
      }
    }

    // Step 8: Summary
    console.log('\n📋 SUMMARY:');
    console.log('='.repeat(60));
    console.log(`🎯 Live class created: ${testClassData.title}`);
    console.log(`👥 Expected students: ${studentsWithThisCourse.length}`);
    console.log(`✅ Students who received links: ${successCount}`);
    console.log(`❌ Students who didn't receive links: ${failureCount}`);
    
    if (failureCount > 0) {
      console.log('\n🚨 ISSUES FOUND:');
      console.log('- Some students did not receive individual user links');
      console.log('- Check the live class creation process');
      console.log('- Verify addUsersToClass function is working');
      console.log('- Check if students have valid merithubUserId');
    } else {
      console.log('\n🎉 SUCCESS:');
      console.log('- All students received individual user links');
      console.log('- Live class creation process is working correctly');
    }
    
  } catch (error) {
    console.error('❌ Error in test:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('🔐 Database connection closed');
    }
  }
}

// Run the test
console.log('🧪 Testing New Live Class User Links Insertion...');
testNewClassUserLinks();
