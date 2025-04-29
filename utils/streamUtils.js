const jwt = require("jsonwebtoken");
const AWS = require("aws-sdk");
const mime = require("mime-types");
const JWT_SECRET = process.env.SECRET || "yoursecretkey";

const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

// Generate short-lived token
function generateFileAccessToken(fileId, userId, isDownloadable) {
  const payload = {
    fileId,
    userId,
    isDownloadable,
  };

  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: "5m",
  });

  return token;
}

// Verify the token
function verifyFileAccessToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { valid: true, payload: decoded };
  } catch (error) {
    return { valid: false, error };
  }
}

const generateSignedUrl = (bucketName, key, expiresIn = 60 * 5) => {
  // default 5 mins
  const params = {
    Bucket: bucketName,
    Key: key,
    Expires: expiresIn,
    ResponseContentDisposition: "inline", // show in browser, not download
  };
  return s3.getSignedUrl("getObject", params);
};

function getMimeType(filePath) {
  return mime.lookup(filePath) || "application/octet-stream";
}

module.exports = {
  generateFileAccessToken,
  verifyFileAccessToken,
  generateSignedUrl,
  getMimeType, // added
  s3, // if you want direct s3 usage somewhere
};
