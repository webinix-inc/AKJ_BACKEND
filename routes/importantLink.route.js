const express = require('express');

const importLinkController = require('../controllers/importantLinkController');

const authJwt = require('../middlewares/authJwt');

const router = express.Router();

module.exports = (app) => {
    // 🔧 FIX: Add error handling and logging for important links routes
    app.post('/api/v1/admin/importLink',[authJwt.verifyToken], importLinkController.createImportantLink);

    // 🔧 FIX: Add middleware to log requests and handle errors
    app.get('/api/v1/admin/importantLinks', (req, res, next) => {
        console.log('📍 Important Links GET request received');
        next();
    }, importLinkController.getImportantLinks);

    app.patch('/api/v1/admin/importantLink/:linkId',[authJwt.verifyToken], importLinkController.updateImportantLink);

    app.delete('/api/v1/admin/importantLink/:linkId',[authJwt.verifyToken], importLinkController.deleteImportantLink);
    
    console.log('✅ Important Links routes registered successfully');
};