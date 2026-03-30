# Ubuntu Server Deployment Guide for Apache Superset (DHIS2 Integration)

Complete step-by-step guide to deploy this Superset project on Ubuntu Server without Docker.

## 📋 Table of Contents

1. [Server Requirements](#server-requirements)
2. [System Preparation](#system-preparation)
3. [Install System Dependencies](#install-system-dependencies)
4. [Install Python & Node.js](#install-python--nodejs)
5. [Clone Project from GitHub](#clone-project-from-github)
6. [Backend Setup (Python/Flask)](#backend-setup-pythonflask)
7. [Frontend Setup (React/Node.js)](#frontend-setup-reactnodejs)
8. [Database Configuration](#database-configuration)
9. [Initialize Superset](#initialize-superset)
10. [Run Backend Server](#run-backend-server)
11. [Run Frontend Development Server](#run-frontend-development-server)
12. [Production Deployment](#production-deployment)
13. [Systemd Services (Auto-start on Boot)](#systemd-services-auto-start-on-boot)
14. [Nginx Reverse Proxy Setup](#nginx-reverse-proxy-setup)
15. [Troubleshooting](#troubleshooting)

---

## Server Requirements

### Minimum Hardware Specs
- **CPU**: 2 cores (4+ recommended)
- **RAM**: 4GB (8GB+ recommended for production)
- **Storage**: 20GB free space (50GB+ for production)
- **Network**: Public IP or domain name for external access

### Operating System
- **Ubuntu Server 20.04 LTS** or **22.04 LTS** (recommended)
- Fresh installation preferred

### Network Ports Required
- `8088` - Superset backend (Flask)
- `9000` - Superset frontend (Webpack Dev Server for development)
- `80/443` - Nginx (for production with reverse proxy)
- `5432` - PostgreSQL (optional, if using PostgreSQL)

---

## System Preparation

### 1. Update System Packages

```bash
# Update package lists
sudo apt update

# Upgrade installed packages
sudo apt upgrade -y

# Install essential build tools
sudo apt install -y build-essential software-properties-common
```

### 2. Set System Locale (Important for Superset)

```bash
# Check current locale
locale

# If not set to UTF-8, configure it
sudo locale-gen en_US.UTF-8
sudo update-locale LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

# Verify
echo $LANG
# Should output: en_US.UTF-8
```

### 3. Create Dedicated User (Optional but Recommended)

```bash
# Create superset user
sudo adduser superset --disabled-password --gecos ""

# Add to sudo group (optional, for convenience)
sudo usermod -aG sudo superset

# Switch to superset user
sudo su - superset
```

---

## Install System Dependencies

### 1. Install Required Libraries

```bash
# Core dependencies for Superset
sudo apt install -y \
    python3-pip \
    python3-dev \
    python3-venv \
    libpq-dev \
    libssl-dev \
    libffi-dev \
    libsasl2-dev \
    libldap2-dev \
    libxml2-dev \
    libxslt1-dev \
    libjpeg-dev \
    zlib1g-dev \
    pkg-config

# Database drivers (choose based on your DB)
# PostgreSQL
sudo apt install -y libpq-dev postgresql-client

# MySQL (if using MySQL instead)
# sudo apt install -y libmysqlclient-dev mysql-client

# Additional utilities
sudo apt install -y git curl wget unzip
```

---

## Install Python & Node.js

### 1. Install Python 3.10+

Ubuntu 22.04 comes with Python 3.10+ by default. For Ubuntu 20.04:

```bash
# Check Python version
python3 --version

# If < 3.10, install Python 3.10
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt update
sudo apt install -y python3.10 python3.10-dev python3.10-venv

# Make Python 3.10 the default
sudo update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.10 1

# Verify
python3 --version
# Should be 3.10 or higher
```

### 2. Install Node.js 18+

```bash
# Install Node.js 18 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installations
node --version   # Should be v18.x
npm --version    # Should be 9.x or higher

# Install global npm packages
sudo npm install -g npm@latest
```

---

## Clone Project from GitHub

### 1. Configure Git

```bash
# Set git config (use your details)
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### 2. Clone Repository

```bash
# Navigate to home directory
cd ~

# Clone your forked repository (replace with your GitHub URL)
git clone https://github.com/YOUR_USERNAME/malaria-superset.git

# Enter project directory
cd malaria-superset

# Verify you're on the correct branch
git branch
git status
```

---

## Backend Setup (Python/Flask)

### 1. Create Python Virtual Environment

```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Verify activation (prompt should show (venv))
which python
# Should point to: ~/malaria-superset/venv/bin/python
```

### 2. Upgrade pip and setuptools

```bash
# Upgrade pip
pip install --upgrade pip setuptools wheel
```

### 3. Install Python Dependencies

```bash
# Install base requirements
pip install -r requirements/base.txt

# Install development requirements (if doing development)
pip install -r requirements/development.txt

# Install production requirements (for production deployment)
# pip install -r requirements/production.txt

# This will take 10-15 minutes - be patient!
```

### 4. Install Superset in Editable Mode

```bash
# Install Superset from current directory
pip install -e .

# Verify installation
superset version
# Should output version number
```

---

## Frontend Setup (React/Node.js)

### 1. Navigate to Frontend Directory

```bash
cd ~/malaria-superset/superset-frontend
```

### 2. Install Node Dependencies

```bash
# Install npm packages (this takes 5-10 minutes)
npm install

# If you encounter permission errors, try:
# npm install --no-optional --legacy-peer-deps
```

### 3. Verify Frontend Setup

```bash
# Check that node_modules was created
ls -la node_modules | wc -l
# Should show hundreds of packages

# Return to project root
cd ~/malaria-superset
```

---

## Database Configuration

Superset requires a metadata database. PostgreSQL is recommended for production.

### Option 1: PostgreSQL (Recommended)

#### Install PostgreSQL

```bash
# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Check status
sudo systemctl status postgresql
```

#### Create Database and User

```bash
# Switch to postgres user
sudo -u postgres psql

# Inside PostgreSQL prompt, run:
CREATE DATABASE superset;
CREATE USER superset WITH PASSWORD 'your_secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE superset TO superset;
\q
```

#### Configure Connection String

```bash
# Create superset config file
cd ~/malaria-superset
mkdir -p ~/.superset

# Create config file
cat > ~/.superset/superset_config.py << 'EOF'
# Superset Configuration
import os

# Metadata database connection
SQLALCHEMY_DATABASE_URI = 'postgresql://superset:your_secure_password_here@localhost/superset'

# Secret key for session management (generate a random one)
SECRET_KEY = 'CHANGE_THIS_TO_A_RANDOM_STRING_AT_LEAST_42_CHARS_LONG'

# CSRF settings
WTF_CSRF_ENABLED = True
WTF_CSRF_TIME_LIMIT = None

# Enable file caching
CACHE_CONFIG = {
    'CACHE_TYPE': 'FileSystemCache',
    'CACHE_DIR': '/tmp/superset_cache',
    'CACHE_DEFAULT_TIMEOUT': 300
}

# Async query execution
RESULTS_BACKEND = {
    'CACHE_TYPE': 'FileSystemCache',
    'CACHE_DIR': '/tmp/superset_results',
    'CACHE_DEFAULT_TIMEOUT': 86400
}

# Feature flags (enable DHIS2 features)
FEATURE_FLAGS = {
    'ENABLE_TEMPLATE_PROCESSING': True,
}

# Increase upload limits for large datasets
ROW_LIMIT = 50000
SUPERSET_WEBSERVER_TIMEOUT = 300

# DHIS2-specific settings
ENABLE_CORS = True
EOF

# Generate a secure secret key
python3 << 'PYEOF'
import secrets
print(f"\nYour SECRET_KEY:\n{secrets.token_hex(32)}\n")
PYEOF

# Copy the output and replace SECRET_KEY in superset_config.py
nano ~/.superset/superset_config.py
# Update SECRET_KEY with the generated value
```

### Option 2: SQLite (Development Only)

```bash
# SQLite is the default - no setup needed
# Database will be created at: ~/.superset/superset.db
# NOT recommended for production!
```

---

## Initialize Superset

### 1. Set Environment Variables

```bash
# Add to ~/.bashrc for persistence
cat >> ~/.bashrc << 'EOF'

# Superset Environment
export SUPERSET_CONFIG_PATH=$HOME/.superset/superset_config.py
export FLASK_APP=superset
export SUPERSET_LOAD_EXAMPLES=no
export PYTHONPATH=$HOME/malaria-superset:$PYTHONPATH

# Activate virtual environment on login (optional)
if [ -f "$HOME/malaria-superset/venv/bin/activate" ]; then
    source "$HOME/malaria-superset/venv/bin/activate"
fi
EOF

# Load the changes
source ~/.bashrc
```

### 2. Initialize Database

```bash
# Ensure virtual environment is active
source ~/malaria-superset/venv/bin/activate

# Initialize Superset database
superset db upgrade

# Create admin user
superset fab create-admin \
    --username admin \
    --firstname Admin \
    --lastname User \
    --email admin@localhost \
    --password admin

# Initialize roles and permissions
superset init

# Load examples (optional, for testing)
# superset load-examples
```

---

## Run Backend Server

### Development Mode

```bash
# Activate virtual environment
source ~/malaria-superset/venv/bin/activate

# Navigate to project root
cd ~/malaria-superset

# Start backend server
superset run -p 8088 --with-threads --reload --debugger

# Server will be available at: http://your-server-ip:8088
# Default credentials: admin / admin
```

### Production Mode (using Gunicorn)

```bash
# Install gunicorn
pip install gunicorn

# Run with gunicorn
gunicorn \
    --bind 0.0.0.0:8088 \
    --workers 4 \
    --worker-class gthread \
    --threads 2 \
    --timeout 300 \
    --limit-request-line 0 \
    --limit-request-field_size 0 \
    "superset.app:create_app()"
```

---

## Run Frontend Development Server

**Open a new terminal/SSH session** (keep backend running in the first one)

```bash
# SSH into server (new session)
ssh user@your-server-ip

# Switch to superset user (if using dedicated user)
sudo su - superset

# Navigate to frontend directory
cd ~/malaria-superset/superset-frontend

# Start frontend dev server
npm run dev

# Frontend will be available at: http://your-server-ip:9000
# It will proxy API requests to backend on :8088
```

### Access the Application

- **Frontend**: http://your-server-ip:9000
- **Backend API**: http://your-server-ip:8088
- **Login**: admin / admin (or credentials you created)

---

## Production Deployment

For production, you should:
1. Build frontend assets
2. Use Gunicorn for backend
3. Set up Nginx reverse proxy
4. Configure systemd services
5. Set up SSL with Let's Encrypt

### 1. Build Frontend for Production

```bash
cd ~/malaria-superset/superset-frontend

# Build production assets
npm run build

# Assets will be in: superset-frontend/dist/
# Superset backend will serve these automatically
```

### 2. Configure Production Settings

Edit `~/.superset/superset_config.py`:

```python
# Production settings
DEBUG = False
ENABLE_CORS = False  # Nginx will handle CORS

# Use production-grade cache (Redis recommended)
CACHE_CONFIG = {
    'CACHE_TYPE': 'RedisCache',
    'CACHE_REDIS_HOST': 'localhost',
    'CACHE_REDIS_PORT': 6379,
    'CACHE_REDIS_DB': 0,
    'CACHE_DEFAULT_TIMEOUT': 300
}

# Celery for async tasks (optional but recommended)
# See: https://superset.apache.org/docs/installation/async-queries-celery
```

---

## Systemd Services (Auto-start on Boot)

### 1. Create Backend Service

```bash
# Create systemd service file
sudo nano /etc/systemd/system/superset.service
```

Add this content:

```ini
[Unit]
Description=Apache Superset Backend
After=network.target postgresql.service

[Service]
Type=notify
User=superset
Group=superset
WorkingDirectory=/home/superset/malaria-superset
Environment="PATH=/home/superset/malaria-superset/venv/bin"
Environment="SUPERSET_CONFIG_PATH=/home/superset/.superset/superset_config.py"
Environment="FLASK_APP=superset"
ExecStart=/home/superset/malaria-superset/venv/bin/gunicorn \
    --bind 0.0.0.0:8088 \
    --workers 4 \
    --worker-class gthread \
    --threads 2 \
    --timeout 300 \
    --limit-request-line 0 \
    --limit-request-field_size 0 \
    "superset.app:create_app()"
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 2. Enable and Start Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable superset

# Start service
sudo systemctl start superset

# Check status
sudo systemctl status superset

# View logs
sudo journalctl -u superset -f
```

---

## Nginx Reverse Proxy Setup

### 1. Install Nginx

```bash
sudo apt install -y nginx

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 2. Configure Nginx

```bash
# Create Superset site configuration
sudo nano /etc/nginx/sites-available/superset
```

Add this content:

```nginx
# Superset Nginx Configuration
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain or IP

    client_max_body_size 100M;
    client_body_timeout 300s;

    # Frontend static files (production build)
    root /home/superset/malaria-superset/superset-frontend/dist;
    index index.html;

    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://localhost:8088;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # Proxy other backend routes
    location ~ ^/(login|logout|static|superset|swagger|healthcheck) {
        proxy_pass http://localhost:8088;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Serve frontend for all other routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # WebSocket support for real-time features
    location /ws/ {
        proxy_pass http://localhost:8088;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 3. Enable Site and Test

```bash
# Create symbolic link to enable site
sudo ln -s /etc/nginx/sites-available/superset /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Check status
sudo systemctl status nginx
```

### 4. Configure Firewall (if enabled)

```bash
# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Check firewall status
sudo ufw status
```

### 5. Set up SSL with Let's Encrypt (Optional)

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL certificate (replace with your domain)
sudo certbot --nginx -d your-domain.com

# Certbot will automatically configure Nginx for HTTPS
# Test auto-renewal
sudo certbot renew --dry-run
```

---

## Troubleshooting

### Common Issues

#### 1. Backend won't start

```bash
# Check logs
sudo journalctl -u superset -n 100 --no-pager

# Common fixes:
# - Check database connection
# - Verify SECRET_KEY is set
# - Check port 8088 is not in use
sudo netstat -tulnp | grep 8088
```

#### 2. Frontend build fails

```bash
# Clear npm cache
cd ~/malaria-superset/superset-frontend
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# Try building with more memory
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

#### 3. Database connection errors

```bash
# Test PostgreSQL connection
psql -h localhost -U superset -d superset

# Check PostgreSQL is running
sudo systemctl status postgresql

# Check connection string in config
cat ~/.superset/superset_config.py | grep SQLALCHEMY_DATABASE_URI
```

#### 4. Permission errors

```bash
# Fix ownership
sudo chown -R superset:superset /home/superset/malaria-superset

# Fix cache directories
sudo mkdir -p /tmp/superset_cache /tmp/superset_results
sudo chown -R superset:superset /tmp/superset_cache /tmp/superset_results
```

#### 5. DHIS2 connection issues

```bash
# Test DHIS2 API connectivity from server
curl -u username:password https://your-dhis2-instance.org/api/system/info

# Check firewall rules
sudo ufw status

# Check DNS resolution
nslookup your-dhis2-instance.org
```

### Useful Commands

```bash
# Restart all services
sudo systemctl restart superset
sudo systemctl restart nginx

# View real-time logs
sudo journalctl -u superset -f

# Check disk space
df -h

# Check memory usage
free -h

# Check running processes
ps aux | grep superset
ps aux | grep gunicorn

# Stop development servers
# Kill backend
pkill -f "superset run"

# Kill frontend
pkill -f "npm run dev"
```

---

## Post-Deployment Checklist

- [ ] Backend running on http://localhost:8088
- [ ] Frontend built and served by Nginx
- [ ] Nginx reverse proxy working on port 80/443
- [ ] SSL certificate installed (if using HTTPS)
- [ ] Systemd service enabled (auto-start on boot)
- [ ] Firewall configured (ports 80, 443 open)
- [ ] Admin user created and can log in
- [ ] DHIS2 database connection working
- [ ] Test creating a DHIS2 dataset
- [ ] Test creating a chart from DHIS2 data
- [ ] Backups configured for metadata database
- [ ] Monitoring set up (optional: Prometheus, Grafana)

---

## Maintenance

### Update Application

```bash
# Pull latest changes
cd ~/malaria-superset
git pull origin master  # or your branch

# Backend updates
source venv/bin/activate
pip install -r requirements/base.txt
superset db upgrade

# Frontend updates
cd superset-frontend
npm install
npm run build

# Restart services
sudo systemctl restart superset
sudo systemctl reload nginx
```

### Backup Database

```bash
# PostgreSQL backup
sudo -u postgres pg_dump superset > ~/superset_backup_$(date +%Y%m%d).sql

# Restore from backup
sudo -u postgres psql superset < ~/superset_backup_YYYYMMDD.sql
```

### Monitor Logs

```bash
# Backend logs
sudo journalctl -u superset -f

# Nginx access logs
sudo tail -f /var/log/nginx/access.log

# Nginx error logs
sudo tail -f /var/log/nginx/error.log
```

---

## Support & Resources

- **Superset Documentation**: https://superset.apache.org/docs/
- **DHIS2 Documentation**: https://docs.dhis2.org/
- **Project Issues**: https://github.com/YOUR_USERNAME/malaria-superset/issues

---

**Last Updated**: 2025-11-10
**Tested on**: Ubuntu Server 22.04 LTS
