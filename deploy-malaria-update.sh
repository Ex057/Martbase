#!/usr/bin/env bash
#
# deploy-malaria-update.sh  —  primary ops + deploy tool for the LIVE server
#   https://malaria.health.go.ug   (LXC "superset" container, systemd services)
#
# Pulls code from the fork we can push to:
#   https://github.com/Ex057/Martbase.git   branch martbasev1   (override: REPO_URL=/REF=)
#
# Config-safe by design: NEVER regenerates superset_config.py, /etc/superset/
# superset.env, nginx, or the domain; NEVER runs `git clean`; the metadata schema
# is already at head so `db upgrade` is a no-op.
#
# Bootstrap (first time — get this script onto the server from the fork):
#   cd /opt/dhis2-superset
#   git fetch https://github.com/Ex057/Martbase.git martbasev1
#   git show FETCH_HEAD:deploy-malaria-update.sh > /opt/deploy-malaria-update.sh
#   chmod +x /opt/deploy-malaria-update.sh
#
# Common use (as root, inside the superset container):
#   sudo /opt/deploy-malaria-update.sh prepare     # backup + pull code + restore config + hotfix diffs
#   sudo /opt/deploy-malaria-update.sh apply       # role rename + build + init + restart + verify
#   sudo /opt/deploy-malaria-update.sh rollback    # one-shot revert to the pre-update snapshot
#   sudo /opt/deploy-malaria-update.sh restart | build-frontend | logs web | clear-cache | status
# --------------------------------------------------------------------------
set -euo pipefail

# ---- fixed facts about this server (see server_info.md) -------------------
APP=/opt/dhis2-superset
VENV=/opt/superset-venv
ENV_FILE=/etc/superset/superset.env
SVC_USER=superset
SERVICES="superset superset-worker superset-beat"   # systemd units (web, worker, beat)
EXPECTED_CONFIG_PATH=/opt/dhis2-superset/superset_config.py
REPO_URL="${REPO_URL:-https://github.com/Ex057/Martbase.git}"
REF="${REF:-martbasev1}"
BACKUP_ROOT=/opt
MARKER=/opt/.malaria_update_state          # records the last prepare's backup dir

log()  { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
info() { printf '   %s\n' "$*"; }
warn() { printf '   \033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31mABORT: %s\033[0m\n' "$*" >&2; exit 1; }

require_root() { [[ "$(id -u)" -eq 0 ]] || die "run as root (sudo)."; }

load_env() {
  [[ -f "$ENV_FILE" ]] || die "missing $ENV_FILE"
  set -a; . "$ENV_FILE"; set +a
  grep -q "SUPERSET_CONFIG_PATH=$EXPECTED_CONFIG_PATH" "$ENV_FILE" \
    || die "SUPERSET_CONFIG_PATH in $ENV_FILE is not $EXPECTED_CONFIG_PATH — stop and re-check."
  : "${SQLALCHEMY_DATABASE_URI:?SQLALCHEMY_DATABASE_URI not set in $ENV_FILE}"
  PG_URI="$(printf '%s' "$SQLALCHEMY_DATABASE_URI" | sed -E 's#^postgresql\+[a-z0-9_]+://#postgresql://#')"
}

sctl()  { systemctl "$@" $SERVICES; }
# Run a command as the service user. We keep -E (to pass the superset.env vars),
# but MUST override HOME: with -E alone HOME stays /root, which the 'superset'
# user cannot write, so npm's cache (/root/.npm) and bash profile reads fail with
# EACCES. Point HOME at a service-user-owned dir instead.
BUILD_HOME="${BUILD_HOME:-/opt/.deploy-build-home}"
as_svc() {
  mkdir -p "$BUILD_HOME" 2>/dev/null || true
  chown "$SVC_USER:$SVC_USER" "$BUILD_HOME" 2>/dev/null || true
  sudo -u "$SVC_USER" -E env HOME="$BUILD_HOME" "$@"
}

# ==========================================================================
# Service control (systemd)
# ==========================================================================
cmd_start()   { require_root; log "start $SERVICES";   sctl start;   cmd_status; }
cmd_stop()    { require_root; log "stop $SERVICES";    sctl stop;    info "stopped."; }
cmd_restart() { require_root; log "restart $SERVICES"; sctl restart; sleep 4; cmd_status; }
cmd_restart_web()    { require_root; log "restart web (superset.service)"; systemctl restart superset; sleep 3; cmd_health; }
cmd_restart_celery() { require_root; log "restart celery worker+beat"; systemctl restart superset-worker superset-beat; info "restarted."; }

cmd_status() {
  require_root
  log "service status"
  systemctl --no-pager --lines=0 status $SERVICES || true
  log "code"
  info "HEAD: $(git -C "$APP" rev-parse --short HEAD 2>/dev/null) ($(git -C "$APP" log -1 --format=%s 2>/dev/null))"
  cmd_health || true
}

cmd_health() {
  if curl -fsS -o /dev/null "http://127.0.0.1:8088/health"; then
    info "health: OK (http://127.0.0.1:8088/health)"
  else
    warn "health: FAILED — journalctl -u superset -n 50 --no-pager"
    return 1
  fi
}

# ==========================================================================
# Build / init / cache / logs
# ==========================================================================
cmd_build_frontend() {
  require_root
  log "build frontend (as $SVC_USER)"
  chown -R "$SVC_USER:$SVC_USER" "$APP/superset-frontend" 2>/dev/null || true
  as_svc bash -c "cd '$APP/superset-frontend' && npm ci --legacy-peer-deps && DISABLE_TYPE_CHECK=true npm run build"
  test -d "$APP/superset/static/assets" || die "build produced no assets/."
  chown -R "$SVC_USER:$SVC_USER" "$APP/superset/static/assets"
  info "build done. Run 'restart' (or 'restart-web') to serve the new assets."
}

cmd_init() {
  require_root; load_env
  log "db upgrade (no-op safety) + superset init"
  as_svc "$VENV/bin/superset" db upgrade
  as_svc "$VENV/bin/superset" init
  info "init complete."
}

cmd_clear_cache() {
  require_root
  log "clear caches (python + frontend build; does NOT flush Redis)"
  find "$APP/superset" -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
  find "$APP/superset" -type f -name '*.pyc' -delete 2>/dev/null || true
  rm -rf "$APP/superset-frontend/.webpack" "$APP/superset-frontend/node_modules/.cache" 2>/dev/null || true
  info "python + frontend build caches cleared."
  info "(Redis/result cache left intact — flushing it would disrupt the celery broker.)"
}

cmd_clear_logs() {
  require_root
  log "clear celery log files"
  : > "$APP/logs/celery-worker.log" 2>/dev/null || true
  : > "$APP/logs/celery-beat.log" 2>/dev/null || true
  info "celery logs truncated. (Gunicorn logs live in journald — use 'logs web'.)"
}

cmd_logs() {
  require_root
  local which="${1:-web}" n="${2:-80}"
  case "$which" in
    web|superset)   journalctl -u superset -n "$n" --no-pager ;;
    worker|celery)  journalctl -u superset-worker -n "$n" --no-pager ;;
    beat)           journalctl -u superset-beat -n "$n" --no-pager ;;
    worker-file)    tail -n "$n" "$APP/logs/celery-worker.log" ;;
    beat-file)      tail -n "$n" "$APP/logs/celery-beat.log" ;;
    follow|-f)      journalctl -u superset -f ;;
    *) die "unknown log target '$which' (use: web | worker | beat | worker-file | beat-file | follow)";;
  esac
}

cmd_role_rename() {
  require_root; load_env
  command -v psql >/dev/null || die "psql not found (needed for role rename)."
  log "reconcile role names (idempotent; preserves user assignments)"
  psql "$PG_URI" -v ON_ERROR_STOP=1 <<'SQL'
UPDATE ab_role SET name = 'Analytics' WHERE name = 'Analytic';
UPDATE ab_role SET name = 'End user'  WHERE name = 'End User';
SQL
  info "roles aligned to code names (Analytics / End user)."
}

# ==========================================================================
# Deploy — phase 1: prepare
# ==========================================================================
cmd_prepare() {
  require_root; load_env
  local ts; ts="$(date +%Y%m%d_%H%M%S)"
  local backup="${BACKUP_ROOT}/dhis2-superset.backup_before_update_${ts}"

  log "Pre-flight"
  command -v git >/dev/null || die "git not found"
  test -d "$APP/.git" || die "$APP is not a git checkout"
  local free_kb; free_kb="$(df -Pk "$BACKUP_ROOT" | awk 'NR==2{print $4}')"
  info "free on $BACKUP_ROOT: $((free_kb/1024/1024)) GiB   source: $REPO_URL ($REF)"

  log "Step 1a — metadata DB backup (pg_dump -Fc)"
  local dump="${BACKUP_ROOT}/metadata_${ts}.dump"
  if command -v pg_dump >/dev/null; then
    pg_dump -Fc "$PG_URI" -f "$dump" && info "wrote $dump ($(du -h "$dump" | cut -f1))"
  else
    warn "pg_dump NOT installed here."
    info ">> back up the metadata DB from the postgres container, then re-run prepare."
    die  "metadata backup is mandatory."
  fi

  log "Step 1b — full app-dir snapshot (config + all server hotfixes)"
  cp -a "$APP" "$backup"; info "snapshot: $backup"

  log "Step 2 — update code from $REPO_URL ($REF) (NO git clean)"
  local before after
  before="$(git -C "$APP" rev-parse --short HEAD)"
  git -C "$APP" fetch "$REPO_URL" "$REF" --tags \
    || git -C "$APP" fetch --unshallow "$REPO_URL" "$REF"
  git -C "$APP" reset --hard FETCH_HEAD
  after="$(git -C "$APP" rev-parse --short HEAD)"
  info "HEAD: $before -> $after"

  log "Step 2b — restore YOUR superset_config.py verbatim (SECRET_KEY + domain)"
  cp -a "$backup/superset_config.py" "$APP/superset_config.py"
  grep -qi 'vitalplatform' "$APP/superset_config.py" && warn "config mentions 'vitalplatform' — verify the domain."
  mkdir -p "$APP/run" "$APP/logs"

  log "Step 3 — hotfix diffs for MANUAL review (originals safe in snapshot)"
  local diffs="${backup}/HOTFIX_DIFFS"; mkdir -p "$diffs"; local f had=0
  for f in \
      superset-frontend/src/visualizations/DHIS2Map/DHIS2Map.tsx \
      superset-frontend/src/visualizations/DHIS2Map/transformProps.ts \
      superset-frontend/webpack.config.js \
      superset/dhis2/diagnostics_api.py \
      superset/local_staging/admin_tools.py ; do
    if [[ -f "$backup/$f" ]] && ! diff -q "$backup/$f" "$APP/$f" >/dev/null 2>&1; then
      had=1; diff -u "$APP/$f" "$backup/$f" > "${diffs}/$(echo "$f" | tr '/' '_').diff" || true
      warn "server-edited file now differs from fork: $f"
    fi
  done
  [[ "$had" -eq 0 ]] && info "no server hotfixes differ from the fork."
  info "review dir: $diffs"
  printf 'BACKUP=%s\nTS=%s\nDUMP=%s\n' "$backup" "$ts" "$dump" > "$MARKER"

  log "PREPARE COMPLETE"
  cat <<EOF
  Next: review the hotfix diffs above; re-copy any fix the fork is missing, e.g.
    cp $backup/superset/dhis2/diagnostics_api.py $APP/superset/dhis2/diagnostics_api.py
  Then:  sudo $0 apply
  Undo now (no DB touched yet):  sudo $0 rollback
EOF
}

# ==========================================================================
# Deploy — phase 2: apply
# ==========================================================================
cmd_apply() {
  require_root; load_env
  [[ -f "$MARKER" ]] || die "no prepare state ($MARKER). Run '$0 prepare' first."
  # shellcheck disable=SC1090
  . "$MARKER"; info "snapshot: ${BACKUP:?}   dump: ${DUMP:-<none>}"

  cmd_role_rename
  log "ownership + frontend build"
  chown -R "$SVC_USER:$SVC_USER" "$APP"
  as_svc bash -c "cd '$APP/superset-frontend' && npm ci --legacy-peer-deps && DISABLE_TYPE_CHECK=true npm run build"
  test -d "$APP/superset/static/assets" || die "build produced no assets/ — aborting before restart."
  cmd_init
  cmd_restart
  cmd_health || die "web not healthy after restart — consider: sudo $0 rollback"

  log "APPLY COMPLETE — verify at https://malaria.health.go.ug"
  cat <<EOF
  Checks: dashboards render; encrypted DB conns load (SECRET_KEY intact); domain
  unchanged; Data Management sees Datasets+AI, not DHIS2 Instances; Analytics/End
  user restricted; new maps/CSS visible.
  Full revert if anything is off:  sudo $0 rollback
EOF
}

# ==========================================================================
# Rollback — one-shot revert to the last pre-update snapshot
# ==========================================================================
cmd_rollback() {
  require_root; load_env
  local backup dump
  if [[ -f "$MARKER" ]]; then . "$MARKER"; backup="${BACKUP:-}"; dump="${DUMP:-}"; fi
  [[ -n "${backup:-}" && -d "$backup" ]] || \
    backup="$(ls -1dt ${BACKUP_ROOT}/dhis2-superset.backup_before_update_* 2>/dev/null | head -1 || true)"
  [[ -n "${backup:-}" && -d "$backup" ]] || die "no snapshot found to roll back to."

  warn "Rolling back to: $backup"
  local ts; ts="$(date +%Y%m%d_%H%M%S)"
  log "stop services"; sctl stop || true
  log "set aside current (broken) tree -> $APP.rolledback_$ts"
  rm -rf "$APP.rolledback_$ts" 2>/dev/null || true
  mv "$APP" "$APP.rolledback_$ts"
  log "restore snapshot"
  cp -a "$backup" "$APP"
  chown -R "$SVC_USER:$SVC_USER" "$APP"
  log "revert role rename (best-effort)"
  if command -v psql >/dev/null; then
    psql "$PG_URI" -c "UPDATE ab_role SET name='Analytic' WHERE name='Analytics';" || true
    psql "$PG_URI" -c "UPDATE ab_role SET name='End User' WHERE name='End user';" || true
  fi
  log "start services"; sctl start; sleep 4; cmd_health || true
  log "ROLLBACK COMPLETE (restored code from snapshot; roles reverted)"
  [[ -n "${dump:-}" ]] && info "Deeper DB restore if needed:  pg_restore --clean --if-exists -d \"$PG_URI\" $dump"
}

# ==========================================================================
usage() {
  cat <<EOF
Usage: sudo $0 <command>

Deploy / revert:
  prepare          Backup (DB + app dir) + pull code from $REF + restore config + hotfix diffs
  apply            Role rename + npm build + init + restart + health  (run after prepare)
  rollback         One-shot revert to the last pre-update snapshot (+ revert role rename)

Services (systemd: $SERVICES):
  start | stop | restart          All three services
  restart-web                     Just gunicorn (superset.service)
  restart-celery                  Just worker + beat
  status                          systemctl status + code rev + health

Build / maintenance:
  build-frontend                  npm ci --legacy-peer-deps && DISABLE_TYPE_CHECK=true npm run build (then 'restart' to serve)
  init                            superset db upgrade && superset init
  role-rename                     Analytic->Analytics, End User->End user (idempotent)
  clear-cache                     Python + frontend build caches (leaves Redis alone)
  clear-logs                      Truncate celery log files

Diagnostics:
  logs [web|worker|beat|follow] [N]   Tail service logs (journalctl); default web/80
  health                          curl /health

Source: $REPO_URL ($REF). Never touches superset_config.py, env, nginx, or domain.
EOF
}

case "${1:-help}" in
  prepare)         cmd_prepare ;;
  apply)           cmd_apply ;;
  rollback)        cmd_rollback ;;
  start)           cmd_start ;;
  stop)            cmd_stop ;;
  restart)         cmd_restart ;;
  restart-web)     cmd_restart_web ;;
  restart-celery)  cmd_restart_celery ;;
  status)          cmd_status ;;
  build-frontend)  cmd_build_frontend ;;
  init)            cmd_init ;;
  role-rename)     cmd_role_rename ;;
  clear-cache)     cmd_clear_cache ;;
  clear-logs)      cmd_clear_logs ;;
  logs)            shift; cmd_logs "$@" ;;
  health)          cmd_health ;;
  help|--help|-h)  usage ;;
  *) printf 'Unknown command: %s\n\n' "${1:-}"; usage; exit 2 ;;
esac
