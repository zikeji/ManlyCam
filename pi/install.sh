#!/usr/bin/env bash
# ManlyCam Pi Install Script
# Installs frpc and mediamtx as systemd services on Raspberry Pi OS Lite 64-bit.
#
# Usage:
#   sudo ./install.sh --endpoint <server-hostname> --frp-token <token> [options]
#
# Required:
#   --endpoint <host|host:port|url>   frps server address (port defaults to 7000)
#   --frp-token <token>               Authentication token (must match frps config)
#
# Optional:
#   --frpc-version <version>          frpc version to install (default: 0.61.0)
#   --mediamtx-version <version>      mediamtx version to install (default: 1.9.2)
#   -h, --help                        Show this help message
#
# Notes:
#   - Must be run as root (or via sudo)
#   - Re-running this script is safe (idempotent): config is fully regenerated from
#     current flag values; running services are stopped before update and restarted after.
#   - Manual customizations to /etc/manlycam/frpc.toml or /etc/manlycam/mediamtx.yml
#     will be overwritten on re-run. Fork this script if you need persistent custom config.

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────────

FRPC_VERSION="0.61.0"
MTX_VERSION="1.9.2"
ENDPOINT=""
FRP_TOKEN=""

CONFIG_DIR="/etc/manlycam"
FRPC_BIN="/usr/local/bin/frpc"
MTX_BIN="/usr/local/bin/mediamtx"
FRPC_SERVICE="/etc/systemd/system/frpc.service"
MTX_SERVICE="/etc/systemd/system/mediamtx.service"

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
    --frpc-version)      FRPC_VERSION="$2";   shift 2 ;;
    --mediamtx-version)  MTX_VERSION="$2";    shift 2 ;;
    -h|--help)           usage; exit 0 ;;
    *) error "Unknown argument: $1 (use --help for usage)" ;;
  esac
done

[ -z "$ENDPOINT" ]  && error "--endpoint is required"
[ -z "$FRP_TOKEN" ] && error "--frp-token is required"

# ── Endpoint parsing: strip scheme and path, separate host:port ──────────────────

ENDPOINT="${ENDPOINT#http://}"
ENDPOINT="${ENDPOINT#https://}"
ENDPOINT="${ENDPOINT%%/*}"

FRP_SERVER_ADDR="${ENDPOINT%%:*}"
FRP_SERVER_PORT="${ENDPOINT##*:}"
[ "$FRP_SERVER_PORT" = "$ENDPOINT" ] && FRP_SERVER_PORT="7000"

# ── Preflight checks ─────────────────────────────────────────────────────────────

if [ "$(id -u)" -ne 0 ]; then
  error "This script must be run as root (use: sudo $0 $*)"
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

info "Installing ManlyCam Pi services"
info "  Architecture:     ${ARCH}"
info "  frps endpoint:    ${FRP_SERVER_ADDR}:${FRP_SERVER_PORT}"
info "  frpc version:     ${FRPC_VERSION}"
info "  mediamtx version: ${MTX_VERSION}"

# ── Idempotency: stop running services before update ─────────────────────────────

for svc in frpc mediamtx; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    info "Stopping existing ${svc} service..."
    systemctl stop "$svc"
  fi
done

# ── Install libcamera dependency ──────────────────────────────────────────────────

info "Installing libcamera-apps (required for mediamtx rpiCamera source)..."
apt-get update -qq
apt-get install -y libcamera-apps

# ── Binary download functions ─────────────────────────────────────────────────────

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
  local archive="mediamtx_v${version}_linux_arm64v8.tar.gz"
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

# ── Download binaries ─────────────────────────────────────────────────────────────

download_frpc "$FRPC_VERSION"
download_mediamtx "$MTX_VERSION"

# ── Config directory ──────────────────────────────────────────────────────────────

mkdir -p "$CONFIG_DIR"

# ── Write frpc.toml ───────────────────────────────────────────────────────────────

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

# ── Write mediamtx.yml ────────────────────────────────────────────────────────────

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
MTX_YML

chown root:root "${CONFIG_DIR}/mediamtx.yml"
chmod 640 "${CONFIG_DIR}/mediamtx.yml"

# ── Write systemd service units ───────────────────────────────────────────────────

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

# ── Enable and start services ─────────────────────────────────────────────────────

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

info ""
info "✓ ManlyCam Pi installation complete!"
info ""
info "  mediamtx config is at: ${CONFIG_DIR}/mediamtx.yml"
info "  Be sure to set any defaults you want (resolution, FPS, etc.) before streaming."
info "  After editing, restart the service: systemctl restart mediamtx"
info ""
info "  Service status:"
info "    systemctl status mediamtx"
info "    systemctl status frpc"
info ""
info "  View logs:"
info "    journalctl -u mediamtx -f"
info "    journalctl -u frpc -f"
info ""
info "  To uninstall: sudo ./uninstall.sh"
