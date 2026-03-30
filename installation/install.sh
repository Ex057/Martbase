#!/bin/bash
#
# Apache Superset (DHIS2 Integration) - Ubuntu Server Installer
#
# This script automates the installation of Superset on Ubuntu Server 20.04/22.04
# Includes all dependencies for DHIS2 integration
#
# Usage:
#   chmod +x install.sh
#   ./install.sh
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Log functions
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

# Progress bar
show_progress() {
    local title="$1"
    echo -n "$title "
    while kill -0 $2 2>/dev/null; do
        echo -n "."
        sleep 1
    done
    echo " Done!"
}

# Header
echo "========================================"
echo "  Superset DHIS2 Integration Installer"
echo "========================================"
echo ""

# Check if running on Ubuntu
if [ ! -f /etc/os-release ]; then
    log_error "Cannot determine OS. This script is designed for Ubuntu."
    exit 1
fi

source /etc/os-release
if [[ "$ID" != "ubuntu" ]]; then
    log_warning "This script is designed for Ubuntu. Detected: $ID"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

log_info "Detected: $PRETTY_NAME"

# Check for sudo privileges
if [ "$EUID" -eq 0 ]; then
    log_error "Do not run this script as root. Run as a regular user with sudo privileges."
    exit 1
fi

if ! sudo -n true 2>/dev/null; then
    log_info "This script requires sudo privileges. You may be prompted for your password."
    sudo -v
fi

# Keep sudo alive
while true; do sudo -n true; sleep 60; kill -0 "$$" || exit; done 2>/dev/null &

echo ""
log_info "Starting installation..."
echo ""

###########################################
# 1. System Update
###########################################
log_info "Step 1/10: Updating system packages..."
sudo apt update -qq
sudo apt upgrade -y -qq
log_success "System updated"

###########################################
# 2. Install System Dependencies
###########################################
log_info "Step 2/10: Installing system dependencies..."

sudo apt install -y -qq \
    build-essential \
    software-properties-common \
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
    pkg-config \
    git \
    curl \
    wget \
    unzip

log_success "System dependencies installed"

###########################################
# 3. Install PostgreSQL
###########################################
log_info "Step 3/10: Installing PostgreSQL..."

if ! command -v psql &> /dev/null; then
    sudo apt install -y -qq postgresql postgresql-contrib libpq-dev postgresql-client
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
    log_success "PostgreSQL installed and started"
else
    log_info "PostgreSQL already installed"
fi

###########################################
# 4. Install Node.js 18
###########################################
log_info "Step 4/10: Installing Node.js 18..."

if ! command -v node &> /dev/null || [[ $(node -v | cut -d'v' -f2 | cut -d'.' -f1) -lt 18 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - > /dev/null 2>&1
    sudo apt install -y -qq nodejs
    log_success "Node.js $(node -v) installed"
else
    log_info "Node.js $(node -v) already installed"
fi

###########################################
# 5. Setup PostgreSQL Database
###########################################
log_info "Step 5/10: Setting up PostgreSQL database..."

read -p "Create PostgreSQL database for Superset? (y/n) [y]: " -r CREATE_DB
CREATE_DB=${CREATE_DB:-y}

if [[ $CREATE_DB =~ ^[Yy]$ ]]; then
    read -p "Enter database name [superset]: " DB_NAME
    DB_NAME=${DB_NAME:-superset}

    read -p "Enter database user [superset]: " DB_USER
    DB_USER=${DB_USER:-superset}

    read -sp "Enter database password [auto-generate]: " DB_PASS
    echo
    if [ -z "$DB_PASS" ]; then
        DB_PASS=$(openssl rand -base64 16)
        log_info "Generated password: $DB_PASS"
    fi

    # Check if database already exists
    if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        log_warning "Database '$DB_NAME' already exists. Skipping creation."
    else
        sudo -u postgres psql > /dev/null 2>&1 << EOF
CREATE DATABASE $DB_NAME;
CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF
        log_success "Database created: $DB_NAME"
    fi

    # Save connection string for later
    DB_URI="postgresql://$DB_USER:$DB_PASS@localhost/$DB_NAME"
else
    log_info "Skipping database setup. You can use SQLite instead."
    DB_URI="sqlite:///$(echo ~)/.superset/superset.db"
fi

###########################################
# 6. Create Python Virtual Environment
###########################################
log_info "Step 6/10: Creating Python virtual environment..."

cd "$SCRIPT_DIR"

if [ -d "venv" ]; then
    log_warning "Virtual environment already exists"
    read -p "Recreate virtual environment? (y/n) [n]: " -r RECREATE_VENV
    if [[ $RECREATE_VENV =~ ^[Yy]$ ]]; then
        rm -rf venv
        python3 -m venv venv
        log_success "Virtual environment recreated"
    fi
else
    python3 -m venv venv
    log_success "Virtual environment created"
fi

source venv/bin/activate

###########################################
# 7. Install Python Dependencies
###########################################
log_info "Step 7/10: Installing Python dependencies (this may take 10-15 minutes)..."

pip install --quiet --upgrade pip setuptools wheel

if [ -f "requirements/base.txt" ]; then
    pip install --quiet -r requirements/base.txt
    log_success "Base dependencies installed"
else
    log_error "requirements/base.txt not found!"
    exit 1
fi

# Ask about development dependencies
read -p "Install development dependencies? (y/n) [y]: " -r INSTALL_DEV
INSTALL_DEV=${INSTALL_DEV:-y}

if [[ $INSTALL_DEV =~ ^[Yy]$ ]]; then
    if [ -f "requirements/development.txt" ]; then
        pip install --quiet -r requirements/development.txt
        log_success "Development dependencies installed"
    fi
fi

# Install Superset in editable mode
pip install --quiet -e .
log_success "Superset installed in editable mode"

###########################################
# 8. Install Frontend Dependencies
###########################################
log_info "Step 8/10: Installing frontend dependencies (this may take 5-10 minutes)..."

cd "$SCRIPT_DIR/superset-frontend"

if [ -d "node_modules" ]; then
    log_warning "node_modules already exists"
    read -p "Reinstall frontend dependencies? (y/n) [n]: " -r REINSTALL_NPM
    if [[ $REINSTALL_NPM =~ ^[Yy]$ ]]; then
        rm -rf node_modules package-lock.json
        npm install --quiet
        log_success "Frontend dependencies reinstalled"
    fi
else
    npm install --quiet
    log_success "Frontend dependencies installed"
fi

cd "$SCRIPT_DIR"

###########################################
# 9. Configure Superset
###########################################
log_info "Step 9/10: Configuring Superset..."

mkdir -p ~/.superset

# Generate secret key
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")

# Create config file
cat > ~/.superset/superset_config.py << EOF
# Superset Configuration
# Generated by install.sh on $(date)

import os

# Metadata database connection
SQLALCHEMY_DATABASE_URI = '$DB_URI'

# Secret key for session management
SECRET_KEY = '$SECRET_KEY'

# CSRF settings
WTF_CSRF_ENABLED = True
WTF_CSRF_TIME_LIMIT = None

# File-based caching
CACHE_CONFIG = {
    'CACHE_TYPE': 'FileSystemCache',
    'CACHE_DIR': '/tmp/superset_cache',
    'CACHE_DEFAULT_TIMEOUT': 300
}

# Async query results backend
RESULTS_BACKEND = {
    'CACHE_TYPE': 'FileSystemCache',
    'CACHE_DIR': '/tmp/superset_results',
    'CACHE_DEFAULT_TIMEOUT': 86400
}

# Feature flags
FEATURE_FLAGS = {
    'ENABLE_TEMPLATE_PROCESSING': True,
}

# Query limits
ROW_LIMIT = 50000
SUPERSET_WEBSERVER_TIMEOUT = 300

# DHIS2-specific settings
ENABLE_CORS = True
EOF

# Create cache directories
sudo mkdir -p /tmp/superset_cache /tmp/superset_results
sudo chown -R $USER:$USER /tmp/superset_cache /tmp/superset_results

log_success "Superset configured"
log_info "Config file: ~/.superset/superset_config.py"

# Add environment variables to .bashrc
if ! grep -q "SUPERSET_CONFIG_PATH" ~/.bashrc; then
    cat >> ~/.bashrc << 'EOF'

# Superset Environment Variables
export SUPERSET_CONFIG_PATH=$HOME/.superset/superset_config.py
export FLASK_APP=superset
export SUPERSET_LOAD_EXAMPLES=no
export PYTHONPATH=$HOME/malaria-superset:$PYTHONPATH
EOF
    log_success "Environment variables added to ~/.bashrc"
fi

# Export for current session
export SUPERSET_CONFIG_PATH=~/.superset/superset_config.py
export FLASK_APP=superset
export SUPERSET_LOAD_EXAMPLES=no
export PYTHONPATH="$SCRIPT_DIR:$PYTHONPATH"

###########################################
# 10. Initialize Superset
###########################################
log_info "Step 10/10: Initializing Superset database..."

source "$SCRIPT_DIR/venv/bin/activate"

# Initialize database
superset db upgrade
log_success "Database initialized"

# Create admin user
log_info "Creating admin user..."
read -p "Admin username [admin]: " ADMIN_USER
ADMIN_USER=${ADMIN_USER:-admin}

read -sp "Admin password [admin]: " ADMIN_PASS
echo
ADMIN_PASS=${ADMIN_PASS:-admin}

read -p "Admin email [admin@localhost]: " ADMIN_EMAIL
ADMIN_EMAIL=${ADMIN_EMAIL:-admin@localhost}

superset fab create-admin \
    --username "$ADMIN_USER" \
    --firstname Admin \
    --lastname User \
    --email "$ADMIN_EMAIL" \
    --password "$ADMIN_PASS" 2>/dev/null || log_warning "Admin user may already exist"

# Initialize roles and permissions
superset init
log_success "Superset initialized"

###########################################
# Installation Complete
###########################################
echo ""
echo "========================================"
echo "  Installation Complete! ✓"
echo "========================================"
echo ""

log_success "Superset has been successfully installed!"
echo ""

# Print summary
echo "📋 Installation Summary:"
echo "  Project Directory: $SCRIPT_DIR"
echo "  Python Virtual Env: $SCRIPT_DIR/venv"
echo "  Config File: ~/.superset/superset_config.py"
echo "  Database: $DB_URI"
echo "  Admin User: $ADMIN_USER"
if [[ ! -z "$DB_PASS" && "$DB_URI" != *"sqlite"* ]]; then
    echo "  Database Password: $DB_PASS (SAVE THIS!)"
fi
echo ""

# Next steps
echo "🚀 Next Steps:"
echo ""
echo "1. Start Backend Server:"
echo "   cd $SCRIPT_DIR"
echo "   source venv/bin/activate"
echo "   superset run -p 8088 --with-threads --reload --debugger"
echo ""
echo "2. Start Frontend Server (in a new terminal):"
echo "   cd $SCRIPT_DIR/superset-frontend"
echo "   npm run dev"
echo ""
echo "3. Access Superset:"
echo "   http://localhost:9000"
echo "   Login: $ADMIN_USER / $ADMIN_PASS"
echo ""

# Offer to create systemd service
read -p "Create systemd service for auto-start on boot? (y/n) [n]: " -r CREATE_SERVICE
if [[ $CREATE_SERVICE =~ ^[Yy]$ ]]; then
    log_info "Creating systemd service..."

    sudo tee /etc/systemd/system/superset.service > /dev/null << EOF
[Unit]
Description=Apache Superset Backend
After=network.target postgresql.service

[Service]
Type=notify
User=$USER
Group=$USER
WorkingDirectory=$SCRIPT_DIR
Environment="PATH=$SCRIPT_DIR/venv/bin"
Environment="SUPERSET_CONFIG_PATH=$HOME/.superset/superset_config.py"
Environment="FLASK_APP=superset"
Environment="PYTHONPATH=$SCRIPT_DIR"
ExecStart=$SCRIPT_DIR/venv/bin/gunicorn \\
    --bind 0.0.0.0:8088 \\
    --workers 4 \\
    --worker-class gthread \\
    --threads 2 \\
    --timeout 300 \\
    --limit-request-line 0 \\
    --limit-request-field_size 0 \\
    "superset.app:create_app()"
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    # Install gunicorn if not already installed
    source "$SCRIPT_DIR/venv/bin/activate"
    pip install --quiet gunicorn

    sudo systemctl daemon-reload
    sudo systemctl enable superset

    log_success "Systemd service created and enabled"
    echo ""
    echo "Service Commands:"
    echo "  sudo systemctl start superset   # Start service"
    echo "  sudo systemctl stop superset    # Stop service"
    echo "  sudo systemctl status superset  # Check status"
    echo "  sudo journalctl -u superset -f  # View logs"
fi

echo ""
log_info "For production deployment, see: UBUNTU_SERVER_DEPLOYMENT.md"
log_info "For quick reference, see: DEPLOYMENT_QUICKSTART.md"
echo ""

# Offer to start development servers
read -p "Start development servers now? (y/n) [n]: " -r START_NOW
if [[ $START_NOW =~ ^[Yy]$ ]]; then
    log_info "Starting backend server..."
    cd "$SCRIPT_DIR"
    source venv/bin/activate

    # Start backend in background
    nohup superset run -p 8088 --with-threads --reload --debugger > /tmp/superset-backend.log 2>&1 &
    BACKEND_PID=$!
    echo "Backend PID: $BACKEND_PID"

    sleep 3

    log_info "Starting frontend server..."
    cd "$SCRIPT_DIR/superset-frontend"
    nohup npm run dev > /tmp/superset-frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo "Frontend PID: $FRONTEND_PID"

    sleep 5

    echo ""
    log_success "Servers started!"
    echo "Backend:  http://localhost:8088  (logs: /tmp/superset-backend.log)"
    echo "Frontend: http://localhost:9000  (logs: /tmp/superset-frontend.log)"
    echo ""
    echo "To stop servers:"
    echo "  kill $BACKEND_PID $FRONTEND_PID"
    echo "  OR: pkill -f 'superset run' && pkill -f 'npm run dev'"
fi

echo ""
log_success "Installation script complete! 🎉"
echo ""
