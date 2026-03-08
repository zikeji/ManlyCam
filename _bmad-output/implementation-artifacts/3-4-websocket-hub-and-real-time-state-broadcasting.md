# Story 3.4: WebSocket Hub and Real-Time State Broadcasting

Status: review

## Story

As a **viewer**,
I want stream state changes to appear instantly in my browser without refreshing,
So that I always see the current stream status in real time.

## Acceptance Criteria

1. **WS upgrade — authentication**
   - `GET /ws` validates the `session_id` cookie using the same `requireAuth` logic as REST routes
   - Unauthenticated requests (no cookie, invalid session, banned user) receive `401` — no WebSocket connection is established

2. **WS upgrade — connection registration**
   - On successful WS upgrade, the server registers the connection in `wsHub` via `wsHub.addClient()`
   - The client receives the current stream state as the first outbound message: `{ type: 'stream:state', payload: streamService.getState() }`

3. **WS fan-out**
   - When `wsHub.broadcast(msg)` is called (e.g., from `streamService.broadcastState()`), all registered connections receive the serialised message

4. **WS connection cleanup**
   - When a client's WebSocket connection closes, `wsHub.addClient()` dispose function is called — the client is removed from the registry immediately, no orphaned entries accumulate

5. **SPA — `useWebSocket.ts` composable**
   - Connects to `ws[s]://{host}/ws` (protocol matches page: `wss:` in prod, `ws:` in dev)
   - On `open`: sets `isConnected.value = true`, resets backoff to 1000 ms
   - On `message`: parses JSON as `WsMessage`; dispatches `stream:state` payload to `useStream().setStateFromWs()`; ignores unknown types
   - On `close`: sets `isConnected.value = false`; schedules reconnect using exponential backoff (doubles each attempt, capped at 30 000 ms)
   - On `error`: closes the socket (triggers `onclose` → backoff reconnect)
   - `disconnect()` cancels any pending reconnect timer and closes the socket cleanly

6. **SPA — provide/inject at app root**
   - `App.vue` calls `useWebSocket()` once (creating the singleton) and `provide(WS_INJECTION_KEY, ws)`
   - `App.vue` watches `user` ref from `useAuth()`: calls `ws.connect()` when user becomes truthy; calls `ws.disconnect()` on logout / user null
   - Child components never instantiate their own WS connection; they `inject(WS_INJECTION_KEY)` if they need the interface
   - `WatchView.vue` does **not** need to inject WS for this story — `useStream` reactive state is already updated by the composable's message handler

7. **SPA — dev proxy**
   - `apps/web/vite.config.ts` includes a `/ws` proxy entry pointing to `ws://localhost:3000` with `ws: true` so `vite dev` mode forwards WS upgrades to the Hono server

8. **Coverage thresholds**
   - After all tests pass, update `apps/server/vitest.config.ts` and `apps/web/vite.config.ts` thresholds to reflect the new baseline (run `vitest run --coverage` to measure)

## Tasks / Subtasks

- [x] Create `apps/server/src/routes/ws.ts` — WS upgrade endpoint (AC: #1, #2, #3, #4)
  - [x] Import `upgradeWebSocket` from `@hono/node-ws` (via `createNodeWebSocket` factory — story had wrong import path; correct package is `@hono/node-ws`)
  - [x] Apply `requireAuth` middleware before `upgradeWebSocket` (guards the upgrade)
  - [x] In `onOpen`: call `wsHub.addClient({ send: (data) => ws.send(data) })`, store dispose fn via WeakMap; send `streamService.getState()` as first message
  - [x] In `onClose`: call dispose fn to remove client from hub
  - [x] Export `createWsRouter(upgradeWebSocket)` factory (named export; upgradeWebSocket injected from app.ts)

- [x] Update `apps/server/src/app.ts` — mount wsRouter (AC: #1)
  - [x] Import `createNodeWebSocket` from `@hono/node-ws`; call it with `{ app }` to get `{ upgradeWebSocket, injectWebSocket }`
  - [x] Import `createWsRouter` from `'./routes/ws.js'`; call `app.route('/', createWsRouter(upgradeWebSocket))`
  - [x] Return `{ app, injectWebSocket }` from `createApp()` so `index.ts` can inject WS into the HTTP server

- [x] Update `apps/server/src/index.ts` — enable WS upgrades for Node.js adapter (AC: #2)
  - [x] Destructure `{ app, injectWebSocket }` from `createApp()`
  - [x] Call `injectWebSocket(server)` after `serve(...)` — required for `upgradeWebSocket` to work

- [x] Write `apps/server/src/routes/ws.test.ts` — unit tests (AC: #1, #2, #4)
  - [x] Test: unauthenticated request → 401, no WS established
  - [x] Test: banned user → 401
  - [x] Test: authenticated user — first message is current stream state
  - [x] Test: client close removes client from hub (dispose called)
  - [x] Test: `wsHub.broadcast()` reaches connected clients (via send fn forwarding test)

- [x] Create `apps/web/src/composables/useWebSocket.ts` (AC: #5, #6)
  - [x] Export `WS_INJECTION_KEY: InjectionKey<WsInterface>`
  - [x] `WsInterface`: `{ connect: () => void; disconnect: () => void; isConnected: Readonly<Ref<boolean>> }`
  - [x] `useWebSocket()`: if no injection context (app root call), creates and returns new WS instance; if injection context exists, returns injected value
  - [x] Exponential backoff: start 1000 ms, double on each failure, cap at 30 000 ms; reset to 1000 ms on successful open
  - [x] `onmessage` handler: `JSON.parse(event.data)` → if `msg.type === 'stream:state'` → `useStream().setStateFromWs(msg.payload)`

- [x] Update `apps/web/src/App.vue` — provide WS at root, connect on auth (AC: #6)
  - [x] Import `useWebSocket`, `WS_INJECTION_KEY`, and `provide` from vue
  - [x] Call `const ws = useWebSocket()` in `<script setup>`
  - [x] `provide(WS_INJECTION_KEY, ws)`
  - [x] `watch(user, (u) => { if (u) ws.connect() else ws.disconnect() }, { immediate: true })`

- [x] Write `apps/web/src/composables/useWebSocket.test.ts` (AC: #5)
  - [x] Mock `WebSocket` via `vi.stubGlobal('WebSocket', ...)`
  - [x] Test: `connect()` opens WS to correct URL
  - [x] Test: `stream:state` message → `useStream().setStateFromWs()` called
  - [x] Test: `onclose` triggers reconnect after backoff delay (use `vi.useFakeTimers()`)
  - [x] Test: backoff doubles on repeated failures, capped at 30 000 ms
  - [x] Test: `disconnect()` cancels pending reconnect and closes socket
  - [x] Test: `isConnected` tracks open/close state

- [x] Update `apps/web/vite.config.ts` — add `/ws` dev proxy + update coverage thresholds (AC: #7, #8)
  - [x] Add `'/ws': { target: 'ws://localhost:3000', ws: true }` to `server.proxy`
  - [x] Update coverage thresholds after tests pass

- [x] Update `apps/server/vitest.config.ts` — coverage thresholds (AC: #8)
  - [x] Run `vitest run --coverage` and update thresholds to new baseline

## Dev Notes

### ⚠️ Critical: `injectWebSocket` Is Required for Hono + Node.js WS

Hono's `upgradeWebSocket` for the `@hono/node-server` adapter requires **two imports** and **one extra call** in `index.ts`:

```typescript
// apps/server/src/index.ts — REQUIRED CHANGE
import { injectWebSocket } from '@hono/node-server/ws'

const server = serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`Server running on http://localhost:${info.port}`);
  streamService.start();
});

injectWebSocket(server);  // ← MUST be called immediately after serve()
```

And in the route file:
```typescript
// apps/server/src/routes/ws.ts
import { upgradeWebSocket } from '@hono/node-server/ws'
```

Without `injectWebSocket(server)`, `upgradeWebSocket` silently fails — the HTTP handshake completes but the socket is never upgraded.

### WS Route Implementation Pattern

```typescript
// apps/server/src/routes/ws.ts
import { Hono } from 'hono'
import { upgradeWebSocket } from '@hono/node-server/ws'
import { requireAuth } from '../middleware/requireAuth.js'
import { wsHub } from '../services/wsHub.js'
import { streamService } from '../services/streamService.js'
import type { AppEnv } from '../lib/types.js'
import type { WsMessage } from '@manlycam/types'

export const wsRouter = new Hono<AppEnv>()

wsRouter.get(
  '/ws',
  requireAuth,
  upgradeWebSocket((_c) => ({
    onOpen(_evt, ws) {
      const dispose = wsHub.addClient({ send: (data) => ws.send(data) })
      // Store dispose on the ws object (Hono WS exposes `ws.raw` for the underlying socket)
      // Alternative: use a WeakMap keyed on ws
      ;(ws as unknown as { _dispose?: () => void })._dispose = dispose

      // Send current stream state immediately (AC #2)
      const initMsg: WsMessage = { type: 'stream:state', payload: streamService.getState() }
      ws.send(JSON.stringify(initMsg))
    },
    onClose(_evt, ws) {
      ;(ws as unknown as { _dispose?: () => void })._dispose?.()
    },
  })),
)
```

> **Note on dispose storage:** Hono's `WSContext` from `@hono/node-server/ws` doesn't provide a native per-connection store. The pattern above casts to unknown to attach `_dispose`. An alternative is a `WeakMap<object, () => void>` keyed on the `ws` object — use whichever feels cleaner. Check `hono/ws` typings for the latest API before implementing.

### wsHub Is Already Implemented — Do Not Reinvent It

`apps/server/src/services/wsHub.ts` is complete and already wired into `streamService.ts`. **Do not modify it** unless tests reveal a bug.

```typescript
// wsHub.ts (already in place — reference only)
class WsHub {
  private readonly clients = new Set<WSClient>();

  addClient(client: WSClient): () => void {  // returns dispose fn
    this.clients.add(client);
    return () => { this.clients.delete(client); };
  }

  broadcast(message: WsMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      try { client.send(data); }
      catch { /* disconnected between check and send; dispose handles cleanup */ }
    }
  }
}
export const wsHub = new WsHub();
```

`streamService.ts` already calls `wsHub.broadcast({ type: 'stream:state', payload: this.getState() })` in:
- `broadcastState()` — called from `setAdminToggle()` (admin toggle, Story 3.5)
- `updateReachable()` — called from `pollMediamtxState()` (Pi reachability changes, every 2s)
- `runMediamtx()` `proc.on('close')` handler (mediamtx process exit)

This means once the WS route is wired, all state transitions will be broadcast automatically.

### `requireAuth` on WS Upgrade

`requireAuth` middleware works on WS upgrade requests because the upgrade is still an HTTP GET before the protocol switch. `authMiddleware` runs first (sets `c.var.user`), then `requireAuth` checks it, then `upgradeWebSocket` executes. This is the same middleware stack as REST routes.

### `useWebSocket.ts` Composable Design

```typescript
// apps/web/src/composables/useWebSocket.ts
import { ref, inject, type InjectionKey, type Ref } from 'vue'
import { useStream } from './useStream'
import type { WsMessage } from '@manlycam/types'

export interface WsInterface {
  connect: () => void
  disconnect: () => void
  isConnected: Readonly<Ref<boolean>>
}

export const WS_INJECTION_KEY: InjectionKey<WsInterface> = Symbol('useWebSocket')

export function useWebSocket(): WsInterface {
  // If injected (child component), return the provided instance
  const injected = inject(WS_INJECTION_KEY, null)
  if (injected) return injected

  // App-root call: create singleton
  const isConnected = ref(false)
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectDelay = 1000
  const MAX_DELAY = 30_000

  function handleMessage(event: MessageEvent<string>) {
    try {
      const msg = JSON.parse(event.data) as WsMessage
      if (msg.type === 'stream:state') {
        useStream().setStateFromWs(msg.payload)
      }
      // Future message types handled here (Story 4.x+)
    } catch {
      // Ignore malformed messages
    }
  }

  function connect() {
    if (socket && socket.readyState < WebSocket.CLOSING) return
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    socket = new WebSocket(`${proto}//${location.host}/ws`)

    socket.onopen = () => {
      isConnected.value = true
      reconnectDelay = 1000
    }
    socket.onmessage = handleMessage
    socket.onclose = () => {
      isConnected.value = false
      socket = null
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY)
        connect()
      }, reconnectDelay)
    }
    socket.onerror = () => {
      socket?.close()  // triggers onclose → backoff reconnect
    }
  }

  function disconnect() {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    socket?.close()
    socket = null
    isConnected.value = false
  }

  return { connect, disconnect, isConnected }
}
```

### `App.vue` Update

```vue
<script setup lang="ts">
import { onMounted, provide, watch } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { useWebSocket, WS_INJECTION_KEY } from '@/composables/useWebSocket'
import LoginView from '@/views/LoginView.vue'
import WatchView from '@/views/WatchView.vue'

const { user, fetchCurrentUser } = useAuth()

const ws = useWebSocket()
provide(WS_INJECTION_KEY, ws)

// Connect WS when user is authenticated; disconnect on logout
watch(user, (u) => {
  if (u) ws.connect()
  else ws.disconnect()
}, { immediate: true })

onMounted(() => {
  fetchCurrentUser()
})
</script>

<template>
  <RouterView v-if="$route.path !== '/'" />
  <WatchView v-else-if="user" />
  <LoginView v-else />
</template>
```

### Vite Dev Proxy for `/ws`

```typescript
// apps/web/vite.config.ts — server.proxy section update
server: {
  proxy: {
    '/api': 'http://localhost:3000',
    '/ws': { target: 'ws://localhost:3000', ws: true },
  },
},
```

Without this, `vite dev` will not forward WebSocket upgrade requests to the Hono server.

### Server-Side WS Testing Strategy

Hono's `upgradeWebSocket` is not easily tested via `supertest`-style requests (WS upgrade requires actual TCP). Use one of these approaches:

**Option A — Unit test wsHub directly (preferred for Story 3.4):**
```typescript
// ws.test.ts — test the hub and route logic independently
// Mock upgradeWebSocket and test that requireAuth is called correctly
// Test wsHub.addClient / dispose / broadcast separately
```

**Option B — Integration test with `ws` npm package:**
```typescript
import { WebSocket } from 'ws'
// Start the actual server in test, connect real WS
// This requires server start/stop lifecycle in tests
```

Prefer **Option A** for unit tests — mock `upgradeWebSocket` from `@hono/node-server/ws` and verify:
- `requireAuth` rejects unauthenticated requests with 401 (testable via normal HTTP GET /ws without upgrade)
- `wsHub.addClient()` is called on open
- First message is `stream:state` payload
- Dispose is called on close

The auth rejection test is a straightforward HTTP test (no WS needed) because `requireAuth` runs before the upgrade.

### Testing `useWebSocket.ts` — WebSocket Mock

```typescript
// useWebSocket.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'

// Mock WebSocket globally — jsdom doesn't implement it
const mockWsInstance = {
  send: vi.fn(),
  close: vi.fn(),
  readyState: WebSocket.OPEN,
  onopen: null as ((e: Event) => void) | null,
  onmessage: null as ((e: MessageEvent) => void) | null,
  onclose: null as ((e: CloseEvent) => void) | null,
  onerror: null as ((e: Event) => void) | null,
}
const MockWebSocket = vi.fn(() => mockWsInstance)
MockWebSocket.CLOSING = 2
MockWebSocket.OPEN = 1
vi.stubGlobal('WebSocket', MockWebSocket)

// Also mock useStream to verify setStateFromWs is called
vi.mock('@/composables/useStream', () => ({
  useStream: () => ({
    streamState: ref('connecting'),
    initStream: vi.fn(),
    setStateFromWs: vi.fn(),
  }),
}))
```

Use `vi.useFakeTimers()` to test exponential backoff without real delays.

### Coverage Impact

`wsHub.ts` comment in `vitest.config.ts` notes it is "intentionally untested until Story 3.4 integration tests". Adding WS route tests will cover `wsHub.ts` — the coverage thresholds should increase. Run `vitest run --coverage` after all tests pass to measure the new baseline before updating thresholds.

### Project Structure Notes

**Files to create (new):**
```
apps/server/src/
└── routes/
    ├── ws.ts              ← WS upgrade endpoint
    └── ws.test.ts         ← unit tests

apps/web/src/
└── composables/
    ├── useWebSocket.ts    ← WS composable (factory + inject helper)
    └── useWebSocket.test.ts
```

**Files to modify:**
```
apps/server/src/
├── app.ts        ← mount wsRouter
└── index.ts      ← call injectWebSocket(server)

apps/web/src/
└── App.vue       ← provide(WS_INJECTION_KEY, ws) + watch(user, connect/disconnect)

apps/web/vite.config.ts       ← add /ws proxy + update coverage thresholds
apps/server/vitest.config.ts  ← update coverage thresholds
```

**Do NOT create `__tests__/` directories.** Tests are always co-located (`*.test.ts` next to the source file).

**Named exports only** — no `export default` on composables or services (exception: vite/vitest config files).

### References

- WS message types (single source of truth): [`packages/types/src/ws.ts`]
- `wsHub.ts` (already implemented): [`apps/server/src/services/wsHub.ts`]
- `streamService.ts` (already calls broadcast): [`apps/server/src/services/streamService.ts`]
- `requireAuth` middleware pattern: [`apps/server/src/middleware/requireAuth.ts`]
- `authMiddleware` (injects user from session cookie): [`apps/server/src/middleware/auth.ts`]
- `stream.ts` route (reference for Hono route pattern with AppEnv): [`apps/server/src/routes/stream.ts`]
- `app.ts` (mount point for wsRouter): [`apps/server/src/app.ts`]
- `index.ts` (server start — add `injectWebSocket`): [`apps/server/src/index.ts`]
- `useStream.ts` (Story 3.3 WS seam — `setStateFromWs`): [`apps/web/src/composables/useStream.ts`]
- `useAuth.ts` (module-level singleton pattern reference): [`apps/web/src/composables/useAuth.ts`]
- `App.vue` (current root — add provide/watch): [`apps/web/src/App.vue`]
- Server coverage config: [`apps/server/vitest.config.ts`]
- Web coverage config: [`apps/web/vite.config.ts`]
- Epics story 3.4: [`_bmad-output/planning-artifacts/epics.md`] — lines ~727–800
- Story 3.3 (stream state UI + WS seam): [`_bmad-output/implementation-artifacts/3-3-spa-shell-stream-player-and-4-state-ui.md`]
- Story 3.5 (next — uses WS broadcasts from this story): [`_bmad-output/planning-artifacts/epics.md`] — "Story 3.5"

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation completed without blocking issues after resolving one package API mismatch.

### Completion Notes List

- **Package correction:** Story specified `@hono/node-server/ws` (non-existent subpath). Correct package is `@hono/node-ws` — installed as new dependency. API is `createNodeWebSocket({ app })` returning `{ upgradeWebSocket, injectWebSocket }`.
- **`createApp()` return shape change:** To thread `injectWebSocket` from `createNodeWebSocket` to `index.ts`, `createApp()` now returns `{ app, injectWebSocket }` instead of the bare Hono app. All 3 existing route test files updated accordingly (`const { app } = createApp()` / `createApp().app.request(...)`).
- **`createWsRouter` factory pattern:** Since `upgradeWebSocket` requires the same `app` instance it was created with, `ws.ts` exports a factory `createWsRouter(upgradeWebSocket)` rather than a static `wsRouter`. This is the standard pattern for `@hono/node-ws`.
- **WeakMap for dispose storage:** Dispose functions are stored in a module-level `WeakMap<object, () => void>` keyed on the WS context object. Avoids casting or mutating the Hono WS object.
- **Test strategy for WS lifecycle:** Mocked `createNodeWebSocket` in `ws.test.ts` to capture the event handler factory. Auth rejection tested via HTTP (before `upgradeWebSocket` runs). Lifecycle (`onOpen`/`onClose`) tested by calling captured factory directly with mock WS objects.
- **Server coverage:** lines 84%, functions 90%, branches 87%, statements 84% (up from 82/87/87/82).
- **Web coverage:** lines 69%, functions 87%, branches 92%, statements 69% (up from 65/83/89/65).
- **Total tests:** 87 server + 90 web = 177 passing (was 56 server + 75 web = 131 before this story).
- **ESLint fix:** `eslint.config.mjs` web block was missing `globals.browser` and `globals.vitest`. Added both so `window`, `WebSocket`, `describe`, `it`, etc. are recognized in web TS files.

### File List

apps/server/src/routes/ws.ts (new)
apps/server/src/routes/ws.test.ts (new)
apps/server/src/app.ts (modified — createNodeWebSocket integration, return type changed to { app, injectWebSocket })
apps/server/src/index.ts (modified — destructure { app, injectWebSocket } from createApp, call injectWebSocket(server))
apps/server/src/routes/auth.test.ts (modified — const { app } = createApp())
apps/server/src/routes/me.test.ts (modified — const { app } = createApp())
apps/server/src/routes/stream.test.ts (modified — createApp().app.request(...))
apps/server/vitest.config.ts (modified — updated coverage thresholds)
apps/server/package.json (modified — added @hono/node-ws dependency)
apps/web/src/composables/useWebSocket.ts (new)
apps/web/src/composables/useWebSocket.test.ts (new)
apps/web/src/App.vue (modified — provide/watch WS at root)
apps/web/vite.config.ts (modified — /ws proxy + updated coverage thresholds)
pnpm-lock.yaml (modified — @hono/node-ws added)
eslint.config.mjs (modified — added globals.browser + globals.vitest to web block)
