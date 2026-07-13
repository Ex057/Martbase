# Martbase Multipass Deployment Status

**Date**: 2026-07-08
**VM IP**: 192.168.2.2
**Status**: ⚠️ INCORRECT DEPLOYMENT - Vanilla Superset installed instead of Martbase

---

## 🚨 Critical Issue Identified

The deployment script installed **vanilla Apache Superset** from PyPI instead of deploying the **customized Martbase application** from the codebase.

### What Went Wrong

1. **Wrong Installation Method**:
   - The `master.sh` script ran `pip install apache-superset`
   - This installed the official Superset package from PyPI
   - Our custom code in `/opt/martbase/superset/` was ignored

2. **Missing Custom Features**:
   - ❌ DHIS2 integrations (maps, visualizations, period formatting)
   - ❌ Role-based home pages
   - ❌ CMS Admin and Public Landing Pages
   - ❌ Custom authentication and security settings
   - ❌ AI Insights features
   - ❌ All frontend customizations

3. **Database Configuration**:
   - PostgreSQL was created correctly
   - But migrations ran against vanilla Superset schema
   - Missing custom tables for our features

4. **Current State**:
   - Vanilla Superset is running at http://192.168.2.2
   - Login page accessible but it's NOT Martbase
   - All our custom work from the codebase is unused

---

## 📋 Root Cause Analysis

### Issue 1: Installation Script Logic

The `master.sh` script has this sequence:

```bash
# Creates virtual environment
python3 -m venv venv

# WRONG: Installs vanilla Superset from PyPI
pip install apache-superset

# Should instead: Install from local source
pip install -e .
```

### Issue 2: Missing setup.py Installation

The deployment package includes `setup.py` but the script never runs:

```bash
pip install -e /opt/martbase/
```

This would install Martbase (our customized version) instead of vanilla Superset.

### Issue 3: Frontend Not Connected

Even if backend was installed correctly:
- Frontend assets in `superset-frontend/dist/` exist
- But they're not copied to the right location
- Superset is serving its own bundled frontend

---

## ✅ What IS Working

1. ✅ Multipass VM created successfully (4 CPU, 8GB RAM, 40GB disk)
2. ✅ Ubuntu 22.04 LTS running
3. ✅ PostgreSQL installed and database created
4. ✅ Redis installed and running
5. ✅ Nginx configured as reverse proxy
6. ✅ Systemd services created (martbase-web, martbase-worker, martbase-beat)
7. ✅ Python virtual environment created
8. ✅ Network accessible from host Mac

---

## 🔧 Required Fixes

### Fix 1: Update master.sh Installation Logic

**Location**: `/Users/edwinarinda/Projects/Martbase/master.sh`

**Current problematic code** (around line 450-500):
```bash
install_python_dependencies() {
    info "Installing Python dependencies"
    source venv/bin/activate
    pip install --upgrade pip setuptools wheel
    pip install apache-superset  # ← WRONG
    pip install -r requirements/base.txt
}
```

**Should be**:
```bash
install_python_dependencies() {
    info "Installing Python dependencies"
    source venv/bin/activate
    pip install --upgrade pip setuptools wheel

    # Install Martbase from local source (NOT from PyPI)
    pip install -e .

    # Install additional requirements
    if [[ -f requirements/base.txt ]]; then
        pip install -r requirements/base.txt
    fi
}
```

### Fix 2: Ensure Frontend Assets Are Copied

The script should:
1. Check if `superset-frontend/dist/` exists (pre-built)
2. Copy to `superset/static/assets/`
3. OR build frontend on server if dist doesn't exist

### Fix 3: Database Schema

After fixing installation:
1. Drop current PostgreSQL database
2. Recreate empty database
3. Run migrations for CUSTOM Martbase schema
4. Initialize with custom roles and settings

---

## 📝 Action Plan to Fix Deployment

### Phase 1: Fix Deployment Scripts (On Mac)

- [ ] **Task 1.1**: Update `master.sh` to install from local source
  - Change `pip install apache-superset` → `pip install -e .`
  - Add proper error handling
  - File: `master.sh` lines ~450-500

- [ ] **Task 1.2**: Fix frontend deployment in `master.sh`
  - Ensure frontend assets copy correctly
  - Add validation that custom frontend exists
  - File: `master.sh` lines ~600-650

- [ ] **Task 1.3**: Update `prepare-deployment.sh`
  - Verify it includes all custom code
  - Check setup.py is included
  - File: `prepare-deployment.sh`

- [ ] **Task 1.4**: Test deployment package locally
  - Extract ZIP to temporary location
  - Verify setup.py works: `pip install -e .`
  - Check all custom modules importable

### Phase 2: Clean Up VM (Inside VM)

- [ ] **Task 2.1**: Stop all Martbase services
  ```bash
  cd /opt/martbase/martbase
  ./master.sh stop
  ```

- [ ] **Task 2.2**: Drop and recreate PostgreSQL database
  ```bash
  sudo -u postgres psql -c "DROP DATABASE martbase;"
  sudo -u postgres psql -c "CREATE DATABASE martbase OWNER martbase ENCODING 'UTF8';"
  ```

- [ ] **Task 2.3**: Clean Python virtual environment
  ```bash
  cd /opt/martbase
  rm -rf venv/
  # Will recreate during reinstall
  ```

- [ ] **Task 2.4**: Remove SQLite database if exists
  ```bash
  find /opt/martbase -name "*.db" -delete
  ```

### Phase 3: Redeploy Martbase (Mac → VM)

- [ ] **Task 3.1**: Create new deployment package on Mac
  ```bash
  cd /Users/edwinarinda/Projects/Martbase
  ./prepare-deployment.sh
  ```

- [ ] **Task 3.2**: Transfer to VM
  ```bash
  multipass transfer deployment/martbase-deployment.zip martbase:/home/ubuntu/martbase-v2.zip
  ```

- [ ] **Task 3.3**: Extract on VM
  ```bash
  cd /opt/martbase
  sudo unzip -o /home/ubuntu/martbase-v2.zip -d /opt
  sudo chown -R ubuntu:ubuntu /opt/martbase
  ```

- [ ] **Task 3.4**: Run FIXED installation
  ```bash
  cd /opt/martbase/martbase
  DOMAIN=martbase.local ADMIN_PASSWORD='YourSecurePassword' ./master.sh install
  ```

### Phase 4: Verification

- [ ] **Task 4.1**: Verify custom code is installed
  ```bash
  source venv/bin/activate
  python -c "from superset.dhis2 import admin_views; print('DHIS2 modules found!')"
  python -c "from superset.public_page import api; print('Public page modules found!')"
  ```

- [ ] **Task 4.2**: Check database has custom tables
  ```bash
  sudo -u postgres psql -d martbase -c "\dt" | grep -E "(public_pages|ai_insights|dhis2)"
  ```

- [ ] **Task 4.3**: Verify frontend customizations
  ```bash
  ls -la /opt/martbase/superset/static/assets/
  # Should show custom bundles, not vanilla Superset
  ```

- [ ] **Task 4.4**: Test application access
  - Open http://192.168.2.2
  - Login with admin credentials
  - Check Settings → CMS Admin exists
  - Check Settings → AI Insights exists
  - Verify DHIS2 map visualizations available

---

## 🎯 Success Criteria

After redeployment, we should see:

1. ✅ CMS Admin menu in Settings
2. ✅ AI Insights configuration
3. ✅ Public Landing Pages accessible
4. ✅ DHIS2 visualization types in chart creation
5. ✅ Role-based home page settings
6. ✅ Custom themes and branding
7. ✅ Database tables: `public_pages`, `ai_insights_settings`, etc.

---

## 📌 Current Credentials

**VM Access**:
- IP: 192.168.2.2
- SSH: `multipass shell martbase`

**Database**:
- Host: 127.0.0.1:5432
- Database: martbase
- User: martbase
- Password: db2b0ed5ba860867e9706f27e62536ce65ec

**Application** (after fix):
- URL: http://192.168.2.2 or http://martbase.local
- Username: admin
- Password: (will set during redeploy)

---

## 🔍 Key Files to Review

1. `/Users/edwinarinda/Projects/Martbase/master.sh` - Main deployment script
2. `/Users/edwinarinda/Projects/Martbase/prepare-deployment.sh` - Package creator
3. `/Users/edwinarinda/Projects/Martbase/setup.py` - Python package definition
4. `/Users/edwinarinda/Projects/Martbase/superset_config.py` - Custom Superset config

---

## 📞 Next Steps

**IMMEDIATE**:
1. Fix `master.sh` installation logic on Mac
2. Update deployment checklist (below)
3. Test package creation
4. Redeploy to VM

**AFTER SUCCESSFUL DEPLOYMENT**:
1. Backup database regularly
2. Document custom features
3. Create upgrade procedure
4. Test all DHIS2 integrations

---

**Last Updated**: 2026-07-08
**Next Action**: Fix master.sh script
