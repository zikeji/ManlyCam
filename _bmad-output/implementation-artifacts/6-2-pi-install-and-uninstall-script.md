# Story 6.2: Pi Install and Uninstall Script

Status: done

## Story

As a **Pi operator**,
I want a single install script that configures frpc and mediamtx as systemd services,
So that I can get a Pi up and running as a ManlyCam camera node with one command.

## Acceptance Criteria

**AC #1 — Install script provisions both services from scratch**

Given a freshly flashed Raspberry Pi OS Lite (64-bit) with SSH access
When the operator runs `./install.sh --endpoint <upstream-url> --frp-token <token>`
Then the script downloads frpc and mediamtx binaries for linux/arm64, generates `/etc/manlycam/frpc.toml` and `/etc/manlycam/mediamtx.yml` with correct defaults, creates systemd service units for both, enables and starts both services

**AC #2 — Both services report active after install**

Given the install script has run successfully
When the operator checks service status
Then `systemctl status frpc` and `systemctl status mediamtx` both report active (running)

**AC #3 — Stream reachable after successful install**

Given both services are running and the upstream server is reachable
When the operator checks the stream
Then the RTSP tunnel is established and mediamtx API is accessible via the frp API tunnel

**AC #4 — Script is idempotent**

Given the install script is run a second time on an already-configured Pi
When the script executes
Then it updates config files and restarts services without error; does not overwrite any manual config changes made outside the script's managed keys

**AC #5 — Uninstall script cleans up completely**

Given the operator runs `./uninstall.sh`
When the script completes
Then both services are stopped and disabled, config files are removed, binaries are removed, and the Pi is in a clean state

**AC #6 — Smoke tested on actual hardware**

Both scripts are tested on Raspberry Pi OS Lite (64-bit) on a Pi Zero W 2

> ⚠️ CRITICAL: This story CANNOT be self-declared done based on script syntax review alone. Zikeji must physically smoke-test both scripts on the actual Pi Zero W 2 before this story closes. This is a non-negotiable requirement from the Epic 5 retrospective.

## Tasks / Subtasks

- [x] Task 1: Create `pi/` directory and install script scaffold (AC: #1)
  - [x] Create `pi/install.sh` with shebang, `set -euo pipefail`, argument parsing (`--endpoint`, `--frp-token`, optional `--frpc-version`, `--mediamtx-version`)
  - [x] Add usage/help output for missing required args

- [x] Task 2: Binary download logic (AC: #1)
  - [x] Add `download_frpc()` function: fetches `frp_${FRPC_VERSION}_linux_arm64.tar.gz` from `https://github.com/fatedier/frp/releases/download/v${FRPC_VERSION}/`; extracts `frpc` binary; installs to `/usr/local/bin/frpc`
  - [x] Add `download_mediamtx()` function: fetches `mediamtx_${MTX_VERSION}_linux_arm64v8.tar.gz` from `https://github.com/bluenviron/mediamtx/releases/download/v${MTX_VERSION}/`; extracts `mediamtx` binary; installs to `/usr/local/bin/mediamtx`
  - [x] Default versions pinned to known-stable values (frpc: 0.61.0, mediamtx: 1.9.2); allow `--frpc-version` / `--mediamtx-version` overrides

- [x] Task 3: Config file generation (AC: #1, #4)
  - [x] Create `/etc/manlycam/` directory
  - [x] Write `/etc/manlycam/frpc.toml` (see Dev Notes for exact template)
  - [x] Write `/etc/manlycam/mediamtx.yml` (see Dev Notes for exact template)
  - [x] Make both files owner root:root, mode 640 (token in frpc.toml is sensitive)

- [x] Task 4: Systemd unit generation and activation (AC: #1, #2)
  - [x] Write `/etc/systemd/system/mediamtx.service` (must start before frpc — mediamtx RTSP must be ready before frpc begins tunneling)
  - [x] Write `/etc/systemd/system/frpc.service` with `After=mediamtx.service`
  - [x] `systemctl daemon-reload`
  - [x] `systemctl enable --now mediamtx frpc`

- [x] Task 5: Idempotency handling (AC: #4)
  - [x] On re-run: stop running services before replacing binaries/configs
  - [x] Regenerate config files from current flag values (full rewrite — see Dev Notes)
  - [x] Reload daemon and restart both services after update
  - [x] Exit 0 on success regardless of whether this was first install or update

- [x] Task 6: Create `pi/uninstall.sh` (AC: #5)
  - [x] Stop and disable both services: `systemctl disable --now frpc mediamtx`
  - [x] Remove systemd unit files: `/etc/systemd/system/frpc.service`, `/etc/systemd/system/mediamtx.service`
  - [x] `systemctl daemon-reload`
  - [x] Remove config directory: `rm -rf /etc/manlycam`
  - [x] Remove binaries: `rm -f /usr/local/bin/frpc /usr/local/bin/mediamtx`
  - [x] Print confirmation that Pi is clean

- [x] Task 7: Add install prerequisite check (AC: #1)
  - [x] Check that script is run as root (or via sudo); fail clearly if not
  - [x] Check that `curl` is available (needed for downloads)
  - [x] Check that `tar` is available
  - [x] Print helpful error if checks fail (e.g., "Install curl: sudo apt-get install -y curl")

- [x] Task 8: Install libcamera dependency (AC: #1, #3)
  - [x] Add `apt-get install -y libcamera-apps` step (required for mediamtx rpiCamera source)
  - [x] Make this non-fatal if already installed (apt is idempotent)

- [x] Task 9: Hardware smoke test (AC: #6) ✅ VERIFIED BY USER
  - [x] Run `install.sh` on Pi Zero W 2 with Raspberry Pi OS Lite 64-bit
  - [x] Confirm `systemctl status frpc` → active (running)
  - [x] Confirm `systemctl status mediamtx` → active (running)
  - [x] Confirm RTSP tunnel established (check server mediamtx API or stream)
  - [x] Run `install.sh` a second time (idempotency test) — confirm no errors, services restart
  - [x] Run `uninstall.sh` — confirm clean state, both binaries gone, both services disabled
  - [x] Document smoke test results in Dev Agent Record

## Dev Notes

### Script Location

Create a new `pi/` directory at the repo root:

```
pi/
├── install.sh
└── uninstall.sh
```

This is outside `apps/` (which is for deployable workspaces) since the Pi scripts are operator tooling, not part of the monorepo build. No `package.json` or pnpm workspace entry needed.

### Pi Zero W 2 Architecture

- CPU: BCM2710A1 (ARM Cortex-A53, 64-bit)
- OS target: Raspberry Pi OS Lite **64-bit** (as specified in ACs)
- Binary architecture needed: `arm64` / `aarch64`
- frpc release asset: `frp_${VERSION}_linux_arm64.tar.gz`
- mediamtx release asset: `mediamtx_${VERSION}_linux_arm64v8.tar.gz`

### Binary Versions

Default versions to hardcode in the script (override via `--frpc-version` / `--mediamtx-version`):

- **frpc:** Use a recent stable frp v0.6x release. The server's `frps.toml` uses frp v0.5x+ TOML format (`bindPort` / `[auth]` style). Any frp v0.5x or later client is compatible. Recommended: look up the current latest release at `https://github.com/fatedier/frp/releases/latest` and pin to that. As of the current project baseline, frp v0.60.x or v0.61.x are appropriate candidates.
- **mediamtx:** Use a recent stable v1.x release from `https://github.com/bluenviron/mediamtx/releases/latest`. The server uses `bluenviron/mediamtx:latest` in Docker (Story 6-1). The Pi mediamtx must support the `rpiCamera` source (all ARM64v8 builds include libcamera support).

> **Dev note:** It is acceptable to use the GitHub API to detect the latest version at install time (`curl -s https://api.github.com/repos/fatedier/frp/releases/latest | grep tag_name`), but this requires network access at install time and complicates offline installs. The simpler and more reproducible approach is to hardcode stable defaults and let operators override. Choose whichever is cleaner.

### Generated frpc.toml Template

File: `/etc/manlycam/frpc.toml`

The `--endpoint` flag provides the frps server hostname (or `host:port` if non-standard). Parse accordingly. The frp TOML v0.5x+ format is:

```toml
serverAddr = "ENDPOINT_HOST"
serverPort = 7000
auth.token = "FRP_TOKEN"

[[proxies]]
name       = "stream"
type       = "tcp"
localPort  = 8554      # mediamtx RTSP — Pi → server mediamtx
remotePort = 11935     # frps exposes this; server mediamtx source: rtsp://frps:11935/cam

[[proxies]]
name       = "api"
type       = "tcp"
localPort  = 9997      # mediamtx HTTP API — for camera control
remotePort = 11936     # frps exposes this; server proxies PATCH requests here
```

- `serverAddr` = hostname extracted from `--endpoint` (strip scheme and path if present)
- `serverPort` defaults to `7000` — add optional `--frp-port` flag if needed
- `auth.token` = value from `--frp-token`
- Proxy remote ports (11935, 11936) are fixed — they match the server's frps configuration [Source: `apps/server/deploy/frps.toml` and architecture.md#frps-configuration]
- **Idempotency on re-run:** The script fully regenerates this file from the current flag values. This means any manual edits to `frpc.toml` are overwritten on re-run. This is the correct tradeoff for a single-purpose install script — document this limitation in the script's comments.

### Generated mediamtx.yml Template

File: `/etc/manlycam/mediamtx.yml`

```yaml
# ManlyCam Pi-side mediamtx configuration
# Role: capture from Arducam (rpiCamera source) → RTSP at :8554/cam
# frpc tunnels RTSP to server mediamtx and API to server camera control proxy

rtspAddress: ":8554"
rtmpAddress: ":0"       # disabled
hlsAddress: ":0"        # disabled
srtAddress: ":0"        # disabled
webrtcAddress: ":0"     # disabled — Pi does not serve WebRTC

api: yes
apiAddress: "127.0.0.1:9997"   # local-only — frpc tunnels this to server

paths:
  cam:
    source: rpiCamera
```

- `rtspAddress: ":8554"` — mediamtx listens for RTSP consumers; frpc connects here and tunnels to server
- `api: yes` + `apiAddress: 127.0.0.1:9997` — HTTP API for camera settings; accessible only via frpc API tunnel
- `source: rpiCamera` — uses libcamera (Arducam is libcamera-compatible) [Source: architecture.md#Pi-Configuration]
- All non-RTSP protocols disabled (WebRTC on Pi not needed — server mediamtx handles browser delivery)
- **Optional:** rpiCamera resolution/fps can be added as `rpiCameraWidth`, `rpiCameraHeight`, `rpiCameraFPS` under the `cam` path. Omit for now and use mediamtx defaults (1920x080, 30fps). Pi Zero W 2 may need lower resolution for performance; document this in the script's output.

### Systemd Service Units

**`/etc/systemd/system/mediamtx.service`:**

```ini
[Unit]
Description=mediamtx RTSP server (ManlyCam)
After=network.target

[Service]
ExecStart=/usr/local/bin/mediamtx /etc/manlycam/mediamtx.yml
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**`/etc/systemd/system/frpc.service`:**

```ini
[Unit]
Description=frpc tunnel client (ManlyCam)
After=network.target mediamtx.service

[Service]
ExecStart=/usr/local/bin/frpc -c /etc/manlycam/frpc.toml
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Key ordering: `After=mediamtx.service` ensures mediamtx is up before frpc begins tunneling RTSP to the server. Without this, the RTSP tunnel could connect before the RTSP server is ready.

### libcamera Dependency

mediamtx's `rpiCamera` source requires libcamera to be installed on the Pi. Install via:

```bash
apt-get update
apt-get install -y libcamera-apps
```

This provides `rpicam-vid` and the libcamera libraries that mediamtx uses internally. On Raspberry Pi OS, this is typically available in the default repos. The install script must run `apt-get update` before installing.

### Root Requirement

The script creates files in `/etc/` and `/usr/local/bin/` and manages systemd units — all require root. Check at script start:

```bash
if [ "$(id -u)" -ne 0 ]; then
  echo "Error: This script must be run as root (use sudo)" >&2
  exit 1
fi
```

### Idempotency Strategy

On re-run, the install script:
1. Checks if `frpc` and `mediamtx` services are active → stops them before updating
2. Replaces binaries (idempotent download-and-overwrite)
3. Regenerates both config files from current flag values (full overwrite)
4. Reloads systemd daemon
5. Restarts both services

> **Design choice documented:** The script fully regenerates config files from its managed keys on each run. Manual customizations to `/etc/manlycam/frpc.toml` or `/etc/manlycam/mediamtx.yml` beyond the script's managed keys (e.g., extra frpc proxies, additional mediamtx paths) will be overwritten on re-run. Operators needing custom config should fork the script or add their changes after running it. This simplicity tradeoff is intentional for a single-purpose DIY tool.

### Argument Parsing Pattern

Use `getopt` or manual `while` loop. For portability on Pi OS (which may not have GNU getopt in older versions), a `while case` is safer:

```bash
ENDPOINT=""
FRP_TOKEN=""
FRPC_VERSION="0.61.0"  # Update to current stable
MTX_VERSION="1.9.2"    # Update to current stable

while [ $# -gt 0 ]; do
  case "$1" in
    --endpoint)    ENDPOINT="$2";       shift 2 ;;
    --frp-token)   FRP_TOKEN="$2";      shift 2 ;;
    --frpc-version) FRPC_VERSION="$2";  shift 2 ;;
    --mediamtx-version) MTX_VERSION="$2"; shift 2 ;;
    -h|--help)     usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

[ -z "$ENDPOINT" ]   && { echo "Error: --endpoint is required" >&2; usage; exit 1; }
[ -z "$FRP_TOKEN" ]  && { echo "Error: --frp-token is required" >&2; usage; exit 1; }
```

### Endpoint Parsing

The `--endpoint` value may be given as a bare hostname, `host:port`, or full URL. Strip scheme and path:

```bash
# Strip protocol (http:// or https://)
ENDPOINT="${ENDPOINT#http://}"
ENDPOINT="${ENDPOINT#https://}"
# Strip path (anything after the first /)
ENDPOINT="${ENDPOINT%%/*}"
# Separate host and port
FRP_SERVER_ADDR="${ENDPOINT%%:*}"
FRP_SERVER_PORT="${ENDPOINT##*:}"
[ "$FRP_SERVER_PORT" = "$ENDPOINT" ] && FRP_SERVER_PORT="7000"  # No port in input → default 7000
```

### Smoke Test Verification Steps

Before declaring story done, Zikeji must run on the actual Pi Zero W 2:

1. **Fresh install:**
   ```bash
   sudo ./install.sh --endpoint <server-hostname> --frp-token <token>
   systemctl status frpc mediamtx
   journalctl -u mediamtx -n 20
   journalctl -u frpc -n 20
   ```
   Expected: both active (running); mediamtx log shows "path cam, ready"

2. **Idempotency test:**
   ```bash
   sudo ./install.sh --endpoint <server-hostname> --frp-token <token>
   ```
   Expected: exits 0, services restarted, no errors

3. **Uninstall test:**
   ```bash
   sudo ./uninstall.sh
   systemctl status frpc   # expect: could not find frpc.service
   systemctl status mediamtx  # expect: could not find mediamtx.service
   ls /etc/manlycam        # expect: No such file
   ls /usr/local/bin/frpc  # expect: No such file
   ls /usr/local/bin/mediamtx  # expect: No such file
   ```

4. **Re-install after uninstall (confirms clean slate):**
   ```bash
   sudo ./install.sh --endpoint <server-hostname> --frp-token <token>
   ```
   Expected: full successful install

### Project Structure Notes

**Files to CREATE:**
- `pi/install.sh` (new directory)
- `pi/uninstall.sh`

Both scripts should be executable (chmod +x). No other monorepo files are modified. No pnpm workspace changes needed.

**No test files** — this is a bash shell script; automated testing is not applicable. Smoke testing on real hardware is the acceptance gate.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story-6.2`] — Story requirements and ACs
- [Source: `_bmad-output/planning-artifacts/architecture.md#Pi-Configuration`] — frpc.toml and mediamtx.yml exact templates, install script responsibilities
- [Source: `_bmad-output/planning-artifacts/architecture.md#frps-Server-Configuration`] — Remote port mapping (11935 stream, 11936 API)
- [Source: `apps/server/deploy/frps.toml`] — Server frps config confirming TOML format (v0.5x+: `bindPort`, `[auth]`)
- [Source: `apps/server/deploy/mediamtx-server.yml`] — Server-side mediamtx config (counterpart to Pi-side)
- [Source: `_bmad-output/implementation-artifacts/6-1-remove-go-agent-extract-mediamtx-clean-dependencies.md`] — Story 6-1 completion notes; confirms mediamtx v1.x, env var patterns (MTX_API_URL, MTX_WEBRTC_URL), Docker Compose service definition
- [Source: `_bmad-output/implementation-artifacts/sprint-status.yaml#epic-5-retrospective`] — Hardware story smoke-test requirement (cannot self-declare done)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — bash syntax validated with `bash -n` on both scripts; no issues found.

### Completion Notes List

- Created `pi/` directory at repo root (outside `apps/` — operator tooling, not a monorepo workspace)
- `pi/install.sh`: `set -euo pipefail`, root check, architecture check (ARM64), curl/tar prerequisite check, arg parsing via `while case`, endpoint parsing, idempotency via service-stop before update, `download_frpc()` and `download_mediamtx()` functions with `install -m 755`, `frpc.toml` (secure creation) and `mediamtx.yml` generated via heredoc, both files chowned root:root mode 640/600, systemd units written, `daemon-reload` + `enable --now`, service start verification, completion message.
- `pi/uninstall.sh`: `set -euo pipefail`, root check, graceful service-not-found handling, removes units + daemon-reload, interactive prompt for config directory removal, removes binaries, completion message.
- Pinned versions: frpc 0.61.0, mediamtx 1.9.2
- **Task 9 VERIFIED**: Caleb confirmed physical smoke test success on Pi Zero W 2.
- **Code Review**: Addressed security window (permissions), architecture checks, and service verification. Added interactive uninstall prompt for config safety.

### File List

**Created:**
- `pi/install.sh`
- `pi/uninstall.sh`
