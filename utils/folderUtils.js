/**
 * 🎥 FOLDER UTILITIES
 * 
 * Utility functions for folder operations including auto-initialization
 * of system folders like "Live Videos"
 */

const Folder = require('../models/folderModel');
const mongoose = require('mongoose');

/**
 * Auto-initialize "Live Videos" folder for main folders
 * This folder is automatically created for:
 * - Master Content Folder
 * - Course root folders
 * - Any top-level folder
 * 
 * @param {string} parentFolderId - ID of the parent folder
 * @param {object} options - Additional options
 * @param {object} session - MongoDB session for transactions (optional)
 * @returns {Promise<object>} Created Live Videos folder
 */
const initializeLiveVideosFolder = async (parentFolderId, options = {}, session = null) => {
  try {
    // Check if Live Videos folder already exists
    const existingLiveVideos = await Folder.findOne({
      name: '🎥 Live Videos',
      parentFolderId: parentFolderId
    });

    if (existingLiveVideos) {
      return existingLiveVideos;
    }

    // Create Live Videos folder
    const liveVideosFolderData = {
      name: '🎥 Live Videos',
      parentFolderId: parentFolderId,
      folderType: 'system',
      isSystemFolder: true,
      isDeletable: false, // System folder, cannot be deleted
      systemDescription: 'Automatically initialized folder for storing live class recordings from S3 and manual uploads',
      folders: [],
      files: []
    };

    const createOptions = session ? { session } : {};
    const liveVideosFolder = await Folder.create([liveVideosFolderData], createOptions);

    // Add to parent folder
    const updateOptions = session ? { session } : {};
    await Folder.findByIdAndUpdate(
      parentFolderId,
      { $push: { folders: liveVideosFolder[0]._id } },
      updateOptions
    );

    return liveVideosFolder[0];
  } catch (error) {
    console.error('❌ Error initializing Live Videos folder:', error);
    throw error;
  }
};

module.exports = {
  initializeLiveVideosFolder
};

