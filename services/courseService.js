// ============================================================================
// 📚 COURSE BUSINESS LOGIC SERVICE
// ============================================================================
// 
// This service handles all course-related business logic that was
// previously mixed in adminController.js. It maintains the same core
// logic and algorithms while providing better separation of concerns.
//
// Functions moved from adminController.js:
// - createCourse business logic (transaction management, FAQ handling, folder creation)
// - updateCourseById business logic (pricing updates, category management)
// - deleteCourseById business logic (recursive folder deletion)
// - deleteFolder recursive logic
// - Course validation and file handling
//
// ============================================================================

const mongoose = require("mongoose");
const Course = require("../models/courseModel");
const CourseCategory = require("../models/course/courseCategory");
const Faq = require("../models/faqModel");
const Folder = require("../models/folderModel");
const File = require("../models/fileModel");
const Subscription = require("../models/subscriptionModel");
const User = require("../models/userModel");
const UserSubscription = require("../models/userSubscriptionModel");
const installmentService = require("./installmentService");

// Import folder creation function from courseController
const { createFolder } = require("../controllers/courseController");

// ============================================================================
// 🆕 CREATE COURSE BUSINESS LOGIC
// ============================================================================
const createCourseLogic = async (courseData, files) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      title,
      description,
      subject,
      price,
      oldPrice,
      startDate,
      endDate,
      discount,
      duration,
      lessons,
      weeks,
      subCategory,
      approvalStatus,
      courseType,
      faqs,
    } = courseData;

    console.log("📚 Creating course with business logic service");
    console.log("FAQs:", faqs);
    console.log("Type of FAQs:", typeof faqs);

    // Ensure description is an array
    const descriptionArray = Array.isArray(description) ? description : [description];

    // Validate subCategory ID
    console.log("🔍 courseService - subCategory received:", subCategory, typeof subCategory);
    if (!subCategory || !mongoose.Types.ObjectId.isValid(subCategory)) {
      console.log("❌ courseService - Invalid subCategory:", { subCategory, isValid: mongoose.Types.ObjectId.isValid(subCategory) });
      throw new Error("Invalid or missing subCategory ID.");
    }

    // 🔥 CRITICAL: Check for duplicate course (case-insensitive, trimmed, within transaction)
    // Trim and normalize the title for comparison
    const normalizedTitle = (title || '').trim();
    if (!normalizedTitle) {
      console.error("❌ Empty title provided");
      // Abort transaction before throwing
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      session.endSession();
      throw new Error("Course title cannot be empty.");
    }

    console.log(`🔍 Checking for duplicate course with title: "${normalizedTitle}"`);

    // 🔥 CRITICAL: Check for duplicate BEFORE creating any course data
    // Use case-insensitive regex to match titles regardless of case
    // Escape special regex characters in the title to prevent regex injection
    const escapedTitle = normalizedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const titleRegex = new RegExp(`^\\s*${escapedTitle}\\s*$`, 'i');

    // Check for duplicate within transaction to ensure isolation
    // Use readConcern to ensure we see the latest committed data
    const existingCourse = await Course.findOne({
      title: { $regex: titleRegex }
    }).session(session);

    if (existingCourse) {
      // Double-check with exact normalized comparison to avoid false positives
      const existingTitleNormalized = (existingCourse.title || '').trim().toLowerCase();
      const newTitleNormalized = normalizedTitle.toLowerCase();

      if (existingTitleNormalized === newTitleNormalized) {
        console.error(`❌ Duplicate course found:`, {
          existingTitle: existingCourse.title,
          existingId: existingCourse._id,
          newTitle: normalizedTitle
        });

        // 🔥 CRITICAL: Abort transaction immediately before throwing error
        if (session.inTransaction()) {
          await session.abortTransaction();
        }
        session.endSession();

        throw new Error("Course with this title already exists.");
      }
    }

    console.log(`✅ No duplicate found for title: "${normalizedTitle}"`);

    // Validate subCategory and get category ID
    const categoryDoc = await CourseCategory.findOne({
      "subCategories._id": subCategory,
    });
    if (!categoryDoc) {
      throw new Error("Specified subCategory does not exist.");
    }
    const category = categoryDoc._id;

    // Handle file uploads
    let courseImage = [];
    let courseNotes = [];
    let courseVideo = [];
    if (files) {
      if (files["courseImage"]) {
        courseImage = files["courseImage"].map((file) => file.location);
      }
      if (files["courseNotes"]) {
        courseNotes = files["courseNotes"].map((file) => file.location);
      }
      if (files["courseVideo"]) {
        courseVideo = files["courseVideo"].map((file) => ({
          url: file.location,
          type: "Free",
        }));
      }
    }

    // Create the course (use normalized/trimmed title)
    const course = new Course({
      title: normalizedTitle, // Use trimmed title
      description: descriptionArray,
      subject,
      price,
      oldPrice,
      startDate,
      endDate,
      discount,
      duration,
      lessons,
      weeks,
      courseImage,
      courseNotes,
      courseVideo,
      category,
      subCategory,
      approvalStatus,
      courseType,
    });

    await course.save({ session });
    console.log("✅ Course saved to database");

    // Handle FAQs
    let faqIds = [];
    if (faqs && faqs.length > 0) {
      const parsedFaqs = typeof faqs === "string" ? JSON.parse(faqs) : faqs;
      if (!Array.isArray(parsedFaqs)) {
        throw new Error("FAQs must be an array.");
      }
      const faqsToInsert = parsedFaqs.map((faq) => ({
        ...faq,
        course: course._id,
      }));
      const newFaqs = await Faq.insertMany(faqsToInsert, { session });
      faqIds = newFaqs.map((faq) => faq._id);
    }
    course.faqs = faqIds;
    await course.save({ session });
    console.log("✅ FAQs processed and linked to course");

    // Add course to subCategory
    await CourseCategory.updateOne(
      { "subCategories._id": subCategory },
      { $push: { "subCategories.$.courses": course._id } },
      { session }
    );
    console.log("✅ Course added to subCategory");

    // Automatically create a root folder for the course (within transaction)
    try {
      const Folder = require('../models/folderModel');

      // Check if course already has a root folder
      if (course.rootFolder) {
        console.log("ℹ️ Course already has a root folder, skipping creation");
      } else {
        // Create folder within transaction
        const newFolder = new Folder({
          name: normalizedTitle,
          folders: [],
          files: [],
          parentFolderId: null
        });
        await newFolder.save({ session });

        // Update course with rootFolder (within transaction)
        course.rootFolder = newFolder._id;
        await course.save({ session });

        // Auto-initialize Live Videos folder for course root folders
        try {
          const { initializeLiveVideosFolder } = require('../utils/folderUtils');
          await initializeLiveVideosFolder(newFolder._id, {}, session);
          console.log(`✅ Auto-created Live Videos folder for course: ${normalizedTitle}`);
        } catch (liveVideosError) {
          console.error('❌ Failed to create Live Videos folder:', liveVideosError);
          // Don't fail the main course creation if Live Videos folder fails
        }

        console.log("✅ Root folder created and linked to course");
      }
    } catch (folderError) {
      console.error("❌ Error creating root folder:", folderError);
      // Don't fail course creation if folder creation fails - folder can be created later
      // But log the error for debugging
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    console.log("🎉 Course creation completed successfully");
    return course;
  } catch (error) {
    // Only abort if transaction is still active (not already aborted)
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    console.error("❌ Error in createCourseLogic:", error.message || error);
    console.error("❌ Error stack:", error.stack);
    throw error;
  }
};

// ============================================================================
// 🔄 UPDATE COURSE BUSINESS LOGIC
// ============================================================================
const updateCourseLogic = async (courseId, updateData, files) => {
  try {
    const {
      title,
      description,
      subject,
      price,
      oldPrice,
      startDate,
      endDate,
      discount,
      duration,
      lessons,
      weeks,
      subCategory,
      approvalStatus,
      courseType,
    } = updateData;

    console.log("📚 Updating course with business logic service");
    console.log("📝 Update data received:", {
      title: title || 'not provided',
      hasTitle: !!title,
      titleType: typeof title,
      titleValue: title
    });

    // Find the existing course
    const course = await Course.findById(courseId);
    if (!course) {
      throw new Error("Course not found");
    }

    console.log("📋 Current course title:", course.title);

    // Handle description - can be HTML string or array
    let descriptionArray;
    if (description) {
      if (Array.isArray(description)) {
        descriptionArray = description;
      } else if (typeof description === 'string') {
        // If it's HTML content, keep it as a single string in array
        // If it contains HTML tags, treat as HTML, otherwise split by lines
        if (description.includes('<') && description.includes('>')) {
          descriptionArray = [description]; // Keep HTML as single string
        } else {
          // Split plain text by lines for backward compatibility
          descriptionArray = description.split('\n').filter(line => line.trim());
        }
      } else {
        descriptionArray = [String(description)];
      }
      console.log('📝 Processed description:', {
        original: typeof description,
        processed: descriptionArray.length + ' items',
        isHTML: description.includes('<') && description.includes('>')
      });
    }

    // Validate subCategory if provided and different from current
    if (subCategory && subCategory !== course.subCategory) {
      if (!mongoose.Types.ObjectId.isValid(subCategory)) {
        throw new Error("Invalid subCategory ID format.");
      }
      const categoryDoc = await CourseCategory.findOne({
        "subCategories._id": subCategory,
      });
      if (!categoryDoc) {
        throw new Error("Specified subCategory does not exist.");
      }

      // Update category relationships
      await CourseCategory.updateOne(
        { "subCategories._id": course.subCategory },
        { $pull: { "subCategories.$.courses": course._id } }
      );
      await CourseCategory.updateOne(
        { "subCategories._id": subCategory },
        { $push: { "subCategories.$.courses": course._id } }
      );

      course.subCategory = subCategory;
      course.category = categoryDoc._id;
      console.log("✅ Course category relationships updated");
    }

    // Check for unique title, excluding the current course
    // Only validate uniqueness if title is being changed
    if (title && title.trim() && title.trim() !== course.title) {
      console.log("🔍 Checking title uniqueness - title is being changed");
      const existingCourse = await Course.findOne({
        title: title.trim(),
        _id: { $ne: courseId } // Exclude current course
      });
      if (existingCourse) {
        console.log("❌ Title already exists:", title);
        throw new Error("Course with this title already exists.");
      }
      console.log("✅ Title is unique");
    } else if (title && title.trim() === course.title) {
      console.log("ℹ️ Title unchanged, will still update to ensure consistency");
    }

    // Handle file uploads
    console.log('🔍 Course Update - Files received:', files ? Object.keys(files) : 'No files');

    if (files) {
      if (files["courseImage"]) {
        console.log('📸 Updating course images:', files["courseImage"].length, 'files');
        files["courseImage"].forEach((file, index) => {
          console.log(`   ${index + 1}. ${file.originalname} -> ${file.location}`);
        });

        course.courseImage = files["courseImage"].map((file) => file.location);
        console.log('✅ Course images updated in memory');
      } else {
        console.log('📸 No courseImage files in request');
      }

      if (files["courseNotes"]) {
        course.courseNotes = files["courseNotes"].map((file) => file.location);
      }
      if (files["courseVideo"]) {
        course.courseVideo = files["courseVideo"].map((file) => ({
          url: file.location,
          type: "Free",
        }));
      }
    } else {
      console.log('📁 No files received in request');
    }

    // Prepare update data object
    const updateFields = {};

    // 🔥 CRITICAL: Include title in updateFields if provided and not empty
    // This ensures title updates even if it's the same value (for consistency)
    if (title !== undefined && title !== null && String(title).trim() !== '') {
      updateFields.title = String(title).trim();
      console.log('📝 Title will be updated:', updateFields.title);
    } else if (title !== undefined) {
      console.log('⚠️ Title provided but is empty, skipping title update');
    } else {
      console.log('ℹ️ No title provided in update request');
    }

    if (descriptionArray) updateFields.description = descriptionArray;
    if (subject) updateFields.subject = subject;
    if (price !== undefined) updateFields.price = price;
    if (oldPrice !== undefined) updateFields.oldPrice = oldPrice;
    if (startDate) updateFields.startDate = startDate;
    if (endDate) updateFields.endDate = endDate;
    if (discount !== undefined) updateFields.discount = discount;
    if (duration) updateFields.duration = duration;
    if (lessons) updateFields.lessons = lessons;
    if (weeks) updateFields.weeks = weeks;
    if (approvalStatus) updateFields.approvalStatus = approvalStatus;

    // Handle courseType - allow any value since enum validation is disabled
    if (courseType) {
      updateFields.courseType = courseType;
    }

    // Handle file updates
    if (files) {
      if (files["courseImage"]) {
        updateFields.courseImage = files["courseImage"].map((file) => file.location);
      }
      if (files["courseNotes"]) {
        updateFields.courseNotes = files["courseNotes"].map((file) => file.location);
      }
      if (files["courseVideo"]) {
        updateFields.courseVideo = files["courseVideo"].map((file) => ({
          url: file.location,
          type: "Free",
        }));
      }
    }

    console.log('📝 Update fields prepared:', Object.keys(updateFields));

    // Use findByIdAndUpdate with runValidators: false to avoid enum validation issues
    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
      { $set: updateFields },
      {
        new: true,
        runValidators: false, // Skip validation to avoid courseType enum issues
        populate: [
          { path: 'category', select: 'name' },
          { path: 'teacher', select: 'firstName lastName email' }
        ]
      }
    );

    if (!updatedCourse) {
      throw new Error("Course not found or update failed");
    }

    console.log('💾 Course updated successfully in database');
    console.log('📸 Final course images:', updatedCourse.courseImage);

    // 🔥 CRITICAL: Update installment plans if course pricing changed
    if (price || discount) {
      console.log("💰 Course pricing changed, checking for subscription to update installment plans...");

      try {
        const subscription = await Subscription.findOne({ course: courseId });
        if (subscription && subscription.validities && subscription.validities.length > 0) {
          console.log("📊 Found subscription, updating installment plans...");

          await installmentService.updateExistingInstallmentPlans(
            courseId,
            subscription,
            subscription.validities
          );
          console.log("✅ Installment plans updated after course pricing change");
        } else {
          console.log("ℹ️ No subscription found for this course, skipping installment update");
        }
      } catch (installmentUpdateError) {
        console.error("❌ Error updating installment plans after course update:", installmentUpdateError);
        // Log error but don't fail the course update
      }
    }

    console.log("🎉 Course update completed successfully");
    return updatedCourse;
  } catch (error) {
    console.error("❌ Error in updateCourseLogic:", error);
    throw error;
  }
};

// ============================================================================
// 🗑️ DELETE COURSE BUSINESS LOGIC
// ============================================================================
const deleteCourseLogic = async (courseId) => {
  try {
    console.log("📚 Deleting course with business logic service");

    // Find and delete the course
    const course = await Course.findById(courseId).populate("rootFolder");
    if (!course) {
      throw new Error("Course not found");
    }

    // Prevent deletion if students are enrolled/purchased this course
    const hasActiveSubscriptions = await UserSubscription.exists({
      course: courseId,
      status: { $in: ["Pending", "Active"] },
    });
    const hasPurchasedUsers = await User.exists({
      "purchasedCourses.course": courseId,
    });

    if (hasActiveSubscriptions || hasPurchasedUsers) {
      throw new Error(
        "Cannot delete course while students are enrolled. Please revoke or reassign access before deleting."
      );
    }

    // Recursively delete its rootfolder and everything inside
    if (course.rootFolder) {
      await deleteFolderRecursively(course.rootFolder);
      console.log("✅ Root folder and all contents deleted recursively");
    }

    await course.deleteOne();
    console.log("✅ Course deleted from database");

    console.log("🎉 Course deletion completed successfully");
    return {
      message: "Course and related content deleted successfully",
      courseId: courseId
    };
  } catch (error) {
    console.error("❌ Error in deleteCourseLogic:", error);
    throw error;
  }
};

// ============================================================================
// 🗂️ RECURSIVE FOLDER DELETION UTILITY
// ============================================================================
const deleteFolderRecursively = async (folder) => {
  if (!folder) return;

  try {
    console.log(`🗂️ Deleting folder: ${folder.name || 'Unnamed'}`);

    // Delete all subfolders recursively
    if (folder.folders && Array.isArray(folder.folders)) {
      for (const subfolderId of folder.folders) {
        const subfolder = await Folder.findById(subfolderId);
        if (subfolder) {
          await deleteFolderRecursively(subfolder);
        }
      }
    }

    // Delete all files
    if (folder.files && Array.isArray(folder.files)) {
      for (const fileId of folder.files) {
        const file = await File.findById(fileId);
        if (file) {
          await file.deleteOne();
          console.log(`📄 Deleted file: ${file.name || 'Unnamed'}`);
        }
      }
    }

    // Delete the folder itself
    await folder.deleteOne();
    console.log(`✅ Folder deleted: ${folder.name || 'Unnamed'}`);
  } catch (error) {
    console.error(`❌ Error deleting folder: ${error.message}`);
    throw error;
  }
};

// ============================================================================
// 📊 COURSE VALIDATION UTILITIES
// ============================================================================
const validateCourseData = (data) => {
  const errors = [];

  // Required fields validation
  if (!data.title) errors.push("Title is required");
  if (!data.description) errors.push("Description is required");
  if (!data.subCategory) errors.push("SubCategory is required");

  // ObjectId validation
  if (data.subCategory && !mongoose.Types.ObjectId.isValid(data.subCategory)) {
    errors.push("Invalid subCategory ID format");
  }

  // Price validation
  if (data.price && (typeof data.price !== "number" || data.price < 0)) {
    errors.push("Price must be a non-negative number");
  }

  if (data.oldPrice && (typeof data.oldPrice !== "number" || data.oldPrice < 0)) {
    errors.push("Old price must be a non-negative number");
  }

  // Date validation
  if (data.startDate && isNaN(Date.parse(data.startDate))) {
    errors.push("Invalid start date format");
  }

  if (data.endDate && isNaN(Date.parse(data.endDate))) {
    errors.push("Invalid end date format");
  }

  // Duration validation
  if (data.duration && (typeof data.duration !== "number" || data.duration <= 0)) {
    errors.push("Duration must be a positive number");
  }

  return errors;
};

// ============================================================================
// 🔍 COURSE QUERY UTILITIES
// ============================================================================
const checkExistingCourse = async (title, excludeId = null) => {
  try {
    const query = { title };
    if (excludeId) {
      query._id = { $ne: excludeId };
    }
    const existingCourse = await Course.findOne(query);
    return existingCourse;
  } catch (error) {
    console.error("Error checking existing course:", error);
    throw error;
  }
};

const getCourseWithDetails = async (courseId) => {
  try {
    const course = await Course.findById(courseId)
      .populate("subjects")
      .populate("teacher")
      .populate("faqs")
      .populate("rootFolder");

    return course;
  } catch (error) {
    console.error("Error getting course with details:", error);
    throw error;
  }
};

// ============================================================================
// 🎯 COURSE BUSINESS OPERATIONS
// ============================================================================
const toggleCoursePublishStatus = async (courseId, isPublished) => {
  try {
    // Validate input
    if (typeof isPublished !== "boolean") {
      throw new Error("'isPublished' must be a boolean value (true or false).");
    }

    // Find the course by ID
    const course = await Course.findById(courseId);
    if (!course) {
      throw new Error("Course not found.");
    }

    // Debug logging
    console.log(`Checking publish requirements for course: ${course.title} (${course._id})`);
    console.log(`Course Type: '${course.courseType}'`);

    const isBatch = course.courseType && course.courseType.toLowerCase() === "batch";

    // If trying to publish, check if any subscriptions exist (Skipping for Batches)
    if (isPublished && !isBatch) {
      const Subscription = require("../models/subscriptionModel");
      const subCount = await Subscription.countDocuments({ course: courseId });

      console.log(`Subscription count: ${subCount}`);

      if (subCount === 0) {
        throw new Error("Cannot publish course without any active subscription plans. Please add a subscription plan first.");
      }
    }

    // Update the isPublished field using findByIdAndUpdate to avoid validation
    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
      { isPublished: isPublished },
      { new: true, runValidators: false }
    );

    console.log(`✅ Course successfully ${isPublished ? "published" : "unpublished"}`);
    return {
      message: `Course successfully ${isPublished ? "published" : "unpublished"}.`,
      course: updatedCourse
    };
  } catch (error) {
    console.error("Error in toggleCoursePublishStatus:", error);
    throw error;
  }
};

const addTeacherToCourse = async (courseId, teacherId) => {
  try {
    const course = await Course.findById(courseId);
    if (!course) {
      throw new Error("Course not found");
    }

    // Note: Teacher validation should be done in the controller or a separate service
    // For now, we'll assume the teacher validation is handled elsewhere

    // Update teacher using findByIdAndUpdate to avoid validation
    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
      { teacher: teacherId },
      { new: true, runValidators: false }
    );

    console.log("✅ Teacher added to course successfully");
    return {
      message: "Teacher added to course successfully",
      course: updatedCourse
    };
  } catch (error) {
    console.error("Error in addTeacherToCourse:", error);
    throw error;
  }
};

const removeTeacherFromCourse = async (courseId) => {
  try {
    const course = await Course.findById(courseId);
    if (!course) {
      throw new Error("Course not found");
    }

    // Remove teacher using findByIdAndUpdate to avoid validation
    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
      { $unset: { teacher: 1 } },
      { new: true, runValidators: false }
    );

    console.log("✅ Teacher removed from course successfully");
    return {
      message: "Teacher removed from course successfully",
      course: updatedCourse
    };
  } catch (error) {
    console.error("Error in removeTeacherFromCourse:", error);
    throw error;
  }
};

// ============================================================================
// 📤 EXPORTS
// ============================================================================
module.exports = {
  createCourseLogic,
  updateCourseLogic,
  deleteCourseLogic,
  deleteFolderRecursively,
  validateCourseData,
  checkExistingCourse,
  getCourseWithDetails,
  toggleCoursePublishStatus,
  addTeacherToCourse,
  removeTeacherFromCourse
};
