const Achiever = require("../models/Achiever");
const { generatePresignedUrl, generateUploadUrl, deleteFilesFromBucket } = require("../configs/aws.config");
const BUCKET_NAME = process.env.S3_BUCKET;

// Get all achievers
exports.getAchievers = async (req, res) => {
  try {
    const achievers = await Achiever.find();
    res.status(200).json(achievers);
  } catch (error) {
    res.status(500).json({ error: "Failed to retrieve achievers." });
  }
};

// controllers/achieverController.js
exports.addAchiever = async (req, res) => {
  if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No photos uploaded.' });
  }

  const photoUrls = req.files.map(file => file.location);

  const { year } = req.body;
  const newAchiever = new Achiever({
      photos: photoUrls, // assuming multiple photos can be linked to one achiever
      year,
      id: Date.now().toString(),
  });

  try {
      await newAchiever.save();
      res.status(201).json(newAchiever);
  } catch (error) {
      res.status(500).json({ error: "Failed to add achiever." });
  }
};

exports.updateAchiever = async (req, res) => {
  const { id } = req.params;
  const { year } = req.body;
  let updateData = { year };

  if (req.file) {
      const photoUrl = req.file.path;
      updateData.photo = photoUrl;
  }

  try {
      const updatedAchiever = await Achiever.findOneAndUpdate(
          { id },
          updateData,
          { new: true }
      );
      res.status(200).json(updatedAchiever);
  } catch (error) {
      res.status(500).json({ error: "Failed to update achiever." });
  }
};

// Delete an achiever and their image from S3
exports.deleteAchiever = async (req, res) => {
  const { id } = req.params;

  try {
      const achiever = await Achiever.findOneAndDelete({ id });
      if (achiever && achiever.photo) {
          const publicId = achiever.photo.split('/').pop().split('.')[0];
          await cloudinary.uploader.destroy(publicId);
      }
      res.status(200).json({ message: "Achiever deleted successfully." });
  } catch (error) {
      res.status(500).json({ error: "Failed to delete achiever." });
  }
};

// Generate a presigned upload URL
exports.getUploadUrl = async (req, res) => {
  const { key } = req.query;

  try {
    const url = await generateUploadUrl(BUCKET_NAME, key);
    res.status(200).json({ url });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate upload URL." });
  }
};

// Generate a presigned URL to view an image
exports.getViewUrl = async (req, res) => {
  const { key } = req.query;

  try {
    const url = await generatePresignedUrl(BUCKET_NAME, key);
    res.status(200).json({ url });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate view URL." });
  }
};