const jwt = require("jsonwebtoken");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const mime = require("mime-types");
const JWT_SECRET = process.env.SECRET || "yoursecretkey";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
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

const generateSignedUrl = async (bucketName, key, expiresIn = 60 * 5) => {
  // default 5 mins
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
    ResponseContentDisposition: "inline", // show in browser, not download
  });
  return await getSignedUrl(s3, command, { expiresIn });
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
