// InstallmentController.js
const Installment = require("../models/installmentModel");
const Order = require("../models/orderModel"); // To track each installment payment
const Razorpay = require("razorpay");
const Course = require("../models/courseModel");
const Subscription = require("../models/subscriptionModel");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

exports.setCustomInstallments = async (req, res) => {
  try {
    // console.log(
    //   "Himanshu -> Demanding total info regarding payments setCustomInstallments : ",
    //   req.body
    // );
    const { courseId, planType, numberOfInstallments, price, discount } =
      req.body;

    // Fetch the course and subscription details
    const course = await Course.findById(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    // console.log(
    //   "Himanshu -> setCustomInstallments -> course: ",
    //   course
    // );

    const subscription = await Subscription.findOne({ course: courseId });
    if (!subscription)
      return res.status(404).json({ message: "Subscription not found" });

    console.log(
      "Himanshu -> setCustomInstallments -> subscription: ",
      subscription
    );

    const gstPercentage = subscription.gst || 0; // Default to 0 if not set

    console.log(
      "Himanshu -> setCustomInstallments -> gstPercentage : ",
      gstPercentage
    );

    const internetHandlingPercentage = subscription.internetHandling || 0;

    console.log(
      "Himanshu -> setCustomInstallments -> internetHandingPercentage : ",
      internetHandlingPercentage
    );
    console.log(
      "Himanshu -> setCustomInstallments -> discountPercentage : ",
      discount
    );
    const discountValue = (price * discount) / 100;

    console.log(
      "Himanshu -> setCustomInstallments -> discountValue : ",
      discountValue
    );

    // Calculate total amount after discount
    let totalAmount = price - discountValue;

    console.log(
      "Himanshu -> setCustomInstallments -> totalAmount: ",
      totalAmount
    );
    // Calculate GST amount and internetHandling charges add to total
    const gstAmount = (totalAmount * gstPercentage) / 100;
    console.log("Himanshu -> setCustomInstallments -> gstAmount: ", gstAmount);
    const internetHandlingCharge =
      (totalAmount * internetHandlingPercentage) / 100;
    console.log(
      "Himanshu -> setCustomInstallments -> internetHandlingCharge : ",
      internetHandlingCharge
    );

    totalAmount += gstAmount + internetHandlingCharge;
    console.log(
      "Himanshu -> setCustomInstallments -> NEW totalAmount: ",
      totalAmount
    );

    // Validate number of installments
    if (numberOfInstallments < 1) {
      return res
        .status(400)
        .json({ message: "Invalid number of installments" });
    }

    // Calculate per-installment amount (including GST)
    const installmentAmount = totalAmount / numberOfInstallments;

    // Set the plan duration based on the plan type
    let planDuration;
    switch (planType) {
      case "3 months":
        planDuration = 3;
        break;
      case "6 months":
        planDuration = 6;
        break;
      case "12 months":
        planDuration = 12;
        break;
      default:
        planDuration = parseInt(planType.trim().split(" ")[0]);
    }

    // Ensure the number of installments doesn't exceed the plan duration
    if (numberOfInstallments > planDuration) {
      return res.status(400).json({
        message: `Number of installments cannot exceed the selected plan duration (${planDuration} months)`,
      });
    }

    // Generate installment schedule
    const installments = [];
    for (let i = 0; i < numberOfInstallments; i++) {
      let dueDateLabel =
        i === 0 ? "DOP" : `DOP + ${i} month${i > 1 ? "s" : ""}`;
      installments.push({
        amount: installmentAmount.toFixed(2), // Keeping two decimal places
        dueDate: dueDateLabel,
        isPaid: false,
      });
    }

    // Check if an installment plan already exists for the course and plan type
    const existingPlan = await Installment.findOne({ courseId, planType });

    if (existingPlan) {
      // Update existing installment plan
      existingPlan.numberOfInstallments = numberOfInstallments;
      existingPlan.installments = installments;
      existingPlan.totalAmount = totalAmount.toFixed(2);
      existingPlan.remainingAmount = totalAmount.toFixed(2);

      await existingPlan.save();
      return res.status(200).json({
        message: "Installment plan updated successfully",
        data: existingPlan,
      });
    } else {
      // Create new installment plan
      const newInstallmentPlan = new Installment({
        courseId,
        planType,
        numberOfInstallments,
        installments,
        totalAmount: totalAmount.toFixed(2),
        remainingAmount: totalAmount.toFixed(2),
      });

      await newInstallmentPlan.save();
      return res.status(201).json({
        message: "Installment plan set successfully",
        data: newInstallmentPlan,
      });
    }
  } catch (error) {
    res.status(500).json({ message: "Error setting installment plan", error });
  }
};

exports.getInstallments = async (req, res) => {
  try {
    console.log(
      "Himanshu -> Demanding total info regarding payments using getInstallments : ",
      req.body
    );

    const { courseId } = req.params;

    // Fetch the course details
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Fetch all installment plans for the given course
    const installments = await Installment.find({ courseId });
    if (!installments || installments.length === 0) {
      return res
        .status(404)
        .json({ message: "No installment plans found for this course" });
    }

    console.log(installments);

    res.status(200).json({
      message: "Installment plans retrieved successfully",
      data: installments,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error retrieving installment plans", error });
  }
};

exports.makeInstallmentPayment = async (req, res) => {
  try {
    const { installmentId } = req.params; // ID of the installment plan
    const { userId, installmentIndex } = req.body; // Installment index provided by frontend

    // Find the installment plan by ID (without userId since it's admin-defined)
    const installmentPlan = await Installment.findById(installmentId);

    if (!installmentPlan) {
      return res.status(404).json({ message: "Installment plan not found" });
    }

    // Check if installmentIndex is within the range of the installments array
    if (
      installmentIndex < 0 ||
      installmentIndex >= installmentPlan.installments.length
    ) {
      return res.status(400).json({ message: "Invalid installment index" });
    }

    // Access the specific installment by index
    const installment = installmentPlan.installments[installmentIndex];

    if (installment.isPaid) {
      return res
        .status(400)
        .json({ message: "This installment is already paid" });
    }

    // Create Razorpay payment options for this specific installment
    const paymentOptions = {
      amount: installment.amount * 100, // Amount in paise
      currency: "INR",
      receipt: `receipt_${Math.floor(Math.random() * 1e6)}`,
    };
    const razorpayOrder = await razorpay.orders.create(paymentOptions);

    // Link the user to the installment plan if this is the first payment (only set userId if null)
    if (!installmentPlan.userId) {
      installmentPlan.userId = userId;
      await installmentPlan.save();
    }

    // Create a new Order record with details for tracking purposes
    const newOrder = new Order({
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      userId,
      courseId: installmentPlan.courseId,
      installmentPlanId: installmentId, // Track the overall installment plan
      installmentIndex, // Track the specific installment index
      status: "created",
      trackingNumber: `TN-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      paymentMode: "installment",
    });
    await newOrder.save();

    res.status(201).json({
      success: true,
      order: razorpayOrder,
      message: "Installment payment order created successfully",
    });
  } catch (error) {
    console.error("Error creating installment payment order:", error);
    res
      .status(500)
      .json({ message: "Error creating installment payment order", error });
  }
};

exports.confirmInstallmentPayment = async (req, res) => {
  try {
    const { event, payload } = req.body;
    const paymentEntity = payload?.payment?.entity;

    // Ensure the event type is payment.captured, which indicates a successful payment
    if (event !== "payment.captured") {
      return res
        .status(400)
        .json({ message: "Event type is not payment.captured" });
    }

    const {
      order_id: orderId,
      amount: paidAmount,
      status: paymentStatus,
    } = paymentEntity;

    // Find the order by Razorpay order ID
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Verify payment status to ensure it is 'captured'
    if (paymentStatus !== "captured") {
      return res
        .status(400)
        .json({ message: "Payment status is not captured" });
    }

    // Update order status to "paid"
    order.status = "paid";
    await order.save();

    // Find the installment plan for the course (either linked or unlinked to a user)
    let installmentPlan = await Installment.findOne({
      _id: order.installmentPlanId,
    });

    if (!installmentPlan) {
      return res.status(404).json({ message: "Installment plan not found" });
    }

    // Link the installment plan to the user if it's the first payment
    if (!installmentPlan.userId) {
      installmentPlan.userId = order.userId;
    }

    // Use the installment index to locate the specific installment within the plan
    const installment = installmentPlan.installments[order.installmentIndex];
    if (!installment) {
      return res.status(404).json({ message: "Installment not found" });
    }
    if (installment.isPaid) {
      return res
        .status(400)
        .json({ message: "This installment is already paid" });
    }

    // Mark the installment as paid and record the payment date
    installment.isPaid = true;
    installment.paidOn = new Date(); // Record the payment date
    installmentPlan.remainingAmount -= installment.amount;

    // Check if all installments are paid to mark the plan as completed
    const allPaid = installmentPlan.installments.every((inst) => inst.isPaid);
    if (allPaid) {
      installmentPlan.status = "completed";
    }

    // Save the updated installment plan with the user link (if applicable) and payment updates
    await installmentPlan.save();

    res
      .status(200)
      .json({ message: "Installment payment confirmed and plan updated" });
  } catch (error) {
    console.error("Error confirming installment payment:", error);
    res
      .status(500)
      .json({ message: "Error confirming installment payment", error });
  }
};

exports.getOutstandingBalance = async (req, res) => {
  try {
    const { courseId, userId } = req.params;

    const installmentPlan = await Installment.findOne({ courseId, userId });

    if (!installmentPlan) {
      return res
        .status(404)
        .json({ message: "Installment plan not found for this user" });
    }

    res.status(200).json({
      message: "Outstanding balance retrieved successfully",
      remainingAmount: installmentPlan.remainingAmount,
      installments: installmentPlan.installments,
    });
  } catch (error) {
    console.error("Error retrieving outstanding balance:", error);
    res
      .status(500)
      .json({ message: "Error retrieving outstanding balance", error });
  }
};

exports.getUserInstallmentTimeline = async (req, res) => {
  try {
    const { courseId, userId } = req.params;

    // Find the installment plan for the given course and user
    const installmentPlan = await Installment.findOne({
      courseId,
      "userPayments.userId": userId,
    });

    if (!installmentPlan) {
      return res.status(404).json({
        message: "No installment plan found for this course and user",
      });
    }

    let lastDueDate = null; // Track previous due date

    // Build a timeline for the installments
    const timeline = installmentPlan.installments.map((installment, index) => {
      const userPayment = installmentPlan.userPayments.find(
        (payment) =>
          payment.userId.toString() === userId &&
          payment.installmentIndex === index
      );

      const paidOn =
        installment.paidOn || (userPayment && userPayment.paymentDate) || null;

      let dueDate;
      if (index === 0) {
        // First installment: Due date is either paidOn or today
        dueDate = paidOn ? new Date(paidOn) : new Date();
      } else {
        // If the previous installment was paid, set next due date 1 month after paidOn
        if (paidOn) {
          dueDate = new Date(paidOn);
          dueDate.setMonth(dueDate.getMonth() + 1);
        } else if (lastDueDate) {
          // If unpaid, set due date 1 month after the last calculated due date
          dueDate = new Date(lastDueDate);
          dueDate.setMonth(dueDate.getMonth() + 1);
        } else {
          // Fallback (shouldn't happen if data is valid)
          dueDate = new Date();
        }
      }

      lastDueDate = new Date(dueDate); // Update for next iteration

      return {
        planType: installmentPlan.planType,
        installmentIndex: index,
        dueDate, // Fully dynamic due date
        amount: installment.amount,
        isPaid:
          installment.isPaid || (userPayment && userPayment.isPaid) || false,
        paidOn,
      };
    });

    // Response structure
    res.status(200).json({
      message: "Installment timeline retrieved successfully",
      timeline,
    });
  } catch (error) {
    console.error("Error retrieving installment timeline:", error);
    res.status(500).json({
      message: "Error retrieving installment timeline",
      error,
    });
  }
};
