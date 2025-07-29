#!/bin/bash

# Database backup script for production
set -e

# Configuration
BACKUP_DIR="/tmp/mongodb-backups"
DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="thatsmyplane-backup-$DATE"
RETENTION_DAYS=7

echo "📦 Starting database backup..."

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Navigate to prod deployment directory
cd "$(dirname "$0")/../prod"

# Check if production environment is running
if ! docker-compose ps | grep mongodb-prod | grep -q "Up"; then
    echo "❌ MongoDB production container is not running"
    exit 1
fi

echo "💾 Creating backup: $BACKUP_NAME"

# Create MongoDB dump
docker-compose exec -T mongodb-prod mongodump \
    --db thatsmyplane-prod \
    --out "/tmp/$BACKUP_NAME" \
    --gzip

# Copy backup from container to host
docker cp $(docker-compose ps -q mongodb-prod):/tmp/$BACKUP_NAME "$BACKUP_DIR/"

# Create compressed archive
cd "$BACKUP_DIR"
tar -czf "$BACKUP_NAME.tar.gz" "$BACKUP_NAME"
rm -rf "$BACKUP_NAME"

echo "✅ Backup created: $BACKUP_DIR/$BACKUP_NAME.tar.gz"

# Show backup size
BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_NAME.tar.gz" | cut -f1)
echo "📊 Backup size: $BACKUP_SIZE"

# Clean up old backups
echo "🧹 Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "thatsmyplane-backup-*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "📋 Available backups:"
ls -lh "$BACKUP_DIR"/thatsmyplane-backup-*.tar.gz

echo ""
echo "🎉 Backup completed successfully!"
echo ""
echo "💡 To restore from backup:"
echo "   1. Stop the application: docker-compose down"
echo "   2. Extract backup: tar -xzf $BACKUP_DIR/$BACKUP_NAME.tar.gz -C /tmp/"
echo "   3. Start MongoDB: docker-compose up -d mongodb-prod"
echo "   4. Restore: docker-compose exec mongodb-prod mongorestore /tmp/$BACKUP_NAME/thatsmyplane-prod"
echo "   5. Start application: docker-compose up -d"