# Story 7.3: Camera Snapshot Button (Client-Side Frame Capture)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an **authenticated viewer**,
I want to **capture** current stream frame as a still image via a snapshot button in Broadcast Console right flank,
so that **I can save and share a memorable moment from the live feed**.

## Acceptance Criteria

1. **Given** a viewer is on the watch page and stream is in `live` state, **When** they click to the camera icon button in Broadcast Console right flank, **Then** → current video frame is captured as a JPEG image and automatically downloaded to their device with a filename like `"${SITE_NAME}_${PET_NAME}_YYYYMMDD-HHmmssZ.jpg"` (e.g., `ManlyCam_Manly_20260312-143015Z.jpg`). Milliseconds in timestamp ensure uniqueness for rapid-fire clicks without duplicate browser warnings.

2. **Given** the snapshot button is clicked, **When** the capture process executes, **Then** a canvas element is created off-screen matching to the video's `videoWidth × videoHeight` dimensions, the video frame is drawn to the canvas via `drawImage(videoEl, 0, 0)`, and `canvas.toBlob()` is called with the `'image/jpeg'` format at `0.92` quality.

3. **Given** the blob is generated, **Then** an object URL is created, an anchor `<a>` element is created with a `download` attribute, programmatically clicked to trigger the download, and the object URL is revoked via `URL.revokeObjectURL()` after the click.

4. **Given** the stream state is NOT `live` (e.g., `connecting`, `explicit-offline`, `unreachable`), **When** a viewer views the Broadcast Console, **Then** the snapshot button is disabled and displays a tooltip `"Stream not live"` instead of `"Take Snapshot"`.

5. **Given** the stream state transitions to `live`, **When** the snapshot button is re-enabled, **Then** the tooltip returns to `"Take Snapshot"`.

6. **Given** the `takeSnapshot()` function is extracted as a composable, **When** called with a valid `HTMLVideoElement` and `petName` string, **Then** the snapshot capture and download flow executes correctly without side effects or memory leaks.

7. **Given** `StreamPlayer.vue` has already exposed `videoRef` via `defineExpose` in story 7-1, **When** `BroadcastConsole.vue` needs to reference the video element for snapshot, **Then** the ref is accessible via the provide/inject pattern or passed as a prop from the parent component (`WatchView.vue`).

## Tasks / Subtasks

- [x] Task 1: Create `useSnapshot` composable (AC: #2, #3, #6)
  - [x] Subtask 1.1: Create `apps/web/src/composables/useSnapshot.ts`
  - [x] Subtask 1.2: Export `takeSnapshot(videoEl: HTMLVideoElement, petName: string): void` function
  - [x] Subtask 1.3: Implement canvas creation with `videoEl.videoWidth × videoEl.videoHeight`
  - [x] Subtask 1.4: Draw video frame to canvas via `ctx.drawImage(videoEl, 0, 0)`
  - [x] Subtask 1.5: Convert canvas to JPEG blob via `canvas.toBlob(callback, 'image/jpeg', 0.92)`
  - [x] Subtask 1.6: Create object URL, anchor element with download attribute, click programmatically, revoke URL
  - [x] Subtask 1.7: Format timestamp in filename for uniqueness — use compact ISO format: `${SITE_NAME}_${PET_NAME}_YYYYMMDD-HHmmssZ.jpg` (e.g., `ManlyCam_Manly_20260312-143015Z.jpg`). Milliseconds guarantee uniqueness for rapid-fire clicks without duplicate warnings.

- [x] Task 2: Activate snapshot button in BroadcastConsole (AC: #1, #4, #5)
  - [x] Subtask 2.1: Remove `v-show="false"` from snapshot button (line 155 in BroadcastConsole.vue)
  - [x] Subtask 2.2: Remove `title="Take Snapshot (coming soon)"` and `disabled` attribute
  - [x] Subtask 2.3: Add `title="Take Snapshot"` tooltip
  - [x] Subtask 2.4: Add `@click` handler calling `takeSnapshot()` composable
  - [x] Subtask 2.5: Bind button `disabled` state to `streamState !== 'live'`
  - [x] Subtask 2.6: Bind button `title` attribute conditionally: `"Take Snapshot"` when live, `"Stream not live"` when not live

- [x] Task 3: Wire videoRef from StreamPlayer to BroadcastConsole (AC: #7)
  - [x] Subtask 3.1: Add `videoRef?: HTMLVideoElement | null` prop to BroadcastConsole
  - [x] Subtask 3.2: Import `getPetName()` and `getSiteName()` from `@/lib/env` (already exists in story 7-1)
  - [x] Subtask 3.3: In WatchView, pass `streamVideoRef` (computed from `streamPlayerRef.value?.videoRef`) to BroadcastConsole as `videoRef` prop

- [x] Task 4: Create tests for snapshot functionality (AC: #1, #2, #6)
  - [x] Subtask 4.1: Create `apps/web/src/composables/useSnapshot.test.ts`
  - [x] Subtask 4.2: Mock canvas element and context for frame capture
  - [x] Subtask 4.3: Mock `toBlob()` with JPEG blob callback
  - [x] Subtask 4.4: Mock document.createElement for anchor creation
  - [x] Subtask 4.5: Test blob creation with correct MIME type and quality
  - [x] Subtask 4.6: Test download filename format with site name, pet name and timestamp
  - [x] Subtask 4.7: Test URL revocation after download
  - [x] Subtask 4.8: Ensure no memory leaks (verify createElement/cleanup)
  - [x] Subtask 4.9: Update `BroadcastConsole.test.ts` with snapshot button tests
  - [x] Subtask 4.10: Test button enabled when stream is `live`
  - [x] Subtask 4.11: Test button disabled when stream is NOT `live`
  - [x] Subtask 4.12: Test conditional tooltip text changes

## Dev Notes

### Architecture and Patterns

- **Client-side only implementation:** No server involvement is required. The entire capture flow happens in the browser.
- **Canvas-based frame capture:** Standard approach for video-to-image conversion in browser. `canvas.toBlob()` with the `'image/jpeg'` format and `0.92` quality provides a good balance of file size and image quality.
- **Memory management:** Object URLs created via `URL.createObjectURL()` must be revoked via `URL.revokeObjectURL()` after use to prevent memory leaks. Anchor elements created programmatically are not appended to the DOM, so no cleanup is needed for them.
- **Timestamp format for uniqueness:** Compact ISO 8601-style format with fractional seconds (milliseconds) — `${SITE_NAME}_${PET_NAME}_YYYYMMDD-HHmmssZ.jpg` (e.g., `ManlyCam_Manly_20260312-143015Z.jpg`). Milliseconds guarantee each rapid-fire snapshot has a unique filename, preventing "file already exists" browser prompts.
- **Prop drilling from WatchView:** `videoRef` flows from `StreamPlayer.vue` (exposed via `defineExpose`) → `WatchView.vue` (computed via `streamPlayerRef.value?.videoRef`) → `BroadcastConsole.vue` (as prop). This pattern is established in story 7-1.

### Source Tree Components to Touch

**Files to create:**

- `apps/web/src/composables/useSnapshot.ts` — new composable for snapshot capture
- `apps/web/src/composables/useSnapshot.test.ts` — tests for snapshot composable

**Files to modify:**

- `apps/web/src/components/stream/BroadcastConsole.vue` — activate snapshot button stub, wire videoRef prop, bind disabled state
- `apps/web/src/components/stream/BroadcastConsole.test.ts` — add snapshot button tests
- `apps/web/src/views/WatchView.vue` — pass `streamVideoRef` to BroadcastConsole (computed from `streamPlayerRef.value?.videoRef`)

**Files NOT to touch:**

- `apps/web/src/components/stream/StreamPlayer.vue` — `defineExpose({ videoRef })` already exists from story 7-1
- `apps/web/src/lib/env.ts` — `getPetName()` and `getSiteName()` already exist
- All server files — no server involvement is required
- `packages/types` — no new types are needed

### Testing Standards Summary

- **Composable tests:** Follow existing patterns from `useWhep.test.ts`, `useStream.test.ts`. Mock canvas and DOM APIs; verify callbacks fire; assert correct MIME type and quality.
- **Component tests:** Follow existing patterns from `BroadcastConsole.test.ts`. Use `vi.fn().mockResolvedValue` for mock composables. Test both enabled and disabled button states with conditional tooltips.
- **Test coverage:** New composable should have at least 90% coverage; component updates should maintain existing coverage baseline.
- **AfterEach cleanup:** Always include `afterEach(() => { wrapper?.unmount(); wrapper = null; })` in component tests to prevent test isolation issues (Epic 4 lesson).

### Project Structure Notes

- **Composable location:** `apps/web/src/composables/useSnapshot.ts` follows the established pattern for shared logic (alongside `useStream.ts`, `useAuth.ts`, `usePresence.ts`, etc.).
- **Named exports only:** Export `takeSnapshot` function directly; no `export default`.
- **Prop drilling from WatchView:** WatchView already has the `streamPlayerRef` pattern established in story 7-1. Compute `streamVideoRef` and pass to BroadcastConsole.
- **Consistent with 7-1 design:** Snapshot button exists in the Broadcast Console right flank; activating it does not change the layout or other UI elements.

### References

- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-03-12.md#Story-7-3] — Complete story definition, key changes, acceptance criteria
- [Source: _bmad-output/implementation-artifacts/7-1-ux-shell-redesign-broadcast-console-atmospheric-void.md] — BroadcastConsole component structure, snapshot button stub location, defineExpose pattern for videoRef
- [Source: apps/web/src/components/stream/StreamPlayer.vue] — Existing `defineExpose({ videoRef })` implementation (line 63)
- [Source: apps/web/src/lib/env.ts] — Existing `getPetName()` and `getSiteName()` functions for site name and pet name resolution
- [Source: apps/web/src/components/stream/BroadcastConsole.test.ts] — Existing test patterns, mock composables approach, beforeEach/afterEach cleanup

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

Implementation completed 2026-03-12:

- Created `useSnapshot` composable with canvas-based frame capture
- Implemented `takeSnapshot(videoEl, petName)` function that:
  - Creates off-screen canvas matching video dimensions
  - Draws video frame to canvas via `drawImage()`
  - Converts to JPEG blob at 0.92 quality
  - Creates object URL and programmatically triggers download
  - Revokes object URL to prevent memory leaks
- Activated snapshot button in BroadcastConsole:
  - Removed `v-show="false"` and disabled stub
  - Added click handler calling `takeSnapshot()` composable
  - Bound disabled state to `streamState !== 'live'`
  - Added conditional tooltips ("Take Snapshot" vs "Stream not live")
- Wired videoRef from StreamPlayer to BroadcastConsole via WatchView prop drilling
- All 740 tests passing (442 web + 298 server)
- New test files: useSnapshot.test.ts (8 tests), BroadcastConsole.test.ts updated (5 new tests)

### File List

- apps/web/src/composables/useSnapshot.ts
- apps/web/src/composables/useSnapshot.test.ts
- apps/web/src/components/stream/BroadcastConsole.vue
- apps/web/src/components/stream/BroadcastConsole.test.ts
- apps/web/src/views/WatchView.vue
