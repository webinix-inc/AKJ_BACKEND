// controllers/enquiryController.js
const Enquiry = require("../models/enquireNow");

// Add new enquiry
exports.addEnquiry = async (req, res) => {
  try {
    const { fullName, email, courseName, description } = req.body;

    if (!fullName || !email || !courseName || !description) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const newEnquiry = new Enquiry({ fullName, email, courseName, description });
    console.log("Enquiry save:", newEnquiry);
    await newEnquiry.save();

    res.status(201).json({ message: "Enquiry submitted successfully!" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};

// Show all enquiries
exports.getEnquiries = async (req, res) => {
  try {
    const enquiries = await Enquiry.find();
    res.status(200).json(enquiries);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
};
