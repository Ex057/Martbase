# Martbase Architecture on Multipass

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Your Mac (Host)                          │
│                                                                 │
│  Browser ──────────> http://192.168.64.5 or martbase.local    │
│                              │                                  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│              Multipass VM (Ubuntu 22.04)                        │
│              IP: 192.168.64.X                                   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Nginx (Port 80)                                        │  │
│  │  - Reverse proxy                                        │  │
│  │  - Serves static files                                  │  │
│  │  - Routes requests to Superset                          │  │
│  └──────────────────┬──────────────────────────────────────┘  │
│                     │                                          │
│                     ↓                                          │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Superset Web (Port 8088 - Internal)                   │  │
│  │  - Gunicorn WSGI server                                 │  │
│  │  - 4 workers x 8 threads (auto-tuned)                   │  │
│  │  - Handles web requests                                 │  │
│  └──┬──────────────────────────────────────────────────┬───┘  │
│     │                                                    │      │
│     ↓                                                    ↓      │
│  ┌────────────────────────┐         ┌──────────────────────┐  │
│  │  PostgreSQL (5432)     │         │  Redis (6379)        │  │
│  │  - Metadata database   │         │  - Cache             │  │
│  │  - Chart definitions   │         │  - Query results     │  │
│  │  - User accounts       │         │  - Sessions          │  │
│  │  - Dashboards          │         │  - Celery broker     │  │
│  └────────────────────────┘         └──────────────────────┘  │
│              ↑                               ↑                 │
│              │                               │                 │
│              └───────────┬───────────────────┘                 │
│                          │                                     │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Celery Worker                                          │  │
│  │  - Background tasks                                     │  │
│  │  - Query execution                                      │  │
│  │  - Report generation                                    │  │
│  │  - Concurrency: 4 (auto-tuned)                         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Celery Beat                                            │  │
│  │  - Task scheduler                                       │  │
│  │  - Periodic jobs                                        │  │
│  │  - Alerts & reports                                     │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
└─────────────────────────────────────────────────────────────────┘
```

## File System Layout

```
/opt/martbase/                          # Installation root
├── master.sh                           # Deployment script
├── DEPLOY.md                           # Deployment instructions
├── .env                                # Environment variables
│
├── superset/                           # Python backend
│   ├── __init__.py
│   ├── app.py                          # Flask application
│   ├── config.py                       # Configuration
│   ├── models/                         # Database models
│   ├── views/                          # API endpoints
│   ├── static/                         # Built frontend assets
│   │   └── assets/                     # JS/CSS bundles
│   └── translations/                   # i18n files
│
├── superset-frontend/                  # Frontend source (if included)
│   ├── package.json
│   ├── src/                            # React source code
│   └── dist/                           # Built assets (copied to superset/static)
│
├── requirements/                       # Python dependencies
│   ├── base.txt
│   └── development.txt
│
├── venv/                               # Python virtual environment
│   ├── bin/
│   │   ├── python
│   │   ├── pip
│   │   ├── superset
│   │   ├── gunicorn
│   │   └── celery
│   └── lib/python3.10/site-packages/
│
├── config/                             # Runtime configuration
│   └── superset_config.py              # Superset configuration
│
├── data/                               # Application data
│   ├── uploads/                        # User uploads
│   └── cache/                          # File cache
│
├── logs/                               # Application logs
│   ├── superset_web.log
│   ├── celery_worker.log
│   └── celery_beat.log
│
└── run/                                # Runtime files
    ├── celerybeat-schedule
    └── *.pid
```

## Service Architecture

### Systemd Services

```
martbase-web.service
├── User: ubuntu
├── WorkingDir: /opt/martbase
├── Command: gunicorn superset.app:create_app()
├── Port: 8088
├── Workers: 4 (auto-tuned based on CPU)
└── Restart: always

martbase-worker.service
├── User: ubuntu
├── WorkingDir: /opt/martbase
├── Command: celery worker
├── Concurrency: 4 (auto-tuned based on CPU)
├── Queues: celery, dhis2
└── Restart: always

martbase-beat.service
├── User: ubuntu
├── WorkingDir: /opt/martbase
├── Command: celery beat
└── Restart: always
```

## Network Flow

### Request Lifecycle

```
1. User opens http://martbase.local in browser
   │
   ↓
2. DNS resolves to VM IP (via /etc/hosts or DNS)
   │
   ↓
3. Browser sends HTTP request to VM:80
   │
   ↓
4. Nginx receives request
   │
   ├─→ Static files (CSS/JS/images)
   │   └─→ Served directly from /opt/martbase/superset/static/
   │
   └─→ Dynamic requests (API, dashboards, etc.)
       │
       ↓
5. Nginx proxies to Superset (127.0.0.1:8088)
   │
   ↓
6. Gunicorn worker handles request
   │
   ├─→ Query PostgreSQL for data
   ├─→ Check Redis cache
   └─→ Queue Celery task (if needed)
   │
   ↓
7. Response rendered and sent back
   │
   ↓
8. Nginx forwards response to browser
   │
   ↓
9. User sees rendered page
```

## Auto-Tuning Logic

The `master.sh` script automatically tunes resources based on VM specs:

### CPU-Based Tuning

| VM CPUs | Gunicorn Workers | Gunicorn Threads | Celery Concurrency |
|---------|------------------|------------------|--------------------|
| 2       | 2                | 4                | 1                  |
| 4       | 3                | 6                | 2                  |
| 8       | 4                | 8                | 4                  |
| 12+     | 6                | 8                | 6                  |

### Memory-Based Tuning

| VM RAM | PG Shared Buffers | PG Effective Cache | Redis Max Memory |
|--------|-------------------|--------------------|------------------|
| 4GB    | 640MB             | 2GB                | 256MB            |
| 8GB    | 1.6GB             | 4.8GB              | 512MB            |
| 16GB   | 4GB               | 10.4GB             | 1GB              |
| 32GB+  | 8GB               | 22.4GB             | 2GB              |

## Port Map

| Port | Service | Access | Purpose |
|------|---------|--------|---------|
| 22   | SSH | External | VM management (Multipass) |
| 80   | Nginx | External | HTTP traffic |
| 443  | Nginx | External | HTTPS (if SSL enabled) |
| 5432 | PostgreSQL | Internal | Database |
| 6379 | Redis | Internal | Cache & queue broker |
| 8088 | Superset | Internal | WSGI server (proxied via Nginx) |

## Data Flow: User Query

```
User clicks "Run Query" in dashboard
         │
         ↓
Frontend (React) sends API request to /superset/explore_json/
         │
         ↓
Nginx proxies to Superset backend
         │
         ↓
Gunicorn worker receives request
         │
         ├─→ Check Redis cache for cached results
         │   └─→ If hit: return cached data (fast path)
         │
         └─→ If miss:
             │
             ↓
         Queue Celery task for async query execution
             │
             ↓
         Celery worker picks up task
             │
             ├─→ Connect to data source (DuckDB/PostgreSQL/etc)
             ├─→ Execute SQL query
             ├─→ Transform results
             └─→ Store in Redis cache
             │
             ↓
         Worker notifies frontend via Redis pubsub
             │
             ↓
         Frontend fetches results
             │
             ↓
         Chart renders with data
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Firewall (UFW)                                             │
│  ├─ Allow: 22/tcp (SSH)                                     │
│  ├─ Allow: 80/tcp (HTTP)                                    │
│  ├─ Allow: 443/tcp (HTTPS, if enabled)                      │
│  └─ Deny: All other ports (including 8088, 5432, 6379)      │
└─────────────────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────────┐
│  Nginx                                                       │
│  ├─ Rate limiting                                           │
│  ├─ Request size limits (64MB)                              │
│  ├─ Gzip compression                                        │
│  └─ Proxy headers (X-Forwarded-For, etc)                    │
└─────────────────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────────┐
│  Superset                                                    │
│  ├─ CSRF protection (WTForms)                               │
│  ├─ Session management (Flask-Login)                        │
│  ├─ Role-based access control (FAB)                         │
│  ├─ SQL injection prevention (SQLAlchemy)                   │
│  └─ Secret key for session encryption                       │
└─────────────────────────────────────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────────────────────────────┐
│  PostgreSQL                                                  │
│  ├─ Dedicated user with limited privileges                  │
│  ├─ Password authentication required                        │
│  ├─ Listening on localhost only                             │
│  └─ SSL connections (can be enabled)                        │
└─────────────────────────────────────────────────────────────┘
```

## Monitoring Points

### Health Checks

```bash
# Application health
curl http://localhost:8088/health
# Should return: {"status": "ok"}

# Nginx
sudo systemctl status nginx

# Database
sudo -u postgres psql -d martbase -c 'SELECT 1;'

# Redis
redis-cli ping
# Should return: PONG

# Services
./master.sh status
```

### Key Metrics to Monitor

1. **Web Service**
   - Response times
   - Request rate
   - Error rate (5xx responses)
   - Memory usage

2. **Worker Service**
   - Queue length
   - Task success/failure rate
   - Processing time
   - Concurrent tasks

3. **Database**
   - Connection count
   - Query performance
   - Cache hit ratio
   - Disk usage

4. **Redis**
   - Memory usage
   - Key count
   - Hit/miss ratio
   - Eviction rate

5. **System**
   - CPU usage
   - Memory usage
   - Disk I/O
   - Network I/O

---

**Last Updated**: 2026-07-07
