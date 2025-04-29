// routes/enquiryRoutes.js
const express = require("express");
const enquiryController = require("../controllers/enquiryController");
const authJwt = require('../middlewares/authJwt'); 

const router = express.Router();

module.exports = (app) => {
  app.post('/api/v1/enquiries', enquiryController.addEnquiry);
  app.get('/api/v1/enquiries',  enquiryController.getEnquiries);
};