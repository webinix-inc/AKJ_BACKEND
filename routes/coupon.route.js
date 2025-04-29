const express = require('express');
const couponController = require('../controllers/couponController');
const authJwt = require('../middlewares/authJwt');

const router = express.Router();

module.exports = (app) => {
    // for admin- for coupon management
    app.post('/api/v1/admin/coupons',[authJwt.verifyToken],couponController.createCoupon);

    app.get('/api/v1/admin/coupons',[authJwt.verifyToken],couponController.getAllCoupons);

    app.get('/api/v1/admin/coupons/:id',[authJwt.verifyToken],couponController.getCouponById);

    app.put('/api/v1/admin/coupons/:id',[authJwt.verifyToken],couponController.updateCoupon);

    app.delete('/api/v1/admin/coupons/:id',[authJwt.verifyToken],couponController.deleteCoupon);

    // for user- for coupon usage
    app.post('/api/v1/coupons/validate',[authJwt.verifyToken],couponController.validateCoupon);

    app.get('/api/v1/coupons/available',[authJwt.verifyToken],couponController.getAvailableCoupons);

    app.post('/api/v1/coupons/apply',[authJwt.verifyToken],couponController.applyCoupon);
};

// module.exports = (app) => {
//     // for admin- for coupon management
//     app.post('/api/v1/admin/coupons',couponController.createCoupon);

//     app.get('/api/v1/admin/coupons',couponController.getAllCoupons);

//     app.get('/api/v1/admin/coupons/:id',couponController.getCouponById);

//     app.put('/api/v1/admin/coupons/:id',couponController.updateCoupon);

//     app.delete('/api/v1/admin/coupons/:id',couponController.deleteCoupon);

//     // for user- for coupon usage
//     app.post('/api/v1/coupons/validate',couponController.validateCoupon);

//     app.get('/api/v1/coupons/available',couponController.getAvailableCoupons);

//     app.post('/api/v1/coupons/apply',couponController.applyCoupon);
// };