require('dotenv').config();

module.exports = {
    secret: process.env.SECRET,
    accessTokenTime: process.env.ACCESS_TOKEN_TIME,
    refreshTokenTime: process.env.REFRESH_TOKEN_TIME,

    // Cloudinary configuration (deprecated - now using S3)
    // cloud_name: process.env.CLOUD_NAME,
    // api_key: process.env.CLOUD_KEY,
    // api_secret: process.env.CLOUD_SECRET,

    // Amazon S3 configuration
    aws_access_key_id: process.env.AWS_ACCESS_KEY_ID,
    aws_secret_access_key: process.env.AWS_SECRET_ACCESS_KEY,
    aws_region: process.env.AWS_REGION,
    s3_bucket: process.env.S3_BUCKET // Optional if you want to configure bucket globally
};
