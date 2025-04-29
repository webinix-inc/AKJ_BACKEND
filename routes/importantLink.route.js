const express = require('express');

const importLinkController = require('../controllers/importantLinkController');

const authJwt = require('../middlewares/authJwt');

const router = express.Router();

module.exports = (app) => {
    app.post('/api/v1/admin/importLink',[authJwt.verifyToken], importLinkController.createImportantLink);

    app.get('/api/v1/admin/importantLinks', importLinkController.getImportantLinks);

    app.patch('/api/v1/admin/importantLink/:linkId',[authJwt.verifyToken], importLinkController.updateImportantLink);

    app.delete('/api/v1/admin/importantLink/:linkId',[authJwt.verifyToken], importLinkController.deleteImportantLink);
};