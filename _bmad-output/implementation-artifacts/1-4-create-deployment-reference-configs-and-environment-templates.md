# Story 1.4: Create Deployment Reference Configs and Environment Templates

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer deploying ManlyCam**,
I want complete deployment reference configurations and environment templates,
so that I can get the server running in production with my choice of reverse proxy with minimal configuration effort.

## Acceptance Criteria

**AC1 — docker-compose.yml: server + postgres**
Given the repo is cloned on a fresh server
When `apps/server/deploy/docker-compose.yml` is used
Then running `docker compose up` starts `server` (Hono + ffmpeg) and `postgres` containers, with all required env vars documented in the compose file comments

**AC2 — Caddyfile: auto-TLS + proxy + static SPA**
Given Caddy is the chosen reverse proxy
When `apps/server/deploy/Caddyfile` is used
Then it configures: automatic TLS via Let's Encrypt, proxying `/api` and `/ws` to the Hono server, and serving `apps/web/dist/` as the static SPA root

**AC3 — nginx.conf: TLS + static SPA + WS proxy**
Given nginx is the chosen reverse proxy
When `apps/server/deploy/nginx.conf` is used
Then it configures: TLS termination, static SPA serving for `apps/web/dist/`, and proxy to Hono for `/api` + `/ws` — including correct WebSocket upgrade headers

**AC4 — Traefik: Docker-native auto-TLS + label routing**
Given Traefik is the chosen reverse proxy
When `apps/server/deploy/traefik/docker-compose.yml` and `traefik.yml` are used
Then Traefik provides Docker-native auto-TLS via Let's Encrypt with label-based routing to the server container

**AC5 — .env.example: all required vars with comments**
Given a new developer needs to set up the local environment
When they copy `apps/server/.env.example` to `.env`
Then the file contains all required env vars with safe placeholder values and inline comments explaining each one — including `PET_NAME` and `SITE_NAME`

**AC6 — agent config.example.toml: all fields annotated**
Given the agent config template exists
When `apps/agent/deploy/config.example.toml` is inspected
Then it shows all config fields with annotations for `[stream]`, `[frp]`, and `[update]` sections — matching what the Go agent code parses

**AC7 — systemd unit: bare-metal server service**
Given a bare-metal deployment without Docker
When `apps/server/deploy/manlycam-server.service` is used
Then it is a working systemd unit file that starts the Node.js server as a service with restart-on-failure

## Tasks / Subtasks

- [x] Task 1: Create `apps/server/deploy/docker-compose.yml` (AC: #1)
  - [x] `server` service: uses GHCR image, maps port 3000, all env vars documented with comments
  - [x] `postgres` service: postgres:16-alpine, persistent volume, healthcheck
  - [x] `server` depends on `postgres` with `condition: service_healthy`
  - [x] Named volume `pgdata` for persistence
  - [x] `.env` file pattern documented in comments (dev copies `.env.example`)

- [x] Task 2: Create `apps/server/deploy/Caddyfile` (AC: #2)
  - [x] `{$SITE_DOMAIN}` global block (env-driven domain)
  - [x] `handle /api/*` → `reverse_proxy localhost:3000`
  - [x] `handle /ws` → `reverse_proxy localhost:3000`
  - [x] `handle` fallback → `root * /path/to/apps/web/dist`, `file_server`, `try_files {path} /index.html`
  - [x] TLS block with `{$ACME_EMAIL}` for Let's Encrypt
  - [x] Comment explaining each block's purpose

- [x] Task 3: Create `apps/server/deploy/nginx.conf` (AC: #3)
  - [x] `server` block listening on 443 with TLS config (cert/key paths as placeholders)
  - [x] `root` pointing to `apps/web/dist`; `try_files $uri $uri/ /index.html` for SPA
  - [x] `/api/` location: `proxy_pass http://localhost:3000` + standard proxy headers
  - [x] `/ws` location: proxy_pass + `proxy_http_version 1.1` + `Upgrade` + `Connection "upgrade"` headers (CRITICAL — WS breaks without these)
  - [x] HTTP→HTTPS redirect block (port 80 → 443)
  - [x] Comment explaining the WebSocket upgrade headers requirement

- [x] Task 4: Create `apps/server/deploy/traefik/` directory with two files (AC: #4)
  - [x] `traefik/traefik.yml`: static config — entrypoints `web` (80) and `websecure` (443), ACME Let's Encrypt resolver, Docker provider
  - [x] `traefik/docker-compose.yml`: Traefik container + server container + postgres; label-based routing on server container for `/api` and `/ws`; Traefik handles TLS

- [x] Task 5: Verify `apps/server/.env.example` covers all required vars (AC: #5)
  - [x] File already exists — verify it matches the full list: `PORT`, `BASE_URL`, `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `HLS_SEGMENT_PATH`, `FRP_STREAM_PORT`, `FRP_API_PORT`, `AGENT_API_KEY`, `PET_NAME`, `SITE_NAME`
  - [x] Add any missing vars with comments (current file appears complete — verify only)

- [x] Task 6: Reconcile `apps/agent/deploy/config.example.toml` with architecture spec (AC: #6)
  - [x] Current file uses different field names than architecture spec — SEE CONFLICT NOTE IN DEV NOTES
  - [x] Update to match architecture field names: `[stream]` → width, height, framerate, codec, hflip, vflip, output_port
  - [x] `[frp]` → server_addr, server_port, auth_token (not `token`); add stream and API tunnel sub-sections
  - [x] `[update]` → update_url pointing to GitHub Releases API
  - [x] All fields annotated with comments explaining purpose and valid values

- [x] Task 7: Create `apps/server/deploy/manlycam-server.service` (AC: #7)
  - [x] `After=network-online.target postgresql.service` (bare-metal assumes local Postgres)
  - [x] `EnvironmentFile=/etc/manlycam/server.env` — env vars loaded from file (not inline — keeps secrets out of process list)
  - [x] `ExecStart` runs the compiled Node.js entry point
  - [x] `Restart=on-failure`, `RestartSec=10`
  - [x] `StandardOutput=journal`, `StandardError=journal`

- [x] Task 8: Create and document `apps/server/deploy/frps.toml` (both root and traefik/ variant)
  - [x] `apps/server/deploy/frps.toml`: server auth config (token placeholder) — mounted by docker-compose.yml
  - [x] `apps/server/deploy/traefik/frps.toml`: identical server auth config — mounted by traefik/docker-compose.yml
  - [x] Updated docker-compose.yml usage instructions to mention frps.toml setup
  - [x] Updated traefik/docker-compose.yml usage instructions to mention frps.toml + traefik.yml ACME email setup
  - [x] Added clear comments that frps is the server, frpc (on Pi agent) defines tunnels

## Dev Notes

### Pre-Existing Files — DO NOT RECREATE

The following files were created in earlier stories. **Verify content is complete, then leave them alone** (unless reconciling the config.toml conflict below):

| File | Created In | Status |
|---|---|---|
| `apps/server/.env.example` | Story 1.1 | Complete — verify all 13 env vars present |
| `apps/agent/deploy/manlycam-agent.service` | Story 1.1 | Complete — no changes needed |
| `apps/agent/deploy/config.example.toml` | Story 1.1 | **CONFLICT — must reconcile** (see below) |

### CRITICAL CONFLICT: config.example.toml Field Name Mismatch

The `config.example.toml` created in Story 1.1 uses different field names than what the architecture document specifies. Since `apps/agent/internal/config/config.go` is currently empty (no struct defined), Story 3.1 will define the authoritative Go struct. **This story should update `config.example.toml` to align with the architecture spec** to set the correct expectation for Story 3.1.

**Current file (Story 1.1 creation):**
```toml
[stream]
device = "/dev/video0"
bitrate = 2000
fps = 30
width = 1280
height = 720
segment_duration = 2

[frp]
server_addr = "your-server-hostname-or-ip"
server_port = 7000
token = "change-me-to-a-random-secret"
local_port = 1935
remote_port = 11935

[update]
repo = "zikeji/ManlyCam"
channel = "stable"
check_on_start = true
```

**Architecture spec (`architecture.md` — Pi Agent section):**
```toml
[stream]
width       = 2328
height      = 1748
framerate   = 30
codec       = "mjpeg"
hflip       = true
vflip       = true
output_port = 5000     # local TCP port rpicam-vid listens on; frp stream tunnel connects here

[frp]
server_addr = "upstream.example.com"
server_port = 7000
auth_token  = "secret"   # NOTE: key is auth_token, NOT token

[update]
update_url = "https://api.github.com/repos/zikeji/ManlyCam/releases/latest"
```

**Architecture-mandated rpicam-vid command the agent builds:**
```
rpicam-vid -t 0 --width {width} --height {height} --framerate {framerate} \
  --codec {codec} [--hflip] [--vflip] --inline --listen \
  -o tcp://0.0.0.0:{output_port}
```
This command uses `width`, `height`, `framerate`, `codec`, `hflip`, `vflip`, `output_port` — the architecture field names, NOT the Story 1.1 field names. Update the file to match.

**Two frp tunnels** (both managed by one agent, both need config):
- **Stream tunnel**: Pi port (`output_port` from `[stream]`) → upstream frp → ffmpeg ingestion
- **API tunnel**: Upstream HTTP → frp → Pi agent local HTTP server (receives camera control commands)

The architecture doesn't show a separate `[frp.api]` section, but the dev should add it since both tunnels need config. Suggested expansion:
```toml
[frp]
server_addr   = "upstream.example.com"
server_port   = 7000
auth_token    = "change-me-to-a-random-secret"

[frp.stream]
remote_port   = 11935   # port frps exposes for stream ingestion; ffmpeg connects here

[frp.api]
local_port    = 8080    # Pi agent local HTTP server port (receives camera control)
remote_port   = 11936   # port frps exposes for API proxy; Hono connects here
```

If in doubt: follow `architecture.md` field names exactly — Story 3.1 will implement the Go struct to match this file, not the other way around.

### Files to Create

**Target directory structure after this story:**
```
apps/
└── server/
    ├── .env.example                          # ALREADY EXISTS — verify only
    └── deploy/
        ├── docker-compose.yml                # CREATE — simple: server + postgres
        ├── Caddyfile                         # CREATE — auto TLS + SPA + WS proxy
        ├── nginx.conf                        # CREATE — TLS + SPA + WS proxy
        ├── manlycam-server.service           # CREATE — bare-metal systemd unit
        └── traefik/
            ├── docker-compose.yml            # CREATE — Traefik + server + postgres
            └── traefik.yml                   # CREATE — Traefik static config
apps/
└── agent/
    └── deploy/
        ├── config.example.toml              # UPDATE — reconcile with architecture spec
        └── manlycam-agent.service           # ALREADY EXISTS — no changes
```

### Architecture: Deployment Topology

All three proxy options share the same logical topology:
```
[Internet]
    ↓ HTTPS (443)
[Caddy | nginx | Traefik]
    → TLS termination
    → /api/* + /ws  →  [Hono server :3000 (+ ffmpeg subprocess)]
    → /*            →  [apps/web/dist/ — static SPA files]
                                ↓
                          [PostgreSQL]
```

- **Caddy**: Simplest option — automatic TLS renewal, zero SSL cert management. Best for single-server deploys.
- **nginx**: Most familiar — manual TLS cert management (Let's Encrypt via certbot or similar). More config required but widely documented.
- **Traefik**: Docker-native — label-based routing, automatic TLS via Let's Encrypt. Best when running in Docker Compose.

### docker-compose.yml Pattern

```yaml
# apps/server/deploy/docker-compose.yml
# Simple deployment: Hono server + PostgreSQL
# TLS is handled externally (host-level Caddy/nginx) or by Traefik variant.
# See traefik/ subdirectory for a fully Docker-native TLS option.

services:
  server:
    image: ghcr.io/${GITHUB_REPOSITORY_OWNER:-your-github-username}/manlycam-server:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      PORT: "3000"
      BASE_URL: "${BASE_URL}"                             # e.g. https://cam.example.com
      DATABASE_URL: "postgresql://manlycam:${POSTGRES_PASSWORD}@postgres:5432/manlycam"
      SESSION_SECRET: "${SESSION_SECRET}"
      GOOGLE_CLIENT_ID: "${GOOGLE_CLIENT_ID}"
      GOOGLE_CLIENT_SECRET: "${GOOGLE_CLIENT_SECRET}"
      GOOGLE_REDIRECT_URI: "${GOOGLE_REDIRECT_URI}"
      HLS_SEGMENT_PATH: "/tmp/manlycam/hls"
      FRP_STREAM_PORT: "${FRP_STREAM_PORT:-11935}"
      FRP_API_PORT: "${FRP_API_PORT:-11936}"
      AGENT_API_KEY: "${AGENT_API_KEY}"
      PET_NAME: "${PET_NAME:-Manly}"
      SITE_NAME: "${SITE_NAME:-ManlyCam}"
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: manlycam
      POSTGRES_USER: manlycam
      POSTGRES_PASSWORD: "${POSTGRES_PASSWORD}"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U manlycam"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

Usage: copy `.env.example` → `.env`, fill values, then `docker compose --env-file ../.env.example up -d` (or use `.env` at repo root).

### Caddyfile Pattern

```
# apps/server/deploy/Caddyfile
# Caddy v2 — automatic TLS via Let's Encrypt (ACME)
# Set SITE_DOMAIN and ACME_EMAIL environment variables before starting.
#
# Usage:
#   export SITE_DOMAIN=cam.example.com
#   export ACME_EMAIL=admin@example.com
#   caddy run --config Caddyfile

{$SITE_DOMAIN} {
    # API routes — proxy to Hono server
    handle /api/* {
        reverse_proxy localhost:3000
    }

    # WebSocket endpoint — proxy to Hono (Caddy handles WS upgrade automatically)
    handle /ws {
        reverse_proxy localhost:3000
    }

    # Static SPA files — serve Vue dist with SPA fallback
    handle {
        root * /opt/manlycam/web/dist
        file_server
        try_files {path} /index.html
    }
}
```

Key: Caddy handles WebSocket proxying automatically without special headers — no `Connection: upgrade` block needed.

### nginx.conf Pattern

```nginx
# apps/server/deploy/nginx.conf
# nginx reverse proxy for ManlyCam
# Assumes TLS certs managed externally (e.g. certbot/Let's Encrypt)
# Replace placeholder paths with actual cert paths.

server {
    listen 80;
    server_name cam.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name cam.example.com;

    ssl_certificate     /etc/ssl/certs/manlycam.pem;
    ssl_certificate_key /etc/ssl/private/manlycam.key;
    ssl_protocols       TLSv1.2 TLSv1.3;

    # Static SPA — Vue dist directory
    root /opt/manlycam/web/dist;
    index index.html;

    # API proxy to Hono server
    location /api/ {
        proxy_pass         http://localhost:3000;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # WebSocket proxy — CRITICAL: Upgrade headers required or WS connections will fail
    location /ws {
        proxy_pass             http://localhost:3000;
        proxy_http_version     1.1;
        proxy_set_header       Upgrade    $http_upgrade;
        proxy_set_header       Connection "upgrade";
        proxy_set_header       Host       $host;
        proxy_read_timeout     3600s;   # keep WS connections alive
    }

    # SPA catch-all — must come last; serves index.html for all unmatched paths
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**WebSocket headers are mandatory** — omitting `proxy_http_version 1.1` or the `Upgrade`/`Connection` headers causes HTTP 400 or 502 on WS upgrade. This is the most common nginx WebSocket misconfiguration.

### Traefik Pattern

**`traefik/traefik.yml`** (static config):
```yaml
# apps/server/deploy/traefik/traefik.yml
# Traefik v3 static configuration
# Mount this file at /etc/traefik/traefik.yml in the Traefik container

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entrypoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@example.com    # replace with real email
      storage: /letsencrypt/acme.json
      httpChallenge:
        entryPoint: web

providers:
  docker:
    exposedByDefault: false
```

**`traefik/docker-compose.yml`**:
```yaml
# apps/server/deploy/traefik/docker-compose.yml
# Full deployment: Traefik (TLS) + Hono server + PostgreSQL
# Traefik manages Let's Encrypt certificates automatically via Docker labels.

services:
  traefik:
    image: traefik:v3
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik.yml:/etc/traefik/traefik.yml:ro
      - letsencrypt:/letsencrypt
    networks:
      - proxy

  server:
    image: ghcr.io/${GITHUB_REPOSITORY_OWNER:-your-github-username}/manlycam-server:latest
    restart: unless-stopped
    environment:
      PORT: "3000"
      BASE_URL: "https://${SITE_DOMAIN}"
      DATABASE_URL: "postgresql://manlycam:${POSTGRES_PASSWORD}@postgres:5432/manlycam"
      SESSION_SECRET: "${SESSION_SECRET}"
      GOOGLE_CLIENT_ID: "${GOOGLE_CLIENT_ID}"
      GOOGLE_CLIENT_SECRET: "${GOOGLE_CLIENT_SECRET}"
      GOOGLE_REDIRECT_URI: "https://${SITE_DOMAIN}/auth/google/callback"
      HLS_SEGMENT_PATH: "/tmp/manlycam/hls"
      FRP_STREAM_PORT: "${FRP_STREAM_PORT:-11935}"
      FRP_API_PORT: "${FRP_API_PORT:-11936}"
      AGENT_API_KEY: "${AGENT_API_KEY}"
      PET_NAME: "${PET_NAME:-Manly}"
      SITE_NAME: "${SITE_NAME:-ManlyCam}"
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.manlycam.rule=Host(`${SITE_DOMAIN}`)"
      - "traefik.http.routers.manlycam.entrypoints=websecure"
      - "traefik.http.routers.manlycam.tls.certresolver=letsencrypt"
      - "traefik.http.services.manlycam.loadbalancer.server.port=3000"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - proxy
      - internal

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: manlycam
      POSTGRES_USER: manlycam
      POSTGRES_PASSWORD: "${POSTGRES_PASSWORD}"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U manlycam"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - internal

networks:
  proxy:
    external: false
  internal:
    external: false

volumes:
  pgdata:
  letsencrypt:
```

Note: Traefik proxies to the server container's port 3000 — both `/api/*` and `/ws` are routed to the same service. Traefik handles WebSocket proxying automatically at the transport level (no label config needed for WS upgrade).

### systemd Unit: manlycam-server.service

```ini
# apps/server/deploy/manlycam-server.service
# Systemd unit for bare-metal deployment (no Docker)
# Install: sudo cp manlycam-server.service /etc/systemd/system/
# Enable: sudo systemctl daemon-reload && sudo systemctl enable --now manlycam-server

[Unit]
Description=ManlyCam Server (Hono + ffmpeg)
Documentation=https://github.com/zikeji/ManlyCam
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=manlycam
Group=manlycam

# All env vars sourced from this file — keeps secrets out of process list and journal
EnvironmentFile=/etc/manlycam/server.env

WorkingDirectory=/opt/manlycam/server

# Assumes tsc build output is at /opt/manlycam/server/dist/index.js
ExecStart=/usr/bin/node dist/index.js

Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=manlycam-server

# Security hardening
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Setup note: create the `manlycam` system user (`sudo useradd --system --no-create-home manlycam`), copy `/apps/server/dist/` to `/opt/manlycam/server/`, copy `.env` to `/etc/manlycam/server.env`, restrict permissions (`sudo chmod 640 /etc/manlycam/server.env && sudo chown root:manlycam /etc/manlycam/server.env`).

### Architecture Compliance Checklist

- All deploy configs use env var placeholders — **zero hardcoded domain names, passwords, or secrets**
- `PET_NAME` and `SITE_NAME` present in all docker-compose env blocks (FR55 — configurable instance name)
- WebSocket (`/ws`) proxied correctly in all three proxy configs
- Static SPA serving (`apps/web/dist/`) configured in all proxy configs (except docker-compose.yml which defers to host proxy)
- All postgres containers use healthcheck so server waits for DB readiness
- All HLS segment paths default to `/tmp/manlycam/hls` (consistent with architecture default)
- Agent config uses `auth_token` (not `token`) per architecture spec

### Known Scope Boundaries

This story creates **reference/template files only** — no application code changes:
- Do NOT modify `apps/server/src/` — that is for later epics
- Do NOT modify `apps/agent/` Go source files — config struct is implemented in Story 3.1
- Do NOT run `prisma migrate` — Story 1.2 already handled the schema and migration
- The `apps/web/dist/` directory does not exist yet — configs reference its future path; this is expected

### Files Changed by Previous Stories (for pattern reference)

From Story 1.3 dev notes:
- All GitHub Actions workflows use `pnpm install --frozen-lockfile` from repo root
- All Docker builds use **repo root** as build context (`.`) to allow `COPY packages/types/` from outside app dirs
- pnpm workspace filter pattern: `pnpm --filter @manlycam/server <script>`
- GHCR image URLs: `ghcr.io/${{ github.repository_owner }}/manlycam-server:latest`

### Project Structure Notes

- Alignment with architecture: `apps/server/deploy/` directory matches `architecture.md#Monorepo Structure` exactly
- The `manlycam-agent.service` is in `apps/agent/deploy/` (already exists) — the server service goes in `apps/server/deploy/` (different location, same pattern)
- No files outside the `apps/` directory are touched in this story

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4] — Acceptance criteria and story statement
- [Source: _bmad-output/planning-artifacts/architecture.md#Backend: Hono] — Deployment reference config table (Caddyfile, nginx.conf, docker-compose.yml, traefik/, manlycam-server.service)
- [Source: _bmad-output/planning-artifacts/architecture.md#Monorepo Structure] — Complete directory tree showing `apps/server/deploy/` layout
- [Source: _bmad-output/planning-artifacts/architecture.md#Pi Agent] — `config.toml` field names (stream, frp, update sections); rpicam-vid command that drives required field names
- [Source: _bmad-output/planning-artifacts/architecture.md#Key Technical Decisions] — Reverse proxy options: Caddy, nginx, Traefik
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security] — CORS locked to `SITE_URL` (= `BASE_URL`) env var
- [Source: _bmad-output/implementation-artifacts/1-1-initialize-monorepo-with-application-scaffolds-and-shared-types.md] — `apps/server/.env.example` and `apps/agent/deploy/config.example.toml` first created here
- [Source: _bmad-output/implementation-artifacts/1-3-set-up-github-actions-ci-cd-pipelines.md] — GHCR image naming pattern: `ghcr.io/${{ github.repository_owner }}/manlycam-server`

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Created `apps/server/deploy/docker-compose.yml`: Hono server + postgres:16-alpine with healthcheck, `service_healthy` dependency, named `pgdata` volume, all 13 env vars documented with inline comments.
- Created `apps/server/deploy/Caddyfile`: Caddy v2 config with `{$SITE_DOMAIN}` env-driven domain, `{$ACME_EMAIL}` for Let's Encrypt, `/api/*` + `/ws` → `localhost:3000`, SPA fallback with `try_files {path} /index.html`.
- Created `apps/server/deploy/nginx.conf`: TLS on 443, HTTP→HTTPS redirect on 80, `/api/` proxy with standard headers, `/ws` proxy with mandatory `Upgrade`/`Connection` WebSocket upgrade headers and `proxy_http_version 1.1`, SPA catch-all `try_files`.
- Created `apps/server/deploy/traefik/traefik.yml`: Traefik v3 static config — `web` (80→HTTPS redirect) + `websecure` (443) entrypoints, `letsencrypt` ACME resolver with HTTP-01 challenge, Docker provider with `exposedByDefault: false`.
- Created `apps/server/deploy/traefik/docker-compose.yml`: Traefik + server + postgres on `proxy`/`internal` networks, label-based routing for `SITE_DOMAIN`, `letsencrypt` volume for cert persistence.
- Verified `apps/server/.env.example`: All 13 required vars present (PORT, BASE_URL, DATABASE_URL, SESSION_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, HLS_SEGMENT_PATH, FRP_STREAM_PORT, FRP_API_PORT, AGENT_API_KEY, PET_NAME, SITE_NAME). No changes needed.
- Updated `apps/agent/deploy/config.example.toml`: Replaced Story 1.1 field names with architecture-spec field names. Key changes: `fps`→`framerate`, `device`/`bitrate`/`segment_duration` removed, added `codec`/`hflip`/`vflip`/`output_port`; `token`→`auth_token`; removed `local_port`/`remote_port` from `[frp]` root, added `[frp.stream]` (remote_port=11935) and `[frp.api]` (local_port=8080, remote_port=11936) sub-sections; `[update]` replaced `repo`/`channel`/`check_on_start` with `update_url` pointing to GitHub Releases API.
- Created `apps/server/deploy/manlycam-server.service`: systemd unit with `After=network-online.target postgresql.service`, `EnvironmentFile=/etc/manlycam/server.env`, `ExecStart=/usr/bin/node dist/index.js`, `Restart=on-failure`, `RestartSec=10`, journal logging, `NoNewPrivileges=true`, `PrivateTmp=true`.

### File List

**Created:**
- apps/server/deploy/docker-compose.yml
- apps/server/deploy/Caddyfile
- apps/server/deploy/nginx.conf
- apps/server/deploy/frps.toml
- apps/server/deploy/manlycam-server.service
- apps/server/deploy/traefik/traefik.yml
- apps/server/deploy/traefik/docker-compose.yml
- apps/server/deploy/traefik/frps.toml

**Modified:**
- apps/server/.env.example (verified all 13+ env vars; added SITE_DOMAIN and ACME_EMAIL)
- apps/agent/deploy/config.example.toml (reconciled to match architecture spec field names)

### Change Log

- 2026-03-06: Created deployment reference configs — docker-compose.yml (simple), Caddyfile, nginx.conf, traefik/traefik.yml, traefik/docker-compose.yml, manlycam-server.service. Updated agent config.example.toml to match architecture field names (Story 1.4).
- 2026-03-06: Added frps service (snowdreamtech/frps:latest) to both docker-compose files; created frps.toml example config in apps/server/deploy/ and apps/server/deploy/traefik/.
- 2026-03-07: Code review fixes:
  - Added SITE_DOMAIN and ACME_EMAIL to .env.example; clarified variable usage and defaults
  - Fixed nginx.conf hardcoded domain (changed to `server_name _` with setup comment)
  - Improved traefik.yml ACME email warning and documentation
  - Updated docker-compose.yml usage instructions to include frps.toml setup steps
  - Updated traefik/docker-compose.yml usage instructions with all required edits (traefik.yml email, frps.toml token, env vars)
  - Improved Caddyfile comments for bare-metal vs Docker clarity
  - Enhanced frps.toml documentation (client vs server tunnel definitions, security note)
  - Fixed story File List (removed duplicates, clarified created vs modified files)
  - Added Task 8 to formally document frps.toml creation and configuration
