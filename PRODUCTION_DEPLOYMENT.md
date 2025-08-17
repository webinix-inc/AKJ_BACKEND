# 🚀 Production Deployment Guide

## Quick Fix for Current Error

The `ENOTEMPTY` error you're seeing is caused by:
1. Using `nodemon` in production (wrong!)
2. Incomplete node_modules cleanup
3. File permission issues

## 🔧 Immediate Fix

### Option 1: Manual Fix (SSH into your server)
```bash
# 1. Stop the application
pkill -f "node server.js"
pkill -f "nodemon"

# 2. Clean everything
rm -rf node_modules
rm -f package-lock.json
npm cache clean --force

# 3. Install production dependencies
npm install --only=production

# 4. Start with correct command
npm start
```

### Option 2: Use the deployment script
```bash
# Make script executable
chmod +x deploy-prod.sh

# Run deployment
./deploy-prod.sh
```

## 🚀 Recommended: Use PM2 for Production

### Install PM2 globally on your server:
```bash
npm install -g pm2
```

### Deploy with PM2:
```bash
# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### PM2 Commands:
```bash
pm2 status          # Check status
pm2 logs            # View logs
pm2 restart all     # Restart application
pm2 stop all        # Stop application
pm2 delete all      # Delete application
```

## 📋 Production Checklist

- ✅ Use `node server.js` instead of `nodemon`
- ✅ Set `NODE_ENV=production`
- ✅ Install only production dependencies
- ✅ Use PM2 for process management
- ✅ Set up proper logging
- ✅ Configure auto-restart on crashes
- ✅ Monitor memory usage

## 🔍 Troubleshooting

### If you still get ENOTEMPTY error:
```bash
# Force remove with different method
sudo rm -rf node_modules
sudo rm -f package-lock.json
sudo npm cache clean --force
sudo npm install --only=production
```

### Check if port is in use:
```bash
lsof -i :4442
# Kill process if needed
kill -9 <PID>
```

## 🌟 Benefits of This Setup

- ✅ Proper production configuration
- ✅ Auto-restart on crashes
- ✅ Cluster mode for better performance
- ✅ Memory monitoring and restart
- ✅ Proper logging
- ✅ Zero-downtime deployments
