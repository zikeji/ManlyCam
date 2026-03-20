# Story 9.1: Camera Settings Enhancements

Status: review

## Story

As an **admin**,
I want an Apply button for restart-required camera settings, new encoding controls, and the ability to fix bad settings even when the stream is down,
so that I have safe, granular control over the camera pipeline without risk of an unrecoverable state.

## Acceptance Criteria

1. **Given** the camera settings panel is open, **When** I adjust any non-restart-required control (brightness, contrast, AWB, sharpness, saturation, EV, gain, metering, shutter, flicker period, lens position, denoise), **Then** the PATCH is sent immediately on change — exactly as today — no Apply button is involved for these controls.

2. **Given** the camera settings panel is open and the Encoding section is visible, **When** I look at the controls, **Then** I see a `Denoise` select with options: `cdn_off` (Off), `cdn_fast` (Fast), `cdn_hq` (High Quality); and the following additional controls: `FPS` — number input (1–120); `Bitrate` — number input (100–50000, in kbps); `IDR Period` — number input (1–300, in frames); `Width` — number input (320–4608); `Height` — number input (240–3496); `Horizontal Flip` — switch; `Vertical Flip` — switch.

3. **Given** I have edited one or more restart-required controls (FPS, Bitrate, IDR Period, Width, Height, HFlip, VFlip, HDR, text overlay, AF mode/range/speed), **When** I click Apply, **Then** a confirmation dialog appears warning that the stream will briefly restart, **And** clicking Confirm sends the PATCH with all staged restart-required values, **And** clicking Cancel closes the dialog without discarding staged changes — user can continue editing or click Reset to discard.

4. **Given** the `CameraControlMeta` interface in `packages/types/src/camera.ts`, **When** inspected, **Then** it includes an optional `restartRequired?: boolean` field, **And** all new encoding, resolution, and flip entries have `restartRequired: true`, **And** `rpiCameraDenoise` has a `CAMERA_CONTROL_META` entry with `restartRequired: false`.

5. **Given** FPS and other restart-required settings are persisted in the `camera_settings` DB, **When** the Pi genuinely reconnects after a reboot, **Then** `reapplyCameraSettings()` includes restart-required settings in the PATCH alongside all other settings (no change needed — it already sends all DB rows); **And** since mediamtx does not restart the path when the same value is re-sent, no restart loop occurs.

6. **Given** an admin submits camera settings changes, **Then** the settings are always persisted to the `camera_settings` DB first regardless of Pi reachability, **And** the server always attempts the PATCH to the Pi mediamtx API (the `isPiReachable()` early-return at line 148 of `stream.ts` is removed), **And** if the PATCH fails (Pi genuinely offline), the failure is logged and silently ignored — admin receives a success response since settings are saved for reconnect, **And** if the PATCH succeeds while mediamtx is in a bad-settings recovery loop, the corrective settings take effect immediately.

7. **Given** the stream is unreachable (piReachable = false) due to bad settings, **When** an admin opens the camera settings panel, **Then** the controls are accessible and the Apply/staging flow is fully functional — the existing Pi offline warning text ("Pi Offline — changes apply on reconnect") is sufficient context; **no additional blocking overlay** is added for this state.

## Tasks / Subtasks

- [x] Task 0: Install Sonner toast component (prerequisite for Epic 9 stories)
  - [x] Subtask 0.1: Run `npx shadcn-vue@latest add sonner` in `apps/web` — this installs `vue-sonner` as a dependency and generates `apps/web/src/components/ui/sonner/Sonner.vue`
  - [x] Subtask 0.2: Add `<Toaster />` to `apps/web/src/App.vue` (import from `@/components/ui/sonner`). Vue 3 supports multiple root nodes — add `<Toaster />` as a sibling after the last `v-else` branch (do NOT nest it inside a conditional branch, or toasts will only render in that state). Example structure:
    ```vue
    <template>
      <RouterView v-if="..." />
      ...
      <LoginView v-else />
      <Toaster />
    </template>
    ```
  - [x] Subtask 0.3: Verify `vue-sonner` is in `apps/web/package.json` dependencies after install

- [x] Task 1: Extend `CameraControlMeta` type and allowlist (AC: #2, #4)
  - [x] Subtask 1.1: Add `restartRequired?: boolean` optional field to `CameraControlMeta` interface in `packages/types/src/camera.ts`
  - [x] Subtask 1.2: Add a new `CameraControlSection` value `'Encoding'` to the union type in `packages/types/src/camera.ts`
  - [x] Subtask 1.3: Add `rpiCameraFps`, `rpiCameraBitrate`, `rpiCameraIdrPeriod`, `rpiCameraWidth`, `rpiCameraHeight`, `rpiCameraHFlip`, `rpiCameraVFlip` to `CAMERA_CONTROLS_ALLOWLIST` in `packages/types/src/camera.ts`
  - [x] Subtask 1.4: Add `CAMERA_CONTROL_META` entries for all new controls plus `rpiCameraDenoise` (see Dev Notes for exact field values)
  - [x] Subtask 1.5: Run `pnpm --filter @manlycam/types build` to verify types compile

- [x] Task 2: Fix server PATCH handler — remove `isPiReachable()` early-return (AC: #6)
  - [x] Subtask 2.1: In `apps/server/src/routes/stream.ts`, delete the early-return block (lines 148–150: `if (!streamService.isPiReachable()) { return c.json({ ok: true, piOffline: true }); }`)
  - [x] Subtask 2.2: Ensure the existing `try/catch` fetch block now always runs; change both the `!res.ok` branch and the `catch` branch to return `{ ok: true }` (silent failure per AC #6 and the Dev Notes PATCH Handler Change section) — the server logs the error in both cases; no "OR" path: silent `{ ok: true }` is the chosen approach
  - [x] Subtask 2.3: Update `apps/server/src/routes/stream.test.ts` — the test "persists settings and returns 200 ok:true piOffline:true when Pi is unreachable" must be updated since `piOffline: true` will no longer be returned; it should now verify the fetch IS attempted when Pi is unreachable and that the response is still `{ ok: true }` after silent failure

- [x] Task 3: Update `useCameraControls` composable — staged values and Apply flow (AC: #1, #3)
  - [x] Subtask 3.1: Add `stagedValues` ref (`ref<CameraSettingsMap>({})`) to track unsaved changes for restart-required controls
  - [x] Subtask 3.2: Add `hasStagedChanges` computed that returns `true` when `stagedValues` is non-empty (`Object.keys(stagedValues.value).length > 0`); staging any key is sufficient to enable Apply — no value-diffing against `settings` is required
  - [x] Subtask 3.3: Add `stageValue(key: string, value: unknown): void` function — updates `stagedValues` without calling patchSetting
  - [x] Subtask 3.4: Add `discardStagedValues(): void` function — resets `stagedValues` to `{}` (controls revert to `settings` values)
  - [x] Subtask 3.5: Add `applyStaged(): Promise<void>` function — calls `patchSettings(stagedValues.value)` as a single batch PATCH, then calls `discardStagedValues()`; also add `patchSettings(body: CameraSettingsMap): Promise<void>` (use `CameraSettingsMap`, not `Record<string, unknown>` — avoids type mismatch when passing `stagedValues.value`) which sends the body as-is to the PATCH endpoint (same URL as `patchSetting`) with batch optimistic update: `settings.value = { ...settings.value, ...body }` for all keys in the batch
  - [x] Subtask 3.6: Export all new functions/refs from `useCameraControls`

- [x] Task 4: Update `CameraControls.vue` — new controls, staged UX, confirmation dialog (AC: #1, #2, #3, #4, #7)
  - [x] Subtask 4.1: Import `restartRequired` awareness — use `CAMERA_CONTROL_META` `restartRequired` flag to determine which controls use `stageValue` vs `patchSetting`/`debouncedPatch`
  - [x] Subtask 4.2: Add `Encoding` to `SECTION_ORDER` array (e.g., after `'Overlay'` or between logical groups — see Dev Notes)
  - [x] Subtask 4.3: For restart-required controls: bind their displayed value to `stagedValues[key] ?? settings[key] ?? ctrl.defaultValue` so staged edits are reflected immediately in UI; on change call `stageValue(ctrl.key, newValue)` instead of `patchSetting`/`debouncedPatch`
  - [x] Subtask 4.4: Add an "Apply" button (using `<Button>` component) that is only shown when `hasStagedChanges` is true; position it as a sticky footer of the panel (not bottom of Encoding section — must remain visible when user scrolls back up to image controls after staging Encoding changes)
  - [x] Subtask 4.5: On Apply click, open a confirmation `<AlertDialog>` (already installed: `apps/web/src/components/ui/alert-dialog/`) with message "Applying these settings will briefly restart the camera stream. Continue?" and Confirm/Cancel actions
  - [x] Subtask 4.6: Confirm action calls `applyStaged()` and closes the dialog; on success call `toast.success('Camera settings applied')` (import `toast` from `vue-sonner`). Wrap in try/catch: `catch` block calls `toast.error('Failed to apply settings')` — **add `/* istanbul ignore next */` to this catch block** with comment: `// server always returns ok:true for connectivity failures; this branch is a safety net only`. Cancel action calls `discardStagedValues()` and closes the dialog — no toast on cancel.
  - [x] Subtask 4.7: Do NOT modify `showOfflineOverlay` — per Dev Notes, the computed already correctly distinguishes `piReachable === false` (yellow banner only, no overlay) from `streamState === 'unreachable'`/`'explicit-offline'` (overlay appropriate). The scenario in AC #7 ("bad settings causing unreachable state") maps to `piReachable === false` while `streamState === 'live'`, which already shows no overlay. No code change required for this subtask.
  - [x] Subtask 4.8: Update `getControlsForSection` and `isControlVisible` to handle the new `Encoding` section controls correctly

- [x] Task 5: Update tests (AC: all)
  - [x] Subtask 5.1: Update `apps/web/src/composables/useCameraControls.test.ts` — add tests for `stageValue`, `hasStagedChanges`, `discardStagedValues`, `applyStaged`; update the existing "patchSetting does not treat piOffline as error" test — after AC #6's server change, `piOffline: true` will never be returned; either remove or repurpose this test
  - [x] Subtask 5.2: Update `apps/web/src/components/admin/CameraControls.test.ts` — add tests for: Apply button renders when staged, dialog opens on Apply click, Confirm calls applyStaged, Cancel calls discardStagedValues, restart-required controls use staged values, non-restart controls still call patchSetting directly; add missing `afterEach(() => { wrapper?.unmount(); wrapper = null; })` cleanup and change `const wrapper` to `let wrapper` declared at suite level; also update the `defaultControls` mock helper to include all new composable exports (`stagedValues`, `hasStagedChanges`, `stageValue`, `discardStagedValues`, `applyStaged`/`patchSettings`) so TypeScript still satisfies the `ReturnType<typeof useCameraControls>` constraint after the composable is updated; **add `vi.mock('vue-sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))` at the top of the test file** — without this, `toast.success`/`toast.error` calls in the component will throw `TypeError: toast.success is not a function`
  - [x] Subtask 5.3: Update `apps/server/src/routes/stream.test.ts` — remove test for `piOffline: true` path (or update it); add test that verifies fetch IS attempted even when `isPiReachable()` returns false; verify `ok: true` is still returned when fetch silently fails

- [x] Task 6: Quality gate
  - [x] Subtask 6.1: `pnpm --filter @manlycam/types build` — zero errors
  - [x] Subtask 6.2: `pnpm run typecheck` from `apps/server` — zero errors
  - [x] Subtask 6.3: Run `pnpm --filter @manlycam/types build` first (Task 1 modifies `packages/types`), then `pnpm run typecheck` from `apps/web` — zero errors
  - [x] Subtask 6.4: `pnpm run lint` from `apps/server` — zero errors
  - [x] Subtask 6.5: `pnpm run lint` from `apps/web` — zero errors
  - [x] Subtask 6.6: `pnpm run test --coverage` from `apps/server` — all tests pass, thresholds met
  - [x] Subtask 6.7: `pnpm run test --coverage` from `apps/web` — all tests pass, thresholds met
  - [x] Subtask 6.8: **Smoke test required** — Tests #1 and #2 verified by Zikeji in first smoke-test pass. Tests #3 and #4 identified a blocker: `showOfflineOverlay` was blocking controls when `streamState === 'unreachable'`, preventing recovery from bad settings. Fixed: overlay now only shows for `explicit-offline`; `unreachable` state shows only the yellow piReachable banner so controls remain accessible. Re-smoke-test passed 2026-03-20 — all Apply flow and recovery scenarios verified by Zikeji.

## Dev Notes

### PATCH Handler Change — Chosen Behavior (AC #6)

The `isPiReachable()` early-return currently exits before attempting the fetch. After removal, the flow becomes:

```
1. Persist all keys to DB (unchanged)
2. Always attempt fetch to mediamtx PATCH endpoint
3. If fetch throws (network error / Pi offline) → catch block: log.error + return { ok: true } [CHANGED from ok:false]
4. If fetch returns non-ok status → log.warn + return { ok: true } [CHANGED from ok:false with error text]
5. If fetch succeeds → return { ok: true } (unchanged)
```

This means the frontend always sees `{ ok: true }` and never shows an error for a connectivity failure. The offline banner ("Pi Offline — changes apply on reconnect") already handles user communication. This simplifies the composable — no need to handle `ok: false` differently for online vs offline Pi.

**Important:** The `patchSetting` function in `useCameraControls.ts` currently reverts on `ok: false`. After this change, it will never see `ok: false` for connectivity failures. The revert-on-error behavior remains for genuine validation errors (e.g., `INVALID_CAMERA_KEY`).

**`patchSettings` revert contract:** The new `patchSettings(body)` function does NOT revert on error. Server returns `{ ok: true }` for all connectivity failures (silent ignore). A genuine `ok: false` response from `patchSettings` indicates a validation error, which cannot happen for staged values (already allowlisted keys). Therefore no multi-key revert logic is needed — if `ok: false` is received, log it and leave `settings` as updated.

**Test impact:** The test "persists settings and returns 200 ok:true piOffline:true when Pi is unreachable" becomes: test that fetch IS called even when Pi mocked unreachable, and response is `{ ok: true }`. Also update tests for "returns 200 ok:false error:string" and "returns 200 ok:false when fetch fails" — these now return `ok: true` with silent logging.

### Types Package — New Entries

Add to `packages/types/src/camera.ts`:

**`CameraControlSection`** — add `'Encoding'` to the union.

**`CAMERA_CONTROLS_ALLOWLIST`** — append these keys (order matters for mediamtx API compatibility; append at end):

- `'rpiCameraFps'`
- `'rpiCameraBitrate'`
- `'rpiCameraIdrPeriod'`
- `'rpiCameraWidth'`
- `'rpiCameraHeight'`
- `'rpiCameraHFlip'`
- `'rpiCameraVFlip'`

**`CAMERA_CONTROL_META`** entries to add (append after the `Overlay` section):

```typescript
// --- Encoding ---
{
  key: 'rpiCameraDenoise',
  label: 'Denoise',
  section: 'Encoding',
  type: 'select',
  defaultValue: 'cdn_off',
  restartRequired: false,  // live-apply; already in allowlist
  options: [
    { value: 'cdn_off', label: 'Off' },
    { value: 'cdn_fast', label: 'Fast' },
    { value: 'cdn_hq', label: 'High Quality' },
  ],
},
{
  key: 'rpiCameraFps',
  label: 'FPS',
  section: 'Encoding',
  type: 'number',
  min: 1,
  max: 120,
  step: 1,
  defaultValue: 30,
  restartRequired: true,
},
{
  key: 'rpiCameraBitrate',
  label: 'Bitrate (kbps)',
  section: 'Encoding',
  type: 'number',
  min: 100,
  max: 10000,
  step: 100,
  defaultValue: 2000,
  restartRequired: true,
},
{
  key: 'rpiCameraIdrPeriod',
  label: 'IDR Period (frames)',
  section: 'Encoding',
  type: 'number',
  min: 1,
  max: 300,
  step: 1,
  defaultValue: 60,
  restartRequired: true,
},
{
  key: 'rpiCameraWidth',
  label: 'Width',
  section: 'Encoding',
  type: 'number',
  min: 320,
  max: 4608,
  step: 1,
  defaultValue: 1280,
  restartRequired: true,
},
{
  key: 'rpiCameraHeight',
  label: 'Height',
  section: 'Encoding',
  type: 'number',
  min: 240,
  max: 3496,
  step: 1,
  defaultValue: 720,
  restartRequired: true,
},
{
  key: 'rpiCameraHFlip',
  label: 'Horizontal Flip',
  section: 'Encoding',
  type: 'switch',
  defaultValue: false,
  restartRequired: true,
},
{
  key: 'rpiCameraVFlip',
  label: 'Vertical Flip',
  section: 'Encoding',
  type: 'switch',
  defaultValue: false,
  restartRequired: true,
},
```

Note: `rpiCameraDenoise` was already in `CAMERA_CONTROLS_ALLOWLIST` — do NOT add it again. It also currently has **no `CAMERA_CONTROL_META` entry** (which is why it does not appear in the panel today). The entry above is newly creating its meta — not moving or modifying an existing entry.

### `SECTION_ORDER` in `CameraControls.vue`

Current order: `['Image', 'Exposure', 'White Balance', 'Autofocus', 'Overlay']`

New order: `['Image', 'Exposure', 'White Balance', 'Autofocus', 'Overlay', 'Encoding']` — append `'Encoding'` at the end so existing controls are unaffected.

### Staged Values UX — Composable Design

`useCameraControls` additions:

- `stagedValues: Ref<CameraSettingsMap>` — starts empty `{}`
- `hasStagedChanges: ComputedRef<boolean>` — `Object.keys(stagedValues.value).length > 0`
- `stageValue(key, value)` — `stagedValues.value = { ...stagedValues.value, [key]: value }`
- `discardStagedValues()` — `stagedValues.value = {}`
- `applyStaged()` — calls the existing `patchSetting` once with all staged keys as a single batch PATCH body, then calls `discardStagedValues()`

**IMPORTANT:** `applyStaged` must send one PATCH call with all staged keys as the body. The existing `patchSetting(key, value)` takes a single key — it cannot be used directly for a multi-key batch. The chosen approach is to add a separate `patchSettings(body: Record<string, unknown>): Promise<void>` function for the batch apply; keep `patchSetting(key, value)` intact for live controls. `applyStaged` calls `patchSettings(stagedValues.value)` then calls `discardStagedValues()`.

### `CameraControls.vue` — Control Rendering Logic

Controls are restart-required or not, determined by `ctrl.restartRequired === true`. The template already maps controls by section and type. The dev must:

1. Pass the `ctrl.restartRequired` flag through to handlers.
2. For restart-required controls: read display value from `stagedValues.value[ctrl.key] ?? settings.value[ctrl.key] ?? ctrl.defaultValue`; on change call `stageValue(ctrl.key, newValue)`.
3. For non-restart controls: existing behavior unchanged — debounced PATCH on change.
4. Switches need special handling since `handleSwitchChange` currently calls `patchSetting` directly — must check `restartRequired` first.

The Apply button should appear only when `hasStagedChanges` is true. Use the shadcn-vue `Button` from `@/components/ui/button`. **Placement: sticky footer of the panel** — not bottom of Encoding section. A user may stage FPS then scroll up to adjust brightness; the Apply button must stay visible throughout. Use `position: sticky; bottom: 0` with appropriate background to prevent content bleed-through.

### AlertDialog for Confirmation (AC #3)

`AlertDialog` is already installed at `apps/web/src/components/ui/alert-dialog/`. Import from `@/components/ui/alert-dialog`. Usage pattern:

```vue
<AlertDialog :open="confirmOpen">
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Restart required</AlertDialogTitle>
      <AlertDialogDescription>
        Applying these settings will briefly restart the camera stream. Continue?
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel @click="handleCancel">Cancel</AlertDialogCancel>
      <AlertDialogAction @click="handleConfirm">Apply</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

Use controlled open state (`confirmOpen = ref(false)`). On Confirm: `await applyStaged(); confirmOpen.value = false`. On Cancel: `discardStagedValues(); confirmOpen.value = false`.

### `showOfflineOverlay` — AC #7 (Camera Panel Accessible When Pi Offline)

Current `showOfflineOverlay` computed:

```ts
const showOfflineOverlay = computed(
  () =>
    !props.previewActive &&
    (streamState.value === 'unreachable' || streamState.value === 'explicit-offline'),
);
```

This **must remain unchanged**. The story says controls are accessible when `piReachable === false` due to bad settings. The `piReachable` state and the `streamState` are distinct:

- `streamState === 'unreachable'` → Pi is completely offline → overlay appropriate
- `streamState === 'explicit-offline'` → admin toggled stream off → overlay appropriate
- `piReachable === false` while `streamState === 'live'` → Pi temporarily unreachable via frp during camera error loop → **no overlay**, just the yellow banner

So **no change** to `showOfflineOverlay`. The scenario in AC #7 ("bad settings causing unreachable state") naturally falls into the "live but piReachable=false" bucket and already shows only the yellow banner.

### `reapplyCameraSettings()` — No Change Needed (AC #5)

The existing `reapplyCameraSettings()` in `streamService.ts` fetches ALL `cameraSettings` DB rows and sends them as a single PATCH. Since the new encoding/flip/resolution keys will now be persisted to DB just like other settings, they will automatically be included in the reconnect reapply. No code change required to `streamService.ts`.

mediamtx behavior: patching a path with the same value it already has does not trigger a source restart. So reapplying the same FPS/resolution/etc. on reconnect is safe — no infinite restart loop.

### Existing Test Patterns to Follow

**Server route tests** (`stream.test.ts`):

- Already mocks `prisma.cameraSettings`, `streamService.isPiReachable`, and `fetch` via `vi.stubGlobal`
- After removing the early-return, the test that previously checked `piOffline: true` when Pi unreachable must be rewritten: now mock `isPiReachable` returning false AND mock `fetch` to reject — verify response is still `{ ok: true }`
- Add a new test: when `isPiReachable()` returns false, fetch is still called (verify `vi.mocked(global.fetch)` was called)

**Web composable tests** (`useCameraControls.test.ts`):

- Simple unit tests — no Vue mounting, just call composable functions
- Follow existing pattern: mock `apiFetch`, call function, assert state

**Web component tests** (`CameraControls.test.ts`):

- Uses `mount` with mocked composables
- **Missing `afterEach` cleanup** — MUST add `let wrapper: ReturnType<typeof mount> | null = null; afterEach(() => { wrapper?.unmount(); wrapper = null; })` to prevent test pollution
- The existing tests don't use `afterEach` — this is a known gap, fix it when modifying the file

### Anti-Patterns — Don't Do These

- **Do NOT** add HFlip/VFlip to allowlist as a separate step — add them together with all new encoding keys in Task 1.
- **Do NOT** add `rpiCameraDenoise` to `CAMERA_CONTROLS_ALLOWLIST` — it is already there (line 9 of `camera.ts`).
- **Do NOT** create a new PATCH endpoint for restart-required settings — reuse the existing `PATCH /api/stream/camera-settings`.
- **Do NOT** add a separate "restart confirmation" API call — confirmation is purely client-side before sending the PATCH.
- **Do NOT** introduce separate state management for "which settings triggered a restart" — the frontend only needs to know which controls are `restartRequired: true` to route them through staging.
- **Do NOT** use `Dialog` from shadcn-vue for the confirmation — use `AlertDialog` which is semantically correct for destructive/irreversible actions.
- **Do NOT** use `export default` — all exports must be named exports (project rule).
- **Do NOT** inline role logic or read `process.env` directly — not applicable here, but standard rule.

### Project Structure Notes

Files to create or modify:

| File                                                   | Change                                                                                                                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/types/src/camera.ts`                         | Add `restartRequired` to interface, `'Encoding'` to section union, 7 new keys to allowlist, 8 new `CAMERA_CONTROL_META` entries (Denoise + 7 restart-required) |
| `apps/server/src/routes/stream.ts`                     | Remove `isPiReachable()` early-return; update catch/error return to `{ ok: true }`                                                                             |
| `apps/server/src/routes/stream.test.ts`                | Update piOffline test; add test verifying fetch is always attempted                                                                                            |
| `apps/web/src/composables/useCameraControls.ts`        | Add `stagedValues`, `hasStagedChanges`, `stageValue`, `discardStagedValues`, `applyStaged`/`patchSettings`                                                     |
| `apps/web/src/composables/useCameraControls.test.ts`   | Add tests for all new composable functions                                                                                                                     |
| `apps/web/src/components/admin/CameraControls.vue`     | New Encoding section rendering, staged value routing, Apply button, AlertDialog confirmation, Sonner toast                                                     |
| `apps/web/src/components/admin/CameraControls.test.ts` | Add afterEach cleanup; add tests for Apply flow, dialog, staged routing                                                                                        |
| `apps/web/src/App.vue`                                 | Add `<Toaster />` component (Sonner)                                                                                                                           |
| `apps/web/src/components/ui/sonner/Sonner.vue`         | Generated by shadcn-vue CLI (Task 0)                                                                                                                           |

### References

- Existing allowlist and meta: `packages/types/src/camera.ts` (full file)
- PATCH handler with early-return to remove: `apps/server/src/routes/stream.ts` lines 148–150
- `reapplyCameraSettings()`: `apps/server/src/services/streamService.ts` lines 77–104 (no change needed)
- CameraControls component: `apps/web/src/components/admin/CameraControls.vue`
- useCameraControls composable: `apps/web/src/composables/useCameraControls.ts`
- AlertDialog component: `apps/web/src/components/ui/alert-dialog/index.ts` (already installed)
- Epics story definition: `_bmad-output/planning-artifacts/epics.md` — Epic 9, Story 9-1 (lines ~2033–2077)
- Test pattern (server): `apps/server/src/routes/stream.test.ts`
- Test pattern (web composable): `apps/web/src/composables/useCameraControls.test.ts`
- Test pattern (web component): `apps/web/src/components/admin/CameraControls.test.ts`
- CLAUDE.md: `CAMERA_CONTROLS_ALLOWLIST` location, named-export-only rule, no `export default`, afterEach cleanup requirement

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Task 0: Installed vue-sonner via `npx shadcn-vue@latest add sonner`; generated `Sonner.vue` + `index.ts`; added `<Toaster />` as last sibling in `App.vue` template.
- Task 1: Added `restartRequired?: boolean` to `CameraControlMeta`; added `'Encoding'` to section union; added 7 new allowlist keys; added 8 new `CAMERA_CONTROL_META` entries (rpiCameraDenoise + 7 restart-required). Types build clean.
- Task 2: Removed `isPiReachable()` early-return; both `!res.ok` and catch branches now return `{ ok: true }` with logging. Server always attempts PATCH to mediamtx regardless of Pi reachability.
- Task 3: Added `stagedValues`, `hasStagedChanges`, `stageValue`, `discardStagedValues`, `applyStaged`, `patchSettings` to `useCameraControls`. Removed `piOffline` handling (server no longer returns it).
- Task 4: Added `Encoding` section to `SECTION_ORDER`; added `getStagedOrValue` helper; restart-required controls route through `stageValue`; non-restart controls unchanged. Added sticky "Apply" footer with AlertDialog confirmation; `handleConfirmCancel` only closes dialog (no discard); dedicated Reset button (RotateCcw icon, title="Reset Changes") opens second AlertDialog — Confirm calls `discardStagedValues()`, Cancel only closes. `showOfflineOverlay` unchanged per AC #7. `handleNumberChange` clamps values to min/max. `hasStagedChanges` is component-local computed comparing staged values against effective stored+default values (not raw non-empty check).
- Task 5: Updated server stream tests (piOffline test rewritten; added fetch-always-called test). Updated composable tests (added staged-value tests; repurposed piOffline test). Updated component tests (added `afterEach` cleanup; Apply button visibility tests use value-diff not mocked hasStagedChanges; "staged equals default" no-Apply test; Reset button open/confirm/cancel tests; Cancel does NOT call discardStagedValues; Denoise select uses fake timers for debounce).
- Task 6: All quality gates pass — 399 server tests, 918 web tests, zero typecheck/lint errors.
- Post-smoke-test fixes (2026-03-20): Bitrate fixed kbps→bps (label, default 2000→2000000, min 100k, max 50M, step 100k); hasStagedChanges logic fixed (value-diff vs default); Apply Cancel no longer discards; Reset button + dialog added; number clamping added; test timer fix for debounced select.
- Smoke test (6.8) passed 2026-03-20 — Zikeji verified all Apply flow and recovery scenarios in browser.

### File List

- `packages/types/src/camera.ts`
- `apps/server/src/routes/stream.ts`
- `apps/server/src/routes/stream.test.ts`
- `apps/web/src/composables/useCameraControls.ts`
- `apps/web/src/composables/useCameraControls.test.ts`
- `apps/web/src/components/admin/CameraControls.vue`
- `apps/web/src/components/admin/CameraControls.test.ts`
- `apps/web/src/App.vue`
- `apps/web/src/components/ui/sonner/Sonner.vue` (generated)
- `apps/web/src/components/ui/sonner/index.ts` (generated)
- `apps/web/package.json` (vue-sonner dependency added by shadcn-vue)
- `apps/web/pnpm-lock.yaml` (updated by shadcn-vue install)

## Change Log

- 2026-03-20: Implemented Story 9-1 — camera settings enhancements: Sonner toast installed; Encoding section with 8 new controls (Denoise, FPS, Bitrate, IDR Period, Width, Height, HFlip, VFlip); Apply+confirmation flow for restart-required settings; server PATCH always-attempts (no early-return on Pi offline); 399 server + 918 web tests passing.
- 2026-03-20: Post-smoke-test fixes — bitrate kbps→bps; hasStagedChanges value-diff logic; Apply Cancel no longer discards; Reset button+dialog; number clamping; Denoise test fake timers.
- 2026-03-20: Recovery fix — showOfflineOverlay now only fires for explicit-offline; unreachable state no longer blocks controls (admin can correct bad settings to recover stream). 918 web tests passing.
- 2026-03-20: Smoke test passed — Zikeji verified all Apply flow and recovery scenarios. Story ready for code review.
- 2026-03-20: Code review fixes — AC1/AC2/AC3 amended to match implementation; NaN guard in handleNumberChange; pendingPatchCount to prevent fetchSettings race with optimistic updates; transform functions guard against NaN/non-number input; 2 new tests for fetchSettings race condition. 399 server + 925 web tests passing.
