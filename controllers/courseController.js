const User = require('../models/userModel');
const Folder = require("../models/folderModel");
const File = require("../models/fileModel");
const Course = require("../models/courseModel");
const Subject = require("../models/subjectModel");
const Quiz = require("../models/quizModel");
const QuizFolder = require("../models/quizFolder");
const mongoose = require("mongoose"); // Ensure mongoose is imported
const { deleteFilesFromBucket } = require("../configs/aws.config");
const authConfig = require("../configs/auth.config");

exports.adminManageCourseAccess = async (req, res) => {
  try {
    const { userIds, courseId, action, expiresIn } = req.body;

    if (req.user.userType !== "ADMIN") {
      return res.status(401).json({
        status: 401,
        message: "Unauthorized access, only admin can manage course access"
      });
    }

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        status: 400,
        message: "User IDs array is required"
      });
    }

    if (!courseId) {
      return res.status(400).json({
        status: 400,
        message: "Course ID is required"
      });
    }

    if (!["ASSIGN", "REVOKE"].includes(action)) {
      return res.status(400).json({
        status: 400,
        message: "Invalid action. Use 'ASSIGN' or 'REVOKE'"
      });
    }

    if (action === "ASSIGN" && expiresIn && (typeof expiresIn !== "number" || expiresIn <= 0)) {
      return res.status(400).json({
        status: 400,
        message: "Invalid expiresIn value. It must be a positive number of days."
      });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        status: 404,
        message: "Course not found"
      });
    }

    const results = { successful: [], failed: [] };

    for (const userId of userIds) {
      try {
        const user = await User.findById(userId);

        if (!user) {
          results.failed.push({ userId, reason: "User not found" });
          continue;
        }

        if (action === "ASSIGN") {
          const hasAccess = user.purchasedCourses.some(pc => pc.course.toString() === courseId);

          if (hasAccess) {
            results.failed.push({ userId, reason: "User already has access to this course" });
          } else {
            const expirationDate = expiresIn ? new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000) : null;

            user.purchasedCourses.push({
              course: courseId,
              assignedByAdmin: {
                isAssigned: true,
                assignedAt: new Date(),
                assignedBy: req.user._id
              },
              expiresAt: expirationDate
            });

            // 🔧 FIX: For batch courses, also add to course.manualEnrollments
            if (course.courseType === "Batch") {
              const isAlreadyInManualEnrollments = course.manualEnrollments.some(
                enrollment => enrollment.user.toString() === userId
              );

              if (!isAlreadyInManualEnrollments) {
                course.manualEnrollments.push({
                  user: userId,
                  enrolledBy: req.user._id,
                  status: 'Active',
                  enrolledDate: new Date()
                });
                console.log(`✅ [BULK] Added user ${userId} to batch course manualEnrollments`);
              }
            }

            await user.save();
            results.successful.push({ userId, expiresAt: expirationDate });
          }
        } else { // REVOKE
          const courseIndex = user.purchasedCourses.findIndex(pc => pc.course.toString() === courseId);

          if (courseIndex === -1) {
            results.failed.push({ userId, reason: "User doesn't have access to this course" });
          } else {
            user.purchasedCourses.splice(courseIndex, 1);

            // 🔧 FIX: For batch courses, also remove from course.manualEnrollments
            if (course.courseType === "Batch") {
              const enrollmentIndex = course.manualEnrollments.findIndex(
                enrollment => enrollment.user.toString() === userId
              );

              if (enrollmentIndex !== -1) {
                course.manualEnrollments.splice(enrollmentIndex, 1);
                console.log(`✅ [BULK] Removed user ${userId} from batch course manualEnrollments`);
              }
            }

            await user.save();
            results.successful.push({ userId });
          }
        }
      } catch (error) {
        results.failed.push({ userId, reason: error.message });
      }
    }

    // 🔧 FIX: Save course changes if it's a batch course (manualEnrollments were modified)
    if (course.courseType === "Batch" && results.successful.length > 0) {
      await course.save();
      console.log(`✅ [BULK] Saved batch course changes for ${results.successful.length} users`);
    }

    return res.status(200).json({
      status: 200,
      message: `Course access ${action.toLowerCase()}ed successfully.`,
      results: {
        totalProcessed: userIds.length,
        successful: results.successful.length,
        failed: results.failed.length,
        successfulDetails: results.successful,
        failedDetails: results.failed
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Server error"
    });
  }
};



exports.createFolder = async (req, res = null) => {
  try {
    const { parentId, name, courseId } = req.body;
    console.log("parentId", req.body);

    // Convert courseId to ObjectId
    const courseObjectId = new mongoose.Types.ObjectId(courseId); // Correctly instantiate ObjectId

    // Use the ObjectId to find the course
    const course = await Course.findOne({
      _id: courseObjectId,
    });
    console.log(course);

    if (course?.rootFolder) {
      const errorMessage =
        "A root folder already exists for the course. Please delete the existing root folder before creating a new one.";
      if (res) {
        return res.status(400).json({ message: errorMessage }); // If res exists, send response
      }
      throw new Error(errorMessage); // If no res, throw an error for handling elsewhere
    }

    const newFolder = await Folder.create({ name, folders: [], files: [] });

    if (parentId) {
      await Folder.findByIdAndUpdate(newFolder._id, {
        parentFolderId: parentId,
      });
      // Add to parent folder
      await Folder.findByIdAndUpdate(parentId, {
        $push: { folders: newFolder._id },
      });
    } else if (courseId) {
      // Set as root folder for course
      await Course.findByIdAndUpdate(courseObjectId, {
        rootFolder: newFolder._id,
      });

      await Folder.findByIdAndUpdate(newFolder._id, { parentFolderId: null });
    }

    if (res) {
      return res
        .status(201)
        .json({ message: "Folder created successfully", newFolder }); // Send response if res is provided
    }

    return newFolder; // Return new folder if no res is provided (used in createCourse)
  } catch (error) {
    console.log("Error creating folder:", error);
    if (res) {
      return res
        .status(500)
        .json({ message: "Failed to create folder", error: error.message });
    }
    throw error; // Rethrow error for handling elsewhere
  }
};

exports.addSubfolder = async (req, res) => {
  try {
    const { folderId: parentFolderId } = req.params;
    const { name } = req.body;

    const subfolder = await Folder.create({
      name,
      folders: [],
      files: [],
      parentFolderId,
    });

    await Folder.findByIdAndUpdate(parentFolderId, {
      $push: { folders: subfolder._id },
    });

    res
      .status(201)
      .json({ message: "Subfolder added successfully", subfolder });
  } catch (error) {
    console.log("Error adding subfolder:", error);
    res
      .status(500)
      .json({ message: "Failed to add subfolder", error: error.message });
  }
};

exports.deleteFolder = async (req, res) => {
  try {
    const { folderId } = req.params;
    const { sourceFolderId } = req.body;

    if (!sourceFolderId) {
      return res.status(400).json({ 
        message: "sourceFolderId is required" 
      });
    }

    const folderToDelete = await Folder.findById(folderId);
    
    if (!folderToDelete) {
      return res.status(404).json({ message: "Folder not found" });
    }


    if (folderToDelete.parentFolderId?.toString()!== sourceFolderId.toString()) {
      await Folder.findByIdAndUpdate(
        sourceFolderId,
        { $pull: { folders: folderId } }
      );
      
      return res.status(200).json({ 
        message: "Folder reference removed from source folder" 
      });
    }
    const deleteFolderRecursively = async (id) => {
      const folder = await Folder.findById(id);

      if (!folder) {
        console.log(`Folder with id ${id} not found`);
        return;
      }

      if (folder.folders.length === null) {
        await Folder.findByIdAndDelete(id);
        return;
      }
      for (const subfolderId of folder.folders) {
        await deleteFolderRecursively(subfolderId);
      }

      const fileUrls = folder.files.map((file) => file.url);

      if (fileUrls?.length > 0) {
        await deleteFilesFromBucket(authConfig.s3_bucket, fileUrls);
      }
      // Delete files from storage

      await Folder.findByIdAndDelete(id);
    };

    await deleteFolderRecursively(folderId);

    res
      .status(200)
      .json({ message: "Folder and its contents deleted successfully" });
  } catch (error) {
    console.log("Error deleting folder:", error);
    res
      .status(500)
      .json({ message: "Failed to delete folder", error: error.message });
  }
};


exports.addFileToFolder = async (req, res) => {
  try {
    const { folderId } = req.params;
    const { name, url, description } = req.body;

    const newFile = await File.create({ name, url, description });

    await Folder.findByIdAndUpdate(folderId, {
      $push: { files: newFile._id },
    });

    res.status(201).json({ message: "File added successfully", file: newFile });
  } catch (error) {
    console.log("Error adding file:", error);
    res
      .status(500)
      .json({ message: "Failed to add file", error: error.message });
  }
};

exports.getFolderContents = async (req, res) => {
  try {
    const { folderId } = req.params;
    const userId = req.user?._id || "";

    const getRootFolder = async (folderId) => {
      let currentFolder = await Folder.findById(folderId)
      while(currentFolder && currentFolder.parentFolderId){
        currentFolder = await Folder.findById(currentFolder.parentFolderId)
      }
      return currentFolder
    }

    const getCourseFromRootFolder = async (rootFolder) => {
      if(!rootFolder) return null
      let course=await Course.findOne({rootFolder:rootFolder._id})
      return course
    }

    const rootFolder = await getRootFolder(folderId)
    const course = await getCourseFromRootFolder(rootFolder)

    const courseId = course?course._id:null;
    
    console.log(`🔍 [DEBUG] Folder access check for user ${userId}:`);
    console.log(`🔍 [DEBUG] - FolderId: ${folderId}`);
    console.log(`🔍 [DEBUG] - Course: ${course ? course.title : 'null'} (${course ? course.courseType : 'N/A'})`);
    console.log(`🔍 [DEBUG] - CourseId: ${courseId}`);
    console.log(`🔍 [DEBUG] - RootFolder: ${rootFolder ? rootFolder._id : 'null'}`);

    // 🗂️ NEW: Check if this is a Master Folder or a subfolder of Master Folder
    const currentFolder = await Folder.findById(folderId);
    const isMasterFolder = currentFolder && (currentFolder.isMasterFolder || currentFolder.folderType === 'master');
    
    // 🗂️ NEW: Also check if the root folder is a Master Folder (for subfolders)
    const isSubfolderOfMaster = rootFolder && (rootFolder.isMasterFolder || rootFolder.folderType === 'master');
    
    // 🗂️ NEW: Check if this is an assignment folder or subfolder of assignment folder
    const isAssignmentFolder = currentFolder && (currentFolder.folderType === 'assignments' || currentFolder.folderType === 'student_assignments');
    const isAssignmentSystemFolder = currentFolder && currentFolder.isSystemFolder && (currentFolder.name === 'Assignments' || currentFolder.name?.includes('_'));
    
    console.log(`🔍 [DEBUG] Folder type checks:`);
    console.log(`🔍 [DEBUG] - isMasterFolder: ${isMasterFolder}`);
    console.log(`🔍 [DEBUG] - isSubfolderOfMaster: ${isSubfolderOfMaster}`);
    console.log(`🔍 [DEBUG] - isAssignmentFolder: ${isAssignmentFolder}`);
    console.log(`🔍 [DEBUG] - isAssignmentSystemFolder: ${isAssignmentSystemFolder}`);
    console.log(`🔍 [DEBUG] - currentFolder.folderType: ${currentFolder?.folderType}`);
    console.log(`🔍 [DEBUG] - currentFolder.isSystemFolder: ${currentFolder?.isSystemFolder}`);
    console.log(`🔍 [DEBUG] - currentFolder.name: ${currentFolder?.name}`);
    
    if (!courseId && !isMasterFolder && !isSubfolderOfMaster && !isAssignmentFolder && !isAssignmentSystemFolder) {
      return res.status(404).json({ message: "Course not found and not a Master Folder or its subfolder" });
    }

    // 🗂️ NEW: Handle Master Folders, Assignment Folders, and Course Folders differently
    let folder, hasPurchasedCourse = false;

    if (isMasterFolder || isSubfolderOfMaster || isAssignmentFolder || isAssignmentSystemFolder) {
      // 🗂️ Master Folder, Assignment Folder, or their subfolders: No course access check needed
      folder = await Folder.findById(folderId)
        .populate("folders")
        .populate("files");
        
      if (!folder) {
        return res.status(404).json({ error: "Master Folder, Assignment Folder, or subfolder not found" });
      }
      
      // For Master Folders, Assignment Folders, and their subfolders, all files are viewable by admin users
      hasPurchasedCourse = true; // Admin has access to all Master Folder and Assignment content
      
    } else {
      // 🗂️ Course Folder: Check course access
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      hasPurchasedCourse = user.purchasedCourses.some(
        (pc) => pc.course.toString() === courseId.toString()
      );

      console.log(`🔍 [DEBUG] User course access check:`);
      console.log(`🔍 [DEBUG] - User: ${user.firstName} ${user.lastName} (${userId})`);
      console.log(`🔍 [DEBUG] - User purchased courses:`, user.purchasedCourses.map(pc => ({
        courseId: pc.course?.toString() || pc.course,
        assignedByAdmin: pc.assignedByAdmin?.isAssigned
      })));
      console.log(`🔍 [DEBUG] - Target courseId: ${courseId}`);
      console.log(`🔍 [DEBUG] - Has purchased course: ${hasPurchasedCourse}`);

      if (!hasPurchasedCourse) {
        console.log("❌ User has not purchased course");
      } else {
        console.log("✅ User has purchased course");
      }

      folder = await Folder.findById(folderId)
        .populate("folders")
        .populate("files");

      if (!folder) {
        return res.status(404).json({ error: "Folder not found" });
      }
    }

    // 🗂️ Process files with appropriate access control
    console.log(`🔍 [DEBUG] Processing ${folder.files.length} files:`);
    console.log(`🔍 [DEBUG] - Course type: ${course ? course.courseType : 'N/A'}`);
    console.log(`🔍 [DEBUG] - Has purchased course: ${hasPurchasedCourse}`);
    
    const folderContents = folder.files.map((file) => {
      const fileObj = file.toObject();
      
      const isBatchCourse = course && course.courseType === "Batch";
      let newIsViewable;

      if (isBatchCourse && hasPurchasedCourse) {
        // 🎯 BATCH COURSE LOGIC: Files are unlocked by default unless manually locked by admin
        // If admin has explicitly set isViewable to false, respect that (manual lock)
        // Otherwise, unlock all files for batch users
        
        // Check if this file was manually locked by admin (has been explicitly set to false)
        // For batch courses, we assume files are unlocked by default unless admin locked them
        const wasManuallyLocked = fileObj.isViewable === false;
        
        if (wasManuallyLocked) {
          // Admin has manually locked this file - keep it locked
          newIsViewable = false;
          console.log(`🔒 File "${fileObj.name}" manually locked by admin - keeping locked`);
        } else {
          // File is either unlocked or default state - unlock for batch user
          newIsViewable = true;
          console.log(`🔓 Unlocking file "${fileObj.name}" for batch course user (default batch behavior)`);
        }
      } else {
        // 📚 REGULAR COURSE LOGIC: Respect original isViewable + user purchase status
        newIsViewable = fileObj.isViewable || hasPurchasedCourse;
      }

      console.log(`🔍 [DEBUG] File "${fileObj.name}":`);
      console.log(`🔍 [DEBUG] - Original isViewable: ${fileObj.isViewable}`);
      console.log(`🔍 [DEBUG] - Is batch course: ${isBatchCourse}`);
      console.log(`🔍 [DEBUG] - Has purchased course: ${hasPurchasedCourse}`);
      console.log(`🔍 [DEBUG] - Final isViewable: ${newIsViewable}`);

      return {
        ...fileObj,
        isViewable: newIsViewable
      }
    });

    const folderData = folder.toObject();
    folderData.files = folderContents;

    console.log(`📤 [DEBUG] Sending folder contents response:`);
    console.log(`📤 [DEBUG] - Total files: ${folderContents.length}`);
    console.log(`📤 [DEBUG] - File access summary:`, folderContents.map(f => ({
      name: f.name,
      originalIsViewable: f.isViewable,
      finalIsViewable: f.isViewable
    })));

    res.status(200).json({ 
      message: (isMasterFolder || isSubfolderOfMaster || isAssignmentFolder || isAssignmentSystemFolder) ? 
        "System Folder contents retrieved" : "Folder contents retrieved", 
      folder: folderData 
    });
  } catch (error) {
    console.log("Error getting folder contents:", error);
    res
      .status(500)
      .json({ message: "Failed to get folder contents", error: error.message });
  }
};

exports.getFolderContentsForHomeScreen = async (req, res) => {
  try {
    const { folderId } = req.params;
    const folder = await Folder.findById(folderId)
      .populate("folders")
      .populate("files");

    if (!folder) {
      return res.status(404).json({ error: "Folder not found" });
    }

    res.status(200).json({ message: "Folder contents retrieved", folder });
  } catch (error) {
    console.log("Error getting folder contents:", error);
    res
      .status(500)
      .json({ message: "Failed to get folder contents", error: error.message });
  }
};



// exports.deleteFolder = async (req, res) => {
//   try {
//     const { folderId } = req.params;
//     const { sourceFolderId } = req.body;

//     if (!sourceFolderId) {
//       return res.status(400).json({ 
//         message: "sourceFolderId is required" 
//       });
//     }

//     const folderToDelete = await Folder.findById(folderId);
    
//     if (!folderToDelete) {
//       return res.status(404).json({ message: "Folder not found" });
//     }


//     if (folderToDelete.parentFolderId?.toString()!== sourceFolderId.toString()) {
//       await Folder.findByIdAndUpdate(
//         sourceFolderId,
//         { $pull: { folders: folderId } }
//       );
      
//       return res.status(200).json({ 
//         message: "Folder reference removed from source folder" 
//       });
//     }
//     const deleteFolderRecursively = async (id) => {
//       const folder = await Folder.findById(id);

//       if (!folder) {
//         console.log(`Folder with id ${id} not found`);
//         return;
//       }

//       if (folder.folders.length === null) {
//         await Folder.findByIdAndDelete(id);
//         return;
//       }
//       for (const subfolderId of folder.folders) {
//         await deleteFolderRecursively(subfolderId);
//       }

//       const fileUrls = folder.files.map((file) => file.url);

//       if (fileUrls?.length > 0) {
//         await deleteFilesFromBucket(authConfig.s3_bucket, fileUrls);
//       }
//       // Delete files from storage

//       await Folder.findByIdAndDelete(id);
//     };

//     await deleteFolderRecursively(folderId);

//     res
//       .status(200)
//       .json({ message: "Folder and its contents deleted successfully" });
//   } catch (error) {
//     console.log("Error deleting folder:", error);
//     res
//       .status(500)
//       .json({ message: "Failed to delete folder", error: error.message });
//   }
// };

exports.deleteFileFromFolder = async (req, res) => {
  try {
    const { folderId, fileId } = req.params;

    //check to delete file permanently if its in root folder else just pull from files array

    // Find the folder and populate the `files` field
    const folder = await Folder.findById(folderId).populate("files");

    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }

    // Locate the file in the folder's files array
    const file = folder.files.find((file) => file._id.toString() === fileId);

    if (!file) {
      return res.status(404).json({ message: "File not found in folder" });
    }

    // Extract the fileUrl
    const fileUrl = file.url;

    // Remove the file reference from the folder
    folder.files = folder.files.filter(
      (file) => file._id.toString() !== fileId
    );
    await folder.save();

    // Delete the file from the S3 bucket
    await deleteFilesFromBucket(authConfig.s3_bucket, [fileUrl]);

    // Optionally, delete the File document from the database
    await File.findByIdAndDelete(fileId);

    res.status(200).json({ message: "File deleted successfully", fileUrl });
  } catch (error) {
    console.error("Error deleting file:", error);
    res
      .status(500)
      .json({ message: "Failed to delete file", error: error.message });
  }
};

exports.updateFolder = async (req, res) => {
  try {
    const { folderId } = req.params;
    const { name, isDownloadable, downloadType  } = req.body;

    const folder = await Folder.findById(folderId);
    if (!folder) {
      return res.status(404).json({ error: "Folder not found" });
    }

    folder.name = name || folder.name;
    if (isDownloadable !== undefined) folder.isDownloadable = isDownloadable;
    if (downloadType) folder.downloadType = downloadType;
    await folder.save();

    async function updateSubItems(currentFolderId) {
      const currentFolder = await Folder.findById(currentFolderId)
        .populate('folders')
        .populate('files');

      if (currentFolder.files.length > 0) {
        await File.updateMany(
          { _id: { $in: currentFolder.files } },
          {
            $set: {
              isDownloadable: isDownloadable !== undefined ? isDownloadable : currentFolder.isDownloadable,
              downloadType: downloadType || currentFolder.downloadType
            }
          }
        );
      }

      for (const subfolder of currentFolder.folders) {
        await Folder.findByIdAndUpdate(
          subfolder._id,
          {
            $set: {
              isDownloadable: isDownloadable !== undefined ? isDownloadable : currentFolder.isDownloadable,
              downloadType: downloadType || currentFolder.downloadType
            }
          }
        );
        await updateSubItems(subfolder._id);
      }
    }

    await updateSubItems(folderId);

    res.status(200).json({ message: "Folder and all contained items updated successfully", folder });
  } catch (error) {
    console.log("Error updating folder:", error);
    res
      .status(500)
      .json({ message: "Failed to update folder", error: error.message });
  }
};

exports.moveFileToFolder = async (req, res) => {
  try {
    const { fileIds, sourceFolderId, destinationFolderId } = req.body;

    console.log('🔍 [DEBUG] File import/move request:', { fileIds, sourceFolderId, destinationFolderId });

    if (!destinationFolderId) {
      return res.status(400).json({ error: "Destination folder ID is required" });
    }

    const fileIdsArray = Array.isArray(fileIds) ? fileIds : [fileIds];

    if (fileIdsArray.length === 0) {
      return res.status(400).json({ error: "No files specified for import" });
    }

    const destinationFolder = await Folder.findById(destinationFolderId);
    if (!destinationFolder) {
      return res.status(404).json({ error: "Destination folder not found" });
    }

    const importedFiles = [];
    const skippedFiles = [];

    for (const fileId of fileIdsArray) {
      try {
        const file = await File.findById(fileId);
        if (!file) {
          console.warn(`⚠️ [WARN] File not found: ${fileId}`);
          skippedFiles.push({ fileId, reason: 'File not found' });
          continue;
        }

        // Check if file already exists in destination folder to avoid duplicates
        const existingFile = destinationFolder.files.find(f => 
          f.toString() === fileId.toString()
        );
        
        if (existingFile) {
          console.warn(`⚠️ [WARN] File already exists in destination: ${fileId}`);
          skippedFiles.push({ fileId, reason: 'File already exists in destination' });
          continue;
        }

        // Create a copy of the file for import (not move)
        const duplicateFile = await File.create({
          name: file.name,
          url: file.url,
          description: file.description,
          isDownloadable: file.isDownloadable,
          isViewable: file.isViewable,
        });

        destinationFolder.files.push(duplicateFile._id);
        importedFiles.push(duplicateFile);

        console.log(`✅ [DEBUG] File imported successfully: ${file.name} -> ${duplicateFile._id}`);
      } catch (fileError) {
        console.error(`❌ [ERROR] Failed to import file ${fileId}:`, fileError);
        skippedFiles.push({ fileId, reason: fileError.message });
      }
    }

    // Save the destination folder with new files
    await destinationFolder.save();

    const successfulImports = importedFiles.length;
    const totalRequested = fileIdsArray.length;

    console.log(`📊 [DEBUG] Import summary: ${successfulImports}/${totalRequested} files imported`);

    res.status(200).json({
      message: `${successfulImports} file(s) imported successfully${skippedFiles.length > 0 ? ` (${skippedFiles.length} skipped)` : ''}`,
      importedFiles,
      skippedFiles,
      destinationFolder: {
        _id: destinationFolder._id,
        name: destinationFolder.name
      },
      totalFilesImported: successfulImports,
      totalFilesSkipped: skippedFiles.length
    });
  } catch (error) {
    console.error("❌ [ERROR] File import operation failed:", error);
    res.status(500).json({ 
      message: "Failed to import files", 
      error: error.message 
    });
  }
};

//import/copy complete folder into another folder
exports.moveFolderToFolder = async (req, res) => {
  try {
    const { folderIds, destinationFolderId } = req.body;

    console.log('🔍 [DEBUG] Folder import/move request:', { folderIds, destinationFolderId });

    if (!destinationFolderId) {
      return res.status(400).json({ error: "Destination folder ID is required" });
    }

    const folderIdsArray = Array.isArray(folderIds) ? folderIds : [folderIds];

    if (folderIdsArray.length === 0) {
      return res.status(400).json({ error: "No folders specified for import" });
    }

    const destinationFolder = await Folder.findById(destinationFolderId);
    if (!destinationFolder) {
      return res.status(404).json({ error: "Destination folder not found" });
    }

    // Prevent importing folders into themselves or their descendants
    const isAlreadyItsOwnSubfolder = async (childIds, parentId) => {
      if (childIds.includes(parentId)) {
        return true;
      }

      const parent = await Folder.findById(parentId).populate("folders");
      if (!parent) {
        return false;
      }

      for (let subfolder of parent.folders) {
        if (await isAlreadyItsOwnSubfolder(childIds, subfolder._id)) {
          return true;
        }
      }

      return false;
    };

    if (await isAlreadyItsOwnSubfolder(folderIdsArray, destinationFolderId)) {
      return res.status(400).json({ 
        error: "Cannot import folders into their own subfolders" 
      });
    }

    const importedFolders = [];
    const skippedFolders = [];

    // Import each folder to the new parent
    for (let folderId of folderIdsArray) {
      try {
        const folder = await Folder.findById(folderId).populate('files folders');
        if (!folder) {
          console.warn(`⚠️ [WARN] Folder not found: ${folderId}`);
          skippedFolders.push({ folderId, reason: 'Folder not found' });
          continue;
        }

        // Check if folder already exists in destination to avoid duplicates
        const existingFolder = destinationFolder.folders.find(f => 
          f.toString() === folderId.toString()
        );
        
        if (existingFolder) {
          console.warn(`⚠️ [WARN] Folder already exists in destination: ${folderId}`);
          skippedFolders.push({ folderId, reason: 'Folder already exists in destination' });
          continue;
        }

        // Create a copy of the folder for import (not move)
        const duplicateFolder = await Folder.create({
          name: folder.name,
          parentFolderId: destinationFolderId,
          folders: folder.folders || [],
          files: folder.files || [],
          importedQuizzes: folder.importedQuizzes || [],
          QuizFolders: folder.QuizFolders || [],
        });

        destinationFolder.folders.push(duplicateFolder._id);
        importedFolders.push(duplicateFolder);

        console.log(`✅ [DEBUG] Folder imported successfully: ${folder.name} -> ${duplicateFolder._id}`);
      } catch (folderError) {
        console.error(`❌ [ERROR] Failed to import folder ${folderId}:`, folderError);
        skippedFolders.push({ folderId, reason: folderError.message });
      }
    }

    // Save the destination folder with new subfolders
    await destinationFolder.save();

    const successfulImports = importedFolders.length;
    const totalRequested = folderIdsArray.length;

    console.log(`📊 [DEBUG] Folder import summary: ${successfulImports}/${totalRequested} folders imported`);

    res.status(200).json({
      message: `${successfulImports} folder(s) imported successfully${skippedFolders.length > 0 ? ` (${skippedFolders.length} skipped)` : ''}`,
      importedFolders,
      skippedFolders,
      destinationFolder: {
        _id: destinationFolder._id,
        name: destinationFolder.name
      },
      totalFoldersImported: successfulImports,
      totalFoldersSkipped: skippedFolders.length
    });
  } catch (error) {
    console.error("❌ [ERROR] Folder import operation failed:", error);
    res.status(500).json({ 
      message: "Failed to import folders", 
      error: error.message 
    });
  }
};

exports.updateFile = async (req, res) => {
  try {
    const { folderId, fileId } = req.params;
    const { name, url, description, isDownloadable, downloadType, isViewable } = req.body;

    const folder = await Folder.findById(folderId);
    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }

    const updatedFile = await File.findByIdAndUpdate(
      fileId,
      {
        $set: {
          ...(name && { name }),
          ...(url && { url }),
          ...(description && { description }),
          ...(isDownloadable !== undefined && { isDownloadable }),
          ...(downloadType && { downloadType }),
          ...(isViewable !== undefined && { isViewable }),
        },
      },
      { new: true, runValidators: true }
    );

    if (!updatedFile) {
      return res.status(404).json({ message: "File not found" });
    }

    return res.status(200).json({
      message: "File updated successfully",
      updatedFile,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error updating file",
      error: error.message,
    });
  }
};

exports.importQuizToCourseFolder = async (req, res) => {
  try {
    const { folderId: destinationFolderId } = req.params;
    const { quizId, sourceFolderId } = req.body;

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    const quizFolder = await QuizFolder.findById(sourceFolderId);
    if (!quizFolder) {
      return res.status(404).json({ message: "Quiz folder not found" });
    }

    const courseFolder = await Folder.findById(destinationFolderId);
    if (!courseFolder) {
      return res.status(404).json({ message: "Course folder not found" });
    }

    const isAlreadyImported = courseFolder.importedQuizzes.some(
      (importedQuiz) => importedQuiz.quizId.toString() === quizId
    );
    if (isAlreadyImported) {
      return res
        .status(400)
        .json({ message: "Quiz already imported to course" });
    }

    await Folder.updateOne(
      { _id: destinationFolderId },
      {
        $push: {
          importedQuizzes: {
            quizId,
            originalFolderId: sourceFolderId,
          },
        },
      }
    );

    const updatedFolder = await Folder.findById(destinationFolderId);

    return res
      .status(200)
      .json({
        message: "Quiz imported successfully",
        courseFolder: updatedFolder,
      });
  } catch (error) {
    console.log("Error importing quiz:", error);
    return res
      .status(500)
      .json({ message: "Failed to import quiz", error: error.message });
  }
};

exports.removeQuizFromCourseFolder = async (req, res) => {
  try {
    const { folderId, quizId } = req.params;

    const updatedFolder = await Folder.findOneAndUpdate(
      {
        _id: folderId,
      },
      {
        $pull: {
          importedQuizzes: {
            quizId: new mongoose.Types.ObjectId(quizId),
          },
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedFolder) {
      return res.status(404).json({ message: "Folder not found" });
    }

    return res
      .status(200)
      .json({ message: "Quiz removed successfully", folder: updatedFolder });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to remove quiz", error: error.message });
  }
};

exports.importQuizFolderToCourseFolder = async (req, res) => {
  try {
    const { folderId: destinationFolderId } = req.params;
    const { quizFolderId } = req.body;

    const quizFolder = await QuizFolder.findById(quizFolderId);
    if (!quizFolder) {
      return res.status(404).json({ message: "Quiz folder not found" });
    }

    const courseFolder = await Folder.findById(destinationFolderId);
    if (!courseFolder) {
      return res.status(404).json({ message: "Course folder not found" });
    }
    console.log("courseFolder", courseFolder);

    const isAlreadyImported = courseFolder.QuizFolders.includes(quizFolderId);
    if (isAlreadyImported) {
      return res
        .status(400)
        .json({ message: "Quiz folder already imported to course" });
    }

    const updatedFolder = await Folder.findByIdAndUpdate(
      destinationFolderId,
      {
        $push: { QuizFolders: quizFolderId },
      },
      {
        new: true,
        runValidators: true,
      }
    ).populate("QuizFolders");

    return res
      .status(200)
      .json({
        message: "Quiz folder imported successfully",
        courseFolder: updatedFolder,
      });
  } catch (error) {
    console.log("Error importing quiz folder:", error);
    return res
      .status(500)
      .json({ message: "Failed to import quiz folder", error: error.message });
  }
};

exports.removeQuizFolderFromCourseFolder = async (req, res) => {
  try {
    const { folderId, quizFolderId } = req.params;

    const folder = await Folder.findById(folderId);
    if (!folder) {
      return res.status(404).json({ message: "Course folder not found" });
    }
    if (!folder.QuizFolders.includes(quizFolderId)) {
      return res.status(404).json({
        message: "Quiz folder not found in this course folder",
        details:
          "The specified quiz folder is not associated with this course folder",
      });
    }

    const quizFolder = await QuizFolder.findById(quizFolderId);
    if (!quizFolder) {
      return res.status(404).json({ message: "Quiz folder does not exist" });
    }

    const updatedFolder = await Folder.findOneAndUpdate(
      {
        _id: folderId,
      },
      {
        $pull: {
          QuizFolders: quizFolderId,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    ).populate("QuizFolders");

    if (!updatedFolder) {
      return res.status(404).json({ message: "Folder not found" });
    }

    return res
      .status(200)
      .json({
        message: "Quiz folder removed successfully",
        folder: updatedFolder,
      });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to remove quiz folder", error: error.message });
  }
};

exports.updateFileOrder=async(req,res)=>{
  try{
    const {folderId}=req.params;
    const {fileIds}=req.body;

    const folder=await Folder.findById(folderId);
    if(!folder){
      return res.status(404).json({message:"Folder not found"});
    }

    await Folder.findByIdAndUpdate(folderId,{
      files:fileIds
    });

    const updatedFolder=await Folder.findById(folderId).populate("files");

    return res.status(200).json({
      message:"File order updated successfully",
      folder:updatedFolder
    });
  }catch(error){
    return res.status(500).json({message:"Failed to update file order",error:error.message});
  }
}