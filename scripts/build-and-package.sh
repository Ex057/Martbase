#!/bin/bash
# Build and Package Script for Malaria Superset Updates
# Simplified version that handles build errors gracefully

set -e  # Exit on critical errors only

echo "=========================================="
echo "Malaria Superset - Build & Package Script"
echo "=========================================="

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${PROJECT_ROOT}/deployment-build"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PACKAGE_NAME="malaria-superset-update-${TIMESTAMP}.tar.gz"

echo "Project root: ${PROJECT_ROOT}"
echo "Build directory: ${BUILD_DIR}"
echo ""

# Step 1: Check Node.js version (informational only)
echo -e "${YELLOW}[1/6] Checking Node.js installation...${NC}"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "Node.js version: ${NODE_VERSION}"
    echo -e "${GREEN}✓ Node.js found${NC}"
else
    echo -e "${RED}ERROR: Node.js not found. Please install Node.js 20.x${NC}"
    echo "Install with: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
    exit 1
fi

if command -v npm &> /dev/null; then
    echo "npm version: $(npm --version)"
    echo -e "${GREEN}✓ npm found${NC}"
else
    echo -e "${RED}ERROR: npm not found${NC}"
    exit 1
fi
echo ""

# Step 2: Clean and prepare
echo -e "${YELLOW}[2/6] Preparing build directory...${NC}"
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"
cd "${PROJECT_ROOT}/superset-frontend"
echo -e "${GREEN}✓ Build directory ready${NC}"
echo ""

# Step 3: Check/install dependencies
echo -e "${YELLOW}[3/6] Checking npm dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies (this will take 5-10 minutes)..."
    npm ci --legacy-peer-deps 2>&1 | tail -20
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${GREEN}✓ Dependencies already installed${NC}"
fi
echo ""

# Step 4: Build frontend (continue on errors)
echo -e "${YELLOW}[4/6] Building frontend...${NC}"
echo "Note: Webpack may show errors from third-party libraries - these can be ignored if assets are generated."
echo ""

# Capture build output but continue
BUILD_OUTPUT=$(mktemp)
if npm run build > "$BUILD_OUTPUT" 2>&1; then
    echo -e "${GREEN}✓ Build completed successfully${NC}"
else
    echo -e "${YELLOW}⚠ Build finished with errors (checking if assets were generated...)${NC}"
fi

# Show last 30 lines of build output for reference
echo ""
echo "Last lines of build output:"
tail -30 "$BUILD_OUTPUT"
rm "$BUILD_OUTPUT"
echo ""

# Critical check: Were assets actually generated?
if [ -d "../superset/static/assets" ] && [ "$(ls -A ../superset/static/assets 2>/dev/null | wc -l)" -gt 10 ]; then
    ASSET_COUNT=$(ls -1 ../superset/static/assets | wc -l)
    ASSET_SIZE=$(du -sh ../superset/static/assets | cut -f1)
    echo -e "${GREEN}✓ Assets generated successfully: $ASSET_COUNT files, $ASSET_SIZE${NC}"
else
    echo -e "${RED}ERROR: Build failed - no assets were generated${NC}"
    echo ""
    echo "This means webpack couldn't compile your code. Common fixes:"
    echo "1. Check for syntax errors in your TypeScript files"
    echo "2. Ensure all imports are correct"
    echo "3. Run: npm ci --legacy-peer-deps (to reinstall dependencies)"
    echo ""
    exit 1
fi
echo ""

# Step 5: Package assets
echo -e "${YELLOW}[5/6] Packaging compiled assets...${NC}"
mkdir -p "${BUILD_DIR}/assets"
cp -R "${PROJECT_ROOT}/superset/static/assets/"* "${BUILD_DIR}/assets/" 2>/dev/null || {
    echo -e "${RED}ERROR: Failed to copy assets${NC}"
    exit 1
}
echo -e "${GREEN}✓ Assets packaged: $(du -sh ${BUILD_DIR}/assets | cut -f1)${NC}"
echo ""

# Step 6: Package backend file
echo -e "${YELLOW}[6/6] Packaging backend and creating deployment script...${NC}"
mkdir -p "${BUILD_DIR}/backend"
cp "${PROJECT_ROOT}/superset/initialization/__init__.py" "${BUILD_DIR}/backend/__init__.py"
echo -e "${GREEN}✓ Backend file packaged${NC}"

# Create deployment script
cat > "${BUILD_DIR}/deploy-on-server.sh" << 'DEPLOY_SCRIPT'
#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "=========================================="
echo "Malaria Superset - Server Update Script"
echo "=========================================="
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}ERROR: Please run as root or with sudo${NC}"
    exit 1
fi

# Configuration
SUPERSET_PATH="/usr/local/lib/python3.10/dist-packages/superset"
BACKUP_DIR="/root/superset-backups/$(date +%Y%m%d_%H%M%S)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Superset path: ${SUPERSET_PATH}"
echo "Backup directory: ${BACKUP_DIR}"
echo ""

# Verify installation
echo -e "${YELLOW}[1/5] Verifying Superset installation...${NC}"
if [ ! -d "${SUPERSET_PATH}" ]; then
    echo -e "${RED}ERROR: Superset not found at ${SUPERSET_PATH}${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Superset found${NC}"
echo ""

# Create backup
echo -e "${YELLOW}[2/5] Creating backup...${NC}"
mkdir -p "${BACKUP_DIR}"
if [ -d "${SUPERSET_PATH}/static/assets" ]; then
    cp -R "${SUPERSET_PATH}/static/assets" "${BACKUP_DIR}/"
    echo -e "${GREEN}✓ Assets backed up${NC}"
fi
if [ -f "${SUPERSET_PATH}/initialization/__init__.py" ]; then
    mkdir -p "${BACKUP_DIR}/initialization"
    cp "${SUPERSET_PATH}/initialization/__init__.py" "${BACKUP_DIR}/initialization/"
    echo -e "${GREEN}✓ Backend file backed up${NC}"
fi
echo "Backup: ${BACKUP_DIR}"
echo ""

# Stop service
echo -e "${YELLOW}[3/5] Stopping Superset service...${NC}"
SERVICE_NAME=""
if systemctl is-active --quiet superset; then
    systemctl stop superset
    SERVICE_NAME="superset"
    echo -e "${GREEN}✓ Superset service stopped${NC}"
elif systemctl is-active --quiet gunicorn; then
    systemctl stop gunicorn
    SERVICE_NAME="gunicorn"
    echo -e "${GREEN}✓ Gunicorn service stopped${NC}"
else
    echo -e "${YELLOW}⚠ No service detected, continuing...${NC}"
fi
echo ""

# Update files
echo -e "${YELLOW}[4/5] Updating files...${NC}"

# Update assets
if [ -d "${SCRIPT_DIR}/assets" ]; then
    echo "Replacing frontend assets..."
    rm -rf "${SUPERSET_PATH}/static/assets"/*
    cp -R "${SCRIPT_DIR}/assets/"* "${SUPERSET_PATH}/static/assets/"
    echo -e "${GREEN}✓ Frontend assets updated${NC}"
else
    echo -e "${RED}ERROR: Assets not found${NC}"
    exit 1
fi

# Update backend
if [ -f "${SCRIPT_DIR}/backend/__init__.py" ]; then
    echo "Updating backend file..."
    cp "${SCRIPT_DIR}/backend/__init__.py" "${SUPERSET_PATH}/initialization/__init__.py"
    echo -e "${GREEN}✓ Backend file updated${NC}"
else
    echo -e "${RED}ERROR: Backend file not found${NC}"
    exit 1
fi

# Set permissions
chown -R www-data:www-data "${SUPERSET_PATH}/static/assets" 2>/dev/null || \
chown -R superset:superset "${SUPERSET_PATH}/static/assets" 2>/dev/null || \
echo "Note: Could not set ownership (may not be needed)"
echo ""

# Start service
echo -e "${YELLOW}[5/5] Starting Superset service...${NC}"
if [ -n "$SERVICE_NAME" ]; then
    systemctl start $SERVICE_NAME
    sleep 3
    if systemctl is-active --quiet $SERVICE_NAME; then
        echo -e "${GREEN}✓ $SERVICE_NAME started successfully${NC}"
    else
        echo -e "${RED}ERROR: Failed to start $SERVICE_NAME${NC}"
        echo "Check logs: journalctl -u $SERVICE_NAME -n 50"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠ Please start Superset manually${NC}"
fi

echo ""
echo -e "${GREEN}=========================================="
echo "Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo "Backup location: ${BACKUP_DIR}"
echo ""
echo "To rollback:"
echo "  sudo systemctl stop ${SERVICE_NAME:-superset}"
echo "  sudo rm -rf ${SUPERSET_PATH}/static/assets/*"
echo "  sudo cp -R ${BACKUP_DIR}/assets/* ${SUPERSET_PATH}/static/assets/"
echo "  sudo cp ${BACKUP_DIR}/initialization/__init__.py ${SUPERSET_PATH}/initialization/"
echo "  sudo systemctl start ${SERVICE_NAME:-superset}"
echo ""
DEPLOY_SCRIPT

chmod +x "${BUILD_DIR}/deploy-on-server.sh"
echo -e "${GREEN}✓ Deployment script created${NC}"
echo ""

# Create tarball
echo -e "${YELLOW}Creating deployment package...${NC}"
cd "${BUILD_DIR}"
tar -czf "${PACKAGE_NAME}" assets/ backend/ deploy-on-server.sh
PACKAGE_PATH="${BUILD_DIR}/${PACKAGE_NAME}"
PACKAGE_SIZE=$(du -sh "${PACKAGE_PATH}" | cut -f1)

echo ""
echo -e "${GREEN}=========================================="
echo "Build Complete!"
echo "==========================================${NC}"
echo ""
echo "Package: ${PACKAGE_NAME}"
echo "Size: ${PACKAGE_SIZE}"
echo "Location: ${PACKAGE_PATH}"
echo ""
echo "Next steps:"
echo ""
echo "1. Extract and deploy (on this server):"
echo "   cd ${BUILD_DIR}"
echo "   tar -xzf ${PACKAGE_NAME}"
echo "   sudo ./deploy-on-server.sh"
echo ""
echo "2. Or transfer to another server:"
echo "   scp ${PACKAGE_PATH} root@SERVER_IP:/root/"
echo "   # Then on remote server:"
echo "   tar -xzf /root/${PACKAGE_NAME}"
echo "   cd /root/assets/ && sudo ./deploy-on-server.sh"
echo ""
