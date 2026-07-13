#!/usr/bin/env bash
set -Eeuo pipefail

# ==============================================================================
# Martbase Build and Deploy Script
# Builds frontend on Mac and creates deployment package for Multipass VM
# ==============================================================================

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info() { echo -e "${BLUE}[INFO]${NC} $*"; }
ok() { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${PROJECT_DIR}/deployment"
ZIP_NAME="martbase-deployment.zip"
TEMP_DIR="${OUTPUT_DIR}/martbase"

# Parse arguments
SKIP_FRONTEND=false
SKIP_PACKAGE=false
TRANSFER_TO_VM=false
VM_NAME="martbase"

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-frontend)
            SKIP_FRONTEND=true
            shift
            ;;
        --skip-package)
            SKIP_PACKAGE=true
            shift
            ;;
        --transfer)
            TRANSFER_TO_VM=true
            shift
            ;;
        --vm)
            VM_NAME="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --skip-frontend   Skip frontend build (use existing assets)"
            echo "  --skip-package    Skip creating deployment ZIP"
            echo "  --transfer        Transfer package to Multipass VM after build"
            echo "  --vm NAME         VM name for transfer (default: martbase)"
            echo "  -h, --help        Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                         # Full build + package"
            echo "  $0 --skip-frontend         # Package only (use existing frontend)"
            echo "  $0 --transfer              # Build + package + transfer to VM"
            echo "  $0 --transfer --vm myvm    # Transfer to different VM"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo ""
echo "=============================================="
echo "  Martbase Build and Deploy"
echo "=============================================="
echo ""

# Step 1: Build Frontend
if [[ "$SKIP_FRONTEND" != "true" ]]; then
    info "Step 1: Building frontend..."

    cd "${PROJECT_DIR}/superset-frontend"

    # Check if node_modules exists
    if [[ ! -d "node_modules" ]]; then
        info "Installing npm dependencies..."
        npm ci --legacy-peer-deps
    fi

    # Build production frontend
    info "Running production build..."
    npm run build

    # Check if build succeeded - assets go to superset/static/assets/
    if [[ -d "${PROJECT_DIR}/superset/static/assets" ]]; then
        ASSET_COUNT=$(find "${PROJECT_DIR}/superset/static/assets" -name "*.js" 2>/dev/null | wc -l | tr -d ' ')
        if [[ "$ASSET_COUNT" -gt 0 ]]; then
            ok "Frontend build complete! Found ${ASSET_COUNT} JS bundles"
        else
            warn "Build completed but no JS files found in superset/static/assets/"
        fi
    else
        error "Frontend build may have failed - superset/static/assets/ not found"
        exit 1
    fi

    cd "${PROJECT_DIR}"
else
    info "Step 1: Skipping frontend build (--skip-frontend)"
fi

# Step 2: Create deployment package
if [[ "$SKIP_PACKAGE" != "true" ]]; then
    info "Step 2: Creating deployment package..."

    # Clean up previous builds
    rm -rf "${OUTPUT_DIR}"
    mkdir -p "${TEMP_DIR}"

    # Copy Python backend
    info "Copying Python backend..."
    rsync -a --exclude='__pycache__' \
             --exclude='*.pyc' \
             --exclude='*.pyo' \
             --exclude='.pytest_cache' \
             --exclude='*.egg-info' \
             "${PROJECT_DIR}/superset/" "${TEMP_DIR}/superset/"

    # Copy requirements
    info "Copying requirements..."
    mkdir -p "${TEMP_DIR}/requirements"
    cp -r "${PROJECT_DIR}/requirements/"* "${TEMP_DIR}/requirements/"

    # Copy configuration files
    info "Copying configuration files..."
    [[ -f "${PROJECT_DIR}/setup.py" ]] && cp "${PROJECT_DIR}/setup.py" "${TEMP_DIR}/"
    [[ -f "${PROJECT_DIR}/pyproject.toml" ]] && cp "${PROJECT_DIR}/pyproject.toml" "${TEMP_DIR}/"
    [[ -f "${PROJECT_DIR}/setup.cfg" ]] && cp "${PROJECT_DIR}/setup.cfg" "${TEMP_DIR}/"
    [[ -f "${PROJECT_DIR}/MANIFEST.in" ]] && cp "${PROJECT_DIR}/MANIFEST.in" "${TEMP_DIR}/"
    [[ -f "${PROJECT_DIR}/babel.cfg" ]] && cp "${PROJECT_DIR}/babel.cfg" "${TEMP_DIR}/"

    # Copy frontend source (for potential rebuilds on server)
    info "Copying frontend source..."
    rsync -a --exclude='node_modules' \
             --exclude='build' \
             --exclude='.webpack' \
             --exclude='.cache' \
             --exclude='.next' \
             --exclude='.eslintcache' \
             "${PROJECT_DIR}/superset-frontend/" "${TEMP_DIR}/superset-frontend/"

    # Copy packages if they exist
    if [[ -d "${PROJECT_DIR}/superset-frontend/packages" ]]; then
        info "Copying frontend packages..."
        rsync -a --exclude='node_modules' \
                 --exclude='dist' \
                 --exclude='lib' \
                 --exclude='esm' \
                 "${PROJECT_DIR}/superset-frontend/packages/" "${TEMP_DIR}/superset-frontend/packages/"
    fi

    # Copy plugins if they exist
    if [[ -d "${PROJECT_DIR}/superset-frontend/plugins" ]]; then
        info "Copying frontend plugins..."
        rsync -a --exclude='node_modules' \
                 --exclude='dist' \
                 --exclude='lib' \
                 --exclude='esm' \
                 "${PROJECT_DIR}/superset-frontend/plugins/" "${TEMP_DIR}/superset-frontend/plugins/"
    fi

    # Copy superset-core if it exists
    if [[ -d "${PROJECT_DIR}/superset-core" ]]; then
        info "Copying superset-core..."
        rsync -a --exclude='__pycache__' \
                 --exclude='*.pyc' \
                 --exclude='*.pyo' \
                 --exclude='.pytest_cache' \
                 --exclude='*.egg-info' \
                 "${PROJECT_DIR}/superset-core/" "${TEMP_DIR}/superset-core/"
    fi

    # Copy superset-extensions-cli if it exists
    if [[ -d "${PROJECT_DIR}/superset-extensions-cli" ]]; then
        info "Copying superset-extensions-cli..."
        rsync -a --exclude='__pycache__' \
                 --exclude='*.pyc' \
                 --exclude='*.pyo' \
                 --exclude='.pytest_cache' \
                 --exclude='*.egg-info' \
                 "${PROJECT_DIR}/superset-extensions-cli/" "${TEMP_DIR}/superset-extensions-cli/"
    fi

    # Copy scripts directory (includes setup_localai.sh)
    if [[ -d "${PROJECT_DIR}/scripts" ]]; then
        info "Copying scripts..."
        mkdir -p "${TEMP_DIR}/scripts"
        cp -r "${PROJECT_DIR}/scripts/"* "${TEMP_DIR}/scripts/"
        chmod +x "${TEMP_DIR}/scripts/"*.sh 2>/dev/null || true
    fi

    # Copy deployment scripts
    info "Copying deployment scripts..."
    cp "${PROJECT_DIR}/master.sh" "${TEMP_DIR}/"
    chmod +x "${TEMP_DIR}/master.sh"

    # Copy custom superset_config if it exists
    if [[ -f "${PROJECT_DIR}/superset_config.py" ]]; then
        info "Copying custom superset_config.py..."
        cp "${PROJECT_DIR}/superset_config.py" "${TEMP_DIR}/"
    fi

    # Copy translations if they exist
    if [[ -d "${PROJECT_DIR}/superset/translations" ]]; then
        info "Copying translations..."
        rsync -a "${PROJECT_DIR}/superset/translations/" "${TEMP_DIR}/superset/translations/"
    fi

    # Create deployment README
    info "Creating deployment README..."
    cat > "${TEMP_DIR}/DEPLOY.md" <<'EOF'
# Martbase Deployment Package

## Contents
- `superset/` - Python backend application with pre-built frontend assets
- `superset-frontend/` - Frontend source (for rebuilds if needed)
- `superset-core/` - Core library dependency
- `requirements/` - Python dependencies
- `scripts/` - Utility scripts (LocalAI setup, etc.)
- `master.sh` - Deployment script

## Quick Start on Multipass VM

1. Extract this package:
   ```bash
   sudo mkdir -p /opt/martbase
   sudo unzip martbase-deployment.zip -d /opt
   sudo chown -R $USER:$USER /opt/martbase
   cd /opt/martbase/martbase
   ```

2. Run installation:
   ```bash
   DOMAIN=martbase.local \
   ADMIN_EMAIL=admin@gmail.com \
   ADMIN_PASSWORD='admin@2026' \
   ./master.sh install
   ```

3. Check status:
   ```bash
   ./master.sh status
   ```

4. Access the application:
   - URL: http://martbase.local (or http://VM_IP)
   - Username: admin
   - Password: admin@2026

## Commands

- `./master.sh install` - Initial installation
- `./master.sh upgrade` - Upgrade existing installation
- `./master.sh start` - Start all services
- `./master.sh stop` - Stop all services
- `./master.sh restart` - Restart all services
- `./master.sh status` - Show service status

## LocalAI Setup (Optional)

For self-hosted AI capabilities:
```bash
cd /opt/martbase/martbase/scripts
./setup_localai.sh install
./setup_localai.sh start
```

## Environment Variables

- `DOMAIN` - Domain name (default: martbase.local)
- `ADMIN_EMAIL` - Admin email
- `ADMIN_PASSWORD` - Admin password
- `POSTGRES_PASSWORD` - Database password (auto-generated if not set)

## Minimum Requirements

- Ubuntu 22.04 LTS or later
- 4GB RAM (8GB recommended)
- 2 CPU cores (4 recommended)
- 20GB disk space (40GB recommended)

## Troubleshooting

### Check logs
```bash
sudo journalctl -u martbase-web -f
sudo journalctl -u martbase-worker -f
```

### Restart services
```bash
./master.sh restart
```

### Verify custom modules
```bash
source /opt/martbase/venv/bin/activate
python -c "from superset.dhis2.admin_views import DHIS2AdminView; print('OK')"
python -c "from superset.public_page.api import PublicPageRestApi; print('OK')"
```
EOF

    # Create ZIP
    info "Creating ZIP package..."
    cd "${OUTPUT_DIR}"
    zip -r "${ZIP_NAME}" martbase/ -q

    FILESIZE=$(du -h "${ZIP_NAME}" | cut -f1)
    ok "Deployment package created: ${OUTPUT_DIR}/${ZIP_NAME}"
    ok "Package size: ${FILESIZE}"

    # Create checksum
    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "${ZIP_NAME}" > "${ZIP_NAME}.sha256"
        info "Checksum: $(cat ${ZIP_NAME}.sha256 | cut -d' ' -f1)"
    fi

    cd "${PROJECT_DIR}"
else
    info "Step 2: Skipping package creation (--skip-package)"
fi

# Step 3: Transfer to VM
if [[ "$TRANSFER_TO_VM" == "true" ]]; then
    info "Step 3: Transferring package to VM..."

    # Check if multipass is available
    if ! command -v multipass >/dev/null 2>&1; then
        error "Multipass not found. Please install multipass or transfer manually."
        exit 1
    fi

    # Check if VM exists and is running
    if ! multipass info "$VM_NAME" >/dev/null 2>&1; then
        error "VM '$VM_NAME' not found. Create it first or specify --vm NAME"
        exit 1
    fi

    # Transfer the package
    info "Transferring to $VM_NAME:/home/ubuntu/martbase-deployment.zip"
    multipass transfer "${OUTPUT_DIR}/${ZIP_NAME}" "$VM_NAME:/home/ubuntu/martbase-deployment.zip"

    ok "Package transferred successfully!"
    echo ""
    echo "Next steps on VM:"
    echo "  multipass shell $VM_NAME"
    echo "  cd /opt/martbase"
    echo "  sudo unzip -o /home/ubuntu/martbase-deployment.zip -d /opt"
    echo "  sudo chown -R ubuntu:ubuntu /opt/martbase"
    echo "  cd /opt/martbase/martbase"
    echo "  ./master.sh upgrade   # or ./master.sh install for fresh install"
else
    info "Step 3: Skipping transfer (use --transfer to enable)"
fi

echo ""
echo "=============================================="
ok "Build and deploy complete!"
echo "=============================================="
echo ""
echo "Package location: ${OUTPUT_DIR}/${ZIP_NAME}"
echo ""
echo "To transfer to VM manually:"
echo "  multipass transfer ${OUTPUT_DIR}/${ZIP_NAME} ${VM_NAME}:/home/ubuntu/"
echo ""
