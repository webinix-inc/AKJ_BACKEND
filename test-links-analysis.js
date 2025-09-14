/**
 * Live Class Link Analysis Test
 * This script analyzes the current state of live class links in the database
 */

const mongoose = require('mongoose');

// Import models
const User = require('./models/userModel');
const LiveClass = require('./models/LiveClass');

// Use the same connection string pattern as server.js
const DB_URL = process.env.DB_URL || "mongodb://localhost:27017/wakad_test";

async function connectDB() {
  try {
    await mongoose.connect(DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB:', mongoose.connection.host);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    // Try with a default local connection
    try {
      await mongoose.connect("mongodb://127.0.0.1:27017/wakad", {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      console.log('✅ Connected to local MongoDB');
    } catch (localError) {
      console.error('❌ Local MongoDB connection also failed:', localError.message);
      process.exit(1);
    }
  }
}

async function analyzeLiveClassLinks() {
  await connectDB();
  
  console.log('\n🔍 LIVE CLASS LINK ANALYSIS\n');
  console.log('='.repeat(50));
  
  try {
    // 1. Analyze LiveClass collection
    console.log('\n📋 LIVE CLASS COLLECTION ANALYSIS:');
    const totalLiveClasses = await LiveClass.countDocuments();
    console.log(`Total live classes in database: ${totalLiveClasses}`);
    
    if (totalLiveClasses > 0) {
      const zoomClasses = await LiveClass.countDocuments({ platform: 'zoom' });
      const merithubClasses = await LiveClass.countDocuments({ platform: 'merithub' });
      const unknownPlatform = await LiveClass.countDocuments({ 
        $or: [
          { platform: { $exists: false } },
          { platform: { $nin: ['zoom', 'merithub'] } }
        ]
      });
      
      console.log(`  📺 Zoom classes: ${zoomClasses}`);
      console.log(`  🎥 MeritHub classes: ${merithubClasses}`);
      console.log(`  ❓ Unknown platform: ${unknownPlatform}`);
      
      // Sample live classes
      console.log('\n📋 SAMPLE LIVE CLASSES:');
      const sampleClasses = await LiveClass.find({}).limit(3).sort({ createdAt: -1 });
      
      sampleClasses.forEach((liveClass, index) => {
        console.log(`\n${index + 1}. ${liveClass.title}`);
        console.log(`   Platform: ${liveClass.platform || 'not set'}`);
        console.log(`   Class ID: ${liveClass.classId || 'none'}`);
        console.log(`   Course IDs: ${liveClass.courseIds?.length || 0} courses`);
        console.log(`   Start Time: ${liveClass.startTime}`);
        console.log(`   Live Link: ${liveClass.liveLink ? 'YES' : 'NO'}`);
        console.log(`   Instructor Link: ${liveClass.instructorLink ? 'YES' : 'NO'}`);
        
        if (liveClass.platform === 'zoom') {
          console.log(`   Zoom Meeting Link: ${liveClass.zoomMeetingLink ? 'YES' : 'NO'}`);
          console.log(`   Zoom Meeting ID: ${liveClass.zoomMeetingId || 'none'}`);
        }
        
        if (liveClass.liveLink) {
          const linkType = liveClass.liveLink.includes('zoom.us') ? 'ZOOM' : 
                          liveClass.liveLink.includes('merithub.com') ? 'MERITHUB' : 'OTHER';
          console.log(`   Link Type: ${linkType}`);
          console.log(`   Link Preview: ${liveClass.liveLink.substring(0, 60)}...`);
        }
      });
    }
    
    // 2. Analyze User collection
    console.log('\n👥 USER LIVE CLASSES ANALYSIS:');
    const totalUsers = await User.countDocuments();
    const usersWithLiveClasses = await User.countDocuments({
      'liveClasses.0': { $exists: true }
    });
    
    console.log(`Total users: ${totalUsers}`);
    console.log(`Users with live classes: ${usersWithLiveClasses}`);
    
    if (usersWithLiveClasses > 0) {
      // Platform distribution in user data
      const usersWithZoom = await User.countDocuments({
        'liveClasses.platform': 'zoom'
      });
      const usersWithMeritHub = await User.countDocuments({
        'liveClasses.platform': 'merithub'
      });
      const usersWithOldParticipantLink = await User.countDocuments({
        'liveClasses.participantLink': { $exists: true }
      });
      
      console.log(`  📺 Users with Zoom classes: ${usersWithZoom}`);
      console.log(`  🎥 Users with MeritHub classes: ${usersWithMeritHub}`);
      console.log(`  ⚠️  Users with old participant links: ${usersWithOldParticipantLink}`);
      
      // Sample user with live classes
      console.log('\n👤 SAMPLE USER WITH LIVE CLASSES:');
      const sampleUser = await User.findOne({
        'liveClasses.0': { $exists: true }
      });
      
      if (sampleUser) {
        console.log(`User: ${sampleUser.firstName} ${sampleUser.lastName}`);
        console.log(`Email: ${sampleUser.email}`);
        console.log(`Total live classes: ${sampleUser.liveClasses.length}`);
        
        // Analyze each live class
        sampleUser.liveClasses.slice(0, 3).forEach((liveClass, index) => {
          console.log(`\n  ${index + 1}. ${liveClass.title}`);
          console.log(`     Platform: ${liveClass.platform || 'not set'}`);
          console.log(`     Class ID: ${liveClass.classId || 'none'}`);
          console.log(`     Live Link: ${liveClass.liveLink ? 'YES' : 'NO'}`);
          console.log(`     Participant Link (old): ${liveClass.participantLink ? 'YES' : 'NO'}`);
          console.log(`     Start Time: ${liveClass.startTime}`);
          
          if (liveClass.liveLink) {
            const linkType = liveClass.liveLink.includes('zoom.us') ? 'ZOOM' : 
                            liveClass.liveLink.includes('merithub.com') ? 'MERITHUB' : 'OTHER';
            console.log(`     Link Type: ${linkType}`);
            console.log(`     Link Preview: ${liveClass.liveLink.substring(0, 50)}...`);
          }
          
          if (liveClass.participantLink) {
            console.log(`     ⚠️  OLD LINK: ${liveClass.participantLink.substring(0, 50)}...`);
          }
        });
      }
    }
    
    // 3. Check for issues
    console.log('\n🔍 ISSUE DETECTION:');
    
    // Classes without liveLink
    const classesWithoutLiveLink = await User.countDocuments({
      'liveClasses': {
        $elemMatch: {
          'liveLink': { $exists: false }
        }
      }
    });
    
    // Zoom classes with wrong link type
    const zoomWithMeritHubLink = await User.countDocuments({
      'liveClasses': {
        $elemMatch: {
          'platform': 'zoom',
          'liveLink': { $regex: 'merithub.com', $options: 'i' }
        }
      }
    });
    
    // MeritHub classes with wrong link type
    const meritHubWithZoomLink = await User.countDocuments({
      'liveClasses': {
        $elemMatch: {
          'platform': 'merithub',
          'liveLink': { $regex: 'zoom.us', $options: 'i' }
        }
      }
    });
    
    // Duplicate classes (same title and start time)
    const duplicateClasses = await User.aggregate([
      { $unwind: '$liveClasses' },
      {
        $group: {
          _id: {
            title: '$liveClasses.title',
            startTime: '$liveClasses.startTime',
            userId: '$_id'
          },
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gt: 1 } } },
      { $count: 'duplicates' }
    ]);
    
    console.log(`❌ Classes without liveLink: ${classesWithoutLiveLink}`);
    console.log(`❌ Zoom classes with MeritHub links: ${zoomWithMeritHubLink}`);
    console.log(`❌ MeritHub classes with Zoom links: ${meritHubWithZoomLink}`);
    console.log(`❌ Users with duplicate classes: ${duplicateClasses[0]?.duplicates || 0}`);
    
    // 4. Summary and recommendations
    console.log('\n📊 SUMMARY:');
    const totalIssues = classesWithoutLiveLink + zoomWithMeritHubLink + meritHubWithZoomLink + (duplicateClasses[0]?.duplicates || 0);
    
    if (totalIssues === 0) {
      console.log('✅ No issues detected! Link generation is working correctly.');
    } else {
      console.log(`⚠️  ${totalIssues} issues detected. Consider running migration script.`);
    }
    
    console.log('\n🎯 RECOMMENDATIONS:');
    if (usersWithOldParticipantLink > 0) {
      console.log('1. Run migration script to clean up old participantLink fields');
    }
    if (duplicateClasses[0]?.duplicates > 0) {
      console.log('2. Run deduplication script to remove duplicate classes');
    }
    if (classesWithoutLiveLink > 0) {
      console.log('3. Check classes without liveLink and regenerate if needed');
    }
    if (totalIssues === 0) {
      console.log('✅ System is working correctly - no action needed!');
    }
    
  } catch (error) {
    console.error('❌ Analysis error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the analysis
console.log('🚀 Starting Live Class Link Analysis...');
analyzeLiveClassLinks().catch(console.error);
