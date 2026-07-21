#!/usr/bin/env bash
#
# deploy-malaria-update.sh
# --------------------------------------------------------------------------
# Minimal, config- and domain-preserving code update for the LIVE server
#   https://malaria.health.go.ug   (LXC "superset" container, dhis2-superset)
#
# What it DOES:   backup -> git fast-forward to origin/martbasev1 -> restore the
#                 server's superset_config.py verbatim -> rebuild frontend ->
#                 reconcile role names -> db upgrade (no-op safety) ->
#                 superset init -> restart services -> health check.
#
# What it NEVER does (by design):
#   * regenerate superset_config.py, /etc/superset/superset.env, or nginx
#   * change the domain (would revert to the old vitalplatforms.com)
#   * run `git clean` (preserves run/, logs/, node_modules/, .bak hotfixes)
#   * touch the metadata schema (prod is already at alembic head -> no-op)
#
# Run as ROOT inside the "superset" container. Two phases:
#   sudo ./deploy-malaria-update.sh prepare   # backup + code update + config restore + emit hotfix diffs
#   # ...review the hotfix diffs printed under the backup dir, sanity-check config...
#   sudo ./deploy-malaria-update.sh apply     # role rename + build + init + restart + verify
#
# Rollback is described at the end of `prepare` output.
# --------------------------------------------------------------------------
set -euo pipefail

# ---- fixed facts about this server (see server_info.md) -------------------
APP=/opt/dhis2-superset
VENV=/opt/superset-venv
ENV_FILE=/etc/superset/superset.env
SVC_USER=superset
REMOTE=origin
REF=martbasev1
EXPECTED_CONFIG_PATH=/opt/dhis2-superset/superset_config.py
BACKUP_ROOT=/opt
MARKER=/opt/.malaria_update_state    # records the backup dir chosen by `prepare`

log()  { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
info() { printf '   %s\n' "$*"; }
die()  { printf '\n\033[1;31mABORT: %s\033[0m\n' "$*" >&2; exit 1; }

require_root() { [[ "$(id -u)" -eq 0 ]] || die "run as root (sudo)."; }

load_env() {
  # Load the prod env exactly the way the systemd units do.
  [[ -f "$ENV_FILE" ]] || die "missing $ENV_FILE"
  set -a; . "$ENV_FILE"; set +a
  # Guard: config must still be the in-repo file we intend to protect.
  grep -q "SUPERSET_CONFIG_PATH=$EXPECTED_CONFIG_PATH" "$ENV_FILE" \
    || die "SUPERSET_CONFIG_PATH in $ENV_FILE is not $EXPECTED_CONFIG_PATH — stop and re-check before proceeding."
  : "${SQLALCHEMY_DATABASE_URI:?SQLALCHEMY_DATABASE_URI not set in $ENV_FILE}"
  # pg_dump/psql want a plain postgresql:// URI (strip any +driver).
  PG_URI="$(printf '%s' "$SQLALCHEMY_DATABASE_URI" | sed -E 's#^postgresql\+[a-z0-9_]+://#postgresql://#')"
}

# ==========================================================================
phase_prepare() {
  require_root
  load_env

  local ts; ts="$(date +%Y%m%d_%H%M%S)"
  local backup="${BACKUP_ROOT}/dhis2-superset.backup_before_update_${ts}"

  log "Pre-flight"
  command -v git  >/dev/null || die "git not found"
  test -d "$APP/.git" || die "$APP is not a git checkout"
  local free_kb; free_kb="$(df -Pk "$BACKUP_ROOT" | awk 'NR==2{print $4}')"
  info "free space on $BACKUP_ROOT: $((free_kb/1024/1024)) GiB"

  log "Step 1a — metadata DB backup (pg_dump -Fc)"
  local dump="${BACKUP_ROOT}/metadata_${ts}.dump"
  if command -v pg_dump >/dev/null; then
    pg_dump -Fc "$PG_URI" -f "$dump" && info "wrote $dump ($(du -h "$dump" | cut -f1))"
  else
    info "pg_dump NOT installed in this container."
    info ">> Run this from the postgres container BEFORE continuing, then re-run prepare:"
    info "   pg_dump -Fc <dbname> -f /var/lib/postgresql/metadata_${ts}.dump"
    die "metadata backup is mandatory — install postgresql-client or dump from the postgres CT."
  fi

  log "Step 1b — full app-dir snapshot (preserves config + all server hotfixes)"
  cp -a "$APP" "$backup"
  info "snapshot: $backup"

  log "Step 3 — update code to $REMOTE/$REF (fast-forward; NO git clean)"
  git -C "$APP" fetch "$REMOTE" "$REF" --tags 2>/dev/null \
    || git -C "$APP" fetch --unshallow "$REMOTE" "$REF"    # shallow-clone fallback
  local before after
  before="$(git -C "$APP" rev-parse --short HEAD)"
  # Force tracked files to the branch tip. Untracked (run/ logs/ node_modules/
  # *.bak) are left intact because we never call `git clean`.
  git -C "$APP" checkout -f "$REF"
  git -C "$APP" reset --hard "$REMOTE/$REF"
  after="$(git -C "$APP" rev-parse --short HEAD)"
  info "HEAD: $before -> $after"

  log "Step 3b — restore the server's superset_config.py verbatim (SECRET_KEY + domain)"
  cp -a "$backup/superset_config.py" "$APP/superset_config.py"
  # Sanity: the restored config must NOT contain the retired domain, and the env
  # must still point at it.
  if grep -qi 'vitalplatform' "$APP/superset_config.py"; then
    info "WARNING: restored superset_config.py mentions 'vitalplatform' — verify the domain by hand."
  fi
  mkdir -p "$APP/run" "$APP/logs"

  log "Step 4 — hotfix diffs for MANUAL review (nothing lost; originals in snapshot)"
  local diffs="${backup}/HOTFIX_DIFFS"; mkdir -p "$diffs"
  local f had=0
  for f in \
      superset-frontend/src/visualizations/DHIS2Map/DHIS2Map.tsx \
      superset-frontend/src/visualizations/DHIS2Map/transformProps.ts \
      superset-frontend/webpack.config.js \
      superset/dhis2/diagnostics_api.py \
      superset/local_staging/admin_tools.py ; do
    if [[ -f "$backup/$f" ]]; then
      if ! diff -q "$backup/$f" "$APP/$f" >/dev/null 2>&1; then
        had=1
        diff -u "$APP/$f" "$backup/$f" > "${diffs}/$(echo "$f" | tr '/' '_').diff" || true
        info "differs from branch: $f"
      fi
    fi
  done
  [[ "$had" -eq 0 ]] && info "no server hotfixes differ from the branch — nothing to port."
  info "review dir: $diffs   (re-apply anything genuinely newer than the branch by hand)"

  # record state for `apply`
  printf 'BACKUP=%s\nTS=%s\nDUMP=%s\n' "$backup" "$ts" "$dump" > "$MARKER"

  log "PREPARE COMPLETE — review, then run:  sudo $0 apply"
  cat <<EOF

  Rollback (if you decide not to proceed):
    systemctl stop superset superset-worker superset-beat
    rm -rf $APP && mv "$backup" $APP
    systemctl start superset superset-worker superset-beat
  (DB untouched so far — no restore needed until 'apply' runs init/rename.)
EOF
}

# ==========================================================================
phase_apply() {
  require_root
  load_env
  [[ -f "$MARKER" ]] || die "no prepare state found ($MARKER). Run '$0 prepare' first."
  # shellcheck disable=SC1090
  . "$MARKER"
  info "using snapshot: ${BACKUP:?}   dump: ${DUMP:-<none>}"

  log "Step 2 — reconcile role names BEFORE init (idempotent; preserves user links)"
  command -v psql >/dev/null || die "psql not found (needed for the role rename)."
  psql "$PG_URI" -v ON_ERROR_STOP=1 <<'SQL'
UPDATE ab_role SET name = 'Analytics' WHERE name = 'Analytic';
UPDATE ab_role SET name = 'End user'  WHERE name = 'End User';
SQL
  info "role names aligned with code (Analytics / End user)."

  log "Step 5 — ownership + frontend build (as $SVC_USER)"
  chown -R "$SVC_USER:$SVC_USER" "$APP"
  sudo -u "$SVC_USER" bash -lc "cd '$APP/superset-frontend' && npm ci && npm run build"
  test -d "$APP/superset/static/assets" || die "frontend build produced no assets/ — aborting before restart."

  log "Step 6 — db upgrade (expected NO-OP) + superset init (role/permission sync)"
  sudo -u "$SVC_USER" -E "$VENV/bin/superset" db upgrade
  sudo -u "$SVC_USER" -E "$VENV/bin/superset" init

  log "Step 7 — restart services"
  systemctl restart superset superset-worker superset-beat
  sleep 5
  systemctl --no-pager --lines=0 status superset superset-worker superset-beat || true

  log "Step 7b — health check"
  if curl -fsS -o /dev/null "http://127.0.0.1:8088/health"; then
    info "health endpoint OK"
  else
    info "health check FAILED — inspect: journalctl -u superset -n 50 --no-pager"
    die "web service is not healthy after restart. Consider rollback (see below)."
  fi

  log "APPLY COMPLETE"
  cat <<EOF

  Verify in a browser (https://malaria.health.go.ug):
    1. Existing dashboards/charts render; a chart on a DB connection with an
       encrypted password loads  -> SECRET_KEY intact.
    2. Domain unchanged (malaria.health.go.ug), TLS OK.
    3. Data Management: sees Datasets + AI Management, NOT DHIS2 Instances.
    4. Analytics / End user: restricted; End user still sees dashboards.
    5. New maps / CSS / e-charts visible.

  Rollback (if a check fails):
    systemctl stop superset superset-worker superset-beat
    rm -rf $APP && mv "$BACKUP" $APP
    ${DUMP:+pg_restore --clean --if-exists -d "\$PG_URI" "$DUMP"   # only if roles/init look wrong}
    systemctl start superset superset-worker superset-beat
  Or just revert the role rename:
    psql "\$PG_URI" -c "UPDATE ab_role SET name='Analytic' WHERE name='Analytics';"
    psql "\$PG_URI" -c "UPDATE ab_role SET name='End User' WHERE name='End user';"
EOF
}

# ==========================================================================
case "${1:-}" in
  prepare) phase_prepare ;;
  apply)   phase_apply ;;
  *) cat <<EOF
Usage: sudo $0 {prepare|apply}

  prepare  Backup (DB + app dir), fast-forward code to $REMOTE/$REF, restore the
           server's superset_config.py, and emit hotfix diffs for review.
  apply    Reconcile role names, rebuild frontend, superset db upgrade + init,
           restart services, health check.

Run 'prepare', review the hotfix diffs + config, then run 'apply'.
EOF
     exit 2 ;;
esac
