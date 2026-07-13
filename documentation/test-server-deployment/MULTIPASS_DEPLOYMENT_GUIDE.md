# Martbase Multipass Deployment Guide

Complete step-by-step guide for deploying Martbase on a local Multipass Ubuntu server.

## Table of Contents
1. [Server Specifications](#server-specifications)
2. [Install Multipass](#install-multipass)
3. [Create Ubuntu VM](#create-ubuntu-vm)
4. [Prepare Deployment Package](#prepare-deployment-package)
5. [Transfer Files to VM](#transfer-files-to-vm)
6. [Deploy Martbase](#deploy-martbase)
7. [Access the Application](#access-the-application)
8. [Troubleshooting](#troubleshooting)

---

## Server Specifications

### Minimum Requirements
- **CPU**: 2 cores
- **RAM**: 4GB
- **Disk**: 20GB
- **OS**: Ubuntu 22.04 LTS

### Recommended Specifications (for smooth operation)
- **CPU**: 4 cores
- **RAM**: 8GB
- **Disk**: 40GB
- **OS**: Ubuntu 22.04 LTS

### For Production/Heavy Use
- **CPU**: 6-8 cores
- **RAM**: 16GB
- **Disk**: 100GB
- **OS**: Ubuntu 22.04 LTS

---

## Install Multipass

### On macOS

```bash
# Using Homebrew
brew install multipass

# Verify installation
multipass version
```

### On Windows

1. Download installer from: https://multipass.run/download/windows
2. Run the installer
3. Open PowerShell and verify:
   ```powershell
   multipass version
   ```

### On Linux

```bash
# Ubuntu/Debian
sudo snap install multipass

# Verify installation
multipass version
```

---

## Create Ubuntu VM

### Step 1: Launch VM with Recommended Specs

```bash
# Create VM named 'martbase' with 4 CPUs, 8GB RAM, 40GB disk
multipass launch 22.04 \
  --name martbase \
  --cpus 4 \
  --memory 8G \
  --disk 40G

# Wait for VM to finish initializing (takes 1-2 minutes)
```

### Step 2: Verify VM is Running

```bash
# Check VM status
multipass list

# Should show:
# Name                    State             IPv4             Image
# martbase                Running           192.168.64.X     Ubuntu 22.04 LTS
```

### Step 3: Get VM Information

```bash
# Get detailed VM info including IP address
multipass info martbase
```

**Note the IP address** - you'll need it to access Martbase later (e.g., `192.168.64.5`)

### Step 4: Test SSH Access

```bash
# Connect to VM
multipass shell martbase

# You should see the Ubuntu prompt:
# ubuntu@martbase:~$

# Exit to return to your host machine
exit
```

---

## Prepare Deployment Package

### Step 1: Navigate to Project Directory

```bash
cd /Users/edwinarinda/Projects/Martbase
```

### Step 2: Build Frontend (Optional but Recommended)

Building frontend on your Mac will be faster than on the VM:

```bash
cd superset-frontend
npm install
npm run build
cd ..
```

### Step 3: Create Deployment ZIP

```bash
# Run the preparation script
./prepare-deployment.sh
```

This creates `deployment/martbase-deployment.zip` containing:
- Python backend
- Frontend (pre-built or source)
- Requirements
- Deployment script
- Configuration files

### Step 4: Verify Package

```bash
# Check the ZIP was created
ls -lh deployment/martbase-deployment.zip

# Should show file size (typically 50-200MB depending on frontend)
```

---

## Transfer Files to VM

### Method 1: Using Multipass Transfer (Recommended)

```bash
# Transfer ZIP to VM home directory
multipass transfer deployment/martbase-deployment.zip martbase:/home/ubuntu/

# Verify transfer
multipass exec martbase -- ls -lh /home/ubuntu/martbase-deployment.zip
```

### Method 2: Using SCP (Alternative)

```bash
# Get VM IP address
VM_IP=$(multipass info martbase | grep IPv4 | awk '{print $2}')

# Transfer file
scp deployment/martbase-deployment.zip ubuntu@$VM_IP:/home/ubuntu/
```

---

## Deploy Martbase

### Step 1: Connect to VM

```bash
multipass shell martbase
```

You're now inside the VM. All following commands run inside the VM.

### Step 2: Extract Deployment Package

```bash
# Create installation directory
sudo mkdir -p /opt/martbase

# Extract ZIP
sudo unzip /home/ubuntu/martbase-deployment.zip -d /opt

# Set ownership
sudo chown -R ubuntu:ubuntu /opt/martbase

# Navigate to installation directory
cd /opt/martbase
```

### Step 3: Review Deployment README

```bash
# Read deployment instructions
cat DEPLOY.md
```

### Step 4: Run Installation

```bash
# Set your custom password and run install
DOMAIN=martbase.local \
ADMIN_EMAIL=admin@martbase.local \
ADMIN_PASSWORD='ChangeThisPassword123!' \
./master.sh install
```

**The installation will**:
1. Install system packages (Node.js, PostgreSQL, Redis, Nginx)
2. Create Python virtual environment
3. Install Python dependencies
4. Build frontend (if not pre-built)
5. Configure database
6. Configure services
7. Start all services

**This takes 10-30 minutes** depending on:
- VM specs
- Whether frontend is pre-built
- Internet speed

### Step 5: Monitor Installation Progress

The script will show progress. Watch for:
- ✅ Green "[OK]" messages = success
- ⚠️  Yellow "[WARN]" messages = non-critical warnings
- ❌ Red "[ERROR]" messages = critical errors (will stop installation)

### Step 6: Verify Installation

```bash
# Check service status
./master.sh status

# Should show all services as "active (running)":
# - martbase-web.service
# - martbase-worker.service
# - martbase-beat.service
# - nginx.service
# - postgresql.service
# - redis-server.service
```

---

## Access the Application

### Step 1: Get VM IP Address

```bash
# Inside VM, get IP address
hostname -I | awk '{print $1}'

# Or from your host Mac:
multipass info martbase | grep IPv4
```

Example IP: `192.168.64.5`

### Step 2: Access via Browser

**On your Mac**, open browser and navigate to:

```
http://192.168.64.5
```

**Or** if you want to use the domain name:

```bash
# On your Mac, add to /etc/hosts
sudo nano /etc/hosts

# Add this line (replace IP with your VM IP):
192.168.64.5    martbase.local

# Save and exit (Ctrl+X, Y, Enter)

# Now access via:
http://martbase.local
```

### Step 3: Login

- **Username**: `admin`
- **Email**: `admin@martbase.local`
- **Password**: (the password you set in Step 4 of deployment)

### Step 4: Configure Domain in Settings (Optional)

If you used a custom domain, update it in Portal Settings:
1. Navigate to: Settings → CMS Admin → Portal tab
2. Set your domain
3. Save changes

---

## Common Commands

### Service Management

```bash
# Inside VM (multipass shell martbase)
cd /opt/martbase

# Start services
./master.sh start

# Stop services
./master.sh stop

# Restart services
./master.sh restart

# Check status
./master.sh status
```

### VM Management

```bash
# From your Mac

# Stop VM
multipass stop martbase

# Start VM
multipass start martbase

# Restart VM
multipass restart martbase

# Delete VM (WARNING: destroys all data)
multipass delete martbase
multipass purge
```

### View Logs

```bash
# Inside VM
cd /opt/martbase

# Web service logs
sudo journalctl -u martbase-web -f

# Worker service logs
sudo journalctl -u martbase-worker -f

# Beat service logs
sudo journalctl -u martbase-beat -f

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Database Access

```bash
# Inside VM

# Connect to PostgreSQL
sudo -u postgres psql -d martbase

# Common SQL commands:
\dt                    # List tables
\du                    # List users
\l                     # List databases
\q                     # Quit
```

---

## Troubleshooting

### Services Won't Start

```bash
# Check detailed service status
sudo systemctl status martbase-web
sudo systemctl status martbase-worker
sudo systemctl status martbase-beat

# Check logs for errors
sudo journalctl -u martbase-web -n 100 --no-pager
```

### Cannot Access via Browser

1. **Check services are running**:
   ```bash
   cd /opt/martbase
   ./master.sh status
   ```

2. **Check Nginx is configured**:
   ```bash
   sudo nginx -t
   sudo systemctl status nginx
   ```

3. **Check firewall**:
   ```bash
   sudo ufw status
   # Should show: 80/tcp ALLOW
   ```

4. **Verify VM IP**:
   ```bash
   multipass info martbase
   # Use the IPv4 address shown
   ```

### Frontend Not Loading

1. **Check if frontend was built**:
   ```bash
   ls -la /opt/martbase/superset/static/assets/
   # Should contain built files
   ```

2. **Rebuild frontend manually**:
   ```bash
   cd /opt/martbase
   ./master.sh stop
   cd superset-frontend
   npm install
   npm run build
   cd ..
   ./master.sh start
   ```

### Database Connection Errors

```bash
# Test PostgreSQL connection
PGPASSWORD=$(grep POSTGRES_PASSWORD /opt/martbase/.env | cut -d= -f2) \
psql -h 127.0.0.1 -U martbase -d martbase -c 'SELECT 1;'

# If fails, restart PostgreSQL
sudo systemctl restart postgresql
```

### Memory Issues

If VM runs out of memory:

```bash
# From Mac - stop VM
multipass stop martbase

# Increase memory to 16GB
multipass set local.martbase.memory=16G

# Start VM
multipass start martbase
```

### Disk Space Issues

```bash
# Check disk usage
df -h

# Clean up if needed
sudo apt clean
sudo apt autoremove
rm -rf /opt/martbase/superset-frontend/node_modules
cd /opt/martbase/superset-frontend && npm install
```

---

## Upgrade Martbase

### Step 1: Prepare New Package on Mac

```bash
cd /Users/edwinarinda/Projects/Martbase
./prepare-deployment.sh
```

### Step 2: Transfer to VM

```bash
multipass transfer deployment/martbase-deployment.zip martbase:/home/ubuntu/martbase-update.zip
```

### Step 3: Extract and Upgrade

```bash
# Inside VM
multipass shell martbase

# Stop services
cd /opt/martbase
./master.sh stop

# Backup current installation
sudo cp -r /opt/martbase /opt/martbase-backup-$(date +%Y%m%d)

# Extract new version
sudo unzip -o /home/ubuntu/martbase-update.zip -d /opt
sudo chown -R ubuntu:ubuntu /opt/martbase

# Run upgrade
cd /opt/martbase
./master.sh upgrade

# Verify
./master.sh status
```

---

## Performance Tuning

### For Low-Spec VMs (2 CPU, 4GB RAM)

```bash
# Edit .env file
nano /opt/martbase/.env

# Adjust these values:
GUNICORN_WORKERS=2
GUNICORN_THREADS=4
CELERY_CONCURRENCY=1
```

### For High-Spec VMs (8 CPU, 16GB RAM)

```bash
# Edit .env file
nano /opt/martbase/.env

# Adjust these values:
GUNICORN_WORKERS=6
GUNICORN_THREADS=8
CELERY_CONCURRENCY=4
```

Then restart:
```bash
./master.sh restart
```

---

## Backup and Restore

### Backup

```bash
# Inside VM

# Backup database
sudo -u postgres pg_dump martbase > /home/ubuntu/martbase-db-$(date +%Y%m%d).sql

# Backup uploads and data
tar -czf /home/ubuntu/martbase-data-$(date +%Y%m%d).tar.gz \
  /opt/martbase/data \
  /opt/martbase/.env

# Copy backups to Mac
# From Mac:
multipass transfer martbase:/home/ubuntu/martbase-db-*.sql ~/Downloads/
multipass transfer martbase:/home/ubuntu/martbase-data-*.tar.gz ~/Downloads/
```

### Restore

```bash
# Inside VM

# Stop services
cd /opt/martbase
./master.sh stop

# Restore database
sudo -u postgres psql martbase < /home/ubuntu/martbase-db-YYYYMMDD.sql

# Restore data
tar -xzf /home/ubuntu/martbase-data-YYYYMMDD.tar.gz -C /

# Start services
./master.sh start
```

---

## Quick Reference

### Recommended VM Specs by Use Case

| Use Case | CPUs | RAM | Disk | Expected Users |
|----------|------|-----|------|----------------|
| Development/Testing | 2 | 4GB | 20GB | 1-2 |
| Small Team | 4 | 8GB | 40GB | 5-10 |
| Medium Deployment | 6 | 16GB | 100GB | 20-50 |
| Production | 8+ | 32GB+ | 200GB+ | 50+ |

### Port Usage

| Service | Port | Access |
|---------|------|--------|
| Nginx (HTTP) | 80 | External |
| Nginx (HTTPS) | 443 | External (if SSL enabled) |
| Superset | 8088 | Internal only |
| PostgreSQL | 5432 | Internal only |
| Redis | 6379 | Internal only |

### Important Directories

| Path | Contents |
|------|----------|
| `/opt/martbase` | Installation root |
| `/opt/martbase/venv` | Python virtual environment |
| `/opt/martbase/config` | Configuration files |
| `/opt/martbase/data` | Superset data |
| `/opt/martbase/logs` | Application logs |
| `/opt/martbase/.env` | Environment variables |

---

## Support

For issues or questions:
1. Check logs: `sudo journalctl -u martbase-web -n 100`
2. Review this guide's troubleshooting section
3. Verify all services: `./master.sh status`
4. Check VM resources: `free -h` and `df -h`

---

**Last Updated**: 2026-07-07
**Version**: 1.0
**Tested On**: macOS with Multipass 1.x, Ubuntu 22.04 LTS
