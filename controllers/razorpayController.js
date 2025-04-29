const Razorpay = require("razorpay");
const Order = require("../models/orderModel");
const User = require("../models/userModel");
const Course = require("../models/courseModel");
const Installment = require("../models/installmentModel");
const LiveClass = require("../models/LiveClass");
const { addUsersToClass } = require("../configs/merithub.config");

// Singleton instance of Razorpay to avoid redundant connections
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Helper: Generate a unique receipt ID
const generateReceipt = () => `receipt_${Math.floor(Math.random() * 1e6)}`;

// Utility to generate a unique tracking number
const generateUniqueTrackingNumber = () =>
  `TN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

// Function to create an order with user-specific installment details
exports.createOrder = async (req, res) => {
  try {
    const {
      amount,
      currency,
      userId,
      courseId,
      planType,
      paymentMode,
      installmentIndex,
      totalInstallments,
    } = req.body;

    if (!userId || !courseId || !paymentMode) {
      return res.status(400).json({
        success: false,
        message: "userId, courseId, and paymentMode are required",
      });
    }

    let installmentPlan;

    if (paymentMode === "installment") {
      // Find the course installment plan
      installmentPlan = await Installment.findOne({ courseId, planType });

      if (!installmentPlan) {
        return res
          .status(404)
          .json({ success: false, message: "Installment plan not found" });
      }

      // Check if the user already has a payment entry in the plan
      const existingUserPayment = installmentPlan.userPayments.find(
        (payment) =>
          payment.userId === userId &&
          payment.installmentIndex === installmentIndex
      );

      if (!existingUserPayment) {
        // If user has no entry for this installment, add one
        installmentPlan.userPayments.push({
          userId,
          installmentIndex,
          isPaid: false,
          paidAmount: amount,
          paymentDate: null,
        });
      } else {
        // If the installment already exists, return an error
        return res.status(400).json({
          success: false,
          message: "Installment already exists for this user",
        });
      }

      // Save the updated installment plan
      await installmentPlan.save();
    }

    // Calculate the total amount in the smallest currency unit
    const totalAmountInSmallestUnit = Math.round(amount * 100);

    const options = {
      amount: totalAmountInSmallestUnit, // Razorpay expects amount in paise or cents
      currency,
      receipt: generateReceipt(),
    };

    // Create the Razorpay order
    const razorpayOrder = await razorpay.orders.create(options);

    // Create a new order in the system
    const newOrderData = {
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      receipt: razorpayOrder.receipt,
      status: "created",
      trackingNumber: generateUniqueTrackingNumber(),
      userId,
      courseId,
      paymentMode,
      planType,
    };

    if (paymentMode === "installment") {
      newOrderData.installmentDetails = {
        installmentIndex,
        totalInstallments,
        installmentAmount: amount, // Keep the original amount for reference
        isPaid: false,
      };
      newOrderData.status = "partial";
    }

    const newOrder = new Order(newOrderData);
    await newOrder.save();

    return res.status(201).json({ success: true, order: newOrder });
  } catch (error) {
    console.error("Error creating order:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error creating order" });
  }
};

// Handle Razorpay webhook events
exports.handleWebhook = async (req, res) => {
  try {
    const {
      event,
      payload: {
        payment: { entity: paymentDetails },
      },
    } = req.body;

    console.log(`Received event: ${event}`);
    const handlers = {
      "payment.captured": handlePaymentCaptured,
      // Add more event handlers as needed
    };

    if (handlers[event]) {
      await handlers[event](paymentDetails);
    } else {
      console.log(`Unhandled event type: ${event}`);
    }

    return res
      .status(200)
      .json({ success: true, message: "Webhook processed successfully" });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// Handler for `payment.captured` event
const handlePaymentCaptured = async (paymentDetails) => {
  const { order_id, id: paymentId, amount } = paymentDetails;

  if (!amount || isNaN(amount) || amount <= 0) {
    console.error(
      `Invalid payment amount: ${amount} for payment ID: ${paymentId}`
    );
    throw new Error("Invalid payment amount");
  }

  const updatedOrder = await updateOrderStatus(paymentDetails);
  if (!updatedOrder) {
    throw new Error(`Order not found for order_id: ${order_id}`);
  }

  const { userId, courseId, paymentMode, installmentDetails, planType } =
    updatedOrder;

  if (paymentMode === "installment") {
    await handleInstallmentPayment(
      userId,
      courseId,
      installmentDetails,
      planType
    );
  }

  await addCourseToUser(
    userId,
    courseId,
    paymentMode,
    installmentDetails,
    paymentDetails
  );
};

// Update order status in the database
const updateOrderStatus = async (paymentDetails) => {
  const updatedOrder = await Order.findOneAndUpdate(
    { orderId: paymentDetails.order_id },
    {
      status: "paid",
      paymentId: paymentDetails.id,
      ...(paymentDetails.paymentMode === "installment" && {
        "installmentDetails.isPaid": true, // Mark installment as paid
      }),
    },
    { new: true }
  );

  if (!updatedOrder) {
    console.error(`Order not found for order_id: ${paymentDetails.order_id}`);
    return null;
  }

  console.log("Order updated with payment details:", updatedOrder);
  return updatedOrder;
};

// Handle installment payment
const handleInstallmentPayment = async (
  userId,
  courseId,
  installmentDetails,
  planType
) => {
  const installmentPlan = await Installment.findOne({ courseId, planType });

  if (!installmentPlan) {
    console.error(`Installment plan not found for courseId: ${courseId}`);
    throw new Error("Installment plan not found");
  }

  const userPayment = installmentPlan.userPayments.find(
    (payment) =>
      payment.userId.toString() === userId.toString() &&
      payment.installmentIndex === installmentDetails.installmentIndex
  );

  console.log("User Payment ", userPayment);
  if (!userPayment || userPayment.isPaid) {
    throw new Error(
      `Installment not found or already paid for userId: ${userId} at index: ${installmentDetails.installmentIndex}`
    );
  }

  userPayment.isPaid = true;
  userPayment.paymentDate = new Date();
  installmentPlan.remainingAmount -= userPayment.paidAmount;

  const totalInstallments = installmentPlan.installments.length;
  const paidInstallments = installmentPlan.userPayments.filter(
    (payment) =>
      payment.userId.toString() === userId.toString() && payment.isPaid
  ).length;

  if (paidInstallments === totalInstallments) {
    installmentPlan.status = "completed";
  }

  await installmentPlan.save();
  console.log("Installment plan updated:", installmentPlan);
};

// Add course to the user's purchased courses
// Add course to the user's purchased courses and enroll in associated live classes
const addCourseToUser = async (
  userId,
  courseId,
  paymentMode,
  installmentDetails,
  paymentDetails
) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    const courseAlreadyPurchased = user.purchasedCourses.some(
      (course) => course.course.toString() === courseId.toString()
    );

    // Validate payment amount
    const amountPaid = paymentDetails.amount / 100; // Convert from smallest unit (paise/cents)
    if (isNaN(amountPaid) || amountPaid <= 0) {
      throw new Error(
        `Invalid amountPaid value: ${amountPaid} for payment ID ${paymentDetails.id}`
      );
    }

    if (!courseAlreadyPurchased) {
      const purchasedCourseData = {
        course: courseId,
        purchaseDate: new Date(),
        amountPaid,
        paymentMode,
      };

      if (paymentMode === "installment") {
        purchasedCourseData.totalInstallments =
          installmentDetails.totalInstallments;
      }

      user.purchasedCourses.push(purchasedCourseData);
      await user.save();

      console.info(
        `Course with ID ${courseId} added to user ${userId}'s purchased courses.`
      );
    }

    // Fetch all live classes associated with the course
    const liveClasses = await LiveClass.find({ courseIds: courseId });

    if (!liveClasses || liveClasses.length === 0) {
      console.warn(`No live classes found for courseId: ${courseId}.`);
      return;
    }

    const addUsersPromises = liveClasses.map(async (liveClass) => {
      const { classId, commonParticipantLink, title, startTime, duration } =
        liveClass;

      if (!classId || !commonParticipantLink) {
        console.warn(
          `Skipping live class (${liveClass._id}): Missing classId or commonParticipantLink.`
        );
        return;
      }

      try {
        // Add the user to the live class
        const response = await addUsersToClass(
          classId,
          [user.merithubUserId],
          commonParticipantLink
        );
        console.info(
          `User ${userId} added to live class (${classId}) successfully.`
        );

        // Extract the user-specific link from the API response
        const userResponse = response.find(
          (res) => res.userId === user.merithubUserId
        );
        if (!userResponse || !userResponse.userLink) {
          console.warn(
            `No user-specific link found for user ${userId} in live class (${classId}).`
          );
          return;
        }

        const liveUserLink = `https://live.merithub.com/info/room/${process.env.MERIT_HUB_CLIENT_ID}/${userResponse.userLink}?iframe=true`;

        // Update user's liveClasses field
        const liveClassInfo = {
          title,
          startTime,
          duration,
          participantLink: liveUserLink,
        };

        await User.findByIdAndUpdate(
          userId,
          {
            $push: {
              liveClasses: {
                ...liveClassInfo,
                courseIds: courseId, // Push courseId into courseIds array
              },
            },
          },
          { new: true }
        );

        await User.findByIdAndUpdate(
          userId,
          { $push: { liveClasses: liveClassInfo } },
          { new: true }
        );

        return response;
      } catch (error) {
        console.error(
          `Error adding user ${userId} to live class (${classId}): ${error.message}`
        );
        throw new Error(`Failed to add user to live class (${classId}).`);
      }
    });

    // Await completion of all add user operations
    await Promise.all(addUsersPromises);
    console.info(
      `User ${userId} successfully enrolled in all live classes for course ${courseId}.`
    );
  } catch (error) {
    console.error(`Error in addCourseToUser: ${error.message}`);
    throw error; // Rethrow for higher-level error handling
  }
};
