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

// Temporary test function to add sample FAQs
exports.addTestFaqs = async (req, res) => {
  try {
    const { courseId } = req.params;
    
    console.log(`📝 Adding test FAQs for course: ${courseId}`);
    
    // Sample FAQs
    const testFaqs = [
      {
        question: 'What is the duration of this course?',
        answer: 'This course runs for 12 months with comprehensive coverage of all topics.',
        category: 'General',
        course: courseId
      },
      {
        question: 'Are there any prerequisites for this course?',
        answer: 'Basic understanding of mathematics and science concepts is recommended.',
        category: 'Prerequisites',
        course: courseId
      },
      {
        question: 'What study materials are provided?',
        answer: 'We provide comprehensive study materials, practice tests, and video lectures.',
        category: 'Materials',
        course: courseId
      },
      {
        question: 'How can I access the course content?',
        answer: 'Once enrolled, you can access all course content through your student dashboard.',
        category: 'Access',
        course: courseId
      },
      {
        question: 'Is there any doubt clearing session?',
        answer: 'Yes, we conduct regular doubt clearing sessions and provide 24/7 support.',
        category: 'Support',
        course: courseId
      }
    ];
    
    // Insert test FAQs
    const newFaqs = await Faq.insertMany(testFaqs);
    
    console.log(`✅ Added ${newFaqs.length} test FAQs for course: ${courseId}`);
    
    res.status(201).json({
      message: `Successfully added ${newFaqs.length} test FAQs`,
      faqs: newFaqs
    });
    
  } catch (error) {
    console.error(`❌ Error adding test FAQs for course ${req.params.courseId}:`, error);
    res.status(500).json({ 
      message: "Failed to add test FAQs",
      error: error.message,
      courseId: req.params.courseId
    });
  }
};
