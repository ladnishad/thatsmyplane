#!/bin/bash

# DigitalOcean Droplet Setup Script
# Run this script as root on a fresh Ubuntu 22.04 droplet

set -e

echo "🚀 Starting DigitalOcean droplet setup for ThatMyPlane backend..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Please run this script as root${NC}"
    exit 1
fi

# Update system
echo -e "${YELLOW}📦 Updating system packages...${NC}"
apt update && apt upgrade -y
apt autoremove -y

# Install essential packages
echo -e "${YELLOW}📦 Installing essential packages...${NC}"
apt install -y \
    curl \
    wget \
    git \
    unzip \
    htop \
    tree \
    fail2ban \
    ufw \
    nginx \
    certbot \
    python3-certbot-nginx \
    rsyslog \
    logrotate \
    prometheus-node-exporter \
    unattended-upgrades \
    aide \
    logwatch

# Create deploy user
echo -e "${YELLOW}👤 Creating deploy user...${NC}"
if ! id "deploy" &>/dev/null; then
    adduser --disabled-password --gecos "" deploy
    usermod -aG sudo deploy
    echo -e "${GREEN}✅ Deploy user created${NC}"
else
    echo -e "${YELLOW}⚠️  Deploy user already exists${NC}"
fi

# Setup SSH directory for deploy user
mkdir -p /home/deploy/.ssh
if [ -f ~/.ssh/authorized_keys ]; then
    cp ~/.ssh/authorized_keys /home/deploy/.ssh/
    chown -R deploy:deploy /home/deploy/.ssh
    chmod 700 /home/deploy/.ssh
    chmod 600 /home/deploy/.ssh/authorized_keys
    echo -e "${GREEN}✅ SSH keys copied to deploy user${NC}"
fi

# Configure SSH security
echo -e "${YELLOW}🔒 Configuring SSH security...${NC}"
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup

cat > /etc/ssh/sshd_config << 'EOF'
Port 22022
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
Protocol 2
X11Forwarding no
AllowUsers deploy
EOF

systemctl restart ssh
echo -e "${GREEN}✅ SSH configured (Port changed to 22022)${NC}"

# Configure fail2ban
echo -e "${YELLOW}🛡️  Configuring Fail2Ban...${NC}"
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = 22022
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
EOF

systemctl enable fail2ban
systemctl start fail2ban
echo -e "${GREEN}✅ Fail2Ban configured${NC}"

# Configure UFW firewall
echo -e "${YELLOW}🔥 Configuring UFW firewall...${NC}"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# Allow essential ports
ufw allow 22022/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 3001/tcp comment 'Backend Dev'
ufw allow 9090/tcp comment 'Prometheus'
ufw allow 3000/tcp comment 'Grafana'

ufw --force enable
echo -e "${GREEN}✅ Firewall configured${NC}"

# Install Docker
echo -e "${YELLOW}🐳 Installing Docker...${NC}"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    usermod -aG docker deploy
    echo -e "${GREEN}✅ Docker installed${NC}"
else
    echo -e "${YELLOW}⚠️  Docker already installed${NC}"
fi

# Install Docker Compose
echo -e "${YELLOW}🐳 Installing Docker Compose...${NC}"
if ! command -v docker-compose &> /dev/null; then
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    echo -e "${GREEN}✅ Docker Compose installed${NC}"
else
    echo -e "${YELLOW}⚠️  Docker Compose already installed${NC}"
fi

# Configure automatic security updates
echo -e "${YELLOW}🔄 Configuring automatic security updates...${NC}"
echo 'Unattended-Upgrade::Automatic-Reboot "false";' >> /etc/apt/apt.conf.d/50unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

# Initialize AIDE
echo -e "${YELLOW}🔍 Initializing AIDE intrusion detection...${NC}"
aideinit
mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db

# Setup log rotation for application
cat > /etc/logrotate.d/thatsmyplane << 'EOF'
/home/deploy/thatsmyplane/backend/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 deploy deploy
}
EOF

# Create deployment directories
echo -e "${YELLOW}📁 Creating deployment directories...${NC}"
sudo -u deploy mkdir -p /home/deploy/backups
sudo -u deploy mkdir -p /home/deploy/monitoring
sudo -u deploy mkdir -p /home/deploy/scripts

# Create backup script
echo -e "${YELLOW}💾 Creating backup script...${NC}"
cat > /home/deploy/scripts/backup.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/home/deploy/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup application logs
if [ -d "/home/deploy/thatsmyplane/backend/logs" ]; then
    tar -czf $BACKUP_DIR/logs_$DATE.tar.gz /home/deploy/thatsmyplane/backend/logs
fi

# Backup Redis data (if running)
if docker ps | grep -q redis-dev; then
    docker exec redis-dev redis-cli BGSAVE
fi

# Cleanup old backups (keep 7 days)
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

chown deploy:deploy /home/deploy/scripts/backup.sh
chmod +x /home/deploy/scripts/backup.sh

# Schedule daily backups
sudo -u deploy crontab -l 2>/dev/null | { cat; echo "0 2 * * * /home/deploy/scripts/backup.sh"; } | sudo -u deploy crontab -

# Create system monitoring script
cat > /home/deploy/scripts/system-check.sh << 'EOF'
#!/bin/bash

echo "=== System Health Check ==="
echo "Date: $(date)"
echo "Uptime: $(uptime)"
echo "Memory Usage:"
free -h
echo "Disk Usage:"
df -h
echo "Docker Status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo "Last 10 log entries:"
tail -10 /var/log/auth.log | grep -E "(Failed|Accepted)"
EOF

chown deploy:deploy /home/deploy/scripts/system-check.sh
chmod +x /home/deploy/scripts/system-check.sh

# Disable unnecessary services
echo -e "${YELLOW}🚫 Disabling unnecessary services...${NC}"
systemctl disable snapd.service 2>/dev/null || true
systemctl disable cups 2>/dev/null || true
systemctl disable avahi-daemon 2>/dev/null || true
systemctl disable bluetooth 2>/dev/null || true

# Create monitoring docker-compose
echo -e "${YELLOW}📊 Setting up monitoring stack...${NC}"
cat > /home/deploy/monitoring/docker-compose.yml << 'EOF'
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--web.enable-lifecycle'
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - "3000:3000"
    volumes:
      - grafana_data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin123!@#
    restart: unless-stopped

  node-exporter:
    image: prom/node-exporter:latest
    container_name: node-exporter
    ports:
      - "9100:9100"
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--collector.filesystem.ignored-mount-points=^/(sys|proc|dev|host|etc)($$|/)'
    restart: unless-stopped

volumes:
  prometheus_data:
  grafana_data:
EOF

cat > /home/deploy/monitoring/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']

  - job_name: 'backend'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/health'
EOF

chown -R deploy:deploy /home/deploy/monitoring

echo -e "${GREEN}🎉 DigitalOcean droplet setup completed!${NC}"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo "1. SSH to server using: ssh -p 22022 deploy@YOUR_DROPLET_IP"
echo "2. Clone your repository: git clone https://github.com/yourusername/thatsmyplane.git"
echo "3. Configure environment variables in deploy/dev/.env"
echo "4. Run deployment: ./deploy/scripts/deploy-dev.sh"
echo "5. Set up SSL certificate: certbot --nginx -d dev-api.thatsmyplane.com"
echo "6. Start monitoring: cd ~/monitoring && docker-compose up -d"
echo ""
echo -e "${YELLOW}🔒 Security Notes:${NC}"
echo "• SSH port changed to 22022"
echo "• Root login disabled"
echo "• Firewall configured"
echo "• Fail2Ban enabled"
echo "• Automatic security updates enabled"
echo ""
echo -e "${YELLOW}📊 Monitoring URLs (after starting):${NC}"
echo "• Grafana: http://YOUR_DROPLET_IP:3000 (admin/admin123!@#)"
echo "• Prometheus: http://YOUR_DROPLET_IP:9090"
echo "• Application: https://dev-api.thatsmyplane.com/health"