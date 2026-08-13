#!/usr/bin/env bash
# =============================================================================
# LocalAI Deployment Script for Superset AI Insights
# =============================================================================
# Installs LocalAI, prepares a persistent service on Linux, and outputs
# env vars for Superset.
#
# Usage:
#   bash scripts/setup_localai.sh              # install + start (no auto-download)
#   bash scripts/setup_localai.sh start        # start service only
#   bash scripts/setup_localai.sh stop         # stop service
#   bash scripts/setup_localai.sh status       # check health
#   bash scripts/setup_localai.sh models       # list available models
#   bash scripts/setup_localai.sh download-model  # install the two gallery models
#
# Port: 39671 (configurable via LOCALAI_PORT env var)
#
# Recommended models for Superset analytics:
#   1. qwen3.5-4b                        — daily CPU-friendly default
#   2. deepseek-r1-distill-qwen-7b       — slower secondary reasoning model
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

LOCALAI_BIN_DIR="${LOCALAI_BIN_DIR:-${PROJECT_ROOT}/.localai/bin}"
LOCALAI_VERSION="${LOCALAI_VERSION:-v3.7.0}"

export PATH="$LOCALAI_BIN_DIR:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

LOCALAI_PORT="${LOCALAI_PORT:-39671}"
LOCALAI_MODELS_DIR="${LOCALAI_MODELS_DIR:-$HOME/.local/share/localai/models}"
LOCALAI_BACKENDS_DIR="${LOCALAI_BACKENDS_DIR:-$HOME/.local/share/localai/backends}"
LOCALAI_LOG_DIR="${LOCALAI_LOG_DIR:-$HOME/.local/share/localai/logs}"
LOCALAI_URL="http://127.0.0.1:${LOCALAI_PORT}"
LOCALAI_THREADS="${LOCALAI_THREADS:-8}"
LOCALAI_EXTERNAL_BACKENDS="${LOCALAI_EXTERNAL_BACKENDS:-llama-cpp}"
LOCALAI_API_KEY_ENV="${LOCALAI_API_KEY_ENV:-LOCALAI_API_KEY}"
LOCALAI_API_KEY_VALUE="${!LOCALAI_API_KEY_ENV:-${LOCALAI_API_KEY:-}}"

GALLERY_MODELS=(
    "qwen3.5-4b"
    "deepseek-r1-distill-qwen-7b"
)

if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

log()   { echo -e "${BLUE}[localai]${NC} $*"; }
ok()    { echo -e "${GREEN}[localai]${NC} $*"; }
warn()  { echo -e "${YELLOW}[localai]${NC} $*"; }
err()   { echo -e "${RED}[localai]${NC} $*" >&2; }

# ── Helpers ──────────────────────────────────────────────────────────────────

require_localai() {
    if command -v local-ai >/dev/null 2>&1; then
        return 0
    fi

    err "LocalAI is not installed or local-ai is not on PATH."
    err "Install it with: bash scripts/setup_localai.sh install"
    err "Then confirm it works with: local-ai --help"
    return 1
}

has_localai_cli() {
    command -v local-ai >/dev/null 2>&1
}

supports_localai_backends_cli() {
    local help_text=""
    help_text="$(local-ai --help 2>/dev/null || true)"
    printf '%s' "$help_text" | grep -qE '^[[:space:]]+backends([[:space:]]|$)'
}

supports_localai_run_subcommand() {
    local help_text=""
    help_text="$(local-ai --help 2>/dev/null || true)"
    printf '%s' "$help_text" | grep -qE '^[[:space:]]+run([[:space:]]|$)'
}

supports_localai_flag() {
    local flag="${1:?flag name required}"
    local help_text=""
    help_text="$(local-ai --help 2>/dev/null || true)"
    printf '%s' "$help_text" | grep -q -- "$flag"
}

require_localai_cli() {
    if has_localai_cli; then
        return 0
    fi

    err "The local-ai CLI is required for this command."
    err "Install it with: bash scripts/setup_localai.sh install"
    return 1
}

localai_asset_name() {
    local os arch
    os="$(uname -s)"
    arch="$(uname -m)"

    if [[ "$LOCALAI_VERSION" == v2.* ]]; then
        case "${os}:${arch}" in
            Darwin:x86_64) echo "local-ai-avx2-Darwin-x86_64" ;;
            Linux:x86_64|Linux:amd64) echo "local-ai-avx2-Linux-x86_64" ;;
            *)
                err "Unsupported LocalAI ${LOCALAI_VERSION} binary platform: ${os}/${arch}"
                return 1
                ;;
        esac
        return 0
    fi

    case "${os}:${arch}" in
        Darwin:x86_64) echo "local-ai-${LOCALAI_VERSION}-darwin-amd64" ;;
        Darwin:arm64) echo "local-ai-${LOCALAI_VERSION}-darwin-arm64" ;;
        Linux:x86_64|Linux:amd64) echo "local-ai-${LOCALAI_VERSION}-linux-amd64" ;;
        Linux:aarch64|Linux:arm64) echo "local-ai-${LOCALAI_VERSION}-linux-arm64" ;;
        *)
            err "Unsupported LocalAI binary platform: ${os}/${arch}"
            return 1
            ;;
    esac
}

install_localai_binary() {
    local asset url tmp
    asset="$(localai_asset_name)"
    url="https://github.com/mudler/LocalAI/releases/download/${LOCALAI_VERSION}/${asset}"
    tmp="${LOCALAI_BIN_DIR}/local-ai.download"

    mkdir -p "$LOCALAI_BIN_DIR"
    log "Installing LocalAI ${LOCALAI_VERSION} into ${LOCALAI_BIN_DIR} ..."
    log "Source: ${url}"
    if curl -fL --progress-bar -o "$tmp" "$url"; then
        mv "$tmp" "${LOCALAI_BIN_DIR}/local-ai"
        chmod +x "${LOCALAI_BIN_DIR}/local-ai"
        ok "LocalAI installed: $("${LOCALAI_BIN_DIR}/local-ai" --version 2>/dev/null || echo "${LOCALAI_BIN_DIR}/local-ai")"
    else
        rm -f "$tmp"
        err "Failed to download LocalAI binary from ${url}"
        err "Set LOCALAI_VERSION to another release if this platform is not available."
        return 1
    fi
}

is_running() {
    curl -s --connect-timeout 2 "${LOCALAI_URL}/readyz" &>/dev/null
}

wait_ready() {
    local max_wait="${1:-20}"
    for i in $(seq 1 "$max_wait"); do
        if is_running; then return 0; fi
        sleep 1
    done
    return 1
}

# ── Install ──────────────────────────────────────────────────────────────────

do_install() {
    local installed_version=""
    installed_version="$(local-ai --version 2>/dev/null || true)"
    if has_localai_cli && echo "$installed_version" | grep -q "${LOCALAI_VERSION#v}"; then
        ok "LocalAI already installed: ${installed_version}"
    else
        install_localai_binary
    fi
    mkdir -p "$LOCALAI_MODELS_DIR" "$LOCALAI_BACKENDS_DIR" "$LOCALAI_LOG_DIR"
}

# ── Backend & Model Preflight ────────────────────────────────────────────────

ensure_backend() {
    require_localai_cli || return 1
    if ! supports_localai_backends_cli; then
        warn "This LocalAI binary does not support the 'backends' CLI."
        warn "Skipping explicit llama-cpp backend installation and relying on runtime-managed backend assets."
        return 0
    fi
    # Check if llama-cpp backend is already installed
    if BACKENDS_PATH="$LOCALAI_BACKENDS_DIR" local-ai backends list --installed 2>/dev/null | grep -q "llama-cpp"; then
        ok "llama-cpp backend already installed"
        return 0
    fi
    log "Installing llama-cpp backend (one-time download) ..."
    local backend_output=""
    backend_output="$(
        BACKENDS_PATH="$LOCALAI_BACKENDS_DIR" local-ai backends install \
            --backends-path "$LOCALAI_BACKENDS_DIR" localai@llama-cpp 2>&1
    )" || {
        printf '%s\n' "$backend_output" | tail -1
        warn "llama-cpp backend install failed; continuing with built-in/local backend support if available."
        return 0
    }
    printf '%s\n' "$backend_output" | tail -1
    ok "llama-cpp backend installed"
}

install_gallery_model() {
    require_localai_cli || return 1
    local model_id="${1:?model id required}"
    log "Installing LocalAI gallery model: ${model_id} ..."
    local-ai models install "${model_id}"
    ok "Gallery model installed: ${model_id}"
}

install_recommended_models() {
    local failed=0
    for model_id in "${GALLERY_MODELS[@]}"; do
        if ! install_gallery_model "$model_id"; then
            failed=1
        fi
    done
    return "$failed"
}

# ── Start / Stop ─────────────────────────────────────────────────────────────

has_systemd() {
    command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]
}

run_privileged() {
    if [ "$(id -u)" -eq 0 ]; then
        "$@"
    else
        sudo "$@"
    fi
}

start_systemd_service() {
    run_privileged systemctl daemon-reload
    run_privileged systemctl enable --now localai-superset.service
}

do_start() {
    require_localai || exit 1

    if is_running; then
        ok "LocalAI already running at ${LOCALAI_URL}"
        return 0
    fi
    mkdir -p "$LOCALAI_MODELS_DIR" "$LOCALAI_BACKENDS_DIR" "$LOCALAI_LOG_DIR"
    ensure_backend

    if has_systemd; then
        log "Configuring persistent systemd service localai-superset ..."
        do_systemd
        log "Starting LocalAI systemd service ..."
        start_systemd_service
    else
        log "Starting LocalAI on port ${LOCALAI_PORT} (threads=${LOCALAI_THREADS}, backends=${LOCALAI_EXTERNAL_BACKENDS}) ..."
        local args=()
        if supports_localai_flag "--address"; then
            args+=(--address ":${LOCALAI_PORT}")
        fi
        if supports_localai_flag "--threads"; then
            args+=(--threads "$LOCALAI_THREADS")
        fi
        if supports_localai_flag "--galleries"; then
            args+=(--galleries '[]')
        fi
        if supports_localai_flag "--preload-models"; then
            args+=(--preload-models "")
        fi
        if supports_localai_flag "--log-level"; then
            args+=(--log-level info)
        fi
        if supports_localai_flag "--models-path"; then
            args+=(--models-path "$LOCALAI_MODELS_DIR")
        fi
        if supports_localai_flag "--backends-path"; then
            args+=(--backends-path "$LOCALAI_BACKENDS_DIR")
        elif supports_localai_flag "--backend-assets-path"; then
            args+=(--backend-assets-path "$LOCALAI_BACKENDS_DIR")
        fi
        if supports_localai_flag "--external-grpc-backends"; then
            args+=(--external-grpc-backends "$LOCALAI_EXTERNAL_BACKENDS")
        fi
        if supports_localai_run_subcommand; then
            args=(run "${args[@]}")
        fi
        if [ -n "${LOCALAI_API_KEY_VALUE}" ]; then
            args+=(--api-keys "$LOCALAI_API_KEY_VALUE")
        fi
        MODELS_PATH="$LOCALAI_MODELS_DIR" BACKENDS_PATH="$LOCALAI_BACKENDS_DIR" nohup local-ai "${args[@]}" \
            >> "${LOCALAI_LOG_DIR}/localai.log" 2>&1 &
        echo $! > "${LOCALAI_LOG_DIR}/localai.pid"
    fi

    # LocalAI is ready only after the service responds to readyz. On a fresh
    # box with no models installed, the service can still come up while the
    # catalog remains empty.
    local timeout=120
    log "Waiting for readyz (timeout=${timeout}s) ..."
    if wait_ready "$timeout"; then
        if has_systemd; then
            ok "LocalAI service ready at ${LOCALAI_URL}"
        else
            ok "LocalAI ready at ${LOCALAI_URL} (PID $(cat "${LOCALAI_LOG_DIR}/localai.pid"))"
        fi
    else
        if has_systemd; then
            warn "LocalAI service started but readyz is not responding yet."
            warn "Check: systemctl status localai-superset.service"
            warn "Logs:  journalctl -u localai-superset.service -f"
            warn "If the models are not installed yet, run: bash scripts/setup_localai.sh download-model"
        elif pgrep -f "local-ai run" &>/dev/null; then
            warn "LocalAI process running but readyz not responding."
            warn "Monitor: tail -f ${LOCALAI_LOG_DIR}/localai.log"
        else
            err "LocalAI failed to start. Check ${LOCALAI_LOG_DIR}/localai.log"
            exit 1
        fi
    fi
}

do_stop() {
    if has_systemd && systemctl status localai-superset.service >/dev/null 2>&1; then
        run_privileged systemctl stop localai-superset.service
        ok "Stopped LocalAI systemd service"
        return 0
    fi

    local pidfile="${LOCALAI_LOG_DIR}/localai.pid"
    if [ -f "$pidfile" ]; then
        local pid=$(cat "$pidfile")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid"
            ok "Stopped LocalAI (PID $pid)"
        fi
        rm -f "$pidfile"
    fi
    pkill -f "local-ai run.*:${LOCALAI_PORT}" 2>/dev/null || true
}

do_status() {
    require_localai || exit 1

    if is_running; then
        ok "LocalAI is running at ${LOCALAI_URL}"
        log "Installed models:"
        curl -s "${LOCALAI_URL}/v1/models" 2>/dev/null | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    models = data.get('data', [])
    if models:
        for m in models:
            print(f\"  - {m.get('id', '?')}\")
    else:
        print('  (none)')
except: print('  (could not parse)')
" 2>&1
    else
        warn "LocalAI is NOT running"
    fi
}

# ── Models ───────────────────────────────────────────────────────────────────

do_models() {
    require_localai || exit 1

    log ""
    log "Available gallery models from LocalAI:"
    local-ai models list || warn "Could not list LocalAI gallery models"
    log ""
    log "Model downloads can be managed from the Superset UI:"
    log "  AI Management → LocalAI Model Hub → Download"
    log ""
    log "Models in the Superset catalog:"
    for model in "${GALLERY_MODELS[@]}"; do
        log "  - ${model}"
    done
    log ""
    log "Install the recommended LocalAI gallery models:"
    log "  bash scripts/setup_localai.sh download-model"
}

do_download_model() {
    mkdir -p "$LOCALAI_MODELS_DIR" "$LOCALAI_BACKENDS_DIR" "$LOCALAI_LOG_DIR"
    install_recommended_models || return 1
}

# ── Print env vars ───────────────────────────────────────────────────────────

print_env() {
    local model_list
    model_list=$(IFS=,; echo "${GALLERY_MODELS[*]}")
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN} Add these to your .env or shell profile:${NC}"
    echo ""
    echo "   export LOCALAI_BASE_URL=${LOCALAI_URL}"
    echo "   export LOCALAI_MODELS=${model_list}"
    echo "   export LOCALAI_DEFAULT_MODEL=${GALLERY_MODELS[0]}"
    echo "   export LOCALAI_EXTERNAL_BACKENDS=${LOCALAI_EXTERNAL_BACKENDS}"
    echo "   export LOCALAI_BACKENDS_DIR=${LOCALAI_BACKENDS_DIR}"
    if [ -n "${LOCALAI_API_KEY_VALUE}" ]; then
        echo "   export ${LOCALAI_API_KEY_ENV}=${LOCALAI_API_KEY_VALUE}"
    fi
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════${NC}"
}

# ── Systemd unit (Linux deployments) ────────────────────────────────────────

do_systemd() {
    require_localai_cli || exit 1

    local unit_file="/etc/systemd/system/localai-superset.service"
    local localai_bin
    localai_bin=$(which local-ai)
    log "Writing systemd unit to ${unit_file} ..."
    run_privileged tee "$unit_file" > /dev/null <<UNIT
[Unit]
Description=LocalAI for Superset AI Insights
After=network.target

[Service]
Type=simple
User=$(whoami)
Environment=MODELS_PATH=${LOCALAI_MODELS_DIR}
Environment=BACKENDS_PATH=${LOCALAI_BACKENDS_DIR}
ExecStart=${localai_bin} run --address :${LOCALAI_PORT} --threads ${LOCALAI_THREADS} --models-path ${LOCALAI_MODELS_DIR} --backends-path ${LOCALAI_BACKENDS_DIR} --external-grpc-backends ${LOCALAI_EXTERNAL_BACKENDS} --galleries '[]' --preload-models '' --log-level info
Restart=on-failure
RestartSec=5
StandardOutput=append:${LOCALAI_LOG_DIR}/localai.log
StandardError=append:${LOCALAI_LOG_DIR}/localai.log

[Install]
WantedBy=multi-user.target
UNIT
    run_privileged systemctl daemon-reload
    run_privileged systemctl enable localai-superset
    ok "Systemd unit created and enabled. Start with: sudo systemctl start localai-superset"
}

# ── Launchd plist (macOS deployments) ───────────────────────────────────────

do_launchd() {
    require_localai_cli || exit 1

    local plist_file="$HOME/Library/LaunchAgents/io.localai.superset.plist"
    local localai_bin
    localai_bin=$(which local-ai)
    mkdir -p "$HOME/Library/LaunchAgents"
    log "Writing launchd plist to ${plist_file} ..."
    cat > "$plist_file" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>io.localai.superset</string>
    <key>ProgramArguments</key>
    <array>
        <string>${localai_bin}</string>
        <string>run</string>
        <string>--address</string>
        <string>:${LOCALAI_PORT}</string>
        <string>--threads</string>
        <string>${LOCALAI_THREADS}</string>
        <string>--backends-path</string>
        <string>${LOCALAI_BACKENDS_DIR}</string>
        <string>--models-path</string>
        <string>${LOCALAI_MODELS_DIR}</string>
        <string>--external-grpc-backends</string>
        <string>${LOCALAI_EXTERNAL_BACKENDS}</string>
        <string>--galleries</string>
        <string>[]</string>
        <string>--preload-models</string>
        <string></string>
        <string>--log-level</string>
        <string>info</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>MODELS_PATH</key>
        <string>${LOCALAI_MODELS_DIR}</string>
        <key>BACKENDS_PATH</key>
        <string>${LOCALAI_BACKENDS_DIR}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOCALAI_LOG_DIR}/localai.log</string>
    <key>StandardErrorPath</key>
    <string>${LOCALAI_LOG_DIR}/localai.log</string>
</dict>
</plist>
PLIST
    ok "Launchd plist created."
    log "Load now:    launchctl load ${plist_file}"
    log "Unload:      launchctl unload ${plist_file}"
}

# ── Main ─────────────────────────────────────────────────────────────────────

case "${1:-}" in
    start)
        do_start
        ;;
    stop)
        do_stop
        ;;
    status)
        do_status
        ;;
    models)
        do_models
        ;;
    systemd)
        do_systemd
        ;;
    launchd)
        do_launchd
        ;;
    download-model)
        do_download_model
        ;;
    ""|install)
        do_install
        install_recommended_models || exit 1
        do_start
        print_env
        ;;
    *)
        echo "Usage: $0 {install|start|stop|status|models|download-model|systemd|launchd}"
        exit 1
        ;;
esac
