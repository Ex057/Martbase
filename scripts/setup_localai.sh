#!/usr/bin/env bash
# =============================================================================
# LocalAI Deployment Script for Superset AI Insights
# =============================================================================
# Installs LocalAI, downloads recommended models for health analytics,
# creates a launchd/systemd service, and outputs env vars for Superset.
#
# Usage:
#   bash scripts/setup_localai.sh              # install + start (no auto-download)
#   bash scripts/setup_localai.sh start        # start service only
#   bash scripts/setup_localai.sh stop         # stop service
#   bash scripts/setup_localai.sh status       # check health
#   bash scripts/setup_localai.sh models       # list available models
#   bash scripts/setup_localai.sh download-model  # manually download custom model GGUF
#
# Port: 39671 (configurable via LOCALAI_PORT env var)
#
# Recommended models for Superset analytics:
#   1. ai-insights-model-26.04           — default optimized analytics copilot
#   2. hermes-3-llama-3.1-8b-lorablated  — general chart/dashboard insights
#   3. deepseek-r1-distill-qwen-7b       — reasoning / SQL generation
#   4. qwen3-8b                          — structured output, tables
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

LOCALAI_BIN_DIR="${LOCALAI_BIN_DIR:-${PROJECT_ROOT}/.localai/bin}"
LOCALAI_VERSION="${LOCALAI_VERSION:-v2.12.1}"

export PATH="$LOCALAI_BIN_DIR:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

LOCALAI_PORT="${LOCALAI_PORT:-39671}"
LOCALAI_MODELS_DIR="${LOCALAI_MODELS_DIR:-$HOME/.local/share/localai/models}"
LOCALAI_BACKENDS_DIR="${LOCALAI_BACKENDS_DIR:-$HOME/.local/share/localai/backends}"
LOCALAI_LOG_DIR="${LOCALAI_LOG_DIR:-$HOME/.local/share/localai/logs}"
LOCALAI_URL="http://127.0.0.1:${LOCALAI_PORT}"
LOCALAI_THREADS="${LOCALAI_THREADS:-$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)}"
LOCALAI_EXTERNAL_BACKENDS="${LOCALAI_EXTERNAL_BACKENDS:-llama-cpp}"
LOCALAI_API_KEY_ENV="${LOCALAI_API_KEY_ENV:-LOCALAI_API_KEY}"
LOCALAI_API_KEY_VALUE="${!LOCALAI_API_KEY_ENV:-${LOCALAI_API_KEY:-}}"

# Gallery models — these can be installed via /models/apply
GALLERY_MODELS=(
    "hermes-3-llama-3.1-8b-lorablated"
    "deepseek-r1-distill-qwen-7b"
    "qwen3-8b"
)
CUSTOM_MODEL_GALLERY_REF="hermes-3-llama-3.1-8b-lorablated:q4_k_m"

# Custom model config — references a base GGUF, not a gallery model
CUSTOM_MODEL_ID="ai-insights-model-26.04"
CUSTOM_MODEL_GGUF="hermes-3-llama-3.1-8b-lorablated.Q4_K_M.gguf"
CUSTOM_MODEL_GGUF_URL="https://huggingface.co/mlabonne/Hermes-3-Llama-3.1-8B-lorablated-GGUF/resolve/main/${CUSTOM_MODEL_GGUF}"

# Full model list for env output
MODELS=(
    "${CUSTOM_MODEL_ID}"
    "${GALLERY_MODELS[@]}"
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
    # Check if llama-cpp backend is already installed
    if BACKENDS_PATH="$LOCALAI_BACKENDS_DIR" local-ai backends list --installed 2>/dev/null | grep -q "llama-cpp"; then
        ok "llama-cpp backend already installed"
        return 0
    fi
    log "Installing llama-cpp backend (one-time download) ..."
    BACKENDS_PATH="$LOCALAI_BACKENDS_DIR" local-ai backends install \
        --backends-path "$LOCALAI_BACKENDS_DIR" localai@llama-cpp 2>&1 | tail -1
    ok "llama-cpp backend installed"
}

install_gallery_base_model() {
    require_localai_cli || return 1
    log "Installing LocalAI gallery model: ${CUSTOM_MODEL_GALLERY_REF} ..."
    local-ai models install "${CUSTOM_MODEL_GALLERY_REF}"
    ok "Gallery model installed: ${CUSTOM_MODEL_GALLERY_REF}"
}

ensure_custom_model_gguf() {
    local gguf_path="${LOCALAI_MODELS_DIR}/${CUSTOM_MODEL_GGUF}"
    if [ -f "$gguf_path" ]; then
        ok "Model GGUF exists: ${CUSTOM_MODEL_GGUF} ($(du -h "$gguf_path" | cut -f1))"
        return 0
    fi
    # Remove any partial download
    rm -f "${gguf_path}.partial"

    log "Downloading ${CUSTOM_MODEL_GGUF} (~4.6 GB) ..."
    log "Source: ${CUSTOM_MODEL_GGUF_URL}"
    if curl -L --progress-bar -o "$gguf_path" "$CUSTOM_MODEL_GGUF_URL"; then
        ok "Download complete: ${CUSTOM_MODEL_GGUF} ($(du -h "$gguf_path" | cut -f1))"
    else
        rm -f "$gguf_path"
        err "Failed to download ${CUSTOM_MODEL_GGUF}"
        return 1
    fi
}

# ── Start / Stop ─────────────────────────────────────────────────────────────

do_start() {
    require_localai || exit 1

    if is_running; then
        ok "LocalAI already running at ${LOCALAI_URL}"
        return 0
    fi
    mkdir -p "$LOCALAI_MODELS_DIR" "$LOCALAI_BACKENDS_DIR" "$LOCALAI_LOG_DIR"

    # Ensure llama-cpp backend is installed before starting
    ensure_backend

    # Patch macOS Metal backend to use llama-cpp-grpc (not fallback)
    local runsh="${LOCALAI_BACKENDS_DIR}/metal-llama-cpp/run.sh"
    if [ -f "$runsh" ] && ! grep -q "Darwin.*llama-cpp-grpc" "$runsh" 2>/dev/null; then
        log "Patching metal-llama-cpp/run.sh for macOS ..."
        sed -i.bak 's|BINARY=llama-cpp-fallback|BINARY=llama-cpp-fallback\n\n# macOS Metal: use grpc binary\nif [ "$(uname)" == "Darwin" ] \&\& [ -e $CURDIR/llama-cpp-grpc ]; then\n\tBINARY=llama-cpp-grpc\nfi|' "$runsh"
        sed -i.bak 's|/proc/cpuinfo ;|/proc/cpuinfo 2>/dev/null ;|g' "$runsh"
        sed -i.bak 's|/proc/cpuinfo |/proc/cpuinfo 2>/dev/null |g' "$runsh"
        rm -f "${runsh}.bak"
        ok "Backend patched for macOS Metal"
    fi

    log "Starting LocalAI on port ${LOCALAI_PORT} (threads=${LOCALAI_THREADS}, backends=${LOCALAI_EXTERNAL_BACKENDS}) ..."
    local args=(
        run
        --address ":${LOCALAI_PORT}"
        --threads "$LOCALAI_THREADS"
        --backends-path "$LOCALAI_BACKENDS_DIR"
        --galleries '[]'
        --preload-models ""
        --log-level info
    )
    if [ -n "${LOCALAI_API_KEY_VALUE}" ]; then
        args+=(--api-keys "$LOCALAI_API_KEY_VALUE")
    fi
    MODELS_PATH="$LOCALAI_MODELS_DIR" BACKENDS_PATH="$LOCALAI_BACKENDS_DIR" nohup local-ai "${args[@]}" \
        >> "${LOCALAI_LOG_DIR}/localai.log" 2>&1 &
    echo $! > "${LOCALAI_LOG_DIR}/localai.pid"
    # LocalAI blocks readyz until all model files are loaded/downloaded.
    # First boot may download GGUF files (~4.6 GB), so allow a long timeout.
    local timeout=600
    if [ -f "${LOCALAI_MODELS_DIR}/${CUSTOM_MODEL_GGUF}" ]; then
        timeout=30  # GGUF already present — should be fast
    fi
    log "Waiting for readyz (timeout=${timeout}s) ..."
    if wait_ready "$timeout"; then
        ok "LocalAI ready at ${LOCALAI_URL} (PID $(cat "${LOCALAI_LOG_DIR}/localai.pid"))"
    else
        if pgrep -f "local-ai run" &>/dev/null; then
            warn "LocalAI process running but readyz not responding."
            warn "It may still be downloading model files in the background."
            warn "Monitor: tail -f ${LOCALAI_LOG_DIR}/localai.log"
        else
            err "LocalAI failed to start. Check ${LOCALAI_LOG_DIR}/localai.log"
            exit 1
        fi
    fi
}

do_stop() {
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

deploy_custom_model() {
    # Deploy the YAML config only. GGUF download is managed from the UI
    # (AI Management → LocalAI Model Hub → Download) or via:
    #   bash scripts/setup_localai.sh download-model
    log "Deploying custom model config: ${CUSTOM_MODEL_ID} ..."

    local yaml_src
    yaml_src="$(dirname "$0")/../localai/models/${CUSTOM_MODEL_ID}.yaml"

    # Only copy YAML if GGUF is already present (prevents LocalAI from
    # trying to resolve a YAML without its backing GGUF file)
    local gguf_path="${LOCALAI_MODELS_DIR}/${CUSTOM_MODEL_GGUF}"
    if [ -f "$gguf_path" ]; then
        if [ -f "$yaml_src" ]; then
            cp "$yaml_src" "${LOCALAI_MODELS_DIR}/${CUSTOM_MODEL_ID}.yaml"
            ok "Model config deployed: ${CUSTOM_MODEL_ID}.yaml"
        fi
        ok "${CUSTOM_MODEL_ID} is ready (GGUF + YAML both present)"
    else
        warn "Base model GGUF not found: ${CUSTOM_MODEL_GGUF}"
        warn "Download it from the AI Management UI (LocalAI Model Hub tab)"
        warn "  or run: bash scripts/setup_localai.sh download-model"
    fi
}

do_models() {
    require_localai || exit 1

    # Deploy custom model config (YAML only — GGUF must be downloaded via UI)
    deploy_custom_model

    log ""
    log "Available gallery models from LocalAI:"
    local-ai models list || warn "Could not list LocalAI gallery models"
    log ""
    log "Model downloads can be managed from the Superset UI:"
    log "  AI Management → LocalAI Model Hub → Download"
    log ""
    log "Models in the Superset catalog:"
    for model in "${CUSTOM_MODEL_ID}" "${GALLERY_MODELS[@]}"; do
        log "  - ${model}"
    done
    log ""
    log "Install the recommended LocalAI gallery model:"
    log "  local-ai models install ${CUSTOM_MODEL_GALLERY_REF}"
    log ""
    log "Or download the custom model GGUF manually:"
    log "  bash scripts/setup_localai.sh download-model"
}

do_download_model() {
    mkdir -p "$LOCALAI_MODELS_DIR" "$LOCALAI_BACKENDS_DIR" "$LOCALAI_LOG_DIR"

    # Prefer LocalAI's gallery installer because it fetches both model config
    # and model weights when the gallery entry is available. Keep the direct
    # GGUF download as a fallback for environments without that gallery entry.
    if has_localai_cli && install_gallery_base_model; then
        ok "Installed gallery model through local-ai."
    else
        warn "Gallery install failed; falling back to direct GGUF download."
        ensure_custom_model_gguf || return 1
    fi
    deploy_custom_model
}

# ── Print env vars ───────────────────────────────────────────────────────────

print_env() {
    local model_list
    model_list=$(IFS=,; echo "${MODELS[*]}")
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN} Add these to your .env or shell profile:${NC}"
    echo ""
    echo "   export LOCALAI_BASE_URL=${LOCALAI_URL}"
    echo "   export LOCALAI_MODELS=${model_list}"
    echo "   export LOCALAI_DEFAULT_MODEL=${MODELS[0]}"
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
    sudo tee "$unit_file" > /dev/null <<UNIT
[Unit]
Description=LocalAI for Superset AI Insights
After=network.target

[Service]
Type=simple
User=$(whoami)
Environment=MODELS_PATH=${LOCALAI_MODELS_DIR}
Environment=BACKENDS_PATH=${LOCALAI_BACKENDS_DIR}
ExecStart=${localai_bin} run --address :${LOCALAI_PORT} --threads ${LOCALAI_THREADS} --backends-path ${LOCALAI_BACKENDS_DIR} --galleries '[]' --log-level info
Restart=on-failure
RestartSec=5
StandardOutput=append:${LOCALAI_LOG_DIR}/localai.log
StandardError=append:${LOCALAI_LOG_DIR}/localai.log

[Install]
WantedBy=multi-user.target
UNIT
    sudo systemctl daemon-reload
    sudo systemctl enable localai-superset
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
        <string>--galleries</string>
        <string>[]</string>
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
        deploy_custom_model
        do_start
        print_env
        ;;
    *)
        echo "Usage: $0 {install|start|stop|status|models|download-model|systemd|launchd}"
        exit 1
        ;;
esac
