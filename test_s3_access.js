const { S3Client, GetObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
require('dotenv').config();

async function testS3Access() {
  try {
    console.log('🔧 Testing S3 Access...');
    
    // Initialize S3 client
    const s3 = new S3Client({
      region: process.env.AWS_REGION || 'ap-south-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    
    console.log('✅ S3 Client initialized');
    console.log('📊 Configuration:');
    console.log('- Region:', process.env.AWS_REGION || 'ap-south-1');
    console.log('- Bucket:', process.env.S3_BUCKET);
    console.log('- Access Key ID:', process.env.AWS_ACCESS_KEY_ID ? 'Set' : 'Not set');
    console.log('- Secret Access Key:', process.env.AWS_SECRET_ACCESS_KEY ? 'Set' : 'Not set');
    
    // Test the specific S3 key from the course
    const s3Key = 'images/course/1755630976776_BANNER_SQUARE.png';
    
    console.log(`\n🔍 Testing S3 key: ${s3Key}`);
    
    // Try to get object metadata first (faster than downloading)
    const headParams = {
      Bucket: process.env.S3_BUCKET,
      Key: s3Key,
    };
    
    try {
      const headCommand = new HeadObjectCommand(headParams);
      const headResponse = await s3.send(headCommand);
      
      console.log('✅ Object exists in S3!');
      console.log('📊 Object metadata:');
      console.log('- Content Type:', headResponse.ContentType);
      console.log('- Content Length:', headResponse.ContentLength);
      console.log('- Last Modified:', headResponse.LastModified);
      console.log('- ETag:', headResponse.ETag);
      
      // Try to get the actual object
      console.log('\n🔄 Attempting to download object...');
      const getParams = {
        Bucket: process.env.S3_BUCKET,
        Key: s3Key,
      };
      
      const getCommand = new GetObjectCommand(getParams);
      const getResponse = await s3.send(getCommand);
      
      console.log('✅ Object downloaded successfully!');
      console.log('📊 Download info:');
      console.log('- Content Type:', getResponse.ContentType);
      console.log('- Content Length:', getResponse.ContentLength);
      
    } catch (s3Error) {
      console.error('❌ S3 Error:', s3Error.name);
      console.error('📋 Error details:', s3Error.message);
      
      if (s3Error.name === 'NoSuchKey') {
        console.log('🔍 The file does not exist in S3');
      } else if (s3Error.name === 'AccessDenied') {
        console.log('🔒 Access denied - check S3 permissions');
      } else if (s3Error.name === 'NoSuchBucket') {
        console.log('🪣 Bucket does not exist');
      }
    }
    
  } catch (error) {
    console.error('❌ General Error:', error);
  }
}

testS3Access();
