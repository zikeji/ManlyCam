---
title: 'Web Runtime Env Injection & Monolithic Deploy Consolidation'
slug: 'web-runtime-env-monolithic-deploy'
created: '2026-03-11'
status: 'review'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['hono', 'vite', 'vue3', 'typescript', 'docker', 'github-actions']
files_to_modify:
  - apps/web/index.html
  - apps/server/src/app.ts
  - apps/server/Dockerfile
  - apps/server/deploy/docker-compose.yml
  - apps/server/deploy/traefik/docker-compose.yml
  - .github/workflows/server-ci.yml
files_to_delete:
  - apps/web/Dockerfile
  - .github/workflows/web-ci.yml
files_to_create:
  - apps/web/src/lib/env.ts
  - docs/deploy/nginx.conf
  - docs/deploy/docker-compose.yml (moved)
  - docs/deploy/frps.toml (moved)
  - docs/deploy/mediamtx-server.yml (moved)
  - docs/deploy/traefik/ (moved)
files_web_components:
  - apps/web/src/views/LoginView.vue
  - apps/web/src/views/RejectedView.vue
  - apps/web/src/views/BannedView.vue
  - apps/web/src/components/stream/StreamPlayer.vue
  - apps/web/src/components/stream/StateOverlay.vue
  - apps/web/src/components/stream/StreamStatusBadge.vue
code_patterns: ['window.__env__', 'import.meta.env fallback', 'hono serveStatic', 'docker multi-stage']
test_patterns: ['import.meta.env.VITE_* stubs still work via fallback — no test changes needed']
---

# Tech-Spec: Web Runtime Env Injection & Monolithic Deploy Consolidation

**Created:** 2026-03-11

## Overview

### Problem Statement

`VITE_PET_NAME` and `VITE_SITE_NAME` are consumed via `import.meta.env.VITE_*` in the web app, which Vite bakes at build time. The CI never sets these vars, so the published `manlycam-web` Docker image has `undefined` for both — meaning the live site shows a blank pet name and wrong page title. The `<title>ManlyCam</title>` in `index.html` is hardcoded and not operator-customisable. The separate `manlycam-web` Docker image/CI is unused overhead since `app.ts` already serves the web dist in production. Deploy configs live in `apps/server/deploy/` mixed with source code rather than in a dedicated docs location.

### Solution

1. **Server-side env injection**: The existing SPA catch-all in `app.ts` (lines 49–57) already reads and serves `index.html`. Extend it to inject `<script>window.__env__ = {...}</script>` and set the correct `<title>` using the server's runtime `env.PET_NAME` / `env.SITE_NAME`. No new infrastructure needed.
2. **`apps/web/src/lib/env.ts` helper**: Typed accessor that reads `window.__env__` first, falls back to `import.meta.env.VITE_*` for local dev, then a hardcoded default.
3. **Monolithic Dockerfile**: Add a `web-builder` stage to the server Dockerfile that builds the Vue app; copy `apps/web/dist` into the runner image at the path `app.ts` already expects (`/repo/apps/web/dist`). Remove stale `ffmpeg` install.
4. **CI consolidation**: Remove `web-ci.yml`. Add web lint/typecheck/test/build steps to `server-ci.yml` with expanded path trigger. Rename image from `manlycam-server` to `manlycam`.
5. **Deploy docs migration**: Move `apps/server/deploy/` contents to `docs/deploy/`. Add `docs/deploy/nginx.conf` as a reference reverse-proxy config.

### Scope

**In Scope:**
- `apps/web/index.html` — replace `<title>ManlyCam</title>` with `<title>__SITE_NAME__</title>` (explicit template placeholder)
- `apps/server/src/app.ts` — inject `window.__env__` and replace `__SITE_NAME__` placeholder with `env.SITE_NAME` in existing SPA catch-all; `index.html`'s title becomes operator-configurable at runtime (SEO benefit: crawlers see the real site name)
- `apps/server/Dockerfile` — add web build stage, remove ffmpeg, copy web dist
- `apps/web/src/lib/env.ts` — new typed env helper
- 6 web component files — swap `import.meta.env.VITE_*` to `env.ts` helper
- `apps/web/Dockerfile` — delete
- `.github/workflows/web-ci.yml` — delete
- `.github/workflows/server-ci.yml` — add web steps, rename image, expand path trigger
- `apps/server/deploy/docker-compose.yml` + `traefik/docker-compose.yml` — update image name
- `apps/server/deploy/` contents — move to `docs/deploy/`
- `docs/deploy/nginx.conf` — new reference reverse-proxy config

**Out of Scope:**
- nginx container in compose (intentionally not added — monolithic single-container approach)
- Traefik path-prefix routing changes
- Per-route `document.title` management (Vue app already handles this)
- `.env.example` relocation (stays in `apps/server/` — used for local dev)

---

## Context for Development

### Codebase Patterns

- `app.ts` already imports `serveStatic` from `@hono/node-server/serve-static` and `readFileSync` from `node:fs` — no new deps needed
- Existing SPA catch-all at `app.ts:49–57` reads index.html as utf-8 string and serves with `c.html()` — injection is a `.replace()` on that string
- Named exports only — no `export default` in lib files
- Tests stub `import.meta.env.VITE_*` directly (e.g. `import.meta.env.VITE_PET_NAME = 'Buddy'`) — this still works via the fallback path in the new helper; no test file changes required
- `apps/web/src/lib/` directory exists with `utils.ts`, `api.ts`, etc. — `env.ts` fits naturally

### Files to Reference

| File | Purpose |
|------|---------|
| `apps/server/src/app.ts:49–57` | Existing SPA catch-all to extend with env injection |
| `apps/server/Dockerfile` | Add web build stage; remove stale ffmpeg (line 28) |
| `apps/web/index.html` | Change `<title>ManlyCam</title>` (line 24) to `<title>__SITE_NAME__</title>`; inline dark-mode script has no conflicting patterns |
| `apps/web/src/views/LoginView.vue` | Uses both `VITE_SITE_NAME` and `VITE_PET_NAME` |
| `apps/web/src/views/RejectedView.vue` | Uses both |
| `apps/web/src/views/BannedView.vue` | Uses `VITE_SITE_NAME` only |
| `apps/web/src/components/stream/StreamPlayer.vue` | Uses `VITE_PET_NAME` |
| `apps/web/src/components/stream/StateOverlay.vue` | Uses `VITE_PET_NAME` |
| `apps/web/src/components/stream/StreamStatusBadge.vue` | Uses `VITE_PET_NAME` |
| `.github/workflows/server-ci.yml` | Extend with web steps; rename image tag |
| `.github/workflows/web-ci.yml` | Delete entirely |
| `apps/server/deploy/` | Move contents to `docs/deploy/` |

### Technical Decisions

- **Injection point**: `app.ts` catch-all already calls `readFileSync` → string. Inject into string before `c.html()`. Two replacements: (1) insert `<script>window.__env__ = ...</script>` immediately after `<head>` opening tag; (2) replace the literal string `__SITE_NAME__` with `env.SITE_NAME`. `index.html` must contain `<title>__SITE_NAME__</title>` — the placeholder is the contract between the template and the server.
- **`window.__env__` type**: Declare `interface Window { __env__?: { PET_NAME?: string; SITE_NAME?: string } }` in `env.ts` — no separate `.d.ts` needed.
- **Dev fallback order**: `window.__env__?.X ?? import.meta.env.VITE_X ?? 'hardcoded-default'`. In Docker runtime, `window.__env__` wins. In `pnpm dev`, `import.meta.env.VITE_*` from `.env.local` wins. In tests, `import.meta.env.VITE_*` stubs win. Hardcoded default is last resort.
- **Defaults**: `PET_NAME` default `'Pet'`, `SITE_NAME` default `'ManlyCam'`.
- **Dockerfile web stage path**: Server `__dirname` at runtime is `/repo/apps/server/dist`. `app.ts` computes `distPath = join(__dirname, '../../web/dist')` = `/repo/apps/web/dist`. Dockerfile must `COPY --from=web-builder /repo/apps/web/dist /repo/apps/web/dist`.
- **ffmpeg removal**: Line 28 of server Dockerfile — `RUN apk add --no-cache ffmpeg` with stale "HLS stream transcoding" comment. Safe to remove; HLS was replaced by WebRTC in Story 3-2c.
- **CI consolidation**: `server-ci.yml` path trigger expands to `apps/web/**`. Web steps (lint, typecheck, test, build) run before Docker build so the Dockerfile can rely on the web being buildable. The `pnpm --filter @manlycam/web build` step in CI is a build-validity check; the actual web build inside Docker is independent.
- **Deploy docs**: `apps/server/deploy/` contents move to `docs/deploy/`. Both compose files update image name `manlycam-server` → `manlycam`. Compose files reference `./frps.toml`, `./mediamtx-server.yml` etc. via relative paths — paths remain valid after move since all files move together.
- **nginx.conf**: Reference config for operators using nginx as reverse proxy. Single `location /` block proxying to the `manlycam` container on port 3000. Include WebSocket upgrade headers for `/ws`.

---

## Implementation Plan

### Tasks

- [x] Task 1: Create `apps/web/src/lib/env.ts` typed env helper
  - File: `apps/web/src/lib/env.ts` (create new)
  - Action: Create with `Window.__env__` interface declaration and two named exports — `getPetName()` and `getSiteName()` — each following the fallback chain `window.__env__?.X ?? import.meta.env.VITE_X ?? 'hardcoded-default'`. Default for `PET_NAME` = `'Pet'`; default for `SITE_NAME` = `'ManlyCam'`.
  - Notes: Named exports only (no `export default`). Interface: `declare global { interface Window { __env__?: { PET_NAME?: string; SITE_NAME?: string } } }`. No side effects. Place in `apps/web/src/lib/` alongside `utils.ts`, `api.ts`, etc.

- [x] Task 2: Update `apps/web/index.html` — add `__SITE_NAME__` placeholder
  - File: `apps/web/index.html`
  - Action: Replace `<title>ManlyCam</title>` (line 24) with `<title>__SITE_NAME__</title>`.
  - Notes: This is the explicit template contract with the server injection. Do not modify the inline dark-mode script above.

- [x] Task 3: Update 3 view components — swap `import.meta.env.VITE_*` for `env.ts` helpers
  - Files: `apps/web/src/views/LoginView.vue`, `apps/web/src/views/RejectedView.vue`, `apps/web/src/views/BannedView.vue`
  - Action: Replace the `import.meta.env.VITE_*` variable declarations with named imports from `~/lib/env.ts` (using the `@/` alias). Exact replacements:
    - `LoginView.vue`: remove `const siteName = import.meta.env.VITE_SITE_NAME as string` → `import { getSiteName, getPetName } from '@/lib/env'`; replace usages with `getSiteName()` / `getPetName()`.
    - `RejectedView.vue`: same as LoginView.
    - `BannedView.vue`: only uses `VITE_SITE_NAME` → `import { getSiteName } from '@/lib/env'`; replace usage with `getSiteName()`.
  - Notes: Current pattern is bare `const x = import.meta.env.VITE_X as string` at top of `<script setup>`. After change, `siteName` and `petName` become `getSiteName()` / `getPetName()` call-sites in the template (or assign to local `const` after calling — either works). Keep template refs unchanged or update inline, whichever is cleaner.

- [x] Task 4: Update 3 stream components — swap `import.meta.env.VITE_PET_NAME` for `getPetName()`
  - Files: `apps/web/src/components/stream/StreamPlayer.vue`, `apps/web/src/components/stream/StateOverlay.vue`, `apps/web/src/components/stream/StreamStatusBadge.vue`
  - Action: Replace `const petName = import.meta.env.VITE_PET_NAME as string` with `import { getPetName } from '@/lib/env'` and update usage to `getPetName()`. In `StreamStatusBadge.vue`, the `label()` function uses `petName` — update to call `getPetName()` inline or assign once at call site.
  - Notes: `StreamPlayer.vue` line 30, `StateOverlay.vue` line 8, `StreamStatusBadge.vue` line 8. All are bare top-of-`<script setup>` assignments.

- [x] Task 5: Extend `apps/server/src/app.ts` SPA catch-all with env injection
  - File: `apps/server/src/app.ts`
  - Action: Replace the existing SPA catch-all handler (lines 52–56) with a version that performs two string replacements before calling `c.html()`:
    1. Insert `<script>window.__env__ = ${JSON.stringify({ PET_NAME: env.PET_NAME, SITE_NAME: env.SITE_NAME })};</script>` immediately after the `<head>` opening tag — replace `'<head>'` with `'<head>\n  <script>window.__env__ = ' + JSON.stringify(...) + ';</script>'`.
    2. Replace the literal string `__SITE_NAME__` with `env.SITE_NAME`.
  - Notes: Both `env.PET_NAME` and `env.SITE_NAME` are already defined in `apps/server/src/env.ts` (zod-validated). `readFileSync` is already imported. No new imports needed. The `serveStatic` line (51) is unchanged — only the `app.get('/*', ...)` handler changes.

- [x] Task 6: Rewrite `apps/server/Dockerfile` — add web-builder stage, remove ffmpeg, copy web dist
  - File: `apps/server/Dockerfile`
  - Action: Full rewrite with 3 stages:
    1. **Stage 1 `web-builder`** (new, added before existing `builder` stage): `FROM node:20-alpine AS web-builder`. Installs pnpm, copies `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`, `packages/types/`, `apps/web/`. Runs `pnpm install --frozen-lockfile`, then `pnpm --filter @manlycam/types build`, then `pnpm --filter @manlycam/web build`.
    2. **Stage 2 `builder`** (existing, rename `AS builder`, no other changes except keep as-is): builds server.
    3. **Stage 3 `runner`** (existing `AS runner`): remove line 28 (`RUN apk add --no-cache ffmpeg`). Add `COPY --from=web-builder /repo/apps/web/dist /repo/apps/web/dist` after the existing `COPY --from=builder` lines.
  - Notes: Web builder only needs `packages/types/` + `apps/web/` — no server files, no Prisma. Web build output lands at `/repo/apps/web/dist` inside the web-builder stage. Server's `__dirname` at runtime = `/repo/apps/server/dist`; `distPath = join(__dirname, '../../web/dist')` = `/repo/apps/web/dist` — matches the COPY target exactly.

- [x] Task 7: Delete `apps/web/Dockerfile`
  - File: `apps/web/Dockerfile`
  - Action: Delete the file entirely.
  - Notes: The separate `manlycam-web` nginx container is no longer used. Server serves the web dist directly.

- [x] Task 8: Delete `.github/workflows/web-ci.yml`
  - File: `.github/workflows/web-ci.yml`
  - Action: Delete the file entirely.
  - Notes: All web CI steps move to `server-ci.yml`. The `manlycam-web` Docker image is no longer published.

- [x] Task 9: Update `.github/workflows/server-ci.yml` — add web steps, expand trigger, rename image
  - File: `.github/workflows/server-ci.yml`
  - Action: Three changes:
    1. **Path trigger**: add `- 'apps/web/**'` under the existing `paths:` list.
    2. **Web CI steps**: insert after the `prisma generate` step and before the server lint step — add `pnpm --filter @manlycam/web lint`, `pnpm --filter @manlycam/web typecheck`, `pnpm --filter @manlycam/web exec vitest run --coverage` (with a `Report web coverage` action using `davelosert/vitest-coverage-report-action@v2` pointing at `apps/web/coverage/`), and `pnpm --filter @manlycam/web build`.
    3. **Rename image tags**: change both occurrences of `manlycam-server` to `manlycam` in the Docker image tag lines.
  - Notes: `pnpm --filter @manlycam/web build` in CI is a build-validity check only; actual web build happens inside the Dockerfile's `web-builder` stage. The `vite-config-path` for the web coverage report action = `apps/web/vite.config.ts`.

- [x] Task 10: Move `apps/server/deploy/` to `docs/deploy/` and update image names
  - Files: `apps/server/deploy/docker-compose.yml`, `apps/server/deploy/traefik/docker-compose.yml`, `apps/server/deploy/frps.toml`, `apps/server/deploy/traefik/frps.toml`, `apps/server/deploy/mediamtx-server.yml`, `apps/server/deploy/traefik/traefik.yml`
  - Action: Git-move (`git mv`) all contents from `apps/server/deploy/` to `docs/deploy/`. In both compose files (`docs/deploy/docker-compose.yml` and `docs/deploy/traefik/docker-compose.yml`), update the server image tag from `manlycam-server:latest` to `manlycam:latest`.
  - Notes: All relative path references (`./frps.toml`, `./mediamtx-server.yml`) in compose files remain valid because all files move together as a unit. Use `git mv` for proper history tracking.

- [x] Task 11: Create `docs/deploy/nginx.conf` — reference reverse-proxy config
  - File: `docs/deploy/nginx.conf` (create new)
  - Action: Create a reference nginx config for operators using nginx as a reverse proxy in front of the `manlycam` container (port 3000). Single `server` block with `listen 80` (operators add TLS themselves). Single `location /` block proxying to `http://localhost:3000`. Include WebSocket upgrade headers (`Upgrade`, `Connection`) so `/ws` works correctly.
  - Notes: This is a documentation reference, not a production-ready config. Add a comment at the top noting operators should add TLS termination. WebSocket upgrade is critical — without `Connection: upgrade` and `Upgrade: $http_upgrade`, the WebSocket connection to `/ws` will fail through nginx.

#---

## Dev Agent Record

### Implementation Plan
- [x] Research: Load story and project context
- [x] Strategy: Define implementation order following TDD/RDR
- [x] Execution: Implement Task 1 (env.ts)
- [x] Execution: Implement Task 2 (index.html)
- [x] Execution: Implement Task 3 (view components)
- [x] Execution: Implement Task 4 (stream components)
- [x] Execution: Implement Task 5 (server injection)
- [x] Execution: Implement Task 6 (Dockerfile)
- [x] Execution: Implement Task 7 (delete web Dockerfile)
- [x] Execution: Implement Task 8 (delete web CI)
- [x] Execution: Implement Task 9 (update server CI)
- [x] Execution: Implement Task 10 (move deploy docs)
- [x] Execution: Implement Task 11 (nginx.conf)
- [x] Execution: Configure production Prisma migrations in Docker startup
- [x] Execution: Fix 401 Unauthorized for SPA root by mounting adminRouter at /api/admin
- [x] Execution: Ensure CLI bin symlink is correctly created in Docker runner stage

### Debug Log
- 2026-03-11: Initialized story implementation. Context loaded.
- 2026-03-11: Implemented `env.ts` helper and unit tests.
- 2026-03-11: Updated `index.html` with `__SITE_NAME__` placeholder.
- 2026-03-11: Updated view and stream components to use `env.ts`.
- 2026-03-11: Extended `app.ts` with server-side injection logic.
- 2026-03-11: Consolidated Dockerfile and CI workflows.
- 2026-03-11: Migrated deploy configs to `docs/deploy/`.
- 2026-03-11: Created reference `nginx.conf`.
- 2026-03-11: Moved `prisma` to `dependencies` and updated Dockerfile `CMD` to run `prisma migrate deploy` on startup to fix production DB initialization.
- 2026-03-11: Fixed 401 Unauthorized on `/` by mounting `adminRouter` at `/api/admin` (fixing middleware scope bleed).
- 2026-03-11: Updated Dockerfile to copy `apps/server/dist` before `pnpm install` in the runner stage, ensuring `pnpm` creates the `manlycam-admin` bin symlink.

### Completion Notes
- Monolithic deployment architecture achieved.
- Runtime environment injection for Vue app implemented via `window.__env__`.
- SEO-friendly site title injection implemented.
- Unused web Dockerfile and CI removed.
- All 440+ web tests passing.

---

## File List
- apps/web/src/lib/env.ts (new)
- apps/web/src/lib/env.test.ts (new)
- apps/web/index.html (modified)
- apps/web/src/views/LoginView.vue (modified)
- apps/web/src/views/RejectedView.vue (modified)
- apps/web/src/views/BannedView.vue (modified)
- apps/web/src/components/stream/StreamPlayer.vue (modified)
- apps/web/src/components/stream/StateOverlay.vue (modified)
- apps/web/src/components/stream/StreamStatusBadge.vue (modified)
- apps/server/src/app.ts (modified)
- apps/server/Dockerfile (modified)
- apps/web/Dockerfile (deleted)
- .github/workflows/web-ci.yml (deleted)
- .github/workflows/server-ci.yml (modified)
- docs/deploy/ (new location for deploy configs)
- docs/deploy/nginx.conf (new)
- docs/deploy/docker-compose.yml (modified)
- docs/deploy/traefik/docker-compose.yml (modified)

---

## Change Log
- 2026-03-11: Started implementation of web runtime env injection and monolithic deployment.

---

## Acceptance Criteria

- [x] AC 1: Given a running `manlycam` container with `PET_NAME=Manly` and `SITE_NAME=ManlyCam`, when a browser loads any page, then the served `index.html` contains `<script>window.__env__ = {"PET_NAME":"Manly","SITE_NAME":"ManlyCam"};</script>` in `<head>` and the `<title>` tag reads `ManlyCam`.

- [x] AC 2: Given `window.__env__.PET_NAME = 'Manly'` is set at runtime, when `LoginView`, `RejectedView`, `BannedView`, `StreamStatusBadge`, `StateOverlay`, or `StreamPlayer` render, then they display `Manly` (not `undefined`).

- [x] AC 3: Given `VITE_PET_NAME=Manly` and `VITE_SITE_NAME=ManlyCam` are set in `apps/web/.env.local`, when `pnpm dev` is run (no Docker, `window.__env__` is `undefined`), then components display `Manly` / `ManlyCam` via the `import.meta.env.VITE_*` fallback path.

- [x] AC 4: Given existing tests stub `import.meta.env.VITE_PET_NAME = 'Buddy'` etc., when the test suite runs after the `env.ts` helper is introduced and the 6 components are updated, then all 437 web tests pass without modification to any test file.

- [x] AC 5: Given the `manlycam` image is built (`docker build -f apps/server/Dockerfile .`) and run with `NODE_ENV=production PORT=3000`, when a browser navigates to `/` or any SPA route (e.g. `/watch`), then the correct HTML is served (not a 404) and static assets (`/assets/*.js`, `/assets/*.css`) load with HTTP 200.

- [x] AC 6: Given a push to `main` touching `apps/web/**`, when `server-ci.yml` runs, then the web lint, typecheck, test, and build steps all complete successfully.

- [x] AC 7: Given a push to `main` touching `apps/server/**` or `apps/web/**`, when `server-ci.yml` runs, then the Docker image is tagged `ghcr.io/<owner>/manlycam:<sha>` and `ghcr.io/<owner>/manlycam:latest`; no `manlycam-server` or `manlycam-web` image is pushed.

- [x] AC 8: Given `apps/server/deploy/` no longer exists, when an operator looks for deployment configs, then `docs/deploy/` contains `docker-compose.yml`, `frps.toml`, `mediamtx-server.yml`, `nginx.conf`, and a `traefik/` subdirectory with its own `docker-compose.yml`, `frps.toml`, and `traefik.yml`.

---

## Additional Context

### Dependencies

No new npm dependencies. `serveStatic` and `readFileSync` already imported in `app.ts`. `@hono/node-server/serve-static` already in `package.json`.

### Testing Strategy

No new test files needed. The `env.ts` helper is pure logic with no side effects beyond reading `window.__env__`. Existing test stubs (`import.meta.env.VITE_PET_NAME = 'Buddy'`) continue to work because `window.__env__` is `undefined` in jsdom, so the fallback path is taken. AC #4 is verified by running the existing suite after the component updates.

### Notes

- **`serveStatic` absolute path confirmed (Step 2)**: Source at `@hono/node-server@1.19.11` uses `path.join(root, filename)` — absolute root paths work correctly. No `process.cwd()` adjustment needed. `root: distPath` with `/repo/apps/web/dist` works as-is.
- **`__dirname` runtime path confirmed (Step 2)**: `app.ts` sets `__dirname = dirname(fileURLToPath(import.meta.url))`. After tsc, compiled JS lands at `/repo/apps/server/dist/app.js`, so `__dirname = /repo/apps/server/dist`. `distPath = join(__dirname, '../../web/dist')` = `/repo/apps/web/dist`. Dockerfile COPY target must match exactly.
- **6 web components confirmed (Step 2)**: All 6 use bare top-of-`<script setup>` assignments (`const petName = import.meta.env.VITE_PET_NAME as string`). Simple 1-line replacements to named imports from `~/lib/env.ts`.
- **`index.html` injection point confirmed (Step 2)**: `<head>` is on line 3; first child is `<meta charset...>` on line 4. Inject `window.__env__` script block between `<head>` and first child. Replace `<title>ManlyCam</title>` (line 24) with `<title>__SITE_NAME__</title>`.
- **`server-ci.yml` migration confirmed (Step 2)**: Web CI steps = `prisma generate` (already in server-ci), `pnpm --filter @manlycam/web lint`, `typecheck`, `exec vitest run --coverage`, coverage report action, `build`. Docker build step stays but Dockerfile handles web build internally; CI build step is a validity check only.
- **Compose file relative path references** (`./frps.toml`, `./mediamtx-server.yml`) remain valid after move since all files move as a unit.
- `.env.example` stays in `apps/server/` — it's used for local dev, not just deploy reference.
- `apps/web/index.html`'s inline dark-mode script has no `${...}` patterns — no conflict with any envsubst-style tooling if ever used in future.
