#!/usr/bin/env bash
set -Eeuo pipefail

# ==============================================================================
# Martbase Deployment Package Creator
# Creates a clean ZIP file for deployment to Multipass server
# ==============================================================================

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${BLUE}[INFO]${NC} $*"; }
ok() { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }

PROJECT_DIR="$(pwd)"
OUTPUT_DIR="${PROJECT_DIR}/deployment"
ZIP_NAME="martbase-deployment.zip"
TEMP_DIR="${OUTPUT_DIR}/martbase"

info "Creating deployment package for Martbase"
info "Source: ${PROJECT_DIR}"
info "Output: ${OUTPUT_DIR}/${ZIP_NAME}"

# Clean up previous builds
rm -rf "${OUTPUT_DIR}"
mkdir -p "${TEMP_DIR}"

# Copy essential directories
info "Copying Python backend..."
rsync -a --exclude='__pycache__' \
         --exclude='*.pyc' \
         --exclude='*.pyo' \
         --exclude='.pytest_cache' \
         --exclude='*.egg-info' \
         "${PROJECT_DIR}/superset/" "${TEMP_DIR}/superset/"

info "Copying requirements..."
mkdir -p "${TEMP_DIR}/requirements"
cp -r "${PROJECT_DIR}/requirements/"* "${TEMP_DIR}/requirements/"

info "Copying configuration files..."
[[ -f "${PROJECT_DIR}/setup.py" ]] && cp "${PROJECT_DIR}/setup.py" "${TEMP_DIR}/"
[[ -f "${PROJECT_DIR}/pyproject.toml" ]] && cp "${PROJECT_DIR}/pyproject.toml" "${TEMP_DIR}/"
[[ -f "${PROJECT_DIR}/setup.cfg" ]] && cp "${PROJECT_DIR}/setup.cfg" "${TEMP_DIR}/"
[[ -f "${PROJECT_DIR}/MANIFEST.in" ]] && cp "${PROJECT_DIR}/MANIFEST.in" "${TEMP_DIR}/"
[[ -f "${PROJECT_DIR}/babel.cfg" ]] && cp "${PROJECT_DIR}/babel.cfg" "${TEMP_DIR}/"

# Copy frontend source (always needed)
info "Copying frontend source..."
rsync -a --exclude='node_modules' \
         --exclude='build' \
         --exclude='.webpack' \
         --exclude='.cache' \
         --exclude='.next' \
         --exclude='.eslintcache' \
         "${PROJECT_DIR}/superset-frontend/" "${TEMP_DIR}/superset-frontend/"

# Copy pre-built dist if available (skips build on server)
if [[ -d "${PROJECT_DIR}/superset-frontend/dist" ]] && [[ -n "$(ls -A ${PROJECT_DIR}/superset-frontend/dist 2>/dev/null)" ]]; then
    info "Including pre-built frontend assets (will skip build on server)"
    cp -r "${PROJECT_DIR}/superset-frontend/dist" "${TEMP_DIR}/superset-frontend/"
fi

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

# Copy superset-core if it exists (required dependency)
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

# Copy deployment script
info "Copying deployment script..."
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
    rsync -a --exclude='*.mo' \
             --exclude='*.pot' \
             "${PROJECT_DIR}/superset/translations/" "${TEMP_DIR}/superset/translations/"
fi

# Create README for deployment
info "Creating deployment README..."
cat > "${TEMP_DIR}/DEPLOY.md" <<'EOF'
# Martbase Deployment Package

## Contents
- `superset/` - Python backend application
- `superset-frontend/` - Frontend application (source or pre-built)
- `requirements/` - Python dependencies
- `master.sh` - Deployment script
- `setup.py` / `pyproject.toml` - Package configuration

## Quick Start on Multipass VM

1. Extract this package:
   ```bash
   sudo mkdir -p /opt/martbase
   sudo unzip martbase-deployment.zip -d /opt
   sudo chown -R $USER:$USER /opt/martbase
   cd /opt/martbase
   ```

2. Run installation:
   ```bash
   DOMAIN=martbase.local \
   ADMIN_EMAIL=admin@martbase.local \
   ADMIN_PASSWORD='YourStrongPassword' \
   ./master.sh install
   ```

3. Check status:
   ```bash
   ./master.sh status
   ```

4. Access the application:
   - URL: http://martbase.local (or http://VM_IP)
   - Username: admin
   - Password: (what you set above)

## Commands

- `./master.sh install` - Initial installation
- `./master.sh upgrade` - Upgrade existing installation
- `./master.sh start` - Start all services
- `./master.sh stop` - Stop all services
- `./master.sh restart` - Restart all services
- `./master.sh status` - Show service status

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
EOF

# Create size report
info "Calculating package size..."
cd "${OUTPUT_DIR}"
zip -r "${ZIP_NAME}" martbase/ -q

FILESIZE=$(du -h "${ZIP_NAME}" | cut -f1)
ok "Deployment package created: ${OUTPUT_DIR}/${ZIP_NAME}"
ok "Package size: ${FILESIZE}"

# Show contents summary
info "Package contents:"
echo "  - Backend: superset/"
echo "  - Frontend: superset-frontend/"
echo "  - Requirements: requirements/"
echo "  - Script: master.sh"
echo "  - Docs: DEPLOY.md"

# Create checksum
info "Generating checksum..."
if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${ZIP_NAME}" > "${ZIP_NAME}.sha256"
    ok "Checksum: $(cat ${ZIP_NAME}.sha256)"
elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${ZIP_NAME}" > "${ZIP_NAME}.sha256"
    ok "Checksum: $(cat ${ZIP_NAME}.sha256)"
fi

echo ""
ok "Deployment package ready!"
echo ""
echo "Next steps:"
echo "1. Copy ${OUTPUT_DIR}/${ZIP_NAME} to your Multipass VM"
echo "2. Follow instructions in DEPLOY.md inside the ZIP"
echo ""
