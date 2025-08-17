#!/bin/bash

# ==========================================
# AKJ Academy Backend - Docker Deployment Script
# ==========================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="akj-academy-backend"
CONTAINER_NAME="akj-academy-backend"
NETWORK_NAME="akj-network"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed and running
check_docker() {
    log_info "Checking Docker installation..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    
    log_success "Docker is installed and running"
}

# Check if .env file exists
check_env_file() {
    log_info "Checking environment configuration..."
    
    if [ ! -f ".env" ]; then
        log_warning ".env file not found. Creating from .env.example..."
        if [ -f ".env.example" ]; then
            cp .env.example .env
            log_warning "Please update .env file with your actual configuration values"
            read -p "Press Enter to continue after updating .env file..."
        else
            log_error ".env.example file not found. Please create .env file manually."
            exit 1
        fi
    fi
    
    log_success "Environment configuration found"
}

# Stop and remove existing containers
cleanup_existing() {
    log_info "Cleaning up existing containers..."
    
    # Stop container if running
    if docker ps -q -f name=$CONTAINER_NAME | grep -q .; then
        log_info "Stopping existing container..."
        docker stop $CONTAINER_NAME
    fi
    
    # Remove container if exists
    if docker ps -aq -f name=$CONTAINER_NAME | grep -q .; then
        log_info "Removing existing container..."
        docker rm $CONTAINER_NAME
    fi
    
    # Remove old image if exists
    if docker images -q $IMAGE_NAME | grep -q .; then
        log_info "Removing old image..."
        docker rmi $IMAGE_NAME || true
    fi
    
    log_success "Cleanup completed"
}

# Build Docker image
build_image() {
    log_info "Building Docker image..."
    
    # Get build information
    BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
    VCS_REF=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    VERSION=$(grep '"version"' package.json | cut -d'"' -f4 || echo "1.0.0")
    
    docker build \
        --build-arg BUILD_DATE="$BUILD_DATE" \
        --build-arg VCS_REF="$VCS_REF" \
        --build-arg VERSION="$VERSION" \
        -t $IMAGE_NAME:latest \
        -t $IMAGE_NAME:$VERSION \
        .
    
    log_success "Docker image built successfully"
}

# Create network if it doesn't exist
create_network() {
    log_info "Creating Docker network..."
    
    if ! docker network ls | grep -q $NETWORK_NAME; then
        docker network create $NETWORK_NAME
        log_success "Network '$NETWORK_NAME' created"
    else
        log_info "Network '$NETWORK_NAME' already exists"
    fi
}

# Deploy with Docker Compose
deploy_compose() {
    log_info "Deploying with Docker Compose..."
    
    # Export environment variables for docker-compose
    export BUILD_DATE=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
    export VCS_REF=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    export VERSION=$(grep '"version"' package.json | cut -d'"' -f4 || echo "1.0.0")
    
    # Deploy
    docker-compose up -d --build
    
    log_success "Application deployed with Docker Compose"
}

# Deploy standalone container
deploy_standalone() {
    log_info "Deploying standalone container..."
    
    # Load environment variables
    set -a
    source .env
    set +a
    
    # Run container
    docker run -d \
        --name $CONTAINER_NAME \
        --network $NETWORK_NAME \
        --restart unless-stopped \
        -p ${PORT:-4442}:4442 \
        --env-file .env \
        -v akj_uploads:/app/uploads \
        -v akj_logs:/app/LogFile \
        $IMAGE_NAME:latest
    
    log_success "Container deployed successfully"
}

# Health check
health_check() {
    log_info "Performing health check..."
    
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f http://localhost:${PORT:-4442}/health &> /dev/null; then
            log_success "Application is healthy and responding"
            return 0
        fi
        
        log_info "Attempt $attempt/$max_attempts - Waiting for application to start..."
        sleep 5
        ((attempt++))
    done
    
    log_error "Health check failed - Application may not be running properly"
    return 1
}

# Show deployment information
show_info() {
    log_info "Deployment Information:"
    echo "=========================="
    echo "Image: $IMAGE_NAME:latest"
    echo "Container: $CONTAINER_NAME"
    echo "Network: $NETWORK_NAME"
    echo "Port: ${PORT:-4442}"
    echo "Health Check: http://localhost:${PORT:-4442}/health"
    echo ""
    echo "Useful Commands:"
    echo "- View logs: docker logs -f $CONTAINER_NAME"
    echo "- Stop: docker stop $CONTAINER_NAME"
    echo "- Start: docker start $CONTAINER_NAME"
    echo "- Remove: docker rm -f $CONTAINER_NAME"
    echo "=========================="
}

# Main deployment function
main() {
    log_info "🚀 Starting AKJ Academy Backend Docker Deployment"
    echo ""
    
    # Parse command line arguments
    DEPLOYMENT_TYPE="compose"  # Default to compose
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --standalone)
                DEPLOYMENT_TYPE="standalone"
                shift
                ;;
            --compose)
                DEPLOYMENT_TYPE="compose"
                shift
                ;;
            --help)
                echo "Usage: $0 [--standalone|--compose]"
                echo ""
                echo "Options:"
                echo "  --standalone    Deploy as standalone container"
                echo "  --compose       Deploy with Docker Compose (default)"
                echo "  --help          Show this help message"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Execute deployment steps
    check_docker
    check_env_file
    
    if [ "$DEPLOYMENT_TYPE" = "compose" ]; then
        deploy_compose
    else
        cleanup_existing
        build_image
        create_network
        deploy_standalone
    fi
    
    # Wait a moment for container to start
    sleep 10
    
    # Perform health check
    if health_check; then
        show_info
        log_success "🎉 Deployment completed successfully!"
    else
        log_error "❌ Deployment completed but health check failed"
        echo ""
        echo "Check logs with: docker logs $CONTAINER_NAME"
        exit 1
    fi
}

# Run main function
main "$@"

