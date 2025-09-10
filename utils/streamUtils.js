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
  try {
    console.log(`🔗 [FILE-PRESIGN] Generating signed URL for file`);
    console.log(`🔗 [FILE-PRESIGN] Bucket: ${bucketName}, Key: ${key}`);
    
    // Determine content type based on file extension
    const fileExtension = key.split('.').pop().toLowerCase();
    let contentType = 'application/octet-stream'; // Default
    
    if (fileExtension === 'pdf') {
      contentType = 'application/pdf';
    } else if (['mp4', 'webm', 'mkv', 'avi', 'mov'].includes(fileExtension)) {
      // Set appropriate video content types
      switch (fileExtension) {
        case 'mp4':
          contentType = 'video/mp4';
          break;
        case 'webm':
          contentType = 'video/webm';
          break;
        case 'mkv':
          contentType = 'video/x-matroska';
          break;
        case 'avi':
          contentType = 'video/x-msvideo';
          break;
        case 'mov':
          contentType = 'video/quicktime';
          break;
        default:
          contentType = 'video/mp4'; // Default to mp4
      }
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension)) {
      contentType = `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`;
    }
    
    console.log(`🔗 [FILE-PRESIGN] Detected content type: ${contentType} for extension: ${fileExtension}`);
    
    // Use same configuration as working generatePresignedUrl
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
      ResponseContentDisposition: "inline", // show in browser, not download
      ResponseContentType: contentType, // Set appropriate content type based on file
    });
    
    const signedUrl = await getSignedUrl(s3, command, { 
      expiresIn,
      signableHeaders: new Set(['host']) // Same as working config
    });
    
    console.log(`✅ [FILE-PRESIGN] Generated signed URL successfully`);
    console.log(`✅ [FILE-PRESIGN] URL: ${signedUrl.substring(0, 100)}...`);
    
    return signedUrl;
  } catch (error) {
    console.error(`❌ [FILE-PRESIGN] Failed to generate signed URL:`, error);
    console.error(`❌ [FILE-PRESIGN] Error name: ${error.name}`);
    console.error(`❌ [FILE-PRESIGN] Error code: ${error.code}`);
    throw error;
  }
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
