#!/usr/bin/env bash
set -Eeuo pipefail

# ==============================================================================
# Martbase Master Deployment Script (Local Multipass Edition)
# - Designed for local Multipass server deployment
# - Expects codebase to be extracted from ZIP (not cloned from Git)
# - Streamlined for production deployment only
# ==============================================================================

# ------------------------------------------------------------------------------
# Colors / logging
# ------------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

print() { printf '%b\n' "$*"; }
info()  { print "${BLUE}[INFO]${NC} $*"; }
ok()    { print "${GREEN}[OK]${NC} $*"; }
warn()  { print "${YELLOW}[WARN]${NC} $*"; }
err()   { print "${RED}[ERROR]${NC} $*" >&2; }
die()   { err "$*"; exit 1; }
header() {
  echo
  echo -e "${BOLD}${BLUE}================================================================${NC}"
  echo -e "${BOLD}${BLUE}$*${NC}"
  echo -e "${BOLD}${BLUE}================================================================${NC}"
  echo
}

command_exists() { command -v "$1" >/dev/null 2>&1; }
require_cmd() { command_exists "$1" || die "Missing command: $1"; }
require_dir() { [[ -d "$1" ]] || die "Missing directory: $1"; }
require_file() { [[ -f "$1" ]] || die "Missing file: $1"; }

# ------------------------------------------------------------------------------
# Core config
# ------------------------------------------------------------------------------
APP_NAME="${APP_NAME:-martbase}"
INSTALL_DIR="${INSTALL_DIR:-/opt/martbase}"

VENV_DIR="${VENV_DIR:-$INSTALL_DIR/venv}"
CONFIG_DIR="${CONFIG_DIR:-$INSTALL_DIR/config}"
DATA_DIR="${DATA_DIR:-$INSTALL_DIR/data}"
LOG_DIR="${LOG_DIR:-$INSTALL_DIR/logs}"
RUN_DIR="${RUN_DIR:-$INSTALL_DIR/run}"
ENV_FILE="${ENV_FILE:-$INSTALL_DIR/.env}"
SUPERSET_CONFIG_FILE="${SUPERSET_CONFIG_FILE:-$CONFIG_DIR/superset_config.py}"

# ------------------------------------------------------------------------------
# Network / domain / app settings
# ------------------------------------------------------------------------------
DOMAIN="${DOMAIN:-martbase.local}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_FIRSTNAME="${ADMIN_FIRSTNAME:-Martbase}"
ADMIN_LASTNAME="${ADMIN_LASTNAME:-Admin}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@martbase.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin@2026}"

SUPERSET_HOST="${SUPERSET_HOST:-127.0.0.1}"
SUPERSET_PORT="${SUPERSET_PORT:-8088}"
SUPERSET_SECRET_KEY="${SUPERSET_SECRET_KEY:-$(openssl rand -base64 42 2>/dev/null | tr -d '\n' || echo change_me_now)}"
GUEST_TOKEN_JWT_SECRET="${GUEST_TOKEN_JWT_SECRET:-$(openssl rand -base64 42 2>/dev/null | tr -d '\n' || echo change_me_now)}"

# ------------------------------------------------------------------------------
# Service feature toggles
# ------------------------------------------------------------------------------
DUCKDB_ENABLED="${DUCKDB_ENABLED:-1}"
CLICKHOUSE_ENABLED="${CLICKHOUSE_ENABLED:-1}"
POSTGRES_ENABLED="${POSTGRES_ENABLED:-1}"
POSTGRES_INSTALL_EXTENSIONS="${POSTGRES_INSTALL_EXTENSIONS:-1}"

AUTO_SSL="${AUTO_SSL:-0}"
ENABLE_HTTPS="${ENABLE_HTTPS:-1}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-$ADMIN_EMAIL}"

UFW_ENABLE="${UFW_ENABLE:-1}"
ALLOW_SSH_PORT="${ALLOW_SSH_PORT:-22}"

# ------------------------------------------------------------------------------
# Database / cache
# ------------------------------------------------------------------------------
POSTGRES_DB="${POSTGRES_DB:-martbase}"
POSTGRES_USER="${POSTGRES_USER:-martbase}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -hex 18 2>/dev/null || echo change_me_now)}"
POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"

REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_DB="${REDIS_DB:-0}"

# ClickHouse config
CLICKHOUSE_HOST="${CLICKHOUSE_HOST:-127.0.0.1}"
CLICKHOUSE_HTTP_PORT="${CLICKHOUSE_HTTP_PORT:-8124}"
CLICKHOUSE_TCP_PORT="${CLICKHOUSE_TCP_PORT:-9001}"
CLICKHOUSE_DB="${CLICKHOUSE_DB:-dhis2_staging}"
CLICKHOUSE_SERVING_DB="${CLICKHOUSE_SERVING_DB:-dhis2_serving}"
CLICKHOUSE_USER="${CLICKHOUSE_USER:-dhis2_user}"
CLICKHOUSE_PASSWORD="${CLICKHOUSE_PASSWORD:-$(openssl rand -hex 12 2>/dev/null || echo dhis2_password)}"

NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/${APP_NAME}}"

# Frontend compatibility settings
NODE_MAJOR="${NODE_MAJOR:-20}"
NPM_VERSION="${NPM_VERSION:-10.8.2}"
NPM_INSTALL_FLAGS="${NPM_INSTALL_FLAGS:---legacy-peer-deps --no-audit --no-fund --progress=false --loglevel=error}"
NPM_CONFIG_LEGACY_PEER_DEPS="${NPM_CONFIG_LEGACY_PEER_DEPS:-true}"
NPM_CONFIG_AUDIT="${NPM_CONFIG_AUDIT:-false}"
NPM_CONFIG_FUND="${NPM_CONFIG_FUND:-false}"
NPM_CONFIG_PROGRESS="${NPM_CONFIG_PROGRESS:-false}"
NPM_CONFIG_UPDATE_NOTIFIER="${NPM_CONFIG_UPDATE_NOTIFIER:-false}"
NPM_CONFIG_LOGLEVEL="${NPM_CONFIG_LOGLEVEL:-error}"

# ------------------------------------------------------------------------------
# Common helpers
# ------------------------------------------------------------------------------
ensure_dirs() { mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR" "$RUN_DIR"; }
check_not_root() { [[ ${EUID} -ne 0 ]] || die "Do not run as root. Use a sudo-capable app user."; }

# ------------------------------------------------------------------------------
# Auto-tuning
# ------------------------------------------------------------------------------
get_cpu_cores() { nproc 2>/dev/null || echo 2; }
get_total_mem_mb() { awk '/MemTotal/ { printf "%d", $2/1024 }' /proc/meminfo 2>/dev/null || echo 4096; }
get_disk_gb() { df -BG --output=size / 2>/dev/null | tail -1 | tr -dc '0-9' || echo 50; }

calc_autotune() {
  CPU_CORES="$(get_cpu_cores)"
  TOTAL_MEM_MB="$(get_total_mem_mb)"
  ROOT_DISK_GB="$(get_disk_gb)"

  if (( CPU_CORES <= 2 )); then
    GUNICORN_WORKERS=2; GUNICORN_THREADS=4; CELERY_CONCURRENCY=1
  elif (( CPU_CORES <= 4 )); then
    GUNICORN_WORKERS=3; GUNICORN_THREADS=6; CELERY_CONCURRENCY=2
  elif (( CPU_CORES <= 8 )); then
    GUNICORN_WORKERS=4; GUNICORN_THREADS=8; CELERY_CONCURRENCY=4
  else
    if (( CPU_CORES > 12 )); then GUNICORN_WORKERS=6; else GUNICORN_WORKERS=$(( CPU_CORES / 2 )); fi
    GUNICORN_THREADS=8
    CELERY_CONCURRENCY=$(( CPU_CORES / 2 ))
  fi

  if (( TOTAL_MEM_MB < 4096 )); then
    PG_SHARED_BUFFERS_MB=$(( TOTAL_MEM_MB / 6 ))
    PG_EFFECTIVE_CACHE_MB=$(( TOTAL_MEM_MB / 2 ))
    PG_MAINTENANCE_MB=128
    PG_WORK_MEM_MB=8
    REDIS_MAXMEMORY_MB=256
  elif (( TOTAL_MEM_MB < 8192 )); then
    PG_SHARED_BUFFERS_MB=$(( TOTAL_MEM_MB / 5 ))
    PG_EFFECTIVE_CACHE_MB=$(( TOTAL_MEM_MB * 60 / 100 ))
    PG_MAINTENANCE_MB=256
    PG_WORK_MEM_MB=16
    REDIS_MAXMEMORY_MB=512
  elif (( TOTAL_MEM_MB < 16384 )); then
    PG_SHARED_BUFFERS_MB=$(( TOTAL_MEM_MB / 4 ))
    PG_EFFECTIVE_CACHE_MB=$(( TOTAL_MEM_MB * 65 / 100 ))
    PG_MAINTENANCE_MB=512
    PG_WORK_MEM_MB=24
    REDIS_MAXMEMORY_MB=1024
  else
    PG_SHARED_BUFFERS_MB=$(( TOTAL_MEM_MB / 4 ))
    PG_EFFECTIVE_CACHE_MB=$(( TOTAL_MEM_MB * 70 / 100 ))
    PG_MAINTENANCE_MB=1024
    PG_WORK_MEM_MB=32
    REDIS_MAXMEMORY_MB=2048
  fi

  if (( TOTAL_MEM_MB <= 8192 )); then
    NGINX_PROXY_BUFFERS="16 16k"; NGINX_PROXY_BUFFER_SIZE="16k"; NGINX_PROXY_BUSY="64k"
  else
    NGINX_PROXY_BUFFERS="32 16k"; NGINX_PROXY_BUFFER_SIZE="32k"; NGINX_PROXY_BUSY="128k"
  fi

  GUNICORN_TIMEOUT=300
  GUNICORN_KEEPALIVE=5
  CACHE_DEFAULT_TIMEOUT=300
  DATA_CACHE_TIMEOUT=300
  FILTER_STATE_CACHE_TIMEOUT=86400
  EXPLORE_FORM_DATA_CACHE_TIMEOUT=86400
  SQLLAB_ASYNC_TIME_LIMIT_SEC=21600
  WORKER_PREFETCH_MULTIPLIER=1
}

# ------------------------------------------------------------------------------
# Server install / production config
# ------------------------------------------------------------------------------
install_system_packages() {
  info "Installing OS packages"
  sudo apt-get update
  sudo apt-get install -y \
    curl wget gnupg ca-certificates apt-transport-https lsb-release software-properties-common \
    build-essential pkg-config git unzip rsync jq ufw \
    python3 python3-venv python3-dev python3-pip \
    libffi-dev libssl-dev libsasl2-dev libldap2-dev libpq-dev default-libmysqlclient-dev \
    redis-server nginx postgresql postgresql-contrib postgresql-client \
    certbot python3-certbot-nginx
  if ! command_exists node || ! command_exists npm; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
  sudo npm install -g "npm@${NPM_VERSION}" >/dev/null 2>&1 || true
  sudo systemctl enable --now redis-server postgresql nginx
  ok "OS packages installed"
}

install_clickhouse() {
  if [[ "${CLICKHOUSE_ENABLED}" != "1" ]]; then
    info "ClickHouse installation disabled (CLICKHOUSE_ENABLED=0)"
    return 0
  fi

  if command_exists clickhouse-server; then
    info "ClickHouse already installed"
  else
    info "Installing ClickHouse"
    sudo apt-get install -y apt-transport-https ca-certificates curl gnupg
    curl -fsSL 'https://packages.clickhouse.com/rpm/lts/repodata/repomd.xml.key' | sudo gpg --dearmor -o /usr/share/keyrings/clickhouse-keyring.gpg
    echo "deb [signed-by=/usr/share/keyrings/clickhouse-keyring.gpg] https://packages.clickhouse.com/deb stable main" | sudo tee /etc/apt/sources.list.d/clickhouse.list
    sudo apt-get update
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y clickhouse-server clickhouse-client
  fi

  # Configure ClickHouse with custom ports to avoid conflicts
  sudo mkdir -p /etc/clickhouse-server/config.d
  sudo tee /etc/clickhouse-server/config.d/martbase.xml > /dev/null <<EOF
<clickhouse>
    <http_port>${CLICKHOUSE_HTTP_PORT}</http_port>
    <tcp_port>${CLICKHOUSE_TCP_PORT}</tcp_port>
    <listen_host>127.0.0.1</listen_host>
    <max_connections>100</max_connections>
    <max_concurrent_queries>50</max_concurrent_queries>
</clickhouse>
EOF

  # Enable and start ClickHouse
  sudo systemctl enable clickhouse-server
  sudo systemctl start clickhouse-server || sudo systemctl restart clickhouse-server
  sleep 2

  # Create databases and user
  info "Setting up ClickHouse databases and user"
  clickhouse-client --port "${CLICKHOUSE_TCP_PORT}" --query "CREATE DATABASE IF NOT EXISTS ${CLICKHOUSE_DB}" 2>/dev/null || true
  clickhouse-client --port "${CLICKHOUSE_TCP_PORT}" --query "CREATE DATABASE IF NOT EXISTS ${CLICKHOUSE_SERVING_DB}" 2>/dev/null || true
  clickhouse-client --port "${CLICKHOUSE_TCP_PORT}" --query "CREATE USER IF NOT EXISTS ${CLICKHOUSE_USER} IDENTIFIED BY '${CLICKHOUSE_PASSWORD}'" 2>/dev/null || true
  clickhouse-client --port "${CLICKHOUSE_TCP_PORT}" --query "GRANT ALL ON ${CLICKHOUSE_DB}.* TO ${CLICKHOUSE_USER}" 2>/dev/null || true
  clickhouse-client --port "${CLICKHOUSE_TCP_PORT}" --query "GRANT ALL ON ${CLICKHOUSE_SERVING_DB}.* TO ${CLICKHOUSE_USER}" 2>/dev/null || true

  ok "ClickHouse installed and configured"
}

setup_venv_server() {
  # Reuse existing venv if it exists and has pip
  if [[ -f "$VENV_DIR/bin/activate" ]] && [[ -f "$VENV_DIR/bin/pip" ]]; then
    info "Reusing existing Python virtual environment"
    source "$VENV_DIR/bin/activate"
  else
    info "Creating Python virtual environment"
    python3 -m venv "$VENV_DIR"
    source "$VENV_DIR/bin/activate"
    pip install --upgrade pip wheel setuptools
  fi
  ok "Virtual environment ready"
}

install_python_dependencies_server() {
  info "Installing Python dependencies"
  source "$VENV_DIR/bin/activate"

  # Check if core dependencies are already installed
  if python -c "import superset" 2>/dev/null; then
    info "Core dependencies already installed, checking for updates only"
    # Only install missing packages, skip if already present
    pip install --quiet --upgrade psycopg2-binary redis celery gevent gunicorn cachelib cachetools rich 2>/dev/null || true
  else
    info "Installing fresh dependencies"
    [[ -f "$INSTALL_DIR/requirements/base.txt" ]] && pip install -r "$INSTALL_DIR/requirements/base.txt"
    [[ -f "$INSTALL_DIR/requirements/development.txt" ]] && pip install -r "$INSTALL_DIR/requirements/development.txt" || true
    pip install psycopg2-binary redis celery gevent gunicorn cachelib cachetools rich
  fi

  [[ "$DUCKDB_ENABLED" == "1" ]] && pip install duckdb duckdb-engine
  [[ "$CLICKHOUSE_ENABLED" == "1" ]] && pip install clickhouse-connect clickhouse-driver

  # Install superset-core from local source (required dependency)
  if [[ -d "$INSTALL_DIR/superset-core" ]]; then
    info "Installing superset-core from local source"
    pip install -e "$INSTALL_DIR/superset-core" || true
  fi

  # Always ensure local Martbase is installed in editable mode
  if [[ -f "$INSTALL_DIR/setup.py" || -f "$INSTALL_DIR/pyproject.toml" ]]; then
    pip install -e "$INSTALL_DIR" || true
  fi
  ok "Python dependencies installed"
}

build_frontend_if_present_server() {
  if [[ -d "$INSTALL_DIR/superset-frontend" ]]; then
    # Check if pre-built assets exist
    if [[ -d "$INSTALL_DIR/superset-frontend/dist" ]] && [[ -n "$(ls -A $INSTALL_DIR/superset-frontend/dist 2>/dev/null)" ]]; then
      info "Found pre-built frontend assets, skipping build"
      ok "Using pre-built frontend assets"
      return 0
    fi

    info "Building frontend assets (this may take 20-40 minutes)"
    cd "$INSTALL_DIR/superset-frontend"
    export npm_config_legacy_peer_deps="${NPM_CONFIG_LEGACY_PEER_DEPS}"
    export npm_config_audit="${NPM_CONFIG_AUDIT}"
    export npm_config_fund="${NPM_CONFIG_FUND}"
    export npm_config_progress="${NPM_CONFIG_PROGRESS}"
    export npm_config_update_notifier="${NPM_CONFIG_UPDATE_NOTIFIER}"
    export npm_config_loglevel="${NPM_CONFIG_LOGLEVEL}"
    export CI=1
    if [[ -f package-lock.json ]]; then
      npm ci ${NPM_INSTALL_FLAGS} || npm install ${NPM_INSTALL_FLAGS}
    else
      npm install ${NPM_INSTALL_FLAGS}
    fi
    npm run build || npm run prod || true
    ok "Frontend assets built"
  fi
}

configure_redis_server() {
  info "Tuning Redis"
  sudo sed -i "s/^#*maxmemory .*/maxmemory ${REDIS_MAXMEMORY_MB}mb/" /etc/redis/redis.conf || true
  sudo sed -i "s/^#*maxmemory-policy .*/maxmemory-policy allkeys-lru/" /etc/redis/redis.conf || true
  sudo systemctl restart redis-server
  ok "Redis tuned"
}

configure_postgresql_server() {
  [[ "$POSTGRES_ENABLED" == "1" ]] || return 0
  info "Configuring PostgreSQL"

  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${POSTGRES_USER}') THEN
    CREATE ROLE ${POSTGRES_USER} LOGIN PASSWORD '${POSTGRES_PASSWORD}';
  ELSE
    ALTER ROLE ${POSTGRES_USER} WITH LOGIN PASSWORD '${POSTGRES_PASSWORD}';
  END IF;
END
\$\$;
SQL

  # CREATE DATABASE cannot be run inside a DO block, so check and create separately
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${POSTGRES_DB}'" | grep -q 1; then
    sudo -u postgres psql -c "CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER} ENCODING 'UTF8';"
  fi

  sudo -u postgres psql -v ON_ERROR_STOP=1 -d postgres <<SQL
ALTER DATABASE ${POSTGRES_DB} OWNER TO ${POSTGRES_USER};
GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_DB} TO ${POSTGRES_USER};
SQL

  if [[ "$POSTGRES_INSTALL_EXTENSIONS" == "1" ]]; then
    sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$POSTGRES_DB" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SQL
  fi

  # Create alembic_version table with larger column to handle long migration IDs
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$POSTGRES_DB" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'alembic_version') THEN
    CREATE TABLE alembic_version (
      version_num VARCHAR(255) NOT NULL,
      CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
    );
    GRANT ALL ON alembic_version TO ${POSTGRES_USER};
  ELSE
    -- If table exists but column is too small, alter it
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'alembic_version'
      AND column_name = 'version_num'
      AND character_maximum_length < 255
    ) THEN
      ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(255);
    END IF;
  END IF;
END
\$\$;
SQL

  local pg_version pg_conf
  pg_version="$(psql --version | awk '{print $3}' | cut -d. -f1)"
  pg_conf="/etc/postgresql/${pg_version}/main/postgresql.conf"
  sudo cp "$pg_conf" "${pg_conf}.bak.$(date +%s)" || true
  sudo sed -i "s/^#\?shared_buffers =.*/shared_buffers = ${PG_SHARED_BUFFERS_MB}MB/" "$pg_conf"
  sudo sed -i "s/^#\?effective_cache_size =.*/effective_cache_size = ${PG_EFFECTIVE_CACHE_MB}MB/" "$pg_conf"
  sudo sed -i "s/^#\?maintenance_work_mem =.*/maintenance_work_mem = ${PG_MAINTENANCE_MB}MB/" "$pg_conf"
  sudo sed -i "s/^#\?work_mem =.*/work_mem = ${PG_WORK_MEM_MB}MB/" "$pg_conf"
  sudo sed -i "s/^#\?wal_compression =.*/wal_compression = on/" "$pg_conf" || echo "wal_compression = on" | sudo tee -a "$pg_conf" >/dev/null
  sudo sed -i "s/^#\?max_connections =.*/max_connections = 100/" "$pg_conf"
  grep -q '^random_page_cost' "$pg_conf" && sudo sed -i 's/^random_page_cost =.*/random_page_cost = 1.1/' "$pg_conf" || echo 'random_page_cost = 1.1' | sudo tee -a "$pg_conf" >/dev/null
  grep -q '^effective_io_concurrency' "$pg_conf" && sudo sed -i 's/^effective_io_concurrency =.*/effective_io_concurrency = 200/' "$pg_conf" || echo 'effective_io_concurrency = 200' | sudo tee -a "$pg_conf" >/dev/null
  sudo systemctl restart postgresql

  # Verify connectivity
  PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 -c 'SELECT 1;' >/dev/null

  ok "PostgreSQL configured and verified"
}

generate_env_server() {
  info "Writing .env"
  cat > "$ENV_FILE" <<EOF
DOMAIN=${DOMAIN}
SUPERSET_ENV=production
SUPERSET_HOST=${SUPERSET_HOST}
SUPERSET_PORT=${SUPERSET_PORT}
SUPERSET_SECRET_KEY=${SUPERSET_SECRET_KEY}
GUEST_TOKEN_JWT_SECRET=${GUEST_TOKEN_JWT_SECRET}

ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_FIRSTNAME=${ADMIN_FIRSTNAME}
ADMIN_LASTNAME=${ADMIN_LASTNAME}
ADMIN_EMAIL=${ADMIN_EMAIL}

POSTGRES_ENABLED=${POSTGRES_ENABLED}
POSTGRES_DB=${POSTGRES_DB}
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_HOST=${POSTGRES_HOST}
POSTGRES_PORT=${POSTGRES_PORT}
DATABASE_URL=postgresql+psycopg2://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}

REDIS_HOST=${REDIS_HOST}
REDIS_PORT=${REDIS_PORT}
REDIS_DB=${REDIS_DB}
CELERY_BROKER_URL=redis://${REDIS_HOST}:${REDIS_PORT}/0
CELERY_RESULT_BACKEND=redis://${REDIS_HOST}:${REDIS_PORT}/1
RESULTS_BACKEND_REDIS_URL=redis://${REDIS_HOST}:${REDIS_PORT}/2

CACHE_DEFAULT_TIMEOUT=${CACHE_DEFAULT_TIMEOUT}
DATA_CACHE_TIMEOUT=${DATA_CACHE_TIMEOUT}
FILTER_STATE_CACHE_TIMEOUT=${FILTER_STATE_CACHE_TIMEOUT}
EXPLORE_FORM_DATA_CACHE_TIMEOUT=${EXPLORE_FORM_DATA_CACHE_TIMEOUT}
SQLLAB_ASYNC_TIME_LIMIT_SEC=${SQLLAB_ASYNC_TIME_LIMIT_SEC}

CPU_CORES=${CPU_CORES}
TOTAL_MEM_MB=${TOTAL_MEM_MB}
ROOT_DISK_GB=${ROOT_DISK_GB}
GUNICORN_WORKERS=${GUNICORN_WORKERS}
GUNICORN_THREADS=${GUNICORN_THREADS}
GUNICORN_TIMEOUT=${GUNICORN_TIMEOUT}
GUNICORN_KEEPALIVE=${GUNICORN_KEEPALIVE}
CELERY_CONCURRENCY=${CELERY_CONCURRENCY}
REDIS_MAXMEMORY_MB=${REDIS_MAXMEMORY_MB}
PG_SHARED_BUFFERS_MB=${PG_SHARED_BUFFERS_MB}
PG_EFFECTIVE_CACHE_MB=${PG_EFFECTIVE_CACHE_MB}
PG_MAINTENANCE_MB=${PG_MAINTENANCE_MB}
PG_WORK_MEM_MB=${PG_WORK_MEM_MB}
WORKER_PREFETCH_MULTIPLIER=${WORKER_PREFETCH_MULTIPLIER}
GUNICORN_CMD_ARGS="--bind ${SUPERSET_HOST}:${SUPERSET_PORT} --workers ${GUNICORN_WORKERS} --threads ${GUNICORN_THREADS} --worker-class gthread --timeout ${GUNICORN_TIMEOUT} --keep-alive ${GUNICORN_KEEPALIVE} --max-requests 2000 --max-requests-jitter 200"

UFW_ENABLE=${UFW_ENABLE}
ALLOW_SSH_PORT=${ALLOW_SSH_PORT}
ENABLE_HTTPS=${ENABLE_HTTPS}
AUTO_SSL=${AUTO_SSL}

# ClickHouse configuration
CLICKHOUSE_ENABLED=${CLICKHOUSE_ENABLED}
CLICKHOUSE_HOST=${CLICKHOUSE_HOST}
CLICKHOUSE_HTTP_PORT=${CLICKHOUSE_HTTP_PORT}
CLICKHOUSE_TCP_PORT=${CLICKHOUSE_TCP_PORT}
CLICKHOUSE_DB=${CLICKHOUSE_DB}
CLICKHOUSE_SERVING_DB=${CLICKHOUSE_SERVING_DB}
CLICKHOUSE_USER=${CLICKHOUSE_USER}
CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD}

# Local Staging restart commands (used by UI)
LOCAL_STAGING_RESTART_BACKEND_COMMAND=bash ${INSTALL_DIR}/superset-manager.sh restart
LOCAL_STAGING_RESTART_CELERY_COMMAND=bash ${INSTALL_DIR}/superset-manager.sh restart-celery
EOF
  ok ".env written"
}

generate_superset_config_server() {
  info "Writing superset_config.py"
  cat > "$SUPERSET_CONFIG_FILE" <<'PY'
import os
from cachelib.redis import RedisCache

SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL")
SECRET_KEY = os.getenv("SUPERSET_SECRET_KEY")
WTF_CSRF_ENABLED = True
TALISMAN_ENABLED = False
ROW_LIMIT = 5000
SUPERSET_WEBSERVER_TIMEOUT = int(os.getenv("GUNICORN_TIMEOUT", "300"))
SQLLAB_ASYNC_TIME_LIMIT_SEC = int(os.getenv("SQLLAB_ASYNC_TIME_LIMIT_SEC", "21600"))
FEATURE_FLAGS = {
    "EMBEDDED_SUPERSET": True,
    "ENABLE_TEMPLATE_PROCESSING": True,
    "THUMBNAILS": True,
    "ALERT_REPORTS": True,
    "DASHBOARD_RBAC": True,
    "DYNAMIC_PLUGINS": True,
    "AI_INSIGHTS": True,
}
REDIS_HOST = os.getenv("REDIS_HOST", "127.0.0.1")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))

FILTER_STATE_CACHE_CONFIG = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_DEFAULT_TIMEOUT": int(os.getenv("FILTER_STATE_CACHE_TIMEOUT", "86400")),
    "CACHE_KEY_PREFIX": "superset_filter_state_",
    "CACHE_REDIS_HOST": REDIS_HOST,
    "CACHE_REDIS_PORT": REDIS_PORT,
    "CACHE_REDIS_DB": 3,
}
EXPLORE_FORM_DATA_CACHE_CONFIG = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_DEFAULT_TIMEOUT": int(os.getenv("EXPLORE_FORM_DATA_CACHE_TIMEOUT", "86400")),
    "CACHE_KEY_PREFIX": "superset_explore_form_",
    "CACHE_REDIS_HOST": REDIS_HOST,
    "CACHE_REDIS_PORT": REDIS_PORT,
    "CACHE_REDIS_DB": 4,
}
DATA_CACHE_CONFIG = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_DEFAULT_TIMEOUT": int(os.getenv("DATA_CACHE_TIMEOUT", "300")),
    "CACHE_KEY_PREFIX": "superset_data_",
    "CACHE_REDIS_HOST": REDIS_HOST,
    "CACHE_REDIS_PORT": REDIS_PORT,
    "CACHE_REDIS_DB": 5,
}
RESULTS_BACKEND = RedisCache(
    host=REDIS_HOST,
    port=REDIS_PORT,
    db=2,
    key_prefix="superset_results_",
)

class CeleryConfig:
    broker_url = os.getenv("CELERY_BROKER_URL", "redis://127.0.0.1:6379/0")
    result_backend = os.getenv("CELERY_RESULT_BACKEND", "redis://127.0.0.1:6379/1")
    worker_prefetch_multiplier = int(os.getenv("WORKER_PREFETCH_MULTIPLIER", "1"))
    task_acks_late = True
    task_annotations = {"sql_lab.get_sql_results": {"rate_limit": "100/s"}}

CELERY_CONFIG = CeleryConfig
ENABLE_PROXY_FIX = True
PREFERRED_URL_SCHEME = "https"
RATELIMIT_STORAGE_URI = f"redis://{REDIS_HOST}:{REDIS_PORT}/6"

# Local Staging ClickHouse config
CLICKHOUSE_HOST = os.getenv("CLICKHOUSE_HOST", "127.0.0.1")
CLICKHOUSE_HTTP_PORT = int(os.getenv("CLICKHOUSE_HTTP_PORT", "8124"))
CLICKHOUSE_DB = os.getenv("CLICKHOUSE_DB", "dhis2_staging")
CLICKHOUSE_SERVING_DB = os.getenv("CLICKHOUSE_SERVING_DB", "dhis2_serving")
CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER", "dhis2_user")
CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "")

LOCAL_STAGING_CONFIG = {
    "active_engine": "clickhouse" if os.getenv("CLICKHOUSE_ENABLED", "1") == "1" else "duckdb",
    "clickhouse_config": {
        "host": CLICKHOUSE_HOST,
        "http_port": CLICKHOUSE_HTTP_PORT,
        "database": CLICKHOUSE_DB,
        "serving_database": CLICKHOUSE_SERVING_DB,
        "user": CLICKHOUSE_USER,
        "password": CLICKHOUSE_PASSWORD,
    } if os.getenv("CLICKHOUSE_ENABLED", "1") == "1" else None,
}
PY
  ok "superset_config.py written"
}

create_superset_manager_script() {
  info "Creating superset-manager.sh for service management"
  cat > "$INSTALL_DIR/superset-manager.sh" <<'MANAGER'
#!/usr/bin/env bash
set -euo pipefail

# Superset Manager Script - Used by Local Staging UI for service restarts

case "${1:-}" in
  restart)
    echo "Restarting Martbase web server..."
    sudo systemctl restart martbase-web
    echo "Web server restarted"
    ;;
  restart-celery)
    echo "Restarting Martbase Celery worker and beat..."
    sudo systemctl restart martbase-worker martbase-beat
    echo "Celery restarted"
    ;;
  start)
    echo "Starting all Martbase services..."
    sudo systemctl start martbase-web martbase-worker martbase-beat
    echo "Services started"
    ;;
  stop)
    echo "Stopping all Martbase services..."
    sudo systemctl stop martbase-web martbase-worker martbase-beat
    echo "Services stopped"
    ;;
  status)
    sudo systemctl status martbase-web martbase-worker martbase-beat --no-pager || true
    ;;
  *)
    echo "Usage: $0 {restart|restart-celery|start|stop|status}"
    exit 1
    ;;
esac
MANAGER
  chmod +x "$INSTALL_DIR/superset-manager.sh"
  ok "superset-manager.sh created"
}

create_systemd_units_server() {
  info "Creating systemd units"
  sudo tee /etc/systemd/system/martbase-web.service >/dev/null <<EOF
[Unit]
Description=Martbase Web
After=network.target postgresql.service redis-server.service

[Service]
User=${USER}
Group=${USER}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${ENV_FILE}
Environment=SUPERSET_CONFIG_PATH=${SUPERSET_CONFIG_FILE}
ExecStart=${VENV_DIR}/bin/gunicorn -w ${GUNICORN_WORKERS} --threads ${GUNICORN_THREADS} -k gthread -b ${SUPERSET_HOST}:${SUPERSET_PORT} --timeout ${GUNICORN_TIMEOUT} --keep-alive ${GUNICORN_KEEPALIVE} --pid ${INSTALL_DIR}/superset_backend.pid 'superset.app:create_app()'
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=5
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

  sudo tee /etc/systemd/system/martbase-worker.service >/dev/null <<EOF
[Unit]
Description=Martbase Celery Worker
After=network.target postgresql.service redis-server.service

[Service]
User=${USER}
Group=${USER}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${ENV_FILE}
Environment=SUPERSET_CONFIG_PATH=${SUPERSET_CONFIG_FILE}
ExecStart=${VENV_DIR}/bin/celery --app=superset.tasks.celery_app:app worker --pool=prefork -O fair --concurrency=${CELERY_CONCURRENCY} --pidfile=${INSTALL_DIR}/celery_worker.pid
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  sudo tee /etc/systemd/system/martbase-beat.service >/dev/null <<EOF
[Unit]
Description=Martbase Celery Beat
After=network.target postgresql.service redis-server.service

[Service]
User=${USER}
Group=${USER}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${ENV_FILE}
Environment=SUPERSET_CONFIG_PATH=${SUPERSET_CONFIG_FILE}
ExecStart=${VENV_DIR}/bin/celery --app=superset.tasks.celery_app:app beat --pidfile=${INSTALL_DIR}/celery_beat.pid
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable martbase-web martbase-worker martbase-beat
  ok "systemd units created"
}

configure_firewall_server() {
  [[ "$UFW_ENABLE" == "1" ]] || { warn "UFW disabled; skipping firewall config"; return 0; }
  info "Configuring UFW"
  sudo ufw allow "${ALLOW_SSH_PORT}"/tcp comment 'SSH' || true
  sudo ufw allow 80/tcp comment 'HTTP' || true
  [[ "$ENABLE_HTTPS" == "1" || "$AUTO_SSL" == "1" ]] && sudo ufw allow 443/tcp comment 'HTTPS' || true
  sudo ufw --force enable || true
  sudo ufw reload || true
  ok "UFW configured"
}

configure_nginx_server() {
  info "Configuring Nginx reverse proxy"
  sudo tee "$NGINX_SITE" >/dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 64m;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types
        text/plain
        text/css
        application/json
        application/javascript
        text/xml
        application/xml
        application/xml+rss
        text/javascript
        image/svg+xml;

    location / {
        proxy_pass http://${SUPERSET_HOST}:${SUPERSET_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering on;
        proxy_buffer_size ${NGINX_PROXY_BUFFER_SIZE};
        proxy_buffers ${NGINX_PROXY_BUFFERS};
        proxy_busy_buffers_size ${NGINX_PROXY_BUSY};
        proxy_read_timeout 300;
        proxy_send_timeout 300;
        proxy_connect_timeout 60;
    }
}
EOF
  sudo ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/${APP_NAME}"
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t
  sudo systemctl enable --now nginx
  sudo systemctl reload nginx
  ok "Nginx configured for HTTP"
}

patch_metadata_db_schema_for_dhis2() {
  [[ "$POSTGRES_ENABLED" == "1" ]] || return 0
  info "Patching metadata DB schema for DHIS2 custom columns"

  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$POSTGRES_DB" <<'SQL' >/dev/null
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'dbs'
  ) THEN
    ALTER TABLE public.dbs ADD COLUMN IF NOT EXISTS is_dhis2_staging_internal BOOLEAN DEFAULT FALSE;
    ALTER TABLE public.dbs ADD COLUMN IF NOT EXISTS repository_reporting_unit_approach VARCHAR(255);
    ALTER TABLE public.dbs ADD COLUMN IF NOT EXISTS lowest_data_level_to_use VARCHAR(255);
    ALTER TABLE public.dbs ADD COLUMN IF NOT EXISTS primary_instance_id INTEGER;
    ALTER TABLE public.dbs ADD COLUMN IF NOT EXISTS repository_data_scope VARCHAR(255);
    ALTER TABLE public.dbs ADD COLUMN IF NOT EXISTS repository_org_unit_config_json JSONB;
    ALTER TABLE public.dbs ADD COLUMN IF NOT EXISTS repository_org_unit_status VARCHAR(255);
    ALTER TABLE public.dbs ADD COLUMN IF NOT EXISTS repository_org_unit_status_message TEXT;
    ALTER TABLE public.dbs ADD COLUMN IF NOT EXISTS repository_org_unit_task_id VARCHAR(255);
    ALTER TABLE public.dbs ADD COLUMN IF NOT EXISTS repository_org_unit_last_finalized_at TIMESTAMPTZ;
  END IF;
END
$$;
SQL

  ok "Metadata DB schema patch applied"
}

initialize_superset_server() {
  info "Initializing Superset"
  source "$VENV_DIR/bin/activate"
  export SUPERSET_CONFIG_PATH="$SUPERSET_CONFIG_FILE"
  export FLASK_APP=superset
  export DATABASE_URL="postgresql+psycopg2://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"
  superset db upgrade
  superset fab create-admin \
    --username "$ADMIN_USERNAME" \
    --firstname "$ADMIN_FIRSTNAME" \
    --lastname "$ADMIN_LASTNAME" \
    --email "$ADMIN_EMAIL" \
    --password "$ADMIN_PASSWORD" || true
  superset init
  ok "Superset initialized"
}

configure_clickhouse_staging_engine() {
  [[ "${CLICKHOUSE_ENABLED:-0}" == "1" ]] || return 0
  info "Configuring ClickHouse as active staging engine"
  source "$VENV_DIR/bin/activate"
  export SUPERSET_CONFIG_PATH="$SUPERSET_CONFIG_FILE"
  export FLASK_APP=superset
  export DATABASE_URL="postgresql+psycopg2://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"

  python3 - <<PYEOF
import os
os.environ.setdefault('SQLALCHEMY_DATABASE_URI', os.environ.get('DATABASE_URL', ''))

from superset.app import create_app
app = create_app()

with app.app_context():
    from superset import db
    from superset.local_staging.platform_settings import LocalStagingSettings

    settings = LocalStagingSettings.get()
    settings.active_engine = "clickhouse"
    cfg = {
        "host": "${CLICKHOUSE_HOST}",
        "http_port": ${CLICKHOUSE_HTTP_PORT},
        "port": ${CLICKHOUSE_TCP_PORT},
        "database": "${CLICKHOUSE_DB}",
        "serving_database": "${CLICKHOUSE_SERVING_DB}",
        "user": "${CLICKHOUSE_USER}",
        "password": "${CLICKHOUSE_PASSWORD}",
        "superset_db_name": "DHIS2 Serving (ClickHouse) - Martbase",
    }
    settings.set_clickhouse_config(cfg)
    db.session.commit()
    print(f"ClickHouse staging engine configured: {settings.active_engine}")
PYEOF
  ok "ClickHouse staging engine configured"
}

prompt_admin_credentials() {
  header "Admin User Setup"

  # Only prompt if not already set via environment
  if [[ "${ADMIN_USERNAME:-admin}" == "admin" && -z "${ADMIN_PROMPTED:-}" ]]; then
    echo "Configure the admin user for Martbase."
    echo "Press Enter to accept defaults shown in [brackets]."
    echo

    read -rp "Admin username [admin]: " input_username
    ADMIN_USERNAME="${input_username:-admin}"

    read -rp "Admin first name [Martbase]: " input_firstname
    ADMIN_FIRSTNAME="${input_firstname:-Martbase}"

    read -rp "Admin last name [Admin]: " input_lastname
    ADMIN_LASTNAME="${input_lastname:-Admin}"

    read -rp "Admin email [admin@martbase.local]: " input_email
    ADMIN_EMAIL="${input_email:-admin@martbase.local}"

    while true; do
      read -rsp "Admin password (min 8 chars): " input_password
      echo
      if [[ ${#input_password} -ge 8 ]]; then
        ADMIN_PASSWORD="$input_password"
        break
      elif [[ -z "$input_password" ]]; then
        echo "Using default password: admin@2026"
        ADMIN_PASSWORD="admin@2026"
        break
      else
        echo "Password must be at least 8 characters. Try again."
      fi
    done

    read -rsp "Confirm password: " input_password_confirm
    echo
    if [[ "$ADMIN_PASSWORD" != "$input_password_confirm" && -n "$input_password_confirm" ]]; then
      warn "Passwords do not match. Using first entry."
    fi

    export ADMIN_PROMPTED=1
    echo
    ok "Admin credentials configured: $ADMIN_USERNAME ($ADMIN_EMAIL)"
  fi
}

start_services_server() {
  sudo systemctl restart martbase-web martbase-worker martbase-beat nginx redis-server postgresql
  ok "Services started"
}

stop_services_server() {
  sudo systemctl stop martbase-web martbase-worker martbase-beat || true
  ok "Services stopped"
}

restart_services_server() {
  sudo systemctl restart martbase-web martbase-worker martbase-beat nginx redis-server postgresql
  ok "Services restarted"
}

show_status_server() {
  echo "Resources: CPU=${CPU_CORES:-?} RAM=${TOTAL_MEM_MB:-?}MB DISK=${ROOT_DISK_GB:-?}GB"
  echo "Gunicorn: workers=${GUNICORN_WORKERS:-?} threads=${GUNICORN_THREADS:-?} timeout=${GUNICORN_TIMEOUT:-?}"
  echo "Celery: concurrency=${CELERY_CONCURRENCY:-?}"
  echo "PostgreSQL: shared_buffers=${PG_SHARED_BUFFERS_MB:-?}MB effective_cache=${PG_EFFECTIVE_CACHE_MB:-?}MB work_mem=${PG_WORK_MEM_MB:-?}MB"
  echo "Redis: maxmemory=${REDIS_MAXMEMORY_MB:-?}MB"
  sudo systemctl --no-pager --full status martbase-web martbase-worker martbase-beat nginx redis-server postgresql || true
}

install_server() {
  check_not_root
  prompt_admin_credentials
  calc_autotune
  ensure_dirs
  install_system_packages
  install_clickhouse
  setup_venv_server
  install_python_dependencies_server
  build_frontend_if_present_server
  configure_redis_server
  configure_postgresql_server
  generate_env_server
  generate_superset_config_server
  create_superset_manager_script
  create_systemd_units_server
  configure_firewall_server
  configure_nginx_server
  patch_metadata_db_schema_for_dhis2
  initialize_superset_server
  configure_clickhouse_staging_engine
  start_services_server
  show_status_server
  cat <<EOF

Deployment complete!
URL: http://${DOMAIN}
Admin: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}
Resources: ${CPU_CORES} CPU cores, ${TOTAL_MEM_MB}MB RAM, ${ROOT_DISK_GB}GB disk
EOF
}

upgrade_server() {
  check_not_root
  calc_autotune
  ensure_dirs
  generate_env_server
  generate_superset_config_server
  install_python_dependencies_server
  build_frontend_if_present_server
  patch_metadata_db_schema_for_dhis2
  initialize_superset_server
  configure_clickhouse_staging_engine
  restart_services_server
  show_status_server
}

# ------------------------------------------------------------------------------
# Usage
# ------------------------------------------------------------------------------
usage() {
  cat <<EOF
Usage: ./master.sh <command>

Commands:
  install              Full production install on current machine
  upgrade              Upgrade existing installation
  start                Start services
  stop                 Stop services
  restart              Restart services
  status               Show service status

Environment variables:
  DOMAIN=martbase.local
  ADMIN_EMAIL=admin@martbase.local
  ADMIN_PASSWORD=admin
  POSTGRES_PASSWORD=...

Example:
  DOMAIN=martbase.local ADMIN_PASSWORD='StrongPass' ./master.sh install
EOF
}

# ------------------------------------------------------------------------------
# Main
# ------------------------------------------------------------------------------
main() {
  case "${1:-help}" in
    install) install_server ;;
    upgrade) upgrade_server ;;
    start) start_services_server ;;
    stop) stop_services_server ;;
    restart) restart_services_server ;;
    status) calc_autotune; show_status_server ;;
    help|--help|-h) usage ;;
    *) err "Unknown command: ${1:-}"; usage; exit 1 ;;
  esac
}
main "$@"
