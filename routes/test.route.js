const testController = require("../controllers/test.controller");
const authJwt = require("../middlewares/authJwt");

module.exports = (app) => {
  app.post(
    "/api/v1/test/reset-installments/:courseId",
    testController.resetInstallmentPaidState
  );
};
