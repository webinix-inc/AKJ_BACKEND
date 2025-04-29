const express = require('express');
const notificationController = require('../controllers/notificationController');
const authJwt = require('../middlewares/authJwt');

const router = express.Router();

module.exports = (app) => {
    // for admin
    app.post('/api/v1/admin/broadcast',[authJwt.verifyToken],notificationController.sendBroadcastNotification);

    //get all notification data
    app.get('/api/v1/admin/broadcast',[authJwt.verifyToken],notificationController.getAllNotifications);
     
    //Get Course Notification
    app.get('/api/v1/notification/course/:courseId', [authJwt.verifyToken],notificationController.getCourseNotifications);

    // for cousrse specific send
    app.post('/api/v1/notification/course-specific',[authJwt.verifyToken],notificationController.sendCourseSpecificNotification);
    
    //Couse purchase after buy
    app.post('/api/v1/notification/course-purchase',[authJwt.verifyToken],notificationController.sendCoursePurchaseNotification);
};
