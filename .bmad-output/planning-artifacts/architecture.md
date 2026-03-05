---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-03-05'
inputDocuments:
  - .bmad-output/planning-artifacts/product-brief-ManlyCam-2026-03-04.md
  - .bmad-output/planning-artifacts/prd.md
  - .bmad-output/planning-artifacts/ux-design-specification.md
workflowType: 'architecture'
project_name: 'ManlyCam'
user_name: 'Caleb'
date: '2026-03-05'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements (55 total across 8 categories):**

| Category | FRs | Architectural Weight |
|---|---|---|
| Authentication & Access Control | FR1–FR8 | High — Google OAuth, allowlist enforcement, session management |
| Stream & State Management | FR9–FR15 | High — 4-state machine, admin toggle, real-time state broadcast |
| Chat | FR16–FR25 | High — WebSocket delivery, persistence, unread state, markdown, infinite scroll |
| Moderation | FR26–FR31 | Medium — role-gated actions, immediate session effect, audit log |
| Role & User Management | FR32–FR40 | Medium — 4-tier hierarchy, CLI-only admin assignment, custom labels/colors |
| Allowlist & Blocklist Management | FR41–FR44 | Medium — real-time enforcement on active sessions |
| IoT Agent & Infrastructure | FR45–FR51 | High — frp tunnel lifecycle, systemd, cross-compiled binary, captive portal |
| Platform & Developer Operations | FR52–FR55 | Medium — SPA constraint, tunnel-drop handling, CI/CD, deploy-time config |

**Non-Functional Requirements:**
- **Performance (NFR1–3):** Minimize stream latency at all layers; no artificial buffering; WebSocket delivery bounded only by network conditions
- **Security (NFR4–9):** TLS everywhere; JWT for session auth; server-side allowlist/role enforcement; immediate session revocation via WebSocket; binary contains no credentials; audit log append-only
- **Reliability (NFR10–13):** systemd restart-on-failure on Pi; upstream handles tunnel-drop gracefully; 10–20 concurrent viewers at upstream without Pi involvement; degraded-but-live always preferred
- **Data (NFR14–16):** Chat and audit log retained indefinitely; soft-delete only; no user-initiated permanent deletion

**Scale & Complexity:**

- Primary domain: IoT agent + Full-stack Web (hybrid)
- Complexity level: Low–Medium
- Estimated architectural components: ~8 (Pi agent, frp layer, upstream API server, SPA client, WebSocket hub, stream relay, auth subsystem, camera control proxy)

### Technical Constraints & Dependencies

- **Hardware ceiling:** Pi Zero W 2 is fixed — no swap/upgrade. Stream encoding and WiFi are subject to its ARM constraints.
- **Single upstream outbound connection from Pi:** frp handles this; upstream bears the full concurrent viewer relay load.
- **Deploy-time configurability:** `pet_name`, `site_name`, `site_url`, OAuth credentials, DB credentials — zero hardcoded values in codebase.
- **No hardcoded credentials in CI artifacts:** Pi binary is PII-free; sensitive config lives in a restricted on-device file.
- **Browser scope:** Modern evergreen (Chrome, Firefox, Edge); Safari/iOS explicitly deprioritized.
- **Admin mobile path:** Firefox on Android — stream start/stop must be functional at `< md` breakpoint.
- **Google OAuth only:** No local auth, no other IdP. An inherent guest-access limitation acknowledged in PRD.

### Cross-Cutting Concerns Identified

1. **Real-time delivery** — WebSocket hub spans chat messages, stream state transitions, typing indicators, presence list, and immediate session revocation signals. Single connection lifecycle must handle all of these gracefully with reconnection logic.
2. **Auth/Authz enforcement** — Every API endpoint and WebSocket message must validate JWT and role. Allowlist and ban checks re-evaluated on each connection, not only at login.
3. **Stream relay pipeline** — Pi → frp stream tunnel → upstream relay → N viewer HTTP/WebSocket connections. Tunnel lifecycle changes must propagate as stream state events to all viewers without upstream crash.
4. **Deploy-time configurability** — All instance-specific values (`pet_name`, `site_name`, OAuth config, DB config) injected via environment/config at deploy time. No component references these values statically.
5. **Audit logging** — All moderation actions (message delete, mute, unmute, ban) append to an immutable audit log. This cross-cuts the moderation, chat, and user management domains.
6. **Session revocation propagation** — Ban and allowlist removal must immediately terminate the affected user's active WebSocket connection and revoke their session token — not lazily on next request.

---

## Starter Template Evaluation

### Primary Technology Domain

Dual-component hybrid: Go IoT agent (Pi) + TypeScript full-stack web (upstream server + Vue SPA)

### Architecture Component Map

| Component | Language/Runtime | Scaffold |
|---|---|---|
| `apps/agent` (Pi binary) | Go 1.24+ | `go mod init` |
| `apps/server` (Hono API + WebSocket + HLS stream transcoder + admin CLI) | Node.js + TypeScript + Hono | `pnpm create hono@latest apps/server --template nodejs` |
| `apps/web` (Vue SPA) | TypeScript + Vue 3 + Vite 6 | `pnpm create vite@latest apps/web -- --template vue-ts` |
| `packages/types` (shared TS types) | TypeScript | Manual |

### Monorepo Structure

```
manlycam/
├── pnpm-workspace.yaml
├── package.json
├── .github/
│   └── workflows/
│       ├── agent-ci.yml            # triggered on apps/agent/**
│       ├── server-ci.yml           # triggered on apps/server/**
│       ├── web-ci.yml              # triggered on apps/web/**
│       └── types-ci.yml            # triggered on packages/types/**
├── apps/
│   ├── agent/
│   ├── server/
│   │   ├── deploy/
│   │   │   ├── manlycam-server.service   # systemd unit (bare-metal)
│   │   │   ├── Caddyfile                 # Caddy reverse proxy + auto TLS
│   │   │   ├── nginx.conf                # nginx reverse proxy config
│   │   │   ├── traefik/
│   │   │   │   ├── docker-compose.yml    # Traefik + server + postgres
│   │   │   │   └── traefik.yml           # Traefik static config
│   │   │   └── docker-compose.yml        # Simple: server + postgres (no proxy)
│   │   └── Dockerfile              # Node.js + ffmpeg
│   └── web/
│       └── Dockerfile              # nginx:alpine serving dist/
└── packages/
    └── types/
```

### Selected Stack

#### SPA: Vite 6 + Vue 3 + TypeScript

```bash
pnpm create vite@latest apps/web -- --template vue-ts
cd apps/web
pnpm add -D tailwindcss@3 postcss autoprefixer
pnpm dlx shadcn-vue@latest init
pnpm add splitpanes @vueuse/core
pnpm add hls.js
```

**Architectural decisions:**
- Bundler: Vite 6 with `@vitejs/plugin-vue`; static SPA output (`dist/`)
- Styling: Tailwind v3 + shadcn-vue CSS variable theming; dark mode via `.dark` class
  - **Note:** Tailwind v3 pinned — shadcn-vue's Vue port does not yet have stable v4 support. Upgrade to Tailwind v4 is deferred until shadcn-vue formally ships v4; no architectural change required when upgrading.
- Component base: shadcn-vue (Radix Vue primitives, copy-into-repo)
- State: Vue 3 Composition API + `@vueuse/core`; `useLocalStorage` for sidebar persistence; no Pinia needed at this scale
- Resizable panels: `splitpanes` via shadcn-vue `Resizable`
- Stream playback: `hls.js` — handles HLS `.m3u8` consumption; native HLS used where browser supports it
- **Docker:** `apps/web/Dockerfile` — Vite build → `nginx:alpine` serving `dist/`

#### Backend: Hono 4 + Node.js + TypeScript

```bash
pnpm create hono@latest apps/server --template nodejs
cd apps/server
pnpm add @prisma/client prisma @hono/node-server
```

**Architectural decisions:**
- Routing: Hono route groups — `/auth`, `/stream`, `/chat`, `/users`, `/camera`
- WebSocket: `hono/ws` built-in; in-process `EventEmitter` for fan-out (single instance — appropriate for 10–20 concurrent viewers)
- ORM: Prisma 6 + PostgreSQL
- Auth: Google OAuth → JWT → validated on every request and WS upgrade
- **Stream relay: ffmpeg (MVP)** — Pi sends H.264 MPEG-TS via frp stream tunnel; upstream ffmpeg transcodes to HLS (2s segments, 5-segment rolling window); Hono serves `.m3u8` + `.ts` segments. MVP: single bitrate at source resolution. Future: multi-bitrate ABR variants (additive — ffmpeg already in place).
- Admin CLI: `apps/server/src/cli/` — same Prisma client, no separate deployment
- SPA serving: Hono static middleware serves `apps/web/dist/` (single process); reverse proxy handles it in Docker deployments
- **Docker:** `apps/server/Dockerfile` — Node.js base + `ffmpeg` apt package; Prisma generate at build time
- Environment config: all instance values from env (`PET_NAME`, `SITE_NAME`, `SITE_URL`, OAuth creds, `DATABASE_URL`) — zero hardcoded values

**Deployment reference configs** (`apps/server/deploy/`):

| File | Purpose |
|---|---|
| `manlycam-server.service` | systemd unit — bare-metal / single VPS without Docker |
| `Caddyfile` | Caddy reverse proxy — TLS via Let's Encrypt, proxies `/api` + `/ws`, serves `dist/` |
| `nginx.conf` | nginx reverse proxy — TLS termination, static SPA serving, proxy to Hono |
| `docker-compose.yml` | Simple Docker deployment: `server` + `postgres` (TLS handled externally or via host proxy) |
| `traefik/docker-compose.yml` | Traefik deployment: Docker-native auto TLS via Let's Encrypt, label-based config + `server` + `postgres` |
| `traefik/traefik.yml` | Traefik static config — entrypoints, ACME resolver |

**Production topology (all variants):**
```
[Caddy | nginx | Traefik]
  → TLS termination
  → serves apps/web/dist/ (static SPA)
  → proxies /api + /ws to → [1× Hono server (+ ffmpeg)]
                                        ↓
                                  [PostgreSQL]
```

#### Pi Agent: Go 1.24

```bash
mkdir apps/agent && cd apps/agent
go mod init github.com/zikeji/ManlyCam/apps/agent
go get github.com/spf13/cobra
```

**Pi agent responsibilities:**
- **Camera pipeline:** Launch and supervise `rpicam-vid` subprocess; pipe H.264 MPEG-TS output into frp stream tunnel → upstream ffmpeg
- **Camera control:** Receive v4l2-ctl commands from upstream via frp API tunnel; apply to camera subprocess in real time
- **frp client:** Maintain two persistent tunnels (stream proxy + API proxy) with auto-reconnect on drop
- **Captive portal:** WiFi config portal when no known network reachable on boot
- **Self-update:** `manlycam-agent --self-update` — compares running version against latest release at configured `update_url` (defaults to this repo's GitHub Releases API, TBD); overridable in `/etc/manlycam/config.toml`; downloads ARM artifact, replaces binary, restarts systemd service
- Managed by systemd with restart-on-failure; config at `/etc/manlycam/config.toml` — never in binary

### CI/CD Strategy

Path-filtered GitHub Actions — each component releases independently on merge to `main`.

| Workflow | Path filter | Steps |
|---|---|---|
| `agent-ci.yml` | `apps/agent/**` | go vet, go test, cross-compile (`GOOS=linux GOARCH=arm GOARM=7`), create GitHub Release (semver — required for `--self-update` version comparison) |
| `server-ci.yml` | `apps/server/**` | lint (ESLint), typecheck (tsc --noEmit), test (Vitest), build Docker image (Node.js + ffmpeg), push to registry, rolling deploy |
| `web-ci.yml` | `apps/web/**` | lint, typecheck, test (Vitest), Vite build, build Docker image, push to registry, rolling deploy |
| `types-ci.yml` | `packages/types/**` | typecheck only |

- **Server and web:** rolling — image tagged with commit SHA + `latest`; no semver
- **Agent:** semver tags — required for `--self-update` comparison

### Future Architectural Seams

- **Horizontal scaling + Redis fan-out:** Single Hono instance is appropriate for this product's scale (10–20 concurrent viewers). If load ever meaningfully exceeds single-instance capacity, Redis pub/sub (`ioredis`) is the correct WebSocket fan-out mechanism to introduce — the in-process `EventEmitter` pattern is a direct seam for this swap.
- **ffmpeg multi-bitrate ABR:** MVP serves single HLS stream at source resolution. Future: additional output variants (720p, 480p) with adaptive bitrate playlist. ffmpeg already in place; adding variants is purely additive.
- **MQTT for Pi↔server messaging:** frp API proxy handles camera control at MVP. MQTT is a future alternative for IoT-pattern Pi↔server command messaging, decoupling camera control from frp API tunnel health.

### Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| SPA bundler | Vite 6 | SPA-first, fast HMR, native Vue |
| UI framework | Vue 3 (Composition API) | Caleb's preference; Vite-native |
| Component system | shadcn-vue (Radix Vue) | Same CSS variable contract as UX spec |
| CSS | Tailwind v3 + CSS variables | shadcn-vue theming; dark mode via `.dark`; v4 upgrade deferred until shadcn-vue ships v4 support |
| Resizable panels | `splitpanes` via shadcn-vue | Vue-native equivalent |
| State management | Vue 3 Composition API + `@vueuse/core` | No Pinia needed at this scale |
| Stream playback | `hls.js` | HLS client; native HLS fallback |
| Backend framework | Hono 4 | TypeScript-native, minimal, excellent WS |
| ORM | Prisma 6 | TypeScript schema + migrations |
| Database | PostgreSQL | Relational: users, roles, chat, audit log |
| WS fan-out | In-process EventEmitter | Single instance; appropriate for 10–20 viewers; Redis seam documented |
| Stream transcoding | ffmpeg → HLS | Pi sends H.264; upstream transcodes; single bitrate MVP |
| Admin CLI | Node.js in `apps/server/src/cli/` | Shared Prisma client; no separate deploy |
| Pi agent language | Go 1.24 | ARM cross-compile, single binary, systemd |
| Pi self-update | `manlycam-agent --self-update` | Bundled in agent; config-driven update URL |
| Pi camera pipeline | `rpicam-vid` subprocess → frp → ffmpeg | Agent supervises camera; upstream transcodes |
| Containerisation | Docker (server + web) | Rolling deploy via CI/CD |
| Reverse proxy options | Caddy, nginx, Traefik (all in `deploy/`) | Traefik for Docker-native; Caddy for simplicity; nginx for familiarity |
| CI/CD | GitHub Actions, path-filtered | Independent release cycles; agent semver, server/web rolling |
| Monorepo | pnpm workspaces | Minimal tooling |
| Shared types | `packages/types` | WS shapes, role enums, stream state |

**Note:** Monorepo initialization and project scaffold creation should be the first implementation story.

---

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Session management → DB-backed sessions with `users.banned_at` flag for persistent bans
- Allowlist policy → registration-only gate (first login); returning users bypass allowlist check
- WebSocket message envelope → discriminated union in `packages/types`
- HLS segment storage → configurable via `HLS_SEGMENT_PATH` env var (default `/tmp/hls`; tmpfs/ramdisk recommended)
- Camera stream configuration → fully driven by `config.toml` on Pi; agent builds `rpicam-vid` command from config
- ID strategy → ULIDs (`CHAR(26)`), application-generated server-side via `ulidx` monotonic factory (not DB-generated)
- Chat history pagination → keyset/cursor-based (`before={ulid}`, `limit`, `hasMore`)

**Important Decisions (Shape Architecture):**
- Google OAuth flow → server-side callback
- Camera control chain → HTTP through frp API proxy
- Vue Router → included (history mode); auth-aware root `/`: no session = render LoginView, approved = render app, pending → redirect `/rejected`, banned → redirect `/banned`
- Logging + observability → pino + Grafana Cloud (Loki + Prometheus) in MVP

**Deferred Decisions (Post-MVP):**
- E2E testing (Playwright)
- Sentry / external error tracking
- Redis fan-out (only if scaling horizontally)
- Multi-bitrate HLS ABR

### Data Architecture

**ID Strategy: ULIDs — application-generated, server-side only**
- All primary keys use ULID (`CHAR(26)`) — time-ordered, lexicographically sortable, URL-safe, 26 chars (no hyphens)
- Generated server-side in `apps/server` using `ulidx` with `monotonicFactory()` — guarantees strict ordering even within the same millisecond
- Prisma schema: `id String @id @db.Char(26)` on all models; no DB default — always set in service layer before `create()`
- The Pi agent does not generate IDs — it has no DB connection; all record creation happens on the server

**Session Management: DB-backed sessions**
- `sessions` table: `id CHAR(26)`, `user_id CHAR(26)`, `created_at`, `expires_at`; `session_id` stored in httpOnly cookie
- **On ban (two atomic effects in single DB transaction):**
  1. Set `users.banned_at` timestamp — blocks all future login attempts at registration/login gate
  2. Delete all active `sessions` rows for that user — immediately revokes all live connections
- WS hub detects missing session on next heartbeat/message → sends `session:revoked { reason: 'banned' }` → client redirects to `/banned`
- On every request/WS upgrade: session lookup + `users.banned_at IS NULL` check — always live, never cached
- Cookie flags: `httpOnly`, `SameSite=Strict`, `Secure` (production)

**Allowlist Policy: Registration gate only**
- Allowlist gates first login (new user registration) only — existing `users` row bypasses allowlist entirely
- Login flow:
  1. Google OAuth callback received; look up user by Google `sub` ID
  2. **Existing user:** check `banned_at` only → create session or redirect to `/banned`
  3. **New user:** check allowlist (domain or individual email) → no match: reject, no account created; match: create user record + session
- Allowlist changes only affect future new registrations, not existing users

**HLS Segment Storage: Configurable path**
- ffmpeg writes `.m3u8` + `.ts` segments to `HLS_SEGMENT_PATH` env var (default `/tmp/hls`)
- Recommended production setup: tmpfs ramdisk mount at `HLS_SEGMENT_PATH` — eliminates disk wear, lowest I/O latency
- Hono serves `HLS_SEGMENT_PATH` as static directory with cache TTL matching segment duration (2s)
- Segments are ephemeral — cleared on restart, no persistence needed

**Chat Message Schema:**
```sql
messages (
  id            CHAR(26) PRIMARY KEY,            -- ULID, server-generated
  user_id       CHAR(26) NOT NULL REFERENCES users(id),
  content       TEXT NOT NULL,
  edit_history  JSONB,                            -- null = never edited; array of {content, edited_at}
  updated_at    TIMESTAMPTZ,                      -- set on edit; null if never edited
  deleted_at    TIMESTAMPTZ,                      -- soft delete timestamp
  deleted_by    CHAR(26) REFERENCES users(id),    -- who deleted (differs from user_id on mod deletions)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```
- `edit_history IS NOT NULL` ↔ message has been edited; no separate `is_edited` flag
- `deleted_by != user_id` identifies moderator-initiated deletions for audit purposes
- JSONB `edit_history` is append-only from the application layer

**Chat History Pagination: Keyset (cursor-based)**
```
GET /api/chat/history?limit=50&before={ulid}
```
- No `before` param → returns latest `limit` messages (initial load)
- `before={ulid}` → returns `limit` messages older than that ULID, ordered by ULID descending
- Response: `{ messages: ChatMessage[], hasMore: boolean }`
- `hasMore: false` when fewer than `limit` results returned
- ULID lexicographic order = chronological order — no secondary time index needed
- New messages always arrive via WebSocket; REST endpoint is backward-history-only

### Authentication & Security

**Google OAuth Flow: Server-side callback**
- Browser → Google OAuth → `GET /auth/google/callback` on Hono
- Server exchanges code, upserts user record (name + avatar — if changed, broadcasts `user:update` WS message), applies login flow, sets `session_id` cookie
- SPA never handles OAuth tokens — entirely server-side
- `openid email profile` scopes; gravatar fallback if no Google avatar

**Ban + Session Revocation UX:**
- `session:revoked { reason: 'banned' | 'removed' }` sent to affected client's WS connection
- Client receives → Vue Router pushes to `/banned` (styled, human-readable explanation; no session required to view)
- 401 from REST endpoints with `reason` in body → same `/banned` redirect

**Security Middleware Stack (Hono):**
- `requireSession`: session lookup → `banned_at` check → 401 if missing/expired/banned
- `requireRole(roles[])`: role check layered on top of session
- CORS: locked to `SITE_URL` env var

### API & Communication Patterns

**REST Surface (slim — most state travels via WebSocket):**
- Auth: `/api/auth/google`, `/api/auth/callback`, `/api/auth/logout`
- Initial page load: `GET /api/me`, `GET /api/chat/history`, `GET /api/stream/state`
- Camera controls: `POST /api/camera/control`
- Admin write operations: ban, mute, allowlist changes, role assignment (from web UI or CLI)

**WebSocket Message Envelope (discriminated union — `packages/types/ws.ts`):**
```typescript
type WsMessage =
  | { type: 'chat:message';        payload: ChatMessage }
  | { type: 'chat:edit';           payload: ChatEdit }
  | { type: 'chat:delete';         payload: { messageId: string } }
  | { type: 'stream:state';        payload: StreamState }
  | { type: 'presence:join';       payload: UserPresence }
  | { type: 'presence:leave';      payload: { userId: string } }
  | { type: 'typing:start';        payload: { userId: string; displayName: string } }
  | { type: 'typing:stop';         payload: { userId: string } }
  | { type: 'session:revoked';     payload: { reason: 'banned' | 'removed' } }
  | { type: 'moderation:muted';    payload: { userId: string } }
  | { type: 'moderation:unmuted';  payload: { userId: string } }
  | { type: 'user:update';         payload: UserProfile }  -- profile change: name, avatar, label, tag color, role
```

**Camera Control API Chain:**
- Web UI → `POST /api/camera/control { control: string, value: number | string }`
- Hono (Admin/Moderator auth) → HTTP through frp API proxy → Pi agent local HTTP server
- Pi agent applies v4l2-ctl to `rpicam-vid` subprocess
- Response: `{ ok: true }` or `{ ok: false, error: string }`

**Error Response Standard:**
```typescript
{ error: { code: string, message: string } }
```

### Pi Agent: Camera Stream Configuration

Single binary, single systemd unit, single config file. All `rpicam-vid` parameters in `config.toml`.

**`/etc/manlycam/config.toml`:**
```toml
[stream]
width       = 2328
height      = 1748
framerate   = 30
codec       = "mjpeg"
hflip       = true
vflip       = true
output_port = 5000

[frp]
server_addr = "upstream.example.com"
server_port = 7000
auth_token  = "secret"

[update]
update_url  = "https://api.github.com/repos/zikeji/ManlyCam/releases/latest"
```

Agent constructs and supervises:
```
rpicam-vid -t 0 --width {width} --height {height} --framerate {framerate} \
  --codec {codec} [--hflip] [--vflip] --inline --listen \
  -o tcp://0.0.0.0:{output_port}
```

**Agent testing scope:**
- `go test`: config parsing, `rpicam-vid` command-building from config (assert constructed args), version comparison, captive portal WiFi detection logic
- Camera pipeline integration (actual `rpicam-vid` + frp) = hardware-only, on-device

### Frontend Architecture

**Vue Router: History mode**
```
/           → auth-aware entry point (no separate login route)
              • No session   → render LoginView (Google sign-in CTA)
              • Session + pending  → redirect /rejected
              • Session + banned   → redirect /banned
              • Session + approved → render main app (StreamPlayer + ChatPanel + AdminPanel if admin)
/rejected   → post-OAuth rejection — not on allowlist; no session required
/banned     → session revoked — banned or removed; no session required
```
Hono serves SPA catch-all (`/*` → `index.html`) for history mode.

**Router navigation guard — `beforeEach`:**
```typescript
// router/index.ts
router.beforeEach(async (to) => {
  if (to.path === '/rejected' || to.path === '/banned') return true  // always public

  // For '/', check session state
  const res = await fetch('/api/me', { credentials: 'include' })
  if (res.ok) {
    const user = await res.json()
    if (user.bannedAt) return '/banned'
    if (user.role === 'pending') return '/rejected'
    return true  // approved — render app
  }
  const body = await res.json().catch(() => ({}))
  if (body?.error?.code === 'BANNED') return '/banned'
  return true  // no session — render LoginView (guest state, same route)
})
```
`LoginView.vue` and `AppView` (stream + chat + admin) are both rendered within the `/` route — `App.vue` checks `useAuth().user` to switch between them. The `WS session:revoked` message triggers an immediate re-evaluation of auth state; the router guard fires on next navigation as a backstop.

**API Client:** `useApi` composable — wraps fetch, attaches session cookie, handles 401 with reason-aware redirect. No external HTTP client library.

**WebSocket Client:** `@vueuse/core` `useWebSocket` wrapped in `useStream` composable. Single connection per authenticated session, exponential backoff reconnect, typed dispatch on `message.type`, `send(msg: WsMessage)` typed to discriminated union.

### Infrastructure & Observability (MVP)

**Logging + Metrics: Grafana Cloud (Loki + Prometheus)**

*Server (`apps/server`):*
- `pino` — structured JSON logs to stdout; Hono pino middleware for request logging
- `prom-client` — `GET /metrics` scrape endpoint; tracks: active WS connections, stream state, HLS segment generation rate, request durations
- Grafana Cloud agent ships stdout → Loki; scrapes `/metrics` → Prometheus

*Agent (`apps/agent`):*
- `log/slog` (Go stdlib) — structured JSON to stdout → systemd journal → Grafana agent
- `prometheus/client_golang` — local metrics port: frp tunnel uptime, camera subprocess status, reconnect count, last self-update check
- Grafana agent on upstream server scrapes Pi metrics via frp API tunnel

**Testing:**
- Server: Vitest (unit + integration); Prisma test DB
- Web: Vitest + Vue Test Utils
- Agent: `go test` (config parsing, command-building, version comparison); camera pipeline = on-device only
- E2E: post-MVP

### Decision Impact Analysis

**Implementation Sequence:**
1. Monorepo scaffold + `packages/types` (WS envelope, role enums, stream state, ULID helpers)
2. Prisma schema (users, sessions, allowlist, roles, messages, audit_log) — all IDs `CHAR(26)`
3. Auth flow (Google OAuth callback, registration allowlist gate, session creation, middleware)
4. WebSocket hub (connection registry, in-process EventEmitter, session revocation signal)
5. Stream relay (frp stream tunnel ingestion, ffmpeg HLS transcoding, segment serving)
6. Chat API + WS delivery (history endpoint with keyset pagination, CRUD, JSONB edit history)
7. Camera control proxy (frp API tunnel, v4l2-ctl command chain)
8. Vue SPA shell (router, auth guard, WS composable, `hls.js` stream player)
9. Chat UI (message list, input, typing indicator, unread badge, presence list)
10. Admin CLI + observability (pino, prom-client, Grafana agent config)

**Cross-Component Dependencies:**
- `packages/types` WS envelope and ULID type must exist before server WS hub or Vue WS composable
- Session middleware is a dependency for every protected Hono route — implement before any protected route
- ULID generation utility (`monotonicFactory()` wrapper) must be in place before any DB writes
- frp config in `config.toml` must be correct before stream relay or camera control can be tested end-to-end
- `HLS_SEGMENT_PATH` must be writable by both ffmpeg and Hono static middleware
- Ban must atomically set `banned_at` + delete sessions in a single Prisma transaction

---

## Implementation Patterns & Consistency Rules

### Critical Conflict Points (14 identified)

Database naming, API endpoint style and plurality, Vue file conventions, export style, directory structure (server + web), API response format, JSON field conventions, date/timezone handling, timestamp column conventions, WS connection registry shape, Prisma client usage, ULID generation, error propagation, Vue composable conventions.

### Naming Patterns

**Database (Prisma schema):**
- Model names: PascalCase (`User`, `Message`, `Session`, `AuditLog`)
- Table names: snake_case always via explicit `@@map("users")`, `@@map("messages")` — never rely on Prisma default casing
- Column names: camelCase in Prisma, snake_case in DB via explicit `@map("user_id")` on all FK and multi-word fields
- No DB default for `id` — always set in service layer via `ulid()`
- Timestamp columns: `createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updatedAt TIMESTAMPTZ` (nullable — set on mutation), `deletedAt TIMESTAMPTZ` (nullable — null means not deleted)

**REST API Endpoints:**
- Always plural resource nouns: `/api/users`, `/api/messages`, `/api/sessions`
- Current user: `GET /api/me` — not `/api/user` or `/api/users/me`
- Resource by ID: `GET /api/users/:userId`
- Actions as sub-resources: `POST /api/users/:userId/ban`, `POST /api/users/:userId/mute`
- Route file names: singular domain noun — `users.ts`, `stream.ts`, `chat.ts`, `camera.ts`, `auth.ts`
- Query params: camelCase — `?before=`, `?limit=`, `?userId=`

**Vue files:**
- Component files: PascalCase — `StreamPlayer.vue`, `ChatMessage.vue`, `HoverOverlay.vue`
- Composable files: camelCase with `use` prefix — `useStream.ts`, `useApi.ts`, `useAuth.ts`
- Test files: `*.test.ts` co-located with source — `StreamPlayer.test.ts`, `users.test.ts`

**TypeScript:**
- Named exports only — no `export default` anywhere in the codebase
- Object shapes: `interface`; union types and primitives: `type`
- Enum-like constants: `const` object with `as const` — no TypeScript `enum` keyword

### Structure Patterns

**Server (`apps/server/src/`):**
```
routes/        # Hono route groups — one file per domain
services/      # Business logic — called by routes; call db/ and ws/
db/            # Prisma client singleton (client.ts) + schema.prisma
ws/            # WebSocket hub, connection registry, EventEmitter fan-out
stream/        # ffmpeg process management, HLS segment lifecycle
cli/           # Admin CLI entrypoint and commands
middleware/    # requireSession, requireRole, agentAuth (X-Agent-Key validation), pino logger, error handler
lib/           # Shared utilities: ulid.ts, errors.ts
types/         # Re-exports from packages/types + server-internal types
```

**Web (`apps/web/src/`):**
```
components/      # Generic shared UI (shadcn-vue wrappers, layout primitives)
features/
  stream/        # StreamPlayer, HoverOverlay, StateOverlay, StreamStatusBadge, ProfileAnchor
  chat/          # ChatMessage, TypingIndicator, ChatInput, ChatSidebar, SidebarCollapseButton
  admin/         # CameraControls, UserList, AdminActions
composables/     # Global: useApi.ts, useStream.ts, useAuth.ts
router/          # index.ts (Vue Router config + beforeEach guard)
lib/             # Client utilities
types/           # Re-exports from packages/types
```

**Test location:** Co-located `*.test.ts` — no `__tests__` directories.

### Format Patterns

**API success responses — direct (no wrapper):**
```typescript
// Single resource
{ id: '01JPXYZ...', displayName: 'Jordan', role: 'viewer' }
// Collection with pagination
{ messages: [...], hasMore: true }
// Simple confirmation
{ ok: true }
```

**API error responses — always wrapped:**
```typescript
{ error: { code: 'UNAUTHORIZED', message: 'Session expired or invalid' } }
// Standard codes: UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR, INTERNAL_ERROR
```

**JSON field naming: camelCase throughout** — Prisma default; no snake_case transformation in API responses.

**Dates and timestamps:**
- PostgreSQL storage: `TIMESTAMPTZ` for all timestamp columns — stores UTC internally; never `TIMESTAMP WITHOUT TIME ZONE`
- API responses: ISO 8601 UTC strings — `"2026-03-05T14:23:00.000Z"`; never Unix timestamps
- Client-side: receives UTC, formats to local timezone using browser `Intl.DateTimeFormat`; no per-user timezone stored; no server-side timezone conversion

**Absent optional fields: explicit `null`** — never omit a key or return `undefined` in API responses.

### Communication Patterns

**WebSocket connection registry:**
```typescript
// ws/registry.ts
type Connection = { ws: WSContext; userId: string; sessionId: string }
const connections = new Map<string, Connection>()  // keyed by connectionId (ULID at upgrade time)

export const broadcast = (msg: WsMessage) => { /* all connections */ }
export const broadcastTo = (userId: string, msg: WsMessage) => { /* user's all tabs */ }
export const broadcastExcept = (connectionId: string, msg: WsMessage) => { /* all except sender */ }
```

**WebSocket client — singleton composable:**
- `useStream` provided at app root via `provide()`, injected in components via `inject()`
- Components never call WS `send()` directly — use typed action functions: `sendChatMessage(content)`, `sendTypingStart()`, `sendTypingStop()`
- Incoming messages dispatched by `type` inside `useStream`; components bind to reactive state

**Typing indicator timing:** 400ms debounce before `typing:start` fires; clears 2s after last keystroke or immediately on send.

### Process Patterns

**Prisma:**
- Single client instance exported from `src/db/client.ts` — never `new PrismaClient()` in routes or services
- All IDs set in service layer before create: `const id = ulid()` then `prisma.model.create({ data: { id, ... } })`
- Multi-table atomic operations always use `prisma.$transaction()` — ban (set `banned_at` + delete sessions) is the canonical example

**ULID generation — server only:**
```typescript
// src/lib/ulid.ts — single export, always import from here
import { monotonicFactory } from 'ulidx'
export const ulid = monotonicFactory()
```

**Server error handling:**
- Services throw: `new AppError('FORBIDDEN', 'Insufficient role')`
- Routes never catch — Hono error handler middleware at app root catches all `AppError` + unknown errors
- Unknown errors: logged via pino at `error` level; returned to client as `INTERNAL_ERROR` with generic message — no stack traces or Prisma internals exposed

**Vue global error handler:**
```typescript
// main.ts — registered once at app bootstrap
app.config.errorHandler = (err, instance, info) => {
  logger.error({ err, info }, 'Unhandled Vue error')
  // Optionally: push to /banned or show toast for specific error codes
}
```
Catches errors from component lifecycle hooks, watchers, and event handlers that are not caught locally. Does not replace `try/catch` in composables — composables handle their own async errors and update reactive state accordingly.

**Vue auth guard:**
```typescript
// router/index.ts — beforeEach (see Frontend Architecture section for full implementation)
// GET /api/me → 200 + approved    : allow, render main app
//               200 + pending     : redirect /rejected
//               200 + bannedAt    : redirect /banned
//               4xx (no session)  : allow, render LoginView (guest state at /)
//               4xx { BANNED }    : redirect /banned
```
`WS session:revoked` event in `useWebSocket.ts` handles real-time revocation: calls `router.push('/banned')` or `router.push('/')` immediately. Router guard fires on next navigation as a backstop.

**Vue composable return shape:**
```typescript
export const useStream = () => {
  const state = reactive({ ... })
  const sendChatMessage = (content: string) => { ... }
  return { state, sendChatMessage, sendTypingStart, sendTypingStop }
}
```

### Enforcement Guidelines

**All AI agents MUST:**
- Import `ulid` from `src/lib/ulid.ts` — never from `ulidx` directly
- Import Prisma client from `src/db/client.ts` — never instantiate directly
- Use named exports only — no `export default`
- Use `*.test.ts` co-located — never create `__tests__/` directories
- Return `null` (not `undefined`, not omit) for absent optional fields in API responses
- Use `AppError` for all thrown errors in service layer
- Explicitly `@@map` and `@map` all Prisma models and FK columns to snake_case
- Generate IDs in service layer before Prisma `create()` — never rely on DB default
- Use `TIMESTAMPTZ` for all timestamp columns — never `TIMESTAMP`
- Plural nouns for all REST collection endpoints; `GET /api/me` for current user

**Anti-patterns (never do these):**
- `new PrismaClient()` outside `src/db/client.ts`
- `export default` on any module
- `ulid()` imported from `ulidx` directly
- `__tests__/` directories
- Exposing Prisma error codes or stack traces in API error responses
- Components calling WS `send()` directly
- `enum` keyword — use `const` + `as const` instead
- Offset-based pagination anywhere
- Unix timestamps in API responses
- `TIMESTAMP WITHOUT TIME ZONE` columns in Postgres
- `/api/user` (singular current-user route) — use `/api/me`

---

## Project Structure & Boundaries

### Complete Monorepo Tree

```
manlycam/
├── .github/
│   └── workflows/
│       ├── agent.yml            # Go build + GitHub Release on semver tag
│       ├── server.yml           # Docker build + push on apps/server/** change
│       └── web.yml              # Docker build + push on apps/web/** change
├── apps/
│   ├── agent/
│   │   ├── cmd/
│   │   │   └── root.go          # cobra root command + persistent flags
│   │   ├── internal/
│   │   │   ├── config/
│   │   │   │   ├── config.go    # load/validate config from file + env
│   │   │   │   └── config_test.go
│   │   │   ├── camera/
│   │   │   │   ├── pipeline.go  # rpicam-vid subprocess lifecycle manager
│   │   │   │   └── pipeline_test.go
│   │   │   ├── tunnel/
│   │   │   │   ├── frp.go       # frp client: stream proxy + API proxy
│   │   │   │   └── frp_test.go
│   │   │   ├── portal/
│   │   │   │   ├── portal.go    # captive portal HTTP server
│   │   │   │   └── portal_test.go
│   │   │   └── updater/
│   │   │       ├── updater.go   # self-update: version compare → download ARM artifact → restart
│   │   │       └── updater_test.go
│   │   ├── deploy/
│   │   │   ├── manlycam-agent.service   # systemd unit file
│   │   │   └── config.example.yaml     # annotated config template
│   │   ├── go.mod
│   │   ├── go.sum
│   │   └── main.go
│   │
│   ├── server/
│   │   ├── prisma/
│   │   │   ├── schema.prisma    # User, Session, ChatMessage, AllowlistEntry models
│   │   │   └── migrations/      # generated migration history
│   │   ├── deploy/
│   │   │   ├── Caddyfile        # Caddy reverse proxy reference config
│   │   │   ├── nginx.conf       # nginx reverse proxy reference config
│   │   │   ├── traefik/
│   │   │   │   └── traefik.yml  # Traefik static + dynamic config reference
│   │   │   └── docker-compose.yml  # server + postgres + (optional) monitoring
│   │   ├── src/
│   │   │   ├── index.ts         # entrypoint: create Hono app, mount middleware, start server
│   │   │   ├── app.ts           # Hono app factory (testable, no side-effects)
│   │   │   ├── env.ts           # validated env vars via zod (single import point)
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts      # session cookie → ctx.var.user injection
│   │   │   │   ├── requireAuth.ts  # 401 if no session
│   │   │   │   ├── requireAdmin.ts # 403 if not admin
│   │   │   │   ├── agentAuth.ts # validates X-Agent-Key header for Pi agent routes
│   │   │   │   └── logger.ts    # pino request logger middleware
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts      # GET /api/auth/google, GET /api/auth/google/callback, POST /api/auth/logout
│   │   │   │   ├── me.ts        # GET /api/me
│   │   │   │   ├── users.ts     # GET/PATCH/DELETE /api/users, GET/PATCH /api/users/:userId
│   │   │   │   ├── chat.ts      # GET /api/chat/history, DELETE /api/chat/messages/:messageId
│   │   │   │   ├── stream.ts    # GET /api/stream/status, POST /api/stream/start, POST /api/stream/stop (agentAuth on agent-facing endpoints)
│   │   │   │   ├── hls.ts       # GET /hls/:filename — serve HLS segments + playlist
│   │   │   │   ├── ws.ts        # GET /ws — hono/ws upgrade handler
│   │   │   │   ├── health.ts    # GET /api/health — liveness probe (returns { ok: true, uptime })
│   │   │   │   └── metrics.ts   # GET /metrics — prom-client Prometheus scrape endpoint
│   │   │   ├── services/
│   │   │   │   ├── authService.ts     # Google OAuth flow, session create/destroy
│   │   │   │   ├── userService.ts     # user CRUD, ban (atomic: banned_at + delete sessions)
│   │   │   │   ├── chatService.ts     # message create/edit/delete with edit_history JSONB
│   │   │   │   ├── streamService.ts   # ffmpeg process lifecycle, HLS segment management
│   │   │   │   └── metricsService.ts  # prom-client registry, counters/gauges
│   │   │   ├── db/
│   │   │   │   └── client.ts    # single PrismaClient export — only file that calls new PrismaClient()
│   │   │   ├── ws/
│   │   │   │   ├── hub.ts       # in-process EventEmitter fan-out, connected client registry
│   │   │   │   └── handlers.ts  # per-message-type handler dispatch
│   │   │   ├── stream/
│   │   │   │   └── ffmpeg.ts    # ffmpeg child process wrapper, HLS_SEGMENT_PATH config
│   │   │   ├── cli/
│   │   │   │   ├── index.ts     # CLI entrypoint (package.json bin: manlycam-admin)
│   │   │   │   └── commands/
│   │   │   │       ├── users.ts # list-users, ban-user, unban-user, add-allowlist
│   │   │   │       └── stream.ts # stream-status
│   │   │   └── lib/
│   │   │       ├── ulid.ts      # monotonicFactory() export — ONLY place that creates ULIDs
│   │   │       ├── errors.ts    # AppError class + HTTP error helpers
│   │   │       └── logger.ts    # pino logger instance
│   │   ├── .env.example
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/
│       ├── public/
│       │   └── favicon.ico
│       ├── src/
│       │   ├── main.ts          # Vue app bootstrap, router install, app.config.errorHandler global error handler
│       │   ├── App.vue          # root component: renders LoginView (guest) or main app (auth'd) based on useAuth state
│       │   ├── router/
│       │   │   └── index.ts     # Vue Router history mode: /, /rejected, /banned — beforeEach auth guard
│       │   ├── composables/
│       │   │   ├── useAuth.ts   # current user state, login/logout actions
│       │   │   ├── useWebSocket.ts  # WS connection lifecycle, reconnect, message dispatch
│       │   │   ├── useStream.ts # HLS stream status, hls.js instance management
│       │   │   └── useChat.ts   # chat messages, keyset pagination, send/edit/delete
│       │   ├── components/
│       │   │   └── ui/          # shadcn-vue generated components (Button, Input, Dialog, etc.)
│       │   ├── features/
│       │   │   ├── stream/
│       │   │   │   ├── StreamPlayer.vue   # hls.js <video> wrapper, HLS_URL prop
│       │   │   │   └── StreamStatus.vue   # live/offline indicator badge
│       │   │   ├── chat/
│       │   │   │   ├── ChatPanel.vue      # splitpanes panel, scroll container
│       │   │   │   ├── ChatMessage.vue    # single message, edit/delete actions
│       │   │   │   └── ChatInput.vue      # message compose, send on Enter
│       │   │   └── admin/
│       │   │       ├── AdminPanel.vue     # splitpanes admin panel shell
│       │   │       ├── UserList.vue       # user table with approve/ban/role actions
│       │   │       └── StreamControls.vue # start/stop stream, status display
│       │   ├── views/
│       │   │   ├── LoginView.vue    # / route (guest state): Google sign-in CTA, branding
│       │   │   ├── WatchView.vue    # / route (auth'd state): StreamPlayer + ChatPanel + (admin) AdminPanel via splitpanes
│       │   │   ├── RejectedView.vue # /rejected route: registration pending/rejected message
│       │   │   └── BannedView.vue   # /banned route: banned user message
│       │   ├── lib/
│       │   │   └── api.ts       # typed fetch wrapper (base URL, credentials: include, error throw)
│       │   └── types/
│       │       └── index.ts     # re-export from packages/types for tree-shaking
│       ├── .env.example
│       ├── Dockerfile           # build stage (Vite) → serve stage (nginx:alpine)
│       ├── index.html
│       ├── package.json
│       ├── tailwind.config.ts
│       ├── tsconfig.json
│       └── vite.config.ts
│
├── packages/
│   └── types/
│       ├── src/
│       │   ├── ws.ts            # WsMessage discriminated union (12 message types)
│       │   ├── api.ts           # shared API request/response types
│       │   └── index.ts         # barrel export
│       ├── package.json
│       └── tsconfig.json
│
├── .env.example                 # workspace-level env var documentation
├── .gitignore
├── package.json                 # pnpm workspace root
└── pnpm-workspace.yaml
```

### Architectural Boundaries

#### Pi ↔ Server Boundary

| Direction | Transport | Protocol | Details |
|---|---|---|---|
| Pi → Server (video) | frp stream tunnel | MPEG-TS over TCP | rpicam-vid stdout → frp → server port (ffmpeg ingests) |
| Pi → Server (API) | frp API tunnel | HTTPS | Agent polls `/api/stream/status`, receives commands |
| Server → Pi | HTTP via frp API tunnel | REST | Start/stop stream commands |

**Boundary rules:**
- Agent has zero direct DB access — all state read/written through server API
- Agent binary is the only process managing rpicam-vid subprocess lifecycle
- frp handles NAT traversal; server never initiates outbound TCP to Pi

#### Server ↔ SPA Boundary

| Concern | Transport | Details |
|---|---|---|
| Auth | REST + httpOnly cookie | Google OAuth callback sets `session_id` cookie |
| Data mutations | REST `/api/*` | Standard JSON request/response |
| Real-time events | WebSocket `/ws` | Discriminated union `WsMessage` type |
| HLS stream | HTTP static | `GET /hls/*.m3u8` and `GET /hls/*.ts` |
| Metrics | HTTP | `GET /metrics` — Prometheus scrape (not exposed to SPA) |
| Health | HTTP | `GET /api/health` — liveness probe for reverse proxy and docker-compose |

**Boundary rules:**
- Session cookie is httpOnly, sameSite=lax — never accessible from JS
- All REST state changes emit corresponding WebSocket event to all connected clients
- SPA never polls; all live state arrives via WebSocket

#### SPA Internal Boundary

| Layer | Responsibility | Files |
|---|---|---|
| Views | Route-level composition; auth-state switching (LoginView vs WatchView at `/`) | `src/views/*.vue` |
| Features | Domain-grouped components | `src/features/{stream,chat,admin}/` |
| UI | Stateless primitive components | `src/components/ui/` (shadcn-vue) |
| Composables | Shared reactive state + actions | `src/composables/use*.ts` |
| Lib | Pure utilities, no Vue | `src/lib/api.ts` |
| Types | Type imports only | `src/types/index.ts` → `packages/types` |

**Boundary rules:**
- Views only compose Features and UI components — no direct API calls
- Features use composables for all server communication
- UI components (`components/ui/`) are display-only, no composable imports
- `lib/api.ts` is the only file that calls `fetch()`

#### Data Boundaries

| Data Class | Owner | Storage | Access |
|---|---|---|---|
| User identity | Server | PostgreSQL `users` table | Via Prisma in services only |
| Sessions | Server | PostgreSQL `sessions` table | Via Prisma in authService only |
| Chat messages | Server | PostgreSQL `chat_messages` table + JSONB `edit_history` | Via Prisma in chatService only |
| HLS segments | Server filesystem | `HLS_SEGMENT_PATH` (default `/tmp/hls`) | Served directly via `/hls/` route |
| Agent config | Pi filesystem | `config.yaml` | Read-only by agent at startup |
| Metrics | Server in-memory | prom-client registry | Scraped by Grafana Cloud agent |

### Requirements-to-Structure Mapping

| FR Category | Files Responsible |
|---|---|
| AUTH-01–03: Google OAuth, allowlist, session | `src/routes/auth.ts`, `src/services/authService.ts`, `src/middleware/auth.ts` |
| USER-01–07: User management, roles, banning | `src/routes/users.ts`, `src/routes/me.ts`, `src/services/userService.ts`, `src/cli/commands/users.ts` |
| STREAM-01–06: Camera pipeline, HLS, controls | `apps/agent/internal/camera/pipeline.go`, `src/stream/ffmpeg.ts`, `src/routes/stream.ts`, `src/routes/hls.ts` |
| CHAT-01–06: Messages, moderation, history | `src/routes/chat.ts`, `src/services/chatService.ts`, `features/chat/` |
| REALTIME-01–04: WebSocket events, fan-out | `src/routes/ws.ts`, `src/ws/hub.ts`, `src/ws/handlers.ts`, `packages/types/src/ws.ts` |
| ADMIN-01–05: Admin panel, user controls | `features/admin/`, `src/cli/commands/users.ts` |
| TUNNEL-01–02: frp NAT traversal | `apps/agent/internal/tunnel/frp.go` |
| OBS-01–02: Logging, metrics | `src/lib/logger.ts`, `src/services/metricsService.ts`, `src/routes/metrics.ts` |

### Integration Points

#### Google OAuth
- **Entry**: `GET /api/auth/google` → redirects to Google with `client_id`, `redirect_uri`, `scope=openid email profile`
- **Callback**: `GET /api/auth/google/callback` → exchange code → fetch profile → allowlist check → upsert user → create session → set httpOnly cookie → redirect `/`
- **Config**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` in env

#### frp Stream Tunnel
- **Pi side**: frp client config: `local_port = 5000` (rpicam-vid MPEG-TS), `remote_port = {FRP_STREAM_PORT}`
- **Server side**: ffmpeg listens on `tcp://0.0.0.0:{FRP_STREAM_PORT}`, transcodes to HLS at `HLS_SEGMENT_PATH`
- **Managed by**: `apps/agent/internal/tunnel/frp.go` (starts frpc subprocess) + `apps/server/src/stream/ffmpeg.ts`

#### frp API Tunnel
- **Pi side**: frp client config: `local_port = 8080` (captive portal HTTP server), `remote_port = {FRP_API_PORT}`
- **Server side**: Hono routes accessible at `{BASE_URL}:{FRP_API_PORT}/api/stream/*` — but **frp itself is a separate process** (`frps` binary), not managed by Node.js. frp server runs independently on the upstream host and handles tunnel authentication via its own token (`frp_token` in frp config — not related to the Hono app).
- **Two distinct auth layers:**
  1. **frp tunnel auth (frpc ↔ frps):** frp's built-in `token` field in both `frpc.toml` (Pi) and `frps.toml` (server). Managed entirely within frp config — Node.js has no involvement.
  2. **Agent → Hono API auth:** When the Pi agent makes HTTP calls to Hono endpoints (stream status, heartbeat), it includes `X-Agent-Key: {AGENT_API_KEY}` header. Hono validates this in `src/middleware/agentAuth.ts` and applies it to the `/api/stream/agent/*` route group only. `AGENT_API_KEY` is a separate pre-shared secret from the frp token.
- **Agent-facing endpoints** (protected by `agentAuth.ts`):
  - `GET /api/stream/agent/status` — agent polls for start/stop commands
  - `POST /api/stream/agent/heartbeat` — agent reports camera/tunnel health
- **Admin-facing stream endpoints** (protected by `requireAdmin`):
  - `POST /api/stream/start`, `POST /api/stream/stop` — admin panel actions

#### WebSocket Fan-out
- **Upgrade**: `GET /ws` — requires valid session cookie (checked in upgrade handshake)
- **Hub**: `src/ws/hub.ts` — in-process Node.js `EventEmitter`, map of `userId → WSConnection`
- **Emit pattern**: Service layer emits typed event on EventEmitter → hub broadcasts `WsMessage` JSON to all connected clients
- **Reconnect**: Client (`useWebSocket.ts`) uses exponential backoff on close event

#### Grafana Cloud Observability
- **Logs**: pino JSON output → Grafana Cloud Loki (via alloy or promtail sidecar)
- **Metrics**: `GET /metrics` → prom-client Prometheus format → Grafana Cloud Prometheus (via scrape agent)
- **Config**: `GRAFANA_LOKI_URL`, `GRAFANA_PROM_URL`, `GRAFANA_API_KEY` in server env

### Development Workflow

#### Local Development

```bash
# Start all services (from repo root)
pnpm dev:server   # tsx watch apps/server/src/index.ts
pnpm dev:web      # vite apps/web

# Or individual package
cd apps/server && pnpm dev
cd apps/web && pnpm dev

# Agent (on Pi or cross-compile)
cd apps/agent && go run main.go

# Database
docker compose -f apps/server/deploy/docker-compose.yml up postgres -d
cd apps/server && pnpm prisma migrate dev
```

#### Environment Variables (apps/server/.env.example)

```bash
# Application
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://manlycam:password@localhost:5432/manlycam

# Session
SESSION_SECRET=change-me-in-production

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Stream
HLS_SEGMENT_PATH=/tmp/hls
FRP_STREAM_PORT=7000
FRP_API_PORT=7001
AGENT_API_KEY=change-me-in-production

# Observability (optional for local dev)
GRAFANA_LOKI_URL=
GRAFANA_PROM_URL=
GRAFANA_API_KEY=

---

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
All technology choices are mutually compatible. Vue 3 + Vite 6 + TypeScript + Tailwind v3 (pinned for shadcn-vue compatibility) form a proven combination. Hono 4 + `@hono/node-server` + `hono/ws` are designed as a coherent unit. Prisma 6 + PostgreSQL + `CHAR(26)` ULIDs are fully supported. `pino` + `prom-client` are standard Node.js observability primitives with no version conflicts. Go 1.24 + cobra is idiomatic for single ARM binary CLI tooling. `hls.js` is framework-agnostic and integrates cleanly with Vue 3 composables via `useStream`.

**Pattern Consistency:**
All naming conventions are internally consistent: snake_case DB columns (via Prisma `@@map`/`@map`), camelCase TypeScript, PascalCase Prisma models + Vue components, plural REST nouns. ULID generation is centralized to `src/lib/ulid.ts`. `new PrismaClient()` is restricted to `src/db/client.ts`. The `WsMessage` discriminated union in `packages/types/src/ws.ts` is the single source of truth for all WebSocket message shapes. All anti-patterns are explicitly documented and guarded by enforcement rules.

**Structure Alignment:**
All 8 FR categories map to specific files. Component boundaries (Views → Features → UI; composables for all server communication; `lib/api.ts` as the single `fetch()` callsite) are clearly layered with no circular import paths possible. The dual-state root `/` (LoginView vs WatchView) is handled by `App.vue` checking `useAuth` state, avoiding route duplication while maintaining clean UX separation.

### Requirements Coverage Validation ✅

**Functional Requirements (55 FRs across 8 categories):**

| FR Category | Count | Coverage Status |
|---|---|---|
| AUTH: Google OAuth, allowlist, session | 3 | `routes/auth.ts`, `services/authService.ts`, `middleware/auth.ts` |
| USER: management, roles, banning | 7 | `routes/users.ts`, `routes/me.ts`, `services/userService.ts`, `cli/commands/users.ts` |
| STREAM: camera pipeline, HLS, controls | 6 | `agent/internal/camera/pipeline.go`, `stream/ffmpeg.ts`, `routes/stream.ts`, `routes/hls.ts` |
| CHAT: messages, moderation, history | 6 | `routes/chat.ts`, `services/chatService.ts`, `features/chat/` |
| REALTIME: WebSocket events, fan-out | 4 | `routes/ws.ts`, `ws/hub.ts`, `ws/handlers.ts`, `packages/types/src/ws.ts` |
| ADMIN: panel, user controls | 5 | `features/admin/`, `cli/commands/users.ts` |
| TUNNEL: frp NAT traversal | 2 | `agent/internal/tunnel/frp.go` |
| OBS: logging, metrics | 2 | `lib/logger.ts`, `services/metricsService.ts`, `routes/metrics.ts` |

All 55 FRs have corresponding architectural homes.

**Non-Functional Requirements:**

| NFR | Architectural Response |
|---|---|
| 10–20 concurrent viewers | In-process EventEmitter fan-out (no Redis needed at this scale); HLS static file serving |
| Auth security | httpOnly sameSite=lax cookie; session-backed (no JWT); `requireAuth`/`requireAdmin` middleware |
| Pi reliable tunnel | frp auto-reconnect; agent handles tunnel-drop gracefully; stream state events emitted on drop |
| Extensibility | Redis seam documented for future scale; MQTT noted as future Pi IoT option |
| Observability (MVP) | Grafana Cloud Loki + Prometheus; pino structured JSON logs; `prom-client` metric registry |
| Deployment simplicity | Single `docker-compose`; three reverse proxy reference configs (Caddy, nginx, Traefik) |
| Pi deployment | Semver agent binary on GitHub Releases; `--self-update` with systemd restart |

### Implementation Readiness Validation ✅

**Decision Completeness:**
All critical decisions include specific package versions. The 14 conflict points from Step 5 (Implementation Patterns) are addressed with explicit rules. Examples are provided for ULID generation, `AppError` handling, `WsMessage` discriminated union, Prisma patterns, and Vue composable return shapes.

**Structure Completeness:**
All directories and files are defined down to individual `.ts` / `.vue` / `.go` files. FR-to-file mapping covers all 8 categories. Integration points document exact env var names, ports, route paths, and authentication mechanisms.

**Pattern Completeness:**
Naming, structure, format (dates/IDs/errors), communication (REST shape, WS envelope), process (error handling, session management, ULID generation), enforcement rules, and anti-patterns are all fully specified. The global Vue error handler, router navigation guard logic, and frp/agent auth distinction are explicitly documented.

### Gap Analysis Results

**Critical Gaps:** None. No implementation-blocking decisions are missing.

**Important Gaps — Resolved in This Step:**

1. ✅ **Tailwind v4 / shadcn-vue compatibility** — Downgraded to Tailwind v3 (pinned). Upgrade to v4 is explicitly deferred. Install command updated throughout.

2. ✅ **Router navigation guards** — Full `beforeEach` implementation specified in Frontend Architecture. Auth-state decision tree documented: no session → LoginView, pending → `/rejected`, banned → `/banned`, approved → `WatchView`.

3. ✅ **frp auth vs Agent API auth** — Two-layer auth model clarified: (1) frp tunnel uses its own `token` field (frpc ↔ frps, no Node.js involvement); (2) agent HTTP calls to Hono use `X-Agent-Key` header validated by `src/middleware/agentAuth.ts`, applied to `/api/stream/agent/*` route group only.

4. ✅ **LoginView.vue** — Added to project tree (`views/LoginView.vue`). `App.vue` description updated to reflect auth-state switching.

5. ✅ **Global Vue error handler** — `app.config.errorHandler` pattern documented in Process Patterns with implementation example.

6. ✅ **`GET /api/health`** — `routes/health.ts` added to project tree; liveness probe row added to Server ↔ SPA boundary table.

**Nice-to-Have Gaps — Deferred:**
- E2E testing (Playwright) — explicitly deferred post-MVP
- Multi-bitrate ABR HLS — additive future enhancement, ffmpeg already in place
- Redis fan-out for horizontal scaling — seam documented, not needed at 10–20 viewers
- MQTT for Pi↔server IoT messaging — frp API proxy sufficient for MVP

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed (55 FRs, 16 NFRs, 8 categories)
- [x] Scale and complexity assessed (single server, 10–20 viewers, single Pi)
- [x] Technical constraints identified (ARM binary, NAT traversal, systemd)
- [x] Cross-cutting concerns mapped (auth, observability, error handling)

**✅ Architectural Decisions**
- [x] Critical decisions documented with package versions
- [x] Technology stack fully specified (Vue 3, Hono 4, Prisma 6, Go 1.24, PostgreSQL)
- [x] Integration patterns defined (Google OAuth, frp tunnels, WS fan-out, Grafana Cloud)
- [x] Performance considerations addressed (HLS segments, in-process EventEmitter, keyset pagination)

**✅ Implementation Patterns**
- [x] Naming conventions established (14 conflict points resolved)
- [x] Structure patterns defined (server, web, agent)
- [x] Communication patterns specified (REST shape, WS envelope, error format)
- [x] Process patterns documented (ULID generation, Prisma usage, Vue error handling, auth guard)

**✅ Project Structure**
- [x] Complete directory structure defined (all files named)
- [x] Component boundaries established (Pi↔Server, Server↔SPA, SPA internal, data)
- [x] Integration points mapped (OAuth, frp stream, frp API, WS fan-out, Grafana)
- [x] Requirements-to-structure mapping complete (all 8 FR categories)

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High — all blocking decisions are made, all files are named, all integration points are specified, all conflict patterns are guarded.

**Key Strengths:**
- Appropriately scoped: single-instance architecture matching the 10–20 viewer target (no premature Redis/multi-server complexity)
- Clear ownership boundaries: agent owns camera + tunnels; server owns auth + DB + transcoding + WS fan-out; SPA owns rendering
- Strong ULID discipline: server-generated only, single import point, `CHAR(26)` in DB
- Resilient auth design: ban atomically invalidates all sessions; allowlist only gates registration
- Dual-component root `/`: LoginView / WatchView switch in `App.vue` avoids redundant routing while respecting browser history

**Areas for Future Enhancement:**
- Tailwind v4 migration (when shadcn-vue ships stable v4 support)
- Multi-bitrate HLS (additive — ffmpeg already in place)
- Redis fan-out seam (when horizontal scaling is needed)
- MQTT Pi↔server command channel (when frp API tunnel is insufficient)
- Playwright E2E tests (post-MVP)

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented — no version substitutions without explicit approval
- Use implementation patterns consistently across all components; refer to the 14 conflict points in Step 5 as the primary consistency checklist
- Respect project structure and component boundaries — no new top-level directories without architectural justification
- Never `new PrismaClient()` outside `src/db/client.ts`; never `ulid()` imported directly from `ulidx`; never `export default`
- frp tunnel tokens vs `AGENT_API_KEY` are separate secrets with different scopes — do not conflate
- Tailwind v3 (not v4) — use `tailwind.config.ts` not `@tailwindcss/vite` plugin

**First Implementation Story:**
Monorepo scaffold — initialize pnpm workspace, create all `apps/` and `packages/` directories, configure `tsconfig` paths, install base dependencies, set up Prisma schema with initial User + Session models and first migration, configure GitHub Actions CI skeleton.
```
