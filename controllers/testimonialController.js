const Testimonial = require('../models/Testimonial');

// Create a testimonial (only if the user hasn't submitted before)
const createTestimonial = async (req, res) => {
  try {
    const { name, text, imageUrl, isVisible } = req.body;

    console.log("Print the user req", req.body);

    const {userId} = req.body;

    console.log("Print the user ID:", userId);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: User ID is missing." });
    }

    // Check if the user already submitted a testimonial
    const existingTestimonial = await Testimonial.findOne({ userId });
    if (existingTestimonial) {
      return res.status(409).json({ 
        message: 'You have already submitted a testimonial.', 
        testimonial: existingTestimonial 
      });
    }

    // Save new testimonial linked to this user
    const newTestimonial = new Testimonial({
      userId,
      name,
      text,
      imageUrl,
      isVisible: isVisible !== undefined ? isVisible : false,
    });

    await newTestimonial.save();
    res.status(201).json(newTestimonial);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// Get a specific user's testimonial
const getUserTestimonial = async (req, res) => {
  try {
    const userId = req.userId;
    const testimonial = await Testimonial.findOne({ userId });

    if (!testimonial) {
      return res.status(404).json({ message: 'No testimonial found for this user.' });
    }

    res.status(200).json(testimonial);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// Get all testimonials
const getTestimonials = async (req, res) => {
  try {
    const testimonials = await Testimonial.find();
    res.status(200).json(testimonials);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get a specific user's testimonial (Admin use case)
const getTestimonialByUserId = async (req, res) => {
  try {
    const { userId } = req.params; // Fetch from request params

    if (!userId) {
      return res.status(400).json({ message: "User ID is required." });
    }

    const testimonial = await Testimonial.findOne({ userId });

    if (!testimonial) {
      return res.status(404).json({ message: "No testimonial found for this user." });
    }

    res.status(200).json(testimonial);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update a testimonial
const updateTestimonial = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, text, isVisible } = req.body;

    // Build the update object dynamically
    const updatedFields = {};
    if (name) updatedFields.name = name;
    if (text) updatedFields.text = text;
    if (isVisible !== undefined) updatedFields.isVisible = isVisible; // Directly use the provided value, ensuring it can be set true or false explicitly

    const updatedTestimonial = await Testimonial.findByIdAndUpdate(id, updatedFields, { new: true });

    if (!updatedTestimonial) {
      return res.status(404).json({ message: 'Testimonial not found' });
    }

    res.status(200).json(updatedTestimonial);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// Delete a testimonial
const deleteTestimonial = async (req, res) => {
  try {
    const { id } = req.params;
    await Testimonial.findByIdAndDelete(id);
    res.status(204).send(); // No Content
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createTestimonial,
  getTestimonials,
  getUserTestimonial,
  updateTestimonial,
  getTestimonialByUserId,
  deleteTestimonial,
};