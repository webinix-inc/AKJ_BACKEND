const { verifyFileAccessToken } = require("../utils/streamUtils");
const { generateFileAccessToken } = require("../utils/streamUtils");
const { generateSignedUrl } = require("../utils/streamUtils");

const AWS = require("aws-sdk");
const s3 = new AWS.S3({ region: process.env.AWS_REGION });
const File = require("../models/fileModel");

exports.streamFile = async (req, res) => {
  const { token } = req.params;

  const { valid, payload } = verifyFileAccessToken(token);

  if (!valid) {
    return res.status(401).json({ message: "Unauthorized or token expired" });
  }

  const { fileId, userId, isDownloadable } = payload;

  try {
    const file = await File.findById(fileId);
    console.log("getting this file on stream :", file);

    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    if (!file.isViewable) {
      return res
        .status(403)
        .json({ message: "Access Denied: File not viewable" });
    }

    const key = decodeURIComponent(file.url.split(".com/")[1]); // Important decodeURIComponent
    const fileExtension = file.url.split(".").pop().toLowerCase();

    // If the file is PDF, generate signed URL and redirect
    // if (fileExtension === "pdf") {
    //   const signedUrl = generateSignedUrl(process.env.S3_BUCKET, key, 60 * 10); // 10 minutes signed URL
    //   return res.redirect(signedUrl);
    // }

    // Else, normal streaming for other file types
    const s3Params = {
      Bucket: process.env.S3_BUCKET,
      Key: key,
    };

    const s3Stream = s3.getObject(s3Params).createReadStream();

    res.setHeader("Content-Type", getMimeType(file.url));

    if (isDownloadable) {
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${file.name}"`
      );
    } else {
      res.setHeader("Content-Disposition", `inline`);
    }

    s3Stream.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.generateFileToken = async (req, res) => {
  const { fileId } = req.body;
  const userId = req.userId; // assuming you store userId in req.userId after verifyToken middleware

  if (!fileId) {
    return res.status(400).json({ message: "File ID is required" });
  }

  try {
    const file = await File.findById(fileId);

    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    // You may want to check if user has purchased access to the course here
    // Example: const hasAccess = await checkUserAccess(userId, file.courseId);

    // const hasAccess = true; // TODO: add your real access check here

    // if (!hasAccess) {
    //   return res
    //     .status(403)
    //     .json({ message: "You do not have access to this file" });
    // }

    const token = generateFileAccessToken(fileId, userId, file.isDownloadable);

    return res.status(200).json({
      message: "Token generated successfully",
      token,
    });
  } catch (error) {
    console.error("Error generating token:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

function getMimeType(url) {
  if (url.endsWith(".pdf")) return "application/pdf";
  if (url.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}
