# Martbase Redeployment Checklist

**Goal**: Deploy CUSTOM Martbase (not vanilla Superset) to Multipass VM

---

## ✅ Pre-Deployment (On Mac)

### 1. Fix Deployment Scripts

- [ ] **Fix master.sh installation logic**
  - [ ] Change `pip install apache-superset` to `pip install -e .`
  - [ ] Verify setup.py is being used
  - [ ] Test locally if possible

- [ ] **Verify setup.py is correct**
  - [ ] Check it includes all custom packages
  - [ ] Ensure entry points are defined
  - [ ] Verify version and dependencies

- [ ] **Build frontend (optional but recommended)**
  ```bash
  cd superset-frontend
  npm install
  npm run build
  cd ..
  ```

- [ ] **Create deployment package**
  ```bash
  ./prepare-deployment.sh
  ```

- [ ] **Verify package contents**
  ```bash
  unzip -l deployment/martbase-deployment.zip | grep -E "(setup.py|superset/dhis2|superset/public_page)"
  ```

---

## 🧹 Clean VM (Inside Multipass VM)

### 2. Stop Services

```bash
multipass shell martbase
cd /opt/martbase/martbase
./master.sh stop
```

### 3. Clean Database

```bash
# Drop existing database
sudo -u postgres psql -c "DROP DATABASE IF EXISTS martbase;"

# Recreate clean database
sudo -u postgres psql -c "CREATE DATABASE martbase OWNER martbase ENCODING 'UTF8';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE martbase TO martbase;"

# Verify
sudo -u postgres psql -l | grep martbase
```

### 4. Clean Installation Directory

```bash
# Stop services if still running
cd /opt/martbase/martbase
./master.sh stop 2>/dev/null || true

# Remove virtual environment
cd /opt/martbase
rm -rf venv/

# Remove SQLite files if any
find /opt/martbase -name "*.db" -type f -delete

# Keep config and .env, but remove Python cache
find /opt/martbase -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find /opt/martbase -name "*.pyc" -delete 2>/dev/null || true

# Exit VM for now
exit
```

---

## 📦 Transfer New Package (On Mac)

### 5. Upload Fixed Package

```bash
# Transfer new deployment package
multipass transfer deployment/martbase-deployment.zip martbase:/home/ubuntu/martbase-fixed.zip

# Verify transfer
multipass exec martbase -- ls -lh /home/ubuntu/martbase-fixed.zip
```

---

## 🚀 Redeploy (Inside Multipass VM)

### 6. Extract Package

```bash
multipass shell martbase

# Extract (overwrite existing files)
cd /opt
sudo unzip -o /home/ubuntu/martbase-fixed.zip -d /opt

# Set ownership
sudo chown -R ubuntu:ubuntu /opt/martbase

# Navigate to installation
cd /opt/martbase/martbase
```

### 7. Run Installation

```bash
# Set admin password and install
DOMAIN=martbase.local \
ADMIN_EMAIL=admin@martbase.local \
ADMIN_PASSWORD='YourSecurePassword123!' \
./master.sh install
```

**Watch for**:
- ✅ Should say "Installing Martbase from local source" (not "apache-superset from PyPI")
- ✅ Frontend build or asset copy
- ✅ PostgreSQL migrations (not SQLite)
- ✅ Admin user creation
- ❌ Any errors about missing modules

### 8. Monitor Installation

Installation should take 10-30 minutes. Watch for these stages:

1. System packages (Node.js, PostgreSQL, Redis, Nginx)
2. Python virtual environment creation
3. **Installing Martbase from source** (`pip install -e .`)
4. Installing requirements
5. Frontend build/copy
6. Database migrations (`superset db upgrade`)
7. Database init (`superset init`)
8. Creating admin user
9. Starting services

---

## ✅ Verification (Inside VM)

### 9. Verify Custom Code Installed

```bash
# Activate virtual environment
source /opt/martbase/venv/bin/activate

# Check custom modules exist
python -c "from superset.dhis2.admin_views import DHIS2AdminView; print('✅ DHIS2 module found')"
python -c "from superset.public_page.api import PublicPageRestApi; print('✅ Public page module found')"
python -c "from superset.ai_insights.admin_api import AIInsightsAdmin; print('✅ AI insights module found')"

# Check version
python -c "import superset; print(f'Superset version: {superset.__version__}')"

# Verify it's NOT vanilla Superset (should fail or show custom version)
```

### 10. Verify Database Schema

```bash
# Check for custom tables
sudo -u postgres psql -d martbase -c "\dt" | grep -E "(public_pages|ai_insights|dhis2)"

# Should see tables like:
# - public_pages
# - public_page_blocks
# - ai_insights_settings
# - (possibly dhis2_* tables)
```

### 11. Verify Services Running

```bash
cd /opt/martbase/martbase
./master.sh status

# All services should show "active (running)"
# Check logs for errors
sudo journalctl -u martbase-web -n 50 --no-pager
```

### 12. Verify Frontend Assets

```bash
# Check static assets directory
ls -la /opt/martbase/superset/static/assets/

# Should contain custom built files
# Look for timestamps matching your build time
```

---

## 🌐 Browser Testing (On Mac)

### 13. Access Application

1. Open browser: `http://192.168.2.2`
2. Should see login page
3. Login with:
   - Username: `admin`
   - Password: `YourSecurePassword123!` (or what you set)

### 14. Verify Custom Features

After login, check:

- [ ] **Settings Menu** has these additional items:
  - [ ] CMS Admin
  - [ ] AI Insights
  - [ ] Portal Settings

- [ ] **Create Chart** shows DHIS2 visualizations:
  - [ ] DHIS2 Map
  - [ ] Small Multiples
  - [ ] Age-Sex Pyramid
  - [ ] Control Chart

- [ ] **Dashboard** features:
  - [ ] Check if custom themes work
  - [ ] Period formatting shows properly

- [ ] **Public Pages**:
  - [ ] Navigate to Settings → CMS Admin
  - [ ] Try creating a public page
  - [ ] Access public page while logged out

---

## 🚨 Troubleshooting

### If you see "ModuleNotFoundError" for custom modules

```bash
# Check what's actually installed
pip list | grep -i superset

# Should show:
# apache-superset   X.X.X    /opt/martbase
# (Note the path - means installed from local source)

# If it shows PyPI path, reinstall:
pip uninstall apache-superset -y
cd /opt/martbase
pip install -e .
```

### If database migrations fail

```bash
# Check database connection
PGPASSWORD=db2b0ed5ba860867e9706f27e62536ce65ec \
psql -h 127.0.0.1 -U martbase -d martbase -c "SELECT 1;"

# Set environment and retry
export SQLALCHEMY_DATABASE_URI="postgresql+psycopg2://martbase:db2b0ed5ba860867e9706f27e62536ce65ec@127.0.0.1:5432/martbase"
export SUPERSET_CONFIG_PATH=/opt/martbase/config/superset_config.py

superset db upgrade
```

### If frontend is missing

```bash
# Check if dist folder exists
ls -la /opt/martbase/superset-frontend/dist/

# If not, build it:
cd /opt/martbase/superset-frontend
npm install
npm run build

# Copy to static
cp -r dist/* /opt/martbase/superset/static/assets/

# Restart
cd /opt/martbase/martbase
./master.sh restart
```

---

## ✅ Success Criteria

You'll know deployment succeeded when:

1. ✅ Login page shows custom branding (if any)
2. ✅ Settings menu has CMS Admin, AI Insights
3. ✅ DHIS2 map visualization available
4. ✅ Can create and view public pages
5. ✅ Role-based home page settings exist
6. ✅ No "ModuleNotFoundError" in logs
7. ✅ Database has custom tables

---

## 📋 Post-Deployment Tasks

After successful deployment:

- [ ] **Configure Public Landing Page**
  - Settings → CMS Admin → Create welcome page

- [ ] **Set Up Role-Based Home Pages**
  - Settings → Portal Settings → Configure home dashboards per role

- [ ] **Test DHIS2 Integrations**
  - Create DHIS2 data source
  - Test map visualization
  - Verify period formatting

- [ ] **Backup Database**
  ```bash
  sudo -u postgres pg_dump martbase > ~/martbase-backup-$(date +%Y%m%d).sql
  multipass transfer martbase:/home/ubuntu/martbase-backup-*.sql ~/Downloads/
  ```

- [ ] **Document Admin Credentials**
  - Save username/password securely
  - Note VM IP address
  - Record database password

---

## 🔄 If Complete Rebuild Needed

If things are too broken, start fresh:

```bash
# On Mac - delete VM
multipass delete martbase
multipass purge

# Start from scratch
multipass launch 22.04 --name martbase --cpus 4 --memory 8G --disk 40G

# Follow deployment guide with FIXED scripts
```

---

**Last Updated**: 2026-07-08
**Status**: Ready to execute after master.sh is fixed
