const mongoose = require("mongoose");
const Teacher = require("./teacherModel");
const schema = mongoose.Schema;

const userSchema = new schema(
  {
    refferalCode: { type: String },
    refferUserId: { type: schema.Types.ObjectId, ref: "User" },
    joinUser: [{ type: schema.Types.ObjectId, ref: "User" }],
    fullName: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    language: { type: String },
    image: { type: String },
    gender: { type: String },
    dob: { type: String },
    phone: { type: String },
    alternatePhone: { type: String },
    email: { type: String, minLength: 10, sparse: true },
    password: { type: String },
    school: { type: String },
    class: { type: String },
    rollNo: { type: String },
    address1: { type: String },
    address2: { type: String },
    panCard: { type: String },
    aadharCard: { type: String },
    otherDocument: { type: String },
    otherImage: { type: String },
    documentVerification: { type: Boolean, default: false },
    country: { type: String },
    state: { type: String },
    city: { type: String },
    pincode: { type: Number },
    otp: { type: String },
    otpExpiration: { type: String },
    accountVerification: { type: Boolean, default: false },
    completeProfile: { type: Boolean, default: false },
    userType: {
      type: String,
      enum: ["USER", "TEACHER", "ADMIN", "TEAM"],
    },
    teacherProfile: {
      type: schema.Types.ObjectId,
      ref: "Teacher",
    },
    status: { type: String, enum: ["Approved", "Reject", "Pending"] },
    currentLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        default: [0, 0],
      },
    },
    averageRating: { type: Number, default: 0 },
    wallet: { type: Number, default: 0 },
    experience: { type: Number, default: 0 },
    college: { type: String },
    merithubUserId: { type: String },
    userBio: { type: String },

    purchasedCourses: [
      {
        course: {
          type: schema.Types.ObjectId,
          ref: "Course",
        },
        purchaseDate: {
          type: Date,
          default: Date.now,
        },
        amountPaid: {
          type: Number,
          default: 0,
        },
        paymentType: {
          type: "String",
          default: "full",
        },
        totalInstallments: {
          type: Number,
          default: -1,
        },
        assignedByAdmin: {
          isAssigned: { type: Boolean, default: false },
          assignedAt: { type: Date },
          assignedBy: { type: schema.Types.ObjectId, ref: "User" },
          revokedAt: { type: Date },
          revokedBy: { type: schema.Types.ObjectId, ref: "User" },
          status: {
            type: String,
            enum: ["ASSIGNED", "REVOKED", "PURCHASED"],
            default: "PURCHASED",
          },
        },
        expiresAt: { type: "Number" },
      },
    ],

    liveClasses: [
      {
        courseIds: [{ type: schema.Types.ObjectId, ref: "Course" }], // Array of ObjectIds linking to Course
        title: { type: String, required: true },
        startTime: { type: Date, required: true },
        duration: { type: Number, required: true },
        liveLink: { type: String },
        participantLink: { type: String, required: true },
        classId: { type: String },
      },
    ],
    coursesPermission: {
      type: Boolean,
      default: true,
    },
    bookStorePermission: {
      type: Boolean,
      default: true,
    },
    planPermission: {
      type: Boolean,
      default: true,
    },
    reportAndAnalyticPermission: {
      type: Boolean,
      default: true,
    },
    chatPermission: {
      type: Boolean,
      default: true,
    },
    marketingServicesPermission: {
      //coupon, banner, client Testimonial, notification, enquiry, add achiever
      type: Boolean,
      default: true,
    },
    testPortalPermission: {
      type: Boolean,
      default: true,
    },
    peoplePermission: {
      type: Boolean,
      default: true,
    },
    activeTokens: {
      webToken: { type: String, default: null },
      webDeviceId: { type: String, default: null },
      mobileToken: { type: String, default: null },
      mobileDeviceId: { type: String, default: null },
    },
    isLoggedOut: { type: Boolean, default: false }, //by admin
  },
  { timestamps: true }
);

userSchema.pre("save", function (next) {
  if (this.userType === "TEACHER" && !this.teacherProfile) {
    next();
  } else if (this.userType !== "TEACHER" && this.teacherProfile) {
    this.teacherProfile = undefined;
  }
  next();
});

const User = mongoose.model("User", userSchema);

module.exports = User;
