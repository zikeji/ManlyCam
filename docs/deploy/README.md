# ManlyCam Server Deployment Guide

This guide covers deploying the ManlyCam server stack — the Hono application server, mediamtx (WebRTC relay), frps (tunnel server), and PostgreSQL.

For Pi camera node setup, see [`pi/README.md`](../../pi/README.md).

## Architecture Overview

```mermaid
flowchart LR
  subgraph Pi["Pi Zero W 2"]
    cam[Camera] --> mtxPi[mediamtx<br/>RTSP :8554/cam]
    mtxPi --> frpc[frpc]
  end

  frpc -->|tunnel :8554 → :11935<br/>tunnel :9997 → :11936| frps

  subgraph Server
    frps[frps<br/>:7000]
    frps -->|RTSP :11935| mtxSrv[mediamtx<br/>WebRTC WHEP :8888]
    mtxSrv --> hono[Hono Server]
    frps -->|API :11936| hono
    hono --> browser[Browser]
  end
```

**How it works:** The Pi captures video via its camera module and serves it as an RTSP stream through mediamtx. frpc on the Pi tunnels the RTSP stream (port 8554) and mediamtx API (port 9997) to the server's frps on ports 11935 and 11936. On the server, a second mediamtx instance pulls the RTSP stream from frps and re-publishes it as WebRTC WHEP. The Hono application server proxies WHEP signaling to authenticated browsers and polls the mediamtx API for Pi reachability status.

## Required Ports

Your server's firewall must allow inbound traffic on these ports:

| Port | Protocol | Purpose |
|---|---|---|
| `80` / `443` | TCP | HTTP/HTTPS (Traefik or your reverse proxy) |
| `7000` | TCP | frps control — Pi's frpc connects here to establish tunnels |
| `8189` | UDP | WebRTC ICE/STUN — browsers use this for media transport |

Port 8189 is mediamtx's default `webrtcLocalUDPAddress`. It can be customized in `mediamtx-server.yml` — see the [mediamtx configuration reference](https://mediamtx.org/docs/references/configuration-file) for details. If WebRTC connections fail (video never loads despite WHEP signaling succeeding), port 8189/UDP is almost always the cause. See the [mediamtx WebRTC troubleshooting guide](https://mediamtx.org/docs/other/webrtc-specific-features) for further diagnostics.

> **Docker users:** Port 8189/UDP must be published from the mediamtx container. Both Docker Compose variants include this mapping.

## Deployment Paths

Two Docker Compose variants are provided, plus guidance for bare-metal installs:

| Variant | File | TLS Handling |
|---|---|---|
| **Simple** | `docker-compose.yml` | External — host-level Caddy, nginx, or other reverse proxy handles TLS |
| **Traefik** | `traefik/docker-compose.yml` | Docker-native — Traefik manages Let's Encrypt certificates automatically |
| **Bare-metal** | N/A | Manual — install mediamtx and frps directly on the server host |

## Environment Variables

Both Docker Compose variants and bare-metal deploys use the same environment variables. Copy the example file and fill in your values:

```bash
cp apps/server/.env.example .env
```

### Required variables

| Variable | Description | Example |
|---|---|---|
| `PORT` | Server HTTP port | `3000` |
| `BASE_URL` | Public URL (used for OAuth redirects) | `https://cam.example.com` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://manlycam:pass@postgres:5432/manlycam` |
| `POSTGRES_PASSWORD` | PostgreSQL password (used in Docker Compose) | *(generate with `openssl rand -hex 16`)* |
| `SESSION_SECRET` | Session signing secret (min 32 chars) | *(generate with `openssl rand -hex 32`)* |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID (see [setup guide below](#google-oauth-setup)) | `xxx.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 client secret | `GOCSPX-xxx` |
| `FRP_HOST` | frps hostname | Docker: `frps` / Bare-metal: `localhost` |
| `FRP_RTSP_PORT` | frps remote port for RTSP tunnel | `11935` |
| `FRP_API_PORT` | frps remote port for mediamtx API tunnel | `11936` |
| `MTX_API_URL` | mediamtx API base URL | Docker: `http://mediamtx:9997` / Bare-metal: `http://127.0.0.1:9997` |
| `MTX_WEBRTC_URL` | mediamtx WebRTC WHEP base URL | Docker: `http://mediamtx:8888` / Bare-metal: `http://127.0.0.1:8888` |
| `PET_NAME` | Camera subject name (shown in UI) | `Manly` |
| `SITE_NAME` | Site display name | `ManlyCam` |

### Traefik-only variables

| Variable | Description | Example |
|---|---|---|
| `SITE_DOMAIN` | Domain without scheme | `cam.example.com` |
| `ACME_EMAIL` | Let's Encrypt notification email | `admin@example.com` |

### Container image

The compose files reference `ghcr.io/${GITHUB_REPOSITORY_OWNER:-zikeji}/manlycam:latest`. If you've forked the repo, set `GITHUB_REPOSITORY_OWNER` to your GitHub username or org, or edit the image reference directly.

## Google OAuth Setup

ManlyCam uses Google OAuth for sign-in. You'll need to create an OAuth 2.0 client in the Google Cloud Console.

1. Go to [Google Cloud Console — Auth Clients](https://console.cloud.google.com/auth/clients)
2. Create a new **OAuth 2.0 Client ID** (application type: **Web application**)
3. Under **Authorized JavaScript origins**, add your `BASE_URL`:
   ```
   https://cam.example.com
   ```
4. Under **Authorized redirect URIs**, add your `BASE_URL` with the callback path:
   ```
   https://cam.example.com/api/auth/google/callback
   ```
5. Copy the **Client ID** and **Client Secret** into your `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

> **Note:** If you change your `BASE_URL` later (e.g. switching domains), you must update both the JavaScript origin and redirect URI in the Google Cloud Console to match.

## Docker Compose — Simple (External TLS)

Use this variant when you already have a reverse proxy (Caddy, nginx, etc.) handling TLS on the host.

### Setup

1. **Prepare `.env`** — copy and fill in as described above. Set `BASE_URL` to your public HTTPS URL.

2. **Set up frps token** — edit `docs/deploy/frps.toml` and replace the token with a secure random secret:
   ```bash
   openssl rand -hex 32
   ```
   This token must match the `--frp-token` value used when running `install.sh` on the Pi.

3. **Prepare mediamtx-server.yml** — the file at `docs/deploy/mediamtx-server.yml` has `FRP_HOST` and `FRP_RTSP_PORT` placeholders. Replace them with actual values. In Docker Compose, frps is reachable by service name:
   ```yaml
   # In docs/deploy/mediamtx-server.yml, change:
   source: rtsp://FRP_HOST:FRP_RTSP_PORT/cam
   # To:
   source: rtsp://frps:11935/cam
   ```

4. **Start the stack:**
   ```bash
   cd docs/deploy
   docker compose --env-file ../../.env up -d
   ```

5. **Configure your reverse proxy** to forward traffic to port 3000. Example configs are provided:
   - `Caddyfile` — Caddy reverse proxy
   - `nginx.conf` — nginx reverse proxy

6. **Add yourself to the allowlist** (see [First-Run Admin Steps](#first-run-admin-steps)).

### Services

The simple variant runs 4 services:

| Service | Image | Purpose |
|---|---|---|
| `server` | `ghcr.io/.../manlycam:latest` | Hono application server (port 3000) |
| `mediamtx` | `bluenviron/mediamtx:latest` | RTSP-to-WebRTC relay |
| `frps` | `snowdreamtech/frps:latest` | frp tunnel server (port 7000) |
| `postgres` | `postgres:16-alpine` | PostgreSQL database |

## Docker Compose — Traefik (Docker-Native TLS)

Use this variant for a fully self-contained deployment where Traefik manages Let's Encrypt certificates automatically.

### Setup

1. **Prepare `.env`** — copy and fill in as described above. Set `SITE_DOMAIN` (e.g. `cam.example.com`) and `ACME_EMAIL`. `BASE_URL` is constructed automatically as `https://${SITE_DOMAIN}`.

2. **Set up frps token** — edit `docs/deploy/traefik/frps.toml` and replace the token with a secure random secret (must match the Pi's `--frp-token`).

3. **Prepare mediamtx-server.yml** — copy `docs/deploy/mediamtx-server.yml` to `docs/deploy/traefik/mediamtx-server.yml` and substitute `FRP_HOST`/`FRP_RTSP_PORT`:
   ```yaml
   source: rtsp://frps:11935/cam
   ```

4. **Update traefik.yml** — edit `docs/deploy/traefik/traefik.yml` and replace `admin@example.com` with your actual email for Let's Encrypt.

5. **Start the stack:**
   ```bash
   cd docs/deploy/traefik
   docker compose --env-file ../../../.env up -d
   ```

6. **Point DNS** — create an A record pointing `SITE_DOMAIN` to your server's IP. Traefik will automatically obtain a TLS certificate once DNS resolves.

7. **Add yourself to the allowlist** (see [First-Run Admin Steps](#first-run-admin-steps)).

### Services

The Traefik variant runs 5 services (same 4 as simple, plus Traefik):

| Service | Purpose |
|---|---|
| `traefik` | Reverse proxy with automatic Let's Encrypt TLS (ports 80, 443) |
| `server` | Hono application server |
| `mediamtx` | RTSP-to-WebRTC relay |
| `frps` | frp tunnel server (port 7000) |
| `postgres` | PostgreSQL database |

## Bare-Metal / Non-Docker

For operators running mediamtx and frps directly on the server host without Docker.

### 1. Install mediamtx

Download the mediamtx binary for your platform from [mediamtx releases](https://github.com/bluenviron/mediamtx/releases) (e.g. `mediamtx_v1.9.2_linux_amd64.tar.gz`):

```bash
curl -fsSL https://github.com/bluenviron/mediamtx/releases/download/v1.9.2/mediamtx_v1.9.2_linux_amd64.tar.gz | \
  sudo tar -xzf - -C /usr/local/bin mediamtx
sudo chmod 755 /usr/local/bin/mediamtx
```

### 2. Configure mediamtx

Copy the server config and substitute placeholders:

```bash
sudo mkdir -p /etc/mediamtx
sudo cp docs/deploy/mediamtx-server.yml /etc/mediamtx/mediamtx.yml
```

Edit `/etc/mediamtx/mediamtx.yml` and replace `FRP_HOST` and `FRP_RTSP_PORT` with your actual frps hostname and port:

```yaml
source: rtsp://your-frps-host:11935/cam
```

### 3. Create a systemd service

```bash
sudo tee /etc/systemd/system/mediamtx.service > /dev/null <<'EOF'
[Unit]
Description=mediamtx RTSP/WebRTC server (ManlyCam)
After=network.target

[Service]
ExecStart=/usr/local/bin/mediamtx /etc/mediamtx/mediamtx.yml
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now mediamtx
```

Ensure port `8189/UDP` is open on the host firewall for WebRTC media transport.

### 4. Install and configure frps

Download frps for your platform from [frp releases](https://github.com/fatedier/frp/releases) (e.g. `frp_0.61.0_linux_amd64.tar.gz` for x86-64 servers):

```bash
curl -fsSL https://github.com/fatedier/frp/releases/download/v0.61.0/frp_0.61.0_linux_amd64.tar.gz | \
  sudo tar -xzf - -C /usr/local/bin frps
sudo chmod 755 /usr/local/bin/frps
```

Copy and customize the frps configuration:

```bash
sudo mkdir -p /etc/frps
sudo cp docs/deploy/frps.toml /etc/frps/frps.toml
```

Edit `/etc/frps/frps.toml` and replace the token with a secure random secret (must match your Pi's `--frp-token`):

```bash
openssl rand -hex 32
```

Then create a systemd service for frps:

```bash
sudo tee /etc/systemd/system/frps.service > /dev/null <<'EOF'
[Unit]
Description=frp tunnel server (ManlyCam)
After=network.target

[Service]
ExecStart=/usr/local/bin/frps -c /etc/frps/frps.toml
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now frps
```

### 5. Configure the Hono server

Set these environment variables for the Hono server process:

```bash
MTX_API_URL=http://127.0.0.1:9997
MTX_WEBRTC_URL=http://127.0.0.1:8888
FRP_HOST=localhost        # or wherever frps is running
FRP_RTSP_PORT=11935
FRP_API_PORT=11936
```

A reference systemd unit for the Hono server is available at `docs/deploy/manlycam-server.service`.

## First-Run Admin Steps

After the stack is running, you must add yourself to the allowlist before you can sign in. Without this, Google OAuth sign-in will be rejected even for the server owner.

**1. Add your email to the allowlist:**

```bash
# Docker:
docker compose exec server manlycam-admin allowlist add-email your@email.com

# Bare-metal:
manlycam-admin allowlist add-email your@email.com
```

**2. Sign in via Google OAuth** — navigate to your `BASE_URL` and sign in. This creates your user account in the database.

**3. Grant yourself Admin privileges** (requires an existing user account from step 2):

```bash
# Docker:
docker compose exec server manlycam-admin users grant-admin --email=your@email.com

# Bare-metal:
manlycam-admin users grant-admin --email=your@email.com
```

> **Note:** You must sign in at least once before granting admin — the `grant-admin` and `set-role` commands operate on existing user records.

### CLI Reference

```
manlycam-admin allowlist add-domain <domain>       # Allow all emails from a domain
manlycam-admin allowlist remove-domain <domain>
manlycam-admin allowlist add-email <email>          # Allow an individual email
manlycam-admin allowlist remove-email <email>

manlycam-admin users grant-admin --email=<email>    # Grant Admin role
manlycam-admin users set-role --email=<email> --role=<role>
manlycam-admin users ban <email>                    # Ban user (revokes sessions)
manlycam-admin users unban <email>
```

Roles: `Admin`, `Moderator`, `ViewerCompany`, `ViewerGuest`

## Custom Slash Commands

ManlyCam supports custom slash commands defined as JavaScript files in `apps/server/custom/`. Four examples are included (`/shrug`, `/tableflip`, `/pet`, `/treat`). See [`apps/server/custom/README.md`](../../apps/server/custom/README.md) for the full authoring guide covering ephemeral responses, role-gating, user mentions, and persistent state.

### Docker Volume Mount

To use custom commands in Docker without rebuilding the image, mount the `custom/` folder as a volume:

```yaml
# In your docker-compose.yml, under the server service:
services:
  server:
    volumes:
      - ./custom:/repo/apps/server/custom  # Mount custom commands
```

Or with `docker run`:

```bash
docker run ... -v /path/to/custom:/repo/apps/server/custom ghcr.io/zikeji/manlycam:latest
```

> **Note:** Mounting a volume **shadows the entire directory** — the built-in commands baked into the image are no longer visible. Copy any built-ins you want to keep (`shrug.js`, `tableflip.js`, `pet.js`, `treat.js`) from `apps/server/custom/` into your local folder first.

> **Note:** Do not mount with `:ro` (read-only) if any of your commands write files to `__dirname` (e.g. rate-limit state files). The built-in `/pet` and `/treat` commands write `.last-*-timestamp` files to the `custom/` directory and require a writable mount.

## Deploy File Reference

```
docs/deploy/
  docker-compose.yml          # Simple deploy (external TLS)
  frps.toml                   # frps server config (set token here)
  mediamtx-server.yml         # mediamtx server config (substitute FRP_HOST/FRP_RTSP_PORT)
  manlycam-server.service     # Hono server systemd unit (bare-metal reference)
  Caddyfile                   # Caddy reverse proxy example
  nginx.conf                  # nginx reverse proxy example
  traefik/
    docker-compose.yml        # Traefik variant (Docker-native TLS)
    traefik.yml               # Traefik static config (set ACME email)
    frps.toml                 # frps config for Traefik variant (set token here)
```

## Full-Stack Checklist

Use this to verify the entire ManlyCam stack is operational:

1. **Server:** `docker compose ps` (or `systemctl status`) — all services running
2. **frps:** Pi's frpc can connect — check `journalctl -u frpc -f` on the Pi for connection success
3. **mediamtx (server):** pulling RTSP from frps — check server mediamtx logs for `[path cam] [source] ready`
4. **Hono server:** health check passes — `curl http://localhost:3000/api/health`
5. **Browser:** navigate to your `BASE_URL`, sign in with Google, and confirm the live stream loads
6. **Pi:** camera streaming — see [`pi/README.md`](../../pi/README.md) for Pi-side troubleshooting
