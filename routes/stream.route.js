const streamController = require("../controllers/streamController");
const authJwt = require("../middlewares/authJwt");

module.exports = (app) => {
  app.get("/api/v1/stream/:token", streamController.streamFile);
  app.post(
    "/api/v1/stream/generate-token",
    [authJwt.verifyToken],
    streamController.generateFileToken
  );
  
  // 🔥 NEW: Course access control routes
  app.post(
    "/api/v1/stream/check-course-access/:courseId",
    [authJwt.verifyToken],
    streamController.checkCourseAccess
  );
  
  // Image streaming routes (publicly accessible)
  app.get("/api/v1/stream/course-image/:courseId", streamController.streamCourseImage);
  app.get("/api/v1/stream/user-image/:userId", streamController.streamUserImage);
  app.get("/api/v1/stream/banner-image/:bannerId", streamController.streamBannerImage);
  app.get("/api/v1/stream/book-image/:bookId", streamController.streamBookImage);
  app.get("/api/v1/stream/quiz-image/:filename", streamController.streamQuizImage);
  app.get("/api/v1/stream/image/:key", streamController.streamS3Image);
  
  // 🔧 OPTIONS handler for CORS preflight requests
  app.options("/api/v1/stream/image/:key", (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.status(200).end();
  });
};
