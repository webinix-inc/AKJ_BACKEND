const { verifyFileAccessToken } = require("../utils/streamUtils");
const { generateFileAccessToken } = require("../utils/streamUtils");
const { generateSignedUrl } = require("../utils/streamUtils");
const mime = require("mime-types");

const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const s3 = new S3Client({ 
  region: process.env.AWS_REGION,
  requestHandler: {
    requestTimeout: 30000, // 30 seconds timeout instead of 120 seconds
    connectionTimeout: 5000 // 5 seconds connection timeout
  }
});
const File = require("../models/fileModel");
const User = require("../models/userModel");
const Folder = require("../models/folderModel");
const Course = require("../models/courseModel");

// 🔥 NEW: Enhanced function to check installment payment status and due dates
const checkInstallmentPaymentStatus = async (userId, courseId) => {
  try {
    const Installment = require('../models/installmentModel');
    
    // Find user's installment plans for this course
    const installmentPlans = await Installment.find({ 
      courseId,
      'userPayments.userId': userId 
    });
    
    if (!installmentPlans.length) {
      // No installment plans found, check if user paid in full
      return { hasAccess: true, reason: 'FULL_PAYMENT' };
    }
    
    const currentDate = new Date();
    
    for (const plan of installmentPlans) {
      const userPayments = plan.userPayments.filter(p => p.userId.toString() === userId);
      
      if (!userPayments.length) continue;
      
      // Calculate due dates based on first payment date
      const firstPayment = userPayments.find(p => p.installmentIndex === 0);
      if (!firstPayment || !firstPayment.isPaid) {
        return { hasAccess: false, reason: 'FIRST_INSTALLMENT_UNPAID', nextDue: 'Immediate' };
      }
      
      const firstPaymentDate = firstPayment.paymentDate;
      let hasOverduePayment = false;
      let nextDueDate = null;
      
      // Check each installment's due date
      for (let i = 0; i < plan.installments.length; i++) {
        const installment = plan.installments[i];
        const userPayment = userPayments.find(p => p.installmentIndex === i);
        
        if (userPayment && userPayment.isPaid) {
          continue; // This installment is paid
        }
        
        // Calculate due date: DOP + i months
        let dueDate = new Date(firstPaymentDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        
        if (currentDate > dueDate) {
          // Payment is overdue
          hasOverduePayment = true;
          console.log(`⚠️ Overdue payment detected for user ${userId}, course ${courseId}, installment ${i + 1}`);
          break;
        } else if (!nextDueDate || dueDate < nextDueDate) {
          nextDueDate = dueDate;
        }
      }
      
      if (hasOverduePayment) {
        return { 
          hasAccess: false, 
          reason: 'INSTALLMENT_OVERDUE',
          message: 'Please pay your overdue installment to continue accessing the course',
          planType: plan.planType
        };
      }
    }
    
    return { hasAccess: true, reason: 'PAYMENTS_CURRENT' };
  } catch (error) {
    console.error('Error checking installment payment status:', error);
    return { hasAccess: false, reason: 'ERROR', error: error.message };
  }
};

// Helper function to check if user has access to a file
const checkUserFileAccess = async (userId, fileId) => {
  try {
    const user = await User.findById(userId);
    if (!user) return { hasAccess: false, reason: 'USER_NOT_FOUND' };

    // Admin users have access to all files
    if (user.userType === "ADMIN") {
      return { hasAccess: true, reason: 'ADMIN_ACCESS' };
    }

    // Find the file and trace it back to its course
    const file = await File.findById(fileId);
    if (!file) return { hasAccess: false, reason: 'FILE_NOT_FOUND' };

    // Find the folder containing this file
    const folder = await Folder.findOne({ files: fileId });
    if (!folder) return { hasAccess: false, reason: 'FOLDER_NOT_FOUND' };

    // Check if the immediate folder or any parent folder is an assignment system folder
    let currentFolder = folder;
    let isAssignmentFile = false;
    
    // Check the current folder and traverse up to root
    while (currentFolder) {
      const isAssignmentSystemFolder = currentFolder.isSystemFolder && 
        (currentFolder.folderType === 'assignments' || currentFolder.folderType === 'student_assignments');
      
      if (isAssignmentSystemFolder) {
        isAssignmentFile = true;
        break;
      }
      
      if (currentFolder.parentFolderId) {
        currentFolder = await Folder.findById(currentFolder.parentFolderId);
      } else {
        break;
      }
    }
    
    // If this is an assignment file, handle access differently
    if (isAssignmentFile) {
      console.log(`🔍 [DEBUG] Assignment file access check for user ${userId} (${user.userType}), file ${fileId}`);
      
      // For assignment files, admins have full access, users have access to their own files
      if (user.userType === "ADMIN") {
        console.log(`✅ [DEBUG] Admin access granted for assignment file ${fileId}`);
        return { hasAccess: true, reason: 'ADMIN_ASSIGNMENT_ACCESS' };
      }
      
      // For regular users, check if they have access to assignment files
      // This could be enhanced to check if the user is the owner of the assignment
      console.log(`✅ [DEBUG] User access granted for assignment file ${fileId}`);
      return { hasAccess: true, reason: 'ASSIGNMENT_FILE_ACCESS' };
    }

    // Find the root folder for regular course files
    if (!currentFolder) return { hasAccess: false, reason: 'ROOT_FOLDER_NOT_FOUND' };

    // Find the course associated with this root folder
    const course = await Course.findOne({ rootFolder: currentFolder._id });
    if (!course) return { hasAccess: false, reason: 'COURSE_NOT_FOUND' };

    // Check if course is published (but allow batch courses even if unpublished)
    if (!course.isPublished && course.courseType !== "Batch") {
      return { hasAccess: false, reason: 'COURSE_NOT_PUBLISHED' };
    }

    // Check if user has purchased this course
    const purchasedCourse = user.purchasedCourses.find(
      (pc) => pc.course.toString() === course._id.toString()
    );
    
    if (!purchasedCourse) {
      return { hasAccess: false, reason: 'COURSE_NOT_PURCHASED' };
    }
    
    // 🔥 FIXED: Check installment payment status for course access (using correct field name)
    console.log(`💳 Payment info for user ${userId}, course ${course._id}:`, {
      paymentType: purchasedCourse.paymentType,
      totalInstallments: purchasedCourse.totalInstallments,
      amountPaid: purchasedCourse.amountPaid
    });
    
    if (purchasedCourse.paymentType === 'installment' && purchasedCourse.totalInstallments > 0) {
      console.log(`🔍 Checking installment payment status for user ${userId}, course ${course._id}`);
      const paymentStatus = await checkInstallmentPaymentStatus(userId, course._id);
      
      if (!paymentStatus.hasAccess) {
        console.log(`🚫 Access denied due to installment payment: ${paymentStatus.reason}`);
        return paymentStatus;
      }
    } else {
      console.log(`✅ Full payment user - skipping installment status check`);
    }

    // 🎯 BATCH COURSE LOGIC: Check if file should be accessible
    const isBatchCourse = course.courseType === "Batch";
    let fileAccessible = true;
    let accessReason = 'COURSE_PURCHASED';

    if (isBatchCourse) {
      // For batch courses: files are unlocked by default unless manually locked by admin
      const wasManuallyLocked = file.isViewable === false;
      
      if (wasManuallyLocked) {
        fileAccessible = false;
        accessReason = 'FILE_MANUALLY_LOCKED';
        console.log(`🔒 Batch course file manually locked by admin: ${file.name}`);
      } else {
        fileAccessible = true;
        accessReason = 'BATCH_DEFAULT_UNLOCK';
        console.log(`🔓 Batch course file accessible by default: ${file.name}`);
      }
    } else {
      // 📚 REGULAR COURSE LOGIC: For purchased users, unlock files regardless of original isViewable
      // This matches the folder contents logic where purchased users get access to course content
      fileAccessible = true; // User has purchased the course, so grant access
      accessReason = file.isViewable ? 'FILE_UNLOCKED' : 'FILE_UNLOCKED_BY_PURCHASE';
      console.log(`🔓 Regular course file accessible for purchased user: ${file.name} (original isViewable: ${file.isViewable})`);
    }

    return { 
      hasAccess: true, 
      reason: accessReason, 
      courseType: course.courseType,
      fileAccessible: fileAccessible,
      file: file
    };
  } catch (error) {
    console.error("Error checking user file access:", error);
    return { hasAccess: false, reason: 'ERROR', error: error.message };
  }
  };

// 🔥 NEW: API endpoint to check course access status
exports.checkCourseAccess = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { userId } = req.body;
    
    if (!userId || !courseId) {
      return res.status(400).json({ 
        message: 'userId and courseId are required',
        hasAccess: false 
      });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        hasAccess: false 
      });
    }
    
    // Admin users have access to all courses
    if (user.userType === "ADMIN") {
      return res.status(200).json({ 
        hasAccess: true, 
        reason: 'ADMIN_ACCESS',
        message: 'Admin has full access to all courses'
      });
    }
    
    // Find and check if course exists and is published
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(200).json({ 
        hasAccess: false, 
        reason: 'COURSE_NOT_FOUND',
        message: 'Course not found'
      });
    }
    
    // Check if course is published (but allow batch courses even if unpublished)
    if (!course.isPublished && course.courseType !== "Batch") {
      return res.status(200).json({ 
        hasAccess: false, 
        reason: 'COURSE_NOT_PUBLISHED',
        message: 'Course is not published'
      });
    }
    
    // Check if user has purchased this course
    const purchasedCourse = user.purchasedCourses.find(
      (pc) => pc.course.toString() === courseId.toString()
    );
    
    if (!purchasedCourse) {
      return res.status(200).json({ 
        hasAccess: false, 
        reason: 'COURSE_NOT_PURCHASED',
        message: 'Course not purchased by user'
      });
    }
    
    // Check installment payment status
    if (purchasedCourse.paymentType === 'installment' && purchasedCourse.totalInstallments > 0) {
      const paymentStatus = await checkInstallmentPaymentStatus(userId, courseId);
      
      return res.status(200).json({
        hasAccess: paymentStatus.hasAccess,
        reason: paymentStatus.reason,
        message: paymentStatus.message || (paymentStatus.hasAccess ? 'Course access granted' : 'Course access denied'),
        ...(paymentStatus.planType && { planType: paymentStatus.planType }),
        purchaseDate: purchasedCourse.purchaseDate,
        paymentType: purchasedCourse.paymentType,
        totalInstallments: purchasedCourse.totalInstallments
      });
    }
    
    // Full payment course - grant access
    return res.status(200).json({ 
      hasAccess: true, 
      reason: 'FULL_PAYMENT',
      message: 'Course access granted - full payment completed',
      purchaseDate: purchasedCourse.purchaseDate,
      paymentType: purchasedCourse.paymentType || 'full'
    });
    
  } catch (error) {
    console.error('Error checking course access:', error);
    res.status(500).json({ 
      message: 'Error checking course access', 
      hasAccess: false,
      error: error.message 
    });
  }
};

exports.streamFile = async (req, res) => {
  // Handle preflight OPTIONS requests for CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Range, Content-Length');
    return res.status(200).end();
  }

  const { token } = req.params;

  const { valid, payload } = verifyFileAccessToken(token);

  if (!valid) {
    return res.status(401).json({ message: "Unauthorized or token expired" });
  }

  const { fileId, userId, isDownloadable } = payload;

  try {
    const file = await File.findById(fileId);
    console.log("getting this file on stream :", file);

    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    // Enhanced access control - check both file.isViewable and user's course access
    const user = await User.findById(userId);
    const isAdmin = user && user.userType === "ADMIN";
    
    // Apply same access control logic as generateFileToken
    if (!isAdmin) {
      const accessResult = await checkUserFileAccess(userId, fileId);
      
      // Use the new fileAccessible property from checkUserFileAccess
      let shouldAllowAccess = false;

      if (accessResult.hasAccess) {
        // User has course access - check if file is accessible
        shouldAllowAccess = accessResult.fileAccessible !== false;
        
        if (shouldAllowAccess) {
          console.log(`✅ File access granted for user ${userId}, file ${fileId}: ${accessResult.reason}`);
        } else {
          console.log(`🔒 File access denied for user ${userId}, file ${fileId}: ${accessResult.reason}`);
        }
      } else {
        // User doesn't have course access - only allow if file is publicly viewable
        shouldAllowAccess = file.isViewable;
        if (shouldAllowAccess) {
          console.log(`✅ File access granted for user ${userId}, file ${fileId}: File is publicly viewable`);
        }
      }

      if (!shouldAllowAccess) {
        // If file is not accessible
        let errorMessage = "Access Denied: File is not accessible";
        let statusCode = 403;
        
        if (!accessResult.hasAccess) {
          // User doesn't have course access
          switch (accessResult.reason) {
            case 'INSTALLMENT_OVERDUE':
              errorMessage = `Course access suspended: ${accessResult.message}. Plan: ${accessResult.planType}`;
              statusCode = 402; // Payment Required
              break;
            case 'FIRST_INSTALLMENT_UNPAID':
              errorMessage = "Course access suspended: First installment payment is required";
              statusCode = 402;
              break;
            case 'COURSE_NOT_PURCHASED':
              errorMessage = "Access Denied: Course not purchased";
              break;
            default:
              errorMessage = `Access Denied: ${accessResult.reason}`;
          }
        } else {
          // User has course access but file is locked
          switch (accessResult.reason) {
            case 'FILE_MANUALLY_LOCKED':
              errorMessage = "Access Denied: File has been manually locked by admin";
              break;
            case 'FILE_LOCKED':
              errorMessage = "Access Denied: File is locked";
              break;
            default:
              errorMessage = "Access Denied: File is not accessible";
          }
        }
        
        console.log(`🚫 File access denied for user ${userId}, file ${fileId}: ${accessResult.reason}`);
        
        return res.status(statusCode).json({ 
          message: errorMessage,
          reason: accessResult.reason,
          ...(accessResult.planType && { planType: accessResult.planType })
        });
      }
    }

    // All files are now stored on S3 (including assignments)
    const key = decodeURIComponent(file.url.split(".com/")[1]); // Important decodeURIComponent
    const fileExtension = file.url.split(".").pop().toLowerCase();

    // Use signed URLs for both PDFs and videos to avoid streaming issues
    if (fileExtension === "pdf" || ['mp4', 'webm', 'mkv', 'avi', 'mov'].includes(fileExtension)) {
      console.log(`🎥 Generating signed URL for ${fileExtension} file:`, file.name);
      const signedUrl = await generateSignedUrl(process.env.S3_BUCKET, key, 60 * 10); // 10 minutes signed URL
      console.log(`🔗 Redirecting to signed URL:`, signedUrl.substring(0, 100) + '...');
      return res.redirect(signedUrl);
    }

    // For other file types (images, documents, etc.), use streaming
    const s3Params = {
      Bucket: process.env.S3_BUCKET,
      Key: key,
    };

    // Use simple streaming for non-video/non-PDF files
    const command = new GetObjectCommand(s3Params);
    const response = await s3.send(command);
    const s3Stream = response.Body;

    res.setHeader("Content-Type", getMimeType(file.url));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Range, Content-Length');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

    if (isDownloadable) {
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${file.name}"`
      );
    } else {
      res.setHeader("Content-Disposition", `inline`);
    }

    // Add error handling for S3 stream
    s3Stream.on('error', (error) => {
      console.error('S3 stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Streaming error", error: error.message });
      }
    });

    s3Stream.pipe(res);
  } catch (err) {
    console.error('Error in streamFile:', err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

exports.generateFileToken = async (req, res) => {
  const { fileId } = req.body;
  // FIX: Use req.user._id from authJwt middleware instead of req.userId
  const userId = req.user._id;
  const user = req.user; // Use existing user object from middleware

  if (!fileId) {
    return res.status(400).json({ message: "File ID is required" });
  }

  try {
    const file = await File.findById(fileId);

    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    // Check if user has access to this file
    const isAdmin = user && user.userType === "ADMIN";
    
    // 🗂️ Admin users have full access to all files
    if (isAdmin) {
        // Admins always get access - skip all other checks
    } else {
      // For non-admin users, check access based on file viewability and course ownership
      const accessResult = await checkUserFileAccess(userId, fileId);
      let shouldAllowAccess = false;

      if (accessResult.hasAccess) {
        // User has course access - check if file is accessible
        shouldAllowAccess = accessResult.fileAccessible !== false;
        
        if (shouldAllowAccess) {
          console.log(`✅ Token generation allowed for user ${userId}, file ${fileId}: ${accessResult.reason}`);
        } else {
          console.log(`🔒 Token generation denied for user ${userId}, file ${fileId}: ${accessResult.reason}`);
        }
      } else {
        // User doesn't have course access - only allow if file is publicly viewable
        shouldAllowAccess = file.isViewable;
        if (shouldAllowAccess) {
          console.log(`✅ Token generation allowed for user ${userId}, file ${fileId}: File is publicly viewable`);
        }
      }

      if (!shouldAllowAccess) {
        return res
          .status(403)
          .json({ 
            message: "Access denied: File is locked and you don't have course access",
            reason: accessResult.reason || "FILE_LOCKED_NO_COURSE_ACCESS"
          });
      }
    }

    // For videos and PDFs, generate signed URL directly instead of streaming token
    const fileExtension = file.url.split('.').pop().toLowerCase();
    if (fileExtension === "pdf" || ['mp4', 'webm', 'mkv', 'avi', 'mov'].includes(fileExtension)) {
      const key = decodeURIComponent(file.url.split(".com/")[1]);
      const signedUrl = await generateSignedUrl(process.env.S3_BUCKET, key, 60 * 10); // 10 minutes signed URL
      console.log(`🎥 Generated signed URL for ${fileExtension} file:`, file.name);
      
      return res.status(200).json({
        message: "Signed URL generated successfully",
        token: null, // No streaming token needed
        signedUrl: signedUrl, // Direct signed URL
        isDirectUrl: true // Flag to indicate this is a direct URL
      });
    }

    // For other files, use streaming tokens
    let token;
    try {
      token = generateFileAccessToken(fileId, userId, file.isDownloadable);
  
    } catch (tokenError) {
      console.error("❌ Error generating file access token:", tokenError);
      return res.status(500).json({ message: "Failed to generate access token" });
    }

    return res.status(200).json({
      message: "Token generated successfully",
      token,
      signedUrl: null,
      isDirectUrl: false
    });
  } catch (error) {
    console.error("Error generating token:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// Stream course images (publicly accessible)
const streamCourseImage = async (req, res) => {
  try {
    const { courseId } = req.params;
    
    // Find the course
    const course = await Course.findById(courseId);
    if (!course || !course.courseImage || course.courseImage.length === 0) {
      return res.status(404).json({ message: "Course image not found" });
    }
    
    // Get the first course image URL
    const imageUrl = course.courseImage[0];
    
    // Extract S3 key from URL
    let s3Key;
    if (imageUrl.includes('amazonaws.com/')) {
      s3Key = imageUrl.split('amazonaws.com/')[1];
    } else {
      s3Key = imageUrl; // Assume it's already a key
    }
    
    // Decode the S3 key to handle encoded characters
    s3Key = decodeURIComponent(s3Key);
    
    console.log('Streaming course image:', s3Key);
    
    // Stream the image from S3
    const params = {
      Bucket: process.env.S3_BUCKET,
      Key: s3Key,
    };
    
    const command = new GetObjectCommand(params);
    const response = await s3.send(command);
    const s3Stream = response.Body;
    
    // Set appropriate headers with CORS and embedding support
    const contentType = getImageMimeType(s3Key);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    
    // Handle errors
    s3Stream.on('error', (error) => {
      console.error('S3 stream error:', error);
      if (!res.headersSent) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.status(404).type("text/plain").end("Course image not found");
      }
    });
    
    // Pipe the S3 stream to response
    s3Stream.pipe(res);
    
  } catch (error) {
    console.error("Error streaming course image:", error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.status(500).type("text/plain").end("Internal server error");
  }
};

// Stream quiz image from S3 (optimized for quiz images)
const streamQuizImage = async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Quiz images are always in the quiz-images folder
    const s3Key = `quiz-images/${filename}`;
    
    console.log('Streaming quiz image:', s3Key);
    
    // Stream the image from S3
    const params = {
      Bucket: process.env.S3_BUCKET,
      Key: decodeURIComponent(s3Key), // 🔧 FIX: Decode URI components like other streaming functions
    };
    
    const command = new GetObjectCommand(params);
    const response = await s3.send(command);
    const s3Stream = response.Body;
    
    // Set appropriate headers with CORS and embedding support
    const contentType = getImageMimeType(s3Key);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    
    // Handle errors with proper cache control to prevent continuous retries
    s3Stream.on('error', (error) => {
      console.error('S3 quiz image stream error for key:', s3Key, '- Error:', error.code || error.message);
      if (!res.headersSent) {
        // Set cache headers to prevent immediate retries on errors
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.status(404).type("text/plain").end("Quiz image not found");
      }
    });
    
    // Pipe the S3 stream to response
    s3Stream.pipe(res);
    
  } catch (error) {
    console.error("Error streaming quiz image:", error);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.status(500).type("text/plain").end("Internal server error");
  }
};

// Stream any S3 image by key (for general use)
const streamS3Image = async (req, res) => {
  try {
    // 🔧 COMPREHENSIVE CORS & EMBEDDING HEADERS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    
    const { key } = req.params;
    const folder = req.query.folder;
    
    // Smart key construction - avoid double paths
    let fullKey;
    if (folder && !key.startsWith(folder + '/')) {
      // Only add folder if key doesn't already start with it
      fullKey = `${folder}/${key}`;
    } else {
      // Key already includes full path or no folder specified
      fullKey = key;
    }
    
    console.log('Streaming S3 image:', fullKey);
    console.log('Original key:', key, 'Folder:', folder);
    
    // Stream the image from S3
    const params = {
      Bucket: process.env.S3_BUCKET,
      Key: decodeURIComponent(fullKey),
    };
    
    const command = new GetObjectCommand(params);
    const response = await s3.send(command);
    const s3Stream = response.Body;
    
    // Detect file extension and set correct content-type
    const contentType = getImageMimeType(fullKey);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    
    // Handle errors with proper cache control to prevent continuous retries
    s3Stream.on('error', (error) => {
      console.error('S3 stream error for key:', fullKey, '- Error:', error.code || error.message);
      if (!res.headersSent) {
        // Add CORS headers for error responses
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        
        // Set cache headers to prevent immediate retries on errors
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
        res.setHeader('Expires', '0');
        res.setHeader('Pragma', 'no-cache');
        res.status(404).type("text/plain").end("Image not found");
      }
    });
    
    // Pipe the S3 stream to response
    s3Stream.pipe(res);
    
  } catch (error) {
    console.error("Error streaming S3 image:", error);
    // Add CORS headers for catch block errors
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.status(500).type("text/plain").end("Internal server error");
  }
};

function getMimeType(url) {
  if (url.endsWith(".pdf")) return "application/pdf";
  if (url.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}

function getImageMimeType(filename) {
  // Use mime-types library for accurate Content-Type detection
  const mimeType = mime.lookup(filename);
  // Default to image/jpeg for unknown image types, or application/octet-stream for non-images
  return mimeType && mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
}

// Stream user profile image
const streamUserImage = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user from database
    const User = require('../models/userModel');
    const user = await User.findById(userId);
    
    if (!user || !user.image) {
      return res.status(404).json({ message: "User image not found" });
    }
    
    let s3Key;
    if (user.image.includes('amazonaws.com/')) {
      s3Key = user.image.split('amazonaws.com/')[1];
    } else {
      s3Key = user.image;
    }
    
    s3Key = decodeURIComponent(s3Key);
    console.log('Streaming user image:', s3Key);
    
    const params = {
      Bucket: process.env.S3_BUCKET,
      Key: s3Key,
    };
    
    const command = new GetObjectCommand(params);
    const response = await s3.send(command);
    const s3Stream = response.Body;
    
    const contentType = getImageMimeType(s3Key);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    s3Stream.on('error', (error) => {
      console.error('S3 stream error:', error);
      if (!res.headersSent) {
        res.status(404).json({ message: "Image not found" });
      }
    });
    
    s3Stream.pipe(res);
    
  } catch (error) {
    console.error("Error streaming user image:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};



// Stream banner image
const streamBannerImage = async (req, res) => {
  try {
    const { bannerId } = req.params;
    
    const Banner = require('../models/bannerModel');
    const banner = await Banner.findById(bannerId);
    
    if (!banner || !banner.image) {
      return res.status(404).json({ message: "Banner image not found" });
    }
    
    let s3Key;
    if (banner.image.includes('amazonaws.com/')) {
      s3Key = banner.image.split('amazonaws.com/')[1];
    } else {
      s3Key = banner.image;
    }
    
    s3Key = decodeURIComponent(s3Key);
    console.log('Streaming banner image:', s3Key);
    
    const params = {
      Bucket: process.env.S3_BUCKET,
      Key: s3Key,
    };
    
    const command = new GetObjectCommand(params);
    const response = await s3.send(command);
    const s3Stream = response.Body;
    
    const contentType = getImageMimeType(s3Key);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    s3Stream.on('error', (error) => {
      console.error('S3 stream error:', error);
      if (!res.headersSent) {
        res.status(404).json({ message: "Image not found" });
      }
    });
    
    s3Stream.pipe(res);
    
  } catch (error) {
    console.error("Error streaming banner image:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Stream book image from S3 based on bookId
 */
const streamBookImage = async (req, res) => {
  try {
    const { bookId } = req.params;
    const Book = require('../models/Book'); // Dynamically require to avoid circular dependency
    
    // Find the book by ID
    const book = await Book.findById(bookId);
    if (!book || !book.imageUrl) {
      return res.status(404).json({ message: "Book image not found" });
    }
    
    // Extract S3 key from the full URL
    let s3Key = book.imageUrl.includes('amazonaws.com/') 
      ? book.imageUrl.split('amazonaws.com/')[1] 
      : book.imageUrl;
    s3Key = decodeURIComponent(s3Key);
    
    console.log('Streaming book image:', s3Key);
    
    // Stream the image from S3
    const params = {
      Bucket: process.env.S3_BUCKET,
      Key: s3Key,
    };
    
    const command = new GetObjectCommand(params);
    const response = await s3.send(command);
    const s3Stream = response.Body;
    
    // Set appropriate headers
    res.setHeader('Content-Type', getImageMimeType(s3Key));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Handle S3 stream errors
    s3Stream.on('error', (error) => {
      console.error('S3 stream error:', error);
      if (!res.headersSent) {
        res.status(404).json({ message: "Image not found" });
      }
    });
    
    s3Stream.pipe(res);
    
  } catch (error) {
    console.error("Error streaming book image:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  streamFile: exports.streamFile,
  generateFileToken: exports.generateFileToken,
  streamCourseImage,
  streamQuizImage,
  streamS3Image,
  streamUserImage,
  streamBannerImage,
  streamBookImage,
  checkCourseAccess: exports.checkCourseAccess,
};
