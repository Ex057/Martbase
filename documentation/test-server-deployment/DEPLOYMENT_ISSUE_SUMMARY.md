# Deployment Issue Summary

## 🚨 THE PROBLEM

**Line 216 in master.sh is installing vanilla Apache Superset from PyPI instead of your custom Martbase code.**

```bash
# Current (WRONG):
pip install apache-superset psycopg2-binary redis celery gevent gunicorn cachelib
```

This means:
- ❌ Vanilla Superset from PyPI gets installed
- ❌ Your custom code in `/opt/martbase/superset/` is ignored
- ❌ All DHIS2 features, CMS, AI Insights are missing
- ❌ Database schema is vanilla Superset, not Martbase

## ✅ THE FIX

**Remove `apache-superset` from line 216** and rely on the local installation that happens on line 220:

```bash
# Fixed (line 216):
pip install psycopg2-binary redis celery gevent gunicorn cachelib cachetools

# Then line 220 installs YOUR code:
pip install -e "$INSTALL_DIR"
```

## 📝 Complete Fix for master.sh

### Change Required

**File**: `/Users/edwinarinda/Projects/Martbase/master.sh`
**Line**: 216

**FROM**:
```bash
pip install apache-superset psycopg2-binary redis celery gevent gunicorn cachelib
```

**TO**:
```bash
pip install psycopg2-binary redis celery gevent gunicorn cachelib cachetools
```

**Explanation**:
- Removed `apache-superset` (don't install from PyPI)
- Added `cachetools` (was missing, caused errors)
- Keep other dependencies (psycopg2, redis, celery, etc.)

### Verification

After this change, the installation will:
1. Install base dependencies (line 216)
2. Install YOUR custom Martbase code (line 220: `pip install -e .`)
3. Deploy YOUR frontend
4. Use YOUR database schema
5. Include all YOUR custom features

---

## 🎯 Next Steps

1. **Fix the script** (make the change above)
2. **Test locally** (optional):
   ```bash
   python3 -m venv test-venv
   source test-venv/bin/activate
   pip install psycopg2-binary redis celery gevent gunicorn cachelib cachetools
   pip install -e .
   python -c "from superset.dhis2 import admin_views; print('SUCCESS!')"
   deactivate
   rm -rf test-venv
   ```
3. **Create new deployment package**:
   ```bash
   ./prepare-deployment.sh
   ```
4. **Follow REDEPLOYMENT_CHECKLIST.md** to redeploy to VM

---

## 📊 What You'll Get After Fix

### Custom Features That Will Work:

1. **DHIS2 Integration**
   - DHIS2 Map visualization
   - Small Multiples
   - Age-Sex Pyramid
   - Period formatting (202501 → "January 2025")
   - Organization unit handling

2. **CMS & Public Pages**
   - CMS Admin interface
   - Public Landing Pages
   - Block-based page builder
   - Public chart embeds

3. **AI Insights**
   - AI configuration interface
   - Insight generation
   - Custom analytics

4. **Role-Based Features**
   - Role-specific home pages
   - Per-role dashboard assignments
   - Custom End User role

5. **Custom Security & Auth**
   - Custom security manager
   - Enhanced permissions
   - Portal settings

### Database Tables You'll Have:

- `public_pages`
- `public_page_blocks`
- `ai_insights_settings`
- `portal_settings`
- All vanilla Superset tables PLUS your custom ones

---

## 🔍 How to Verify After Redeployment

### 1. Check Installed Package

```bash
# Inside VM after deployment
source /opt/martbase/venv/bin/activate
pip show apache-superset

# Should show:
# Location: /opt/martbase
# (NOT /opt/martbase/venv/lib/python3.10/site-packages)
```

### 2. Check Custom Modules

```bash
python -c "from superset.dhis2.admin_views import DHIS2AdminView; print('✅ DHIS2 works')"
python -c "from superset.public_page.api import PublicPageRestApi; print('✅ Public pages work')"
python -c "from superset.ai_insights.settings import AIInsightsSettings; print('✅ AI Insights works')"
```

### 3. Check Web Interface

- Login → Settings → Should see "CMS Admin" and "AI Insights"
- Create Chart → Should see DHIS2 visualizations
- Check database for custom tables

---

## ⏱️ Timeline

1. **Fix master.sh** - 2 minutes
2. **Create deployment package** - 3 minutes
3. **Transfer to VM** - 2 minutes
4. **Clean VM** - 5 minutes
5. **Redeploy** - 15-30 minutes
6. **Verification** - 10 minutes

**Total**: ~45-60 minutes for complete fix

---

## 📞 If You Need Help

**Check these files**:
- `DEPLOYMENT_STATUS.md` - Full analysis of what went wrong
- `REDEPLOYMENT_CHECKLIST.md` - Step-by-step fix procedure
- This file - Quick summary and exact fix

**Logs to check if issues persist**:
```bash
sudo journalctl -u martbase-web -n 100 --no-pager
sudo journalctl -u martbase-worker -n 100 --no-pager
```

---

**Created**: 2026-07-08
**Priority**: CRITICAL - Must fix before Martbase is usable
**Status**: Ready to fix - just need to edit one line in master.sh
