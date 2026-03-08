# Story 3.2: Server — frp Stream Ingestion and HLS Transcoding

Status: review

## Story

As a viewer,
I want the server to receive the Pi's camera stream and make it available as HLS,
so that I can watch the stream in any modern browser without a plugin.

## Acceptance Criteria

1. **Given** the frp stream tunnel is connected and `rpicam-vid` is sending MPEG-TS
   **When** the server's ffmpeg process ingests from `tcp://{FRP_HOST}:{FRP_STREAM_PORT}`
   **Then** ffmpeg transcodes to HLS: 2-second segments, 5-segment rolling window, written to `HLS_SEGMENT_PATH`

2. **Given** HLS segments are being written to `HLS_SEGMENT_PATH`
   **When** `GET /hls/stream.m3u8` is requested by an authenticated viewer
   **Then** the current HLS playlist is served with `Content-Type: application/vnd.apple.mpegurl` and `Cache-Control: max-age=2`

3. **Given** `GET /hls/{segment}.ts` is requested by an authenticated viewer
   **When** the segment file exists in `HLS_SEGMENT_PATH`
   **Then** it is served with `Content-Type: video/MP2T`

4. **Given** the Pi tunnel disconnects (Pi powered off or network loss)
   **When** the server detects the frp connection drop (ffmpeg exits)
   **Then** the server updates stream state to `unreachable`, emits `{ type: 'stream:state', payload: { state: 'unreachable', adminToggle: 'live' } }` via `wsHub`, and the Hono server does not crash or lose other active connections

5. **Given** the Pi reconnects after a drop
   **When** the frp tunnel re-establishes and ffmpeg resumes ingestion
   **Then** new segments are generated and the server emits `{ type: 'stream:state', payload: { state: 'live' } }` via `wsHub`

6. **Given** `GET /api/stream/state` is called by an authenticated user
   **When** the request is processed
   **Then** it returns the current `StreamState` JSON matching the shape `{ state: 'live' | 'unreachable' | 'explicit-offline', adminToggle?: 'live' | 'offline' }`

7. **And** HLS segment files are ephemeral — `HLS_SEGMENT_PATH` directory is created on server start if it doesn't exist; contents are cleared on server restart; a tmpfs ramdisk mount at `HLS_SEGMENT_PATH` is documented in the deployment reference configs

8. **And** HLS file serving must be path-traversal-safe — only files within `HLS_SEGMENT_PATH` may be served; requests attempting `../` traversal must return 404

## Tasks / Subtasks

- [x] Task 1: Add `FRP_HOST` env var to env.ts and update deploy configs (AC: 1)
  - [x] Add `FRP_HOST: z.string().min(1).default('localhost')` to `envSchema` in `apps/server/src/env.ts`
  - [x] Add `FRP_HOST=localhost` with comment to `apps/server/.env.example`
  - [x] Add `FRP_HOST: frps` to `services.server.environment` in `apps/server/deploy/docker-compose.yml`
  - [x] Add `FRP_HOST: frps` to `services.server.environment` in `apps/server/deploy/traefik/docker-compose.yml`

- [x] Task 2: Implement `src/services/wsHub.ts` — minimal EventEmitter-based WS hub (AC: 4, 5)
  - [x] Create `apps/server/src/services/wsHub.ts`
  - [x] Export `wsHub` singleton: maintains a `Set<WSClient>` of connected clients, exposes `addClient(send)` returning a dispose function, and `broadcast(message: WsMessage)` that serializes and sends to all clients
  - [x] `WSClient` type: `{ send: (data: string) => void }`
  - [x] Story 3.4 will wire `wsHub` to actual WS upgrade connections; this story only needs the hub to emit (no WS upgrade endpoint yet)
  - [x] **No test file for wsHub.ts** — pure delegation logic, story 3.4 integration-tests it

- [x] Task 3: Implement `src/services/streamService.ts` — ffmpeg subprocess supervisor and stream state machine (AC: 1, 4, 5)
  - [x] Create `apps/server/src/services/streamService.ts`
  - [x] Create `HLS_SEGMENT_PATH` directory on module load (`fs.mkdirSync(env.HLS_SEGMENT_PATH, { recursive: true })`)
  - [x] State machine: `adminToggle: 'live' | 'offline'` (defaults `'live'`) + `piReachable: boolean` (defaults `false`) → derives `StreamState`:
    - `adminToggle === 'offline'` → `{ state: 'explicit-offline' }`
    - `adminToggle === 'live' && piReachable` → `{ state: 'live' }`
    - `adminToggle === 'live' && !piReachable` → `{ state: 'unreachable', adminToggle: 'live' }`
  - [x] Export `streamService` singleton with methods:
    - `getState(): StreamState` — returns current derived state
    - `setAdminToggle(toggle: 'live' | 'offline'): void` — updates adminToggle, calls `_broadcastState()` (used by Story 3.5)
    - `start(): void` — begins the ffmpeg supervisor loop (call once on server startup)
    - `stop(): void` — stops the supervisor (for graceful shutdown)
  - [x] Private `_supervisorLoop()`: runs in background (no `await` at call site, fire-and-forget with error catch); when `adminToggle === 'offline'`, skip launching ffmpeg and poll every 2s; when `adminToggle === 'live'`, spawn ffmpeg and:
    - On ffmpeg spawn: set `piReachable = true`, call `_broadcastState()`
    - On ffmpeg `'close'` or `'error'` (crash/disconnect): set `piReachable = false`, call `_broadcastState()`, wait 5s, retry
    - On `stop()`: signal loop to exit (use a `stopped` flag + `AbortController` for the subprocess)
  - [x] Private `_broadcastState()`: `wsHub.broadcast({ type: 'stream:state', payload: this.getState() })`
  - [x] ffmpeg spawn command (exact):
    ```
    ffmpeg -re -i tcp://{env.FRP_HOST}:{env.FRP_STREAM_PORT}
           -c:v copy -an
           -f hls
           -hls_time 2
           -hls_list_size 5
           -hls_flags delete_segments+append_list
           -hls_segment_filename '{HLS_SEGMENT_PATH}/segment%03d.ts'
           '{HLS_SEGMENT_PATH}/stream.m3u8'
    ```
    - `-re` — read input at native frame rate (matches real-time MPEG-TS speed)
    - `-c:v copy` — no transcoding; Pi already encoded H.264
    - `-an` — no audio (Pi camera has no mic)
    - `-hls_flags delete_segments+append_list` — rolling window + append to playlist

- [x] Task 4: Implement `src/services/streamService.test.ts` — stream state machine unit tests (AC: 4, 5, 6)
  - [x] Use `vi.mock('node:child_process')` to mock `spawn`; never exec real ffmpeg in tests
  - [x] Test: initial state → `{ state: 'unreachable', adminToggle: 'live' }` (piReachable defaults false)
  - [x] Test: after ffmpeg spawns → `{ state: 'live' }`
  - [x] Test: after ffmpeg exits → `{ state: 'unreachable', adminToggle: 'live' }` and `wsHub.broadcast` called with correct payload
  - [x] Test: `setAdminToggle('offline')` while piReachable=true → `{ state: 'explicit-offline' }` (no `adminToggle` field in payload)
  - [x] Test: `setAdminToggle('live')` while piReachable=false → `{ state: 'unreachable', adminToggle: 'live' }`
  - [x] Mock `wsHub` to capture broadcast calls: `vi.mock('../services/wsHub.js', () => ({ wsHub: { broadcast: vi.fn() } }))`

- [x] Task 5: Implement `src/routes/stream.ts` — HLS serving and stream state endpoint (AC: 2, 3, 6, 8)
  - [x] Create `apps/server/src/routes/stream.ts`
  - [x] `GET /api/stream/state` — `requireAuth` guarded; returns `c.json(streamService.getState())`
  - [x] `GET /hls/stream.m3u8` — `requireAuth` guarded; reads and serves `HLS_SEGMENT_PATH/stream.m3u8` with:
    - `Content-Type: application/vnd.apple.mpegurl`
    - `Cache-Control: max-age=2, must-revalidate`
    - Returns 503 (not 404) if file missing — stream exists, just no segments yet
  - [x] `GET /hls/:segment` — `requireAuth` guarded; the `:segment` param must match `*.ts` pattern:
    - Validate `segment` ends with `.ts` — otherwise 404
    - Resolve full path: `resolve(env.HLS_SEGMENT_PATH, segment)`
    - Path traversal check: if resolved path does NOT start with `resolve(env.HLS_SEGMENT_PATH)` → 404 (no error detail)
    - Read file → serve with `Content-Type: video/MP2T`
    - File not found → 404

- [x] Task 6: Implement `src/routes/stream.test.ts` — HLS route and stream state tests (AC: 2, 3, 6, 8)
  - [x] Mock `streamService` and `wsHub` at module level
  - [x] Test: `GET /api/stream/state` without auth → 401
  - [x] Test: `GET /api/stream/state` with auth → 200, returns `StreamState` JSON
  - [x] Test: `GET /hls/stream.m3u8` without auth → 401
  - [x] Test: `GET /hls/stream.m3u8` with auth, file exists → 200 with correct Content-Type and Cache-Control headers
  - [x] Test: `GET /hls/stream.m3u8` with auth, file missing → 503
  - [x] Test: `GET /hls/segment001.ts` with auth, file exists → 200, Content-Type: video/MP2T
  - [x] Test: `GET /hls/../etc/passwd` (path traversal) → 404 (no traversal possible)
  - [x] Test: `GET /hls/segment.json` (wrong extension) → 404

- [x] Task 7: Wire stream service and routes into `apps/server/src/app.ts` (AC: 1, 6)
  - [x] Import `streamRouter` from `./routes/stream.js` and add `app.route('/', streamRouter)`
  - [x] `streamService.start()` must be called once on server startup — call it in `apps/server/src/index.ts` AFTER `createApp()` returns (not inside `createApp()`)
  - [x] Ensure graceful shutdown: on process SIGTERM/SIGINT, call `streamService.stop()` before `server.close()`
  - [x] Check `apps/server/src/index.ts` for existing shutdown handling and add `streamService.stop()` there

- [x] Task 8: Run full server test suite and verify coverage baseline maintained (AC: all)
  - [x] `pnpm --filter @manlycam/server test` — all tests pass (75 tests, 10 test files)
  - [x] `pnpm --filter @manlycam/server exec tsc --noEmit` — zero type errors
  - [x] Coverage thresholds updated to recorded actuals (Story 3.2): lines 85%, functions 87%, branches 90%, statements 85%. wsHub.ts intentionally untested until story 3.4.
  - [x] `pnpm --filter @manlycam/server lint` — zero lint errors

## Dev Notes

### Stream Pipeline Architecture (Full Picture)

```
Pi (rpicam-vid --listen :5000)
  └─frpc──►frps:7000 (control channel)
              frps exposes :11935 (stream) and :11936 (api)
              ↓ when ffmpeg connects to frps:11935
  ffmpeg -i tcp://frps:11935 → HLS segments → HLS_SEGMENT_PATH
              ↑ frps tunnels ffmpeg's connection through to Pi:5000
```

- `frps` (Docker service name) listens on Docker-internal network; not published to host on 11935/11936
- Server container connects to `frps:11935` via Docker bridge network using the service hostname `frps`
- `FRP_HOST` env var = `frps` in Docker compose, `localhost` for bare metal
- ffmpeg acts as **TCP client** connecting to frps:11935 — frp routes it to Pi's rpicam-vid TCP server

### FRP_HOST Env Var — Why It's Needed

The existing `FRP_STREAM_PORT` and `FRP_API_PORT` env vars only carry port numbers. The host name differs between deployment environments:
- **Docker:** frps is the Docker service name `frps` (resolved by Docker DNS on the internal network)
- **Bare metal:** frps and server both on the same host → `localhost`

Add `FRP_HOST` as an optional env var with default `localhost`. Set `FRP_HOST: frps` in both docker-compose files.

### ffmpeg Command — Exact Form

```bash
ffmpeg \
  -re \
  -i "tcp://${FRP_HOST}:${FRP_STREAM_PORT}" \
  -c:v copy \
  -an \
  -f hls \
  -hls_time 2 \
  -hls_list_size 5 \
  -hls_flags delete_segments+append_list \
  -hls_segment_filename "${HLS_SEGMENT_PATH}/segment%03d.ts" \
  "${HLS_SEGMENT_PATH}/stream.m3u8"
```

Key flag rationale:
- `-re` — read input in real time; prevents ffmpeg from buffering ahead of actual stream rate
- `-c:v copy` — Pi already encoded H.264; just remux into HLS container (no CPU transcoding on server)
- `-an` — no audio track (Arducam has no mic); prevents ffmpeg from waiting for audio
- `-hls_time 2` — 2-second segments (architecture spec; matches `Cache-Control: max-age=2`)
- `-hls_list_size 5` — rolling playlist of 5 segments = 10s of buffer
- `-hls_flags delete_segments+append_list` — auto-delete old `.ts` files beyond the window; `append_list` keeps playlist open for live streaming
- `segment%03d.ts` — 3-digit zero-padded naming (segment000.ts, segment001.ts, …) avoids race with old names

### Stream State Machine

```
                ┌──────────────────────────────────────────────┐
                │ adminToggle ─── 'offline'                    │
                │     ↓         → state: explicit-offline      │
                │ adminToggle ─── 'live' + piReachable=true    │
                │     ↓         → state: live                  │
                │ adminToggle ─── 'live' + piReachable=false   │
                │     ↓         → state: unreachable,          │
                │               adminToggle: 'live'            │
                └──────────────────────────────────────────────┘
```

- Default on server start: `adminToggle = 'live'`, `piReachable = false` → initial state = `unreachable`
- When ffmpeg spawns successfully (TCP connection to frps established): `piReachable = true` → `live`
- When ffmpeg exits (Pi disconnects, frps drops connection): `piReachable = false` → `unreachable`
- `adminToggle` persists in-memory only; lost on server restart (always resets to `'live'`)
- Story 3.5 adds the admin endpoint to call `streamService.setAdminToggle('offline' | 'live')`

### StreamState Type (from packages/types)

```typescript
// packages/types/src/ws.ts — already defined, do NOT redefine
export interface StreamState {
  state: 'live' | 'unreachable' | 'explicit-offline'
  adminToggle?: 'live' | 'offline' // present on 'unreachable' to distinguish FR10 states
}

export type WsMessage = ... | { type: 'stream:state'; payload: StreamState } | ...
```

Import from `'@manlycam/types'` — the package is already a workspace dependency of `apps/server`.

### wsHub.ts — Minimal Scope for Story 3.2

Story 3.4 (WebSocket Hub and Real-Time State Broadcasting) will add:
- WS upgrade endpoint (`/ws` route)
- Connection lifecycle (ping/pong, reconnect, presence events, chat delivery)
- Full integration tests

Story 3.2 only creates the `wsHub` singleton with the `broadcast()` method and `addClient()` scaffolding. The Set of clients will be empty in story 3.2 (no WS upgrade endpoint yet). `broadcast()` will no-op until 3.4 wires clients in. The stream state emission in story 3.2 is fully wired — it just won't reach browser clients until 3.4.

```typescript
// apps/server/src/services/wsHub.ts
import type { WsMessage } from '@manlycam/types';

type WSClient = { send: (data: string) => void };

class WsHub {
  private readonly clients = new Set<WSClient>();

  addClient(client: WSClient): () => void {
    this.clients.add(client);
    return () => { this.clients.delete(client); };
  }

  broadcast(message: WsMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      try {
        client.send(data);
      } catch {
        // client disconnected between check and send; addClient dispose handles cleanup
      }
    }
  }
}

export const wsHub = new WsHub();
```

### streamService.ts — Implementation Pattern

```typescript
// apps/server/src/services/streamService.ts
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { env } from '../env.js';
import { wsHub } from './wsHub.js';
import type { StreamState } from '@manlycam/types';

class StreamService {
  private adminToggle: 'live' | 'offline' = 'live';
  private piReachable = false;
  private stopped = false;
  private currentProc: ChildProcess | null = null;

  constructor() {
    mkdirSync(env.HLS_SEGMENT_PATH, { recursive: true });
  }

  getState(): StreamState {
    if (this.adminToggle === 'offline') return { state: 'explicit-offline' };
    if (this.piReachable) return { state: 'live' };
    return { state: 'unreachable', adminToggle: 'live' };
  }

  setAdminToggle(toggle: 'live' | 'offline'): void {
    this.adminToggle = toggle;
    this._broadcastState();
  }

  start(): void {
    this._supervisorLoop().catch((err) => {
      // Supervisor exited unexpectedly — log but do not crash the server
      // pino logger available as logger from '../lib/logger.js'
    });
  }

  stop(): void {
    this.stopped = true;
    this.currentProc?.kill('SIGTERM');
  }

  private _broadcastState(): void {
    wsHub.broadcast({ type: 'stream:state', payload: this.getState() });
  }

  private async _supervisorLoop(): Promise<void> {
    const RETRY_DELAY_MS = 5000;
    while (!this.stopped) {
      if (this.adminToggle === 'offline') {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      await this._runFfmpeg();
      if (!this.stopped) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  private _runFfmpeg(): Promise<void> {
    return new Promise((resolve) => {
      const args = [
        '-re', '-i', `tcp://${env.FRP_HOST}:${env.FRP_STREAM_PORT}`,
        '-c:v', 'copy', '-an',
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_list_size', '5',
        '-hls_flags', 'delete_segments+append_list',
        '-hls_segment_filename', `${env.HLS_SEGMENT_PATH}/segment%03d.ts`,
        `${env.HLS_SEGMENT_PATH}/stream.m3u8`,
      ];
      const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      this.currentProc = proc;

      proc.on('spawn', () => {
        this.piReachable = true;
        this._broadcastState();
      });

      proc.on('error', () => {
        this.piReachable = false;
        this._broadcastState();
        this.currentProc = null;
        resolve();
      });

      proc.on('close', () => {
        if (this.piReachable) {
          this.piReachable = false;
          this._broadcastState();
        }
        this.currentProc = null;
        resolve();
      });
    });
  }
}

export const streamService = new StreamService();
```

### stream.ts Route — Security Notes for HLS Serving

```typescript
// apps/server/src/routes/stream.ts
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { env } from '../env.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { streamService } from '../services/streamService.js';
import type { AppEnv } from '../lib/types.js';

export const streamRouter = new Hono<AppEnv>();

streamRouter.get('/api/stream/state', requireAuth, (c) => {
  return c.json(streamService.getState());
});

streamRouter.get('/hls/stream.m3u8', requireAuth, async (c) => {
  const filePath = resolve(env.HLS_SEGMENT_PATH, 'stream.m3u8');
  try {
    const content = await readFile(filePath);
    return c.body(content as unknown as ReadableStream, 200, {
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'max-age=2, must-revalidate',
    });
  } catch {
    return c.json({ error: { code: 'STREAM_UNAVAILABLE', message: 'No stream data yet' } }, 503);
  }
});

streamRouter.get('/hls/:segment', requireAuth, async (c) => {
  const segment = c.req.param('segment');
  if (!segment.endsWith('.ts')) return c.notFound();

  const hlsBase = resolve(env.HLS_SEGMENT_PATH);
  const filePath = resolve(hlsBase, segment);

  // Path traversal guard — resolved path must be inside HLS_SEGMENT_PATH
  if (!filePath.startsWith(hlsBase + '/') && filePath !== hlsBase) {
    return c.notFound();
  }

  try {
    const content = await readFile(filePath);
    return c.body(content as unknown as ReadableStream, 200, {
      'Content-Type': 'video/MP2T',
    });
  } catch {
    return c.notFound();
  }
});
```

**Security note:** The `filePath.startsWith(hlsBase + '/')` check prevents `../` traversal. The resolved path will NEVER start with the base path after traversal because `resolve()` collapses `..` entries before returning the absolute path.

### app.ts and index.ts Wiring

`createApp()` in `app.ts` should mount `streamRouter`:
```typescript
// In createApp(), after existing routes:
app.route('/', streamRouter);
```

`index.ts` calls `streamService.start()` after server listen:
```typescript
// Check current index.ts structure and add:
streamService.start();

// On SIGTERM/SIGINT add:
streamService.stop();
```

**Read `apps/server/src/index.ts` first** to understand existing shutdown handling before modifying it.

### env.ts Change

```typescript
// Add to envSchema:
FRP_HOST: z.string().min(1).default('localhost'),
```

`default('localhost')` makes this optional in the schema (no `process.env.FRP_HOST` needed for bare-metal or dev). Docker sets it explicitly to `frps`.

### No DB Schema Changes

Stream state is purely in-memory. No Prisma model or migration needed for this story.
- `adminToggle` resets to `'live'` on server restart (acceptable for MVP)
- Story 3.5 may add DB persistence for adminToggle if needed (out of scope now)

### Testing Pattern for streamService

```typescript
// apps/server/src/services/streamService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process');
vi.mock('node:fs');
vi.mock('../services/wsHub.js', () => ({
  wsHub: { broadcast: vi.fn() },
}));

import { spawn } from 'node:child_process';
import { wsHub } from './wsHub.js';
```

Use `EventEmitter` as the mock for the ChildProcess returned by `spawn`:
```typescript
import { EventEmitter } from 'node:events';

const mockProc = new EventEmitter() as any;
mockProc.kill = vi.fn();
vi.mocked(spawn).mockReturnValue(mockProc);

// Trigger spawn event:
mockProc.emit('spawn');
// Verify state:
expect(service.getState()).toEqual({ state: 'live' });

// Trigger disconnect:
mockProc.emit('close', 1, null);
expect(service.getState()).toEqual({ state: 'unreachable', adminToggle: 'live' });
expect(wsHub.broadcast).toHaveBeenCalledWith({
  type: 'stream:state',
  payload: { state: 'unreachable', adminToggle: 'live' },
});
```

### frps Version Coordination

- `snowdreamtech/frps:latest` is pinned in docker-compose (both variants)
- The Pi agent Story 3.1 uses frpc v0.6x+ TOML format: `auth.token = "..."` inline
- The deployed `frps.toml` uses `[auth]` section format — this is **compatible** with frp v0.6x+
- Both formats are accepted by frp v0.6x's TOML parser (TOML section `[auth]` sets the same field as dot-notation `auth.token`)
- **No version pin change needed** for this story; verify if frps healthcheck or version logging shows ≥ v0.6 in deployment

### HLS Segment Path — tmpfs Documentation

The `.env.example` already documents `HLS_SEGMENT_PATH=/tmp/manlycam/hls`. Add a comment to the docker-compose that a tmpfs mount at `HLS_SEGMENT_PATH` eliminates disk wear in production. This is reference documentation only; implementation is an operator concern.

### Previous Story Learnings (Story 3.1)

From Story 3.1 implementation:
- **frpc config format (v0.6x+):** `auth.token = "..."` (flat dot notation), `[[proxies]]` arrays. Both frpc and frps are compatible. Already deployed.
- **Named exports only:** `export const streamService = ...`, `export const wsHub = ...` — no `export default`
- **Absolute paths from import.meta.url:** Use `resolve()` and `env` values for all file paths — never relative paths like `./hls`
- **No external logging library:** Use `pino` logger from `apps/server/src/lib/logger.ts` (it's already the server's logger). Do NOT use `console.log`.
- **Tests must pass without Pi hardware or frp:** Mock `spawn` completely; never start a real ffmpeg process in CI
- **Goroutine/supervisor pattern:** Story 3.1's independent supervisor loops became the template — same philosophy applies here: ffmpeg supervisor loop is fire-and-forget, errors are logged but don't crash the server

### Architecture Compliance Checklist

- **No new Prisma models** — stream state is in-memory only
- **No `export default`** — all exports are named (`export const streamService`, `export const wsHub`, `export const streamRouter`)
- **No `new PrismaClient()`** — this story doesn't touch Prisma at all
- **No direct `ulidx` import** — this story doesn't generate IDs
- **Types from `@manlycam/types`** — `StreamState` and `WsMessage` are already defined in `packages/types/src/ws.ts`; import directly, do NOT redefine them
- **Tailwind v3** — no UI changes in this story; N/A
- **No hardcoded secrets** — `FRP_HOST`, `FRP_STREAM_PORT`, `AGENT_API_KEY` all from `env.ts`
- **`AppError` for app errors** — use `new AppError(message, code, statusCode)` if throwing intentional errors; but stream routes use inline `c.json(...)` returns which is appropriate here
- **Co-located tests** — `streamService.test.ts` next to `streamService.ts`, `stream.test.ts` next to `stream.ts`

### Project Structure — Files to Create/Modify

```
apps/server/
├── src/
│   ├── services/
│   │   ├── streamService.ts     (NEW — ffmpeg supervisor + state machine)
│   │   ├── streamService.test.ts (NEW — unit tests, mocked ffmpeg)
│   │   └── wsHub.ts             (NEW — minimal WS hub foundation)
│   ├── routes/
│   │   ├── stream.ts            (NEW — /api/stream/state, /hls/* routes)
│   │   └── stream.test.ts       (NEW — unit tests)
│   ├── app.ts                   (MODIFY — add streamRouter)
│   ├── index.ts                 (MODIFY — call streamService.start() and stop())
│   └── env.ts                   (MODIFY — add FRP_HOST with default)
├── .env.example                 (MODIFY — document FRP_HOST)
└── deploy/
    ├── docker-compose.yml             (MODIFY — add FRP_HOST: frps to server env)
    └── traefik/docker-compose.yml     (MODIFY — add FRP_HOST: frps to server env)

_bmad-output/implementation-artifacts/
└── sprint-status.yaml           (UPDATE — 3-2 status: backlog → ready-for-dev)
```

**DO NOT touch:**
- `apps/agent/` — Pi agent is complete (Story 3.1 done)
- `apps/web/` — SPA is Story 3.3
- `apps/server/prisma/schema.prisma` — no schema changes
- `packages/types/src/ws.ts` — types already defined (StreamState, WsMessage)
- `apps/server/src/services/authService.ts`, `allowlistService.ts`, `userService.ts` — not in scope

## Change Log

- 2026-03-08: Story implemented by claude-sonnet-4-6. Added FRP_HOST env var, wsHub singleton, streamService ffmpeg supervisor with state machine, HLS serving routes, full test coverage. 75 tests passing, zero type/lint errors.

### References

- Story 3.2 ACs: [Source: `_bmad-output/planning-artifacts/epics.md` line 771–799]
- Stream pipeline architecture: [Source: `_bmad-output/planning-artifacts/architecture.md` lines 133–136, 151, 187]
- frps server configuration: [Source: `_bmad-output/planning-artifacts/architecture.md` lines 476–533]
- HLS segment storage: [Source: `_bmad-output/planning-artifacts/architecture.md` lines 353–357]
- StreamState type: [Source: `packages/types/src/ws.ts` lines 55–58]
- WsMessage union: [Source: `packages/types/src/ws.ts` lines 60–73]
- frps.toml (deployed): [Source: `apps/server/deploy/frps.toml`]
- docker-compose (simple): [Source: `apps/server/deploy/docker-compose.yml`]
- docker-compose (traefik): [Source: `apps/server/deploy/traefik/docker-compose.yml`]
- Dockerfile (ffmpeg in runtime image): [Source: `apps/server/Dockerfile` line 28]
- env.ts current schema: [Source: `apps/server/src/env.ts`]
- requireAuth middleware: [Source: `apps/server/src/middleware/requireAuth.ts`]
- Server coverage baseline: lines 81%, functions 73%, branches 82%, statements 81% [Source: `apps/server/vitest.config.ts`]
- Epic 2 retro lesson — atomicity: `prisma.$transaction()` for multi-step ops (N/A this story, no DB)
- Epic 2 retro lesson — named exports only [Source: `_bmad-output/planning-artifacts/epics.md` architecture conventions]
- Story 3.1 frpc format: `auth.token = "..."` dot notation [Source: `_bmad-output/implementation-artifacts/3-1-pi-agent-camera-pipeline-and-frp-tunnels.md` lines 146–172]
- frp stream flow (Pi → frpc → frps → ffmpeg): [Source: `_bmad-output/implementation-artifacts/3-1-pi-agent-camera-pipeline-and-frp-tunnels.md` lines 104]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_No blockers encountered._

### Completion Notes List

- Implemented `wsHub.ts` singleton with `addClient`/`broadcast` as specified; no test file per story design (story 3.4 integration-tests it). Coverage thresholds updated to recorded actuals to account for intentionally untested wsHub.
- `StreamService` class is exported alongside the singleton to enable isolated unit testing with `new StreamService()` per test — clean pattern for mocked spawn/fs tests.
- `spawn` is called synchronously inside the `_runFfmpeg()` Promise constructor, enabling event-driven testing without fake timers.
- Existing `auth.test.ts` and `me.test.ts` required adding `vi.mock('../services/streamService.js')` and `vi.mock('../services/wsHub.js')` mocks since `createApp()` now includes `streamRouter` which imports the `streamService` singleton at module load.
- Path traversal guard verified: `%2F`-encoded traversal with `.ts` suffix correctly returns 404 via the `filePath.startsWith(hlsBase + '/')` check.
- Coverage achieved: lines 85.09%, functions 87.87%, branches 90.43%, statements 85.09%. All 75 tests pass.
- **Future consideration (post-MVP):** The ffmpeg retry loop logs every 5 seconds while the Pi is unreachable, which is noisy when the stream isn't the focus. A heartbeat mechanism (Pi agent pings `/api/agent/heartbeat` on a timer; server marks `piReachable` from that rather than from ffmpeg spawn) would cleanly decouple reachability detection from stream ingestion and eliminate the log noise. ffmpeg would only be launched once the Pi is confirmed reachable.
- **Known Pi agent issue:** `rpicam-vid --listen` crashes with `SIGABRT` (libcamera internal assertion) when the TCP client (ffmpeg) disconnects mid-stream rather than returning to listen. The camera hardware then stays locked in a bad state. The Pi agent's immediate-restart loop (`apps/agent/internal/camera/pipeline.go`) hammers the stuck device every iteration, preventing libcamera from recovering. A 2–3s restart delay in the pipeline loop would give libcamera time to fully release the camera device between attempts. Physical unplug/replug of the camera resets the CSI interface as a workaround.

### File List

apps/server/src/env.ts
apps/server/src/app.ts
apps/server/src/index.ts
apps/server/src/services/wsHub.ts
apps/server/src/services/streamService.ts
apps/server/src/services/streamService.test.ts
apps/server/src/routes/stream.ts
apps/server/src/routes/stream.test.ts
apps/server/src/routes/auth.test.ts
apps/server/src/routes/me.test.ts
apps/server/.env.example
apps/server/deploy/docker-compose.yml
apps/server/deploy/traefik/docker-compose.yml
apps/server/vitest.config.ts
_bmad-output/implementation-artifacts/sprint-status.yaml
