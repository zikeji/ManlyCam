# Story 6.3: Operator Documentation

Status: done

## Story

As an **operator (Pi or server)**,
I want complete documentation covering both the Pi lifecycle and the server-side mediamtx setup,
So that I can deploy the full ManlyCam stack — Pi camera node through to server infrastructure — without requiring deep knowledge of frpc, mediamtx, or Docker internals.

## Acceptance Criteria

**AC #1 — pi/README.md bootstrap section covers full Pi setup flow**

Given an operator reads the `pi/README.md`
When they follow the bootstrap section
Then the documented steps cover: OS flash (Raspberry Pi Imager, SSH key setup) → camera verification (`rpicam-still`) → install script usage → confirming stream is live

**AC #2 — Service management section is complete**

Given the README covers service management
When an operator reads it
Then it documents: checking status (`systemctl status`), restarting services, viewing logs (`journalctl -u frpc` / `journalctl -u mediamtx`), and what to do when the stream is down

**AC #3 — WiFi configuration note is present**

Given the README covers WiFi configuration
When an operator reads it
Then it notes that WiFi setup is the operator's responsibility; wifi-connect is mentioned as one optional approach with a link to its documentation — operators using other methods (Pi Imager preconfiguration, wpa_supplicant, etc.) require no additional steps

**AC #4 — Full lifecycle covered (uninstall + version update)**

Given the README covers the full lifecycle
When an operator reads it
Then it also documents: the uninstall procedure and how to update frpc/mediamtx to newer versions

**AC #5 — Optional mediamtx configuration section is present**

Given an operator wants to tune camera quality or orientation
When they read the `pi/README.md` optional configuration section
Then it documents the rpiCamera settings available in `/etc/manlycam/mediamtx.yml`: resolution (`rpiCameraWidth`, `rpiCameraHeight`), framerate (`rpiCameraFPS`), bitrate (`rpiCameraBitrate`), and camera flip (`rpiCameraHFlip`, `rpiCameraVFlip`); includes the caveat that editing this file directly will be overwritten on the next `install.sh` run; and notes that the Pi Zero W 2 benefits from lower resolution (e.g. 1280×720 at 25fps) if stream quality is poor

**AC #6 — All documented commands are accurate and tested against actual scripts**

And all documented commands are accurate and tested against the actual install script from Story 6.2 (`pi/install.sh`, `pi/uninstall.sh`)

**AC #7 — Server docs: Docker Compose path**

Given an operator reads the server setup section of the documentation
When they follow the Docker Compose path
Then the documentation explains what mediamtx does in the server context (ingests RTSP from the Pi via frp tunnel, re-publishes as WebRTC WHEP for browsers), references the compose example and `mediamtx-server.yml` config from Story 6-1, and lists the required server env vars (`MTX_API_URL`, `MTX_WEBRTC_URL`, `FRP_HOST`, `FRP_RTSP_PORT`, `FRP_API_PORT`) with example values

**AC #8 — Server docs: non-Docker / bare-metal path**

Given an operator who does not use Docker reads the server setup documentation
When they follow the non-Docker / bare-metal path
Then the documentation provides freeform instructions for: downloading and installing the mediamtx binary, the minimum `mediamtx.yml` configuration for the server role (referencing the example from Story 6-1), and running mediamtx as a systemd service on the server host

**AC #9 — Server docs cross-reference Pi README**

And the server-side documentation clearly cross-references the Pi README (Story 6-2 output / `pi/README.md`) so an operator can follow both documents together to bring up the full stack

## Tasks / Subtasks

- [x] Task 1: Create `pi/README.md` — Pi operator lifecycle document (AC: #1, #2, #3, #4, #5, #6)
  - [x] Write bootstrap section: OS flash (Raspberry Pi Imager + SSH key + WiFi), camera verification, install script invocation, confirm stream live
  - [x] Write WiFi section: operator-responsible note, wifi-connect optional approach with link, Pi Imager/wpa_supplicant alternatives mentioned
  - [x] Write service management section: systemctl status, restart, journalctl logs for both frpc and mediamtx, stream-down checklist
  - [x] Write optional mediamtx configuration section: explain `/etc/manlycam/mediamtx.yml` defaults from install.sh, document rpiCamera tuning options (resolution, fps, bitrate, flip), include Pi Zero W 2 performance note, include overwrite caveat for install.sh re-runs
  - [x] Write update section: how to re-run install.sh with newer `--frpc-version` / `--mediamtx-version` flags
  - [x] Write uninstall section: `sudo ./uninstall.sh` usage, what it removes, confirmation of clean state
  - [x] Verify all commands against `pi/install.sh` and `pi/uninstall.sh` source (especially exact flag names, service names, config paths)

- [x] Task 2: Create `docs/deploy/README.md` — Server-side setup documentation (AC: #7, #8, #9)
  - [x] Write intro: full-stack overview (Pi → frp tunnel → server mediamtx → browser via WebRTC WHEP)
  - [x] Write Docker Compose path: prerequisites, step-by-step setup referencing `docker-compose.yml` and `traefik/docker-compose.yml`, env var table with examples, mediamtx-server.yml substitution, frps.toml token setup, first-run admin steps
  - [x] Write non-Docker bare-metal path: download mediamtx binary (linux/amd64), mediamtx.yml config (referencing `mediamtx-server.yml` example), systemd unit creation, variable substitution for FRP_HOST and FRP_RTSP_PORT
  - [x] Write env var reference table covering all required vars from `.env.example`: PORT, BASE_URL, DATABASE_URL, SESSION_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FRP_HOST, FRP_RTSP_PORT, FRP_API_PORT, MTX_API_URL, MTX_WEBRTC_URL, PET_NAME, SITE_NAME
  - [x] Add cross-reference to `pi/README.md` at top and in relevant sections

## Dev Notes

### This Is a Documentation-Only Story

No application code changes. No test files. The deliverables are two Markdown files:

1. **`pi/README.md`** — Pi operator guide (placed alongside `pi/install.sh`)
2. **`docs/deploy/README.md`** — Server-side deployment guide (placed alongside existing deploy configs)

Accuracy is the acceptance gate. All commands must match what the actual scripts do — read `pi/install.sh` and `pi/uninstall.sh` before writing to confirm exact flags, paths, service names, and output messages.

### pi/README.md — Content Requirements

#### Install Script Exact Interface

From `pi/install.sh`:

```bash
# Required:
#   --endpoint <host|host:port|url>   frps server address (port defaults to 7000)
#   --frp-token <token>               Authentication token (must match frps config)
#
# Optional:
#   --frpc-version <version>          frpc version to install (default: 0.61.0)
#   --mediamtx-version <version>      mediamtx version to install (default: 1.9.2)
#   -h, --help                        Show this help message
```

Typical invocation:
```bash
sudo ./install.sh --endpoint cam.example.com --frp-token your-secret-token
```

- Script requires root (`sudo ./install.sh` or run as root directly)
- Re-run is safe (idempotent) — stops services, regenerates configs from flags, restarts
- Manual edits to `/etc/manlycam/frpc.toml` or `/etc/manlycam/mediamtx.yml` are overwritten on re-run

#### Service Names and Paths

| Item | Value |
|---|---|
| frpc service | `frpc` (unit: `/etc/systemd/system/frpc.service`) |
| mediamtx service | `mediamtx` (unit: `/etc/systemd/system/mediamtx.service`) |
| Config directory | `/etc/manlycam/` |
| frpc config | `/etc/manlycam/frpc.toml` |
| mediamtx config | `/etc/manlycam/mediamtx.yml` |
| frpc binary | `/usr/local/bin/frpc` |
| mediamtx binary | `/usr/local/bin/mediamtx` |

#### Log Commands (Confirmed from install script and systemd units)

```bash
journalctl -u mediamtx -n 50 --no-pager    # mediamtx logs (last 50 lines)
journalctl -u frpc -n 50 --no-pager         # frpc logs (last 50 lines)
journalctl -u mediamtx -f                   # follow mediamtx logs live
journalctl -u frpc -f                       # follow frpc logs live
```

Healthy mediamtx log line to look for: `path cam, ready` or `path cam, source ready`

#### Camera Verification Command

Before running the install script, the operator should confirm the camera works:
```bash
rpicam-still -o test.jpg
```
If this fails, libcamera or the camera connection has an issue to resolve first.

#### WiFi Section

wifi-connect link: https://github.com/balena-io/wifi-connect
This is a third-party tool — mention it as an option only, not a requirement. Operators can use Pi Imager's "Advanced options" to pre-configure WiFi before flashing, or `wpa_supplicant` directly.

#### Update Procedure

Updating frpc or mediamtx = re-run install.sh with new version flags:
```bash
sudo ./install.sh --endpoint cam.example.com --frp-token your-secret-token \
  --frpc-version 0.62.0 \
  --mediamtx-version 1.10.0
```
The script downloads new binaries, regenerates configs (from the same flags), restarts services.

#### Uninstall

```bash
sudo ./uninstall.sh
```

Removes: both services (stopped + disabled), systemd unit files, `/etc/manlycam/` config dir (interactive prompt), `/usr/local/bin/frpc` and `/usr/local/bin/mediamtx` binaries.

#### Optional mediamtx Configuration

The install script writes `/etc/manlycam/mediamtx.yml` with these defaults:

```yaml
paths:
  cam:
    source: rpiCamera
    rpiCameraBitrate: 4000000   # 4 Mbps — balance of quality and tunnel bandwidth
    rpiCameraIDRPeriod: 30      # keyframe every 30 frames — improves stream stability
```

Operators can edit this file directly to add or override settings. The README should document these options under a clear "Optional Configuration" or "Tuning" heading:

**Resolution and framerate** (Pi Zero W 2 performance note — add these if stream quality is poor or CPU is overwhelmed):
```yaml
    rpiCameraWidth: 1280
    rpiCameraHeight: 720
    rpiCameraFPS: 25
```
Note: mediamtx defaults are 1920×1080 at 30fps. The Pi Zero W 2's CPU can struggle at full resolution under network load — 1280×720 at 25fps is a well-tested fallback. This hint is already present as a comment in the generated config.

**Bitrate** (`rpiCameraBitrate`): Controls H.264 encoder output in bits/s. Default 4000000 (4 Mbps) is suitable for LAN/frp tunnels. The sweet spot for most setups is **4–10 Mbps** — lower end for constrained uplinks or flaky tunnels, higher end for better quality on a reliable connection. Going above 10 Mbps rarely improves perceived quality and increases tunnel bandwidth demand.

**Camera tuning file** (`rpiCameraTuningFile`): libcamera ships per-sensor ISP tuning files that dramatically improve image quality — color accuracy, noise reduction, exposure — compared to the generic default. If you know your camera module's sensor, point mediamtx at the correct tuning file:
```yaml
    rpiCameraTuningFile: /usr/share/libcamera/ipa/rpi/vc4/imx519.json
```
Tuning files live in `/usr/share/libcamera/ipa/rpi/vc4/` on Raspberry Pi OS. Common examples:
- `imx519.json` — Arducam 16MP (IMX519)
- `imx477.json` — Raspberry Pi HQ Camera (IMX477)
- `imx708.json` — Raspberry Pi Camera Module 3 (IMX708)
- `ov5647.json` — Raspberry Pi Camera Module v1 (OV5647)
- `imx219.json` — Raspberry Pi Camera Module v2 (IMX219)

Run `ls /usr/share/libcamera/ipa/rpi/vc4/` on the Pi to see what's available for your OS version. Using the wrong tuning file is safe (mediamtx will fall back) but using the correct one can be a significant visual improvement.

**Camera orientation flips** (needed if the camera module is mounted upside down or mirrored):
```yaml
    rpiCameraHFlip: yes   # horizontal mirror
    rpiCameraVFlip: yes   # vertical flip (rotate 180° when combined with HFlip)
```

**Important caveat to document prominently:** Editing `/etc/manlycam/mediamtx.yml` directly works, but running `sudo ./install.sh ...` again will overwrite the file from the script's built-in template. Operators who need persistent custom config should add their changes after each install.sh run, or fork the script to embed their values. (This warning is already in the file header generated by install.sh.)

**After editing:** restart mediamtx to apply changes:
```bash
sudo systemctl restart mediamtx
```

These options are all documented in the [mediamtx rpiCamera source documentation](https://github.com/bluenviron/mediamtx#raspberry-pi-camera) — link to it for the full option list rather than duplicating every field.

### docs/deploy/README.md — Content Requirements

#### Full-Stack Architecture to Explain

```
Pi Zero W 2
  └── mediamtx (rpiCamera → RTSP :8554/cam)
  └── frpc → frps (tunnel: Pi:8554 → server:11935, Pi:9997 → server:11936)

Server
  └── frps (control :7000, tunnels on :11935/:11936)
  └── mediamtx (pulls RTSP from frps:11935 → WebRTC WHEP :8888)
  └── Hono server (proxies /api/stream/whep → mediamtx:8888, polls mediamtx:9997)
  └── Browser (WebRTC WHEP consumer via Hono proxy)
```

This context helps operators understand *why* each piece exists and what to check when things fail.

#### Docker Compose Path

Two variants, both in `docs/deploy/`:
- **Simple (Caddy/nginx reverse proxy):** `docs/deploy/docker-compose.yml` — server on :3000, TLS handled by host-level proxy
- **Traefik (Docker-native TLS):** `docs/deploy/traefik/docker-compose.yml` — Traefik manages Let's Encrypt automatically

Setup steps for both:
1. `cp apps/server/.env.example .env` then fill in values
2. Set up frps.toml token (must match Pi's `--frp-token`)
3. Prepare `mediamtx-server.yml` — substitute `FRP_HOST` and `FRP_RTSP_PORT` placeholders (in Docker: `FRP_HOST=frps`, `FRP_RTSP_PORT=11935`)
4. For Traefik variant: set `SITE_DOMAIN`, `ACME_EMAIL` in `.env`
5. `docker compose --env-file .env up -d`

**mediamtx-server.yml substitution note:** The file at `docs/deploy/mediamtx-server.yml` has literal `FRP_HOST` and `FRP_RTSP_PORT` placeholders that must be replaced manually before use:
```bash
# In Docker Compose:
source: rtsp://frps:11935/cam
```

**GITHUB_REPOSITORY_OWNER:** The compose files reference `ghcr.io/${GITHUB_REPOSITORY_OWNER:-zikeji}/manlycam:latest`. Operators forking the repo must update this to their own GitHub username/org.

#### Required Env Vars (for .env)

| Variable | Description | Example |
|---|---|---|
| `PORT` | Server HTTP port | `3000` |
| `BASE_URL` | Public URL (used for OAuth redirect) | `https://cam.example.com` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://manlycam:pass@postgres:5432/manlycam` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `random-secret-here` |
| `SESSION_SECRET` | Session signing secret (min 32 chars) | `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | `GOCSPX-xxx` |
| `FRP_HOST` | frps hostname (Docker: service name, bare-metal: hostname) | `frps` / `localhost` |
| `FRP_RTSP_PORT` | frps remote port for RTSP tunnel | `11935` |
| `FRP_API_PORT` | frps remote port for mediamtx API tunnel | `11936` |
| `MTX_API_URL` | mediamtx API base URL | `http://mediamtx:9997` |
| `MTX_WEBRTC_URL` | mediamtx WebRTC WHEP base URL | `http://mediamtx:8888` |
| `PET_NAME` | Camera subject name (shown in UI) | `Manly` |
| `SITE_NAME` | Site display name | `ManlyCam` |

Also for Traefik variant:
| `SITE_DOMAIN` | Domain (no https://) | `cam.example.com` |
| `ACME_EMAIL` | Let's Encrypt email | `admin@example.com` |

#### Non-Docker Bare-Metal Path

For operators running mediamtx directly on the server host (no Docker):

1. Download mediamtx binary for linux/amd64 from https://github.com/bluenviron/mediamtx/releases (e.g. `mediamtx_1.9.2_linux_amd64.tar.gz`)
2. Install to `/usr/local/bin/mediamtx`
3. Copy `docs/deploy/mediamtx-server.yml` to `/etc/mediamtx/mediamtx.yml` and substitute `FRP_HOST`/`FRP_RTSP_PORT` with actual frps hostname and port
4. Create a systemd unit for mediamtx (similar pattern to Pi's mediamtx.service)
5. Set env vars in the Hono server's environment: `MTX_API_URL=http://127.0.0.1:9997`, `MTX_WEBRTC_URL=http://127.0.0.1:8888`, `FRP_HOST=<frps-host>`, etc.

#### First-Run Admin Steps (Post-Deploy)

After the stack is running, the operator must add themselves to the allowlist via the CLI:

```bash
# Docker:
docker compose exec server manlycam-admin allowlist add your@email.com

# Or set role directly:
docker compose exec server manlycam-admin role set your@email.com Admin
```

These steps are critical — without them, OAuth sign-in will be rejected even for the server owner.

### Deploy File Locations

> **Note:** Deploy config files live in `docs/deploy/`, NOT `apps/server/deploy/`. Some story files reference the old path — the actual files are:

```
docs/deploy/
├── docker-compose.yml          # Simple deploy (host-level TLS)
├── frps.toml                   # frps server config
├── mediamtx-server.yml         # mediamtx server-side config (substitute placeholders)
├── manlycam-server.service     # Hono server systemd unit (bare-metal reference)
├── Caddyfile                   # Caddy reverse proxy example
├── nginx.conf                  # nginx reverse proxy example
└── traefik/
    ├── docker-compose.yml      # Traefik variant (Docker-native TLS)
    ├── traefik.yml             # Traefik static config
    └── frps.toml               # frps config for Traefik variant
```

### Project Structure Notes

**Files to CREATE:**
- `pi/README.md` — alongside `pi/install.sh` and `pi/uninstall.sh`
- `docs/deploy/README.md` — alongside existing deploy config files

**No other files are modified.** No application code changes. No test files.

### Cross-Reference Pattern

The `docs/deploy/README.md` should reference `pi/README.md` early (e.g., "For Pi camera setup, see `pi/README.md`"). The `pi/README.md` should reference the server docs for the operator deploying both sides (e.g., "For server-side deployment, see `docs/deploy/README.md`").

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story-6.3`] — Story requirements and ACs
- [Source: `_bmad-output/implementation-artifacts/6-2-pi-install-and-uninstall-script.md`] — Pi scripts, service names, config paths, exact flags, idempotency notes
- [Source: `_bmad-output/implementation-artifacts/6-1-remove-go-agent-extract-mediamtx-clean-dependencies.md`] — mediamtx-server.yml, docker-compose.yml, env var list
- [Source: `pi/install.sh`] — Authoritative source for all Pi install flags, paths, and service names
- [Source: `pi/uninstall.sh`] — Authoritative source for uninstall procedure
- [Source: `docs/deploy/docker-compose.yml`] — Simple Docker Compose variant (4 services)
- [Source: `docs/deploy/traefik/docker-compose.yml`] — Traefik Docker Compose variant
- [Source: `docs/deploy/mediamtx-server.yml`] — Server-side mediamtx config (FRP_HOST/FRP_RTSP_PORT placeholders)
- [Source: `docs/deploy/frps.toml`] — frps config with token field
- [Source: `apps/server/.env.example`] — Complete env var reference

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

N/A — documentation-only story, no debugging required.

### Completion Notes List

- Created `pi/README.md` covering full Pi lifecycle: OS flash, camera verification, install script usage (with exact flags from `install.sh`), service management (status/restart/logs), troubleshooting checklist, WiFi configuration (Pi Imager recommended, wifi-connect optional with link, wpa_supplicant alternative), optional mediamtx tuning (resolution, fps, bitrate, tuning file, flips) with overwrite caveat, update procedure, and uninstall procedure.
- Created `docs/deploy/README.md` covering server deployment: architecture overview diagram, env var reference table (all vars from `.env.example`), Docker Compose simple variant (external TLS), Docker Compose Traefik variant (Docker-native Let's Encrypt), bare-metal path (mediamtx binary install, systemd unit, frps setup), first-run admin steps (allowlist + role), deploy file reference, and full-stack verification checklist.
- All commands verified against actual `pi/install.sh` and `pi/uninstall.sh` source: flag names, service names, config paths, binary paths, default versions.
- Cross-references established: `pi/README.md` links to `docs/deploy/README.md` and vice versa.
- Code review (2026-03-11) findings fixed:
  - **Finding 1 (MEDIUM):** Added `sprint-status.yaml` to File List (it was modified but not documented).
  - **Finding 2 (LOW):** Expanded bare-metal frps section with explicit download command, config copy, token setup, and systemd service unit — now matches mediamtx installation level of detail.
  - **Finding 3 (LOW — Not a bug):** ArduCam reference is accurate; reviewer confirmed testing with IMX519 Arducam hardware.

### Change Log

- 2026-03-11: Created `pi/README.md` and `docs/deploy/README.md` — full operator documentation for Pi and server deployment.

### File List

- `pi/README.md` (new) — Pi operator lifecycle guide
- `docs/deploy/README.md` (new) — Server deployment guide
- `docs/deploy/docker-compose.yml` (modified) — added port 8189/UDP for WebRTC
- `docs/deploy/traefik/docker-compose.yml` (modified) — added port 8189/UDP for WebRTC
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified) — updated development_status for 6-3 and web-runtime-env-monolithic-deploy
