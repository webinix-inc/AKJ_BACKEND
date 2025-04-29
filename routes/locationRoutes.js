const express = require('express');
const locationController = require('../controllers/locationController');
const authJwt = require('../middlewares/authJwt');

const router = express.Router();

module.exports = (app) => {
    // Save a location
    app.post('/api/v1/location/save', [authJwt.verifyToken], locationController.saveLocation);
    
    // Get saved locations
    app.get('/api/v1/location/list', [authJwt.verifyToken], locationController.getSavedLocations);
};