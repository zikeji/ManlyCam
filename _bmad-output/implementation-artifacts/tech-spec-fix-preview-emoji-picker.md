---
title: 'Fix: Preview Stream button + emoji picker hover gap'
type: 'bugfix'
created: '2026-03-21'
status: 'done'
baseline_commit: '3e299e60a25a0d140f4f0e93d3ed7bfb2e9a17de'
context: []
---

# Fix: Preview Stream button + emoji picker hover gap

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Two regressions: (1) The "Preview Stream" button on the explicit-offline overlay is unclickable — story 9-5's `useStreamZoom` unconditionally calls `setPointerCapture()` on every `pointerdown` in the stream container, redirecting `pointerup` to the container so `click` never reaches child elements. (2) The emoji reaction picker vanishes when the mouse moves slowly from the "+" button toward the fixed-position picker — the gap between the action bar and picker triggers `mouseleave` on the message container, which collapses the bar and unmounts the picker.

**Approach:** (1) Guard `setPointerCapture` in two layers: first skip it entirely at scale=1 with a single pointer; then defer it for single-pointer pan to the first `pointermove` (a plain tap produces no movement and never captures, so child overlay buttons work at any zoom level). Pinch (2nd pointer) still captures eagerly on `pointerdown`. (2) Add an invisible `position: fixed; height: 8px` bridge div inside `ReactionBar`'s DOM subtree that covers the visual gap between the floating bar and the picker — because the bridge div is a DOM descendant of the message container, mouse traversal through the gap never fires `mouseleave`.

## Boundaries & Constraints

**Always:**
- All existing zoom/pan/pinch behavior must be preserved (pointer capture still used for scale > 1 pan and for pinch).
- The emoji picker must remain `position: fixed` (CLAUDE.md rule for floating overlays).
- Named exports only; no `export default` in source files.
- Tests co-located with their source files.

**Ask First:**
- Any change to zoom behavior visible in normal (scale = 1) stream viewing.

**Never:**
- Change `EmojiPicker` from `fixed` to `absolute` positioning.
- Modify `handleTap` or WHEP connection logic in `StreamPlayer`.
- Touch the server — both bugs are client-side only.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Preview button click at scale=1 | User clicks "Preview Stream" button; zoom at 1× | `startPreview` emitted; WHEP starts; overlay hides | N/A |
| Pan at scale>1 | User drags at zoom > 1× | Pointer captured to container; smooth pan | N/A |
| Pinch to zoom from scale=1 | Two-finger pinch inside container | Both pointers tracked; scale increases | N/A |
| Slow mouse to emoji picker | Picker is open; mouse exits message div slowly | Bar stays visible; picker stays visible | N/A |
| Fast mouse to emoji picker | Same as above | Same — fast path already worked, must stay working | N/A |
| Pick emoji with picker open | User selects an emoji | Picker closes; bar collapses | N/A |
| Dismiss picker (click outside) | User clicks outside picker | Picker closes; bar collapses | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/composables/useStreamZoom.ts` -- Bug 1: deferred single-pointer pan capture to `pointermove`; pinch still captures on `pointerdown`
- `apps/web/src/composables/useStreamZoom.test.ts` -- Added/updated 3 capture-guard tests
- `apps/web/src/components/chat/ReactionBar.vue` -- Bug 2: added 8px invisible bridge div covering gap to picker; no `pickerChange` emit needed
- `apps/web/src/components/chat/ReactionBar.test.ts` -- No new tests needed for bridge div (DOM-level fix)
- `apps/web/src/components/chat/ChatMessage.vue` -- No changes needed (reverted all state-tracking additions)
- `apps/web/src/components/chat/ChatMessage.test.ts` -- Reverted mock and removed picker-hover-guard tests (state tracking abandoned)

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/composables/useStreamZoom.ts` -- Pinch (2nd pointer) captures immediately on `pointerdown`; single-pointer pan defers capture to the first `pointermove` so a tap never redirects `pointerup`
- [x] `apps/web/src/composables/useStreamZoom.test.ts` -- 3 capture-guard tests: NOT called at scale=1/single, called on first `pointermove` at scale>1, called on 2nd-pointer `pointerdown` for pinch
- [x] `apps/web/src/components/chat/ReactionBar.vue` -- Added invisible 8px `position: fixed z-[199]` bridge div between the bar and the picker; no `pickerChange` event or state tracking needed
- [x] `apps/web/src/components/chat/ChatMessage.vue` -- No changes (simple `handleMouseLeave` restored)

**Acceptance Criteria:**
- [x] Given the stream is explicit-offline and Pi is reachable (admin), when the admin clicks "Preview Stream", then WHEP starts and the overlay hides. *(smoke-tested)*
- [x] Given the stream is zoomed in (scale>1), when the admin clicks "Stop Preview", the button click registers. *(smoke-tested)*
- [x] Given the stream is at scale=1, when the user single-clicks inside the stream container, then no pointer capture is set on the container.
- [x] Given the stream is at scale>1, when the user drags, then pointer capture fires on the first `pointermove`.
- [x] Given the emoji picker is open via "+" and the mouse moves slowly out of the message row, then the reaction bar and picker remain visible until the user picks an emoji or dismisses the picker. *(smoke-tested)*
- [x] Given the emoji picker is open and the user selects an emoji, then the picker closes and the reaction bar collapses. *(smoke-tested)*

## Design Notes

**Bug 1 — deferred capture:**

In `onPointerDown`, only the 2nd pointer (pinch) is captured eagerly. Single-pointer pan (`scale > 1`, `activePointers.size === 1`) sets `isDragging = true` but does not call `setPointerCapture`. Capture fires in `onPointerMove` the first time the pan branch runs:

```ts
// onPointerDown — pinch only
if (activePointers.size === 2) {
  (event.currentTarget as ...)?.setPointerCapture?.(event.pointerId);
}

// onPointerMove — pan
} else if (isDragging.value) {
  event.preventDefault();
  (event.currentTarget as ...)?.setPointerCapture?.(event.pointerId);
  translateX.value += ...;
}
```

Rationale: a tap produces `pointerdown → pointerup` with no `pointermove`. By deferring capture to `pointermove`, taps never redirect `pointerup` and child button clicks work at any zoom level.

**Bug 2 — bridge div:**

```html
<div
  v-if="showPicker && pickerPosition"
  class="fixed z-[199]"
  :style="{
    bottom: pickerPosition.bottom - 8 + 'px',
    right: pickerPosition.right + 'px',
    width: '320px',
    height: '8px',
  }"
/>
```

The picker is positioned `bottom: window.innerHeight - rect.top + 8` (8px above the "+" button top). The bridge sits at `bottom: pickerPosition.bottom - 8` — exactly filling that gap. Because it remains in the DOM subtree of the message container, mouse traversal through the gap never fires `mouseleave` on the container. `z-[199]` keeps it below the picker (`z-[200]`).

## Verification

**Commands:**
- `pnpm run typecheck` (from `apps/web`) -- passed: zero errors
- `pnpm run lint` (from `apps/web`) -- passed: zero errors
- `pnpm run test --coverage` (from `apps/web`) -- passed: 1160 tests, all thresholds met

**Branch:** `fix/preview-stream-emoji-picker-hover`
**Commits:**
- `02aec63` fix(web): preview stream button and emoji picker hover gap *(initial Bug 1 fix)*
- `d96bc2f` fix(web): bridge gap between reaction bar and emoji picker overlay
- `f35e49f` fix(web): defer setPointerCapture to first pointermove for single-pointer pan

**Smoke test results (2026-03-22):** All four scenarios confirmed passing by Zikeji.
