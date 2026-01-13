const { GetObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const authConfig = require("../configs/auth.config");

const s3 = new S3Client({
    region: authConfig.aws_region,
    credentials: {
        accessKeyId: authConfig.aws_access_key_id,
        secretAccessKey: authConfig.aws_secret_access_key,
    },
});

exports.getSignedFileUrl = async (url) => {
    if (!url || typeof url !== 'string') return url;

    // Only sign S3 URLs from our bucket
    // Check if it's already a signed URL (has query params like X-Amz-Signature)
    if (url.includes("X-Amz-Signature")) return url;

    try {
        const bucketName = authConfig.s3_bucket;
        const region = authConfig.aws_region;

        // Construct the base URL for the bucket to find the key
        // AWS SDK usually generates: https://bucket.s3.region.amazonaws.com/key
        const baseUrl = `https://${bucketName}.s3.${region}.amazonaws.com/`;

        if (!url.startsWith(baseUrl)) {
            // Try alternative format: https://bucket.s3.amazonaws.com/
            if (url.startsWith(`https://${bucketName}.s3.amazonaws.com/`)) {
                const key = url.replace(`https://${bucketName}.s3.amazonaws.com/`, "");
                const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
                return await getSignedUrl(s3, command, { expiresIn: 3600 });
            }
            return url;
        }

        const key = url.replace(baseUrl, "");

        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key,
        });

        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        return signedUrl;
    } catch (error) {
        console.error("Error signing URL:", error);
        return url;
    }
};
