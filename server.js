require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mongoose = require("mongoose");
const compression = require("compression");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { S3Client, ListBucketsCommand } = require("@aws-sdk/client-s3");
// const serverless = require("serverless-http");
const path = require("path");
const http = require("http");
const socketIO = require("socket.io");
const orderRoutes = require("./routes/bookOrder.route");

const allowedOrigins = [
  // 🔧 LOCAL DEVELOPMENT - All common ports and protocols
  "http://localhost:3000", // User Frontend (Development)
  "http://localhost:3001", // Admin Frontend (Development)
  "https://localhost:3000", // User Frontend (Development HTTPS)
  "https://localhost:3001", // Admin Frontend (Development HTTPS)
  "http://localhost:3002", // Alternative port
  "http://localhost:3003", // Alternative port
  "http://localhost:5173", // Vite dev server
  "http://localhost:5174", // Vite dev server alt
  "http://127.0.0.1:3000", // IPv4 localhost
  "http://127.0.0.1:3001", // IPv4 localhost
  
  
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
  "http://13.232.208.235", // User Frontend (Production)
  "http://13.127.56.109", // Admin Frontend (Production)
  "https://13.232.208.235", // User Frontend (Production HTTPS)
  "https://13.127.56.109", // Admin Frontend (Production HTTPS)
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
    credentials: true
  },
  // 🚀 PERFORMANCE OPTIMIZATIONS
  pingTimeout: 60000,           // 60 seconds (increased from default 20s)
  pingInterval: 25000,          // 25 seconds (default)
  upgradeTimeout: 30000,        // 30 seconds for upgrade timeout
  maxHttpBufferSize: 1e6,       // 1MB limit for message size
  allowEIO3: true,              // Allow Engine.IO v3 clients
  // 🚀 CONNECTION MANAGEMENT
  maxConnections: 5000,         // Maximum concurrent connections
  // 🚀 COMPRESSION & MEMORY
  compression: true,            // Enable compression for messages
  cleanupEmptyChildNamespaces: true, // Memory optimization
  // 🚀 TRANSPORT OPTIMIZATION
  transports: ['websocket', 'polling'], // Prefer websocket
  allowUpgrades: true,
  perMessageDeflate: {
    threshold: 1024,            // Only compress messages > 1KB
    concurrencyLimit: 10,       // Limit concurrent compressions
    memLevel: 7,                // Memory usage level
  }
});
const {
  startCourseExpiryCron,
  stopCourseExpiryCron,
} = require("./utils/courseExpiryCron");
const { scheduleCourseAccessCheck } = require("./jobs/courseAccessJob");
const { logger, apiLogger } = require("./utils/logger");
const { performanceMonitor } = require("./middlewares/performanceMonitor");

// 🚀 SECURITY: Add security headers for production with image embedding support
app.use(helmet({
  contentSecurityPolicy: false, // Disable if causes issues with frontend
  crossOriginEmbedderPolicy: false, // Allow embedding cross-origin resources
  crossOriginResourcePolicy: { policy: "cross-origin" } // Allow cross-origin resource sharing
}));

// 🏥 HEALTH CHECK ENDPOINT for Docker and monitoring
app.get('/health', (req, res) => {
  const healthCheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: new Date().toISOString(),
    status: 'healthy',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
    }
  };
  
  try {
    res.status(200).json(healthCheck);
  } catch (error) {
    healthCheck.message = error.message;
    healthCheck.status = 'error';
    res.status(503).json(healthCheck);
  }
});

// 🚀 RATE LIMITING: Protect against abuse and DoS attacks
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 1000 : 10000, // Higher limit for development
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks and in development mode
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const isHealthCheck = req.path === '/health' || req.path === '/';
    const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    
    return isHealthCheck || (isDevelopment && isLocalhost);
  }
});
app.use('/api/', limiter);

// 🚀 OPTIMIZED COMPRESSION: Better balance between compression and CPU
app.use(compression({ 
  level: 6,           // Balance between compression ratio and CPU usage
  threshold: 1000,    // Only compress files larger than 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// Add API logging middleware
app.use(apiLogger);

// 🚀 PERFORMANCE MONITORING: Track all HTTP requests
app.use(performanceMonitor.trackRequest());

// 🚀 OPTIMIZED: Reduced body parser limits for better memory usage
app.use(bodyParser.json({ limit: "10mb" })); // Reduced from 50mb
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true })); // Reduced from 50mb

// 🚀 PERFORMANCE: Keep-alive connections for better HTTP performance
app.use((req, res, next) => {
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=5, max=1000');
  next();
});

// app.use(express.raw({ type: '/', limit: '10mb' }));

app.use(
  cors({
    origin: function (origin, callback) {
      // 🔧 FIX: Allow requests without origin (like Postman, direct server requests)
      if (!origin) return callback(null, true);
      
      // 🔧 TEMPORARY DEBUG: Allow ALL origins for debugging
      console.log(`🔍 CORS request from origin: ${origin}`);
      return callback(null, true);
      
      // 🔧 FIX: For local development, allow localhost and 127.0.0.1 with any port
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        console.log(`✅ CORS allowed localhost origin: ${origin}`);
        return callback(null, true);
      }
      
      // Check against allowed origins list
      if (allowedOrigins.indexOf(origin) === -1) {
        console.log(`❌ CORS blocked origin: ${origin}`);
        const msg =
          "The CORS policy for this site does not allow access from the specified origin.";
        return callback(new Error(msg), false);
      }
      
      console.log(`✅ CORS allowed origin: ${origin}`);
      return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS", "PUT", "PATCH", "DELETE", "HEAD"],
    allowedHeaders: ["X-Requested-With", "content-type", "Range", "Content-Range", "Content-Length", "Authorization"],
    exposedHeaders: ["Content-Range", "Content-Length", "Accept-Ranges"]
  })
);

app.use(function (req, res, next) {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-Requested-With,content-type,Range,Content-Range,Content-Length,Authorization"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, PATCH, DELETE, HEAD"
  );
  res.setHeader("Access-Control-Expose-Headers", "Content-Range,Content-Length,Accept-Ranges");
  res.setHeader("Access-Control-Allow-Credentials", true);
  next();
});

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
      message: "Performance metrics retrieved successfully"
    });
  } catch (error) {
    console.error('Error getting performance metrics:', error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve performance metrics"
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
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
    },
    database: {
      status: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host || "unknown",
      name: mongoose.connection.name || "unknown"
    },
    connectedUsers: connectedUsers || 0
  };
  
  res.json(health);
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const checkS3Connection = async () => {
  try {
    const data = await s3Client.send(new ListBucketsCommand({}));
    console.log("Connected to S3, buckets:", data.Buckets);
  } catch (error) {
    console.error("Error connecting to S3:", error.message);
  }
};

checkS3Connection();

// 🚀 FIX: Routes will be loaded AFTER MongoDB connection is established
// This prevents "Cannot call users.findOne() before initial connection is complete" error

mongoose.Promise = global.Promise;
mongoose.set("strictQuery", true);
// 🚀 MONGOOSE OPTIMIZATIONS: Disable buffering for better error handling
mongoose.set('bufferCommands', false);

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
mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB connected successfully');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('🔄 MongoDB reconnected');
});

// 🔧 FIX: Handle process termination gracefully
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('🛑 MongoDB connection closed through app termination');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error);
    process.exit(1);
  }
});

// Connect to MongoDB with improved error handling and reconnection logic
mongoose
  .connect(process.env.DB_URL, mongooseOptions)
  .then(async (data) => {
    console.log(
      `✅ Mongodb instance connected to server: ${data.connection.host}`
    );
    
    // 🚀 FIX: Load routes AFTER MongoDB connection is established
    console.log('📚 Loading API routes...');
    require("./routes/user.route")(app);
    require("./routes/admin.route")(app);
    require("./routes/teacher.route")(app);
    require("./routes/broadcast.route")(app);
    require("./routes/group.route")(app);
    require("./routes/chat.route")(app);
    require("./routes/batch.route")(app);
    require("./routes/testimonialRoutes.route")(app);
    require("./routes/bookRoutes.route")(app);
    require("./routes/razorpay.route")(app);
    require("./routes/faq.route")(app);
    require("./routes/coupon.route")(app);
    require("./routes/razorpay.route")(app);
    require("./routes/enquiry.route")(app);
    require("./routes/achiever.route")(app);
    require("./routes/order.route")(app);
    require("./routes/notification.route")(app);
    require("./routes/liveClassRoutes.route")(app);
    require("./routes/bookOrder.route")(app);
    require("./routes/course.route")(app);
    require("./routes/questionRoutes")(app);
    require("./routes/quizRoutes")(app);
    require("./routes/scorecardRoutes")(app);
    require("./routes/quizFolder.routes")(app);
    require("./routes/importantLink.route")(app);
    require("./routes/locationRoutes")(app);
    require("./routes/bookpayment.route")(app);
    require("./routes/bookorder.routes")(app);
    // course Download mechanism by Himanshu
    require("./routes/stream.route")(app);
    // 🗂️ NEW: Master Folder System routes
    require("./routes/masterFolder.route")(app);
    // Enhanced Authentication Routes with MSG91 SMS
    require("./routes/authEnhanced.route")(app);
    console.log('✅ All API routes loaded successfully');

    // 🗂️ Initialize Master Folder System AFTER MongoDB connection
    // Wait a bit more to ensure connection is fully ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Verify connection is ready
    if (mongoose.connection.readyState === 1) {
      try {
        const { initializeMasterFolderSystem } = require('./services/masterFolderService');
        await initializeMasterFolderSystem();
        console.log('🗂️ Master Folder System initialized successfully');
      } catch (error) {
        console.error('❌ Failed to initialize Master Folder System:', error);
      }
    } else {
      console.error('❌ MongoDB connection not ready for Master Folder initialization');
    }
  })
  .catch((error) => {
    console.error("❌ MongoDB connection error:", error);
    console.error("🔍 Error details:", {
      name: error.name,
      message: error.message,
      code: error.code,
      codeName: error.codeName
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

io.on('connection', (socket) => {
  connectedUsers++;
  maxConcurrentUsers = Math.max(maxConcurrentUsers, connectedUsers);
  
  // 🚀 UPDATE PERFORMANCE MONITOR
  performanceMonitor.updateSocketMetrics(connectedUsers);
  
  console.log(`👤 User connected. Current: ${connectedUsers}, Peak: ${maxConcurrentUsers}`);
  
  // Monitor memory usage when user count is high
  if (connectedUsers > 1000) {
    const memUsage = process.memoryUsage();
    console.log(`⚠️ HIGH LOAD: ${connectedUsers} users, Memory: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
  }
  
  socket.on('disconnect', () => {
    connectedUsers--;
    // 🚀 UPDATE PERFORMANCE MONITOR
    performanceMonitor.updateSocketMetrics(connectedUsers);
    console.log(`👤 User disconnected. Current: ${connectedUsers}`);
  });
  
  // Add error handling
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// 🚀 MEMORY CLEANUP: Monitor and cleanup disconnected sockets every 30 seconds
setInterval(() => {
  const activeSockets = io.sockets.sockets.size;
  const memUsage = process.memoryUsage();
  
  console.log(`📊 Socket Stats: Active: ${activeSockets}, Connected: ${connectedUsers}, Memory: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
  
  // Alert if memory usage is high
  if (memUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
    console.warn(`🚨 HIGH MEMORY USAGE: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
  }
}, 30000);

const socketHandler = require("./sockets/chat");
const notificationHandler = require("./sockets/notification");
socketHandler(io);
notificationHandler(io);

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});

startCourseExpiryCron();
// stopCourseExpiryCron();

// 🔥 NEW: Start course access control jobs
scheduleCourseAccessCheck();
console.log('🚀 Course access control system initialized');

// 🗂️ Master Folder System initialization moved to MongoDB connection handler

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM signal, shutting down gracefully...');
  const { cancelScheduledJobs } = require('./jobs/courseAccessJob');
  cancelScheduledJobs();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT signal, shutting down gracefully...');
  const { cancelScheduledJobs } = require('./jobs/courseAccessJob');
  cancelScheduledJobs();
  process.exit(0);
});

module.exports = app;
