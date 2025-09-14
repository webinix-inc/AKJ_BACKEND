/**
 * Test Controller for Live Class Link Analysis
 */

const User = require('../models/userModel');
const LiveClass = require('../models/LiveClass');

/**
 * Analyze live class links in the database
 */
const analyzeLiveClassLinks = async (req, res) => {
  try {
    console.log('🔍 Starting live class link analysis...');
    
    const analysis = {
      timestamp: new Date().toISOString(),
      liveClassCollection: {},
      userCollection: {},
      issues: {},
      recommendations: []
    };
    
    // 1. Analyze LiveClass collection
    const totalLiveClasses = await LiveClass.countDocuments();
    const zoomClasses = await LiveClass.countDocuments({ platform: 'zoom' });
    const merithubClasses = await LiveClass.countDocuments({ platform: 'merithub' });
    const unknownPlatform = await LiveClass.countDocuments({ 
      $or: [
        { platform: { $exists: false } },
        { platform: { $nin: ['zoom', 'merithub'] } }
      ]
    });
    
    analysis.liveClassCollection = {
      total: totalLiveClasses,
      zoom: zoomClasses,
      merithub: merithubClasses,
      unknown: unknownPlatform
    };
    
    // Get sample live classes
    const sampleClasses = await LiveClass.find({}).limit(3).sort({ createdAt: -1 });
    analysis.liveClassCollection.samples = sampleClasses.map(liveClass => ({
      title: liveClass.title,
      platform: liveClass.platform || 'not set',
      classId: liveClass.classId || 'none',
      courseIds: liveClass.courseIds?.length || 0,
      startTime: liveClass.startTime,
      hasLiveLink: !!liveClass.liveLink,
      hasInstructorLink: !!liveClass.instructorLink,
      linkType: liveClass.liveLink ? (
        liveClass.liveLink.includes('zoom.us') ? 'ZOOM' : 
        liveClass.liveLink.includes('merithub.com') ? 'MERITHUB' : 'OTHER'
      ) : 'NONE',
      linkPreview: liveClass.liveLink ? liveClass.liveLink.substring(0, 60) + '...' : null,
      zoomMeetingLink: liveClass.platform === 'zoom' ? !!liveClass.zoomMeetingLink : null,
      zoomMeetingId: liveClass.platform === 'zoom' ? liveClass.zoomMeetingId || 'none' : null
    }));
    
    // 2. Analyze User collection
    const totalUsers = await User.countDocuments();
    const usersWithLiveClasses = await User.countDocuments({
      'liveClasses.0': { $exists: true }
    });
    const usersWithZoom = await User.countDocuments({
      'liveClasses.platform': 'zoom'
    });
    const usersWithMeritHub = await User.countDocuments({
      'liveClasses.platform': 'merithub'
    });
    const usersWithOldParticipantLink = await User.countDocuments({
      'liveClasses.participantLink': { $exists: true }
    });
    
    analysis.userCollection = {
      totalUsers,
      usersWithLiveClasses,
      usersWithZoom,
      usersWithMeritHub,
      usersWithOldParticipantLink
    };
    
    // Get sample user with live classes
    const sampleUser = await User.findOne({
      'liveClasses.0': { $exists: true }
    });
    
    if (sampleUser) {
      analysis.userCollection.sampleUser = {
        name: `${sampleUser.firstName} ${sampleUser.lastName}`,
        email: sampleUser.email,
        totalLiveClasses: sampleUser.liveClasses.length,
        liveClasses: sampleUser.liveClasses.slice(0, 3).map(liveClass => ({
          title: liveClass.title,
          platform: liveClass.platform || 'not set',
          classId: liveClass.classId || 'none',
          hasLiveLink: !!liveClass.liveLink,
          hasOldParticipantLink: !!liveClass.participantLink,
          startTime: liveClass.startTime,
          linkType: liveClass.liveLink ? (
            liveClass.liveLink.includes('zoom.us') ? 'ZOOM' : 
            liveClass.liveLink.includes('merithub.com') ? 'MERITHUB' : 'OTHER'
          ) : 'NONE',
          linkPreview: liveClass.liveLink ? liveClass.liveLink.substring(0, 50) + '...' : null,
          oldLinkPreview: liveClass.participantLink ? liveClass.participantLink.substring(0, 50) + '...' : null
        }))
      };
    }
    
    // 3. Check for issues
    const classesWithoutLiveLink = await User.countDocuments({
      'liveClasses': {
        $elemMatch: {
          'liveLink': { $exists: false }
        }
      }
    });
    
    const zoomWithMeritHubLink = await User.countDocuments({
      'liveClasses': {
        $elemMatch: {
          'platform': 'zoom',
          'liveLink': { $regex: 'merithub.com', $options: 'i' }
        }
      }
    });
    
    const meritHubWithZoomLink = await User.countDocuments({
      'liveClasses': {
        $elemMatch: {
          'platform': 'merithub',
          'liveLink': { $regex: 'zoom.us', $options: 'i' }
        }
      }
    });
    
    // Check for duplicate classes
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
    
    analysis.issues = {
      classesWithoutLiveLink,
      zoomWithMeritHubLink,
      meritHubWithZoomLink,
      duplicateClasses: duplicateClasses[0]?.duplicates || 0
    };
    
    // 4. Generate recommendations
    const totalIssues = classesWithoutLiveLink + zoomWithMeritHubLink + meritHubWithZoomLink + (duplicateClasses[0]?.duplicates || 0);
    
    if (usersWithOldParticipantLink > 0) {
      analysis.recommendations.push('Run migration script to clean up old participantLink fields');
    }
    if (duplicateClasses[0]?.duplicates > 0) {
      analysis.recommendations.push('Run deduplication script to remove duplicate classes');
    }
    if (classesWithoutLiveLink > 0) {
      analysis.recommendations.push('Check classes without liveLink and regenerate if needed');
    }
    if (totalIssues === 0) {
      analysis.recommendations.push('✅ System is working correctly - no action needed!');
    }
    
    analysis.summary = {
      totalIssues,
      status: totalIssues === 0 ? 'HEALTHY' : 'NEEDS_ATTENTION'
    };
    
    console.log('✅ Live class link analysis completed');
    console.log(`📊 Summary: ${totalIssues} issues found`);
    
    res.status(200).json({
      message: 'Live class link analysis completed',
      analysis
    });
    
  } catch (error) {
    console.error('❌ Analysis error:', error);
    res.status(500).json({
      error: 'Analysis failed',
      details: error.message
    });
  }
};

/**
 * Create a test live class for testing purposes
 */
const createTestLiveClass = async (req, res) => {
  try {
    const { platform = 'zoom', title = 'Test Live Class' } = req.body;
    
    console.log(`🧪 Creating test ${platform} live class...`);
    
    // Find a user with purchased courses
    const testUser = await User.findOne({
      'purchasedCourses.0': { $exists: true }
    });
    
    if (!testUser) {
      return res.status(400).json({
        error: 'No test user found with purchased courses'
      });
    }
    
    const courseId = testUser.purchasedCourses[0].course;
    const startTime = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    
    const testData = {
      title: `${title} - ${platform.toUpperCase()} - ${new Date().toISOString()}`,
      courseIds: [courseId],
      startTime: startTime.toISOString(),
      platform
    };
    
    if (platform === 'zoom') {
      testData.zoomMeetingLink = 'https://zoom.us/j/1234567890?pwd=test123';
      testData.zoomMeetingId = '1234567890';
      testData.zoomPasscode = 'test123';
    } else if (platform === 'merithub') {
      // For MeritHub, we need a valid instructor user ID
      const instructor = await User.findOne({ 
        merithubUserId: { $exists: true },
        merithubUserToken: { $exists: true }
      });
      
      if (!instructor) {
        return res.status(400).json({
          error: 'No instructor found with MeritHub credentials for testing'
        });
      }
      
      testData.userId = instructor.merithubUserId;
    }
    
    console.log('🧪 Test data:', testData);
    
    // Make API call to create live class
    const response = await fetch(`${req.protocol}://${req.get('host')}/api/v1/admin/live-classes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Test live class created successfully');
      res.status(201).json({
        message: 'Test live class created successfully',
        testData,
        result
      });
    } else {
      console.error('❌ Failed to create test live class:', result);
      res.status(400).json({
        error: 'Failed to create test live class',
        details: result
      });
    }
    
  } catch (error) {
    console.error('❌ Test creation error:', error);
    res.status(500).json({
      error: 'Test creation failed',
      details: error.message
    });
  }
};

module.exports = {
  analyzeLiveClassLinks,
  createTestLiveClass
};
