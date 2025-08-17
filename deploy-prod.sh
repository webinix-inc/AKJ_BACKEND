#!/bin/bash

# 🚀 Production Deployment Script for AKJ Academy Backend
# This script handles the ENOTEMPTY error and ensures clean deployment

echo "🚀 Starting Production Deployment..."

# Set production environment
export NODE_ENV=production

# 1. Stop any running Node.js processes
echo "🛑 Stopping existing Node.js processes..."
pkill -f "node server.js" || true
pkill -f "nodemon" || true

# 2. Clean up node_modules completely to fix ENOTEMPTY error
echo "🧹 Cleaning up node_modules..."
if [ -d "node_modules" ]; then
    echo "   Removing existing node_modules..."
    rm -rf node_modules
fi

if [ -f "package-lock.json" ]; then
    echo "   Removing package-lock.json..."
    rm -f package-lock.json
fi

# 3. Clear npm cache
echo "🗑️ Clearing npm cache..."
npm cache clean --force

# 4. Install production dependencies only
echo "📦 Installing production dependencies..."
npm install --only=production --no-optional --force

# 5. Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p uploads/assignments
mkdir -p LogFile
mkdir -p uploads/temp

# 6. Set proper permissions
echo "🔐 Setting proper permissions..."
chmod -R 755 .
chmod +x server.js

# 7. Start the application
echo "🚀 Starting application in production mode..."
npm run prod

echo "✅ Deployment completed successfully!"
