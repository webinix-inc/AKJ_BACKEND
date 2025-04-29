const auth = require("../controllers/teacherController");
const authJwt = require("../middlewares/authJwt");

const { userProfileUpload, bannerUpload, documentUpload, kpUpload2, TestSeriesUpload, behaviourUpload, bannerImage, kpUpload, categoryImage, productImage, subCategoryUpload, subCategory, kpUpload1, courseImage1, courseNotes, courseVideo, syllabusUpload,
 } = require('../middlewares/imageUpload')

const express = require("express");
const router = express()

module.exports = (app) => {
    app.post("/api/v1/teacher/signup", userProfileUpload.single('image'), [authJwt.verifyToken],auth.registerTeacher);
    app.post("/api/v1/teacher/loginWithPhone", auth.loginWithPhone);
    app.post("/api/v1/teacher/:id", auth.verifyOtp);
    app.post("/api/v1/teacher/resendOtp/:id", auth.resendOTP);
    app.post("/api/v1/teacher/registration", [authJwt.verifyToken], auth.registration);
    app.post("/api/v1/teacher/socialLogin", auth.socialLogin);
    app.get("/api/v1/teacher/getProfile", [authJwt.verifyToken], auth.getProfile);
    app.put("/api/v1/teacher/updateProfile", [authJwt.verifyToken], kpUpload2, auth.updateProfile);
    app.get('/api/v1/teacher/courses', [authJwt.verifyToken], auth.getAllCourses);
    app.get('/api/v1/teacher/courses-for-teacher', [authJwt.verifyToken], auth.getAllCoursesForTeacher);
    app.get('/api/v1/teacher/courses/:id', [authJwt.verifyToken], auth.getCourseById);
    app.post('/api/v1/teacher/notices/add', [authJwt.verifyToken], auth.createNotice);
    app.get('/api/v1/teacher/notices', [authJwt.verifyToken], auth.getAllNotices);
    app.get('/api/v1/teacher/notices/:id', [authJwt.verifyToken], auth.getNoticeById);
    app.put('/api/v1/teacher/notices/:id', [authJwt.verifyToken], auth.updateNotice);
    app.delete('/api/v1/teacher/notices/:id', [authJwt.verifyToken], auth.deleteNotice);
    app.post('/api/v1/teacher/testseries/add', [authJwt.verifyToken], TestSeriesUpload.array('documents'), auth.createTestSeries);
    //app.post('/api/v1/teacher/testseries', [authJwt.verifyToken], auth.createTestSeries);
    app.get('/api/v1/teacher/testseries', [authJwt.verifyToken], auth.getAllTestSeries);
    app.get('/api/v1/teacher/testseries/:id', [authJwt.verifyToken], auth.getTestSeriesById);
    app.put('/api/v1/teacher/testseries/:id', [authJwt.verifyToken], TestSeriesUpload.array('documents'), auth.updateTestSeries);
    app.delete('/api/v1/teacher/testseries/:id', [authJwt.verifyToken], auth.deleteTestSeries);
    app.post('/api/v1/teacher/behavior-notes/add', [authJwt.verifyToken], behaviourUpload.single('image'), auth.createBehaviorNote);
    app.get('/api/v1/teacher/behavior-notes', [authJwt.verifyToken], auth.getAllBehaviorNotes);
    app.get('/api/v1/teacher/behavior-notes/:id', [authJwt.verifyToken], auth.getBehaviorNoteById);
    app.put('/api/v1/teacher/behavior-notes/:id', [authJwt.verifyToken], behaviourUpload.single('image'), auth.updateBehaviorNote);
    app.delete('/api/v1/teacher/behavior-notes/:id', [authJwt.verifyToken], auth.deleteBehaviorNote);
    app.get("/api/v1/teacher/Category/allCategory/:id", auth.getCourseCategories);
    app.get("/api/v1/teacher/SubCategory/:courseId/:categoryId", auth.getSubCategories);
    app.put('/api/v1/teacher/uploadCourseImage/:subcategoryId', [authJwt.verifyToken], courseImage1.array('image'), auth.UploadCourseImage)
    app.put('/api/v1/teacher/uploadCourseNotes/:subcategoryId', [authJwt.verifyToken], courseNotes.array('notes'), auth.UploadCourseDocument)
    app.put('/api/v1/teacher/uploadCourseVideo/:subcategoryId', [authJwt.verifyToken], auth.UploadCourseVideo)
    app.post("/api/v1/teacher/schedules", [authJwt.verifyToken], auth.createSchedule);
    app.get("/api/v1/teacher/schedules", [authJwt.verifyToken], auth.getAllSchedules);
    app.get("/api/v1/teacher/schedules/:id", [authJwt.verifyToken], auth.getScheduleById);
    app.put("/api/v1/teacher/schedules/:id", [authJwt.verifyToken], auth.updateSchedule);
    app.delete("/api/v1/teacher/schedules/:id", [authJwt.verifyToken], auth.deleteSchedule);

    app.post("/api/v1/admin/addTeacherToCourse", [authJwt.verifyToken], auth.addTeacherToCourse);

    app.get("/api/v1/teacher/getTeacherCourses/:teacherId", [authJwt.verifyToken], auth.getTeacherCourses);

    app.delete("/api/v1/teacher/remove-courses", [authJwt.verifyToken], auth.removeTeacherFromCourse);

}