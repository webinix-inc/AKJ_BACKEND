const QuizFolder = require('../models/quizFolder');
const Course = require('../models/courseModel');
const mongoose = require("mongoose");

// Create a new folder
exports.createQuizFolder = async (req, res) => {
  try {
    const { name, parentFolderId, courses } = req.body;

    const newFolder = await QuizFolder.create({
      name,
      parentFolderId: parentFolderId || null,
      createdBy: req.user._id,
      courses: courses || [], // Support multiple courses
    });

    if (parentFolderId) {
      await QuizFolder.findByIdAndUpdate(parentFolderId, {
        $push: { subFolders: newFolder._id },
      });
    }

    return res.status(201).json({ message: "Folder created successfully", folder: newFolder });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create folder", error: error.message });
  }
};

// Update folder (name, courses, etc.)
exports.updateQuizFolder = async (req, res) => {
  try {
    const { folderId } = req.params;
    const { name, courses, isVisible } = req.body;

    if (!mongoose.Types.ObjectId.isValid(folderId)) {
      return res.status(400).json({ message: "Invalid folder ID." });
    }

    const updateFields = {};
    if (name) updateFields.name = name;
    if (Array.isArray(courses)) updateFields.courses = courses;
    if (typeof isVisible === "boolean") updateFields.isVisible = isVisible;

    const updatedFolder = await QuizFolder.findByIdAndUpdate(
      folderId,
      updateFields,
      { new: true }
    );

    if (!updatedFolder) {
      return res.status(404).json({ message: "Folder not found." });
    }

    res.status(200).json({ message: "Folder updated successfully.", folder: updatedFolder });
  } catch (error) {
    console.error("Error updating folder:", error);
    res.status(500).json({ message: "Internal server error.", error: error.message });
  }
};


exports.getQuizFolders = async (req, res) => {
  try {
    const { folderId } = req.params;

    if (folderId) {
      // Validate folderId
      if (!mongoose.Types.ObjectId.isValid(folderId)) {
        return res.status(400).json({ message: "Invalid folder ID." });
      }

      // Fetch specific folder with its subfolders and courses
      const folder = await QuizFolder.findById(folderId)
        .populate("subFolders", "name isVisible") // Populate subfolders with names and visibility
        .populate("courses", "title"); // Populate courses with their titles

      if (!folder) {
        return res.status(404).json({ message: "Folder not found." });
      }

      return res.status(200).json({
        message: "Folder retrieved successfully.",
        folder,
      });
    }

    // Fetch all folders with subfolders and courses
    const folders = await QuizFolder.find()
      .populate("subFolders", "name isVisible") // Populate subfolders with names and visibility
      .populate("courses", "title"); // Populate courses with their titles

    return res.status(200).json({
      message: "Folders retrieved successfully.",
      folders,
    });
  } catch (error) {
    console.error("Error retrieving folders:", error);
    return res.status(500).json({
      message: "Failed to retrieve folders.",
      error: error.message,
    });
  }
};

exports.getFolderStructure = async (req, res) => {
  try {
    const userId = req.user._id;
    console.log(`🔍 [DEBUG] Fetching quiz folders for user: ${userId}`);

    // Get user's purchased courses (including batch courses)
    const User = require('../models/userModel');
    const user = await User.findById(userId).populate('purchasedCourses.course', '_id');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Extract course IDs that user has access to
    const userCourseIds = user.purchasedCourses
      .filter(pc => pc.course) // Only include valid courses
      .map(pc => pc.course._id.toString());

    console.log(`🔍 [DEBUG] User has access to ${userCourseIds.length} courses:`, userCourseIds);

    // Admin users see all folders
    if (user.userType === "ADMIN") {
      console.log(`🔍 [DEBUG] Admin user - showing all folders`);
      const rootFolders = await QuizFolder.find({ parentFolderId: null, isVisible: true })
        .populate('courses', 'title courseType');

      return res.status(200).json({
        message: 'Folder structure fetched successfully (Admin)',
        folders: rootFolders
      });
    }

    // For regular users, only show folders for courses they have access to
    const rootFolders = await QuizFolder.find({
      parentFolderId: null,
      isVisible: true,
      courses: { $in: userCourseIds }
    }).populate('courses', 'title courseType');

    console.log(`🔍 [DEBUG] Found ${rootFolders.length} accessible quiz folders for user`);

    // Filter out folders that don't have any courses the user has access to
    const accessibleFolders = rootFolders.filter(folder => {
      const hasAccessibleCourse = folder.courses.some(course =>
        userCourseIds.includes(course._id.toString())
      );
      console.log(`🔍 [DEBUG] Folder "${folder.name}" accessible: ${hasAccessibleCourse}`);
      return hasAccessibleCourse;
    });

    return res.status(200).json({
      message: `Found ${accessibleFolders.length} accessible test folders`,
      folders: accessibleFolders
    });
  } catch (error) {
    console.error('❌ Error in getFolderStructure:', error);
    return res.status(500).json({ message: 'Failed to fetch folder structure', error: error.message });
  }
};

exports.getFolderContents = async (req, res) => {
  try {
    const { folderId } = req.params;
    const userId = req.user._id;

    // Validate folderId
    if (!folderId || folderId === 'undefined' || folderId === 'null') {
      return res.status(400).json({
        error: "Invalid folder ID provided",
        message: "Folder ID is required and must be valid"
      });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(folderId)) {
      return res.status(400).json({
        error: "Invalid folder ID format",
        message: "Folder ID must be a valid MongoDB ObjectId"
      });
    }

    const folder = await QuizFolder.findById(folderId)
      .populate({
        path: 'subFolders',
        populate: {
          path: 'subFolders quizzes'
        }
      })
      .populate('quizzes')
      .populate('courses', '_id title courseType');

    if (!folder) {
      return res.status(404).json({
        error: "Folder not found",
        message: "The requested folder does not exist"
      });
    }

    // Check if user has access to this folder (unless admin)
    const User = require('../models/userModel');
    const user = await User.findById(userId).populate('purchasedCourses.course', '_id');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Admin users have access to all folders
    if (user.userType !== "ADMIN") {
      // Extract course IDs that user has access to
      const userCourseIds = user.purchasedCourses
        .filter(pc => pc.course)
        .map(pc => pc.course._id.toString());

      // Check if user has access to any of the courses linked to this folder
      const hasAccess = folder.courses.some(course =>
        userCourseIds.includes(course._id.toString())
      );

      if (!hasAccess) {
        console.log(`🚫 Access denied to folder "${folder.name}" for user ${userId}`);
        return res.status(403).json({
          error: "Access denied",
          message: "You don't have access to this test folder"
        });
      }

      console.log(`✅ Access granted to folder "${folder.name}" for user ${userId}`);
    }

    // 🔧 FIX: Prevent browser/proxy caching
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    res.status(200).json({ message: "Folder contents retrieved", folder });
  } catch (error) {
    console.log("Error getting folder contents:", error);
    res
      .status(500)
      .json({ message: "Failed to get folder contents", error: error.message });
  }
};


// First deleteFolder function removed - duplicate

exports.addSubfolder = async (req, res) => {
  try {
    const { folderId: parentFolderId } = req.params;
    const { name } = req.body;

    const subfolder = await QuizFolder.create({
      name,
      parentFolderId,
      createdBy: req.user._id
    });

    await QuizFolder.findByIdAndUpdate(parentFolderId, {
      $push: { subFolders: subfolder._id },
    });

    res.status(201).json({ message: "Subfolder added successfully", subfolder });
  } catch (error) {
    console.log("Error adding subfolder:", error);
    res.status(500).json({ message: "Failed to add subfolder", error: error.message });
  }
};

exports.importQuizToCourse = async (req, res) => {
  try {
    const { courseId, quizId, folderId } = req.body;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Course not found'
      });
    }

    course.importedQuizzes.push({
      quizId,
      originalFolderId: folderId
    });

    await course.save();

    return res.status(200).json({ message: 'Quiz imported successfully', course });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to import quiz', error: error.message });
  }
};

exports.updateFolderName = async (req, res) => {
  try {
    const { folderId } = req.params;
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'Folder name is required' });
    }

    const existingFolder = await QuizFolder.findById(folderId);

    if (!existingFolder) {
      return res.status(404).json({ message: 'Folder not found' });
    }

    const subFolder = await QuizFolder.findById({
      parentFolderId: existingFolder.parentFolderId,
      name: name,
      _id: { $ne: folderId }
    });

    if (subFolder) {
      return res.status(400).json({ message: 'Folder with the same name already exists' });
    }

    existingFolder.name = name;
    await existingFolder.save();

    return res.status(200).json({ message: 'Folder name updated successfully', folder: existingFolder });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update folder name', error: error.message });
  }
}

exports.deleteFolder = async (req, res) => {
  try {
    const { folderId } = req.params;
    console.log(`🗑️ [DEBUG] Starting folder deletion for ID: ${folderId}`);

    // 🔧 FIX: Proper admin authorization check
    if (req.user.userType !== 'ADMIN') {
      console.log(`❌ [DEBUG] Unauthorized access attempt by user type: ${req.user.userType}`);
      return res.status(401).json({ message: 'Unauthorized to delete folder' });
    }

    const folder = await QuizFolder.findById(folderId);

    if (!folder) {
      console.log(`❌ [DEBUG] Folder not found: ${folderId}`);
      return res.status(404).json({ message: 'Folder not found' });
    }

    console.log(`📋 [DEBUG] Found folder: ${folder.name}`);

    // Check if folder has subfolders
    if (folder.subFolders && folder.subFolders.length > 0) {
      console.log(`⚠️ [DEBUG] Folder has ${folder.subFolders.length} subfolders`);
      return res.status(400).json({ message: 'Folder contains subfolders. Please delete them first' });
    }

    // Delete the folder
    const deleteResult = await QuizFolder.findByIdAndDelete(folderId);
    console.log(`🗑️ [DEBUG] Folder deleted: ${!!deleteResult}`);

    return res.status(200).json({ message: 'Folder deleted successfully' });
  } catch (error) {
    console.error(`❌ [DEBUG] Error deleting folder:`, error);
    return res.status(500).json({ message: 'Failed to delete folder', error: error.message });
  }
}

// exports.updateFolderName = async (req, res) => {
//   try {
//     const { folderId } = req.params;
//     const { name } = req.body;

//     if (!name || name.trim().length === 0) {
//       return res.status(400).json({ message: 'Folder name is required' });
//     }

//     const folder = await QuizFolder.findById(folderId);

//     if (!folder) {
//       return res.status(404).json({ message: 'Folder not found' });
//     }

//     folder.name = name;
//     await folder.save();

//     return res.status(200).json({ message: 'Folder name updated successfully', folder });
//   } catch (error) {
//     return res.status(500).json({ message: 'Failed to update folder name', error: error.message });
//   }
// };

exports.addSubfolder = async (req, res) => {
  try {
    const { folderId: parentFolderId } = req.params;
    const { name } = req.body;

    const subfolder = await QuizFolder.create({
      name,
      parentFolderId,
      createdBy: req.user._id
    });

    await QuizFolder.findByIdAndUpdate(parentFolderId, {
      $push: { subFolders: subfolder._id },
    });

    res.status(201).json({ message: "Subfolder added successfully", subfolder });
  } catch (error) {
    console.log("Error adding subfolder:", error);
    res.status(500).json({ message: "Failed to add subfolder", error: error.message });
  }
};