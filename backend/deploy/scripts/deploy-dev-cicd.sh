#!/bin/bash

# CI/CD Development deployment script using pre-built Docker images
set -e

echo "🚀 Starting CI/CD development deployment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Navigate to dev deployment directory
cd "$(dirname "$0")/../dev"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found in deploy/dev/"
    echo "📋 Please create .env file with your configuration"
    exit 1
fi

echo "🔑 Loading environment variables..."
source .env

# Login to GitHub Container Registry
echo "🔐 Logging in to GitHub Container Registry..."
if [ -n "$GITHUB_TOKEN" ]; then
    echo $GITHUB_TOKEN | docker login ghcr.io -u ladnishad --password-stdin
else
    echo "⚠️  GITHUB_TOKEN not set. Using existing docker login..."
fi

# Set image tag (default to latest)
IMAGE_TAG=${IMAGE_TAG:-latest}
echo "📦 Using image tag: $IMAGE_TAG"

# Pull latest images
echo "📥 Pulling latest Docker images..."
export IMAGE_TAG=$IMAGE_TAG
docker-compose pull

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose down --remove-orphans

# Start services with new images
echo "🚀 Starting services with new images..."
docker-compose up -d

echo "⏳ Waiting for services to be ready..."
sleep 15

# Check service health
echo "🏥 Checking service health..."

# Check backend health
max_attempts=30
attempt=1
while [ $attempt -le $max_attempts ]; do
    if curl -f http://localhost:3001/health > /dev/null 2>&1; then
        echo "✅ Backend is healthy at http://${SERVER_IP:-localhost}:3001"
        break
    else
        echo "⏳ Waiting for backend... (attempt $attempt/$max_attempts)"
        sleep 5
        ((attempt++))
    fi
done

if [ $attempt -gt $max_attempts ]; then
    echo "❌ Backend health check failed after $max_attempts attempts"
    echo "📋 Checking logs..."
    docker-compose logs backend-dev
    exit 1
fi

# Check Redis
if docker-compose exec -T redis-dev redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is healthy"
else
    echo "⚠️  Redis health check failed"
fi

# Clean up old images
echo "🧹 Cleaning up old Docker images..."
docker image prune -f

# Show running containers
echo "📊 Current container status:"
docker-compose ps

echo ""
echo "🎉 CI/CD development deployment completed successfully!"
echo ""
echo "📋 Service URLs:"
echo "   Backend:       http://${SERVER_IP:-localhost}:3001"
echo "   Health Check:  http://${SERVER_IP:-localhost}:3001/health"
echo "   Redis:         ${SERVER_IP:-localhost}:6380"
echo ""
echo "📝 Useful commands:"
echo "   View logs:     docker-compose logs -f"
echo "   Stop services: docker-compose down"
echo "   Pull updates:  docker-compose pull && docker-compose up -d"
echo ""
echo "🔄 Next deployment will happen automatically on code push to main branch!"