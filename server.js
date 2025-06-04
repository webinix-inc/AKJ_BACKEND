require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mongoose = require("mongoose");
const compression = require("compression");
const { S3Client, ListBucketsCommand } = require("@aws-sdk/client-s3");
// const serverless = require("serverless-http");
const path = require("path");
const http = require("http");
const socketIO = require("socket.io");
const orderRoutes = require("./routes/bookOrder.route");

const app = express();
const server = http.createServer(app); // Create HTTP server
const io = socketIO(server); // Initialize Socket.io with the server
const {
  startCourseExpiryCron,
  stopCourseExpiryCron,
} = require("./utils/courseExpiryCron");

app.use(compression({ threshold: 100 }));
// Increase limit for JSON and URL-encoded bodies
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

// app.use(express.raw({ type: '/', limit: '10mb' }));

const allowedOrigins = [
  "http://localhost:3000",
  "http://13.233.196.145",
  "http://65.0.103.50",
  "http://localhost:3001",
  "http://13.233.215.250",
  "http://43.205.125.7",
  "http://52.66.125.129",
  // added by Himanshu
  "http://172.31.44.181", // New Users Frontend
  "http://172.31.35.192", // New Admin Frontend
  "http://172.31.11.118", // Backend itself
  "http://3.111.34.85",
  "http://13.201.132.140",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg =
          "The CORS policy for this site does not allow access from the specified origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(function (req, res, next) {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-Requested-With,content-type"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, PATCH, DELETE"
  );
  res.setHeader("Access-Control-Allow-Credentials", true);
  next();
});

app.use((req, res, next) => {
  req.io = io;
  next();
});

app.get("/", (req, res) => {
  if (process.env.NODE_ENV === "production") {
    res.send("Server is live in production mode");
  } else {
    res.send("Server is live in development mode");
  }
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

mongoose.Promise = global.Promise;
mongoose.set("strictQuery", true);

mongoose.connect(process.env.DB_URL).then((data) => {
  console.log(`Mongodb instance connected to server: ${data.connection.host}`);
});

const PORT = process.env.PORT || 3000;

const socketHandler = require("./sockets/chat");
const notificationHandler = require("./sockets/notification");
socketHandler(io);
notificationHandler(io);

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});

startCourseExpiryCron();
// stopCourseExpiryCron();

module.exports = app;
