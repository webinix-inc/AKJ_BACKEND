// ============================================================================
// 🗂️ MASTER FOLDER CONTROLLER
// ============================================================================
// 
// Controller for managing the Master Content Folder system
// Handles API endpoints for folder operations with protection for system folders
//
// ============================================================================

const masterFolderService = require('../services/masterFolderService');
const Folder = require('../models/folderModel');
const logger = require('../utils/logger');
const mongoose = require('mongoose');
const { initializeLiveVideosFolder } = require('../utils/folderUtils');

// ============================================================================
// 🚀 MASTER FOLDER MANAGEMENT
// ============================================================================

/**
 * Initialize Master Folder System
 * POST /api/v1/admin/master-folder/initialize
 */
exports.initializeMasterFolder = async (req, res) => {
  try {
    logger.adminActivity(`Admin ${req.user._id} initializing Master Folder System`);
    
    const result = await masterFolderService.initializeMasterFolderSystem();
    
    logger.adminActivity(`Master Folder System initialized successfully by admin ${req.user._id}`);
    
    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        masterFolder: result.masterFolder,
        subfolders: result.subfolders || []
      }
    });
    
  } catch (error) {
    logger.error('❌ Error initializing Master Folder System:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize Master Folder System',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get Master Folder Hierarchy
 * GET /api/v1/admin/master-folder/hierarchy
 */
exports.getMasterFolderHierarchy = async (req, res) => {
  try {
    const { depth, includeFiles = 'true', folderId } = req.query;

    if (folderId && !mongoose.Types.ObjectId.isValid(folderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid folder ID'
      });
    }

    const parsedDepth = Math.min(Math.max(parseInt(depth, 10) || 2, 1), 5);
    const hierarchyOptions = {
      depth: parsedDepth,
      includeFiles: includeFiles !== 'false',
      folderId: folderId || null,
      lean: true
    };

    const result = await masterFolderService.getMasterFolderHierarchy(hierarchyOptions);
    
    res.status(200).json({
      success: true,
      message: result.message,
      data: result.masterFolder
    });
    
  } catch (error) {
    logger.error('❌ Error retrieving Master Folder hierarchy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve Master Folder hierarchy',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get System Folders
 * GET /api/v1/admin/master-folder/system-folders
 */
exports.getSystemFolders = async (req, res) => {
  try {
    const result = await masterFolderService.getSystemFolders();
    
    res.status(200).json({
      success: true,
      message: result.message,
      data: result.folders,
      count: result.count
    });
    
  } catch (error) {
    logger.error('❌ Error retrieving system folders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve system folders',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get Folder Statistics
 * GET /api/v1/admin/master-folder/statistics
 */
exports.getFolderStatistics = async (req, res) => {
  try {
    const result = await masterFolderService.getFolderStatistics();
    
    res.status(200).json({
      success: true,
      message: result.message,
      data: result.statistics
    });
    
  } catch (error) {
    logger.error('❌ Error retrieving folder statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve folder statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// ============================================================================
// 📁 ENHANCED FOLDER OPERATIONS
// ============================================================================

/**
 * Create Folder with Master Folder System Support
 * POST /api/v1/admin/folders
 */
exports.createFolder = async (req, res) => {
  try {
    const { name, parentFolderId, folderType = 'general', systemDescription } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Folder name is required'
      });
    }
    
    // Validate parent folder if provided
    if (parentFolderId) {
      if (!mongoose.Types.ObjectId.isValid(parentFolderId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid parent folder ID'
        });
      }
      
      const parentFolder = await Folder.findById(parentFolderId);
      if (!parentFolder) {
        return res.status(404).json({
          success: false,
          message: 'Parent folder not found'
        });
      }
    }
    
    // Create new folder
    const newFolder = await Folder.create({
      name,
      parentFolderId: parentFolderId || null,
      folderType,
      systemDescription,
      createdBy: req.user._id,
      folders: [],
      files: []
    });
    
    // Add to parent folder if specified
    if (parentFolderId) {
      await Folder.findByIdAndUpdate(parentFolderId, {
        $push: { folders: newFolder._id }
      });
    }
    
    // Auto-initialize Live Videos folder for top-level folders (no parent) or main folders
    const isMainFolder = !parentFolderId || folderType === 'course';
    if (isMainFolder) {
      try {
        const liveVideosFolder = await initializeLiveVideosFolder(newFolder._id);
        logger.adminActivity(`Admin ${req.user._id} auto-created Live Videos folder for: ${name}`);
      } catch (error) {
        logger.error('Failed to create Live Videos folder:', error);
        // Don't fail the main folder creation if Live Videos folder fails
      }
    }
    
    logger.adminActivity(`Admin ${req.user._id} created folder: ${name}`);
    
    res.status(201).json({
      success: true,
      message: 'Folder created successfully',
      data: newFolder
    });
    
  } catch (error) {
    logger.error('❌ Error creating folder:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create folder',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Update Folder with Protection Validation
 * PUT /api/v1/admin/folders/:folderId
 */
exports.updateFolder = async (req, res) => {
  try {
    const { folderId } = req.params;
    const { name, systemDescription } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(folderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid folder ID'
      });
    }
    
    const folder = await Folder.findById(folderId);
    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }
    
    // Prevent renaming of master folder
    if (folder.isMasterFolder && name && name !== folder.name) {
      return res.status(403).json({
        success: false,
        message: 'Master Content Folder name cannot be changed'
      });
    }
    
    // Update allowed fields
    const updateFields = {};
    if (name && !folder.isMasterFolder) updateFields.name = name;
    if (systemDescription !== undefined) updateFields.systemDescription = systemDescription;
    
    const updatedFolder = await Folder.findByIdAndUpdate(
      folderId,
      updateFields,
      { new: true }
    );
    
    logger.adminActivity(`Admin ${req.user._id} updated folder: ${updatedFolder.name}`);
    
    res.status(200).json({
      success: true,
      message: 'Folder updated successfully',
      data: updatedFolder
    });
    
  } catch (error) {
    logger.error('❌ Error updating folder:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update folder',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Delete Folder with Protection Validation
 * DELETE /api/v1/admin/folders/:folderId
 */
exports.deleteFolder = async (req, res) => {
  try {
    const { folderId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(folderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid folder ID'
      });
    }
    
    // Validate folder deletion permissions
    const validation = await masterFolderService.validateFolderDeletion(folderId);
    
    if (!validation.canDelete) {
      return res.status(403).json({
        success: false,
        message: validation.message,
        reason: validation.reason
      });
    }
    
    const folder = await Folder.findById(folderId);
    
    // Remove from parent folder's subfolder list
    if (folder.parentFolderId) {
      await Folder.findByIdAndUpdate(folder.parentFolderId, {
        $pull: { folders: folderId }
      });
    }
    
    // Delete the folder and all its contents recursively
    await deleteFolderRecursively(folderId);
    
    logger.adminActivity(`Admin ${req.user._id} deleted folder: ${folder.name}`);
    
    res.status(200).json({
      success: true,
      message: 'Folder deleted successfully'
    });
    
  } catch (error) {
    logger.error('❌ Error deleting folder:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete folder',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get Folder Contents
 * GET /api/v1/admin/folders/:folderId/contents
 */
exports.getFolderContents = async (req, res) => {
  try {
    const { folderId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(folderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid folder ID'
      });
    }
    
    const folder = await Folder.findById(folderId)
      .populate('folders', 'name folderType isSystemFolder isDeletable systemDescription createdAt')
      .populate('files', 'name fileUrl fileType uploadedAt')
      .populate('createdBy', 'firstName lastName');
    
    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Folder contents retrieved successfully',
      data: {
        folder: folder,
        subfolders: folder.folders || [],
        files: folder.files || [],
        totalSubfolders: folder.folders?.length || 0,
        totalFiles: folder.files?.length || 0
      }
    });
    
  } catch (error) {
    logger.error('❌ Error retrieving folder contents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve folder contents',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// ============================================================================
// 🔧 UTILITY FUNCTIONS
// ============================================================================

/**
 * Recursively delete folder and all its contents
 */
const deleteFolderRecursively = async (folderId) => {
  try {
    const folder = await Folder.findById(folderId);
    if (!folder) return;
    
    // Delete all subfolders recursively
    for (const subfolderId of folder.folders) {
      await deleteFolderRecursively(subfolderId);
    }
    
    // Delete all files in this folder
    // Note: File deletion logic would go here based on your file storage system
    
    // Finally, delete the folder itself
    await Folder.findByIdAndDelete(folderId);
    
  } catch (error) {
    logger.error(`❌ Error deleting folder ${folderId} recursively:`, error);
    throw error;
  }
};

/**
 * Check System Status
 * GET /api/v1/admin/master-folder/status
 */
exports.getSystemStatus = async (req, res) => {
  try {
    const status = await masterFolderService.isSystemInitialized();
    
    res.status(200).json({
      success: true,
      message: 'System status retrieved successfully',
      data: status
    });
    
  } catch (error) {
    logger.error('❌ Error checking system status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check system status',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Note: All functions are already exported using exports.functionName pattern above
// No need for additional module.exports since we're using exports.functionName throughout the file
