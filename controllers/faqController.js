// controllers/faqController.js
const Faq = require('../models/faqModel');
const Course = require('../models/courseModel');

// Unified FAQ creation - handles both single and bulk FAQ creation
exports.createFaqs = async (req, res) => {
  try {
    console.log('📝 FAQ Creation - Function Entry Point');
    console.log('📝 Request Method:', req.method);
    console.log('📝 Request URL:', req.url);
    console.log('📝 Request Body:', JSON.stringify(req.body, null, 2));
    console.log('📝 Request Body Type:', typeof req.body);
    console.log('📝 Request Body Keys:', Object.keys(req.body || {}));
    
    // Ensure req.body exists
    if (!req.body || typeof req.body !== 'object') {
      console.log('❌ Invalid request body');
      return res.status(400).json({
        success: false,
        message: "Invalid request body"
      });
    }
    
    // Check if this is a single FAQ creation (new format)
    if (req.body.course && req.body.question && req.body.answer) {
      console.log('📝 ✅ Detected single FAQ creation format');
      console.log('📝 Course ID:', req.body.course);
      console.log('📝 Question:', req.body.question);
      return await handleSingleFaqCreation(req, res);
    }
    
    // Check if this is bulk FAQ creation (old format)
    if (req.body.faqs && Array.isArray(req.body.faqs) && req.body.courseId) {
      console.log('📝 ✅ Detected bulk FAQ creation format');
      console.log('📝 Course ID:', req.body.courseId);
      console.log('📝 FAQ Count:', req.body.faqs.length);
      return await handleBulkFaqCreation(req, res);
    }
    
    // Invalid format
    console.log('❌ Invalid FAQ creation format detected');
    console.log('📝 Has course?', !!req.body.course);
    console.log('📝 Has question?', !!req.body.question);
    console.log('📝 Has answer?', !!req.body.answer);
    console.log('📝 Has faqs array?', Array.isArray(req.body.faqs));
    console.log('📝 Has courseId?', !!req.body.courseId);
    
    return res.status(400).json({
      success: false,
      message: "Invalid FAQ creation format. Expected either single FAQ {course, question, answer, category} or bulk FAQs {faqs: [...], courseId}",
      received: {
        hasCourse: !!req.body.course,
        hasQuestion: !!req.body.question,
        hasAnswer: !!req.body.answer,
        hasFaqs: Array.isArray(req.body.faqs),
        hasCourseId: !!req.body.courseId,
        bodyKeys: Object.keys(req.body)
      }
    });
    
  } catch (error) {
    console.error('❌ Error in createFaqs:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      message: "Failed to create FAQ(s)",
      error: error.message 
    });
  }
};

// Handle single FAQ creation
async function handleSingleFaqCreation(req, res) {
  const { course, question, answer, category } = req.body;
  
  console.log(`📝 Creating single FAQ for course: ${course}`);
  
  // Validate required fields
  if (!course || !question || !answer) {
    return res.status(400).json({
      success: false,
      message: "Course ID, question, and answer are required"
    });
  }
  
  // Validate courseId format
  if (!course.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({
      success: false,
      message: "Invalid course ID format"
    });
  }
  
  // Check if course exists
  const courseExists = await Course.findById(course);
  if (!courseExists) {
    return res.status(404).json({
      success: false,
      message: "Course not found"
    });
  }
  
  // Create new FAQ
  const newFaq = new Faq({
    course,
    question: question.trim(),
    answer: answer.trim(),
    category: category || "General"
  });
  
  const savedFaq = await newFaq.save();
  
  // Add FAQ ID to course's faqs array
  await Course.findByIdAndUpdate(course, { 
    $push: { faqs: savedFaq._id } 
  });
  
  console.log(`✅ Single FAQ created successfully: ${savedFaq._id}`);
  
  return res.status(201).json({
    success: true,
    data: savedFaq,
    message: "FAQ created successfully"
  });
}

// Handle bulk FAQ creation (legacy support)
async function handleBulkFaqCreation(req, res) {
  const { faqs, courseId } = req.body;
  
  console.log(`📝 Creating ${faqs.length} FAQs for course: ${courseId}`);
  
  // Validate courseId format
  if (!courseId.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({
      success: false,
      message: "Invalid course ID format"
    });
  }
  
  // Check if course exists
  const courseExists = await Course.findById(courseId);
  if (!courseExists) {
    return res.status(404).json({
      success: false,
      message: "Course not found"
    });
  }
  
  // Associate each FAQ with the courseId
  const faqsToInsert = faqs.map(faq => ({ 
    ...faq, 
    course: courseId,
    question: faq.question?.trim(),
    answer: faq.answer?.trim(),
    category: faq.category || "General"
  }));

  // Bulk insert FAQs
  const newFaqs = await Faq.insertMany(faqsToInsert);

  // Extract IDs from inserted FAQs for batch course update
  const faqIds = newFaqs.map(faq => faq._id);

  // Add all new FAQ IDs to the course's 'faqs' array
  await Course.findByIdAndUpdate(courseId, { $push: { faqs: { $each: faqIds } } });

  console.log(`✅ ${newFaqs.length} FAQs created successfully`);
  
  return res.status(201).json({
    success: true,
    data: newFaqs,
    message: `${newFaqs.length} FAQs created successfully`
  });
}

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
    res.status(200).json({ 
      success: true,
      data: faqs 
    });
    
  } catch (error) {
    console.error(`❌ Error fetching FAQs for course ${req.params.courseId}:`, error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch FAQs",
      error: error.message,
      courseId: req.params.courseId
    });
  }
};


// Update a single FAQ
exports.updateFaq = async (req, res) => {
  try {
    const { faqId } = req.params;
    const { question, answer, category } = req.body;
    
    console.log(`📝 Updating FAQ: ${faqId}`);
    
    // Validate faqId format
    if (!faqId || !faqId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid FAQ ID format"
      });
    }
    
    // Validate required fields
    if (!question || !answer) {
      return res.status(400).json({
        success: false,
        message: "Question and answer are required"
      });
    }
    
    // Update FAQ
    const updatedFaq = await Faq.findByIdAndUpdate(
      faqId,
      {
        question: question.trim(),
        answer: answer.trim(),
        category: category || "General",
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    );
    
    if (!updatedFaq) {
      return res.status(404).json({
        success: false,
        message: "FAQ not found"
      });
    }
    
    console.log(`✅ FAQ updated successfully: ${faqId}`);
    
    res.status(200).json({
      success: true,
      data: updatedFaq,
      message: "FAQ updated successfully"
    });
    
  } catch (error) {
    console.error(`❌ Error updating FAQ ${req.params.faqId}:`, error);
    res.status(500).json({
      success: false,
      message: "Failed to update FAQ",
      error: error.message
    });
  }
};

// Delete a single FAQ
exports.deleteFaq = async (req, res) => {
  try {
    const { faqId } = req.params;
    
    console.log(`🗑️ Deleting FAQ: ${faqId}`);
    
    // Validate faqId format
    if (!faqId || !faqId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid FAQ ID format"
      });
    }
    
    // Find FAQ to get course ID before deletion
    const faq = await Faq.findById(faqId);
    if (!faq) {
      return res.status(404).json({
        success: false,
        message: "FAQ not found"
      });
    }
    
    // Delete FAQ
    await Faq.findByIdAndDelete(faqId);
    
    // Remove FAQ ID from course's faqs array
    await Course.findByIdAndUpdate(faq.course, {
      $pull: { faqs: faqId }
    });
    
    console.log(`✅ FAQ deleted successfully: ${faqId}`);
    
    res.status(200).json({
      success: true,
      message: "FAQ deleted successfully"
    });
    
  } catch (error) {
    console.error(`❌ Error deleting FAQ ${req.params.faqId}:`, error);
    res.status(500).json({
      success: false,
      message: "Failed to delete FAQ",
      error: error.message
    });
  }
};


