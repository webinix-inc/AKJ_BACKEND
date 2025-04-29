const express = require("express");
const { createOrder } = require("../controllers/paymentController");
const authJwt = require("../middlewares/authJwt");

module.exports = (app) => {
  app.post("/api/v1/razorpay/create-order", [authJwt.verifyToken], createOrder);
};