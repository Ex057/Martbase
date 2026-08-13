# Martbase Deployment Guide

**Complete guide for deploying Martbase (customized Apache Superset) to a Multipass Ubuntu VM**

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Detailed Deployment Steps](#detailed-deployment-steps)
4. [Build Process](#build-process)
5. [VM Configuration](#vm-configuration)
6. [Database Setup](#database-setup)
7. [Service Management](#service-management)
8. [LocalAI Setup](#localai-setup)
9. [Troubleshooting](#troubleshooting)
10. [Migration Fixes Reference](#migration-fixes-reference)

---

## Prerequisites

### On Mac (Development Machine)

- **Node.js** 18+ and npm
- **Multipass** (for VM management): `brew install multipass`
- **Git** for version control

### On VM (Production Server)

Automatically installed by `master.sh`:
- Ubuntu 22.04 LTS
- Python 3.10+
- PostgreSQL 14+
- Redis
- Nginx
- Node.js 18+ (if building frontend on server)

### Minimum VM Resources

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB | 40 GB |

---

## Quick Start

### Step 1: Create Multipass VM

```bash
multipass launch 22.04 --name martbase --cpus 4 --memory 8G --disk 40G
```

### Step 2: Build and Package (on Mac)

```bash
cd /path/to/Martbase
./build-and-deploy.sh --transfer
```

### Step 3: Install on VM

```bash
multipass shell martbase
cd /opt/martbase
sudo unzip -o /home/ubuntu/martbase-deployment.zip -d /opt
sudo chown -R ubuntu:ubuntu /opt/martbase
cd /opt/martbase/martbase

DOMAIN=martbase.local \
ADMIN_EMAIL=admin@martbase.local \
ADMIN_PASSWORD='YourSecurePassword123!' \
./master.sh install
```

### Step 4: Access Application

- **URL**: http://VM_IP (get IP with `multipass info martbase`)
- **Username**: admin
- **Password**: (what you set above)

---

## Detailed Deployment Steps

### Phase 1: Build Frontend on Mac

Build the frontend on Mac (not on VM) to avoid memory issues:

```bash
cd /path/to/Martbase/superset-frontend
npm ci --legacy-peer-deps
npm run build
```

**Note**: The build output goes to `superset/static/assets/`, not `superset-frontend/dist/`.

### Phase 2: Create Deployment Package

Use the automated script:

```bash
./build-and-deploy.sh
```


Or with options:

```bash
# Skip frontend build (use existing assets)
./build-and-deploy.sh --skip-frontend

# Build and transfer to VM
./build-and-deploy.sh --transfer

# Transfer to different VM
./build-and-deploy.sh --transfer --vm myvm
```

The package is created at: `deployment/martbase-deployment.zip`

### Phase 3: Transfer to VM

**Option A: Using automated script**
```bash
./build-and-deploy.sh --transfer
```

**Option B: Manual transfer**
```bash
multipass transfer deployment/martbase-deployment.zip martbase:/home/ubuntu/
```

### Phase 4: Install on VM

```bash
multipass shell martbase

# Extract package
cd /opt
sudo unzip -o /home/ubuntu/martbase-deployment.zip -d /opt
sudo chown -R ubuntu:ubuntu /opt/martbase
cd /opt/martbase/martbase

# Run installation


```

---

## Build Process

### build-and-deploy.sh Options

| Option | Description |
|--------|-------------|
| `--skip-frontend` | Skip npm build, use existing assets |
| `--skip-package` | Skip ZIP creation |
| `--transfer` | Transfer to VM after build |
| `--vm NAME` | Specify VM name (default: martbase) |
| `-h, --help` | Show help |

### What Gets Packaged

- `superset/` - Python backend with pre-built frontend assets
- `superset-frontend/` - Frontend source (for rebuilds)
- `superset-core/` - Core library dependency
- `requirements/` - Python dependencies
- `scripts/` - Utility scripts (LocalAI, etc.)
- `master.sh` - Deployment script
- Configuration files (setup.py, pyproject.toml, etc.)

---

## VM Configuration

### Create New VM

```bash
multipass launch 22.04 --name martbase --cpus 4 --memory 8G --disk 40G
```

### Access VM

```bash
multipass shell martbase
```

### Get VM IP

```bash
multipass info martbase | grep IPv4
```

### Delete and Recreate VM

```bash
multipass delete martbase
multipass purge
multipass launch 22.04 --name martbase --cpus 4 --memory 8G --disk 40G
```

---

## Database Setup

### PostgreSQL Configuration

The installation automatically creates:
- Database: `martbase`
- User: `martbase`
- Password: auto-generated (stored in `/opt/martbase/config/.env`)

### Manual Database Commands

```bash
# Connect to database
sudo -u postgres psql -d martbase

# List tables
\dt

# Check custom tables exist
\dt | grep -E "(public_pages|ai_insights|dhis2)"

# Exit
\q
```

### Reset Database

```bash
# Drop and recreate
sudo -u postgres psql -c "DROP DATABASE IF EXISTS martbase;"
sudo -u postgres psql -c "CREATE DATABASE martbase OWNER martbase ENCODING 'UTF8';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE martbase TO martbase;"

# Run migrations
source /opt/martbase/venv/bin/activate
cd /opt/martbase/martbase
superset db upgrade
superset init
```

---

## Service Management

### master.sh Commands

```bash
cd /opt/martbase/martbase

./master.sh start     # Start all services
./master.sh stop      # Stop all services
./master.sh restart   # Restart all services
./master.sh status    # Show service status
./master.sh install   # Fresh installation
./master.sh upgrade   # Upgrade existing installation
```

### Systemd Services

| Service | Description |
|---------|-------------|
| `martbase-web` | Gunicorn web server |
| `martbase-worker` | Celery worker |
| `martbase-beat` | Celery beat scheduler |

### Manual Service Control

```bash
# Check service status
sudo systemctl status martbase-web
sudo systemctl status martbase-worker
sudo systemctl status martbase-beat

# Restart individual service
sudo systemctl restart martbase-web

# View logs
sudo journalctl -u martbase-web -f
sudo journalctl -u martbase-worker -f
```

---

## LocalAI Setup

LocalAI provides self-hosted AI capabilities for Martbase.

### Installation

```bash
cd /opt/martbase/martbase/scripts
./setup_localai.sh install
```

### Management

```bash
./setup_localai.sh start   # Start LocalAI
./setup_localai.sh stop    # Stop LocalAI
./setup_localai.sh status  # Check status
```

### Configuration

After starting LocalAI:
1. Go to Settings → AI Insights in Martbase
2. Select "LocalAI" as the provider
3. Configure the endpoint (default: http://127.0.0.1:39671)

---

## ClickHouse Setup

ClickHouse provides high-performance columnar storage for DHIS2 data staging and serving.

### Automatic Installation

ClickHouse is automatically installed during `./master.sh install` when `CLICKHOUSE_ENABLED=1` (default).

### Manual Installation

```bash
# Install ClickHouse
sudo apt-get install -y apt-transport-https ca-certificates curl gnupg
curl -fsSL 'https://packages.clickhouse.com/rpm/lts/repodata/repomd.xml.key' | sudo gpg --dearmor -o /usr/share/keyrings/clickhouse-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/clickhouse-keyring.gpg] https://packages.clickhouse.com/deb stable main" | sudo tee /etc/apt/sources.list.d/clickhouse.list
sudo apt-get update
sudo apt-get install -y clickhouse-server clickhouse-client

# Start ClickHouse
sudo systemctl enable --now clickhouse-server
```

### Configuration

Default ports (to avoid conflicts):
- HTTP port: 8124 (default ClickHouse uses 8123)
- TCP port: 9001 (default ClickHouse uses 9000)

Environment variables:
```bash
CLICKHOUSE_HOST=127.0.0.1
CLICKHOUSE_HTTP_PORT=8124
CLICKHOUSE_DB=dhis2_staging
CLICKHOUSE_SERVING_DB=dhis2_serving
CLICKHOUSE_USER=dhis2_user
CLICKHOUSE_PASSWORD=<auto-generated>
```

### Verify ClickHouse

```bash
# Check service status
sudo systemctl status clickhouse-server

# Test connection
clickhouse-client --port 9001 --query "SELECT 1"

# List databases
clickhouse-client --port 9001 --query "SHOW DATABASES"
```

### Disable ClickHouse

To skip ClickHouse installation:
```bash
CLICKHOUSE_ENABLED=0 ./master.sh install
```

---

## UI Service Controls

The Local Staging Settings page allows you to restart services directly from the UI.

### Enable UI Restart Controls

The restart controls require the `superset-manager.sh` script, which is automatically created during installation at `/opt/martbase/superset-manager.sh`.

Environment variables that enable the controls:
```bash
LOCAL_STAGING_RESTART_BACKEND_COMMAND=bash /opt/martbase/superset-manager.sh restart
LOCAL_STAGING_RESTART_CELERY_COMMAND=bash /opt/martbase/superset-manager.sh restart-celery
```

### Manual Script Creation

If the script is missing:
```bash
cat > /opt/martbase/superset-manager.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  restart)
    sudo systemctl restart martbase-web
    ;;
  restart-celery)
    sudo systemctl restart martbase-worker martbase-beat
    ;;
  start)
    sudo systemctl start martbase-web martbase-worker martbase-beat
    ;;
  stop)
    sudo systemctl stop martbase-web martbase-worker martbase-beat
    ;;
  status)
    sudo systemctl status martbase-web martbase-worker martbase-beat --no-pager || true
    ;;
esac
EOF
chmod +x /opt/martbase/superset-manager.sh
```

---

## Troubleshooting

### Common Issues and Solutions

#### 1. ModuleNotFoundError for custom modules

**Symptom**: `ImportError: cannot import name 'xxx' from 'superset'`

**Solution**: Ensure local source installation:
```bash
source /opt/martbase/venv/bin/activate
pip uninstall apache-superset -y
cd /opt/martbase/martbase
pip install -e .
```

#### 2. Frontend shows spinner / 404 errors

**Symptom**: Application loads but shows spinner, browser shows 404 for assets

**Solution**: Frontend assets not built. Build on Mac and redeploy:
```bash
# On Mac
cd /path/to/Martbase
./build-and-deploy.sh --transfer

# On VM
cd /opt/martbase
sudo unzip -o /home/ubuntu/martbase-deployment.zip -d /opt
./master.sh restart
```

#### 3. Database migration errors

**Symptom**: Various migration errors during `superset db upgrade`

See [Migration Fixes Reference](#migration-fixes-reference) below.

#### 4. Admin user not found

**Symptom**: Cannot login, "User admin not found"

**Solution**: Create admin user:
```bash
source /opt/martbase/venv/bin/activate
superset fab create-admin \
  --username admin \
  --firstname Admin \
  --lastname User \
  --email admin@martbase.local \
  --password 'YourSecurePassword123!'
```

#### 5. Services not starting

**Symptom**: `./master.sh status` shows services as failed

**Solution**: Check logs and restart:
```bash
sudo journalctl -u martbase-web -n 100 --no-pager
./master.sh restart
```

#### 6. Permission denied errors

**Symptom**: Permission denied on database or files

**Solution**: Fix ownership:
```bash
sudo chown -R ubuntu:ubuntu /opt/martbase
```

#### 7. ClickHouse connection refused

**Symptom**: `ClickHouse error: HTTPConnectionPool...Connection refused`

**Solution**: Check ClickHouse is running and using correct port:
```bash
# Check service status
sudo systemctl status clickhouse-server

# Start if not running
sudo systemctl start clickhouse-server

# Test connection (note: uses custom port 8124)
curl http://127.0.0.1:8124/ping

# Verify databases exist
clickhouse-client --port 9001 --query "SHOW DATABASES"
```

#### 8. Restart command not configured

**Symptom**: UI shows "Restart command not configured" for web server or Celery

**Solution**: Ensure superset-manager.sh exists and env vars are set:
```bash
# Check script exists
ls -la /opt/martbase/superset-manager.sh

# If missing, create it
./master.sh upgrade

# Or manually create it (see UI Service Controls section)
```

#### 9. Map tiles 404 errors

**Symptom**: DHIS2Map or UGMaps show 404 errors for GeoJSON files

**Solution**: Ensure frontend assets were built and deployed:
```bash
# On Mac - rebuild frontend
cd /path/to/Martbase
./build-and-deploy.sh --transfer

# On VM - check assets exist
ls /opt/martbase/martbase/superset/static/assets/*.geojson | wc -l
# Should show > 100 files

# Restart Nginx to clear cache
sudo systemctl restart nginx
```

### Verify Installation

```bash
source /opt/martbase/venv/bin/activate

# Check custom modules
python -c "from superset.dhis2.admin_views import DHIS2AdminView; print('✅ DHIS2 module')"
python -c "from superset.public_page.api import PublicPageRestApi; print('✅ Public page module')"
python -c "from superset.ai_insights.admin_api import AIInsightsAdmin; print('✅ AI insights module')"

# Check version
python -c "import superset; print(f'Version: {superset.__version__}')"
```

---

## Migration Fixes Reference

During deployment, these PostgreSQL-specific migration issues may occur. The fixes have been applied to the codebase.

### 1. Boolean Syntax (SQLite vs PostgreSQL)

**Error**: `operator does not exist: boolean = integer`

**Files affected**:
- `superset/migrations/versions/2026_03_20_public_portal_cms_admin_v2.py`
- `superset/migrations/versions/2026-03-27_00-06_87fd02a1b791_disable_sqllab_for_dhis2.py`

**Fix**: Changed `= 1` / `= 0` to `= TRUE` / `= FALSE`

### 2. Identifier Length Limit

**Error**: `identifier "fk_public_page_section_styles_style_bundle_id_..." is too long`

**File affected**: `superset/migrations/versions/2026_03_21_public_portal_design_system_v3.py`

**Fix**: Shortened FK constraint names to under 63 characters:
- `fk_pages_style_bundle_id`
- `fk_sections_style_bundle_id`
- `fk_components_style_bundle_id`

### 3. Alembic Version Column Too Short

**Error**: `StringDataRightTruncation` on alembic_version table

**Fix**: Create alembic_version with larger column:
```sql
DROP TABLE IF EXISTS alembic_version;
CREATE TABLE alembic_version (
    version_num VARCHAR(255) NOT NULL,
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);
GRANT ALL ON alembic_version TO martbase;
```

### 4. Deadlock During Migration

**Error**: `DeadlockDetected` during migration

**Fix**: Stop services and kill connections:
```bash
./master.sh stop
sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'martbase' AND pid <> pg_backend_pid();"
superset db upgrade
```

---

## Verification Checklist

After successful deployment, verify:

- [ ] Login page loads at http://VM_IP
- [ ] Can login with admin credentials
- [ ] Settings menu has:
  - [ ] CMS Admin
  - [ ] AI Insights
  - [ ] Portal Settings
- [ ] Create Chart shows DHIS2 visualizations:
  - [ ] DHIS2 Map
  - [ ] Small Multiples
  - [ ] Age-Sex Pyramid
  - [ ] Control Chart
- [ ] Database has custom tables:
  ```bash
  sudo -u postgres psql -d martbase -c "\dt" | grep -E "(public_pages|ai_insights)"
  ```
- [ ] No errors in service logs:
  ```bash
  sudo journalctl -u martbase-web -n 50 --no-pager | grep -i error
  ```

---

## Credentials Reference

### VM Access
```
SSH: multipass shell martbase
```

### Database
```
Host: 127.0.0.1:5432
Database: martbase
User: martbase
Password: (in /opt/martbase/config/.env)
```

### Application
```
URL: http://VM_IP
Username: admin
Password: (set during install)
```

---

## Backup and Recovery

### Backup Database

```bash
# On VM
sudo -u postgres pg_dump martbase > ~/martbase-backup-$(date +%Y%m%d).sql

# Transfer to Mac
multipass transfer martbase:/home/ubuntu/martbase-backup-*.sql ~/Downloads/
```

### Restore Database

```bash
# On VM
sudo -u postgres psql -c "DROP DATABASE IF EXISTS martbase;"
sudo -u postgres psql -c "CREATE DATABASE martbase OWNER martbase ENCODING 'UTF8';"
sudo -u postgres psql -d martbase < ~/martbase-backup-YYYYMMDD.sql
```

---

**Last Updated**: 2026-07-08
