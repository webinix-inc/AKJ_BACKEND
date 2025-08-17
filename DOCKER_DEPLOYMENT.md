# 🐳 Docker Deployment Guide - AKJ Academy Backend

This guide provides comprehensive instructions for deploying the AKJ Academy Backend using Docker.

## 📋 Prerequisites

- **Docker** (version 20.10+)
- **Docker Compose** (version 2.0+)
- **Git** (for cloning the repository)
- **Environment variables** configured

## 🚀 Quick Start

### 1. Clone and Setup
```bash
git clone https://github.com/NexFutrr-Solutions/LMS-Backend.git
cd LMS-Backend
cp .env.example .env
# Edit .env with your actual configuration values
```

### 2. Deploy with Docker Compose (Recommended)
```bash
# Make deployment script executable
chmod +x docker-deploy.sh

# Deploy with Docker Compose
./docker-deploy.sh --compose
```

### 3. Deploy Standalone Container
```bash
# Deploy standalone container
./docker-deploy.sh --standalone
```

## 📁 Docker Files Overview

### `Dockerfile`
- **Multi-stage build** for optimized production image
- **Alpine Linux** base for minimal size
- **Non-root user** for security
- **Health checks** built-in
- **Production optimizations**

### `docker-compose.yml`
- **Complete stack** with Redis
- **Volume management** for persistent data
- **Network isolation**
- **Resource limits**
- **Health checks**
- **Optional Nginx** reverse proxy

### `.dockerignore`
- Excludes unnecessary files from Docker context
- Reduces build time and image size
- Improves security

## 🔧 Configuration

### Environment Variables

Create a `.env` file with the following variables:

```bash
# Application
NODE_ENV=production
PORT=4442

# Database
DB_URL=mongodb://your-mongodb-connection-string

# AWS Configuration
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=your-region
AWS_BUCKET_NAME=your-bucket-name

# Redis
REDIS_URL=redis://redis:6379

# JWT
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=7d

# Payment Gateway
RAZORPAY_KEY_ID=your-razorpay-key
RAZORPAY_KEY_SECRET=your-razorpay-secret

# SMS Configuration
MSG91_AUTH_KEY=your-msg91-key
MSG91_TEMPLATE_ID=your-template-id

# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email

# MeritHub
MERITHUB_API_KEY=your-api-key
MERITHUB_BASE_URL=your-base-url
```

## 🚀 Deployment Options

### Option 1: Docker Compose (Full Stack)

**Includes:** Application + Redis + Optional Nginx

```bash
# Deploy full stack
docker-compose up -d

# With build
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

### Option 2: Standalone Container

**For:** Existing infrastructure with external Redis/Database

```bash
# Build image
docker build -t akj-academy-backend .

# Run container
docker run -d \
  --name akj-academy-backend \
  --restart unless-stopped \
  -p 4442:4442 \
  --env-file .env \
  -v akj_uploads:/app/uploads \
  -v akj_logs:/app/LogFile \
  akj-academy-backend
```

### Option 3: Using Deployment Script

```bash
# Make executable
chmod +x docker-deploy.sh

# Deploy with Docker Compose
./docker-deploy.sh --compose

# Deploy standalone
./docker-deploy.sh --standalone

# Help
./docker-deploy.sh --help
```

## 🏥 Health Checks

The application includes built-in health checks:

```bash
# Check application health
curl http://localhost:4442/health

# Docker health check
docker ps  # Shows health status

# Detailed health info
curl -s http://localhost:4442/health | jq
```

**Health Check Response:**
```json
{
  "uptime": 3600,
  "message": "OK",
  "timestamp": "2025-01-17T12:00:00.000Z",
  "status": "healthy",
  "version": "1.0.0",
  "environment": "production",
  "memory": {
    "used": "45 MB",
    "total": "128 MB"
  }
}
```

## 📊 Monitoring and Logs

### View Logs
```bash
# Docker Compose
docker-compose logs -f akj-backend

# Standalone
docker logs -f akj-academy-backend

# Specific service
docker-compose logs -f redis
```

### Monitor Resources
```bash
# Container stats
docker stats akj-academy-backend

# System info
docker system df
docker system prune  # Clean up unused resources
```

## 🔄 Updates and Maintenance

### Update Application
```bash
# Pull latest code
git pull origin main

# Rebuild and deploy
docker-compose up -d --build

# Or using script
./docker-deploy.sh --compose
```

### Backup Data
```bash
# Backup volumes
docker run --rm -v akj_uploads:/data -v $(pwd):/backup alpine tar czf /backup/uploads-backup.tar.gz -C /data .
docker run --rm -v akj_logs:/data -v $(pwd):/backup alpine tar czf /backup/logs-backup.tar.gz -C /data .
```

### Restore Data
```bash
# Restore volumes
docker run --rm -v akj_uploads:/data -v $(pwd):/backup alpine tar xzf /backup/uploads-backup.tar.gz -C /data
docker run --rm -v akj_logs:/data -v $(pwd):/backup alpine tar xzf /backup/logs-backup.tar.gz -C /data
```

## 🛠️ Troubleshooting

### Common Issues

#### 1. Container Won't Start
```bash
# Check logs
docker logs akj-academy-backend

# Check environment variables
docker exec akj-academy-backend env

# Verify image
docker images | grep akj-academy-backend
```

#### 2. Health Check Failing
```bash
# Test health endpoint
curl -v http://localhost:4442/health

# Check container status
docker ps -a

# Inspect container
docker inspect akj-academy-backend
```

#### 3. Permission Issues
```bash
# Check volume permissions
docker exec akj-academy-backend ls -la /app/uploads

# Fix permissions (if needed)
docker exec -u root akj-academy-backend chown -R nodejs:nodejs /app/uploads
```

#### 4. Memory Issues
```bash
# Check memory usage
docker stats --no-stream

# Increase memory limits in docker-compose.yml
# Or use --memory flag for standalone containers
```

### Debug Mode
```bash
# Run with debug output
docker run -it --rm \
  --env-file .env \
  -e DEBUG=* \
  akj-academy-backend npm run dev
```

## 🔒 Security Best Practices

### Image Security
- ✅ **Non-root user** (nodejs:nodejs)
- ✅ **Alpine Linux** base (minimal attack surface)
- ✅ **Multi-stage build** (no build tools in final image)
- ✅ **Specific versions** (no latest tags)

### Runtime Security
- ✅ **Read-only filesystem** where possible
- ✅ **Resource limits** configured
- ✅ **Network isolation**
- ✅ **Secret management** via environment variables

### Network Security
```bash
# Custom network with isolation
docker network create --driver bridge akj-network

# Run with custom network
docker run --network akj-network ...
```

## 📈 Performance Optimization

### Resource Limits
```yaml
# In docker-compose.yml
deploy:
  resources:
    limits:
      memory: 1G
      cpus: '1.0'
    reservations:
      memory: 512M
      cpus: '0.5'
```

### Volume Optimization
```bash
# Use named volumes for better performance
volumes:
  uploads_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /opt/akj-academy/uploads
```

## 🌐 Production Deployment

### With Load Balancer
```bash
# Scale services
docker-compose up -d --scale akj-backend=3

# Use external load balancer (Nginx, HAProxy, etc.)
```

### With Orchestration
```bash
# Docker Swarm
docker stack deploy -c docker-compose.yml akj-academy

# Kubernetes
# Convert docker-compose to k8s manifests
kompose convert
kubectl apply -f .
```

## 📞 Support

For issues and support:
- **GitHub Issues:** [Create an issue](https://github.com/NexFutrr-Solutions/LMS-Backend/issues)
- **Documentation:** Check this guide and `PRODUCTION_DEPLOYMENT.md`
- **Logs:** Always include relevant logs when reporting issues

## 🎯 Quick Commands Reference

```bash
# Build and run
docker-compose up -d --build

# View logs
docker-compose logs -f

# Scale services
docker-compose up -d --scale akj-backend=2

# Stop services
docker-compose down

# Clean up
docker system prune -a

# Health check
curl http://localhost:4442/health

# Container shell
docker exec -it akj-academy-backend sh

# Update and restart
git pull && docker-compose up -d --build
```

---

**🎉 Your AKJ Academy Backend is now ready for Docker deployment!**

