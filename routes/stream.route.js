const streamController = require("../controllers/streamController");
const authJwt = require("../middlewares/authJwt");

module.exports = (app) => {
  app.get("/api/v1/stream/:token", streamController.streamFile);
  app.post(
    "/api/v1/stream/generate-token",
    [authJwt.verifyToken],
    streamController.generateFileToken
  );
};
