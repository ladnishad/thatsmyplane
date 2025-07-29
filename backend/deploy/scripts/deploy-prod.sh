#!/bin/bash

# Production deployment script
set -e

echo "🚀 Starting production deployment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Navigate to prod deployment directory
cd "$(dirname "$0")/../prod"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found in deploy/prod/"
    echo "📋 Please create .env from .env.example with your production configuration"
    echo "⚠️  This file should contain secure production values!"
    exit 1
fi

# Validate critical environment variables
echo "🔍 Validating environment configuration..."

source .env

if [ -z "$JWT_SECRET" ] || [ ${#JWT_SECRET} -lt 32 ]; then
    echo "❌ JWT_SECRET is missing or too short (minimum 32 characters)"
    exit 1
fi

if [ -z "$MONGO_ROOT_PASSWORD" ] || [ ${#MONGO_ROOT_PASSWORD} -lt 12 ]; then
    echo "❌ MONGO_ROOT_PASSWORD is missing or too short (minimum 12 characters)"
    exit 1
fi

if [ -z "$FLIGHTAWARE_API_KEY" ]; then
    echo "⚠️  FLIGHTAWARE_API_KEY is not set"
fi

if [ -z "$FRONTEND_URL" ]; then
    echo "⚠️  FRONTEND_URL is not set"
fi

echo "✅ Environment validation passed"

# Create SSL directory if it doesn't exist
mkdir -p config/ssl

# Check for SSL certificates
if [ ! -f "config/ssl/cert.pem" ] || [ ! -f "config/ssl/private-key.pem" ]; then
    echo "⚠️  SSL certificates not found in config/ssl/"
    echo "🔧 For development, you can create self-signed certificates:"
    echo "   openssl req -x509 -nodes -days 365 -newkey rsa:2048 \\"
    echo "     -keyout config/ssl/private-key.pem \\"
    echo "     -out config/ssl/cert.pem"
    echo ""
    echo "📋 For production, use certificates from a trusted CA"
    echo "🚀 Continuing without HTTPS..."
fi

echo "📦 Building and starting production containers..."

# Create backup of current deployment
if docker-compose ps | grep -q "Up"; then
    echo "💾 Creating backup of current deployment..."
    docker-compose exec -T mongodb-prod mongodump --out /tmp/backup-$(date +%Y%m%d-%H%M%S) || true
fi

# Stop existing containers
docker-compose down --remove-orphans

# Build and start services
docker-compose up -d --build

echo "⏳ Waiting for services to be ready..."
sleep 30

# Check service health
echo "🏥 Checking service health..."

# Check backend health
max_attempts=30
attempt=1
while [ $attempt -le $max_attempts ]; do
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        echo "✅ Backend is healthy at http://localhost:3000"
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
    docker-compose logs backend-prod
    exit 1
fi

# Check MongoDB
if docker-compose exec -T mongodb-prod mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
    echo "✅ MongoDB is healthy"
else
    echo "⚠️  MongoDB health check failed"
fi

# Check Redis
if docker-compose exec -T redis-prod redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is healthy"
else
    echo "⚠️  Redis health check failed"
fi

# Check Nginx (if SSL certs are present)
if [ -f "config/ssl/cert.pem" ] && [ -f "config/ssl/private-key.pem" ]; then
    if curl -f -k https://localhost/health > /dev/null 2>&1; then
        echo "✅ Nginx HTTPS is healthy"
    else
        echo "⚠️  Nginx HTTPS health check failed"
    fi
fi

echo ""
echo "🎉 Production environment is ready!"
echo ""
echo "📋 Service URLs:"
echo "   Backend:      http://localhost:3000"
echo "   Health Check: http://localhost:3000/health"
if [ -f "config/ssl/cert.pem" ]; then
    echo "   HTTPS:        https://localhost"
fi
echo "   MongoDB:      localhost:27017"
echo "   Redis:        localhost:6379"
echo ""
echo "📝 Useful commands:"
echo "   View logs:    docker-compose logs -f"
echo "   Stop:         docker-compose down"
echo "   Backup DB:    ./backup-db.sh"
echo "   Monitor:      docker stats"
echo ""
echo "🔒 Security reminders:"
echo "   - Change default passwords"
echo "   - Configure firewall rules"
echo "   - Set up SSL certificates"
echo "   - Enable monitoring"
echo "   - Configure backups"