#!/usr/bin/env bash
# ManlyCam Pi Uninstall Script
# Stops and removes frpc and mediamtx services, config, and binaries.
#
# Usage:
#   sudo ./uninstall.sh
#
# This script is safe to run even if services are not installed.

set -euo pipefail

info()  { echo "[uninstall] $*"; }
error() { echo "[uninstall] ERROR: $*" >&2; exit 1; }

if [ "$(id -u)" -ne 0 ]; then
  error "This script must be run as root (use: sudo $0)"
fi

info "Uninstalling ManlyCam Pi services..."

# ── Stop and disable services ─────────────────────────────────────────────────────

for svc in frpc mediamtx; do
  if systemctl list-unit-files "${svc}.service" >/dev/null 2>&1 \
     && systemctl list-unit-files "${svc}.service" | grep -q "${svc}.service"; then
    info "Stopping and disabling ${svc}..."
    systemctl disable --now "$svc" 2>/dev/null || true
  else
    info "${svc}.service not found — skipping"
  fi
done

# ── Remove systemd unit files ─────────────────────────────────────────────────────

for unit in /etc/systemd/system/frpc.service /etc/systemd/system/mediamtx.service; do
  if [ -f "$unit" ]; then
    rm -f "$unit"
    info "Removed ${unit}"
  fi
done

systemctl daemon-reload

# ── Remove config directory ───────────────────────────────────────────────────────

if [ -d /etc/manlycam ]; then
  REMOVE_CONFIG="n"
  if [ -t 0 ]; then
    echo -n "[uninstall] Remove configuration directory /etc/manlycam? (y/N): "
    read -r REMOVE_CONFIG
  else
    info "Non-interactive shell detected — keeping /etc/manlycam (use --purge to force removal)"
  fi

  if [[ "$REMOVE_CONFIG" =~ ^[Yy]$ ]]; then
    rm -rf /etc/manlycam
    info "Removed /etc/manlycam"
  else
    info "Kept /etc/manlycam"
  fi
fi

# ── Remove binaries ───────────────────────────────────────────────────────────────

for bin in /usr/local/bin/frpc /usr/local/bin/mediamtx; do
  if [ -f "$bin" ]; then
    rm -f "$bin"
    info "Removed ${bin}"
  fi
done

info ""
info "✓ ManlyCam Pi uninstall complete. Pi is in a clean state."
info ""
info "  Verify:"
info "    systemctl status frpc     # expect: could not find frpc.service"
info "    systemctl status mediamtx # expect: could not find mediamtx.service"
info "    ls /etc/manlycam          # expect: No such file or directory"
info "    ls /usr/local/bin/frpc    # expect: No such file or directory"
