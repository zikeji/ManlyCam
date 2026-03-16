# Story: Admin Stream Preview While Explicit-Offline

Status: review

## Story

As **an admin**,
when the stream is set to explicit-offline but the Pi is still reachable,
I want a "Preview Stream" button in the offline overlay,
so that I can verify the camera feed without making it publicly visible to viewers.

## Acceptance Criteria

1. **`StreamState` type carries `piReachable` when offline**
   - `StreamState` in `packages/types/src/ws.ts` gains an optional `piReachable?: boolean` field
   - Server returns `{ state: 'explicit-offline', piReachable: true/false }` from `streamService.getState()` and broadcasts it via WS
   - Non-offline states are unaffected

2. **Preview button appears only for admins when Pi is reachable**
   - `StateOverlay.vue` (explicit-offline variant) renders a "Preview Stream" button when prop `showPreviewButton` is `true`
   - `WatchView.vue` passes `showPreviewButton = isAdmin && piReachableWhileOffline` down through `StreamPlayer`
   - Non-admin viewers never see the button, even if Pi is reachable

3. **Clicking Preview starts the WHEP connection**
   - Clicking "Preview Stream" emits `preview` on `StateOverlay` → propagated as `startPreview` on `StreamPlayer` → sets `adminPreviewActive = true` in `WatchView`
   - When `adminPreviewActive` is `true` and `streamState === 'explicit-offline'`, `StreamPlayer` computes `effectiveStreamState = 'live'` internally and starts WHEP as normal
   - The explicit-offline overlay is hidden while in preview mode

4. **A "Preview Mode" badge is visible on the stream during preview**
   - While `adminPreviewActive` is true and stream state is still `explicit-offline`, a small badge reading "Preview" appears in the top-right corner of the stream area (z-indexed above video, not blocking controls)

5. **Preview is cleared automatically on state change**
   - If `streamState` changes away from `explicit-offline` (e.g., Pi goes live or becomes unreachable), `adminPreviewActive` resets to `false` in `WatchView`

6. **No effect on non-admin users**
   - Non-admins see the standard `explicit-offline` overlay unchanged; no new props expose private state to them

7. **All tests pass; new component/composable logic is covered**

---

## Tasks / Subtasks

- [x] **Task 1: Extend `StreamState` type and server response**
  - [x] 1.1 Add `piReachable?: boolean` to `StreamState` interface in `packages/types/src/ws.ts`
  - [x] 1.2 Update `streamService.getState()` to return `{ state: 'explicit-offline', piReachable: this.piReachable }` when adminToggle is offline
  - [x] 1.3 Write/update `streamService.test.ts` to assert `piReachable` field in explicit-offline state

- [x] **Task 2: Track `piReachableWhileOffline` in `useStream`**
  - [x] 2.1 Add `piReachableWhileOffline = ref(false)` to `useStream.ts` module-level state
  - [x] 2.2 In `toClientState` and `setStateFromWs`, set `piReachableWhileOffline.value` when state is explicit-offline
  - [x] 2.3 Export `piReachableWhileOffline` from `useStream()`
  - [x] 2.4 Update `useStream.test.ts` to cover the new ref

- [x] **Task 3: Preview button in `StateOverlay.vue`**
  - [x] 3.1 Add `showPreviewButton?: boolean` prop to `StateOverlay`
  - [x] 3.2 Add `emit('preview')` when button is clicked
  - [x] 3.3 Render a "Preview Stream" Button in the explicit-offline div, only when `showPreviewButton` is true
  - [x] 3.4 Update `StateOverlay.test.ts`

- [x] **Task 4: Preview wiring in `StreamPlayer.vue`**
  - [x] 4.1 Add props: `showPreviewButton?: boolean`, `adminPreview?: boolean`
  - [x] 4.2 Add emit: `startPreview: []`
  - [x] 4.3 Compute `effectiveStreamState`: when `adminPreview && streamState === 'explicit-offline'` → `'live'`; otherwise `streamState`
  - [x] 4.4 Replace all uses of `streamState` in the existing WHEP watch and overlay conditions with `effectiveStreamState`
  - [x] 4.5 Forward `StateOverlay`'s `preview` emit as `startPreview`
  - [x] 4.6 Show a `"Preview"` badge overlay (`absolute top-2 right-2`, Tailwind Badge) when `adminPreview && effectiveStreamState === 'live' && streamState === 'explicit-offline'`
  - [x] 4.7 Update `StreamPlayer.test.ts`

- [x] **Task 5: Wire up `WatchView.vue`**
  - [x] 5.1 Import `piReachableWhileOffline` from `useStream`
  - [x] 5.2 Add `adminPreviewActive = ref(false)`, reset in a `watch(streamState)` when state is no longer `explicit-offline`
  - [x] 5.3 Pass `showPreviewButton` and `adminPreview` props to all `<StreamPlayer>` instances in template
  - [x] 5.4 Handle `startPreview` event to set `adminPreviewActive = true`
  - [x] 5.5 Update `WatchView.test.ts`

- [x] **Task 6: Full regression — all tests pass**

---

## Dev Notes

### Architecture
- `piReachable` in `StreamState` is a **server-owned fact** — do not duplicate logic on the client. The client simply reads it.
- `adminPreviewActive` is **WatchView-local state** — do not lift it into `useStream` or a composable.
- `effectiveStreamState` is a `computed()` inside `StreamPlayer` — the existing WHEP watch is refactored to watch the computed, not the prop directly. This is the minimal change needed.
- The WHEP endpoint (`POST /api/stream/whep`) has **no server-side explicit-offline gate** — it proxies directly to mediamtx. Preview works as long as mediamtx has a ready path, which is already true when `piReachable = true`.

### Prop chain summary
```
WatchView
  adminPreviewActive (ref)
  piReachableWhileOffline (from useStream)
  showPreviewButton = isAdmin && piReachableWhileOffline
  → StreamPlayer :showPreviewButton :adminPreview @startPreview
      → StateOverlay :showPreviewButton @preview
```

### Badge design
- Use `<Badge>` from `@/components/ui/badge` with `variant="outline"` or a semi-transparent custom class
- Position: `absolute top-2 right-2 z-20 pointer-events-none`
- Text: `"PREVIEW"`

### toClientState update
`toClientState` currently ignores `piReachable`. It only needs to set the ref:
```ts
function toClientState(s: StreamState): Exclude<ClientStreamState, 'connecting'> {
  if (s.state === 'explicit-offline') {
    piReachableWhileOffline.value = s.piReachable ?? false;
    return 'explicit-offline';
  }
  piReachableWhileOffline.value = false;
  if (s.state === 'live') return 'live';
  return 'unreachable';
}
```

---

## File List

- `packages/types/src/ws.ts`
- `apps/server/src/services/streamService.ts`
- `apps/server/src/services/streamService.test.ts`
- `apps/web/src/composables/useStream.ts`
- `apps/web/src/composables/useStream.test.ts`
- `apps/web/src/components/stream/StateOverlay.vue`
- `apps/web/src/components/stream/StateOverlay.test.ts`
- `apps/web/src/components/stream/StreamPlayer.vue`
- `apps/web/src/components/stream/StreamPlayer.test.ts`
- `apps/web/src/views/WatchView.vue`
- `apps/web/src/views/WatchView.test.ts`

---

## Dev Agent Record

### Implementation Plan
Full-stack change: `StreamState` type extended, server `getState()` returns `piReachable`, client `useStream` tracks `piReachableWhileOffline`, `StateOverlay` gets preview button, `StreamPlayer` computes `effectiveStreamState` to bypass explicit-offline for WHEP, `WatchView` manages `adminPreviewActive`.

### Completion Notes
- Server: `streamService.getState()` returns `{ state: 'explicit-offline', piReachable: this.piReachable }` — Pi reachability included even when admin-toggled offline
- Client: `toClientState()` now sets/clears `piReachableWhileOffline` ref based on `piReachable` in payload
- `StateOverlay`: "Preview Stream" button gated on `showPreviewButton` prop, only in explicit-offline variant
- `StreamPlayer`: `effectiveStreamState` computed bypasses explicit-offline when `adminPreview=true`; PREVIEW badge shows while active; `data-preview-badge` for test targeting
- `WatchView`: `showPreviewButton = isAdmin && piReachableWhileOffline`; `adminPreviewActive` auto-resets when state leaves explicit-offline
- WatchView tests required adding mocks for `Sheet`, `SheetContent`, `AdminPanel`, `UserManagerDialog` (all rendered when `isAdmin=true`)
- 12 new server tests, 23 new web tests; 390 + 874 = 1264 total, all passing; lint and typecheck clean

### Debug Log
- `overlay.trigger('preview')` in StreamPlayer test didn't emit component event — fixed by clicking `[data-preview-button]` directly
- WatchView Admin preview tests failed due to unmocked reka-ui `ScrollAreaRoot` (from AdminPanel via Sheet slot) — fixed by making Sheet/SheetContent mocks render no slot content, and adding AdminPanel mock

---

## Change Log

| Date | Change |
|------|--------|
| 2026-03-16 | Story created |
| 2026-03-16 | Implemented — all tasks complete, status → review |
