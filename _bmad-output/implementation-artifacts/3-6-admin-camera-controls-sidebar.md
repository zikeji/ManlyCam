# Story 3.6: Admin Camera Controls Sidebar

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As **the admin**,
I want to adjust camera settings from the web UI and see the effect live in the stream,
so that I can get the best picture without SSH or physical access to the Pi.

## Acceptance Criteria

1. **"Camera Controls" menu item activates in ProfileAnchor**
   - The "Camera Controls" menu item (rendered for `Role.Admin` only) in `ProfileAnchor.vue` is now fully interactive — the `aria-disabled` / `cursor-not-allowed` placeholder from Story 3.5 is replaced with a real click handler
   - Clicking "Camera Controls" opens the left sidebar (desktop) or bottom Sheet drawer (mobile `< lg` breakpoint) containing `CameraControls.vue` inside `AdminPanel.vue`
   - The popover closes when the sidebar/drawer opens

2. **Left sidebar — desktop (`≥ lg` / 1024px)**
   - `WatchView.vue` replaces its `<!-- Story 3.6: AdminPanel / CameraControls here -->` placeholder with `<AdminPanel v-if="user?.role === Role.Admin" />`
   - The sidebar is rendered in the existing `<aside data-sidebar-left>` element (already present in `WatchView.vue`)
   - Sidebar collapse/expand is triggered by the "Camera Controls" profile menu click; collapse state is persisted to `localStorage` key `manlycam:admin-panel-open` and re-hydrated on mount
   - A `←|` close button within `AdminPanel` collapses it; `|→` in hover overlay area (or the profile menu item again) reopens it — actual overlay button is out of scope for this story; panel can be toggled via profile menu only

3. **Mobile — Sheet drawer (`< lg` breakpoint)**
   - On mobile, `AdminPanel.vue` renders inside a shadcn-vue `<Sheet>` (bottom drawer)
   - The Sheet is opened programmatically when the admin clicks "Camera Controls" in the profile popover
   - Sheet can be dismissed by tapping the scrim, swiping down, or an explicit close button

4. **`CameraControls.vue` — control rendering**
   - Renders all controls from the allowlist (see Dev Notes) that are present in the live API response (`GET /api/stream/camera-settings`)
   - If a control key is absent from the API response (Pi offline or mediamtx restart cleared it), that control is rendered with its persisted DB value (or default if no persisted value)
   - Controls are organized into labeled sections (see Dev Notes)
   - Each control shows its current value (from persisted DB settings, falling back to mediamtx defaults)
   - A "Pi Offline" banner is shown if the Pi is unreachable, indicating changes will be applied when the Pi reconnects

5. **Control interactions — no save button**
   - Slider/select/toggle changes fire `PATCH /api/stream/camera-settings` immediately on change (debounced 300ms for sliders to avoid flooding the Pi)
   - While a PATCH is in-flight, the control shows a subtle loading indicator (opacity reduction or spinner) but remains interactive
   - On success (`{ ok: true }`): no UI feedback needed (change is already visible in stream)
   - On error (`{ ok: false, error: string }` or network failure): show error toast / inline error beneath the control; revert the control to its previous value
   - When Pi is offline: `PATCH /api/stream/camera-settings` still succeeds (settings are persisted to DB); the UI shows a brief "Saved — will apply when Pi reconnects" notice

6. **`GET /api/stream/camera-settings` — server endpoint**
   - `requireAuth` + `requireRole([Role.Admin])` guards the route
   - Returns `{ settings: Record<string, unknown>, piReachable: boolean }`
   - `settings` contains all persisted `CameraSettings` rows as a flat object (`{ rpiCameraBrightness: 0.2, ... }`)
   - Values are returned as their native types (numbers as numbers, booleans as booleans, arrays as arrays) — JSON round-tripping from the DB `value` string column
   - `piReachable` is the current `streamService.piReachable` value (exposed via a new getter)

7. **`PATCH /api/stream/camera-settings` — server endpoint**
   - `requireAuth` + `requireRole([Role.Admin])` guards the route
   - Request body: `{ [key: string]: unknown }` — a partial map of `rpiCamera*` keys to their new values
   - Server validates: each key must be in `CAMERA_CONTROLS_ALLOWLIST` — reject with `400` if any unknown key is present
   - Server persists each key/value pair to `CameraSettings` table (upsert by key, value stored as `JSON.stringify(value)`)
   - Server forwards the PATCH body to `http://${env.FRP_HOST}:${env.FRP_API_PORT}/v3/config/paths/patch/cam`
   - If Pi is reachable (frp tunnel up): returns `{ ok: true }` on mediamtx PATCH success, `{ ok: false, error: string }` on mediamtx error
   - If Pi is unreachable (frp tunnel down or mediamtx returns non-2xx): DB write still succeeds; returns `{ ok: true, piOffline: true }` — settings are saved and will be re-applied on reconnect
   - Unauthenticated → 401; non-Admin → 403; invalid key → 400 with `{ error: { code: 'INVALID_CAMERA_KEY', ... } }`

8. **Re-apply on Pi reconnect**
   - In `StreamService.updateReachable()`, when `reachable` transitions from `false` to `true`, the service fetches all `CameraSettings` rows and PATCHes them to the Pi's mediamtx API
   - This is a best-effort fire-and-forget: errors are logged but do not affect the reachability state broadcast
   - Re-apply happens after `this.broadcastState()` so viewers see the live state first

9. **`CameraSettings` Prisma model and migration**
   - New `CameraSettings` model with `key` as primary key (string, `@unique` is redundant as PK, but `@id`)
   - Values stored as JSON-encoded strings in a `value String` column
   - Migration name: `add-camera-settings`

10. **Coverage thresholds**
    - After all tests pass, update `apps/server/vitest.config.ts` and `apps/web/vite.config.ts` thresholds to reflect the new baseline (do not lower existing thresholds below Story 3.5 baselines)

## Tasks / Subtasks

- [x] **Prisma — `CameraSettings` model** (AC: #9)
  - [x] Add `CameraSettings` model to `apps/server/prisma/schema.prisma`
  - [x] Run migration: `pnpm --filter server exec prisma migrate dev --name add-camera-settings`
  - [x] Verify `prisma generate` updates `@prisma/client`

- [x] **Shared types — camera controls allowlist** (AC: #7)
  - [x] Add `CAMERA_CONTROLS_ALLOWLIST` as a `readonly` const array to `packages/types/src/camera.ts` (new file)
  - [x] Export `CameraSettingsMap` type (`Partial<Record<typeof CAMERA_CONTROLS_ALLOWLIST[number], unknown>>`)
  - [x] Export `CameraControlMeta` type and `CAMERA_CONTROL_META` const (see Dev Notes for full definition — includes label, type, min/max/step, options, conditional visibility)
  - [x] Re-export from `packages/types/src/index.ts`

- [x] **Server — `GET /api/stream/camera-settings`** (AC: #6)
  - [x] Add route to `apps/server/src/routes/stream.ts`
  - [x] Expose `piReachable` via `streamService.isPiReachable(): boolean` getter
  - [x] Fetch all `CameraSettings` rows, parse values with `JSON.parse(row.value)`, return flat object
  - [x] Return `{ settings, piReachable }`

- [x] **Server — `PATCH /api/stream/camera-settings`** (AC: #7)
  - [x] Add route to `apps/server/src/routes/stream.ts`
  - [x] Validate body keys against `CAMERA_CONTROLS_ALLOWLIST`
  - [x] Upsert each key to `CameraSettings` table
  - [x] Proxy PATCH to `http://${env.FRP_HOST}:${env.FRP_API_PORT}/v3/config/paths/patch/cam`
  - [x] Handle Pi offline (return `{ ok: true, piOffline: true }`)

- [x] **Server — re-apply on Pi reconnect** (AC: #8)
  - [x] Add `private async reapplyCameraSettings(): Promise<void>` to `StreamService`
  - [x] Call from `updateReachable()` after broadcast when transitioning to `true`
  - [x] Fetch all `CameraSettings` rows, build PATCH body, fire fetch to `FRP_HOST:FRP_API_PORT`

- [x] **Server — `stream.test.ts` updates** (AC: #6, #7)
  - [x] `describe('GET /api/stream/camera-settings')`: unauthenticated → 401, non-Admin → 403, Admin → 200 with `{ settings, piReachable }`
  - [x] `describe('PATCH /api/stream/camera-settings')`: unauthenticated → 401, non-Admin → 403, invalid key → 400, valid Admin PATCH → 200 `{ ok: true }`, Pi offline path → 200 `{ ok: true, piOffline: true }`
  - [x] `describe('streamService.reapplyCameraSettings')` in `streamService.test.ts`: mock prisma, verify fetch called with correct PATCH body

- [x] **Frontend — install shadcn-vue Sheet** (AC: #3)
  - [x] Run `pnpm dlx shadcn-vue@latest add sheet` from `apps/web/`
  - [x] Verify `apps/web/src/components/ui/sheet/` created

- [x] **Frontend — `useCameraControls.ts` composable** (AC: #5)
  - [x] Create `apps/web/src/composables/useCameraControls.ts`
  - [x] `fetchSettings()`: `GET /api/stream/camera-settings` → populates `settings` reactive ref and `piReachable` ref
  - [x] `patchSetting(key, value)`: debounced 300ms for slider controls, immediate for select/toggle; calls `PATCH /api/stream/camera-settings`; handles optimistic update (revert on error)
  - [x] Exports: `{ settings, piReachable, isLoading, fetchSettings, patchSetting, lastError }`

- [x] **Frontend — `useCameraControls.test.ts`** (AC: #5)
  - [x] Mock `apiFetch` via `vi.mock('@/lib/api')`
  - [x] Test: `fetchSettings()` populates `settings` and `piReachable`
  - [x] Test: `patchSetting()` calls PATCH with correct body; optimistic revert on error
  - [x] Test: Pi offline response (`piOffline: true`) does not trigger error state

- [x] **Frontend — `AdminPanel.vue` component** (AC: #2, #3)
  - [x] Create `apps/web/src/components/admin/AdminPanel.vue`
  - [x] Accepts no props — reads `useAuth()` internally
  - [x] Desktop: renders as sidebar content (scrollable) within `WatchView.vue`'s `<aside data-sidebar-left>`
  - [x] Mobile: renders inside `<Sheet>` — `AdminPanel` itself doesn't include the Sheet wrapper; the parent controls it
  - [x] Contains `<CameraControls />` and a "Camera Controls" heading with a close `←` button
  - [x] Emits `@close` when close button clicked

- [x] **Frontend — `CameraControls.vue` component** (AC: #4, #5)
  - [x] Create `apps/web/src/components/admin/CameraControls.vue`
  - [x] On mount: calls `useCameraControls().fetchSettings()`
  - [x] Renders all controls from `CAMERA_CONTROL_META` that pass their `showIf` condition
  - [x] Sections: "Image", "Exposure", "White Balance", "Autofocus", "Overlay"
  - [x] Per-control rendering based on `type`: `slider` → `<Slider>`, `select` → native `<select>` or ShadCN Select, `switch` → `<Switch>`, `number` → `<input type="number">`, `text` → `<input type="text">`, `dual-number` → two `<input type="number">`
  - [x] Pi offline banner above controls when `piReachable === false`
  - [x] Loading skeleton (`<Skeleton>`) while initial `fetchSettings()` is in-flight

- [x] **Frontend — `CameraControls.test.ts`** (AC: #4)
  - [x] Mount with mocked `useCameraControls`
  - [x] Test: Pi offline banner shown when `piReachable = false`, hidden when `true`
  - [x] Test: `patchSetting` called on slider change (after debounce) / select change / switch toggle
  - [x] Test: control reverts to previous value on error

- [x] **Frontend — update `ProfileAnchor.vue`** (AC: #1)
  - [x] Remove `aria-disabled`, `cursor-not-allowed`, `tabindex="-1"`, `@click.prevent` from Camera Controls item
  - [x] Add `emit('openCameraControls')` on click
  - [x] Add to `defineEmits`: `'openCameraControls'`

- [x] **Frontend — update `WatchView.vue`** (AC: #2, #3)
  - [x] Import `AdminPanel`, `Sheet`, and relevant Sheet sub-components
  - [x] Add `adminPanelOpen = ref(false)` (initialized from `localStorage.getItem('manlycam:admin-panel-open') === 'true'`)
  - [x] Watch `adminPanelOpen` and persist to `localStorage`
  - [x] Replace `<!-- Story 3.6: AdminPanel / CameraControls here -->` with `<AdminPanel @close="adminPanelOpen = false" />`
  - [x] Bind `adminPanelOpen` to `<aside data-sidebar-left>` visibility: `v-show` (not `v-if`) so the sidebar preserves scroll state
  - [x] Handle "openCameraControls" event from `ProfileAnchor` (propagated up from `StreamPlayer`): set `adminPanelOpen = true`
  - [x] On `< lg` breakpoint: render `AdminPanel` inside a `<Sheet>` (bottom) instead of the aside; `adminPanelOpen` drives `v-model:open`
  - [x] `StreamPlayer` must propagate `@open-camera-controls` event from `ProfileAnchor` up to `WatchView`

- [x] **Frontend — update `StreamPlayer.vue`** (AC: #1)
  - [x] Add `@open-camera-controls` to `ProfileAnchor` and emit it upward via `defineEmits`

- [x] **Update coverage thresholds** (AC: #10)
  - [x] Run `vitest run --coverage` in `apps/server` and `apps/web`
  - [x] Update thresholds in `apps/server/vitest.config.ts` and `apps/web/vite.config.ts` to new baselines (never below Story 3.5 values)

## Dev Notes

### Field Name Correction — Architecture Notes vs. Live API

The architecture pre-work file (`3-6-camera-controls-architecture-notes.md`) uses incorrect field names in two places:
- Notes say `rpiCameraExposureMode` → **correct field is `rpiCameraExposure`**
- Notes say `rpiCameraAWBMode` → **correct field is `rpiCameraAWB`**

The user's live `GET /v3/config/paths/get/cam` response is the ground truth. All PATCH bodies must use the actual field names from the API response.

### HFlip/VFlip — Static vs. Dynamic Trade-off

The architecture notes classify `rpiCameraHFlip` / `rpiCameraVFlip` as "static" (set in Pi's `config.toml`, requires mediamtx restart to change). However:
- They appear in the runtime API response, so mediamtx may accept them via PATCH
- libcamera applies flip at stream initialization — a live PATCH may or may not take effect without a source restart
- Our DB persistence + re-apply-on-reconnect means that even if mediamtx needs a restart, the setting will be re-applied when the Pi next connects

**Include HFlip/VFlip in the UI** as requested. If they don't apply live, they apply on the next Pi reconnect. Render them as switches. If the Pi's `config.toml` has different values than what the admin set, the DB-persisted values win (applied on reconnect).

### Prisma — CameraSettings Model

Add to `apps/server/prisma/schema.prisma`:

```prisma
model CameraSettings {
  key       String   @id              // rpiCamera* field name, e.g. "rpiCameraBrightness"
  value     String                    // JSON.stringify(value) — round-trip via JSON.parse on read
  updatedAt DateTime @updatedAt @db.Timestamptz @map("updated_at")

  @@map("camera_settings")
}
```

Note: `key` as PK (not ULID) is intentional — same pattern as `StreamConfig` using `id = 'cfg'`. Camera settings are a key-value store where the key IS the unique identifier. No foreign keys reference this table.

Run:
```bash
pnpm --filter server exec prisma migrate dev --name add-camera-settings
```

### Server — streamService.ts Changes

Add a public getter for `piReachable`:

```typescript
isPiReachable(): boolean {
  return this.piReachable;
}
```

Add `reapplyCameraSettings()` private method:

```typescript
private async reapplyCameraSettings(): Promise<void> {
  try {
    const rows = await prisma.cameraSettings.findMany();
    if (rows.length === 0) return;
    const body: Record<string, unknown> = {};
    for (const row of rows) {
      body[row.key] = JSON.parse(row.value);
    }
    const res = await fetch(
      `http://${env.FRP_HOST}:${env.FRP_API_PORT}/v3/config/paths/patch/cam`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      logger.warn({ status: res.status }, 'stream: failed to re-apply camera settings on reconnect');
    } else {
      logger.info({ count: rows.length }, 'stream: re-applied camera settings on Pi reconnect');
    }
  } catch (err) {
    logger.error({ err }, 'stream: error re-applying camera settings on Pi reconnect');
  }
}
```

Update `updateReachable()`:

```typescript
private updateReachable(reachable: boolean): void {
  if (reachable !== this.piReachable) {
    this.piReachable = reachable;
    logger.info({ piReachable: reachable }, 'stream: Pi reachability changed');
    this.broadcastState();
    if (reachable) {
      this.reapplyCameraSettings().catch((err) => {
        logger.error({ err }, 'stream: reapplyCameraSettings rejected unexpectedly');
      });
    }
  }
}
```

### Server — stream.ts New Routes

```typescript
import { CAMERA_CONTROLS_ALLOWLIST } from '@manlycam/types';
import { AppError } from '../lib/errors.js';

// GET /api/stream/camera-settings
streamRouter.get('/api/stream/camera-settings', requireAuth, requireRole([Role.Admin]), async (c) => {
  const rows = await prisma.cameraSettings.findMany();
  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    settings[row.key] = JSON.parse(row.value);
  }
  return c.json({ settings, piReachable: streamService.isPiReachable() });
});

// PATCH /api/stream/camera-settings
streamRouter.patch('/api/stream/camera-settings', requireAuth, requireRole([Role.Admin]), async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const allowlist = new Set(CAMERA_CONTROLS_ALLOWLIST);

  for (const key of Object.keys(body)) {
    if (!allowlist.has(key as never)) {
      throw new AppError(`Unknown camera control key: ${key}`, 'INVALID_CAMERA_KEY', 400);
    }
  }

  // Persist to DB
  await Promise.all(
    Object.entries(body).map(([key, value]) =>
      prisma.cameraSettings.upsert({
        where: { key },
        update: { value: JSON.stringify(value) },
        create: { key, value: JSON.stringify(value) },
      })
    )
  );

  // Forward to Pi via frp tunnel
  if (!streamService.isPiReachable()) {
    return c.json({ ok: true, piOffline: true });
  }

  try {
    const res = await fetch(
      `http://${env.FRP_HOST}:${env.FRP_API_PORT}/v3/config/paths/patch/cam`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      return c.json({ ok: false, error: text });
    }
    return c.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'camera: failed to PATCH mediamtx');
    return c.json({ ok: false, error: 'Failed to reach Pi camera API' });
  }
});
```

### Camera Controls Allowlist and Metadata — packages/types/src/camera.ts

Create this file in `packages/types/src/camera.ts`:

```typescript
export const CAMERA_CONTROLS_ALLOWLIST = [
  'rpiCameraHFlip',
  'rpiCameraVFlip',
  'rpiCameraBrightness',
  'rpiCameraContrast',
  'rpiCameraSaturation',
  'rpiCameraSharpness',
  'rpiCameraExposure',
  'rpiCameraAWB',
  'rpiCameraAWBGains',
  'rpiCameraDenoise',
  'rpiCameraShutter',
  'rpiCameraMetering',
  'rpiCameraGain',
  'rpiCameraEV',
  'rpiCameraROI',
  'rpiCameraHDR',
  'rpiCameraAfMode',
  'rpiCameraAfRange',
  'rpiCameraAfSpeed',
  'rpiCameraLensPosition',
  'rpiCameraAfWindow',
  'rpiCameraFlickerPeriod',
  'rpiCameraTextOverlayEnable',
  'rpiCameraTextOverlay',
] as const;

export type CameraControlKey = (typeof CAMERA_CONTROLS_ALLOWLIST)[number];
export type CameraSettingsMap = Partial<Record<CameraControlKey, unknown>>;

export type CameraControlType = 'switch' | 'slider' | 'select' | 'number' | 'text' | 'dual-number';
export type CameraControlSection = 'Image' | 'Exposure' | 'White Balance' | 'Autofocus' | 'Overlay';

export interface CameraControlMeta {
  key: CameraControlKey;
  label: string;
  section: CameraControlSection;
  type: CameraControlType;
  min?: number;
  max?: number;
  step?: number;
  defaultValue: unknown;
  options?: Array<{ value: string; label: string }>;
  /** Key/value pair that must match for this control to be shown */
  showIf?: { key: CameraControlKey; value: unknown };
  description?: string;
}

export const CAMERA_CONTROL_META: CameraControlMeta[] = [
  // --- Image ---
  {
    key: 'rpiCameraHFlip',
    label: 'Horizontal Flip',
    section: 'Image',
    type: 'switch',
    defaultValue: false,
    description: 'Mirror image horizontally. Applied on next Pi reconnect if camera is active.',
  },
  {
    key: 'rpiCameraVFlip',
    label: 'Vertical Flip',
    section: 'Image',
    type: 'switch',
    defaultValue: false,
    description: 'Flip image vertically. Applied on next Pi reconnect if camera is active.',
  },
  {
    key: 'rpiCameraBrightness',
    label: 'Brightness',
    section: 'Image',
    type: 'slider',
    min: -1.0,
    max: 1.0,
    step: 0.01,
    defaultValue: 0,
  },
  {
    key: 'rpiCameraContrast',
    label: 'Contrast',
    section: 'Image',
    type: 'slider',
    min: 0.0,
    max: 32.0,
    step: 0.1,
    defaultValue: 1,
  },
  {
    key: 'rpiCameraSaturation',
    label: 'Saturation',
    section: 'Image',
    type: 'slider',
    min: 0.0,
    max: 32.0,
    step: 0.1,
    defaultValue: 1,
  },
  {
    key: 'rpiCameraSharpness',
    label: 'Sharpness',
    section: 'Image',
    type: 'slider',
    min: 0.0,
    max: 16.0,
    step: 0.1,
    defaultValue: 1,
  },
  {
    key: 'rpiCameraHDR',
    label: 'HDR',
    section: 'Image',
    type: 'switch',
    defaultValue: false,
  },
  // --- Exposure ---
  {
    key: 'rpiCameraExposure',
    label: 'Exposure Mode',
    section: 'Exposure',
    type: 'select',
    defaultValue: 'normal',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'short', label: 'Short' },
      { value: 'long', label: 'Long' },
      { value: 'custom', label: 'Custom' },
    ],
  },
  {
    key: 'rpiCameraShutter',
    label: 'Shutter Speed (µs)',
    section: 'Exposure',
    type: 'number',
    min: 0,
    max: 200000,
    step: 100,
    defaultValue: 0,
    description: '0 = auto. Value in microseconds.',
  },
  {
    key: 'rpiCameraGain',
    label: 'Analogue Gain',
    section: 'Exposure',
    type: 'slider',
    min: 0,
    max: 16.0,
    step: 0.1,
    defaultValue: 0,
    description: '0 = auto.',
  },
  {
    key: 'rpiCameraEV',
    label: 'Exposure Compensation (EV)',
    section: 'Exposure',
    type: 'slider',
    min: -8.0,
    max: 8.0,
    step: 0.1,
    defaultValue: 0,
  },
  {
    key: 'rpiCameraMetering',
    label: 'Metering Mode',
    section: 'Exposure',
    type: 'select',
    defaultValue: 'centre',
    options: [
      { value: 'centre', label: 'Centre' },
      { value: 'spot', label: 'Spot' },
      { value: 'matrix', label: 'Matrix' },
      { value: 'custom', label: 'Custom' },
    ],
  },
  {
    key: 'rpiCameraFlickerPeriod',
    label: 'Anti-Flicker Period (µs)',
    section: 'Exposure',
    type: 'number',
    min: 0,
    max: 20000,
    step: 1,
    defaultValue: 0,
    description: '0 = disabled. For 50Hz: 10000µs. For 60Hz: 8333µs.',
  },
  // --- White Balance ---
  {
    key: 'rpiCameraAWB',
    label: 'Auto White Balance',
    section: 'White Balance',
    type: 'select',
    defaultValue: 'auto',
    options: [
      { value: 'auto', label: 'Auto' },
      { value: 'incandescent', label: 'Incandescent' },
      { value: 'tungsten', label: 'Tungsten' },
      { value: 'fluorescent', label: 'Fluorescent' },
      { value: 'indoor', label: 'Indoor' },
      { value: 'daylight', label: 'Daylight' },
      { value: 'cloudy', label: 'Cloudy' },
      { value: 'custom', label: 'Custom (manual gains)' },
    ],
  },
  {
    key: 'rpiCameraAWBGains',
    label: 'AWB Gains [Red, Blue]',
    section: 'White Balance',
    type: 'dual-number',
    min: 0.0,
    max: 8.0,
    step: 0.01,
    defaultValue: [0, 0],
    showIf: { key: 'rpiCameraAWB', value: 'custom' },
    description: 'Manual red and blue channel gains. Only active when AWB Mode = Custom.',
  },
  // --- Autofocus ---
  {
    key: 'rpiCameraAfMode',
    label: 'Autofocus Mode',
    section: 'Autofocus',
    type: 'select',
    defaultValue: 'continuous',
    options: [
      { value: 'continuous', label: 'Continuous' },
      { value: 'auto', label: 'Auto (trigger)' },
      { value: 'manual', label: 'Manual' },
    ],
  },
  {
    key: 'rpiCameraAfRange',
    label: 'Autofocus Range',
    section: 'Autofocus',
    type: 'select',
    defaultValue: 'normal',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'macro', label: 'Macro' },
      { value: 'full', label: 'Full' },
    ],
  },
  {
    key: 'rpiCameraAfSpeed',
    label: 'Autofocus Speed',
    section: 'Autofocus',
    type: 'select',
    defaultValue: 'normal',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'fast', label: 'Fast' },
    ],
  },
  {
    key: 'rpiCameraLensPosition',
    label: 'Lens Position (diopters)',
    section: 'Autofocus',
    type: 'slider',
    min: 0.0,
    max: 32.0,
    step: 0.1,
    defaultValue: 0,
    showIf: { key: 'rpiCameraAfMode', value: 'manual' },
    description: 'Manual focus distance in diopters. Only active when AF Mode = Manual.',
  },
  {
    key: 'rpiCameraAfWindow',
    label: 'AF Window',
    section: 'Autofocus',
    type: 'text',
    defaultValue: '',
    description: 'Format: "x,y,width,height" normalized 0.0–1.0. Empty = full frame.',
  },
  {
    key: 'rpiCameraROI',
    label: 'Region of Interest',
    section: 'Image',
    type: 'text',
    defaultValue: '',
    description: 'Format: "x,y,width,height" normalized 0.0–1.0. Empty = full sensor.',
  },
  // --- Overlay ---
  {
    key: 'rpiCameraTextOverlayEnable',
    label: 'Enable Text Overlay',
    section: 'Overlay',
    type: 'switch',
    defaultValue: false,
  },
  {
    key: 'rpiCameraTextOverlay',
    label: 'Overlay Text',
    section: 'Overlay',
    type: 'text',
    defaultValue: '%Y-%m-%d %H:%M:%S - MediaMTX',
    showIf: { key: 'rpiCameraTextOverlayEnable', value: true },
    description: 'Supports strftime format codes.',
  },
];
```

Re-export from `packages/types/src/index.ts`:
```typescript
export * from './camera.js';
```

### Frontend — useCameraControls.ts Pattern

```typescript
// apps/web/src/composables/useCameraControls.ts
import { ref } from 'vue';
import { apiFetch, ApiFetchError } from '@/lib/api';
import type { CameraSettingsMap } from '@manlycam/types';

export function useCameraControls() {
  const settings = ref<CameraSettingsMap>({});
  const piReachable = ref(true);
  const isLoading = ref(false);
  const lastError = ref<string | null>(null);

  async function fetchSettings(): Promise<void> {
    isLoading.value = true;
    try {
      const data = await apiFetch<{ settings: CameraSettingsMap; piReachable: boolean }>(
        '/api/stream/camera-settings'
      );
      settings.value = data.settings;
      piReachable.value = data.piReachable;
    } catch (err) {
      if (err instanceof ApiFetchError) {
        console.error('[CameraControls] Failed to fetch settings:', err);
        lastError.value = err.message;
      }
    } finally {
      isLoading.value = false;
    }
  }

  async function patchSetting(key: string, value: unknown): Promise<void> {
    const previous = settings.value[key as keyof CameraSettingsMap];
    // Optimistic update
    settings.value = { ...settings.value, [key]: value };
    try {
      const result = await apiFetch<{ ok: boolean; piOffline?: boolean; error?: string }>(
        '/api/stream/camera-settings',
        { method: 'PATCH', body: JSON.stringify({ [key]: value }) }
      );
      if (!result.ok) {
        console.error('[CameraControls] PATCH failed:', result.error);
        lastError.value = result.error ?? 'Failed to apply setting';
        // Revert
        settings.value = { ...settings.value, [key]: previous };
      }
      // piOffline: true is not an error — setting is saved for reconnect
    } catch (err) {
      if (err instanceof ApiFetchError) {
        console.error('[CameraControls] PATCH error:', err);
        lastError.value = err.message;
        settings.value = { ...settings.value, [key]: previous };
      }
    }
  }

  return { settings, piReachable, isLoading, lastError, fetchSettings, patchSetting };
}
```

Note: `useCameraControls` is NOT a module-level singleton (unlike `useStream`/`useAuth`). Each `CameraControls.vue` mount gets its own state, consistent with `useAdminStream` pattern.

### Frontend — AdminPanel and CameraControls Component Hierarchy

```
WatchView.vue
├── <aside data-sidebar-left> (desktop, lg+)
│   └── <AdminPanel @close="adminPanelOpen = false" />  ← v-show="adminPanelOpen"
│       └── <CameraControls />
└── <Sheet v-model:open="adminPanelOpen"> (mobile, < lg)
    └── <SheetContent side="bottom">
        └── <AdminPanel @close="adminPanelOpen = false" />
            └── <CameraControls />
```

Use `v-show` (not `v-if`) on the aside so `CameraControls` doesn't re-mount and re-fetch every time the sidebar is toggled.

### Frontend — WatchView.vue Event Flow for Profile Menu

`ProfileAnchor.vue` → emits `openCameraControls` → `StreamPlayer.vue` → emits `openCameraControls` → `WatchView.vue` → sets `adminPanelOpen = true`.

In `StreamPlayer.vue`:
```typescript
const emit = defineEmits<{ openCameraControls: [] }>()
// In template:
// <ProfileAnchor ... @open-camera-controls="emit('openCameraControls')" />
```

In `WatchView.vue`:
```html
<StreamPlayer :streamState="streamState" @open-camera-controls="adminPanelOpen = true" />
```

### Frontend — Debounced Slider Pattern

Sliders should debounce the `patchSetting` call to avoid flooding the Pi with hundreds of requests while dragging. Use a simple timeout-based debounce (300ms) local to each control:

```typescript
// Inside CameraControls.vue or a helper
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function handleSliderChange(key: string, value: number) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    patchSetting(key, value);
  }, 300);
}
```

Select and Switch changes fire immediately (no debounce).

### Testing — Mock Structure for stream.test.ts

The existing `stream.test.ts` mock for `streamService` already has the shape. Add:

```typescript
// In the vi.mock factory for streamService:
isPiReachable: vi.fn().mockReturnValue(true),
```

For the new routes:
```typescript
// Mock prisma for camera routes
vi.mock('../db/client.js', () => ({
  prisma: {
    streamConfig: { upsert: vi.fn() },
    cameraSettings: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));
```

### env.ts — Verify FRP_API_PORT Exists

`apps/server/src/env.ts` already has:
- `FRP_HOST: z.string().min(1).default('localhost')`
- `FRP_API_PORT: z.string().min(1)`

No changes to env.ts needed. The camera PATCH route uses `http://${env.FRP_HOST}:${env.FRP_API_PORT}/v3/config/paths/patch/cam`.

### Shadcn-vue — Slider Component

The ShadCN Slider primitive from Radix Vue is a good fit. Install if not already present:
```bash
pnpm dlx shadcn-vue@latest add slider
```
Check if `apps/web/src/components/ui/slider/` exists first — it may already be installed.

Also verify `select` (for enum dropdowns):
```bash
pnpm dlx shadcn-vue@latest add select
```

### Project Structure Notes

**New files:**
```
packages/types/src/
└── camera.ts                ← CAMERA_CONTROLS_ALLOWLIST, CAMERA_CONTROL_META, types

apps/server/prisma/migrations/
└── <timestamp>_add_camera_settings/
    └── migration.sql        ← generated by prisma migrate dev

apps/web/src/
├── components/admin/
│   ├── AdminPanel.vue
│   └── CameraControls.vue
├── components/ui/sheet/     ← generated by shadcn-vue add sheet
│   └── ...
└── composables/
    ├── useCameraControls.ts
    └── useCameraControls.test.ts
```

**Modified files:**
```
packages/types/src/index.ts                          ← add camera.ts re-export
apps/server/prisma/schema.prisma                     ← add CameraSettings model
apps/server/src/services/streamService.ts            ← isPiReachable() getter, reapplyCameraSettings(), updateReachable() change
apps/server/src/routes/stream.ts                     ← GET + PATCH /api/stream/camera-settings
apps/server/src/routes/stream.test.ts                ← new describe blocks for camera routes
apps/server/src/services/streamService.test.ts       ← reapplyCameraSettings tests
apps/server/vitest.config.ts                         ← update coverage thresholds
apps/web/src/components/stream/ProfileAnchor.vue     ← activate Camera Controls item, emit openCameraControls
apps/web/src/components/stream/StreamPlayer.vue      ← propagate openCameraControls event
apps/web/src/views/WatchView.vue                     ← AdminPanel + Sheet integration, adminPanelOpen state
apps/web/vite.config.ts                              ← update coverage thresholds
```

**Do NOT:**
- Create `__tests__/` directories — all tests are co-located
- Use `export default` on composables, components, or types (exception: vite/vitest/tailwind config files)
- Import `PrismaClient` directly — always use `prisma` singleton from `apps/server/src/db/client.ts`
- Import `ulidx` directly — use `ulid.ts` singleton (not needed here — `CameraSettings` uses string key as PK)

### References

- Architecture pre-work: [`_bmad-output/implementation-artifacts/3-6-camera-controls-architecture-notes.md`] — mediamtx PATCH API, frp tunnel transport, re-apply on reconnect design, DB model suggestion
- Epics story 3.6: [`_bmad-output/planning-artifacts/epics.md`] — "Story 3.6: Admin Camera Controls Sidebar" BDD criteria
- UX spec (left sidebar, three-column layout, mobile Sheet): [`_bmad-output/planning-artifacts/ux-design-specification.md`] — Responsive Layout, Component Strategy, Journey 3, Overlay & Modal Patterns
- UX directions (visual mockup): [`_bmad-output/planning-artifacts/ux-design-directions.html`] — "Desktop — Three-Column with Camera Controls" showing Brightness, Contrast, Saturation, Sharpness sliders + Auto Exposure + AWB toggles in left sidebar
- `streamService.ts` (piReachable, updateReachable, pollMediamtxState): [`apps/server/src/services/streamService.ts`]
- `stream.ts` (existing route patterns, requireAuth/requireRole usage): [`apps/server/src/routes/stream.ts`]
- `stream.test.ts` (existing mock structure for streamService, prisma): [`apps/server/src/routes/stream.test.ts`]
- `ProfileAnchor.vue` (Camera Controls placeholder — make active): [`apps/web/src/components/stream/ProfileAnchor.vue`]
- `StreamPlayer.vue` (propagate event up): [`apps/web/src/components/stream/StreamPlayer.vue`]
- `WatchView.vue` (aside placeholder, three-column layout): [`apps/web/src/views/WatchView.vue`]
- `useAdminStream.ts` (pattern for API composable with optimistic update): [`apps/web/src/composables/useAdminStream.ts`]
- `apiFetch` and `ApiFetchError`: [`apps/web/src/lib/api.ts`]
- `env.ts` (FRP_HOST, FRP_API_PORT already defined): [`apps/server/src/env.ts`]
- Prisma schema: [`apps/server/prisma/schema.prisma`]
- `AppError` signature: [`apps/server/src/lib/errors.ts`]
- `Role` enum: [`packages/types/src/ws.ts`]
- Story 3.5 (ProfileAnchor implementation, Camera Controls placeholder): [`_bmad-output/implementation-artifacts/3-5-admin-stream-start-stop-toggle.md`]
- Server coverage config: [`apps/server/vitest.config.ts`] (current: lines 84, functions 90, branches 87, statements 84)
- Web coverage config: [`apps/web/vite.config.ts`] (current: lines 85, functions 79, branches 91, statements 85)
- mediamtx runtime API (live Pi): `curl -X GET http://127.0.0.1:9997/v3/config/paths/get/cam` — for enum verification run `curl -s http://127.0.0.1:9997/openapi | python3 -m json.tool` on the Pi

## Post-MVP Deferred Features

### ROI and AF Window — Interactive Region Selectors

`rpiCameraROI` (Region of Interest) and `rpiCameraAfWindow` (Autofocus Window) were removed from the camera controls UI and server allowlist. Both accept a normalized `"x,y,width,height"` string (floats 0.0–1.0). A free-text input is unusable in practice — an invalid or out-of-range value crashes the stream (mediamtx/libcamera reject malformed input with no graceful recovery).

**Recommended post-MVP implementation:**
- Render an interactive crop/region overlay on top of the live stream (an SVG or canvas layer)
- The user drags a rectangle on the stream; the UI computes the normalized coordinates and writes them as a formatted string
- Only valid, clamped values are ever sent to the Pi
- This avoids free-text input and the associated crash risk entirely

Deferred until a story that includes the stream overlay UI work.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
