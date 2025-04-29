const orderController = require("../controllers/orderController");
const authJwt = require("../middlewares/authJwt");

module.exports = (app) => {
  app.get(
    "/api/v1/admin/orders/paid",
    [authJwt.verifyToken],
    orderController.getAllPaidOrders
  );
  app.get(
    "/api/v1/admin/count/:courseId",
    [authJwt.verifyToken],
    orderController.countStudentsForCourse
  );
};
