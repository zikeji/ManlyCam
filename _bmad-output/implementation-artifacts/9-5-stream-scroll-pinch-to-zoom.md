# Story 9-5: Stream Scroll/Pinch-to-Zoom

Status: ready-for-dev

## Story

As an **authenticated viewer**,
I want to zoom into the live stream using scroll or pinch,
so that I can get a closer look without the zoomed video obscuring other UI elements.

## Acceptance Criteria

1. **Given** I hover over the stream video element on desktop, **When** I scroll up (wheel delta negative), **Then** the stream zooms in, centered on the cursor position; **And** scrolling down zooms back out.

2. **Given** I am on a touch device, **When** I perform a pinch-open gesture on the stream, **Then** the stream zooms in; **And** a pinch-close gesture zooms out.

3. **Given** the stream is at minimum zoom (1×), **When** I scroll or pinch to zoom out further, **Then** zoom does not go below 1×.

4. **Given** the stream is at maximum zoom (5×), **When** I scroll or pinch to zoom in further, **Then** zoom does not exceed 5×.

5. **Given** the stream is zoomed in (> 1×), **When** I click and drag on the stream, **Then** the view pans to follow the drag; **And** the video element does not scroll the page.

6. **Given** the stream is zoomed in at any level, **Then** the video element is clipped to the stream viewport container via `overflow: hidden`; **And** the Broadcast Console strip is never occluded by the zoomed video; **And** the video does not overflow into the chat sidebar area.

7. **Given** the stream is at any zoom level, **When** I double-click (desktop) or double-tap (touch) the stream, **Then** zoom resets to 1× and pan resets to center.

8. **Given** I have zoomed the stream to any level, **When** I refresh the page, **Then** the stream loads at 1× zoom (zoom state is not persisted).

## Tasks / Subtasks

- [ ] Task 1: Create `useStreamZoom` composable (AC: #1, #2, #3, #4, #5, #7, #8)
  - [ ] Subtask 1.1: Create `apps/web/src/composables/useStreamZoom.ts`
  - [ ] Subtask 1.2: Export reactive `scale` (default `1`, bounded `1`–`5`) and `translateX`/`translateY` (default `0`)
  - [ ] Subtask 1.3: Implement `onWheel(event: WheelEvent)` — call `event.preventDefault()` to stop page scroll; compute cursor-relative zoom using container `getBoundingClientRect()`; update scale and clamp pan so zoomed video stays within container bounds
  - [ ] Subtask 1.4: Implement pinch via two-pointer `pointermove` tracking: track two active pointers, compute distance delta between frames to derive scale delta, apply incrementally; clamp to 1×–5×
  - [ ] Subtask 1.5: Implement pointer-drag pan for `scale > 1`: on `pointerdown` (single pointer, non-pinch) set `isDragging`, on `pointermove` accumulate delta to `translateX`/`translateY`, clamp so video edge cannot exceed container edge; on `pointerup`/`pointercancel` clear `isDragging`; call `event.preventDefault()` on pointermove while dragging to prevent page scroll
  - [ ] Subtask 1.6: Implement `resetZoom()` — sets scale to `1`, translateX/translateY to `0`
  - [ ] Subtask 1.7: Implement double-click detection via `ondblclick` handler calling `resetZoom()`; implement double-tap detection via consecutive `pointerup` timestamps within 300ms calling `resetZoom()`
  - [ ] Subtask 1.8: Export `containerRef` (`Ref<HTMLElement | null>`) and `zoomTransform` computed string — use `"translate(${translateX}px, ${translateY}px) scale(${scale})"` (translate first, then scale). CSS applies transforms list-order left-to-right, where each subsequent transform operates in the coordinate system established by the previous. `translate → scale` means: first translate in container-pixel space, then scale around origin. This is correct for our math model where `translateX`/`translateY` are computed in container pixels. **Do NOT use** `"scale(s) translate(x, y)"` — that applies translate in the already-scaled coordinate space, making cursor-centered zoom incorrect. Composable attaches all event listeners via `useEventListener` from `@vueuse/core` on `containerRef` when mounted.
  - [ ] Subtask 1.9: Ensure pan clamping is recomputed whenever scale changes (use `watchEffect` or compute clamp inside the zoom handlers)

- [ ] Task 2: Integrate `useStreamZoom` into `StreamPlayer.vue` (AC: #1, #2, #5, #6)
  - [ ] Subtask 2.1: Import `useStreamZoom` in `StreamPlayer.vue`
  - [ ] Subtask 2.2: Assign `containerRef` from composable to the existing outer `<div data-stream-container>` using Vue's **dynamic ref binding**: `:ref="containerRef"` (colon prefix required). Do NOT use `ref="containerRef"` (string form) — that creates a new template-local ref that does not populate the composable's `Ref<HTMLElement | null>`, so `useEventListener` never fires. Example: `<div data-stream-container :ref="containerRef" class="...">`. Vue assigns the element to the `Ref` object when mounted.
  - [ ] Subtask 2.3: Apply `zoomTransform` computed string to the `<video>` element as an inline style: `:style="{ transform: zoomTransform, transformOrigin: 'center center' }"`; `transformOrigin` is always `'center center'` — cursor-centered zoom is encoded into the translate values directly (see Dev Notes)
  - [ ] Subtask 2.4: Add `transform-gpu will-change-transform` Tailwind classes to the `<video>` element for smooth compositing; leave all other `<video>` classes unchanged
  - [ ] Subtask 2.5: Ensure state overlays and the landscape chat-toggle overlay remain at `z-index` above the video — they are currently `absolute inset-0` children of the container; the zoomed transform on the video only, not the container, keeps them unaffected
  - [ ] Subtask 2.6: Add `cursor-zoom-in` on the container when `scale === 1`, `cursor-grab` when `scale > 1` and not dragging, `cursor-grabbing` when dragging

- [ ] Task 3: Prevent page scroll during wheel and drag interactions (AC: #5, #6)
  - [ ] Subtask 3.1: The `wheel` event listener must be registered as `{ passive: false }` so `preventDefault()` is honoured; `useEventListener` from `@vueuse/core` supports the options object as third argument
  - [ ] Subtask 3.2: During drag (`isDragging`), `pointermove` must call `preventDefault()`; verify this works in both desktop and touch environments

- [ ] Task 4: Double-tap reset on touch (AC: #7)
  - [ ] Subtask 4.1: Track last `pointerup` timestamp per pointer id; if a second `pointerup` from the same pointer arrives within 300ms of the previous one, treat as double-tap and call `resetZoom()`
  - [ ] Subtask 4.2: **No guard is implemented for pinch-release false trigger.** The guard described in some design notes ("check only one pointer active") is ineffective — both `pointerup` events from a pinch fire in rapid succession, so by the time the second fires, the first pointer is already cleared from the active map. A correct guard would require tracking `lastPinchEndTime`, which adds complexity. Accepted as MVP-acceptable: the worst case is an unintended zoom reset after a pinch release, which is recoverable by the user. Document this with a code comment: `// Note: pinch-release may occasionally false-trigger double-tap reset (MVP-acceptable)`

- [ ] Task 5: Create `useStreamZoom.test.ts` (AC: all)
  - [ ] Subtask 5.1: Create `apps/web/src/composables/useStreamZoom.test.ts` co-located with the composable
  - [ ] Subtask 5.2: Test wheel zoom-in: dispatch WheelEvent with negative deltaY on container; assert scale increases
  - [ ] Subtask 5.3: Test wheel zoom-out: assert scale decreases but does not go below 1
  - [ ] Subtask 5.4: Test max zoom clamp: zoom in repeatedly; assert scale never exceeds 5
  - [ ] Subtask 5.5: Test cursor-centered zoom offset: verify translateX/translateY are non-zero after wheel zoom at off-center position
  - [ ] Subtask 5.6: Test drag pan: simulate pointerdown → pointermove → pointerup sequence; assert translateX/translateY change
  - [ ] Subtask 5.7: Test pan clamp: at max scale, pan far enough to hit boundary; assert coordinates do not allow video edge to exceed container edge
  - [ ] Subtask 5.8: Test double-click reset: call reset; assert scale returns to 1 and translate returns to 0
  - [ ] Subtask 5.9: Test double-tap reset: simulate two rapid pointerup events; assert reset triggered
  - [ ] Subtask 5.10: Test that `resetZoom` sets scale `1` and both translate values to `0`

- [ ] Task 6: Update `StreamPlayer.test.ts` (AC: #6)
  - [ ] Subtask 6.1: Add smoke test that the `<video>` element receives a non-empty `transform` style when `useStreamZoom` is mounted — mock the composable return if needed
  - [ ] Subtask 6.2: Ensure existing StreamPlayer tests continue to pass (no regressions to existing WHEP, overlay, and tap-toggle tests)

- [ ] Task 7: Quality gate (all ACs)
  - [ ] Subtask 7.1: Run `pnpm run typecheck` from `apps/web` — zero errors
  - [ ] Subtask 7.2: Run `pnpm run lint` from `apps/web` — zero errors
  - [ ] Subtask 7.3: Run `pnpm run test --coverage` from `apps/web` — all tests pass, thresholds met
  - [ ] Subtask 7.4: Flag for Zikeji to smoke-test: wheel zoom centered on cursor, pinch on touch, drag pan while zoomed, double-tap reset, video does not overlap BroadcastConsole or chat sidebar

## Dev Notes

### Architecture Decision: `useStreamZoom` composable

All zoom/pan logic belongs in `apps/web/src/composables/useStreamZoom.ts`. `StreamPlayer.vue` stays thin — it wires `containerRef` and applies the `transform` style. This matches the project pattern established by `useWhep`, `useSnapshot`, etc.

### Container Boundary Already Exists

`StreamPlayer.vue`'s outer `<div data-stream-container>` already has `overflow-hidden` (`class="relative isolate w-full portrait:aspect-video landscape:h-full overflow-hidden"`). Do **not** add another wrapper. Assign `containerRef` from the composable directly to this element. The `overflow-hidden` clips the zoomed video so it cannot bleed into the BroadcastConsole strip below or the chat sidebar to the right.

### Transform on Video Element Only — Not the Container

Apply the CSS transform (`scale` + `translate`) to the `<video>` element itself, not the container `<div>`. The overlays (StateOverlay, spinner, landscape tap button) are `absolute inset-0` siblings of the `<video>` inside the container; transforming only the video keeps them unaffected and correctly positioned.

### `transform-origin` for Cursor-Centered Zoom

When the user scrolls at a cursor position `(cx, cy)` relative to the container:
1. Compute cursor offset from container center: `offsetX = cx - containerWidth/2`, `offsetY = cy - containerHeight/2`
2. New translate: `translateX = (translateX - offsetX) * (newScale / oldScale) + offsetX`, same for Y
3. Clamp translate after computing (see pan clamp section below)
4. Set `transformOrigin: "center center"` (fixed) on the `<video>` — do NOT use cursor position as `transform-origin` because that interacts badly with the translate; instead encode cursor offset into the translate directly as above.

### Pan Clamp Formula

After any zoom or drag that modifies `translateX`/`translateY`, clamp so the video edge never leaves the container. Guard against zero-width container: `if (!containerRef.value || containerWidth === 0) return;` — in practice this cannot happen since events require the element to be mounted, but the guard makes intent explicit.

```
maxTranslateX = (containerWidth  * (scale - 1)) / 2
maxTranslateY = (containerHeight * (scale - 1)) / 2
translateX = Math.max(-maxTranslateX, Math.min(maxTranslateX, translateX))
translateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, translateY))
```

When `scale === 1`, `maxTranslate` is `0` — translate is forced to zero, keeping the video centered.

### Wheel Zoom Step Size

Scale per wheel tick: `scale *= 1.1` per 100px of `|deltaY|` (or fraction thereof). For a single standard mouse scroll tick (~100px deltaY), this gives a 10% zoom increment — perceptible but not jarring. Implementation:

```ts
const zoomFactor = Math.pow(1.1, -event.deltaY / 100); // negative: scroll up = zoom in
const newScale = Math.min(5, Math.max(1, scale.value * zoomFactor));
```

**`deltaMode` note:** `WheelEvent.deltaMode` is not checked. This formula targets `deltaMode === 0` (pixel-delta mode, used by most mice and macOS trackpads). On trackpads with small per-event `deltaY` (1–5px), each event contributes ~0.1% zoom — zoom accumulates correctly over the gesture but feels slower. On `deltaMode === 1` (line mode) or `deltaMode === 2` (page mode), the formula will produce incorrect step sizes. This is a known MVP limitation — acceptable for now since the dominant use case (mouse scroll on desktop) works well.

### Wheel Event — Must Be Non-Passive

`useEventListener` from `@vueuse/core` accepts an options object as the third argument:

```ts
useEventListener(containerRef, 'wheel', onWheel, { passive: false });
```

Without `{ passive: false }`, Chrome ignores `event.preventDefault()` on wheel events attached to scrollable ancestors, and the page will scroll while zooming.

### Pinch Gesture Implementation

Use the Pointer Events API (not Touch Events) for cross-device compatibility:
- `pointerdown`: if `event.pointerType === 'touch'`, add pointer to active map and call `event.target.setPointerCapture(event.pointerId)`
- `pointermove`: if 2 pointers in active map, compute distance = `Math.hypot(dx, dy)` between them; if `|newDistance - prevDistance| < 2px`, skip (jitter threshold — prevents noisy micro-scale changes on touch); otherwise derive `scaleMultiplier = newDistance / prevDistance`, apply to current scale, update prevDistance, clamp
- `pointerup`/`pointercancel`: remove from active map

Do NOT import `usePointerSwipe` from VueUse for this — it does not support pinch. Use `useEventListener` for raw pointer events.

### Drag Pan — Single Pointer While Zoomed

Only enable drag-pan when `scale > 1` and the active pointer count is 1 (not mid-pinch). Use `setPointerCapture` on `pointerdown` so `pointermove` fires even if pointer leaves the element.

Cursor classes on `data-stream-container`:
- `scale === 1`: `cursor-zoom-in` (indicates scroll/pinch zoom is available)
- `scale > 1`, not dragging: `cursor-grab`
- dragging: `cursor-grabbing`

### Double-Tap vs Double-Click

- Desktop double-click: listen on `dblclick` event → `resetZoom()`
- Touch double-tap: track `pointerup` timestamp per `pointerId`; if same pointer fires a second `pointerup` within 300ms of the first, call `resetZoom()`. Guard: if 2+ pointers are active at time of second `pointerup`, it is a pinch-release, not a double-tap — skip.

### No Server Changes

This story is purely frontend. No server routes, no WebSocket messages, no Prisma changes.

### Zoom State Not Persisted

Do not write zoom state to `localStorage`. On page refresh, `scale` is always `1` and translate is `0,0`. This is intentional per FR73 and AC #8.

### VueUse Import

`@vueuse/core` is already a production dependency (`^12.0.0`). Import `useEventListener` from `@vueuse/core` — do not add any new dependencies.

```ts
import { useEventListener } from '@vueuse/core';
```

### Named Exports Only

`useStreamZoom.ts` must use named exports:

```ts
export function useStreamZoom() { ... }
```

No `export default`.

### Testing Notes

- `useStreamZoom.test.ts` must be co-located at `apps/web/src/composables/useStreamZoom.test.ts`
- Use `jsdom` environment (already configured in `vite.config.ts` test block)
- To simulate a `WheelEvent` with `deltaY`: `new WheelEvent('wheel', { deltaY: -100, clientX: 50, clientY: 50, bubbles: true, cancelable: true })`
- For pointer events: `new PointerEvent('pointerdown', { pointerId: 1, clientX: 0, clientY: 0, pointerType: 'mouse', bubbles: true })`
- `getBoundingClientRect()` returns all zeros in jsdom; set up a mock: `vi.spyOn(containerEl, 'getBoundingClientRect').mockReturnValue({ width: 640, height: 360, left: 0, top: 0, right: 640, bottom: 360, x: 0, y: 0, toJSON: () => ({}) })`
- Every test suite touching Vue composables with refs must follow the cleanup pattern — but `useStreamZoom` has no Vue component lifecycle, so no `mount`/`unmount` needed; test the plain function with a DOM element fixture
- Cover all branches: clamp at min, clamp at max, drag while `scale === 1` (no-op), drag while `scale > 1`, pinch with fewer than 2 pointers (no-op), double-tap within vs outside 300ms window
- Lines that cannot be covered in jsdom (e.g., `setPointerCapture` which is not implemented): use `/* istanbul ignore next */` with a comment

### Coverage Thresholds

Current web coverage thresholds (from `vite.config.ts`):
- lines: 90%, functions: 64%, branches: 90%, statements: 90%

Do not lower thresholds. The new composable must be fully covered or have explicit `/* istanbul ignore */` annotations on untestable branches.

### Previous Story Patterns

- Composable files use `useEventListener` from `@vueuse/core` (pattern established in `useWhep.ts`, `useSnapshot.ts`)
- `StreamPlayer.vue` already exposes `videoRef` via `defineExpose` — do not remove that; the composable ref is for the container div, not the video element
- The `handleTap` function in `StreamPlayer.vue` uses `(event as PointerEvent).pointerType === 'touch'` to detect touch — use the same pattern in `useStreamZoom`
- Emoji picker (Story 8-5) and ReactionBar emoji picker used `position: fixed` for overlays — the zoom feature uses CSS transforms on a contained element, which is a different pattern and does not conflict

### Project Structure Notes

- New composable: `apps/web/src/composables/useStreamZoom.ts`
- New test: `apps/web/src/composables/useStreamZoom.test.ts`
- Modified: `apps/web/src/components/stream/StreamPlayer.vue`
- Modified: `apps/web/src/components/stream/StreamPlayer.test.ts`
- No other files need modification

### References

- FR73: `_bmad-output/planning-artifacts/epics.md` line 127
- Story 9-5 AC: `_bmad-output/planning-artifacts/epics.md` lines 2213–2255
- `StreamPlayer.vue`: `apps/web/src/components/stream/StreamPlayer.vue`
- `WatchView.vue` (layout context): `apps/web/src/views/WatchView.vue`
- VueUse `useEventListener`: `@vueuse/core` ^12.0.0 (already installed)
- Coverage thresholds: `apps/web/vite.config.ts` lines 67–73
- CLAUDE.md: emoji picker / fixed-position overlays rule; transform note for CSS transforms; VueUse availability

## Open Questions

~~1. Transform formula order~~ **RESOLVED:** Use `"translate(${x}px, ${y}px) scale(${s})"` — translate first, then scale. See Subtask 1.8 and `zoomTransform` formula note.

~~2. Wheel zoom step size~~ **RESOLVED:** `scale *= 1.1` per 100px `|deltaY|`. See "Wheel Zoom Step Size" in Dev Notes.

~~3. Pinch sensitivity / jitter threshold~~ **RESOLVED:** Ignore distance deltas < 2px. See "Pinch Gesture Implementation" in Dev Notes.

4. **Double-tap pinch-release false trigger (MVP-acceptable):** The guard "only one pointer active at time of second pointerup" is insufficient if both fingers of a pinch release within 300ms. This edge case is accepted as MVP-acceptable UX — the worst outcome is an unintended zoom reset after a pinch, which is recoverable. No additional guard is required for this story.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List

- `apps/web/src/composables/useStreamZoom.ts` (new)
- `apps/web/src/composables/useStreamZoom.test.ts` (new)
- `apps/web/src/components/stream/StreamPlayer.vue` (modified)
- `apps/web/src/components/stream/StreamPlayer.test.ts` (modified)
