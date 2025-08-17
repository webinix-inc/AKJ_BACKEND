// ============================================================================
// 🗂️ MASTER FOLDER ROUTES
// ============================================================================
// 
// API routes for Master Content Folder system management
// Provides endpoints for folder operations with system protection
//
// ============================================================================

const express = require('express');
const masterFolderController = require('../controllers/masterFolderController');
const authJwt = require('../middlewares/authJwt');
const { cacheConfigs } = require('../middlewares/cacheMiddleware');

module.exports = (app) => {
  
  // ============================================================================
  // 🚀 MASTER FOLDER SYSTEM MANAGEMENT
  // ============================================================================
  
  // Initialize Master Folder System
  app.post(
    '/api/v1/admin/master-folder/initialize',
    [authJwt.verifyToken],
    masterFolderController.initializeMasterFolder
  );
  
  // Get Master Folder Hierarchy (cached for performance)
  app.get(
    '/api/v1/admin/master-folder/hierarchy',
    [authJwt.verifyToken, cacheConfigs.medium()],
    masterFolderController.getMasterFolderHierarchy
  );
  
  // Get System Folders (cached)
  app.get(
    '/api/v1/admin/master-folder/system-folders',
    [authJwt.verifyToken, cacheConfigs.long()],
    masterFolderController.getSystemFolders
  );
  
  // Get Folder Statistics (cached)
  app.get(
    '/api/v1/admin/master-folder/statistics',
    [authJwt.verifyToken, cacheConfigs.medium()],
    masterFolderController.getFolderStatistics
  );
  
  // Check System Status
  app.get(
    '/api/v1/admin/master-folder/status',
    [authJwt.verifyToken],
    masterFolderController.getSystemStatus
  );
  
  // ============================================================================
  // 📁 ENHANCED FOLDER OPERATIONS
  // ============================================================================
  
  // Create Folder
  app.post(
    '/api/v1/admin/folders',
    [authJwt.verifyToken],
    masterFolderController.createFolder
  );
  
  // Update Folder
  app.put(
    '/api/v1/admin/folders/:folderId',
    [authJwt.verifyToken],
    masterFolderController.updateFolder
  );
  
  // Delete Folder (with protection validation)
  app.delete(
    '/api/v1/admin/folders/:folderId',
    [authJwt.verifyToken],
    masterFolderController.deleteFolder
  );
  
  // Get Folder Contents (cached for performance)
  app.get(
    '/api/v1/admin/folders/:folderId/contents',
    [authJwt.verifyToken, cacheConfigs.short()],
    masterFolderController.getFolderContents
  );
  
  // ============================================================================
  // 👥 USER ACCESS ROUTES (Read-only for users)
  // ============================================================================
  
  // Users can view master folder hierarchy (read-only)
  app.get(
    '/api/v1/user/master-folder/hierarchy',
    [authJwt.verifyToken, cacheConfigs.long()],
    masterFolderController.getMasterFolderHierarchy
  );
  
  // Users can view folder contents (read-only)
  app.get(
    '/api/v1/user/folders/:folderId/contents',
    [authJwt.verifyToken, cacheConfigs.medium()],
    masterFolderController.getFolderContents
  );

};
