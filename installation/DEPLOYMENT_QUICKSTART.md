# Quick Deployment Guide (Ubuntu Server)

Fast deployment reference for Ubuntu Server 20.04/22.04 LTS.
For detailed instructions, see [UBUNTU_SERVER_DEPLOYMENT.md](UBUNTU_SERVER_DEPLOYMENT.md)

## Prerequisites

- Ubuntu Server 20.04/22.04 LTS
- Root or sudo access
- 4GB+ RAM, 2+ CPU cores
- Domain name or public IP (optional)

---

## Quick Setup (Copy & Paste)

### 1. System Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y build-essential software-properties-common \
    python3-pip python3-dev python3-venv libpq-dev libssl-dev \
    libffi-dev libsasl2-dev libldap2-dev libxml2-dev libxslt1-dev \
    libjpeg-dev zlib1g-dev pkg-config git curl wget

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql && sudo systemctl enable postgresql
```

### 2. Install Node.js 18

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. Setup PostgreSQL Database

```bash
sudo -u postgres psql << EOF
CREATE DATABASE superset;
CREATE USER superset WITH PASSWORD 'your_password_here';
GRANT ALL PRIVILEGES ON DATABASE superset TO superset;
\q
EOF
```

### 4. Clone & Setup Project

```bash
# Clone repository
cd ~
git clone https://github.com/YOUR_USERNAME/malaria-superset.git
cd malaria-superset

# Backend setup
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip setuptools wheel
pip install -r requirements/base.txt
pip install -e .

# Frontend setup
cd superset-frontend
npm install
cd ..
```

### 5. Configure Superset

```bash
# Create config directory
mkdir -p ~/.superset

# Generate secret key
python3 -c "import secrets; print(secrets.token_hex(32))"
# Copy the output

# Create config file
cat > ~/.superset/superset_config.py << 'EOF'
SQLALCHEMY_DATABASE_URI = 'postgresql://superset:your_password_here@localhost/superset'
SECRET_KEY = 'PASTE_YOUR_GENERATED_KEY_HERE'
WTF_CSRF_ENABLED = True
WTF_CSRF_TIME_LIMIT = None
CACHE_CONFIG = {
    'CACHE_TYPE': 'FileSystemCache',
    'CACHE_DIR': '/tmp/superset_cache',
    'CACHE_DEFAULT_TIMEOUT': 300
}
RESULTS_BACKEND = {
    'CACHE_TYPE': 'FileSystemCache',
    'CACHE_DIR': '/tmp/superset_results',
    'CACHE_DEFAULT_TIMEOUT': 86400
}
FEATURE_FLAGS = {'ENABLE_TEMPLATE_PROCESSING': True}
ROW_LIMIT = 50000
SUPERSET_WEBSERVER_TIMEOUT = 300
ENABLE_CORS = True
EOF

# Update SECRET_KEY in the file
nano ~/.superset/superset_config.py
```

### 6. Set Environment Variables

```bash
cat >> ~/.bashrc << 'EOF'
export SUPERSET_CONFIG_PATH=$HOME/.superset/superset_config.py
export FLASK_APP=superset
export SUPERSET_LOAD_EXAMPLES=no
export PYTHONPATH=$HOME/malaria-superset:$PYTHONPATH
EOF
source ~/.bashrc
```

### 7. Initialize Superset

```bash
source ~/malaria-superset/venv/bin/activate
superset db upgrade
superset fab create-admin \
    --username admin \
    --firstname Admin \
    --lastname User \
    --email admin@localhost \
    --password admin
superset init
```

---

## Running the Application

### Development Mode (Two Terminals)

**Terminal 1 - Backend:**
```bash
cd ~/malaria-superset
source venv/bin/activate
superset run -p 8088 --with-threads --reload --debugger
```

**Terminal 2 - Frontend:**
```bash
cd ~/malaria-superset/superset-frontend
npm run dev
```

**Access**: http://your-server-ip:9000
**Login**: admin / admin

---

## Production Deployment

### 1. Build Frontend

```bash
cd ~/malaria-superset/superset-frontend
npm run build
```

### 2. Install Gunicorn & Nginx

```bash
source ~/malaria-superset/venv/bin/activate
pip install gunicorn
sudo apt install -y nginx
```

### 3. Create Systemd Service

```bash
sudo nano /etc/systemd/system/superset.service
```

Paste this content (replace `superset` with your username if different):

```ini
[Unit]
Description=Apache Superset Backend
After=network.target postgresql.service

[Service]
Type=notify
User=superset
Group=superset
WorkingDirectory=/home/superset/malaria-superset
Environment="PATH=/home/superset/malaria-superset/venv/bin"
Environment="SUPERSET_CONFIG_PATH=/home/superset/.superset/superset_config.py"
Environment="FLASK_APP=superset"
ExecStart=/home/superset/malaria-superset/venv/bin/gunicorn \
    --bind 0.0.0.0:8088 \
    --workers 4 \
    --worker-class gthread \
    --threads 2 \
    --timeout 300 \
    --limit-request-line 0 \
    --limit-request-field_size 0 \
    "superset.app:create_app()"
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable superset
sudo systemctl start superset
sudo systemctl status superset
```

### 4. Configure Nginx

```bash
sudo nano /etc/nginx/sites-available/superset
```

Paste this content:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    client_max_body_size 100M;
    client_body_timeout 300s;

    root /home/superset/malaria-superset/superset-frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://localhost:8088;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    location ~ ^/(login|logout|static|superset|swagger|healthcheck) {
        proxy_pass http://localhost:8088;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable and test:
```bash
sudo ln -s /etc/nginx/sites-available/superset /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo ufw allow 80/tcp
```

### 5. SSL with Let's Encrypt (Optional)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## Troubleshooting Quick Fixes

### Backend won't start
```bash
sudo journalctl -u superset -n 50
sudo systemctl restart superset
```

### Check if services are running
```bash
# Backend
sudo netstat -tulnp | grep 8088

# PostgreSQL
sudo systemctl status postgresql

# Nginx
sudo systemctl status nginx
```

### Permission errors
```bash
sudo chown -R $USER:$USER ~/malaria-superset
sudo mkdir -p /tmp/superset_cache /tmp/superset_results
sudo chown -R $USER:$USER /tmp/superset_cache /tmp/superset_results
```

### Frontend build fails
```bash
cd ~/malaria-superset/superset-frontend
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

### Database connection test
```bash
psql -h localhost -U superset -d superset
# Password: your_password_here
```

---

## Useful Commands

```bash
# View logs
sudo journalctl -u superset -f
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Restart services
sudo systemctl restart superset
sudo systemctl restart nginx
sudo systemctl restart postgresql

# Update application
cd ~/malaria-superset
git pull
source venv/bin/activate
pip install -r requirements/base.txt
superset db upgrade
cd superset-frontend && npm install && npm run build
sudo systemctl restart superset

# Backup database
sudo -u postgres pg_dump superset > ~/superset_backup_$(date +%Y%m%d).sql
```

---

## Post-Deployment Checklist

- [ ] Backend running: `curl http://localhost:8088/health`
- [ ] Frontend built: `ls -la ~/malaria-superset/superset-frontend/dist/`
- [ ] Nginx configured: `sudo nginx -t`
- [ ] SSL installed (if needed): `sudo certbot certificates`
- [ ] Firewall configured: `sudo ufw status`
- [ ] Can access application: http://your-domain-or-ip
- [ ] Can login with admin credentials
- [ ] DHIS2 connection working
- [ ] Test dataset creation
- [ ] Test chart creation

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Port 8088 already in use | `sudo lsof -ti:8088 \| xargs kill -9` |
| Nginx 502 Bad Gateway | Check backend is running: `systemctl status superset` |
| Database connection failed | Verify PostgreSQL: `systemctl status postgresql` |
| Frontend 404 errors | Check nginx config and frontend build |
| Permission denied errors | Fix ownership: `chown -R $USER ~/malaria-superset` |
| Out of memory during build | Increase Node memory: `NODE_OPTIONS="--max-old-space-size=4096"` |

---

**Need more details?** See [UBUNTU_SERVER_DEPLOYMENT.md](UBUNTU_SERVER_DEPLOYMENT.md)

**Last Updated**: 2025-11-10
