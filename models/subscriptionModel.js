const mongoose = require("mongoose");

const validitySchema = new mongoose.Schema(
  {
    validity: {
      type: Number,
    },
    price: {
      type: Number,
      required: true,
    },
    discount: {
      type: Number,
    },
  },
  { _id: false }
);

const featureSchema = new mongoose.Schema(
  {
    name: {
      type: String, // Name of the feature
    },
    enabled: {
      type: Boolean, // Is this feature enabled in the subscription?
      default: true,
    },
    description: {
      type: String, // Additional description for the feature (optional)
    },
  },
  { _id: false }
);

const subscriptionSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
    },
    name: {
      type: String,
    },
    description: {
      type: String,
    },
    type: {
      type: String,
      enum: ["Basic", "Premium", "Recording"],
    },
    validities: [validitySchema],
    features: [featureSchema], // Array of feature objects
    pdfDownloadPermissionsApp: {
      type: Boolean,
      default: false,
    },
    pdfDownloadInDevice: {
      type: Boolean,
      default: false,
    },
    pdfDownloadWithinApp: {
      type: Boolean,
      default: false,
    },
    pdfPermissionsWeb: {
      type: Boolean,
      default: false,
    },
    pdfViewAccess: {
      type: Boolean,
      default: false,
    },
    pdfDownloadAccess: {
      type: Boolean,
      default: false,
    },
    gst: {
      type: Number, // GST percentage (e.g., 18 for 18%)
      default: 0,
    },
    internetHandling: {
      type: Number, // Internet handling charges (e.g., service fee percentage)
      default: 0,
    },
  },
  { timestamps: true }
);

// Export the model
module.exports = mongoose.models.Subscription || mongoose.model("Subscription", subscriptionSchema);
