// controllers/faqController.js
const Faq = require('../models/faqModel');
const Course = require('../models/courseModel');

// Add multiple FAQs to a course
exports.createFaqs = async (req, res) => {
  try {
    const { faqs, courseId } = req.body; // Expecting 'faqs' to be an array of { question, answer, category }

    // Associate each FAQ with the courseId
    const faqsToInsert = faqs.map(faq => ({ ...faq, course: courseId }));

    // Bulk insert FAQs
    const newFaqs = await Faq.insertMany(faqsToInsert);

    // Extract IDs from inserted FAQs for batch course update
    const faqIds = newFaqs.map(faq => faq._id);

    // Add all new FAQ IDs to the course's 'faqs' array
    await Course.findByIdAndUpdate(courseId, { $push: { faqs: { $each: faqIds } } });

    res.status(201).json(newFaqs);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Retrieve FAQs for a specific course
exports.getFaqsByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    
    console.log(`📋 Fetching FAQs for course: ${courseId}`);
    
    // Validate courseId
    if (!courseId || !courseId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ 
        message: "Invalid course ID format",
        courseId: courseId 
      });
    }
    
    // Find FAQs for the course
    const faqs = await Faq.find({ course: courseId }).sort({ createdAt: -1 });
    
    console.log(`✅ Found ${faqs.length} FAQs for course: ${courseId}`);
    
    // Return FAQs (empty array if none found)
    res.status(200).json(faqs);
    
  } catch (error) {
    console.error(`❌ Error fetching FAQs for course ${req.params.courseId}:`, error);
    res.status(500).json({ 
      message: "Failed to fetch FAQs",
      error: error.message,
      courseId: req.params.courseId
    });
  }
};


