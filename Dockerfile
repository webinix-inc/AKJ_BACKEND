# 🚀 AKJ Academy Backend - Production Dockerfile
# Multi-stage build for optimized production image

# ==========================================
# Stage 1: Build Stage
# ==========================================
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci --only=production && npm cache clean --force

# ==========================================
# Stage 2: Production Stage
# ==========================================
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force && \
    rm -rf /tmp/*

# Copy application code
COPY --chown=nodejs:nodejs . .

# Create necessary directories with proper permissions
RUN mkdir -p uploads/assignments LogFile && \
    chown -R nodejs:nodejs uploads LogFile

# Remove development files and unnecessary directories
RUN rm -rf \
    .git \
    .gitignore \
    README.md \
    PRODUCTION_DEPLOYMENT.md \
    deploy-prod.sh \
    ecosystem.config.js \
    Dockerfile \
    .dockerignore \
    node_modules/.cache \
    npm-debug.log* \
    yarn-debug.log* \
    yarn-error.log*

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 4442

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4442/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "server.js"]

# ==========================================
# Build Arguments and Labels
# ==========================================
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION

LABEL maintainer="AKJ Academy <support@akjacademy.com>" \
      org.label-schema.build-date=$BUILD_DATE \
      org.label-schema.name="akj-academy-backend" \
      org.label-schema.description="AKJ Academy Learning Management System Backend" \
      org.label-schema.url="https://akjacademy.com" \
      org.label-schema.vcs-ref=$VCS_REF \
      org.label-schema.vcs-url="https://github.com/NexFutrr-Solutions/LMS-Backend" \
      org.label-schema.vendor="AKJ Academy" \
      org.label-schema.version=$VERSION \
      org.label-schema.schema-version="1.0"

