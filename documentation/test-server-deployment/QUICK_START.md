# Martbase Multipass Quick Start

Ultra-condensed guide for experienced users. See [MULTIPASS_DEPLOYMENT_GUIDE.md](MULTIPASS_DEPLOYMENT_GUIDE.md) for full details.

## TL;DR

```bash
# 1. Create deployment package (on Mac)
./prepare-deployment.sh

# 2. Create VM
multipass launch 22.04 --name martbase --cpus 4 --memory 8G --disk 40G

# 3. Transfer files
multipass transfer deployment/martbase-deployment.zip martbase:/home/ubuntu/

# 4. Deploy
multipass shell martbase
sudo mkdir -p /opt/martbase
sudo unzip /home/ubuntu/martbase-deployment.zip -d /opt
sudo chown -R ubuntu:ubuntu /opt/martbase
cd /opt/martbase
DOMAIN=martbase.local ADMIN_PASSWORD='YourPassword' ./master.sh install

# 5. Get IP and access
hostname -I
# Open http://YOUR_VM_IP in browser
# Login: admin / YourPassword
```

## Recommended Specs

**Small Team (5-10 users)**:
```bash
multipass launch 22.04 --name martbase --cpus 4 --memory 8G --disk 40G
```

**Production (50+ users)**:
```bash
multipass launch 22.04 --name martbase --cpus 8 --memory 16G --disk 100G
```

## Essential Commands

### On Mac
```bash
# VM control
multipass list                          # List VMs
multipass shell martbase                # SSH into VM
multipass stop martbase                 # Stop VM
multipass start martbase                # Start VM
multipass info martbase                 # Get VM details (IP, etc)

# Transfer files
multipass transfer FILE martbase:/home/ubuntu/
```

### Inside VM
```bash
cd /opt/martbase

# Service control
./master.sh status                      # Check all services
./master.sh start                       # Start services
./master.sh stop                        # Stop services
./master.sh restart                     # Restart services

# Logs
sudo journalctl -u martbase-web -f      # Web logs (follow)
sudo journalctl -u martbase-worker -f   # Worker logs (follow)
sudo tail -f /var/log/nginx/error.log   # Nginx errors

# Database
sudo -u postgres psql -d martbase       # Connect to DB
```

## Access Domain via Browser

Add to `/etc/hosts` on Mac:
```bash
sudo nano /etc/hosts
# Add: 192.168.64.X    martbase.local
```

Then access: `http://martbase.local`

## Troubleshooting One-Liners

```bash
# Services not running
sudo systemctl restart martbase-web martbase-worker martbase-beat nginx

# Check disk space
df -h

# Check memory
free -h

# Rebuild frontend
cd /opt/martbase/superset-frontend && npm run build

# Database connection test
PGPASSWORD=$(grep POSTGRES_PASSWORD /opt/martbase/.env | cut -d= -f2) \
psql -h 127.0.0.1 -U martbase -d martbase -c 'SELECT 1;'
```

## Backup

```bash
# Database
sudo -u postgres pg_dump martbase > ~/martbase-db-$(date +%Y%m%d).sql

# Transfer to Mac
multipass transfer martbase:/home/ubuntu/martbase-db-*.sql ~/Downloads/
```

## Upgrade

```bash
# On Mac
./prepare-deployment.sh
multipass transfer deployment/martbase-deployment.zip martbase:/home/ubuntu/update.zip

# In VM
cd /opt/martbase
./master.sh stop
sudo unzip -o ~/update.zip -d /opt
sudo chown -R ubuntu:ubuntu /opt/martbase
./master.sh upgrade
```

---

**Full Guide**: See [MULTIPASS_DEPLOYMENT_GUIDE.md](MULTIPASS_DEPLOYMENT_GUIDE.md)
