# Story 6.1: Remove Go Agent, Extract mediamtx, and Clean Unused Dependencies

Status: review

## Story

As a developer,
I want the Go agent removed, the server-side mediamtx subprocess extracted to a standalone service, and unused dependencies cleaned up,
So that the codebase reflects the current architecture with no dead code, no unnecessary process-supervision complexity, and no stale dependencies.

## Acceptance Criteria

**AC #1 — Go agent directory and CI removed**

Given the `apps/agent/` directory exists in the monorepo
When Story 6.1 is complete
Then `apps/agent/` is deleted, `.github/workflows/agent-ci.yml` is deleted, and `pnpm-workspace.yaml` no longer references `apps/agent`

> Dev note: `pnpm-workspace.yaml` currently uses `apps/*` glob — removing the `apps/agent/` directory is sufficient; the yaml file itself may not need editing. Confirm after deletion.

**AC #2 — AGENT_API_KEY removed**

Given `AGENT_API_KEY` exists in `apps/server/src/env.ts` and `apps/server/.env.example`
When an audit confirms it is unused (no server-side code sends or validates this header post-agent removal)
Then `AGENT_API_KEY` is removed from `env.ts` and `.env.example`

> Dev note: There is **no** `agentAuth.ts` middleware file in the current codebase — the AC referencing middleware removal is moot. `AGENT_API_KEY` only appears in `env.ts:16` and `.env.example:50`. Also remove it from `docker-compose.yml` (line 41: `AGENT_API_KEY: "${AGENT_API_KEY}"`).

**AC #3 — Workspace resolves without errors after removal**

Given the cleanup is complete
When `pnpm install` is run from the repo root
Then workspace resolves without errors; no broken imports or references to the agent remain

And server CI and web CI still pass after the removal

**AC #4 — mediamtx subprocess management removed from streamService.ts**

Given `streamService.ts` currently spawns mediamtx as a child process
When Story 6.1 is complete
Then `buildMTXConfig()`, `supervisorLoop()`, `runMediamtx()`, the `ChildProcess` import, the `proc` field, the `configDir` field, and all temp directory logic (`mkdtempSync`, `writeFileSync`, `rmSync`, `tmpdir`, `join` imports) are removed from `streamService.ts`; the server no longer spawns or supervises any mediamtx process

**AC #5 — streamService.ts and stream.ts use configurable mediamtx URLs**

Given mediamtx is no longer spawned by the server
When the server starts
Then `streamService.ts` polls the external mediamtx API using `MTX_API_URL` (new env var, e.g. `http://127.0.0.1:9997` for local dev, `http://mediamtx:9997` in Docker Compose), and the WHEP proxy in `stream.ts` forwards to `MTX_WEBRTC_URL` (new env var, e.g. `http://127.0.0.1:8888` for local dev, `http://mediamtx:8888` in Docker Compose)

**AC #6 — Docker Compose updated with mediamtx service**

Given a Docker Compose file exists at `apps/server/deploy/docker-compose.yml`
When Story 6.1 is complete
Then the compose file includes a named `mediamtx` service with: an appropriate public image, RTSP port (8554), WebRTC port (8888), API port (9997), a `mediamtx.yml` config volume, and `restart: unless-stopped`

And the server service's environment section is updated to use `MTX_API_URL` and `MTX_WEBRTC_URL` (replacing `MTX_WEBRTC_PORT` and `MTX_API_PORT`)

**AC #7 — mediamtx.yml example config added to repo**

And a `mediamtx.yml` example config is included at `apps/server/deploy/mediamtx-server.yml`, configured for the server-side role: RTSP source from frp tunnel → WebRTC WHEP output, all other protocols disabled

**AC #8 — hls.js removed from web package**

Given `hls.js` (`^1.5.0`) is listed as a dependency in `apps/web/package.json`
When Story 6.1 is complete
Then `hls.js` is removed from `apps/web/package.json`, `pnpm-lock.yaml` is updated accordingly, and no import of `hls.js` remains anywhere in `apps/web/src/`

And all existing server CI and web CI checks continue to pass

## Tasks / Subtasks

- [x] Task 1: Remove Go agent workspace (AC: #1, #3)
  - [x] Delete `apps/agent/` directory entirely
  - [x] Delete `.github/workflows/agent-ci.yml`
  - [x] Verify `pnpm-workspace.yaml` — if `apps/*` glob is used, no edit needed; confirm with `pnpm install`
  - [x] Run `pnpm install` from repo root to confirm workspace resolves cleanly

- [x] Task 2: Remove AGENT_API_KEY (AC: #2)
  - [x] Remove `AGENT_API_KEY: z.string().min(1),` from `apps/server/src/env.ts`
  - [x] Remove `AGENT_API_KEY=change-me-to-a-random-secret` from `apps/server/.env.example`
  - [x] Remove `AGENT_API_KEY: "${AGENT_API_KEY}"` from `apps/server/deploy/docker-compose.yml`
  - [x] Search codebase for any remaining references to `AGENT_API_KEY` and remove

- [x] Task 3: Refactor streamService.ts — remove subprocess management (AC: #4, #5)
  - [x] Remove imports: `spawn`, `ChildProcess` from `node:child_process`; `mkdtempSync`, `writeFileSync`, `rmSync` from `node:fs`; `tmpdir` from `node:os`; `join` from `node:path`
  - [x] Remove exported `buildMTXConfig()` function
  - [x] Remove private fields: `proc: ChildProcess | null`, `configDir: string | null`
  - [x] Remove private methods: `supervisorLoop()`, `runMediamtx()`
  - [x] Update `start()` method: remove `supervisorLoop()` call; keep only `pollLoop()` call
  - [x] Update `stop()` method: remove `proc?.kill('SIGTERM')` and configDir cleanup; keep only `this.stopped = true`
  - [x] Update `pollMediamtxState()`: replace `http://127.0.0.1:${env.MTX_API_PORT}/v3/paths/get/cam` with `${env.MTX_API_URL}/v3/paths/get/cam`

- [x] Task 4: Update stream.ts WHEP proxy URL (AC: #5)
  - [x] Change `mtxWhepBase` from `` `http://127.0.0.1:${env.MTX_WEBRTC_PORT}/cam/whep` `` to `` `${env.MTX_WEBRTC_URL}/cam/whep` ``

- [x] Task 5: Update env.ts with new URL vars (AC: #5)
  - [x] Remove `MTX_WEBRTC_PORT` and `MTX_API_PORT` from zod schema
  - [x] Add `MTX_API_URL: z.string().url().default('http://127.0.0.1:9997')`
  - [x] Add `MTX_WEBRTC_URL: z.string().url().default('http://127.0.0.1:8888')`
  - [x] Update `.env.example`: remove `MTX_WEBRTC_PORT` and `MTX_API_PORT` block; add `MTX_API_URL` and `MTX_WEBRTC_URL` with local-dev defaults and Docker Compose values documented in comments

- [x] Task 6: Update streamService.test.ts (AC: #4, #5)
  - [x] Remove mocks for `node:child_process`, `node:fs`, `node:os`, `node:path`
  - [x] Remove `buildMTXConfig` describe block (3 tests)
  - [x] Remove `spawn` mock usage from `StreamService state machine` suite
  - [x] Update env mock: replace `MTX_WEBRTC_PORT`/`MTX_API_PORT` with `MTX_API_URL: 'http://127.0.0.1:9997'` and `MTX_WEBRTC_URL: 'http://127.0.0.1:8888'`
  - [x] Update `stop()` test: remove assertion that `mockProc.kill` was called (proc no longer managed here)
  - [x] Update any fetch URL assertions that reference the old port-based URL pattern (e.g. `/v3/paths/get/cam` calls now use `http://127.0.0.1:9997/v3/paths/get/cam` — verify existing `.toContain('/v3/paths/get/cam')` checks still hold)
  - [x] Ensure all remaining tests pass

- [x] Task 7: Update docker-compose.yml with mediamtx service (AC: #6)
  - [x] Add `mediamtx` service with `bluenviron/mediamtx:latest` image (or verify current stable tag)
  - [x] Expose RTSP port 8554, WebRTC port 8888, API port 9997 (not published externally — internal Docker network only, except 8554 for frpc RTSP push)
  - [x] Mount `./mediamtx-server.yml:/mediamtx.yml:ro`
  - [x] Set `restart: unless-stopped`
  - [x] Update `server` service environment: replace `MTX_WEBRTC_PORT`/`MTX_API_PORT` with `MTX_API_URL: "http://mediamtx:9997"` and `MTX_WEBRTC_URL: "http://mediamtx:8888"`
  - [x] Add `depends_on: mediamtx` to server service (mediamtx must be up before server starts polling)

- [x] Task 8: Create deploy/mediamtx-server.yml example config (AC: #7)
  - [x] Create `apps/server/deploy/mediamtx-server.yml` with server-side mediamtx config:
    - All protocols disabled except WebRTC (port 8888) and API (port 9997)
    - RTSP listen disabled (`:0`) — we receive RTSP from Pi via frp push, not self-serve
    - Paths section: `cam` path with `source: rtsp://${FRP_HOST}:${FRP_RTSP_PORT}/cam`, `sourceProtocol: tcp`
    - Note: this is a static example; operators substitute actual FRP_HOST/FRP_RTSP_PORT values
  - [x] Update compose file volume comment to reference this file

- [x] Task 9: Remove hls.js from web (AC: #8)
  - [x] Remove `"hls.js": "^1.5.0"` from `apps/web/package.json` dependencies
  - [x] Run `pnpm install` to update `pnpm-lock.yaml`
  - [x] Verify no `import ... from 'hls.js'` anywhere in `apps/web/src/` (search codebase)
  - [x] Run web CI checks to confirm clean build and test pass

- [x] Task 10: Final verification (AC: #3, #8)
  - [x] Run `pnpm --filter @manlycam/server test` — all tests pass
  - [x] Run `pnpm --filter @manlycam/web test` — all tests pass
  - [x] Run typecheck: `pnpm --filter @manlycam/server exec tsc --noEmit`
  - [x] Run typecheck: `pnpm --filter @manlycam/web exec tsc --noEmit`
  - [x] Run lint: `pnpm --filter @manlycam/server exec eslint .`
  - [x] Run lint: `pnpm --filter @manlycam/web exec eslint .`
  - [x] Confirm `apps/agent/` directory and `agent-ci.yml` are gone from the file tree

## Dev Notes

### Overview of Three Cleanup Items

This story has three independent cleanup areas — each is low-risk but important for architectural hygiene:

1. **Go agent removal** — Delete `apps/agent/` and its CI workflow; remove `AGENT_API_KEY` from server env. No behavior change.
2. **mediamtx subprocess extraction** — `streamService.ts` currently spawns mediamtx as a child process. After this story, mediamtx runs as an independent service (Docker Compose or systemd on bare metal). Server connects via configurable URL env vars.
3. **hls.js removal** — `hls.js` was added in an early story and became unused when HLS was replaced by WebRTC in Story 3-2c. It's a one-line delete.

### mediamtx Extraction Details

**What streamService.ts RETAINS (behavior unchanged):**
- `pollLoop()` and `pollMediamtxState()` — polls external mediamtx API at `/v3/paths/get/cam`
- `reapplyCameraSettings()` — proxies PATCH to Pi mediamtx via frp tunnel (`http://${env.FRP_HOST}:${env.FRP_API_PORT}/v3/config/paths/patch/cam`)
- `getState()`, `isPiReachable()`, `setAdminToggle()`, `broadcastState()` — all behavior unchanged

**What streamService.ts LOSES:**
- `buildMTXConfig()` — was exported; 3 tests in `buildMTXConfig` describe block test it → all 3 tests deleted
- `supervisorLoop()` — the restart loop
- `runMediamtx()` — the `spawn()` wrapper
- `proc: ChildProcess | null` private field
- `configDir: string | null` private field
- All Node.js process/fs/os/path imports

**start() before:**
```ts
async start(): Promise<void> {
  // ... db upsert ...
  this.supervisorLoop().catch(...);
  this.pollLoop().catch(...);
}
```

**start() after:**
```ts
async start(): Promise<void> {
  const config = await prisma.streamConfig.upsert({ ... });
  this.adminToggle = config.adminToggle as 'live' | 'offline';
  this.pollLoop().catch((err) => {
    logger.error({ err }, 'mediamtx poll loop exited unexpectedly');
  });
}
```

**stop() before:**
```ts
stop(): void {
  this.stopped = true;
  this.proc?.kill('SIGTERM');
  if (this.configDir) {
    rmSync(this.configDir, { recursive: true, force: true });
    this.configDir = null;
  }
}
```

**stop() after:**
```ts
stop(): void {
  this.stopped = true;
}
```

### env.ts URL Variable Pattern

The key design change: instead of port-number env vars and hardcoded `127.0.0.1`, use full URL env vars so Docker Compose can set `http://mediamtx:9997` and local dev can use `http://127.0.0.1:9997` defaults.

```ts
// REMOVE:
MTX_WEBRTC_PORT: z.string().min(1).default('8889'),
MTX_API_PORT: z.string().min(1).default('9997'),

// ADD:
MTX_API_URL: z.string().url().default('http://127.0.0.1:9997'),
MTX_WEBRTC_URL: z.string().url().default('http://127.0.0.1:8888'),
```

Note the default WebRTC port changes from `8889` to `8888`. mediamtx's default WebRTC port is `8888`, not `8889`. The old config used `8889` because the generated `buildMTXConfig()` set `webrtcAddress: ":8889"` explicitly. Now that mediamtx runs with its own static config, it uses its default port `8888`. Make sure `mediamtx-server.yml` and `.env.example` are consistent.

### stream.ts Change

```ts
// BEFORE:
const mtxWhepBase = () => `http://127.0.0.1:${env.MTX_WEBRTC_PORT}/cam/whep`;

// AFTER:
const mtxWhepBase = () => `${env.MTX_WEBRTC_URL}/cam/whep`;
```

### streamService.test.ts Changes

The test file mocks `node:child_process`, `node:fs`, `node:os`, `node:path` — all of these mocks can be removed after the refactor.

The `buildMTXConfig` describe block (3 tests) is deleted entirely.

The env mock changes from:
```ts
env: {
  FRP_HOST: 'frps',
  FRP_RTSP_PORT: '11935',
  FRP_API_PORT: '7400',
  MTX_WEBRTC_PORT: '8889',
  MTX_API_PORT: '9997',
},
```
To:
```ts
env: {
  FRP_HOST: 'frps',
  FRP_RTSP_PORT: '11935',
  FRP_API_PORT: '7400',
  MTX_API_URL: 'http://127.0.0.1:9997',
  MTX_WEBRTC_URL: 'http://127.0.0.1:8888',
},
```

The `stop() kills the mediamtx process` test currently asserts `expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM')`. After the refactor, `stop()` only sets `this.stopped = true`. Replace this test with: `stop() sets stopped flag and does not throw`. The `spawn` mock and `makeMockProc` helper can be removed from this test file.

The `StreamService camera reapply` suite's `mockFetch.mock.calls[0][0].toContain('/v3/paths/get/cam')` assertion still holds — the path is unchanged; only the host prefix changes from `http://127.0.0.1:9997` to whatever `MTX_API_URL` is set to (same in test).

### Docker Compose mediamtx Service

The mediamtx Docker image is published by the bluenviron project: `ghcr.io/bluenviron/mediamtx:latest` or `docker.io/bluenviron/mediamtx:latest`. Either works; verify current latest tag.

RTSP port 8554 should be published externally (the frpc tunnel on the Pi pushes RTSP to this port). WebRTC (8888) and API (9997) are internal only — accessed by the server container over Docker bridge DNS.

```yaml
mediamtx:
  image: bluenviron/mediamtx:latest
  restart: unless-stopped
  ports:
    - "8554:8554"   # RTSP — frpc on Pi pushes stream here
    # 8888 (WebRTC) and 9997 (API) are internal-only — server reaches via Docker bridge
  volumes:
    - ./mediamtx-server.yml:/mediamtx.yml:ro
```

### mediamtx-server.yml Config Notes

The static config (`apps/server/deploy/mediamtx-server.yml`) replaces what `buildMTXConfig()` generated dynamically. Key fields:

```yaml
# ManlyCam server-side mediamtx configuration
# Ingests RTSP from Pi via frp tunnel → publishes as WebRTC WHEP for browsers.
# Substitute FRP_HOST and FRP_RTSP_PORT with your actual values.

rtspAddress: ":8554"    # Expose RTSP for frpc push (Pi → frps → mediamtx)
rtmpAddress: ":0"       # disabled
hlsAddress: ":0"        # disabled
srtAddress: ":0"        # disabled
webrtcAddress: ":8888"  # WebRTC WHEP — Hono proxies this to browsers

api: yes
apiAddress: "127.0.0.1:9997"  # Internal API — server polls for Pi reachability

paths:
  cam:
    source: rtsp://FRP_HOST:FRP_RTSP_PORT/cam
    sourceProtocol: tcp
```

Note: `rtspAddress: ":8554"` (not `:0`) — mediamtx needs to listen for RTSP from the frpc tunnel. The Pi's frpc pushes RTSP to the frps server, which forwards to mediamtx's RTSP port. Unlike the original `buildMTXConfig()` which set `rtspAddress: ":0"` (disabled), the actual server setup requires RTSP enabled for the frp tunnel ingest.

Wait — actually need to clarify: frpc creates a tunnel from Pi's mediamtx RTSP output to frps's exposed port 11935. mediamtx on the server acts as an RTSP *source reader*, not an RTSP listener. The `source: rtsp://frps:11935/cam` means mediamtx *pulls* from frps's tunnel endpoint. So `rtspAddress: ":0"` (disabled) is correct — mediamtx doesn't need to listen for inbound RTSP; it's pulling from frps as a client. The original `buildMTXConfig()` had it right. Keep `rtspAddress: ":0"`.

### Dockerfile Note

The server Dockerfile installs `ffmpeg` with comment "ffmpeg is required for HLS stream transcoding." HLS was removed in Story 3-2c. There is **no mediamtx binary in the Dockerfile** — mediamtx was always spawned from PATH on the host/container, not bundled. Post this story, mediamtx is a separate Docker service and the server image has no dependency on it at all.

Consider removing the `ffmpeg` install from the Dockerfile (also stale) as part of this cleanup. It's not in the ACs but it's trivial and consistent with the "remove stale dependencies" theme. Check if ffmpeg is used anywhere else in `apps/server/` before removing.

### pnpm-workspace.yaml

Current content:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

The `apps/*` glob will automatically stop including `apps/agent` when the directory is deleted. **No edit required** to `pnpm-workspace.yaml` itself.

### File Safety — No Behavior Regression

The `streamService.ts` public API (`getState()`, `isPiReachable()`, `setAdminToggle()`, `start()`, `stop()`) is unchanged in signature. All callers in `stream.ts`, `app.ts` (or wherever `streamService.start()` is called) will continue to work without modification beyond the URL env var changes.

## Project Structure Notes

### Files to DELETE
- `apps/agent/` — entire directory
- `.github/workflows/agent-ci.yml`

### Files to MODIFY
- `apps/server/src/services/streamService.ts` — remove subprocess management; update MTX_API_PORT → MTX_API_URL
- `apps/server/src/services/streamService.test.ts` — remove 3 buildMTXConfig tests, update mocks
- `apps/server/src/routes/stream.ts` — update mtxWhepBase to use MTX_WEBRTC_URL
- `apps/server/src/env.ts` — replace MTX_WEBRTC_PORT/MTX_API_PORT with MTX_API_URL/MTX_WEBRTC_URL
- `apps/server/.env.example` — update env var documentation
- `apps/server/deploy/docker-compose.yml` — add mediamtx service, update server env vars, remove AGENT_API_KEY
- `apps/web/package.json` — remove hls.js
- `pnpm-lock.yaml` — updated automatically by pnpm install

### Files to CREATE
- `apps/server/deploy/mediamtx-server.yml` — static mediamtx config example for server-side role

### References

- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-03-11.md] — Full scope expansion rationale with exact code changes
- [Source: apps/server/src/services/streamService.ts] — Current subprocess management code to be removed
- [Source: apps/server/src/routes/stream.ts:28] — `mtxWhepBase()` hardcoded URL to update
- [Source: apps/server/src/env.ts:13-14] — `MTX_WEBRTC_PORT`, `MTX_API_PORT` to replace
- [Source: apps/server/src/env.ts:16] — `AGENT_API_KEY` to remove
- [Source: apps/server/deploy/docker-compose.yml] — Compose file to update
- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.1] — Story requirements
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-03-08.md] — Epic 6 redefinition (Go agent → install script + mediamtx service architecture)
- [Source: apps/server/src/services/streamService.test.ts] — Current tests requiring cleanup

## Change Log

- 2026-03-11: Implemented all 10 tasks — removed Go agent and CI workflow, removed AGENT_API_KEY, extracted mediamtx subprocess management to standalone service (MTX_API_URL/MTX_WEBRTC_URL env vars), updated docker-compose.yml with mediamtx service, created mediamtx-server.yml example config, removed hls.js. 298 server tests + 437 web tests passing, TypeScript clean.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation proceeded without issues.

### Completion Notes List

- Deleted `apps/agent/` (entire Go agent directory) and `.github/workflows/agent-ci.yml`
- `pnpm-workspace.yaml` uses `apps/*` glob — no edit needed; `pnpm install` resolved cleanly
- Removed `AGENT_API_KEY` from `env.ts`, `.env.example`, `deploy/docker-compose.yml`, and `deploy/traefik/docker-compose.yml` (traefik compose not in task list but was also stale — cleaned up for consistency)
- `streamService.ts` fully refactored: removed `buildMTXConfig()`, `supervisorLoop()`, `runMediamtx()`, `proc`, `configDir` fields, and all `node:child_process`/`node:fs`/`node:os`/`node:path` imports; `pollMediamtxState()` now uses `env.MTX_API_URL`; `start()` only calls `pollLoop()`; `stop()` only sets `this.stopped = true`
- `stream.ts` updated: `mtxWhepBase()` now uses `env.MTX_WEBRTC_URL`
- `env.ts` updated: `MTX_WEBRTC_PORT`/`MTX_API_PORT` replaced with `MTX_API_URL`/`MTX_WEBRTC_URL` (URL type, with `http://127.0.0.1` defaults). WebRTC default port corrected from `8889` → `8888` (mediamtx default)
- `streamService.test.ts`: removed all subprocess mocks (`node:child_process`, `node:fs`, `node:os`, `node:path`), deleted `buildMTXConfig` describe block (3 tests removed), updated env mock to URL vars, replaced `stop() kills mediamtx process` with `stop() sets stopped flag and does not throw`, removed `makeMockProc` helper and `spawn` mock usage. Test count: 298 server (was 301, net -3)
- `docker-compose.yml` updated: added `mediamtx` service with `bluenviron/mediamtx:latest`, RTSP port 8554 published, WebRTC/API internal only; server `depends_on: mediamtx`; server env updated to `MTX_API_URL`/`MTX_WEBRTC_URL`
- Created `apps/server/deploy/mediamtx-server.yml` — static mediamtx config with RTSP disabled (`:0`), WebRTC on `:8888`, API on `:9997`, `cam` path pulls from frps RTSP tunnel
- `hls.js` removed from `apps/web/package.json`; no imports existed in `apps/web/src/`; `pnpm install` confirmed `-1` package removed
- Pre-existing ESLint errors on `vitest.config.ts` (server) and `postcss.config.js`/`vite.config.ts` (web) confirmed pre-existing via `git stash` check — not regressions from this story
- All 298 server tests pass; all 437 web tests pass; TypeScript clean for both packages

### File List

**Deleted:**
- `apps/agent/` (entire directory)
- `.github/workflows/agent-ci.yml`

**Modified:**
- `apps/server/src/env.ts`
- `apps/server/src/services/streamService.ts`
- `apps/server/src/services/streamService.test.ts`
- `apps/server/src/routes/stream.ts`
- `apps/server/.env.example`
- `apps/server/deploy/docker-compose.yml`
- `apps/server/deploy/traefik/docker-compose.yml`
- `apps/web/package.json`
- `pnpm-lock.yaml`

**Created:**
- `apps/server/deploy/mediamtx-server.yml`
