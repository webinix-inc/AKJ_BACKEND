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
    const rootFolders = await QuizFolder.find({ parentFolderId: null })
    //   .populate({
    //     path: 'subFolders',
    //     populate: {
    //       path: 'subFolders quizzes'
    //     }
    //   })
    //   .populate('quizzes');

    return res.status(200).json({ message: 'Folder structure fetched successfully', folders: rootFolders });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch folder structure', error: error.message });
  }
};

exports.getFolderContents = async (req, res) => {
  try {
    const { folderId } = req.params;
    const folder = await QuizFolder.findById(folderId)
      .populate({
        path: 'subFolders',
        populate: {
          path: 'subFolders quizzes'
        }
      })
      .populate('quizzes');

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


exports.deleteFolder = async (req, res) => {
  try {
    const { folderId } = req.params;

    if (req.user.userType === 'admin') {
      return res.status(401).json({ message: 'Unauthorized to delete folder' });
    }

    const folder = await QuizFolder.findById(folderId);
    if (!folder) {
      console.log(`Folder with id ${folderId} not found`);
      return;

    }

    async function deleteSubfolders(folderId) {
      const folder = await QuizFolder.findById(folderId);
      if (!folder) return;

      // Delete all subfolders
      for (const subFolderId of folder.subFolders) {
        await deleteSubfolders(subFolderId);
      }

      if (folder.parentFolderId) {
        await QuizFolder.findByIdAndUpdate(folder.parentFolderId, {
          $pull: { subFolders: folder._id }
        });
      }

      await QuizFolder.findByIdAndDelete(folderId);
    }

    await deleteSubfolders(folderId);

    res.status(200).json({ message: "Folder and its contents deleted successfully" });
  } catch (error) {
    console.log("Error deleting folder:", error);
    res
      .status(500)
      .json({ message: "Failed to delete folder", error: error.message });
  }
};

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

    console.log("Folder ID is exist:", folderId);

    // if(req.user.userType === 'admin') {
    //     return res.status(401).json({message: 'Unauthorized to delete folder'});
    // }

    const folder = await QuizFolder.findById(folderId);

    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }



    if (folder.subFolders.length > 0) {
      return res.status(400).json({ message: 'Folder contains subfolders. Please delete them first' });
    }

    await QuizFolder.findByIdAndDelete(folderId);

    return res.status(200).json({ message: 'Folder deleted successfully' });
  } catch (error) {
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