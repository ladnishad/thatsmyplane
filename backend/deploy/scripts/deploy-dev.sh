#!/bin/bash

# Development deployment script
set -e

echo "🚀 Starting development deployment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Navigate to dev deployment directory
cd "$(dirname "$0")/../dev"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found in deploy/dev/"
    echo "📋 Creating .env from template..."
    cp .env .env.backup 2>/dev/null || true
    echo "✅ Please edit deploy/dev/.env with your configuration"
    echo "🔧 You can start with the provided development defaults"
fi

echo "📦 Building and starting development containers..."

# Stop existing containers
docker-compose down --remove-orphans

# Build and start services
docker-compose up -d --build

echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service health
echo "🏥 Checking service health..."

# Check backend health
if curl -f http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ Backend is healthy at http://localhost:3001"
else
    echo "❌ Backend health check failed"
    echo "📋 Checking logs..."
    docker-compose logs backend-dev
    exit 1
fi

# Check MongoDB
if docker-compose exec -T mongodb-dev mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
    echo "✅ MongoDB is healthy"
else
    echo "⚠️  MongoDB health check failed (may be normal during first startup)"
fi

# Check Redis
if docker-compose exec -T redis-dev redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is healthy"
else
    echo "⚠️  Redis health check failed"
fi

echo ""
echo "🎉 Development environment is ready!"
echo ""
echo "📋 Service URLs:"
echo "   Backend:       http://localhost:3001"
echo "   Health Check:  http://localhost:3001/health"
echo "   MongoDB:       localhost:27018"
echo "   Redis:         localhost:6380"
echo "   Mongo Express: http://localhost:8082"
echo ""
echo "📝 Useful commands:"
echo "   View logs:     docker-compose logs -f"
echo "   Stop services: docker-compose down"
echo "   Restart:       docker-compose restart"
echo ""
echo "💡 Update your mobile app API URL to: http://YOUR_IP:3001/api"