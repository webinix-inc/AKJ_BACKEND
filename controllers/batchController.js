const Batch = require('../models/Batch');

// Get all batches
exports.getAllBatches = async (req, res) => {
  try {
    const batches = await Batch.find();
    res.json(batches);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch batches' });
  }
};

// Get a batch by ID
exports.getBatchById = async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.id);
    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    res.json(batch);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch batch' });
  }
};

// Create a new batch
exports.createBatch = async (req, res) => {
  const { title, description, videoSrc } = req.body;
  try {
    const newBatch = new Batch({ title, description,  videoSrc });
    await newBatch.save();
    res.status(201).json(newBatch);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create batch' });
  }
};

// Update an existing batch
exports.updateBatch = async (req, res) => {
  try {
    const updatedBatch = await Batch.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedBatch) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    res.json(updatedBatch);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update batch' });
  }
};

// Delete a batch
exports.deleteBatch = async (req, res) => {
  try {
    const deletedBatch = await Batch.findByIdAndDelete(req.params.id);
    if (!deletedBatch) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    res.json({ message: 'Batch deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete batch' });
  }
};