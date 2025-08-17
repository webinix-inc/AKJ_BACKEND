// ============================================================================
// 🗂️ MASTER FOLDER SERVICE
// ============================================================================
// 
// This service manages the Master Content Folder system - a permanent,
// non-deletable folder structure that exists independently of courses.
// It provides centralized content organization and ensures system stability.
//
// Key Features:
// - Master folder creation and initialization
// - System folder protection and validation
// - Hierarchical folder structure management
// - Auto-creation on server startup
//
// ============================================================================

const mongoose = require('mongoose');
const Folder = require('../models/folderModel');

// Safe logger import with fallback
let logger;
try {
  logger = require('../utils/logger').logger;
} catch (error) {
  // Fallback logger for testing
  logger = {
    system: (msg) => console.log('SYSTEM:', msg),
    error: (msg, err) => console.error('ERROR:', msg, err),
    adminActivity: (msg) => console.log('ADMIN:', msg)
  };
}

// ============================================================================
// 📋 MASTER FOLDER CONFIGURATION
// ============================================================================
const MASTER_FOLDER_CONFIG = {
  name: "📁 Master Content Folder",
  isMasterFolder: true,
  isSystemFolder: true,
  isDeletable: false,
  folderType: 'master',
  parentFolderId: null,
  systemDescription: "Central repository for all content management. This folder cannot be deleted and serves as the root for all content organization."
};

// ============================================================================
// 🚀 MASTER FOLDER INITIALIZATION
// ============================================================================

/**
 * Initialize the Master Folder system on server startup
 * Creates master folder and system subfolders if they don't exist
 */
const initializeMasterFolderSystem = async () => {
  try {
    logger.system('🗂️ Initializing Master Folder System...');
    
    // Check if master folder already exists
    const existingMasterFolder = await Folder.findOne({ 
      isMasterFolder: true 
    });
    
    if (existingMasterFolder) {
      logger.system(`✅ Master Folder already exists: ${existingMasterFolder.name}`);
      
      // Master Folder exists - no default subfolders needed
      
      return {
        success: true,
        masterFolder: existingMasterFolder,
        message: 'Master Folder system verified and updated'
      };
    }
    
    // Create new master folder system
    const masterFolderResult = await createMasterFolderSystem();
    
    logger.system('✅ Master Folder System initialized successfully');
    return masterFolderResult;
    
  } catch (error) {
    logger.error('❌ Failed to initialize Master Folder System:', error);
    throw new Error(`Master Folder initialization failed: ${error.message}`);
  }
};

/**
 * Create the complete master folder system with subfolders
 */
const createMasterFolderSystem = async () => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Create master folder
    const masterFolder = await Folder.create([{
      name: MASTER_FOLDER_CONFIG.name,
      isMasterFolder: MASTER_FOLDER_CONFIG.isMasterFolder,
      isSystemFolder: MASTER_FOLDER_CONFIG.isSystemFolder,
      isDeletable: MASTER_FOLDER_CONFIG.isDeletable,
      folderType: MASTER_FOLDER_CONFIG.folderType,
      parentFolderId: MASTER_FOLDER_CONFIG.parentFolderId,
      systemDescription: MASTER_FOLDER_CONFIG.systemDescription,
      folders: [],
      files: []
    }], { session });
    
    logger.system(`✅ Created Master Folder: ${masterFolder[0].name}`);
    
    await session.commitTransaction();
    
    return {
      success: true,
      masterFolder: masterFolder[0],
      subfolders: [],
      message: 'Master Folder created successfully - ready for custom content'
    };
    
  } catch (error) {
    await session.abortTransaction();
    logger.error('❌ Failed to create Master Folder system:', error);
    throw error;
  } finally {
    session.endSession();
  }
};

// 🗂️ System subfolder creation removed - Master Folder starts empty

// ============================================================================
// 🔒 FOLDER PROTECTION VALIDATION
// ============================================================================

/**
 * Validate if a folder can be deleted
 * Prevents deletion of master and system folders
 */
const validateFolderDeletion = async (folderId) => {
  try {
    const folder = await Folder.findById(folderId);
    
    if (!folder) {
      return {
        canDelete: false,
        reason: 'FOLDER_NOT_FOUND',
        message: 'Folder not found'
      };
    }
    
    if (folder.isMasterFolder) {
      return {
        canDelete: false,
        reason: 'MASTER_FOLDER_PROTECTED',
        message: 'Master Content Folder cannot be deleted'
      };
    }
    
    if (folder.isSystemFolder && !folder.isDeletable) {
      return {
        canDelete: false,
        reason: 'SYSTEM_FOLDER_PROTECTED',
        message: `System folder "${folder.name}" cannot be deleted`
      };
    }
    
    return {
      canDelete: true,
      reason: 'DELETION_ALLOWED',
      message: 'Folder can be deleted'
    };
    
  } catch (error) {
    logger.error('❌ Error validating folder deletion:', error);
    return {
      canDelete: false,
      reason: 'VALIDATION_ERROR',
      message: 'Error validating folder deletion permissions'
    };
  }
};

/**
 * Get master folder with its complete hierarchy
 */
const getMasterFolderHierarchy = async () => {
  try {
    const masterFolder = await Folder.findOne({ 
      isMasterFolder: true 
    }).populate({
      path: 'folders',
      populate: {
        path: 'folders',
        populate: {
          path: 'folders' // Support 3 levels deep
        }
      }
    }).populate('files');
    
    if (!masterFolder) {
      throw new Error('Master Folder not found. Please initialize the system.');
    }
    
    return {
      success: true,
      masterFolder: masterFolder,
      message: 'Master Folder hierarchy retrieved successfully'
    };
    
  } catch (error) {
    logger.error('❌ Error retrieving Master Folder hierarchy:', error);
    throw error;
  }
};

/**
 * Get all system folders (master + system subfolders)
 */
const getSystemFolders = async () => {
  try {
    const systemFolders = await Folder.find({
      $or: [
        { isMasterFolder: true },
        { isSystemFolder: true }
      ]
    }).sort({ createdAt: 1 });
    
    return {
      success: true,
      folders: systemFolders,
      count: systemFolders.length,
      message: 'System folders retrieved successfully'
    };
    
  } catch (error) {
    logger.error('❌ Error retrieving system folders:', error);
    throw error;
  }
};

// ============================================================================
// 🔧 UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if Master Folder system is properly initialized
 */
const isSystemInitialized = async () => {
  try {
    const masterFolder = await Folder.findOne({ isMasterFolder: true });
    const systemSubfolders = await Folder.find({ isSystemFolder: true });
    
    return {
      isInitialized: !!masterFolder,
      masterFolderExists: !!masterFolder,
      systemSubfoldersCount: systemSubfolders.length,
      expectedSubfoldersCount: 0 // No predefined subfolders - starts empty
    };
    
  } catch (error) {
    logger.error('❌ Error checking system initialization:', error);
    return {
      isInitialized: false,
      error: error.message
    };
  }
};

/**
 * Get folder statistics for admin dashboard
 */
const getFolderStatistics = async () => {
  try {
    const stats = await Folder.aggregate([
      {
        $group: {
          _id: '$folderType',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const totalFolders = await Folder.countDocuments();
    const systemFolders = await Folder.countDocuments({ isSystemFolder: true });
    const deletableFolders = await Folder.countDocuments({ isDeletable: true });
    
    return {
      success: true,
      statistics: {
        total: totalFolders,
        system: systemFolders,
        deletable: deletableFolders,
        protected: totalFolders - deletableFolders,
        byType: stats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {})
      },
      message: 'Folder statistics retrieved successfully'
    };
    
  } catch (error) {
    logger.error('❌ Error retrieving folder statistics:', error);
    throw error;
  }
};

// ============================================================================
// 📤 MODULE EXPORTS
// ============================================================================
module.exports = {
  // Initialization
  initializeMasterFolderSystem,
  createMasterFolderSystem,
  
  // Validation
  validateFolderDeletion,
  
  // Retrieval
  getMasterFolderHierarchy,
  getSystemFolders,
  
  // Utilities
  isSystemInitialized,
  getFolderStatistics,
  
  // Configuration
  MASTER_FOLDER_CONFIG
};
