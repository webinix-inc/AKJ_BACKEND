const auth = require("../controllers/adminController");
const installment = require("../controllers/installmentController");
const express = require("express");
// const { kpUpload } = require('../middlewares/cloudinaryConfig');
const { kpUpload, kpUpload1 } = require("../middlewares/fileUpload");

const router = express();

const authJwt = require("../middlewares/authJwt");

const {
  userProfileUpload,
  bannerImage,
  categoryImage,
  productImage,
  subCategoryUpload,
  subCategory,
  courseImage1,
  courseNotes,
  courseVideo,
  syllabusUpload,
  TestSeriesUpload,
} = require("../middlewares/imageUpload");

module.exports = (app) => {
  app.post("/api/v1/admin/registration", auth.registration);
  app.post("/api/v1/admin/login", auth.signin);
  app.post("/api/v1/admin/forgetPassword", auth.forgetPassword);
  app.post("/api/v1/admin/forgotVerifyotp", auth.forgotVerifyotp);
  app.post("/api/v1/admin/changePassword/:id", auth.changePassword);

  app.post(
    "/api/v1/admin/logout-user",
    [authJwt.verifyToken],
    auth.adminLogoutUser
  );

  app.get("/api/v1/admin/getProfile", auth.getProfile);

  app.get("/api/v1/admin/getAllProfile", auth.getAllProfile);

  app.get("/api/v1/admin/getProfile/:id", auth.getProfileById);

  app.put("/api/v1/admin/update", [authJwt.verifyToken], auth.update);
  app.put(
    "/api/v1/admin/update-user/:id",
    [authJwt.verifyToken],
    auth.updateUserDetails
  );
  app.put(
    "/api/v1/admin/upload-profile-picture/:id",
    [authJwt.verifyToken],
    userProfileUpload.single("image"),
    auth.uploadProfilePicture
  );

  //Banner start from here
  app.post("/api/v1/admin/banner", bannerImage.single("image"), auth.AddBanner);
  app.get("/api/v1/admin/banner", auth.getBanner);
  app.get("/api/v1/admin/banner/:id", auth.getBannerById);
  app.put(
    "/api/v1/admin/banner/:id",
    bannerImage.single("image"),
    auth.updateBanner
  );
  app.delete("/api/v1/admin/banner/:id", auth.removeBanner);
  //Banner end here

  app.post(
    "/api/v1/admin/subscriptions",
    [authJwt.verifyToken],
    auth.createSubscription
  );
  app.get("/api/v1/admin/subscriptions", auth.getAllSubscriptions);
  app.get(
    "/api/v1/admin/subscriptions/:id",
    [authJwt.verifyToken],
    auth.getSubscriptionById
  );
  app.put(
    "/api/v1/admin/subscriptions/:id",
    [authJwt.verifyToken],
    auth.updateSubscription
  );
  app.delete(
    "/api/v1/admin/subscriptions/:id",
    [authJwt.verifyToken],
    auth.deleteSubscription
  );
  app.get(
    "/api/v1/admin/user-subscriptions",
    [authJwt.verifyToken],
    auth.getAllUserSubscriptions
  );
  app.get(
    "/api/v1/admin/user-subscriptions/by/userId/:userId",
    [authJwt.verifyToken],
    auth.getSubscriptionsByUserId
  );
  app.get(
    "/api/v1/admin/user-subscriptions/:id",
    [authJwt.verifyToken],
    auth.getUserSubscriptionById
  );
  app.get(
    "/api/v1/admin/user-subscriptions-course/:courseId",
    [authJwt.verifyToken],
    auth.getSubscriptionsByCourseId
  );
  app.post("/api/v1/admin/subjects", [authJwt.verifyToken], auth.createSubject);
  app.get("/api/v1/admin/subjects", auth.getAllSubjects);
  app.get(
    "/api/v1/admin/subjects/:id",
    [authJwt.verifyToken],
    auth.getSubjectById
  );
  app.get(
    "/api/v1/admin/subjects/:subjectId/chapter/:chapterId",
    [authJwt.verifyToken],
    auth.getChapterById
  );
  app.put(
    "/api/v1/admin/subjects/:id",
    [authJwt.verifyToken],
    auth.updateSubjectById
  );
  app.delete(
    "/api/v1/admin/subjects/:id",
    [authJwt.verifyToken],
    auth.deleteSubjectById
  );
  app.post(
    "/api/v1/admin/subjects/:subjectId/chapters",
    [authJwt.verifyToken],
    auth.createChapter
  );
  app.get(
    "/api/v1/admin/subjects/:subjectId/chapters",
    [authJwt.verifyToken],
    auth.getAllChapters
  );
  app.put(
    "/api/v1/admin/subjects/:subjectId/chapters/:chapterId",
    [authJwt.verifyToken],
    auth.updateChapter
  );
  app.delete(
    "/api/v1/admin/subjects/:subjectId/chapters/:chapterId",
    [authJwt.verifyToken],
    auth.deleteChapter
  );
  app.get(
    "/api/v1/admin/subjects/:subjectId/chapters/:chapterUrl",
    [authJwt.verifyToken],
    auth.getChapterByUrl
  );
  app.post("/api/v1/admin/privacy", [authJwt.verifyToken], auth.createPrivacy);
  app.get("/api/v1/admin/privacy", [authJwt.verifyToken], auth.getPrivacy);
  app.get(
    "/api/v1/admin/privacy/:id",
    [authJwt.verifyToken],
    auth.getPrivacybyId
  );
  app.put(
    "/api/v1/admin/privacy/:id",
    [authJwt.verifyToken],
    auth.updatePrivacy
  );
  app.delete(
    "/api/v1/admin/privacy/:id",
    [authJwt.verifyToken],
    auth.deletePrivacy
  );
  app.post(
    "/api/v1/admin/courses/add",
    [authJwt.verifyToken],
    kpUpload,
    auth.createCourse
  );
  app.patch(
    "/api/v1/admin/courses/:id/toggle-publish",
    [authJwt.verifyToken],
    auth.togglePublishCourse
  );
  app.get("/api/v1/admin/courses", auth.getAllCourses);
  app.get("/api/v1/user/courses", auth.getAllPublishedCourses);
  app.get(
    "/api/v1/admin/courses/:id",
    [authJwt.verifyToken],
    auth.getCourseById
  );
  app.put(
    "/api/v1/admin/courses/:id",
    [authJwt.verifyToken],
    kpUpload,
    auth.updateCourseById
  );
  app.delete(
    "/api/v1/admin/courses/:id",
    [authJwt.verifyToken],
    auth.deleteCourseById
  );
  app.put(
    "/api/v1/admin/courses/addTeacherToCourse/:courseId",
    [authJwt.verifyToken],
    auth.addTeacherToCourse
  );
  app.delete(
    "/api/v1/admin/courses/removeTeacherFromCourse/:courseId",
    [authJwt.verifyToken],
    auth.removeTeacherFromCourse
  );
  app.post(
    "/api/v1/admin/Category/createCategory",
    [authJwt.verifyToken],
    subCategoryUpload.single("image"),
    auth.createCourseCategory
  );
  app.get(
    "/api/v1/admin/Category/allCategory/:mainCategoryId",
    auth.getCourseCategories
  );
  app.get("/api/v1/admin/Category/getAllCategory", auth.getAllCourseCategories);
  app.put(
    "/api/v1/admin/Category/update/:id",
    [authJwt.verifyToken],
    subCategoryUpload.single("image"),
    auth.updateCourseCategory
  );
  app.delete(
    "/api/v1/admin/Category/delete/:id",
    [authJwt.verifyToken],
    auth.removeCourseCategory
  );
  app.post(
    "/api/v1/admin/Category/:categoryId/createSubCategory",
    [authJwt.verifyToken],
    auth.createSubCategory
  );
  // app.get("/api/v1/admin/SubCategory/:courseId/:categoryId", auth.getSubCategories);
  app.get(
    "/api/v1/admin/Category/:categoryId/SubCategories",
    auth.getSubCategories
  );
  app.put(
    "/api/v1/admin/SubCategory/update/:id",
    [authJwt.verifyToken],
    kpUpload1,
    auth.updateSubCategory
  );
  app.delete(
    "/api/v1/admin/SubCategory/delete/:id",
    [authJwt.verifyToken],
    auth.removeSubCategory
  );
  app.put(
    "/api/v1/admin/uploadCourseImage/:subcategoryId",
    [authJwt.verifyToken],
    courseImage1.array("image"),
    auth.UploadCourseImage
  );
  app.put(
    "/api/v1/admin/uploadCourseNotes/:folderId",
    [authJwt.verifyToken],
    kpUpload1, // Replace `courseNotes.array('notes')` with `kpUpload1`
    auth.UploadCourseDocument
  );
  app.post(
    "/api/v1/admin/uploadCourseVideo/:folderId",
    [authJwt.verifyToken],
    auth.UploadCourseVideo
  );
  app.delete(
    "/api/v1/admin/deleteCourseVideo/:folderId",
    [authJwt.verifyToken],
    auth.deleteCourseVideos
  );
  app.post("/api/v1/admin/AboutUs", [authJwt.verifyToken], auth.createAboutUs);
  app.get("/api/v1/admin/AboutUs", [authJwt.verifyToken], auth.getAboutUs);
  app.get(
    "/api/v1/admin/AboutUs/:id",
    [authJwt.verifyToken],
    auth.getAboutUsbyId
  );
  app.put(
    "/api/v1/admin/AboutUs/:id",
    [authJwt.verifyToken],
    auth.updateAboutUs
  );
  app.delete(
    "/api/v1/admin/AboutUs/:id",
    [authJwt.verifyToken],
    auth.deleteAboutUs
  );
  //
  //     app.post('/api/v1/admin/notifications', [authJwt.verifyToken], auth.createNotification);
  //     app.put('/api/v1/admin/notifications/:notificationId', [authJwt.verifyToken], auth.markNotificationAsRead);
  //     app.get('/api/v1/admin/notifications/user/:userId', [authJwt.verifyToken], auth.getNotificationsForUser);
  //     app.get('/api/v1/admin/notifications/user', [authJwt.verifyToken], auth.getAllNotificationsForUser);
  //     app.delete('/api/v1/admin/notifications/delete/all', [authJwt.verifyToken], auth.deleteAllNotifications);
  //     app.delete('/api/v1/admin/notifications/delete/:id', [authJwt.verifyToken], auth.deleteNotificationById);

  app.post(
    "/api/v1/admin/schedules",
    [authJwt.verifyToken],
    auth.createSchedule
  );
  app.get(
    "/api/v1/admin/schedules",
    [authJwt.verifyToken],
    auth.getAllSchedules
  );
  app.get(
    "/api/v1/admin/schedules/:id",
    [authJwt.verifyToken],
    auth.getScheduleById
  );
  app.put(
    "/api/v1/admin/schedules/:id",
    [authJwt.verifyToken],
    auth.updateSchedule
  );
  app.delete(
    "/api/v1/admin/schedules/:id",
    [authJwt.verifyToken],
    auth.deleteSchedule
  );
  app.delete(
    "/api/v1/admin/schedules",
    [authJwt.verifyToken],
    auth.deleteAllSchedules
  );
  app.post(
    "/api/v1/admin/categories/add",
    [authJwt.verifyToken],
    categoryImage.single("image"),
    auth.createCategory
  );
  app.get("/api/v1/admin/categories", auth.getCourseCategories);
  app.get(
    "/api/v1/admin/categories/:categoryId",
    [authJwt.verifyToken],
    auth.getCategoryById
  );
  app.put(
    "/api/v1/admin/categories/:categoryId",
    [authJwt.verifyToken],
    categoryImage.single("image"),
    auth.updateCategory
  );
  app.delete(
    "/api/v1/admin/categories/:categoryId",
    [authJwt.verifyToken],
    auth.deleteCategory
  );
  app.post(
    "/api/v1/admin/products",
    [authJwt.verifyToken],
    productImage.array("image"),
    auth.createProduct
  );
  app.get("/api/v1/admin/products", [authJwt.verifyToken], auth.getAllProducts);
  app.get(
    "/api/v1/admin/products/:productId",
    [authJwt.verifyToken],
    auth.getProductById
  );
  app.put(
    "/api/v1/admin/products/:productId",
    [authJwt.verifyToken],
    productImage.array("image"),
    auth.updateProduct
  );
  app.delete(
    "/api/v1/admin/products/:productId",
    [authJwt.verifyToken],
    auth.deleteProduct
  );
  app.post(
    "/api/v1/admin/products/:productId/reviews",
    [authJwt.verifyToken],
    auth.createProductReview
  );
  app.get(
    "/api/v1/admin/products/:productId/reviews",
    [authJwt.verifyToken],
    auth.getAllProductReviews
  );
  app.get(
    "/api/v1/admin/products/:productId/reviews/:reviewId",
    [authJwt.verifyToken],
    auth.getProductReviewById
  );
  app.put(
    "/api/v1/admin/products/:productId/reviews/:reviewId",
    [authJwt.verifyToken],
    auth.updateProductReview
  );
  app.delete(
    "/api/v1/admin/products/:productId/reviews/:reviewId",
    [authJwt.verifyToken],
    auth.deleteProductReview
  );
  app.get(
    "/api/v1/admin/products/category/:categoryId",
    [authJwt.verifyToken],
    auth.getProductsByCategory
  );
  app.get(
    "/api/v1/admin/product/search",
    [authJwt.verifyToken],
    auth.searchProducts
  );
  app.get(
    "/api/v1/admin/category/:categoryId/new-arrivals",
    [authJwt.verifyToken],
    auth.getNewArrivalProductsByCategoryAndSubCategory
  );
  app.get(
    "/api/v1/admin/new-arrivals",
    [authJwt.verifyToken],
    auth.getNewArrivalProducts
  );
  app.get(
    "/api/v1/admin/most-demanded",
    [authJwt.verifyToken],
    auth.getMostDemandedProducts
  );
  app.get(
    "/api/v1/admin/product/all/paginateProductSearch",
    [authJwt.verifyToken],
    auth.paginateProductSearch
  );
  // app.get('/api/v1/admin/order', [authJwt.verifyToken], auth.getAllOrders);
  // app.get('/api/v1/admin/user/order/:userId', [authJwt.verifyToken], auth.getOrdersByUserId);
  // app.get('/api/v1/admin/product/order/:productId', [authJwt.verifyToken], auth.getOrdersByProductId);
  // app.get('/api/v1/admin/order/:orderId', [authJwt.verifyToken], auth.getOrderById);
  // app.get('/api/v1/admin/order-search/search', [authJwt.verifyToken], auth.searchOrders);
  // app.put('/api/v1/admin/order/:id/status', [authJwt.verifyToken], auth.updateOrderStatus);
  // app.put('/api/v1/admin/refund-orders/:orderId', [authJwt.verifyToken], auth.updateRefundStatus);
  app.post("/api/v1/admin/notices", [authJwt.verifyToken], auth.createNotice);
  app.get("/api/v1/admin/notices", [authJwt.verifyToken], auth.getAllNotices);
  app.get(
    "/api/v1/admin/notices/:id",
    [authJwt.verifyToken],
    auth.getNoticeById
  );
  app.put(
    "/api/v1/admin/notices/:id",
    [authJwt.verifyToken],
    auth.updateNotice
  );
  app.delete(
    "/api/v1/admin/notices/:id",
    [authJwt.verifyToken],
    auth.deleteNotice
  );
  app.post(
    "/api/v1/admin/syllabus",
    [authJwt.verifyToken],
    syllabusUpload.single("image"),
    auth.createSyllabus
  );
  app.get("/api/v1/admin/syllabus", [authJwt.verifyToken], auth.getAllSyllabus);
  app.get(
    "/api/v1/admin/syllabus/:id",
    [authJwt.verifyToken],
    auth.getSyllabusById
  );
  app.put(
    "/api/v1/admin/syllabus/:id",
    [authJwt.verifyToken],
    syllabusUpload.single("image"),
    auth.updateSyllabus
  );
  app.delete(
    "/api/v1/admin/syllabus/:id",
    [authJwt.verifyToken],
    auth.deleteSyllabus
  );
  app.post(
    "/api/v1/admin/testseries",
    [authJwt.verifyToken],
    TestSeriesUpload.array("documents"),
    auth.createTestSeries
  );
  // app.post('/api/v1/admin/testseries', [authJwt.verifyToken], auth.createTestSeries);
  app.get(
    "/api/v1/admin/testseries",
    [authJwt.verifyToken],
    auth.getAllTestSeries
  );
  app.get(
    "/api/v1/admin/testseries/:id",
    [authJwt.verifyToken],
    auth.getTestSeriesById
  );
  app.put(
    "/api/v1/admin/testseries/:id",
    [authJwt.verifyToken],
    TestSeriesUpload.array("documents"),
    auth.updateTestSeries
  );
  app.delete(
    "/api/v1/admin/testseries/:id",
    [authJwt.verifyToken],
    auth.deleteTestSeries
  );
  app.post(
    "/api/v1/admin/VideoLecture",
    [authJwt.verifyToken],
    auth.createVideoLecture
  );
  app.get(
    "/api/v1/admin/VideoLecture",
    [authJwt.verifyToken],
    auth.getAllVideoLectures
  );
  app.get(
    "/api/v1/admin/VideoLecture/:id",
    [authJwt.verifyToken],
    auth.getVideoLectureById
  );
  app.put(
    "/api/v1/admin/VideoLecture/:id",
    [authJwt.verifyToken],
    auth.updateVideoLecture
  );
  app.delete(
    "/api/v1/admin/VideoLecture/:id",
    [authJwt.verifyToken],
    auth.deleteVideoLecture
  );
  app.post(
    "/api/v1/admin/ExamSchedule",
    [authJwt.verifyToken],
    auth.createExamSchedule
  );
  app.get(
    "/api/v1/admin/ExamSchedule",
    [authJwt.verifyToken],
    auth.getAllExamSchedules
  );
  app.get(
    "/api/v1/admin/ExamSchedule/:id",
    [authJwt.verifyToken],
    auth.getExamScheduleById
  );
  app.put(
    "/api/v1/admin/ExamSchedule/:id",
    [authJwt.verifyToken],
    auth.updateExamSchedule
  );
  app.delete(
    "/api/v1/admin/ExamSchedule/:id",
    [authJwt.verifyToken],
    auth.deleteExamSchedule
  );
  app.post(
    "/api/v1/admin/Recording",
    [authJwt.verifyToken],
    auth.createRecording
  );
  app.get(
    "/api/v1/admin/Recording",
    [authJwt.verifyToken],
    auth.getAllRecordings
  );
  app.get(
    "/api/v1/admin/Recording/:id",
    [authJwt.verifyToken],
    auth.getRecordingById
  );
  app.put(
    "/api/v1/admin/Recording/:id",
    [authJwt.verifyToken],
    auth.updateRecording
  );
  app.delete(
    "/api/v1/admin/Recording/:id",
    [authJwt.verifyToken],
    auth.deleteRecording
  );
  app.post(
    "/api/v1/admin/SurveyForm",
    [authJwt.verifyToken],
    auth.createSurveyForm
  );
  app.get(
    "/api/v1/admin/SurveyForm",
    [authJwt.verifyToken],
    auth.getAllSurveyForms
  );
  app.get(
    "/api/v1/admin/SurveyForm/:id",
    [authJwt.verifyToken],
    auth.getSurveyFormById
  );
  app.put(
    "/api/v1/admin/SurveyForm/:id",
    [authJwt.verifyToken],
    auth.updateSurveyForm
  );
  app.delete(
    "/api/v1/admin/SurveyForm/:id",
    [authJwt.verifyToken],
    auth.deleteSurveyForm
  );
  app.put(
    "/api/v1/admin/SurveyForm/:id/adminReply",
    [authJwt.verifyToken],
    auth.addAdminReply
  );
  app.post(
    "/api/v1/admin/FollowUs",
    [authJwt.verifyToken],
    auth.createFollowUs
  );
  app.get("/api/v1/admin/FollowUs", [authJwt.verifyToken], auth.getAllFollowUs);
  app.get(
    "/api/v1/admin/FollowUs/:id",
    [authJwt.verifyToken],
    auth.getFollowUsById
  );
  app.put(
    "/api/v1/admin/FollowUs/:id",
    [authJwt.verifyToken],
    auth.updateFollowUs
  );
  app.delete(
    "/api/v1/admin/FollowUs/:id",
    [authJwt.verifyToken],
    auth.deleteFollowUs
  );
  app.post(
    "/api/v1/admin/create-installment",
    [authJwt.verifyToken],
    installment.setCustomInstallments
  );
  app.get(
    "/api/v1/admin/installments/:courseId",
    [authJwt.verifyToken],
    installment.getInstallments
  );
  app.get(
    "/api/v1/admin/installments/:courseId/user/:userId/timeline",
    [authJwt.verifyToken],
    installment.getUserInstallmentTimeline
  );

  // added by Himanshu
  app.post(
    "/api/v1/admin/updateDownloads",
    [authJwt.verifyToken],
    auth.updateDownloads
  );
};
