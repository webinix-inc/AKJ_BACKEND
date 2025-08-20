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
  
  // CORS middleware for image streaming routes only (publicly accessible)
  const imageStreamingCORS = (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    next();
  };

  // Image streaming routes (publicly accessible)
  app.get("/api/v1/stream/course-image/:courseId", imageStreamingCORS, streamController.streamCourseImage);
  app.get("/api/v1/stream/user-image/:userId", imageStreamingCORS, streamController.streamUserImage);
  app.get("/api/v1/stream/banner-image/:bannerId", imageStreamingCORS, streamController.streamBannerImage);
  app.get("/api/v1/stream/book-image/:bookId", imageStreamingCORS, streamController.streamBookImage);
  app.get("/api/v1/stream/quiz-image/:filename", imageStreamingCORS, streamController.streamQuizImage);
  app.get("/api/v1/stream/image/:key", imageStreamingCORS, streamController.streamS3Image);
  
  // 🔧 OPTIONS handler for CORS preflight requests (image routes only)
  app.options("/api/v1/stream/course-image/:courseId", imageStreamingCORS, (req, res) => res.status(200).end());
  app.options("/api/v1/stream/user-image/:userId", imageStreamingCORS, (req, res) => res.status(200).end());
  app.options("/api/v1/stream/banner-image/:bannerId", imageStreamingCORS, (req, res) => res.status(200).end());
  app.options("/api/v1/stream/book-image/:bookId", imageStreamingCORS, (req, res) => res.status(200).end());
  app.options("/api/v1/stream/quiz-image/:filename", imageStreamingCORS, (req, res) => res.status(200).end());
  app.options("/api/v1/stream/image/:key", imageStreamingCORS, (req, res) => res.status(200).end());
};
