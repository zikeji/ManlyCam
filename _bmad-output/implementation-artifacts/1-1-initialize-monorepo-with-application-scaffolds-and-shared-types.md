# Story 1.1: Initialize Monorepo with Application Scaffolds and Shared Types

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want the monorepo workspace initialized with all three application scaffolds and the shared types package,
So that all subsequent development has a consistent, dependency-linked foundation to build on.

## Acceptance Criteria

**AC1 — Workspace install resolves all packages**
Given a fresh clone of the repository
When `pnpm install` is run from the repo root
Then all workspace packages resolve without errors (`apps/agent`, `apps/server`, `apps/web`, `packages/types`)

**AC2 — packages/types exports complete WsMessage discriminated union**
Given the monorepo is initialized
When `packages/types/src/ws.ts` is inspected
Then it exports the full `WsMessage` discriminated union (12 message types: `chat:message`, `chat:edit`, `chat:delete`, `stream:state`, `presence:join`, `presence:leave`, `typing:start`, `typing:stop`, `session:revoked`, `moderation:muted`, `moderation:unmuted`, `user:update`), role enums as `const` + `as const` objects, and stream state types

**AC3 — Cross-package TypeScript imports resolve**
Given a TypeScript file in `apps/server`
When it imports from `packages/types`
Then the import resolves correctly via pnpm workspace linking and `tsconfig` paths

**AC4 — Hono server scaffold starts and responds**
Given `apps/server` is scaffolded
When `pnpm --filter apps/server dev` is run
Then the Hono server starts on the configured port with the health endpoint responding `{ ok: true, uptime: <number> }` at `GET /api/health`

**AC5 — Vue SPA scaffold starts**
Given `apps/web` is scaffolded
When `pnpm --filter apps/web dev` is run
Then the Vite dev server starts and serves the Vue 3 SPA root

**AC6 — Go agent binary compiles**
Given `apps/agent` is initialized
When `go build ./...` is run from `apps/agent/`
Then the Go binary compiles without errors

**AC7 — ULID singleton pattern enforced**
`src/lib/ulid.ts` in `apps/server` exports a single `ulid` function powered by `monotonicFactory()` from `ulidx` — all other modules import from this file, never from `ulidx` directly

**AC8 — Prisma client singleton pattern enforced**
`src/db/client.ts` in `apps/server` exports a single `PrismaClient` instance — no other file calls `new PrismaClient()`

**AC9 — Zod-validated env module**
`src/env.ts` in `apps/server` exports a zod-validated env object covering all required env vars (`PORT`, `BASE_URL`, `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `HLS_SEGMENT_PATH`, `FRP_STREAM_PORT`, `FRP_API_PORT`, `AGENT_API_KEY`, `PET_NAME`, `SITE_NAME`) — server fails to start with a descriptive error if any required var is missing

## Tasks / Subtasks

- [x] Task 1: Initialize pnpm monorepo root (AC: #1)
  - [x] Create `pnpm-workspace.yaml` with `packages: ['apps/*', 'packages/*']`
  - [x] Create root `package.json` with workspace scripts (`dev`, `build`, `lint`, `typecheck`)
  - [x] Create root `.gitignore` (node_modules, dist, .env, *.js.map, coverage, etc.)
  - [x] Create root `.env.example` documenting workspace-level env vars
- [x] Task 2: Create packages/types (AC: #2, #3)
  - [x] Create `packages/types/package.json` with name `@manlycam/types`, `exports` field
  - [x] Create `packages/types/tsconfig.json` with strict mode, `declaration: true`, `declarationMap: true`
  - [x] Create `packages/types/src/ws.ts` — full `WsMessage` discriminated union (all 12 types per AC2) + all payload types defined in Dev Notes below
  - [x] Create `packages/types/src/api.ts` — stub only: `export type {}` with comment "Shared API request/response types — populated in subsequent stories"
  - [x] Create `packages/types/src/index.ts` — barrel export of all named exports from `ws.ts` and `api.ts`
  - [x] Include `Role` and `StreamStatus` as `const` objects with `as const` (NOT TypeScript `enum` keyword) — see Dev Notes for exact shapes
- [x] Task 3: Scaffold apps/server (Hono + Node.js + TypeScript) (AC: #3, #4, #7, #8, #9)
  - [x] Run scaffold: `pnpm create hono@latest apps/server --template nodejs`
  - [x] Add dependencies: `@prisma/client prisma @hono/node-server zod ulidx pino`
  - [x] Add dev dependencies: `typescript vitest @types/node eslint`
  - [x] Configure `tsconfig.json` with path alias pointing to `packages/types`
  - [x] Create `src/env.ts` — zod schema, all 13 required vars (AC9), fail-fast on missing
  - [x] Create `src/lib/ulid.ts` — `monotonicFactory()` singleton export (AC7)
  - [x] Create `src/db/client.ts` — single `PrismaClient` export (AC8)
  - [x] Create `src/lib/errors.ts` — `AppError` class with `code: string` and `statusCode: number`
  - [x] Create `src/lib/logger.ts` — pino logger instance
  - [x] Create `src/routes/health.ts` — `GET /api/health` returns `{ ok: true, uptime: number }` (AC4)
  - [x] Create `src/app.ts` — Hono app factory (testable, no side effects)
  - [x] Create `src/index.ts` — entrypoint: creates app, starts `@hono/node-server`
  - [x] Create `apps/server/.env.example` with all 13 env vars and inline comments
  - [x] Add `bin` field to `apps/server/package.json`: `{ "manlycam-admin": "./src/cli/index.ts" }` (CLI entry — commands implemented in Epic 2+)
  - [x] Create empty stub dirs: `src/middleware/`, `src/services/`, `src/ws/`, `src/stream/`, `src/cli/commands/`
  - [x] Do NOT run `prisma init` — Prisma schema initialization is Story 1.2's responsibility
- [x] Task 4: Scaffold apps/web (Vue 3 + Vite + TypeScript) (AC: #5)
  - [x] Run scaffold: `pnpm create vite@latest apps/web -- --template vue-ts`
  - [x] Add deps: `tailwindcss@3 postcss autoprefixer splitpanes @vueuse/core hls.js vue-router`
  - [x] Run `pnpm dlx shadcn-vue@latest init` (Tailwind v3 only — NOT v4)
  - [x] Configure `tsconfig.json` with path alias to `@manlycam/types`
  - [x] Create minimal `src/main.ts`, `src/App.vue`, `src/router/index.ts` stubs (dev server start only)
  - [x] Create `src/types/index.ts` — re-export from `@manlycam/types`
  - [x] Create `apps/web/.env.example` with `VITE_API_BASE_URL` placeholder
  - [x] Create `Dockerfile` (multi-stage: Vite build stage → nginx:alpine serve stage)
- [x] Task 5: Initialize apps/agent (Go 1.24) (AC: #6)
  - [x] Run `go mod init github.com/zikeji/ManlyCam/apps/agent` from `apps/agent/`
  - [x] Run `go get github.com/spf13/cobra`
  - [x] Create minimal `main.go` and `cmd/root.go` — cobra root command, compiles with `go build ./...`
  - [x] Create stub packages: `internal/config/`, `internal/camera/`, `internal/tunnel/`, `internal/portal/`, `internal/updater/`
  - [x] Create `apps/agent/deploy/config.example.toml` with `[stream]`, `[frp]`, `[update]` sections annotated (TOML format — config file is `.toml`, NOT `.yaml`; see readiness report C2 resolution)
  - [x] Create `apps/agent/deploy/manlycam-agent.service` — systemd unit file stub
- [x] Task 6: Validate workspace linking (AC: #1, #3)
  - [x] Run `pnpm install` from root and confirm all workspaces resolve
  - [x] Run `tsc --noEmit` in `apps/server` to confirm `@manlycam/types` path resolves

## Dev Notes

### Tech Stack

| Component | Runtime | Key Libraries |
|---|---|---|
| `packages/types` | TypeScript | No runtime deps |
| `apps/server` | Node.js 20+ + TypeScript | Hono 4, Prisma 6, ulidx, zod, pino |
| `apps/web` | Browser + Vite 6 + TypeScript | Vue 3, Tailwind v3, shadcn-vue, hls.js, @vueuse/core, splitpanes |
| `apps/agent` | Go 1.24 | cobra |

### Critical Singletons — Never Duplicate

Two files are architectural singletons enforced across the entire codebase:

1. **`src/lib/ulid.ts`** — the ONLY place that calls `monotonicFactory()` from `ulidx`. Every other file imports `ulid` from here. Direct `ulidx` imports anywhere else are a hard anti-pattern.
2. **`src/db/client.ts`** — the ONLY place that calls `new PrismaClient()`. Every other file imports the singleton. Multiple instances cause connection pool exhaustion.

### Named Exports — Hard Rule

**Every file in this codebase uses named exports only. `export default` is forbidden project-wide.** This applies to every file created in this story and all future stories.

```typescript
// CORRECT
export const ulid = monotonicFactory()
export type WsMessage = ...

// WRONG — never do this
export default monotonicFactory()
```

### WsMessage Exact Shape (packages/types/src/ws.ts)

Must have exactly 12 type literals — type narrowing throughout the codebase depends on exact string matches:

```typescript
export type WsMessage =
  | { type: 'chat:message';       payload: ChatMessage }
  | { type: 'chat:edit';          payload: ChatEdit }
  | { type: 'chat:delete';        payload: { messageId: string } }
  | { type: 'stream:state';       payload: StreamState }
  | { type: 'presence:join';      payload: UserPresence }
  | { type: 'presence:leave';     payload: { userId: string } }
  | { type: 'typing:start';       payload: { userId: string; displayName: string } }
  | { type: 'typing:stop';        payload: { userId: string } }
  | { type: 'session:revoked';    payload: { reason: 'banned' } }
  | { type: 'moderation:muted';   payload: { userId: string } }
  | { type: 'moderation:unmuted'; payload: { userId: string } }
  | { type: 'user:update';        payload: UserProfile }
```

> **Note on `session:revoked` payload:** `architecture.md` shows `reason: 'banned' | 'removed'` but this is stale. Implementation readiness resolutions C3 (standardized ban paths) and H5 (allowlist removal does NOT revoke active sessions — ban is the only revocation path) mean `reason: 'removed'` has no trigger. Implement `{ reason: 'banned' }` only.

### Payload Types — All Required in ws.ts

Define these interfaces/types in `packages/types/src/ws.ts` above the `WsMessage` union:

```typescript
export interface UserTag {
  text: string
  color: string
}

export interface UserProfile {
  id: string
  displayName: string
  avatarUrl: string | null
  role: Role
  userTag: UserTag | null
}

// presence:join sends the same shape as a user profile
export type UserPresence = UserProfile

export interface ChatMessage {
  id: string
  userId: string
  displayName: string
  avatarUrl: string | null
  content: string
  editHistory: { content: string; editedAt: string }[] | null  // null = never edited
  updatedAt: string | null
  deletedAt: string | null
  deletedBy: string | null  // differs from userId on mod-initiated deletes
  createdAt: string
  userTag: UserTag | null
}

export interface ChatEdit {
  messageId: string
  content: string
  editHistory: { content: string; editedAt: string }[]
  updatedAt: string
}

// Server-broadcast stream states only (3 values).
// 'connecting' is a CLIENT-ONLY UI state inferred before first stream:state message — do NOT add it here.
export interface StreamState {
  state: 'live' | 'unreachable' | 'explicit-offline'
  adminToggle?: 'live' | 'offline'  // present on 'unreachable' to distinguish FR10 states
}
```

### StreamStatus Constant

```typescript
export const StreamStatus = {
  Live: 'live',
  Unreachable: 'unreachable',
  ExplicitOffline: 'explicit-offline',
} as const
export type StreamStatus = typeof StreamStatus[keyof typeof StreamStatus]
```

Role constants — use `const` + `as const`, NOT the `enum` keyword:

```typescript
export const Role = {
  Admin: 'Admin',
  Moderator: 'Moderator',
  ViewerCompany: 'ViewerCompany',
  ViewerGuest: 'ViewerGuest',
} as const
export type Role = typeof Role[keyof typeof Role]
```

### apps/server env.ts — Required Vars

All 13 env vars must be validated; server must produce a descriptive human-readable error (not a raw crash) if any are missing:

```
PORT, BASE_URL, DATABASE_URL, SESSION_SECRET,
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI,
HLS_SEGMENT_PATH, FRP_STREAM_PORT, FRP_API_PORT,
AGENT_API_KEY, PET_NAME, SITE_NAME
```

### Tailwind Version — MUST Be v3

Pin Tailwind to v3. shadcn-vue does not have stable v4 support yet. This is an explicit architectural decision, not an oversight:

```bash
pnpm add -D tailwindcss@3 postcss autoprefixer
```

### Go Module Path

Exact string required in `go.mod`: `github.com/zikeji/ManlyCam/apps/agent`

### apps/server Expected Directory Layout

```
apps/server/src/
├── index.ts          # entrypoint only — no app logic
├── app.ts            # Hono app factory (exported for test use)
├── env.ts            # zod env validation — fail fast on missing vars
├── middleware/       # stub dir — implemented in Epic 2
├── routes/
│   └── health.ts     # GET /api/health -> { ok: true, uptime: number }
├── services/         # stub dir — fleshed out in later stories
├── db/
│   └── client.ts     # ONLY file with new PrismaClient()
├── ws/               # stub dir
├── stream/           # stub dir
├── cli/
│   └── commands/     # stub dirs — CLI commands implemented in Epic 2+
└── lib/
    ├── ulid.ts       # ONLY file with monotonicFactory()
    ├── errors.ts     # AppError class
    └── logger.ts     # pino instance
```

**Server Dockerfile scope:** `apps/server/Dockerfile` is NOT created in this story — that is Story 1.3 (CI/CD pipelines) scope.

### apps/web Scope for This Story

Only needs enough for `pnpm --filter apps/web dev` to start. Do NOT implement full views, composables, or routing logic — those belong to Epic 2+. Stubs only:
- `src/main.ts` — bootstraps Vue app with router
- `src/App.vue` — renders `<RouterView />` or minimal placeholder
- `src/router/index.ts` — Vue Router history mode, single `/` route
- `src/types/index.ts` — re-exports from `@manlycam/types`

### apps/agent Scope for This Story

Only needs to compile. Actual camera pipeline, frp, portal, and updater logic is implemented in Epics 3 and 6. Stub files with empty bodies are correct here.

### Anti-Patterns — Never Do These

These are hard bans across the entire codebase. Any of these in a PR is an automatic rejection:

| Anti-pattern | Why |
|---|---|
| `new PrismaClient()` outside `src/db/client.ts` | Connection pool exhaustion |
| `export default` on any module | Project-wide named-export convention |
| `import { monotonicFactory } from 'ulidx'` outside `src/lib/ulid.ts` | Breaks monotonic ordering guarantee |
| `__tests__/` directories | Co-located `*.test.ts` only |
| Exposing Prisma error details or stack traces in API responses | Security — return `INTERNAL_ERROR` generic message |
| `enum` keyword | Use `const` + `as const` pattern |
| Unix timestamps in API responses | Use ISO 8601 UTC strings |
| `TIMESTAMP WITHOUT TIME ZONE` in Postgres | Always `TIMESTAMPTZ` |
| `/api/user` as current-user route | Always `GET /api/me` |
| Offset-based pagination | Keyset/cursor-based only (`before={ulid}`) |

### Project Structure Notes

- Monorepo tooling is intentionally minimal: plain pnpm workspaces, no Turbo/Nx
- No Pinia — state management is Vue 3 Composition API + `@vueuse/core` only
- All IDs across the system will use ULIDs (`CHAR(26)`) generated via the `ulid.ts` singleton created in this story — Prisma schema and DB writes are Story 1.2
- `packages/types/src/api.ts` is created as a stub here; API request/response types are added to it as the API surface is built in subsequent stories

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#WebSocket Message Envelope] — WsMessage discriminated union exact shape
- [Source: _bmad-output/planning-artifacts/architecture.md#Architecture Component Map] — scaffold commands per component
- [Source: _bmad-output/planning-artifacts/architecture.md#Complete Monorepo Tree] — full expected directory layout
- [Source: _bmad-output/planning-artifacts/architecture.md#ULID generation] — singleton pattern and rationale
- [Source: _bmad-output/planning-artifacts/architecture.md#SPA: Vite 6 + Vue 3] — Tailwind v3 pin rationale
- [Source: _bmad-output/planning-artifacts/architecture.md#TypeScript conventions] — Role const pattern, no enum keyword; named exports rule; anti-patterns
- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1] — acceptance criteria source
- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.3] — StreamState `state` string values (`live`, `unreachable`, `explicit-offline`)
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-03-06.md#C3] — `session:revoked` standardized to `reason: 'banned'` only; `reason: 'removed'` is stale in architecture.md
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-03-06.md#H5] — FR44 resolved: allowlist removal does not revoke active sessions; ban is the only revocation path
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-03-06.md#C2] — agent config format is TOML (`config.example.toml`), not YAML

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `@vitejs/plugin-vue` had to be updated from `^5.2.0` to `^6.0.0` for Vite 7 compatibility (peer dep warning resolved)
- Vite scaffold created a vanilla TS project instead of vue-ts; manually configured Vue 3 + Vite project structure
- Added `pnpm.onlyBuiltDependencies` to root `package.json` for Prisma/esbuild build scripts (pnpm v10 requirement)
- shadcn-vue init run non-interactively by manually creating `components.json`, `src/assets/index.css`, `src/lib/utils.ts`

### Completion Notes List

- All 6 tasks completed; all ACs verified
- Monorepo root: `pnpm-workspace.yaml`, `package.json`, `.gitignore`, `.env.example`
- `packages/types`: `WsMessage` discriminated union (12 types), `Role` and `StreamStatus` as `const` + `as const`, `UserProfile`, `ChatMessage`, `ChatEdit`, `StreamState`, `UserPresence`, `UserTag` — all named exports, zero `export default`
- `apps/server`: Hono 4 scaffold with `env.ts` (13 zod-validated vars, fail-fast), `lib/ulid.ts` singleton, `db/client.ts` singleton, `lib/errors.ts`, `lib/logger.ts`, `routes/health.ts`, `app.ts` factory, `index.ts` entrypoint, stub dirs for middleware/services/ws/stream/cli/commands, `bin.manlycam-admin` field
- `apps/web`: Vue 3 + Vite 7 + TypeScript, Tailwind v3 pinned, shadcn-vue config, `App.vue`, `router/index.ts`, `types/index.ts`, `lib/utils.ts`, multi-stage Dockerfile, `.env.example`
- `apps/agent`: Go module `github.com/zikeji/ManlyCam/apps/agent`, cobra root command, stub internal packages, `deploy/config.example.toml` (TOML format per C2 resolution), `deploy/manlycam-agent.service`
- `pnpm install` from root: all 4 workspace packages resolved (packages/types, apps/server, apps/web + workspace root)
- `tsc --noEmit` in apps/server: passes — `@manlycam/types` path alias resolves correctly
- `go build ./...` in apps/agent: compiles without errors
- No `export default`, no `enum` keyword, no `new PrismaClient()` outside `db/client.ts`, no direct `ulidx` imports outside `lib/ulid.ts`

### File List

- `pnpm-workspace.yaml`
- `package.json`
- `.gitignore`
- `.env.example`
- `packages/types/package.json`
- `packages/types/tsconfig.json`
- `packages/types/src/ws.ts`
- `packages/types/src/api.ts`
- `packages/types/src/index.ts`
- `apps/server/package.json`
- `apps/server/tsconfig.json`
- `apps/server/.env.example`
- `apps/server/src/index.ts`
- `apps/server/src/app.ts`
- `apps/server/src/env.ts`
- `apps/server/src/lib/ulid.ts`
- `apps/server/src/lib/errors.ts`
- `apps/server/src/lib/logger.ts`
- `apps/server/src/db/client.ts`
- `apps/server/src/routes/health.ts`
- `apps/server/src/middleware/.gitkeep`
- `apps/server/src/services/.gitkeep`
- `apps/server/src/ws/.gitkeep`
- `apps/server/src/stream/.gitkeep`
- `apps/server/src/cli/commands/.gitkeep`
- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `apps/web/vite.config.ts`
- `apps/web/tailwind.config.js`
- `apps/web/postcss.config.js`
- `apps/web/components.json`
- `apps/web/.env.example`
- `apps/web/Dockerfile`
- `apps/web/src/main.ts`
- `apps/web/src/App.vue`
- `apps/web/src/router/index.ts`
- `apps/web/src/types/index.ts`
- `apps/web/src/lib/utils.ts`
- `apps/web/src/assets/index.css`
- `apps/agent/go.mod`
- `apps/agent/go.sum`
- `apps/agent/main.go`
- `apps/agent/cmd/root.go`
- `apps/agent/internal/config/config.go`
- `apps/agent/internal/camera/camera.go`
- `apps/agent/internal/tunnel/tunnel.go`
- `apps/agent/internal/portal/portal.go`
- `apps/agent/internal/updater/updater.go`
- `apps/agent/deploy/config.example.toml`
- `apps/agent/deploy/manlycam-agent.service`

## Change Log

- 2026-03-06: Initial implementation — monorepo root, packages/types (WsMessage 12-type union, Role, StreamStatus), apps/server scaffold (Hono 4, env validation, singletons, health endpoint), apps/web scaffold (Vue 3 + Vite 7 + Tailwind v3 + shadcn-vue config), apps/agent (Go cobra stub, compiles); all ACs verified, workspace linking confirmed
- 2026-03-06: Code review complete — fixed tool config exports (vite.config.ts, tailwind.config.js, postcss.config.js) to include named exports while maintaining required defaults. Documented Vue/external library imports as architectural exceptions. Go 1.25.0 accepted. All CLI stub items deferred to Epic 2+.
