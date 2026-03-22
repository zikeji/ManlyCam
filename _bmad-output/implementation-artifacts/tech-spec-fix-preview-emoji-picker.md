---
title: 'Fix: Preview Stream button + emoji picker hover gap'
type: 'bugfix'
created: '2026-03-21'
status: 'in-progress'
baseline_commit: '3e299e60a25a0d140f4f0e93d3ed7bfb2e9a17de'
context: []
---

# Fix: Preview Stream button + emoji picker hover gap

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Two regressions: (1) The "Preview Stream" button on the explicit-offline overlay is unclickable — story 9-5's `useStreamZoom` unconditionally calls `setPointerCapture()` on every `pointerdown` in the stream container, redirecting `pointerup` to the container so `click` never reaches child elements. (2) The emoji reaction picker vanishes when the mouse moves slowly from the "+" button toward the fixed-position picker — the gap between the action bar and picker triggers `mouseleave` on the message container, which collapses the bar and unmounts the picker.

**Approach:** (1) Guard `setPointerCapture` so it only fires when actually needed: panning at scale > 1, or the second pointer in a pinch gesture. (2) Emit a `pickerChange` event from `ReactionBar` when `showPicker` toggles; in `ChatMessage`, suppress `handleMouseLeave` while the picker is open, and collapse the bar when the picker closes and the mouse is no longer over the message.

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

- `apps/web/src/composables/useStreamZoom.ts` -- Bug 1 root cause: unconditional `setPointerCapture` in `onPointerDown`
- `apps/web/src/composables/useStreamZoom.test.ts` -- Tests for zoom composable
- `apps/web/src/components/chat/ReactionBar.vue` -- Bug 2: must emit `pickerChange` when `showPicker` toggles
- `apps/web/src/components/chat/ReactionBar.test.ts` -- Tests for ReactionBar
- `apps/web/src/components/chat/ChatMessage.vue` -- Bug 2: must guard `handleMouseLeave` while picker is open; 4 `<ReactionBar>` usages to update
- `apps/web/src/components/chat/ChatMessage.test.ts` -- Tests for ChatMessage

## Tasks & Acceptance

**Execution:**
- [ ] `apps/web/src/composables/useStreamZoom.ts` -- In `onPointerDown`, wrap `setPointerCapture` call in `if (activePointers.size === 2 || scale.value > 1)` so single clicks at scale=1 do not capture the pointer
- [ ] `apps/web/src/composables/useStreamZoom.test.ts` -- Add test: at scale=1 with a single pointer, `setPointerCapture` is NOT called; existing pinch and pan-at-scale tests remain green
- [ ] `apps/web/src/components/chat/ReactionBar.vue` -- Add `pickerChange: [open: boolean]` emit; watch `showPicker` and emit `pickerChange` on every change
- [ ] `apps/web/src/components/chat/ReactionBar.test.ts` -- Add test: clicking "+" emits `pickerChange` true; closing picker emits `pickerChange` false
- [ ] `apps/web/src/components/chat/ChatMessage.vue` -- Add `mouseIsOverMessage = ref(false)` (set true in `handleMouseEnter`, false in `handleMouseLeave`); add `reactionPickerOpen = ref(false)`; guard `handleMouseLeave` to skip bar collapse if `reactionPickerOpen`; add `handlePickerChange(open)` that sets `reactionPickerOpen` and, when `open` is false and mouse is outside, collapses the bar; wire `@picker-change="handlePickerChange"` on all four `<ReactionBar>` usages
- [ ] `apps/web/src/components/chat/ChatMessage.test.ts` -- Add tests: bar stays visible on mouseleave when picker is open; bar collapses when picker closes after mouseleave

**Acceptance Criteria:**
- Given the stream is explicit-offline and Pi is reachable (admin), when the admin clicks "Preview Stream", then WHEP starts and the overlay hides.
- Given the stream is at scale=1, when the user single-clicks inside the stream container, then no pointer capture is set on the container.
- Given the stream is at scale>1, when the user drags, then pointer capture fires as before.
- Given the emoji picker is open via "+" and the mouse moves slowly out of the message row, then the reaction bar and picker remain visible until the user picks an emoji or dismisses the picker.
- Given the emoji picker is open and the user selects an emoji, then the picker closes and the reaction bar collapses.

## Design Notes

**Bug 1 — guard condition:**
```ts
if (activePointers.size === 2 || scale.value > 1) {
  (event.currentTarget as { setPointerCapture?: (id: number) => void } | null)
    ?.setPointerCapture?.(event.pointerId);
}
```
Rationale: at scale=1 with a single pointer, `setPointerCapture` offers no benefit (nothing to pan) and breaks child clicks. Pinch (size===2) and pan (scale>1) still capture for smooth tracking.

**Bug 2 — picker-open guard:**
```ts
function handlePickerChange(open: boolean) {
  reactionPickerOpen.value = open;
  if (!open && !mouseIsOverMessage.value) {
    showReactionBar.value = false;
  }
}
```
When picker closes while mouse is outside, we must explicitly collapse the bar (mouseleave already fired and was suppressed). When picker closes while mouse is still inside, bar stays — normal mouseleave will eventually hide it.

## Verification

**Commands:**
- `pnpm run typecheck` (from `apps/web`) -- expected: zero errors
- `pnpm run lint` (from `apps/web`) -- expected: zero errors
- `pnpm run test --coverage` (from `apps/web`) -- expected: all tests pass, coverage thresholds met
