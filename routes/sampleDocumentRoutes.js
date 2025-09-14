const express = require('express');
const sampleDocumentController = require('../controllers/sampleDocumentController');
const authJwt = require('../middlewares/authJwt');

const router = express.Router();

module.exports = (app) => {
    // Download sample document template
    app.get('/api/v1/admin/sample-document/download', 
        [authJwt.verifyToken], 
        sampleDocumentController.downloadSampleDocument
    );
    
    // Get sample document information
    app.get('/api/v1/admin/sample-document/info', 
        [authJwt.verifyToken], 
        sampleDocumentController.getSampleDocumentInfo
    );
    
    // Public route for sample document info (no auth required)
    app.get('/api/v1/sample-document/info', 
        sampleDocumentController.getSampleDocumentInfo
    );
    
    // Public download route (no auth required for easier access)
    app.get('/api/v1/sample-document/download', 
        sampleDocumentController.downloadSampleDocument
    );
};
