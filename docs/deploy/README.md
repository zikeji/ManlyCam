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

**How it works:** The Pi captures video via its camera module and serves it as an RTSP stream through mediamtx. frpc on the Pi tunnels the RTSP stream (port 8554) and mediamtx API (port 9997) to the server's frps on ports 11935 and 11936. On the server, a second mediamtx instance pulls the RTSP stream from frps and re-publishes it as WebRTC WHEP. The Hono application server proxies WHEP signaling to authenticated browsers and polls the mediamtx API for Pi reachability status. For clip recording, mediamtx also maintains an HLS rolling buffer served at `:8090` (internal only); Hono accesses this via `MTX_HLS_URL` to extract footage when a clip is requested.

## Required Ports

Your server's firewall must allow inbound traffic on these ports:

| Port         | Protocol | Purpose                                                     |
| ------------ | -------- | ----------------------------------------------------------- |
| `80` / `443` | TCP      | HTTP/HTTPS (Traefik or your reverse proxy)                  |
| `7000`       | TCP      | frps control — Pi's frpc connects here to establish tunnels |
| `8189`       | UDP      | WebRTC ICE/STUN — browsers use this for media transport     |

Port 8189 is mediamtx's default `webrtcLocalUDPAddress`. It can be customized in `mediamtx-server.yml` — see the [mediamtx configuration reference](https://mediamtx.org/docs/references/configuration-file) for details. If WebRTC connections fail (video never loads despite WHEP signaling succeeding), port 8189/UDP is almost always the cause. See the [mediamtx WebRTC troubleshooting guide](https://mediamtx.org/docs/other/webrtc-specific-features) for further diagnostics.

> **Docker users:** Port 8189/UDP must be published from the mediamtx container. Both Docker Compose variants include this mapping.

## Deployment Paths

Two Docker Compose variants are provided, plus guidance for bare-metal installs:

| Variant        | File                         | TLS Handling                                                             |
| -------------- | ---------------------------- | ------------------------------------------------------------------------ |
| **Simple**     | `docker-compose.yml`         | External — host-level Caddy, nginx, or other reverse proxy handles TLS   |
| **Traefik**    | `traefik/docker-compose.yml` | Docker-native — Traefik manages Let's Encrypt certificates automatically |
| **Bare-metal** | N/A                          | Manual — install mediamtx and frps directly on the server host           |

## Environment Variables

Both Docker Compose variants and bare-metal deploys use the same environment variables. Copy the example file and fill in your values:

```bash
cp apps/server/.env.example .env
```

### Required variables

| Variable               | Description                                                               | Example                                                              |
| ---------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `PORT`                 | Server HTTP port                                                          | `3000`                                                               |
| `BASE_URL`             | Public URL (used for OAuth redirects)                                     | `https://cam.example.com`                                            |
| `DATABASE_URL`         | PostgreSQL connection string                                              | `postgresql://manlycam:pass@postgres:5432/manlycam`                  |
| `POSTGRES_PASSWORD`    | PostgreSQL password (used in Docker Compose)                              | _(generate with `openssl rand -hex 16`)_                             |
| `SESSION_SECRET`       | Session signing secret (min 32 chars)                                     | _(generate with `openssl rand -hex 32`)_                             |
| `GOOGLE_CLIENT_ID`     | Google OAuth 2.0 client ID (see [setup guide below](#google-oauth-setup)) | `xxx.apps.googleusercontent.com`                                     |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 client secret                                            | `GOCSPX-xxx`                                                         |
| `FRP_HOST`             | frps hostname                                                             | Docker: `frps` / Bare-metal: `localhost`                             |
| `FRP_RTSP_PORT`        | frps remote port for RTSP tunnel                                          | `11935`                                                              |
| `FRP_API_PORT`         | frps remote port for mediamtx API tunnel                                  | `11936`                                                              |
| `MTX_API_URL`          | mediamtx API base URL                                                     | Docker: `http://mediamtx:9997` / Bare-metal: `http://127.0.0.1:9997` |
| `MTX_WEBRTC_URL`       | mediamtx WebRTC WHEP base URL                                             | Docker: `http://mediamtx:8888` / Bare-metal: `http://127.0.0.1:8888` |
| `PET_NAME`             | Camera subject name (shown in UI)                                         | `Manly`                                                              |
| `SITE_NAME`            | Site display name                                                         | `ManlyCam`                                                           |

### Traefik-only variables

| Variable      | Description                      | Example             |
| ------------- | -------------------------------- | ------------------- |
| `SITE_DOMAIN` | Domain without scheme            | `cam.example.com`   |
| `ACME_EMAIL`  | Let's Encrypt notification email | `admin@example.com` |

### Clipping/S3 variables (required for clip recording)

| Variable              | Description                   | Dev (RustFS)            | Production (Backblaze B2)               |
| --------------------- | ----------------------------- | ----------------------- | --------------------------------------- |
| `S3_ENDPOINT`         | S3-compatible endpoint URL    | `http://localhost:9000` | `https://s3.{region}.backblazeb2.com`   |
| `S3_BUCKET`           | Bucket name for clip storage  | _(your bucket)_         | _(your B2 bucket)_                      |
| `S3_ACCESS_KEY`       | S3 access key / keyID         | `manlycam`              | _(B2 keyID from app key)_               |
| `S3_SECRET_KEY`       | S3 secret / applicationKey   | `manlycam`              | _(B2 applicationKey)_                   |
| `S3_REGION`           | S3 region identifier          | `us-east-1`             | _(B2 region, e.g. `us-west-004`)_       |
| `S3_FORCE_PATH_STYLE`          | Use path-style S3 URLs              | `true`  | `false`                    |
| `MTX_HLS_URL`                  | mediamtx HLS server base URL        | `http://localhost:8090` | `http://mediamtx:8090` |
| `CLIP_MIN_DURATION_SECONDS`    | Minimum clip duration in seconds    | `10` (default)          | `10` (default)         |
| `CLIP_MAX_DURATION_SECONDS`    | Maximum clip duration in seconds    | `120` (default)         | `120` (default)        |

**`S3_FORCE_PATH_STYLE` notes:**

- **Dev (RustFS):** Set `true` — RustFS uses path-style URLs (`http://host/bucket/key`)
- **Production (B2):** Set `false` — B2 uses virtual-hosted style URLs (`http://bucket.s3.region.backblazeb2.com/key`)

> **Thumbnail proxy:** Clip thumbnails are served through the backend endpoint `/api/clips/:clipId/thumbnail` (responds with `Cache-Control: public, max-age=86400`) — thumbnails are **never served directly from S3/B2**. Access control is enforced at the proxy: thumbnails of private or deleted clips are not served to unauthorised callers. Operators may configure Traefik or Caddy to cache this endpoint for up to 24 h to reduce origin load.

> **B2 egress notice:** B2 egress charges apply to clip playback via presigned download URLs (`GET /api/clips/:id/download`) and to public clip page views. Thumbnail egress is from the backend (not B2 directly) since thumbnails are always proxied. Review [Backblaze B2 pricing](https://www.backblaze.com/cloud-storage/pricing) before enabling public clips at scale.

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

## Backblaze B2 Setup (Production Clip Storage)

For production deployments, ManlyCam stores clips and thumbnails in a Backblaze B2 private bucket. For local development, use RustFS instead — see [Clipping Infrastructure — Development](#clipping-infrastructure-development) for the dev setup.

> **Verify locally first:** Before configuring production B2, confirm the clipping stack works with the dev RustFS setup. This catches configuration issues without incurring B2 egress costs.

### 1. Create a private B2 bucket

1. Log in to [Backblaze B2 Cloud Storage](https://www.backblaze.com/sign-up/cloud-storage)
2. Under **Buckets**, click **Create a Bucket**
3. Name your bucket (e.g., `manlycam-clips`)
4. Set **Files in Bucket** to **Private** — the bucket must remain fully private

> **Important:** B2 does **NOT** support per-object ACLs (`PutObjectAcl` is not available). ManlyCam is designed for this — the bucket stays fully private at all times:
>
> - Video clips are served via presigned URLs from `GET /api/clips/:id/download`
> - Thumbnails are proxied through the backend at `/api/clips/:clipId/thumbnail` — never served directly from B2
> - No `PutObjectAcl` calls are made at any point

### 2. Create an application key

1. Under **App Keys**, click **Add a New Application Key**
2. Set **Name of Key** (e.g., `manlycam-prod`)
3. Under **Allow access to Bucket(s)**, select the bucket you created
4. Set **Type of Access** to **Read and Write**
5. Click **Create New Key** — copy the **keyID** and **applicationKey** immediately (the key secret is shown only once)

### 3. Map B2 values to environment variables

| B2 Dashboard Value | Environment Variable  | Example value                            |
| ------------------ | --------------------- | ---------------------------------------- |
| Endpoint (region)  | `S3_ENDPOINT`         | `https://s3.us-west-004.backblazeb2.com` |
| Bucket Name        | `S3_BUCKET`           | `manlycam-clips`                         |
| keyID              | `S3_ACCESS_KEY`       | _(from app key creation)_                |
| applicationKey     | `S3_SECRET_KEY`       | _(shown once — save immediately)_        |
| Region             | `S3_REGION`           | `us-west-004` _(from endpoint URL)_      |

Also set `S3_FORCE_PATH_STYLE=false` in your `.env` (B2 uses virtual-hosted style URLs, not path style).

### Soft-delete and S3 orphan notice

`DELETE /api/clips/:id` soft-deletes the clip record and then attempts best-effort S3 deletion. If S3 deletion fails (network error, permission issue), the S3 object is orphaned until manual cleanup. To identify orphaned objects, run the following query against your database and cross-reference the results with your B2 bucket contents:

```sql
SELECT id, s3_key, thumbnail_key FROM clips WHERE deleted_at IS NOT NULL;
```

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

The simple variant runs 5 services:

| Service    | Image                         | Purpose                                     |
| ---------- | ----------------------------- | ------------------------------------------- |
| `server`   | `ghcr.io/.../manlycam:latest` | Hono application server (port 3000)         |
| `mediamtx` | `bluenviron/mediamtx:latest`  | RTSP-to-WebRTC relay + HLS segment writer   |
| `frps`     | `snowdreamtech/frps:latest`   | frp tunnel server (port 7000)               |
| `postgres` | `postgres:16-alpine`          | PostgreSQL database                         |
| `rustfs`   | `rustfs/rustfs:latest`        | S3-compatible storage (dev — swap B2 in prod) |

### HLS Access

mediamtx serves HLS segments over HTTP at port 8090 (internal only — not published to the host). The server accesses this endpoint via the `MTX_HLS_URL` environment variable (default: `http://mediamtx:8090`). No shared filesystem volume is required; ffmpeg fetches segments over HTTP during clip extraction.

**Verify HLS is active (after the Pi stream starts):**

```bash
# Check that mediamtx is serving the HLS playlist (from within the server container)
docker compose exec server curl -s http://mediamtx:8090/cam/index.m3u8 | head -5
# Expected: #EXTM3U header and segment entries
# If empty or 404: verify the Pi camera stream is active and HLS is enabled in mediamtx-server.yml
```

> **Production note:** For production deployments using Backblaze B2, remove the `rustfs` service block from `docker-compose.yml` and also remove `rustfs` from the `server.depends_on` section. Set the B2 env vars in your `.env` file. See [Backblaze B2 Setup](#backblaze-b2-setup-production-clip-storage) above.

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

The Traefik variant runs 6 services:

| Service    | Purpose                                                        |
| ---------- | -------------------------------------------------------------- |
| `traefik`  | Reverse proxy with automatic Let's Encrypt TLS (ports 80, 443) |
| `server`   | Hono application server                                        |
| `mediamtx` | RTSP-to-WebRTC relay + HLS segment writer                      |
| `frps`     | frp tunnel server (port 7000)                                  |
| `postgres` | PostgreSQL database                                            |
| `rustfs`   | S3-compatible storage (dev — swap B2 in prod)                  |

### HLS Access

Same as the simple variant — mediamtx serves HLS segments over HTTP at port 8090 (internal only). The server accesses it via `MTX_HLS_URL` (`http://mediamtx:8090`). Verify with:

```bash
docker compose exec server curl -s http://mediamtx:8090/cam/index.m3u8 | head -5
# Expected: #EXTM3U header and segment entries when the Pi camera is active
```

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

### 3a. Verify HLS access (required for clip recording)

The clipping feature requires mediamtx's HLS HTTP server to be reachable by the Hono server. mediamtx stores HLS segments internally and serves them via HTTP at port 8090. No filesystem directory configuration is needed — the server accesses HLS exclusively via `MTX_HLS_URL`.

**Verify HLS is serving (after starting mediamtx and the Pi stream):**

```bash
curl -s http://127.0.0.1:8090/cam/index.m3u8 | head -5
# Expected: #EXTM3U header and segment entries
# If 404: verify the Pi stream is active and HLS is enabled in /etc/mediamtx/mediamtx.yml
```

**Systemd service ordering:** The Hono server must start after mediamtx so the HLS endpoint is available when the server first receives clip requests. The reference unit `docs/deploy/manlycam-server.service` includes `After=mediamtx.service` for this ordering. If you wrote a custom unit, add the same dependency.

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
MTX_HLS_URL=http://127.0.0.1:8090  # mediamtx HLS server — used for clip extraction
FRP_HOST=localhost        # or wherever frps is running
FRP_RTSP_PORT=11935
FRP_API_PORT=11936
```

A reference systemd unit for the Hono server is available at `docs/deploy/manlycam-server.service`. It includes `After=mediamtx.service` so the server starts only after mediamtx is running.

### 6. Install ffmpeg (required for clip recording)

The clipping feature requires ffmpeg for extracting video segments and generating thumbnails.

**Ubuntu/Debian:**

```bash
sudo apt update
sudo apt install ffmpeg
```

**macOS:**

```bash
brew install ffmpeg
```

**Verify the installation:**

```bash
ffmpeg -version
```

### 7. Run RustFS standalone (development S3 storage)

For local development without Backblaze B2, run RustFS as a standalone binary. In production, you would use Backblaze B2 or another S3-compatible service.

**Download RustFS:**

```bash
# Download the latest release for your platform (linux-amd64 example)
curl -fsSL https://github.com/rustfs/rustfs/releases/latest/download/rustfs-linux-amd64 -o /usr/local/bin/rustfs
sudo chmod +x /usr/local/bin/rustfs
```

**Create data directory:**

```bash
sudo mkdir -p /var/lib/rustfs
```

**Create systemd service:**

```bash
sudo tee /etc/systemd/system/rustfs.service > /dev/null <<'EOF'
[Unit]
Description=RustFS S3-compatible object storage (ManlyCam)
After=network.target

[Service]
ExecStart=/usr/local/bin/rustfs server /var/lib/rustfs --console-address :9001
Restart=on-failure
RestartSec=5
Environment="RUSTFS_ROOT_USER=manlycam"
Environment="RUSTFS_ROOT_PASSWORD=manlycam"

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now rustfs
```

**Access the web console** at `http://localhost:9001` and create a bucket (e.g., `manlycam-clips`). The default credentials are `manlycam` / `manlycam`.

> **Security Warning:** Change the default credentials to secure random values for any non-local deployment.

**Configure Hono server environment variables:**

Add these to your server environment:

```bash
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=manlycam-clips
S3_ACCESS_KEY=manlycam
S3_SECRET_KEY=manlycam
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
MTX_HLS_URL=http://127.0.0.1:8090
```

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
      - ./custom:/repo/apps/server/custom # Mount custom commands
```

Or with `docker run`:

```bash
docker run ... -v /path/to/custom:/repo/apps/server/custom ghcr.io/zikeji/manlycam:latest
```

> **Note:** Mounting a volume **shadows the entire directory** — the built-in commands baked into the image are no longer visible. Copy any built-ins you want to keep (`shrug.cjs`, `tableflip.cjs`, `pet.cjs`, `treat.cjs`) from `apps/server/custom/` into your local folder first.

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
7. **HLS buffer (Docker):** `docker compose exec server curl -s http://mediamtx:8090/cam/index.m3u8 | head -3` — `#EXTM3U` header should appear while the Pi is streaming
8. **Clip recording:** navigate to the live stream page and record a short clip — it should appear in the clips list within ~30 s
9. **S3/B2:** check your B2 bucket (or the RustFS console at `http://localhost:9001`) — a `.mp4` and `.jpg` object should appear after the first clip is created

## Clipping Infrastructure (Development)

This section covers the local development setup for the clip recording and sharing feature. For production, see [Backblaze B2 Setup](#backblaze-b2-setup-production-clip-storage) above.

> **Tip:** Verify the clipping stack works locally with RustFS before deploying with Backblaze B2 to confirm your configuration without incurring egress costs.

### Overview

The clipping pipeline uses:

- **HLS segments**: mediamtx writes HLS segments to a rolling buffer (15 minutes max)
- **RustFS**: Local S3-compatible storage for clip files and thumbnails
- **ffmpeg**: Extracts clip segments from the HLS buffer and generates thumbnails

### Docker Compose Additions

Both Docker Compose variants (simple and Traefik) include these additions for clipping:

#### RustFS Service

```yaml
  rustfs:
    image: rustfs/rustfs:latest
    restart: unless-stopped
    ports:
      - "9000:9000"   # S3 API endpoint
      - "9001:9001"   # Web console (bucket management)
    environment:
      RUSTFS_ROOT_USER: manlycam
      RUSTFS_ROOT_PASSWORD: manlycam
    volumes:
      - rustfsdata:/data

volumes:
  # ... existing volumes ...
  rustfsdata:  # RustFS data persistence
```

> **Security Warning:** The default credentials (`manlycam`/`manlycam`) are for local development only. Change these to secure random values for any non-local deployment.

### RustFS Bucket Setup

After starting the stack for the first time:

1. **Open the RustFS web console** at `http://localhost:9001`
2. **Log in** with default credentials: `manlycam` / `manlycam`
3. **Create a bucket** (e.g., `manlycam-clips`)

### mediamtx HLS Configuration

The `mediamtx-server.yml` includes HLS output settings for the clipping buffer:

```yaml
hls: true                  # Enable HLS output
hlsAddress: ':8090'        # HLS HTTP server — internal only, not published to host
hlsSegmentDuration: '2s'   # Segment length (recommended: 2s for precise clipping)
hlsSegmentCount: 450       # Rolling buffer depth
hlsVariant: mpegts         # Use MPEG-TS format for better clip extraction compatibility
hlsAlwaysRemux: true       # Generate HLS segments continuously
```

**Rolling buffer formula:**

```
hlsSegmentCount = desired_buffer_minutes × 60 / hlsSegmentDuration_seconds
```

Example: 15-minute buffer with 2-second segments = `15 × 60 / 2 = 450` segments. This is the default rolling buffer depth — 15 minutes of footage is available for extraction. Note: the application-enforced clip length limit is separate and controlled by `CLIP_MAX_DURATION_SECONDS` (default: `120` seconds / 2 minutes). Requests for clips longer than `CLIP_MAX_DURATION_SECONDS` are rejected at the application layer regardless of HLS buffer depth.

**Disk space guidance:**

```
disk_space_MB ≈ bitrate_mbps × buffer_minutes × 7.5
```

Example: 2 Mbps stream × 15-minute buffer ≈ **225 MB**. mediamtx manages segment storage internally and automatically removes the oldest segments as new ones arrive, so the buffer stays within this bound.

**HLS Access:** The HLS playlist is served via HTTP at `{MTX_HLS_URL}/cam/index.m3u8` (internal network only). The server uses ffmpeg to fetch segments over HTTP from this endpoint during clip extraction — no shared filesystem volume is needed.

**Timestamp synchronization:** The path configuration includes `useAbsoluteTimestamp: true` which preserves the original frame timestamps from the RTSP stream. This ensures accurate time alignment between the UI and extracted clips.

The HLS path is flushed when the stream goes offline using the existing `MTX_API_URL` environment variable (already present in `env.ts` at default `http://127.0.0.1:9997`). No additional environment variable is needed.

### Environment Variables

Add these to your `.env` file for clipping support (dev defaults shown; see [Clipping/S3 variables](#clippings3-variables-required-for-clip-recording) for the full table):

| Variable              | Dev Default             | Description                   |
| --------------------- | ----------------------- | ----------------------------- |
| `S3_ENDPOINT`         | `http://localhost:9000` | S3-compatible endpoint URL    |
| `S3_BUCKET`           | _(required)_            | Bucket name for clip storage  |
| `S3_ACCESS_KEY`       | `manlycam`              | RustFS root user              |
| `S3_SECRET_KEY`       | `manlycam`              | RustFS root password          |
| `S3_REGION`           | `us-east-1`             | S3 region identifier          |
| `S3_FORCE_PATH_STYLE`       | `true`                  | Path-style URLs (RustFS)              |
| `MTX_HLS_URL`               | `http://localhost:8090` | mediamtx HLS server base URL          |
| `CLIP_MIN_DURATION_SECONDS` | `10`                    | Minimum clip length in seconds        |
| `CLIP_MAX_DURATION_SECONDS` | `120`                   | Maximum clip length in seconds (2 min)|

The server constructs the full playlist URL as `{MTX_HLS_URL}/cam/video1_stream.m3u8` for ffmpeg clip extraction.
