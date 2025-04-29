const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectsCommand,
  ListObjectVersionsCommand, // Import this command to list object versions
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const authConfig = require("./auth.config");

// Initialize the S3 client using the AWS SDK v3
const s3 = new S3Client({
  region: authConfig.aws_region,
  credentials: {
    accessKeyId: authConfig.aws_access_key_id,
    secretAccessKey: authConfig.aws_secret_access_key,
  },
});

// Function to generate pre-signed URL for object access (GET)
const generatePresignedUrl = async (bucketName, objectKey) => {
  const decodedKey = decodeURIComponent(objectKey);
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: decodedKey,
    ACL:'public-read',
  });

  try {
    const url = await getSignedUrl(s3, command);
    console.log(`Generated Pre-signed GET URL: ${url}`);
    return url;
  } catch (error) {
    console.error("Error generating pre-signed GET URL:", error);
    throw error;
  }
};

// Function to generate pre-signed URL for object upload (PUT)
const generateUploadUrl = async (bucketName, objectKey, expiresIn = 3600) => {
  const decodedKey = decodeURIComponent(objectKey);
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: decodedKey,
  });

  try {
    const url = await getSignedUrl(s3, command, { expiresIn });
    console.log(`Generated Pre-signed PUT URL: ${url}`);
    return url;
  } catch (error) {
    console.error("Error generating pre-signed PUT URL:", error);
    throw error;
  }
};

// Function to extract the object key from a URL or return the key directly if it's not a full URL
const extractKeyFromUrl = (urlOrKey) => {
  try {
    const url = new URL(urlOrKey);
    return url.pathname.substring(1); // Remove leading '/'
  } catch (error) {
    return urlOrKey; // It's already a key
  }
};

// Function to delete multiple objects permanently from the bucket (handles versioning)
const deleteFilesFromBucket = async (bucketName, fileUrls) => {
  const fileKeys = fileUrls.map((url) => decodeURIComponent(extractKeyFromUrl(url)));

  try {
    // First, check if the bucket has versioning enabled and list all versions for these files
    const deleteObjects = [];

    for (const fileKey of fileKeys) {
      const listVersionsCommand = new ListObjectVersionsCommand({
        Bucket: bucketName,
        Prefix: fileKey,
      });

      const versionData = await s3.send(listVersionsCommand);
      
      // If versions are found, we must delete each version
      if (versionData.Versions) {
        versionData.Versions.forEach((version) => {
          deleteObjects.push({
            Key: fileKey,
            VersionId: version.VersionId,
          });
        });
      }
    }

    // If we have specific versions to delete (for versioned buckets)
    if (deleteObjects.length > 0) {
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: {
          Objects: deleteObjects,
        },
      });

      const result = await s3.send(deleteCommand);
      console.log("Deleted file versions:", result);
      return result;
    } else {
      // If no versions are found, proceed with the default delete operation (non-versioned objects)
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: {
          Objects: fileKeys.map((key) => ({ Key: key })),
        },
      });

      const result = await s3.send(deleteCommand);
      console.log("Deleted files (non-versioned):", result);
      return result;
    }
  } catch (error) {
    console.error("Error deleting files from S3:", error);
    throw error;
  }
};

module.exports = { s3, generatePresignedUrl, generateUploadUrl, deleteFilesFromBucket };
