# Story 3.3: SPA Shell, Stream Player, and 4-State UI

Status: review

## Story

As a **viewer**,
I want to see the live stream immediately after signing in, with honest state communication at all times,
So that I always know whether Manly is live, temporarily unavailable, or intentionally offline.

## ⚠️ CRITICAL: Read UX Design Files Before Implementing Any UI

This story is **UI-heavy**. Two design files are mandatory reading before writing a single component:

1. **`_bmad-output/planning-artifacts/ux-design-directions.html`** — Interactive HTML showcase of all explored layout variants and the chosen direction. Contains visual mockups for desktop three-column layout, mobile layout, all stream states (Sign-in, Explicit Offline, Temporary Downtime/Reconnecting), hover overlay behaviour, sidebar collapse, and the profile popover. **This file is NOT a `.md` and will NOT be auto-loaded by tooling — you must open it explicitly.** It is the single most important visual reference for this story.

2. **`_bmad-output/planning-artifacts/ux-design-specification.md`** — Written design spec covering: chosen design direction ("Desktop — No-Topbar Hover-Overlay Three-Column"), color tokens (`--live`, `--reconnecting`, `--offline-explicit`, `--background`, `--surface`, `--sidebar`), typography scale, spacing principles, mobile layout ("Stream + Persistent Bottom Chat Bar + Overlay Drawers"), and accessibility requirements. Read the sections: "Design Direction Decision", "Visual Design Foundation", "Color System", "Spacing & Layout Foundation", and "Experience Mechanics".

Do not guess at layout, colors, or state copy. The design has been fully specified. Match it.

## Acceptance Criteria

> **⚠️ CRITICAL AC CORRECTION — hls.js references in epics.md are OBSOLETE**
>
> The epics.md ACs reference `hls.js` and `/hls/stream.m3u8`. These were superseded by
> the Story 3-2c WebRTC WHEP pivot. The browser stream player MUST use WebRTC WHEP
> (`POST /api/stream/whep`), NOT `hls.js`. The `hls.js` package remains in package.json
> but must NOT be used for stream playback. See
> `_bmad-output/implementation-artifacts/3-2c-webrtc-via-mediamtx.md` for full context.

1. **Layout — `WatchView.vue` three-column shell**
   - `WatchView.vue` renders a no-topbar three-column layout: left sidebar (admin-only, hidden/collapsed for non-admin), `StreamPlayer.vue` filling the remaining horizontal space, and right sidebar (chat panel — empty placeholder for Story 4.x)
   - Stream area fills 100% of available horizontal space at all times; sidebars are fixed-width (left: 280px, right: 320px) and collapse-only (drag-resize is post-MVP)
   - `<video>` element within `StreamPlayer.vue` has zero padding — edge-to-edge within its container, maintaining 16:9 aspect ratio

2. **State — `connecting` (client-only initial state)**
   - `StreamPlayer.vue` starts in `connecting` state on mount — before `GET /api/stream/state` resolves
   - A `<Skeleton>` at 16:9 ratio is shown
   - `<StreamStatusBadge>` shows amber static dot + "Connecting..."

3. **State — `live`**
   - After REST hydration (or future WS update from Story 3.4) reports `{ state: 'live' }`:
   - WebRTC WHEP client initiates: `POST /api/stream/whep` (SDP offer) → `RTCPeerConnection` → `<video>` receives track from `pc.ontrack` → auto-plays without user interaction
   - `<StreamStatusBadge>` shows green pulsing dot + `"{PET_NAME} is live"` (from `import.meta.env.VITE_PET_NAME`)
   - No `<StateOverlay>` rendered

4. **State — `unreachable`** (adminToggle: 'live' — "should be live but Pi is unreachable")
   - `<StateOverlay>` renders the temporary-downtime variant: dark frosted overlay over video area + amber spinner + "Trying to reconnect..."
   - No user action required; overlay resolves automatically when state transitions to `live`

5. **State — `explicit-offline`** (admin deliberately toggled off)
   - `<StateOverlay>` renders the explicit-offline variant: centered 😴 emoji + `"{PET_NAME} needs their Zzzs"` + "The stream is offline for now. Check back later." — no spinner, no retry

6. **REST hydration on mount**
   - `GET /api/stream/state` is called on `WatchView` mount to hydrate initial stream state
   - The SPA does not wait for a WebSocket message to determine initial state; REST resolves first, WS updates asynchronously (Story 3.4)
   - On error (e.g., network failure), state remains `connecting` and is retried (simple retry or leave as connecting — do not crash)

7. **WebSocket integration point (Story 3.4 seam)**
   - `useStream.ts` exposes a callable `setStateFromWs(payload: StreamState): void` function (or equivalent reactive mechanism) so Story 3.4's `useWebSocket` composable can push state updates without refactoring Story 3.3 code
   - `useStream.ts` does NOT implement WS connection itself — that is Story 3.4

8. **Mobile shell**
   - Below the `lg` (1024px) Tailwind breakpoint: sidebars collapse, stream fills full viewport width
   - No page reload required for layout transition

9. **Accessibility**
   - `<video>` element has `role="img"` and `aria-label="Live stream of {PET_NAME}"`
   - Stream state changes are announced via `aria-live="polite"` on the status badge container

## Tasks / Subtasks

- [x] Implement `useStream.ts` composable (AC: #6, #7)
  - [x] Internal reactive `streamState` starting as `'connecting'` (client-only, not from `StreamState` union)
  - [x] `initStream()`: calls `GET /api/stream/state`, updates internal state; call on WatchView mount
  - [x] `setStateFromWs(payload: StreamState): void`: exposes reactive state update for Story 3.4 to call
  - [x] Export: `{ streamState, initStream, setStateFromWs }`
  - [x] Co-located test: `useStream.test.ts`

- [x] Replace `WatchView.vue` stub with three-column shell (AC: #1, #8)
  - [x] Left sidebar: hidden for non-Admin roles (check `useAuth().user.value.role === 'Admin'`); empty placeholder for Story 3.6 camera controls
  - [x] Right sidebar: empty placeholder (collapsed by default on mobile); for Story 4.x chat panel
  - [x] Stream column: `<StreamPlayer :streamState="streamState" />` filling remaining space
  - [x] Responsive: `lg:` breakpoint collapses sidebars on mobile
  - [x] Co-located test: `WatchView.test.ts`

- [x] Implement `StreamPlayer.vue` (AC: #2, #3, #4, #5, #9)
  - [x] Props: `streamState: 'connecting' | 'live' | 'unreachable' | 'explicit-offline'`
  - [x] Render `<Skeleton>` at 16:9 when `connecting`
  - [x] Render `<video>` element (hidden/overlaid when not live) — `role="img"`, `aria-label`
  - [x] Call `startWhep()` when `streamState` transitions to `'live'`; cleanup on unmount or state change
  - [x] Render `<StateOverlay variant="unreachable" />` when unreachable
  - [x] Render `<StateOverlay variant="explicit-offline" />` when explicit-offline
  - [x] Co-located test: `StreamPlayer.test.ts`

- [x] Implement WebRTC WHEP client logic (AC: #3) — within `StreamPlayer.vue` or extracted to `useWhep.ts`
  - [x] Create `RTCPeerConnection`
  - [x] `addTransceiver('video', { direction: 'recvonly' })` and `addTransceiver('audio', { direction: 'recvonly' })`
  - [x] `createOffer()` → `setLocalDescription()`
  - [x] `POST /api/stream/whep` with SDP body; extract `Location` header as session URL
  - [x] `setRemoteDescription()` with SDP answer
  - [x] `pc.onicecandidate` → `PATCH {sessionUrl}` with trickle ICE
  - [x] `pc.ontrack` → attach `event.streams[0]` to `<video>` `srcObject`; call `video.play()`
  - [x] Cleanup: `DELETE {sessionUrl}` + `pc.close()` on unmount or state change away from `live`
  - [x] Co-located test: `useWhep.test.ts` (mock `RTCPeerConnection` and `fetch`)

- [x] Implement `StreamStatusBadge.vue` (AC: #2, #3, #9)
  - [x] Props: `state: 'connecting' | 'live' | 'unreachable' | 'explicit-offline'`
  - [x] `connecting`: amber static dot + "Connecting..."
  - [x] `live`: green pulsing dot + `"{VITE_PET_NAME} is live"`
  - [x] `unreachable`: amber static dot + "Trying to reconnect..."
  - [x] `explicit-offline`: muted dot + "Stream offline"
  - [x] Wrapper has `aria-live="polite"` (AC: #9)
  - [x] Co-located test: `StreamStatusBadge.test.ts`

- [x] Implement `StateOverlay.vue` (AC: #4, #5)
  - [x] Props: `variant: 'unreachable' | 'explicit-offline'`
  - [x] `unreachable`: dark frosted overlay (backdrop-blur + bg-black/60) + amber spinner + "Trying to reconnect..."
  - [x] `explicit-offline`: centered 😴 + `"{VITE_PET_NAME} needs their Zzzs"` + "The stream is offline for now. Check back later."
  - [x] Co-located test: `StateOverlay.test.ts`

- [x] Update coverage thresholds in `apps/web/vite.config.ts` after tests pass (AC: baseline)

## Dev Notes

### ⚠️ Architecture Pivot — WebRTC WHEP, NOT hls.js

The epics.md Story 3.3 ACs say `hls.js` and `/hls/stream.m3u8`. **These are wrong.** They were written before the 3-2c course correction. The authoritative source is:
- `_bmad-output/implementation-artifacts/3-2c-webrtc-via-mediamtx.md`
- `_bmad-output/planning-artifacts/architecture.md` (pivot table at top)

**Do not use `hls.js` for the stream player.** Use native `RTCPeerConnection` + WebRTC WHEP.

### WebRTC WHEP Protocol (server in place from Story 3-2c)

The Hono server exposes three WHEP proxy routes (all require auth cookie):

```
POST   /api/stream/whep            — SDP offer → SDP answer
                                     Response headers include Location: /api/stream/whep/{uuid}
PATCH  /api/stream/whep/:session   — Trickle ICE candidate
DELETE /api/stream/whep/:session   — Close WHEP session
```

**Client implementation pattern:**

```typescript
// 1. Create peer connection
const pc = new RTCPeerConnection({ iceServers: [] })
pc.addTransceiver('video', { direction: 'recvonly' })
pc.addTransceiver('audio', { direction: 'recvonly' })

// 2. Create offer
const offer = await pc.createOffer()
await pc.setLocalDescription(offer)

// 3. Send SDP offer to WHEP endpoint
const res = await fetch('/api/stream/whep', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/sdp' },
  body: offer.sdp,
})
const sessionUrl = res.headers.get('Location')!  // e.g. /api/stream/whep/{uuid}
const sdpAnswer = await res.text()

// 4. Set remote description
await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer })

// 5. Trickle ICE (fire-and-forget; errors non-fatal)
pc.onicecandidate = async ({ candidate }) => {
  if (candidate) {
    await fetch(sessionUrl, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/trickle-ice-sdpfrag' },
      body: candidate.candidate,
    }).catch(() => {})
  }
}

// 6. Attach track to video element
pc.ontrack = (event) => {
  videoEl.srcObject = event.streams[0]
  videoEl.play().catch(() => {})
}

// Cleanup on unmount or state change:
await fetch(sessionUrl, { method: 'DELETE', credentials: 'include' }).catch(() => {})
pc.close()
```

### 4 UI States — Mapping

| Client State | Source | StreamState value | UI |
|---|---|---|---|
| `connecting` | Client-only initial | — | Skeleton + amber static dot |
| `live` | Server `{ state: 'live' }` | WebRTC active | Video + green pulse dot + WHEP connected |
| `unreachable` | Server `{ state: 'unreachable', adminToggle: 'live' }` | Admin wants live but Pi offline | Frosted overlay + amber spinner |
| `explicit-offline` | Server `{ state: 'explicit-offline' }` | Admin intentionally stopped | 😴 overlay, no spinner |

**Client state type** (NOT the same as `StreamState` from `@manlycam/types`):
```typescript
// Use this union for component props and internal composable state
type ClientStreamState = 'connecting' | 'live' | 'unreachable' | 'explicit-offline'

// Map from server StreamState to client state
function toClientState(s: StreamState): Exclude<ClientStreamState, 'connecting'> {
  if (s.state === 'live') return 'live'
  if (s.state === 'unreachable') return 'unreachable'
  return 'explicit-offline'
}
```

### useStream.ts Composable Design

```typescript
// apps/web/src/composables/useStream.ts
import { ref } from 'vue'
import { apiFetch } from '@/lib/api'
import type { StreamState } from '@manlycam/types'

type ClientStreamState = 'connecting' | 'live' | 'unreachable' | 'explicit-offline'

const streamState = ref<ClientStreamState>('connecting')

export const useStream = () => {
  const initStream = async (): Promise<void> => {
    try {
      const state = await apiFetch<StreamState>('/api/stream/state')
      streamState.value = toClientState(state)
    } catch {
      // remain 'connecting' on error; Story 3.4 WS will push real state
    }
  }

  // Story 3.4 seam: useWebSocket composable calls this when stream:state WS message arrives
  const setStateFromWs = (payload: StreamState): void => {
    streamState.value = toClientState(payload)
  }

  return { streamState, initStream, setStateFromWs }
}
```

**Module-level `streamState`**: Follow the same pattern as `useAuth` — module-level `ref` so all components share the same state instance. Tests use `vi.resetModules()` to isolate state.

### WatchView.vue Layout Architecture

```
WatchView
├── <!-- left sidebar: admin only, placeholder for Story 3.6 -->
│   <aside v-if="user?.role === 'Admin'" class="w-[280px] hidden lg:flex ...">
│     <!-- Story 3.6: AdminPanel / CameraControls here -->
│   </aside>
│
├── <!-- stream column: fills remaining space -->
│   <main class="flex-1 min-w-0">
│     <StreamPlayer :streamState="streamState" />
│   </main>
│
└── <!-- right sidebar: placeholder for Story 4.x -->
    <aside class="w-[320px] hidden lg:flex ...">
      <!-- Story 4.x: ChatPanel here -->
    </aside>
```

- Use `flex` on the root container; `flex-1 min-w-0` on stream column ensures it fills remaining space
- `hidden lg:flex` on sidebars implements mobile collapse at `lg` (1024px) breakpoint
- No topbar — stream goes edge-to-edge in viewport height

### StreamPlayer.vue Component Structure

```vue
<!-- apps/web/src/components/stream/StreamPlayer.vue -->
<template>
  <div class="relative w-full aspect-video bg-black">
    <!-- Connecting: Skeleton -->
    <Skeleton v-if="streamState === 'connecting'" class="absolute inset-0" />

    <!-- Video element: always mounted when live (or transitioning) -->
    <video
      ref="videoRef"
      class="w-full h-full object-cover"
      role="img"
      :aria-label="`Live stream of ${petName}`"
      autoplay
      muted
      playsinline
    />

    <!-- State overlays (rendered over video) -->
    <StateOverlay
      v-if="streamState === 'unreachable' || streamState === 'explicit-offline'"
      :variant="streamState === 'unreachable' ? 'unreachable' : 'explicit-offline'"
    />

    <!-- Status badge (always visible, positioned over stream) -->
    <div class="absolute top-3 left-3">
      <StreamStatusBadge :state="streamState" />
    </div>
  </div>
</template>
```

**WHEP lifecycle**: Start WHEP when `streamState` becomes `'live'`; cleanup when it changes away from `'live'` or on `onUnmounted`. Use `watch(streamState, ...)` to react to transitions.

### File and Import Conventions

- **Named exports only** — no `export default` on composables or components (exception: `vite.config.ts`)
- **Absolute imports via `@/`** alias (maps to `apps/web/src/`)
- **Types from `@manlycam/types`** — `StreamState`, `StreamStatus`, `Role`, `WsMessage`, `MeResponse`
- **VITE env vars**: `import.meta.env.VITE_PET_NAME as string` — same pattern as `LoginView.vue`
- **apiFetch** from `@/lib/api` — handles session cookie and typed error (`ApiFetchError`)

### Project Structure Notes

**Files to create (new):**
```
apps/web/src/
├── composables/
│   ├── useStream.ts          # Stream state composable
│   └── useStream.test.ts     # Co-located tests
├── components/
│   └── stream/               # New directory
│       ├── StreamPlayer.vue
│       ├── StreamPlayer.test.ts
│       ├── StreamStatusBadge.vue
│       ├── StreamStatusBadge.test.ts
│       ├── StateOverlay.vue
│       └── StateOverlay.test.ts
```

**Files to modify:**
```
apps/web/src/
├── views/WatchView.vue       # Replace stub with real layout
├── views/WatchView.test.ts   # New co-located test
└── vite.config.ts            # Update coverage thresholds after tests pass
```

**Do NOT create `__tests__/` directories.** Tests are always co-located (`*.test.ts` next to source file).

### Existing shadcn-vue / reka-ui Components Available

The web app has `reka-ui` (package.json) and two shadcn-vue components already copied into `src/components/ui/`:
- `button/` — `Button.vue`
- `avatar/` — `Avatar.vue`, `AvatarImage.vue`, `AvatarFallback.vue`

For `<Skeleton>`, you may need to add a shadcn-vue Skeleton component via `pnpm dlx shadcn-vue@latest add skeleton` OR implement a simple one manually (a `div` with `animate-pulse bg-surface` Tailwind classes is sufficient — prefer manual if the full shadcn-vue CLI isn't available in dev environment).

### hls.js is in package.json — DO NOT USE IT

`hls.js: ^1.5.0` is in `apps/web/package.json`. It was added during Epic 1 planning before the WebRTC pivot. Leave it in `package.json` for now (removing it is a separate cleanup task). **Do not import or use `hls.js` anywhere in Story 3.3.**

### Testing Patterns

Follow the established web test pattern from `LoginView.test.ts`:
- `@vue/test-utils` `mount()` for Vue component tests
- `vitest` describe/it/expect
- `import.meta.env.VITE_PET_NAME = 'Buddy'` in `beforeEach` for env-var-dependent tests
- Mock `fetch` via `vi.stubGlobal('fetch', ...)` for composable tests
- Mock `RTCPeerConnection` via `vi.stubGlobal('RTCPeerConnection', ...)` for WHEP tests

**For useStream.ts testing** (module-level ref requires isolation):
```typescript
// useStream.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('useStream', () => {
  beforeEach(() => {
    vi.resetModules()  // Reset module-level streamState ref between tests
    vi.stubGlobal('fetch', vi.fn())
  })
})
```

**RTCPeerConnection mock pattern** (jsdom doesn't implement WebRTC):
```typescript
const mockPc = {
  addTransceiver: vi.fn(),
  createOffer: vi.fn().mockResolvedValue({ sdp: 'v=0\r\n...' }),
  setLocalDescription: vi.fn(),
  setRemoteDescription: vi.fn(),
  onicecandidate: null,
  ontrack: null,
  close: vi.fn(),
}
vi.stubGlobal('RTCPeerConnection', vi.fn(() => mockPc))
```

### Previous Story Intelligence

**From Story 3-2c (`_bmad-output/implementation-artifacts/3-2c-webrtc-via-mediamtx.md`):**
- Server WHEP proxy is complete and tested (9 tests pass)
- `POST /api/stream/whep` rewrites `Location` header from `/whep/cam/{uuid}` → `/api/stream/whep/{uuid}`
- All WHEP routes require auth — 401 without valid session cookie
- `GET /api/stream/state` returns current `StreamState` (also auth-gated)
- `piReachable` is polled from mediamtx API every 2 seconds server-side

**From Story 3-2b (`_bmad-output/implementation-artifacts/3-2b-mediamtx-rtsp-architecture-pivot.md`):**
- Pi's mediamtx runs at `:8554/cam`; frp tunnels RTSP to server mediamtx at `:11935`
- Server mediamtx WHEP listens on `MTX_WEBRTC_PORT` (default 8889), proxied by Hono

**From Epic 2 (auth patterns established):**
- `useAuth()` composable provides `user` ref (module-level singleton)
- `apiFetch()` in `@/lib/api.ts` attaches session cookie, throws `ApiFetchError` on non-2xx
- `VITE_PET_NAME` and `VITE_SITE_NAME` are the env var pattern for deploy-time strings
- `Role.Admin = 'Admin'` from `@manlycam/types` — use for role checks

### Git Intelligence (recent commits)

- `c9ea523` fix(code-review-3.2b-3.2c): address findings from adversarial review — WHEP proxy and stream service hardening
- `cba5dbc` docs(course-correction): update architecture.md and prd.md for mediamtx pivots — confirms WebRTC is the canonical approach
- `b0fb7bd` feat(story-3.2c): server WebRTC via mediamtx, remove ffmpeg+HLS — WHEP routes live

### References

**🎨 UX Design — MANDATORY (read before implementing any component):**
- **Visual mockups (HTML — must open explicitly, not auto-loaded):** [`_bmad-output/planning-artifacts/ux-design-directions.html`] — all layout variants, chosen direction, all stream states, hover overlay, mobile
- **Written design spec:** [`_bmad-output/planning-artifacts/ux-design-specification.md`] — sections: "Design Direction Decision", "Visual Design Foundation", "Color System", "Spacing & Layout Foundation", "Experience Mechanics"

**Architecture & Implementation:**
- Story 3-2c (WHEP server implementation): [`_bmad-output/implementation-artifacts/3-2c-webrtc-via-mediamtx.md`]
- Architecture pivot table: [`_bmad-output/planning-artifacts/architecture.md`] (top of file)
- Architecture frontend section: [`_bmad-output/planning-artifacts/architecture.md`] — "Frontend Architecture"
- WebSocket message types + StreamState: [`packages/types/src/ws.ts`]
- apiFetch utility: [`apps/web/src/lib/api.ts`]
- Auth composable pattern: [`apps/web/src/composables/useAuth.ts`]
- Stream routes (server): [`apps/server/src/routes/stream.ts`]
- Story 3.4 (WS hub — Story 3.3 seam target): [`_bmad-output/planning-artifacts/epics.md`] — "Story 3.4"

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_No debug log entries — implementation proceeded cleanly._

### Completion Notes List

- Implemented `useStream.ts` composable with module-level singleton ref (same pattern as `useAuth`). 10 tests cover all state transitions and WS seam.
- Implemented `useWhep.ts` composable with full WebRTC WHEP lifecycle: offer→answer, trickle ICE, track attachment, cleanup (DELETE + close). 8 tests mock RTCPeerConnection and fetch.
- Implemented `StreamStatusBadge.vue` with aria-live="polite", correct dot colors/animations per state, PET_NAME env var. 5 tests.
- Implemented `StateOverlay.vue` with two variants: frosted backdrop-blur spinner for unreachable, centered 😴 emoji for explicit-offline. 8 tests.
- Implemented `StreamPlayer.vue` with Skeleton on connecting, video element with role/aria-label, StateOverlay for non-live states, StreamStatusBadge always visible, watch() to call startWhep/stopWhep on state transitions, onUnmounted cleanup. 11 tests.
- Replaced `WatchView.vue` stub with three-column flex layout: left sidebar (Admin-only, `hidden lg:flex`), `flex-1 min-w-0` stream main, right sidebar (always present, `hidden lg:flex`). `initStream()` called on mount. 6 tests.
- Updated coverage thresholds: lines 65, functions 85, branches 89, statements 65 (up from 31/75/78/31).
- Fixed pre-existing TypeScript error: created `apps/web/src/vite-env.d.ts` with `/// <reference types="vite/client" />` + `declare module '*.vue'` shim — resolves TS2307 errors that were present since Epic 1.
- Total: 63 tests pass across 10 test files, 0 regressions. `tsc --noEmit` clean.

### File List

- `apps/web/src/composables/useStream.ts` — new
- `apps/web/src/composables/useStream.test.ts` — new
- `apps/web/src/composables/useWhep.ts` — new
- `apps/web/src/composables/useWhep.test.ts` — new
- `apps/web/src/components/stream/StreamPlayer.vue` — new
- `apps/web/src/components/stream/StreamPlayer.test.ts` — new
- `apps/web/src/components/stream/StreamStatusBadge.vue` — new
- `apps/web/src/components/stream/StreamStatusBadge.test.ts` — new
- `apps/web/src/components/stream/StateOverlay.vue` — new
- `apps/web/src/components/stream/StateOverlay.test.ts` — new
- `apps/web/src/views/WatchView.vue` — modified (replaced stub with three-column layout)
- `apps/web/src/views/WatchView.test.ts` — new
- `apps/web/src/vite-env.d.ts` — new (Vue SFC shim; fixes pre-existing tsc errors)
- `apps/web/vite.config.ts` — modified (updated coverage thresholds)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — modified (status: in-progress)
