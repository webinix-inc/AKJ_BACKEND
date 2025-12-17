require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/userModel");

// ============================================================================
// 🔐 CREATE ADMIN ACCOUNT - ONE TIME SCRIPT
// ============================================================================
// This script creates a new admin account in the database
// ============================================================================

// Admin credentials - MODIFY THESE VALUES
// const ADMIN_CREDENTIALS = {
//   firstName: "AKJ",
//   lastName: "Classes",
//   email: "akjacademy@admin.com", // Change this to your email
//   phone: "9823456332", // Change this to your phone (10 digits)
//   password: "AKJAcademy@22", // Change this to your desired password
// };
const ADMIN_CREDENTIALS = {
  firstName: "AKJ",
  lastName: "Classes",
  email: "admin@ex.com", // Change this to your email
  phone: "9823456332", // Change this to your phone (10 digits)
  password: "123456", // Change this to your desired password
};

// Connect to MongoDB
const connectDB = async () => {
  try {
    const mongooseOptions = {
      connectTimeoutMS: 60000,
      socketTimeoutMS: 60000,
      serverSelectionTimeoutMS: 60000,
      maxPoolSize: 10,
      minPoolSize: 1,
    };

    await mongoose.connect(process.env.DB_URL, mongooseOptions);
    console.log("✅ Connected to MongoDB");
    console.log(`🗄️ Database: ${mongoose.connection.name}`);
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
};

// Create admin account
const createAdmin = async () => {
  try {
    console.log("\n🔐 ================================");
    console.log("🔐 CREATING ADMIN ACCOUNT");
    console.log("🔐 ================================\n");

    // Validate phone number
    const phoneRegex = /^[0-9]{10}$/;
    if (!phoneRegex.test(ADMIN_CREDENTIALS.phone)) {
      console.error("❌ Invalid phone number. Must be 10 digits.");
      process.exit(1);
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(ADMIN_CREDENTIALS.email)) {
      console.error("❌ Invalid email format.");
      process.exit(1);
    }

    // Check if admin already exists
    const existingAdmin = await User.findOne({
      email: ADMIN_CREDENTIALS.email.toLowerCase(),
      userType: "ADMIN",
    });

    if (existingAdmin) {
      console.log("⚠️ Admin with this email already exists:");
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Phone: ${existingAdmin.phone}`);
      console.log(`   ID: ${existingAdmin._id}`);
      console.log("\n💡 If you want to reset the password, use the forgot password feature.");
      process.exit(0);
    }

    // Hash password
    const hashedPassword = bcrypt.hashSync(ADMIN_CREDENTIALS.password, 8);

    // Create admin user
    const adminData = {
      firstName: ADMIN_CREDENTIALS.firstName,
      lastName: ADMIN_CREDENTIALS.lastName,
      email: ADMIN_CREDENTIALS.email.toLowerCase().trim(),
      phone: ADMIN_CREDENTIALS.phone,
      password: hashedPassword,
      userType: "ADMIN",
      accountVerification: true,
      completeProfile: true,
      // Set all permissions to true
      coursesPermission: true,
      bookStorePermission: true,
      planPermission: true,
      reportAndAnalyticPermission: true,
      chatPermission: true,
      marketingServicesPermission: true,
      testPortalPermission: true,
      peoplePermission: true,
    };

    const newAdmin = await User.create(adminData);

    console.log("✅ Admin account created successfully!\n");
    console.log("📋 ================================");
    console.log("📋 ADMIN CREDENTIALS");
    console.log("📋 ================================");
    console.log(`👤 Name: ${newAdmin.firstName} ${newAdmin.lastName}`);
    console.log(`📧 Email: ${newAdmin.email}`);
    console.log(`📱 Phone: ${newAdmin.phone}`);
    console.log(`🔑 Password: ${ADMIN_CREDENTIALS.password}`);
    console.log(`🆔 User ID: ${newAdmin._id}`);
    console.log(`✅ Account Verified: ${newAdmin.accountVerification}`);
    console.log("📋 ================================\n");
    console.log("⚠️  IMPORTANT: Save these credentials securely!");
    console.log("⚠️  You can now login at: POST /api/v1/admin/login\n");

    return newAdmin;
  } catch (error) {
    console.error("❌ Error creating admin account:", error.message);
    if (error.code === 11000) {
      console.error("❌ Duplicate key error - Admin with this email or phone already exists");
    }
    throw error;
  }
};

// Main execution
const main = async () => {
  try {
    await connectDB();
    await createAdmin();
    console.log("✅ Script completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Script failed:", error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down...");
  await mongoose.connection.close();
  process.exit(0);
});

// Run the script
main();

