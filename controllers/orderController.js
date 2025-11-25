const Order = require("../models/orderModel"); // Adjust path to your Order model
const mongoose = require("mongoose");

// Controller to fetch all orders with status "paid"
exports.getAllPaidOrders = async (req, res) => {
  try {
    // Query to fetch all orders with status "paid"
    const paidOrders = await Order.find({ status: "paid" })
      .populate("userId", "firstName lastName image") // Populate user details
      .populate("courseId", "title"); // Populate course details

    if (!paidOrders.length) {
      return res.status(404).json({
        status: 404,
        message: "No paid orders found",
        data: [],
      });
    }

    // Auto-fix: If status is "paid" but installmentDetails.isPaid is false, update it to true
    let fixedCount = 0;
    const updatePromises = paidOrders.map(async (order) => {
      // Check if it's an installment payment and needs fixing
      if (order.paymentMode === "installment" && 
          order.installmentDetails && 
          order.status === "paid" && 
          order.installmentDetails.isPaid === false) {
        
        console.log(`🔧 Auto-fixing order ${order.orderId}: Setting installmentDetails.isPaid to true`);
        order.installmentDetails.isPaid = true;
        await order.save();
        fixedCount++;
        return order;
      }
      return order;
    });

    // Wait for all updates to complete
    await Promise.all(updatePromises);

    if (fixedCount > 0) {
      console.log(`✅ Auto-fixed ${fixedCount} order(s) with inconsistent installment payment status`);
    }

    return res.status(200).json({
      status: 200,
      message: "Paid orders retrieved successfully",
      data: paidOrders,
      fixedCount: fixedCount > 0 ? fixedCount : undefined, // Include fixed count if any were fixed
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: 500,
      message: "Server error",
      data: [],
    });
  }
};
// Controller to count enrolled students for a specific course
exports.countStudentsForCourse = async (req, res) => {
  const { courseId } = req.params; // Get courseId from request parameters

  try {
    // Aggregation pipeline
    const result = await Order.aggregate([
      {
        // Match only paid orders for the given course
        $match: {
          status: "paid",
          courseId: new mongoose.Types.ObjectId(courseId), // Use 'new' here
        },
      },
      {
        // Group by courseId and count unique students
        $group: {
          _id: null, // Grouping is not necessary for a single course, so we use null
          studentCount: { $addToSet: "$userId" }, // Ensure unique students
        },
      },
      {
        // Project only the student count
        $project: {
          _id: 0,
          count: { $size: "$studentCount" },
        },
      },
    ]);

    // If no results, return 0 count
    if (!result.length) {
      return res.status(200).json({ count: 0 });
    }

    // Return the count
    return res.status(200).json({ count: result[0].count });
  } catch (error) {
    console.error("Error counting students for course:", error);
    return res.status(500).json({
      status: 500,
      message: "Server error",
    });
  }
};
