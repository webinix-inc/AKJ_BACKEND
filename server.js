require("dotenv").config();

if (process.env.NODE_ENV !== "production") {
  console.log("🚀 ================================");
  console.log("🚀 AKJ BACKEND SERVER STARTING");
  console.log("🚀 ================================");
  console.log(`📅 Timestamp: ${new Date().toISOString()}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`📂 Working Directory: ${process.cwd()}`);
  console.log(`⚡ Node Version: ${process.version}`);
}

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mongoose = require("mongoose");
const compression = require("compression");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
// const serverless = require("serverless-http");
const path = require("path");
const http = require("http");
const socketIO = require("socket.io");
// const orderRoutes = require("./routes/bookOrder.route");

const allowedOrigins = [
  //  LOCAL DEVELOPMENT - All common ports and protocols
  "http://localhost", // User Frontend (Development)
  "http://localhost:3000", // User Frontend (Development)
  "http://localhost:3001", // Admin Frontend (Development)

  // 🚀 PRODUCTION DOMAINS
  "http://13.233.196.145",
  "http://65.0.103.50",
  "http://13.233.215.250",
  "http://43.205.125.7",
  "http://52.66.125.129",
  "https://13.233.196.145",
  "https://65.0.103.50",
  "https://13.233.215.250",
  "https://43.205.125.7",
  "https://52.66.125.129",
  "https://akj-backend.onrender.com",

  // added by Himanshu
  "http://172.31.44.181", // New Users Frontend
  "http://172.31.35.192", // New Admin Frontend
  "http://172.31.11.118", // Backend itself
  "https://172.31.44.181", // New Users Frontend HTTPS
  "https://172.31.35.192", // New Admin Frontend HTTPS
  "http://3.111.34.85",
  "http://13.201.132.140",
  "https://3.111.34.85",
  "https://13.201.132.140",

  // 🚀 FIX: Add production frontend URLs
  "http://3.110.88.52", // User Frontend (Production)
  "http://13.203.104.199", // Admin Frontend (Production)
  "https://akj-user-web.vercel.app", // User Frontend (Production HTTPS)
  "https://akj-admin-web.vercel.app", // Admin Frontend (Production HTTPS)
];

const app = express();
const server = http.createServer(app); // Create HTTP server

// 🚀 OPTIMIZED SOCKET.IO: Configuration for 2000+ concurrent users
const io = socketIO(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        return callback(new Error("CORS policy violation"), false);
      }
      return callback(null, true);
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
  // 🚀 PERFORMANCE OPTIMIZATIONS
  pingTimeout: 60000, // 60 seconds (increased from default 20s)
  pingInterval: 25000, // 25 seconds (default)
  upgradeTimeout: 30000, // 30 seconds for upgrade timeout
  maxHttpBufferSize: 1e6, // 1MB limit for message size
  allowEIO3: true, // Allow Engine.IO v3 clients
  // 🚀 CONNECTION MANAGEMENT
  maxConnections: 5000, // Maximum concurrent connections
  // 🚀 COMPRESSION & MEMORY
  compression: true, // Enable compression for messages
  cleanupEmptyChildNamespaces: true, // Memory optimization
  // 🚀 TRANSPORT OPTIMIZATION
  transports: ["websocket", "polling"], // Prefer websocket
  allowUpgrades: true,
  perMessageDeflate: {
    threshold: 1024, // Only compress messages > 1KB
    concurrencyLimit: 10, // Limit concurrent compressions
    memLevel: 7, // Memory usage level
  },
});
const {
  startCourseExpiryCron,
  stopCourseExpiryCron,
} = require("./utils/courseExpiryCron");
const { scheduleCourseAccessCheck } = require("./jobs/courseAccessJob");
const { logger, apiLogger } = require("./utils/logger");
const { performanceMonitor } = require("./middlewares/performanceMonitor");

// 🚀 SECURITY: Add security headers for production with image embedding support
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable if causes issues with frontend
    crossOriginEmbedderPolicy: false, // Allow embedding cross-origin resources
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin resource sharing
  })
);

// 🏥 HEALTH CHECK ENDPOINT for Docker and monitoring
app.get("/health", (req, res) => {
  const healthCheck = {
    uptime: process.uptime(),
    message: "OK",
    timestamp: new Date().toISOString(),
    status: "healthy",
    version: process.env.npm_package_version || "1.0.0",
    environment: process.env.NODE_ENV || "development",
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + " MB",
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + " MB",
    },
  };

  try {
    res.status(200).json(healthCheck);
  } catch (error) {
    healthCheck.message = error.message;
    healthCheck.status = "error";
    res.status(503).json(healthCheck);
  }
});

// 🚀 RATE LIMITING: Protect against abuse and DoS attacks
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "production" ? 1000 : 10000, // Higher limit for development
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks and in development mode
    const isDevelopment = process.env.NODE_ENV !== "production";
    const isHealthCheck = req.path === "/health" || req.path === "/";
    const isLocalhost =
      req.ip === "127.0.0.1" ||
      req.ip === "::1" ||
      req.ip === "::ffff:127.0.0.1";

    return isHealthCheck || (isDevelopment && isLocalhost);
  },
});
app.use("/api/", limiter);

// 🚀 OPTIMIZED COMPRESSION: Better balance between compression and CPU
app.use(
  compression({
    level: 6, // Balance between compression ratio and CPU usage
    threshold: 1000, // Only compress files larger than 1KB
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) return false;
      return compression.filter(req, res);
    },
  })
);

// Add API logging middleware
app.use(apiLogger);

// 🚀 PERFORMANCE MONITORING: Track all HTTP requests
app.use(performanceMonitor.trackRequest());

// 🚀 ENHANCED: Increased body parser limits for large video uploads (up to 1GB)
app.use(bodyParser.json({ limit: "1gb" })); // Increased for large video uploads
app.use(bodyParser.urlencoded({ limit: "1gb", extended: true })); // Increased for large video uploads

// 🚀 PERFORMANCE: Keep-alive connections for better HTTP performance
app.use((req, res, next) => {
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Keep-Alive", "timeout=5, max=1000");
  next();
});

// app.use(express.raw({ type: '/', limit: '10mb' }));

app.use(
  cors({
    origin: [
      "https://akj-user-web.vercel.app",
      "https://akj-admin-web.vercel.app",
      "https://akj-backend.onrender.com",
      "http://localhost:3000",
      "http://localhost:3001", // 🚀 FIX: Add production frontend URLs
      "http://13.203.104.199", // Admin Frontend (Production HTTP)],
      "http://3.110.88.52",
    ], // User Frontend (Production HTTP)],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Cache-Control",
      "Pragma",
    ],
    credentials: true,
    optionsSuccessStatus: 204,
  })
);

// Redundant CORS middleware removed - using simplified CORS configuration above

app.use((req, res, next) => {
  req.io = io;
  next();
});

// Make io globally available for welcome messages
global.io = io;

app.get("/", (req, res) => {
  if (process.env.NODE_ENV === "production") {
    res.send("Server is live in production mode");
  } else {
    res.send("Server is live in development mode");
  }
});

// 🚀 PERFORMANCE DASHBOARD: Real-time metrics endpoint
app.get("/api/v1/performance/metrics", (req, res) => {
  try {
    const metrics = performanceMonitor.getMetrics();
    res.json({
      success: true,
      data: metrics,
      message: "Performance metrics retrieved successfully",
    });
  } catch (error) {
    console.error("Error getting performance metrics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve performance metrics",
    });
  }
});

// 🚀 HEALTH CHECK: Simple health endpoint
app.get("/api/v1/health", (req, res) => {
  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
    database: {
      status:
        mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host || "unknown",
      name: mongoose.connection.name || "unknown",
    },
    connectedUsers: connectedUsers || 0,
  };

  res.json(health);
});

// 🚀 FIX: Routes will be loaded AFTER MongoDB connection is established
// This prevents "Cannot call users.findOne() before initial connection is complete" error

mongoose.Promise = global.Promise;
mongoose.set("strictQuery", true);
// 🚀 MONGOOSE OPTIMIZATIONS: Disable buffering for better error handling
mongoose.set("bufferCommands", false);

// MongoDB connection options optimized for 2000+ concurrent users with improved timeout handling
const mongooseOptions = {
  connectTimeoutMS: 60000, // 🔧 FIX: Increased to 60 seconds for better network tolerance
  socketTimeoutMS: 60000, // 🔧 FIX: Increased to 60 seconds to match connectTimeout
  serverSelectionTimeoutMS: 60000, // 🔧 FIX: Increased to 60 seconds for server selection
  maxPoolSize: 30, // 🚀 OPTIMIZED: Increased from 10 to 30 for 2000+ users
  minPoolSize: 5, // 🚀 OPTIMIZED: Increased from 1 to 5 for better performance
  maxIdleTimeMS: 30000, // 🚀 NEW: Close idle connections after 30s
  retryWrites: true,
  retryReads: true,
  heartbeatFrequencyMS: 10000, // 🔧 FIX: Check server health every 10 seconds
  // Note: bufferMaxEntries and bufferCommands are Mongoose-only options, not MongoDB driver options
};

// 🔧 FIX: Add connection event listeners for better monitoring
mongoose.connection.on("connected", () => {
  console.log("✅ MongoDB connected successfully");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("⚠️ MongoDB disconnected");
});

mongoose.connection.on("reconnected", () => {
  console.log("🔄 MongoDB reconnected");
});

// 🔧 FIX: Handle process termination gracefully
process.on("SIGINT", async () => {
  try {
    await mongoose.connection.close();
    console.log("🛑 MongoDB connection closed through app termination");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error closing MongoDB connection:", error);
    process.exit(1);
  }
});

// Connect to MongoDB with improved error handling and reconnection logic
console.log("🔌 Attempting MongoDB connection...");
console.log(
  `🔗 Database URL: ${
    process.env.DB_URL
      ? process.env.DB_URL.replace(/\/\/.*@/, "//***:***@")
      : "NOT SET"
  }`
);

mongoose
  .connect(process.env.DB_URL, mongooseOptions)
  .then(async (data) => {
    console.log("✅ ================================");
    console.log("✅ MONGODB CONNECTION SUCCESSFUL");
    console.log("✅ ================================");
    console.log(`🏠 Host: ${data.connection.host}`);
    console.log(`🗄️ Database: ${data.connection.name}`);
    console.log(`🔌 Ready State: ${data.connection.readyState}`);
    console.log(`⚡ Connection ID: ${data.connection.id}`);

    // Add request/response logging middleware before routes
    if (
      process.env.ENABLE_HTTP_DEBUG === "true" ||
      process.env.NODE_ENV !== "production"
    ) {
      console.log("🔧 Adding request/response logging middleware...");
      app.use((req, res, next) => {
        const timestamp = new Date().toISOString();
        console.log(
          `📥 [${timestamp}] ${req.method} ${req.url} - IP: ${
            req.ip || req.connection.remoteAddress
          }`
        );

        // Override res.json to log responses
        const originalJson = res.json;
        res.json = function (data) {
          const responseTime = new Date().toISOString();
          console.log(
            `📤 [${responseTime}] ${req.method} ${req.url} - Status: ${res.statusCode}`
          );
          return originalJson.call(this, data);
        };

        next();
      });
    }

    // 🚀 FIX: Load routes AFTER MongoDB connection is established
    console.log("📚 ================================");
    console.log("📚 LOADING API ROUTES");
    console.log("📚 ================================");
    console.log("👤 Loading user routes...");
    try {
      require("./routes/user.route")(app);
      console.log("✅ User routes loaded successfully");
    } catch (error) {
      console.error("❌ Error loading user routes:", error.message);
      console.error(error.stack);
    }
    console.log("🔧 Loading admin routes...");
    require("./routes/admin.route")(app);
    console.log("👨‍🏫 Loading teacher routes...");
    require("./routes/teacher.route")(app);
    console.log("📡 Loading broadcast routes...");
    require("./routes/broadcast.route")(app);
    console.log("👥 Loading group routes...");
    require("./routes/group.route")(app);
    console.log("💬 Loading chat routes...");
    require("./routes/chat.route")(app);
    console.log("📚 Loading batch routes...");
    require("./routes/batch.route")(app);
    console.log("⭐ Loading testimonial routes...");
    require("./routes/testimonialRoutes.route")(app);
    console.log("📖 Loading book routes...");
    require("./routes/bookRoutes.route")(app);
    console.log("💳 Loading razorpay routes...");
    require("./routes/razorpay.route")(app);
    console.log("❓ Loading FAQ routes...");
    require("./routes/faq.route")(app);
    console.log("🎫 Loading coupon routes...");
    require("./routes/coupon.route")(app);

    console.log("📞 Loading enquiry routes...");
    require("./routes/enquiry.route")(app);
    console.log("🏆 Loading achiever routes...");
    require("./routes/achiever.route")(app);
    console.log("🛒 Loading order routes...");
    require("./routes/order.route")(app);
    console.log("🔔 Loading notification routes...");
    require("./routes/notification.route")(app);
    console.log("🎥 Loading live class routes...");
    require("./routes/liveClassRoutes.route")(app);
    // require("./routes/bookOrder.route")(app);
    require("./routes/course.route")(app);
    require("./routes/questionRoutes")(app);
    require("./routes/quizRoutes")(app);
    require("./routes/sampleDocumentRoutes")(app);
    require("./routes/scorecardRoutes")(app);
    require("./routes/quizFolder.routes")(app);
    require("./routes/importantLink.route")(app);

    // 🔧 TEMPORARY FIX: Add important links route directly for debugging
    const ImportantLink = require("./models/importantLinksModel");
    app.get("/api/v1/admin/importantLinks", async (req, res) => {
      try {
        console.log("🔍 Direct route: Fetching important links...");
        const links = await ImportantLink.find().maxTimeMS(5000);
        console.log(`✅ Direct route: Found ${links.length} links`);
        res.status(200).json({
          status: 200,
          message: "Links fetched successfully",
          links: links,
        });
      } catch (error) {
        console.error("❌ Direct route error:", error);
        res.status(500).json({
          status: 500,
          message: "Failed to fetch links",
          error: error.message,
        });
      }
    });

    require("./routes/locationRoutes")(app);
    require("./routes/bookpayment.route")(app);
    require("./routes/bookorder.routes")(app);
    // course Download mechanism by Himanshu
    require("./routes/stream.route")(app);
    // 🗂️ NEW: Master Folder System routes
    require("./routes/masterFolder.route")(app);
    // Enhanced Authentication Routes with MSG91 SMS
    require("./routes/authEnhanced.route")(app);
    // Test routes for development and debugging
    require("./routes/testRoutes.route")(app);
    console.log("✅ All API routes loaded successfully");

    // 🗂️ Initialize Master Folder System AFTER MongoDB connection
    // Wait a bit more to ensure connection is fully ready
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify connection is ready
    if (mongoose.connection.readyState === 1) {
      try {
        const {
          initializeMasterFolderSystem,
        } = require("./services/masterFolderService");
        await initializeMasterFolderSystem();
        console.log("🗂️ Master Folder System initialized successfully");
      } catch (error) {
        console.error("❌ Failed to initialize Master Folder System:", error);
      }
    } else {
      console.error(
        "❌ MongoDB connection not ready for Master Folder initialization"
      );
    }
  })
  .catch((error) => {
    console.error("❌ MongoDB connection error:", error);
    console.error("🔍 Error details:", {
      name: error.name,
      message: error.message,
      code: error.code,
      codeName: error.codeName,
    });

    // 🔧 FIX: Attempt to reconnect after a delay
    console.log("🔄 Attempting to reconnect to MongoDB in 10 seconds...");
    setTimeout(() => {
      console.log("🔄 Retrying MongoDB connection...");
      mongoose
        .connect(process.env.DB_URL, mongooseOptions)
        .then(() => {
          console.log("✅ MongoDB reconnection successful!");
        })
        .catch((retryError) => {
          console.error("❌ MongoDB reconnection failed:", retryError.message);
          console.log("⚠️ Server will continue without database connection");
        });
    }, 10000);
  });

const PORT = process.env.PORT || 8890; // 🚀 FIX: Match frontend configuration

// 🚀 SOCKET.IO CONNECTION MONITORING for 2000+ users
let connectedUsers = 0;
let maxConcurrentUsers = 0;

io.on("connection", (socket) => {
  connectedUsers++;
  maxConcurrentUsers = Math.max(maxConcurrentUsers, connectedUsers);

  // 🚀 UPDATE PERFORMANCE MONITOR
  performanceMonitor.updateSocketMetrics(connectedUsers);

  console.log(
    `👤 User connected. Current: ${connectedUsers}, Peak: ${maxConcurrentUsers}`
  );

  // Monitor memory usage when user count is high
  if (connectedUsers > 1000) {
    const memUsage = process.memoryUsage();
    console.log(
      `⚠️ HIGH LOAD: ${connectedUsers} users, Memory: ${(
        memUsage.heapUsed /
        1024 /
        1024
      ).toFixed(2)}MB`
    );
  }

  socket.on("disconnect", () => {
    connectedUsers--;
    // 🚀 UPDATE PERFORMANCE MONITOR
    performanceMonitor.updateSocketMetrics(connectedUsers);
    console.log(`👤 User disconnected. Current: ${connectedUsers}`);
  });

  // Add error handling
  socket.on("error", (error) => {
    console.error("Socket error:", error);
  });
});

// 🚀 MEMORY CLEANUP: Monitor and cleanup disconnected sockets every 30 seconds
setInterval(() => {
  const activeSockets = io.sockets.sockets.size;
  const memUsage = process.memoryUsage();

  // console.log(
  //   `📊 Socket Stats: Active: ${activeSockets}, Connected: ${connectedUsers}, Memory: ${(
  //     memUsage.heapUsed /
  //     1024 /
  //     1024
  //   ).toFixed(2)}MB`
  // );

  // Alert if memory usage is high
  if (memUsage.heapUsed > 500 * 1024 * 1024) {
    // 500MB
    // console.warn(
    //   `🚨 HIGH MEMORY USAGE: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`
    // );
  }
}, 30000);

const socketHandler = require("./sockets/chat");
const notificationHandler = require("./sockets/notification");
socketHandler(io);
notificationHandler(io);

server.listen(PORT, () => {
  console.log("🚀 ================================");
  console.log("🚀 SERVER STARTED SUCCESSFULLY");
  console.log("🚀 ================================");
  console.log(`🌐 Server URL: http://localhost:${PORT}`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🕐 Started at: ${new Date().toISOString()}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(
    `💾 Memory Usage: ${Math.round(
      process.memoryUsage().heapUsed / 1024 / 1024
    )}MB`
  );
  console.log("🚀 ================================");
  console.log("✅ READY TO ACCEPT CONNECTIONS");
  console.log("🚀 ================================");
});

// Add global error handlers
process.on("uncaughtException", (error) => {
  console.error("💥 ================================");
  console.error("💥 UNCAUGHT EXCEPTION");
  console.error("💥 ================================");
  console.error(`❌ Error: ${error.message}`);
  console.error(`📍 Stack: ${error.stack}`);
  console.error("💥 ================================");
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 ================================");
  console.error("💥 UNHANDLED PROMISE REJECTION");
  console.error("💥 ================================");
  console.error(`❌ Reason: ${reason}`);
  console.error(`📍 Promise: ${promise}`);
  console.error("💥 ================================");
});

// Request/response logging middleware will be added before routes

console.log("🔄 Starting background services...");
startCourseExpiryCron();
console.log("✅ Course expiry cron started");
// stopCourseExpiryCron();

// 🔥 NEW: Start course access control jobs
scheduleCourseAccessCheck();
console.log("✅ Course access control system initialized");
console.log("🔄 All background services started successfully");

// 🗂️ Master Folder System initialization moved to MongoDB connection handler

// Graceful shutdown handling
process.on("SIGTERM", () => {
  console.log("🛑 Received SIGTERM signal, shutting down gracefully...");
  const { cancelScheduledJobs } = require("./jobs/courseAccessJob");
  cancelScheduledJobs();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Received SIGINT signal, shutting down gracefully...");
  const { cancelScheduledJobs } = require("./jobs/courseAccessJob");
  cancelScheduledJobs();
  process.exit(0);
});

module.exports = app;
