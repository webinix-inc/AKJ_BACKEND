# 🚨 AWS Deployment Image Loading Fix

## **Problem:** Images showing "Access Denied" after deploying to AWS EC2

---

## 🔍 **Root Causes Identified**

### 1. **Frontend URL Configuration Issues**
- Hardcoded URLs in `axios.js` and `imageUtils.js`
- Missing environment variables in production build
- Inconsistent URL patterns between local and production

### 2. **AWS Security Configuration**
- EC2 Security Group may not allow port 8890
- S3 bucket permissions may be restrictive
- CORS configuration missing production domain

### 3. **Environment Variables**
- `REACT_APP_IMAGE_URL` not set during build
- Production vs development URL mismatch

---

## ✅ **Complete Solution**

### **Step 1: Fix Frontend Configuration**

#### **A. Update `User/Wakad/src/api/axios.js`:**
```javascript
// BEFORE (hardcoded)
const baseURL = "https://lms-backend-724799456037.europe-west1.run.app/api/v1"

// AFTER (environment-based)
const baseURL = process.env.REACT_APP_API_URL || "https://lms-backend-724799456037.europe-west1.run.app/api/v1"
```

#### **B. Update `User/Wakad/src/utils/imageUtils.js`:**
```javascript
// BEFORE
const API_BASE_URL = process.env.REACT_APP_IMAGE_URL || 
  (isLocalhost ? 'https://lms-backend-724799456037.europe-west1.run.app' : 'http://localhost');

// AFTER (ensure port is included for production)
const API_BASE_URL = process.env.REACT_APP_IMAGE_URL || 
  (isLocalhost ? 'https://lms-backend-724799456037.europe-west1.run.app' : 'https://lms-backend-724799456037.europe-west1.run.app');
```

### **Step 2: Create Environment Files**

#### **A. Create `User/Wakad/.env.production`:**
```bash
# Production Environment Variables
REACT_APP_API_URL=https://lms-backend-724799456037.europe-west1.run.app/api/v1
REACT_APP_IMAGE_URL=https://lms-backend-724799456037.europe-west1.run.app
```

#### **B. Create `User/Wakad/.env.local` (for local development):**
```bash
# Local Development Environment Variables
REACT_APP_API_URL=https://lms-backend-724799456037.europe-west1.run.app/api/v1
REACT_APP_IMAGE_URL=https://lms-backend-724799456037.europe-west1.run.app
```

### **Step 3: AWS EC2 Security Group Configuration**

#### **Check EC2 Security Group Rules:**
```bash
# Required Inbound Rules:
Type: Custom TCP
Port: 8890
Source: 0.0.0.0/0 (or your specific IP ranges)
Description: Backend API and Image Streaming

Type: HTTP
Port: 80
Source: 0.0.0.0/0
Description: HTTP Traffic

Type: HTTPS
Port: 443
Source: 0.0.0.0/0
Description: HTTPS Traffic (if using SSL)
```

### **Step 4: Backend CORS Configuration**

#### **Update `backened_wakad/backened_wakad/server.js`:**

Add your production domain to `allowedOrigins` array:

```javascript
const allowedOrigins = [
  // ... existing origins ...
  
  // Add your production frontend domain
  "http://your-frontend-domain.com",
  "https://your-frontend-domain.com",
  
  // If serving from same domain
  "http://localhost",
  "https://lms.wakadeclasses.com",
  
  // Add any CDN or static hosting domains
];
```

### **Step 5: S3 Bucket CORS Configuration**

#### **Update S3 Bucket CORS Policy:**
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": [
      "http://localhost",
      "https://lms.wakadeclasses.com",
      "http://localhost:3000",
      "http://127.0.0.1:3000"
    ],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

### **Step 6: Build and Deploy Process**

#### **A. Build Frontend with Environment Variables:**
```bash
# Navigate to frontend directory
cd User/Wakad

# Install dependencies
npm install

# Build for production (this will use .env.production)
npm run build

# Verify environment variables are included
echo "Checking build for environment variables..."
grep -r "lms.wakadeclasses.com" build/ || echo "Environment variables not found in build!"
```

#### **B. Deploy Build Files:**
```bash
# Copy build files to your web server
# Example for nginx:
sudo cp -r build/* /var/www/html/

# Or if using Apache:
sudo cp -r build/* /var/www/html/

# Set proper permissions
sudo chown -R www-data:www-data /var/www/html/
sudo chmod -R 755 /var/www/html/
```

### **Step 7: Backend Environment Variables**

#### **Ensure Backend `.env` has correct values:**
```bash
# AWS Configuration
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=ap-south-1
S3_BUCKET=wakadclass

# API Configuration
API_BASE_URL=https://lms-backend-724799456037.europe-west1.run.app
PORT=8890

# Database
MONGO_URI=your_mongodb_connection_string
```

---

## 🔧 **Debugging Steps**

### **1. Test Backend Accessibility:**
```bash
# Test if backend is accessible
curl -I https://lms-backend-724799456037.europe-west1.run.app/api/v1/admin/banner

# Expected: HTTP/200 OK
```

### **2. Test Image Streaming:**
```bash
# Get a banner first
curl https://lms-backend-724799456037.europe-west1.run.app/api/v1/admin/banner

# Test image streaming with banner ID
curl -I https://lms-backend-724799456037.europe-west1.run.app/api/v1/stream/banner-image/BANNER_ID_HERE

# Expected: HTTP/200 OK with image content-type
```

### **3. Check Browser Developer Tools:**
```javascript
// In browser console, check:
console.log('API Base URL:', process.env.REACT_APP_API_URL);
console.log('Image Base URL:', process.env.REACT_APP_IMAGE_URL);

// Check network requests for failed image loads
// Look for 403 Forbidden or CORS errors
```

### **4. Test CORS:**
```bash
# Test CORS preflight
curl -X OPTIONS \
  -H "Origin: http://your-frontend-domain.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type" \
  https://lms-backend-724799456037.europe-west1.run.app/api/v1/admin/banner

# Expected: CORS headers in response
```

---

## 🚨 **Common Issues & Solutions**

### **Issue 1: "Mixed Content" Error**
**Problem:** HTTPS frontend trying to load HTTP images
**Solution:** Use HTTPS for backend or serve frontend over HTTP

### **Issue 2: Port 8890 Not Accessible**
**Problem:** EC2 security group blocking port
**Solution:** Add inbound rule for port 8890

### **Issue 3: S3 Access Denied**
**Problem:** S3 bucket permissions too restrictive
**Solution:** Update bucket policy and IAM permissions

### **Issue 4: Environment Variables Not Working**
**Problem:** Variables not available in production build
**Solution:** Ensure `.env.production` exists and `REACT_APP_` prefix is used

### **Issue 5: CORS Errors**
**Problem:** Frontend domain not in allowedOrigins
**Solution:** Add production domain to CORS configuration

---

## ✅ **Verification Checklist**

- [ ] Frontend environment variables set correctly
- [ ] Backend accessible on port 8890
- [ ] EC2 security group allows port 8890
- [ ] S3 bucket CORS configured
- [ ] Backend CORS includes production domain
- [ ] Build process includes environment variables
- [ ] Image streaming endpoints return 200 OK
- [ ] Browser developer tools show no CORS errors
- [ ] Images load correctly in production

---

## 📞 **Quick Fix Commands**

```bash
# 1. Fix frontend URLs (run in User/Wakad/)
echo "REACT_APP_API_URL=https://lms-backend-724799456037.europe-west1.run.app/api/v1" > .env.production
echo "REACT_APP_IMAGE_URL=https://lms-backend-724799456037.europe-west1.run.app" >> .env.production

# 2. Rebuild frontend
npm run build

# 3. Test backend
curl https://lms-backend-724799456037.europe-west1.run.app/api/v1/admin/banner

# 4. Test image streaming
curl -I https://lms-backend-724799456037.europe-west1.run.app/api/v1/stream/banner-image/BANNER_ID
```

---

## 🎯 **Expected Result**

After implementing these fixes:
- ✅ Images should load correctly in production
- ✅ No "Access Denied" errors
- ✅ Proper CORS headers
- ✅ Environment variables working
- ✅ Both local and production environments functional

---

**Need Help?** Check the browser developer tools Network tab for specific error messages and status codes.
