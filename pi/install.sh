#!/usr/bin/env bash
# ManlyCam Pi Install Script
# Installs frpc and mediamtx as systemd services on Raspberry Pi OS Lite 64-bit.
# Optionally installs the manlycam-agent (remote terminal + shutdown over the frp tunnel).
#
# Usage:
#   sudo ./install.sh --endpoint <server-hostname> --frp-token <token> [options]
#
# Required (full install):
#   --endpoint <host|host:port|url>   frps server address (port defaults to 7000)
#   --frp-token <token>               Authentication token (must match frps config)
#
# Optional:
#   --agent-token <token>             Install the manlycam-agent with this shared token
#                                     (must match FRP_AGENT_TOKEN on the server)
#   --agent-user <user>               User the agent runs as (default: root).
#                                     Non-root users get a sudoers drop allowing only
#                                     `systemctl poweroff` without a password.
#   --agent-remote-port <port>        frps remote port for the agent tunnel (default: 11938).
#                                     Must match FRP_AGENT_PORT on the server and must not
#                                     collide with other tunnels (e.g. pisugar).
#   --agent-only                      Install/update only the agent. Requires a prior
#                                     full install; does not touch frpc/mediamtx binaries
#                                     or mediamtx.yml. Still updates the agent proxy block
#                                     in frpc.toml (requires --endpoint/--frp-token unless
#                                     frpc.toml already exists).
#   --skip-agent                      Explicitly leave the agent uninstalled (full installs)
#   --frpc-version <version>          frpc version to install (default: 0.61.0)
#   --mediamtx-version <version>      mediamtx version to install (default: 1.17.0)
#   -h, --help                        Show this help message
#
# Notes:
#   - Must be run as root (or via sudo)
#   - Re-running this script is safe (idempotent): config is fully regenerated from
#     current flag values; running services are stopped before update and restarted after.
#     If --agent-token is omitted on a re-run, the existing token in
#     /etc/manlycam/agent.json is reused.
#   - Manual customizations to /etc/manlycam/frpc.toml or /etc/manlycam/mediamtx.yml
#     will be overwritten on re-run (except the marker-delimited agent block in
#     --agent-only mode, which is managed separately). Fork this script if you need
#     persistent custom config.

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────────

FRPC_VERSION="0.61.0"
MTX_VERSION="1.17.0"
ENDPOINT=""
FRP_TOKEN=""
AGENT_TOKEN=""
AGENT_USER="root"
AGENT_ONLY=false
SKIP_AGENT=false

CONFIG_DIR="/etc/manlycam"
FRPC_BIN="/usr/local/bin/frpc"
MTX_BIN="/usr/local/bin/mediamtx"
FRPC_SERVICE="/etc/systemd/system/frpc.service"
MTX_SERVICE="/etc/systemd/system/mediamtx.service"
AGENT_CONFIG="${CONFIG_DIR}/agent.json"
AGENT_SERVICE="/etc/systemd/system/manlycam-agent.service"
AGENT_DIR="/opt/manlycam/agent"
AGENT_LISTEN_PORT=8424
AGENT_REMOTE_PORT=11938
AGENT_BLOCK_BEGIN="# BEGIN manlycam-agent (managed by install.sh)"
AGENT_BLOCK_END="# END manlycam-agent"
NODE_MIN_MAJOR=20

# ── Helpers ──────────────────────────────────────────────────────────────────────

info()  { echo "[install] $*"; }
warn()  { echo "[install] WARNING: $*" >&2; }
error() { echo "[install] ERROR: $*" >&2; exit 1; }

usage() {
  sed -n '/^# Usage:/,/^[^#]/p' "$0" | grep '^#' | sed 's/^# \?//'
}

# ── Argument parsing ─────────────────────────────────────────────────────────────

while [ $# -gt 0 ]; do
  case "$1" in
    --endpoint)          ENDPOINT="$2";       shift 2 ;;
    --frp-token)         FRP_TOKEN="$2";      shift 2 ;;
    --agent-token)       AGENT_TOKEN="$2";    shift 2 ;;
    --agent-user)        AGENT_USER="$2";     shift 2 ;;
    --agent-remote-port) AGENT_REMOTE_PORT="$2"; shift 2 ;;
    --agent-only)        AGENT_ONLY=true;     shift ;;
    --skip-agent)        SKIP_AGENT=true;     shift ;;
    --frpc-version)      FRPC_VERSION="$2";   shift 2 ;;
    --mediamtx-version)  MTX_VERSION="$2";    shift 2 ;;
    -h|--help)           usage; exit 0 ;;
    *) error "Unknown argument: $1 (use --help for usage)" ;;
  esac
done

AGENT_ENABLED=false
if [ "$AGENT_ONLY" = true ]; then
  [ "$SKIP_AGENT" = true ] && error "--agent-only and --skip-agent are mutually exclusive"
  AGENT_ENABLED=true
elif [ "$SKIP_AGENT" = true ]; then
  AGENT_ENABLED=false
elif [ -n "$AGENT_TOKEN" ] || [ -f "$AGENT_CONFIG" ]; then
  # Agent stays enabled on re-runs once installed (token is reused from agent.json)
  AGENT_ENABLED=true
fi

if [ "$AGENT_ONLY" = true ]; then
  # frpc.toml carries the agent proxy; a prior full install must have created it,
  # or endpoint/token must be provided to bootstrap it.
  if [ -z "$ENDPOINT" ] || [ -z "$FRP_TOKEN" ]; then
    if [ ! -f "${CONFIG_DIR}/frpc.toml" ]; then
      error "--agent-only requires --endpoint and --frp-token when no prior full install exists"
    fi
    info "Using existing ${CONFIG_DIR}/frpc.toml (endpoint/token flags not provided)"
    REGENERATE_FRPC_TOML=false
  else
    REGENERATE_FRPC_TOML=true
  fi
else
  [ -z "$ENDPOINT" ]  && error "--endpoint is required"
  [ -z "$FRP_TOKEN" ] && error "--frp-token is required"
  REGENERATE_FRPC_TOML=true
fi

if [ "$AGENT_ENABLED" = true ] && [ -z "$AGENT_TOKEN" ] && [ -f "$AGENT_CONFIG" ]; then
  AGENT_TOKEN=$(node -e "console.log(JSON.parse(require('node:fs').readFileSync('$AGENT_CONFIG','utf-8')).token)" 2>/dev/null) \
    || AGENT_TOKEN=""
  [ -z "$AGENT_TOKEN" ] && error "Could not read existing agent token from ${AGENT_CONFIG}; pass --agent-token"
  info "Reusing existing agent token from ${AGENT_CONFIG}"
fi
if [ "$AGENT_ENABLED" = true ] && [ -z "$AGENT_TOKEN" ]; then
  error "--agent-token is required to install the agent"
fi

# ── Endpoint parsing: strip scheme and path, separate host:port ──────────────────

if [ -n "$ENDPOINT" ]; then
  ENDPOINT="${ENDPOINT#http://}"
  ENDPOINT="${ENDPOINT#https://}"
  ENDPOINT="${ENDPOINT%%/*}"

  FRP_SERVER_ADDR="${ENDPOINT%%:*}"
  FRP_SERVER_PORT="${ENDPOINT##*:}"
  [ "$FRP_SERVER_PORT" = "$ENDPOINT" ] && FRP_SERVER_PORT="7000"
fi

# ── Preflight checks ─────────────────────────────────────────────────────────────

if [ "$(id -u)" -ne 0 ]; then
  error "This script must be run as root (use: sudo $0 $*)"
fi

# Agent source must sit next to this script (pi/agent/ in the repo)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ "$AGENT_ENABLED" = true ] && [ ! -f "${SCRIPT_DIR}/agent/src/index.mjs" ]; then
  error "Agent source not found at ${SCRIPT_DIR}/agent/ — copy the whole pi/ directory to the Pi (or clone the repo), not just install.sh"
fi

# Architecture check: Ensure we are on a 64-bit OS
ARCH=$(uname -m)
if [ "$ARCH" != "aarch64" ] && [ "$ARCH" != "arm64" ]; then
  error "This script requires a 64-bit OS (aarch64/arm64). Detected: $ARCH. Please flash a 64-bit version of Raspberry Pi OS."
fi

for cmd in curl tar; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    error "'$cmd' is required but not installed. Run: sudo apt-get install -y $cmd"
  fi
done

if [ "$AGENT_ONLY" = true ]; then
  info "Installing ManlyCam agent (agent-only mode)"
else
  info "Installing ManlyCam Pi services"
  info "  Architecture:     ${ARCH}"
  info "  frps endpoint:    ${FRP_SERVER_ADDR}:${FRP_SERVER_PORT}"
  info "  frpc version:     ${FRPC_VERSION}"
  info "  mediamtx version: ${MTX_VERSION}"
fi
if [ "$AGENT_ENABLED" = true ]; then
  info "  agent:            enabled (user: ${AGENT_USER}, tunnel port: ${AGENT_REMOTE_PORT})"
fi

# ── Idempotency: stop running services before update ─────────────────────────────

FULL_SERVICES="frpc mediamtx"
[ "$AGENT_ENABLED" = true ] && FULL_SERVICES="$FULL_SERVICES manlycam-agent"
for svc in $FULL_SERVICES; do
  if systemctl list-unit-files --type=service 2>/dev/null | grep -q "^${svc}.service" && \
     systemctl is-active --quiet "$svc" 2>/dev/null; then
    info "Stopping existing ${svc} service..."
    systemctl stop "$svc"
  fi
done

# ── Agent: Node.js runtime ───────────────────────────────────────────────────────

node_major() {
  node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0
}

install_node() {
  if command -v node >/dev/null 2>&1 && [ "$(node_major)" -ge "$NODE_MIN_MAJOR" ]; then
    info "Node.js $(node --version) already installed"
    return
  fi
  info "Installing Node.js 22.x (NodeSource)..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    || error "Failed to fetch NodeSource setup script"
  apt-get install -y nodejs \
    || error "Failed to install Node.js"
  info "Node.js $(node --version) installed"
}

install_agent_user() {
  if [ "$AGENT_USER" = "root" ]; then
    return
  fi
  if ! id "$AGENT_USER" >/dev/null 2>&1; then
    info "Creating system user ${AGENT_USER}..."
    useradd -r -m -s /bin/bash "$AGENT_USER" \
      || error "Failed to create user ${AGENT_USER}"
  fi
  # Sudoers drop: allow ONLY `systemctl poweroff` without a password for this user.
  local sudoers="/etc/sudoers.d/manlycam-agent"
  info "Writing ${sudoers} (scoped to: systemctl poweroff)..."
  cat > "$sudoers" <<SUDOERS
# Managed by ManlyCam install.sh — grants ${AGENT_USER} passwordless poweroff only
${AGENT_USER} ALL=(root) NOPASSWD: /usr/bin/systemctl poweroff
SUDOERS
  chown root:root "$sudoers"
  chmod 440 "$sudoers"
  if command -v visudo >/dev/null 2>&1; then
    visudo -cf "$sudoers" >/dev/null || error "sudoers validation failed for ${sudoers}"
  fi
}

install_agent() {
  install_node

  if [ "$AGENT_USER" != "root" ]; then
    info "Installing build tools for node-pty (native module)..."
    apt-get update -qq
    apt-get install -y build-essential python3
  fi

  install_agent_user

  info "Installing agent to ${AGENT_DIR}..."
  mkdir -p "$(dirname "$AGENT_DIR")"
  rm -rf "$AGENT_DIR"
  cp -r "${SCRIPT_DIR}/agent" "$AGENT_DIR"

  info "Installing agent dependencies (node-pty compiles natively — this can take a few minutes)..."
  (cd "$AGENT_DIR" && npm install --omit=dev --no-audit --no-fund) \
    || error "Failed to install agent dependencies"

  info "Writing ${AGENT_CONFIG}..."
  touch "$AGENT_CONFIG"
  chown root:root "$AGENT_CONFIG"
  chmod 600 "$AGENT_CONFIG"
  cat > "$AGENT_CONFIG" <<AGENT_JSON
{
  "token": "${AGENT_TOKEN}",
  "user": "${AGENT_USER}"
}
AGENT_JSON
  # The service reads this file at startup — non-root agent users need ownership
  if [ "$AGENT_USER" != "root" ]; then
    chown "$AGENT_USER" "$AGENT_CONFIG"
  fi

  info "Writing ${AGENT_SERVICE}..."
  local user_line=""
  [ "$AGENT_USER" != "root" ] && user_line="User=${AGENT_USER}"
  cat > "$AGENT_SERVICE" <<AGENT_SERVICE_UNIT
[Unit]
Description=ManlyCam agent (remote terminal + shutdown)
After=network.target

[Service]
ExecStart=/usr/bin/node ${AGENT_DIR}/src/index.mjs
Environment=AGENT_CONFIG=${AGENT_CONFIG}
${user_line}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
AGENT_SERVICE_UNIT

  # Drop the empty User= line left for root
  if [ "$AGENT_USER" = "root" ]; then
    sed -i '/^User=$/d' "$AGENT_SERVICE"
  fi

  systemctl daemon-reload
  # enable --now is a no-op on an already-active service — RESTART so re-installs
  # actually load the newly copied agent code
  systemctl enable manlycam-agent >/dev/null
  systemctl restart manlycam-agent
  sleep 1
  if ! systemctl is-active --quiet manlycam-agent; then
    warn "manlycam-agent is not active. Check logs: journalctl -u manlycam-agent -n 50"
  fi
}

# Adds or refreshes the marker-delimited agent proxy block in frpc.toml
update_frpc_agent_block() {
  local frpc_toml="${CONFIG_DIR}/frpc.toml"
  info "Updating agent proxy block in ${frpc_toml}..."
  touch "$frpc_toml"
  # Remove any previous managed block, then append the fresh one
  sed -i "/^${AGENT_BLOCK_BEGIN}$/,/^${AGENT_BLOCK_END}$/d" "$frpc_toml"
  cat >> "$frpc_toml" <<FRPC_AGENT_BLOCK

${AGENT_BLOCK_BEGIN}
[[proxies]]
name       = "agent"
type       = "tcp"
localIP    = "127.0.0.1"
localPort  = ${AGENT_LISTEN_PORT}
remotePort = ${AGENT_REMOTE_PORT}
${AGENT_BLOCK_END}
FRPC_AGENT_BLOCK
  chmod 640 "$frpc_toml"
}

# ── Full install path (skipped in --agent-only mode) ─────────────────────────────

if [ "$AGENT_ONLY" = false ]; then

  # ── Install libcamera dependency ───────────────────────────────────────────────

  info "Installing libcamera-apps (required for mediamtx rpiCamera source)..."
  apt-get update -qq
  apt-get install -y libcamera-apps

  # ── Binary download functions ──────────────────────────────────────────────────

  download_frpc() {
    local version="$1"
    local archive="frp_${version}_linux_arm64.tar.gz"
    local url="https://github.com/fatedier/frp/releases/download/v${version}/${archive}"
    local tmpdir
    tmpdir="$(mktemp -d)"

    info "Downloading frpc v${version}..."
    curl -fsSL --retry 3 -o "${tmpdir}/${archive}" "$url" \
      || error "Failed to download frpc from: $url"

    tar -xzf "${tmpdir}/${archive}" -C "$tmpdir"
    install -m 755 "${tmpdir}/frp_${version}_linux_arm64/frpc" "$FRPC_BIN"
    rm -rf "$tmpdir"
    info "frpc installed to ${FRPC_BIN}"
  }

  download_mediamtx() {
    local version="$1"
    local archive="mediamtx_v${version}_linux_arm64.tar.gz"
    local url="https://github.com/bluenviron/mediamtx/releases/download/v${version}/${archive}"
    local tmpdir
    tmpdir="$(mktemp -d)"

    info "Downloading mediamtx v${version}..."
    curl -fsSL --retry 3 -o "${tmpdir}/${archive}" "$url" \
      || error "Failed to download mediamtx from: $url"

    tar -xzf "${tmpdir}/${archive}" -C "$tmpdir"
    install -m 755 "${tmpdir}/mediamtx" "$MTX_BIN"
    rm -rf "$tmpdir"
    info "mediamtx installed to ${MTX_BIN}"
  }

  # ── Download binaries ──────────────────────────────────────────────────────────

  download_frpc "$FRPC_VERSION"
  download_mediamtx "$MTX_VERSION"

  # ── Config directory ────────────────────────────────────────────────────────────

  mkdir -p "$CONFIG_DIR"

  # ── Write frpc.toml ─────────────────────────────────────────────────────────────

  info "Writing ${CONFIG_DIR}/frpc.toml..."
  # Create file with restricted permissions BEFORE writing sensitive token
  touch "${CONFIG_DIR}/frpc.toml"
  chown root:root "${CONFIG_DIR}/frpc.toml"
  chmod 600 "${CONFIG_DIR}/frpc.toml"

  cat > "${CONFIG_DIR}/frpc.toml" <<FRPC_TOML
# /etc/manlycam/frpc.toml — managed by ManlyCam install.sh
# WARNING: Re-running install.sh regenerates this file from script arguments.
# Manual edits will be overwritten. Fork the script if you need persistent custom config.

serverAddr = "${FRP_SERVER_ADDR}"
serverPort = ${FRP_SERVER_PORT}

[auth]
method = "token"
token = "${FRP_TOKEN}"

[[proxies]]
name       = "stream"
type       = "tcp"
localPort  = 8554
remotePort = 11935

[[proxies]]
name       = "api"
type       = "tcp"
localPort  = 9997
remotePort = 11936
FRPC_TOML

  # Finalize permissions to allow group-read if needed, though 600 is safest for token
  chmod 640 "${CONFIG_DIR}/frpc.toml"

  # ── Write mediamtx.yml ──────────────────────────────────────────────────────────

  info "Writing ${CONFIG_DIR}/mediamtx.yml..."
  cat > "${CONFIG_DIR}/mediamtx.yml" <<'MTX_YML'
# /etc/manlycam/mediamtx.yml — managed by ManlyCam install.sh
# WARNING: Re-running install.sh regenerates this file from script arguments.
# Manual edits will be overwritten. Fork the script if you need persistent custom config.
#
# Role: capture from Arducam (rpiCamera source) → RTSP at :8554/cam
# frpc tunnels RTSP (→ remotePort 11935) and API (→ remotePort 11936) to the server.
#
# Note: Pi Zero W 2 performance — if stream quality is poor, add resolution/fps limits:
#   rpiCameraWidth: 1280
#   rpiCameraHeight: 720
#   rpiCameraFPS: 25

rtspAddress:    ":8554"
rtmpAddress:    ":0"
hlsAddress:     ":0"
srtAddress:     ":0"
webrtcAddress:  ":0"

api: yes
apiAddress: "127.0.0.1:9997"

paths:
  cam:
    source: rpiCamera
    # Restore stability: limit bitrate and increase keyframe frequency
    rpiCameraBitrate: 4000000
    rpiCameraIDRPeriod: 30
    # Preserve original frame timestamps for accurate clip/UI synchronization
    useAbsoluteTimestamp: true
MTX_YML

  chown root:root "${CONFIG_DIR}/mediamtx.yml"
  chmod 640 "${CONFIG_DIR}/mediamtx.yml"

  # ── Write systemd service units ─────────────────────────────────────────────────

  info "Writing systemd service units..."

  cat > "$MTX_SERVICE" <<'MTX_SERVICE_UNIT'
[Unit]
Description=mediamtx RTSP server (ManlyCam)
After=network.target

[Service]
ExecStart=/usr/local/bin/mediamtx /etc/manlycam/mediamtx.yml
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
MTX_SERVICE_UNIT

  cat > "$FRPC_SERVICE" <<'FRPC_SERVICE_UNIT'
[Unit]
Description=frpc tunnel client (ManlyCam)
After=network.target mediamtx.service

[Service]
ExecStart=/usr/local/bin/frpc -c /etc/manlycam/frpc.toml
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
FRPC_SERVICE_UNIT

  # ── Enable and start services ───────────────────────────────────────────────────

  info "Reloading systemd and enabling services..."
  systemctl daemon-reload
  systemctl enable --now mediamtx frpc

  # Verify startup
  sleep 2 # Give them a moment to settle
  for svc in mediamtx frpc; do
    if ! systemctl is-active --quiet "$svc"; then
      warn "Service $svc is not active. Check logs: journalctl -u $svc -n 50"
    fi
  done

fi # end full install path

# ── Agent install ─────────────────────────────────────────────────────────────────

if [ "$AGENT_ENABLED" = true ]; then
  mkdir -p "$CONFIG_DIR"
  install_agent
  update_frpc_agent_block
  # frpc must reload its config to expose the new tunnel
  if systemctl list-unit-files --type=service 2>/dev/null | grep -q "^frpc.service"; then
    info "Restarting frpc to apply the agent proxy..."
    systemctl restart frpc
  fi
elif [ "$SKIP_AGENT" = true ]; then
  info "Skipping agent install (--skip-agent)"
fi

info ""
info "✓ ManlyCam Pi installation complete!"
info ""
if [ "$AGENT_ONLY" = false ]; then
  info "  mediamtx config is at: ${CONFIG_DIR}/mediamtx.yml"
  info "  Be sure to set any defaults you want (resolution, FPS, etc.) before streaming."
  info "  After editing, restart the service: systemctl restart mediamtx"
  info ""
fi
if [ "$AGENT_ENABLED" = true ]; then
  info "  Agent installed (runs as: ${AGENT_USER}):"
  info "    config:    ${AGENT_CONFIG}"
  info "    service:   systemctl status manlycam-agent"
  info "    logs:      journalctl -u manlycam-agent -f"
  if [ "$AGENT_USER" != "root" ]; then
    info "    sudoers:   ${AGENT_USER} may run 'sudo systemctl poweroff' only"
  fi
  info ""
fi
info "  Service status:"
info "    systemctl status mediamtx"
info "    systemctl status frpc"
info ""
info "  View logs:"
info "    journalctl -u mediamtx -f"
info "    journalctl -u frpc -f"
info ""
info "  To uninstall: sudo ./uninstall.sh"
