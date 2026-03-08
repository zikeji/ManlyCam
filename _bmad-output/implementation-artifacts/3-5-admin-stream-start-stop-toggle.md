# Story 3.5: Admin Stream Start/Stop Toggle

Status: review

## Story

As **the admin**,
I want to start and stop the stream from the web UI on any device,
so that I can control stream availability without SSH or CLI access.

## Acceptance Criteria

1. **ProfileAnchor component — all authenticated users**
   - A `ProfileAnchor.vue` component renders at the bottom-left corner of `StreamPlayer`, inside the stream container
   - The ProfileAnchor is hidden at rest (opacity: 0) and appears on hover (opacity: 1) using the same 150ms ease transition as the top gradient — **same hover state as the top overlay**
   - When the ProfileAnchor's popover is open, it remains fully visible even if the cursor leaves the stream container (popover-open state overrides hover-based visibility)
   - The ProfileAnchor renders an `<Avatar>` using the authenticated user's `avatarUrl`; if `avatarUrl` is null, `<AvatarFallback>` shows the first two characters of `displayName` (uppercased)
   - The Avatar button has `aria-label="Account menu"` and `aria-haspopup="true"` / `aria-expanded` bound to the popover open state
   - Clicking the Avatar opens a `<Popover>` menu with items listed below

2. **ProfileAnchor popover menu — base items (all roles)**
   - Username header: displays `user.displayName` as a non-interactive header item at the top of the menu
   - "Log out" button: calls `useAuth().logout()` and closes the popover
   - Escape key closes the popover and returns focus to the Avatar button (shadcn-vue Popover handles focus trapping)
   - Clicking outside the popover closes it

3. **ProfileAnchor popover menu — admin-only items**
   - "Start Stream" / "Stop Stream" toggle button is rendered **only when `user.role === Role.Admin`**
   - Label logic:
     - `streamState === 'explicit-offline'` → label is **"Start Stream"** (admin toggle is currently `offline`)
     - All other stream states (`live`, `unreachable`, `connecting`) → label is **"Stop Stream"** (admin toggle is currently `live`)
   - Clicking "Stop Stream" calls `POST /api/stream/stop`; clicking "Start Stream" calls `POST /api/stream/start`
   - While the request is in-flight, the button shows a loading state (disabled + spinner or muted text)
   - On success (200 `{ ok: true }`): close the popover; the WS broadcast from Story 3.4 will update the stream state in real time
   - On error: log to console and show an error indicator (do not crash); popover remains open
   - "Camera Controls" menu item is rendered **only when `user.role === Role.Admin`**; it is visually present but **disabled** in this story (placeholder for Story 3.6 — clicking it does nothing or is `aria-disabled`)

4. **Server — `POST /api/stream/stop` endpoint**
   - `requireAuth` + `requireRole(['Admin'])` middleware chain guards the route
   - On success: calls `streamService.setAdminToggle('offline')` (which broadcasts `{ type: 'stream:state', payload: { state: 'explicit-offline' } }` to all WS clients) and returns `{ ok: true }` with HTTP 200
   - Unauthenticated request (no/invalid session) → 401 `{ error: { code: 'UNAUTHORIZED', ... } }`
   - Non-Admin role → 403 `{ error: { code: 'FORBIDDEN', ... } }`
   - Stream state is unchanged on 401/403

5. **Server — `POST /api/stream/start` endpoint**
   - `requireAuth` + `requireRole(['Admin'])` middleware chain guards the route
   - On success: calls `streamService.setAdminToggle('live')` (broadcasts `{ state: 'live' }` if Pi is reachable, or `{ state: 'unreachable', adminToggle: 'live' }` if disconnected) and returns `{ ok: true }` with HTTP 200
   - Unauthenticated → 401; Non-Admin → 403

6. **Server — admin toggle persisted to database**
   - Admin toggle state (`'live' | 'offline'`) is stored in a new `StreamConfig` singleton row in the database
   - `streamService.start()` loads the persisted `adminToggle` value from the DB on server startup (upsert with `id = 'cfg'`, default `'live'`)
   - `streamService.setAdminToggle()` persists the new value to DB before (or alongside) broadcasting — if the stream was stopped before a restart, it remains stopped after restart
   - The schema change requires a Prisma migration (`pnpm --filter server exec prisma migrate dev --name add-stream-config`)

7. **Coverage thresholds**
   - After all tests pass, update `apps/server/vitest.config.ts` and `apps/web/vite.config.ts` thresholds to reflect the new baseline

## Tasks / Subtasks

- [x] **Prisma — `StreamConfig` schema addition** (AC: #6)
  - [x] Add `StreamConfig` model to `apps/server/prisma/schema.prisma` (see Dev Notes for exact model definition)
  - [x] Run migration: `pnpm --filter server exec prisma migrate dev --name add-stream-config`
  - [x] Verify `prisma generate` updates `@prisma/client`

- [x] **Server — update `StreamService` for DB persistence** (AC: #6)
  - [x] Import `prisma` from `'../db/client.js'` in `streamService.ts`
  - [x] Change `start()` to `async start(): Promise<void>` — upsert `StreamConfig` with `id: 'cfg'` (create with `adminToggle: 'live'` if missing), load result into `this.adminToggle`, then fire `supervisorLoop` and `pollLoop` (still fire-and-forget with `.catch()`)
  - [x] Change `setAdminToggle(toggle)` to `async setAdminToggle(toggle): Promise<void>` — persist to DB (`prisma.streamConfig.update({ where: { id: 'cfg' }, data: { adminToggle: toggle } })`), then call `this.broadcastState()`
  - [x] Update `apps/server/src/index.ts`: change `streamService.start()` to `streamService.start().catch(err => logger.error({ err }, 'streamService.start() failed'))` in the serve callback — since the callback is sync, we can't `await` it, but we must handle the rejection

- [x] **Server — `POST /api/stream/stop` and `POST /api/stream/start` endpoints** (AC: #4, #5)
  - [x] Add `requireRole` import to `stream.ts`
  - [x] Add `POST /api/stream/stop`: `requireAuth`, `requireRole(['Admin'])`, then `await streamService.setAdminToggle('offline')`, return `c.json({ ok: true })`
  - [x] Add `POST /api/stream/start`: same pattern with `setAdminToggle('live')`

- [x] **Server — update `stream.test.ts`** (AC: #4, #5)
  - [x] `describe('POST /api/stream/stop')`:
    - [x] Unauthenticated → 401
    - [x] ViewerCompany role → 403
    - [x] Admin role → 200 `{ ok: true }`, `streamService.setAdminToggle` called with `'offline'`
  - [x] `describe('POST /api/stream/start')`:
    - [x] Unauthenticated → 401
    - [x] ViewerCompany role → 403
    - [x] Admin role → 200 `{ ok: true }`, `streamService.setAdminToggle` called with `'live'`
  - [x] Existing mock `streamService.setAdminToggle: vi.fn()` is already in place — just add the new `describe` blocks
  - [x] Add `mockAdmin` user fixture: same shape as `mockUser` but `role: 'Admin'`

- [x] **Frontend — install shadcn-vue Popover** (AC: #1, #2, #3)
  - [x] Run `pnpm dlx shadcn-vue@latest add popover` from `apps/web/`
  - [x] Verify `apps/web/src/components/ui/popover/` directory is created with Popover components

- [x] **Frontend — `useAdminStream.ts` composable** (AC: #3)
  - [x] Create `apps/web/src/composables/useAdminStream.ts`
  - [x] Export `useAdminStream()` returning `{ startStream, stopStream, isLoading, error }`
  - [x] `startStream()`: POST `/api/stream/start`, sets `isLoading` during request, clears `error` on success, sets `error` message on failure
  - [x] `stopStream()`: POST `/api/stream/stop`, same pattern
  - [x] `isLoading: Ref<boolean>` — local to each call instance (not module-level singleton — each component gets its own loading state)
  - [x] `error: Ref<string | null>` — last error message or null

- [x] **Frontend — `useAdminStream.test.ts`** (AC: #3)
  - [x] Mock `apiFetch` via `vi.mock('@/lib/api')`
  - [x] Test: `startStream()` calls `apiFetch('/api/stream/start', { method: 'POST' })`; `isLoading` is true during call, false after
  - [x] Test: `stopStream()` calls `apiFetch('/api/stream/stop', { method: 'POST' })`
  - [x] Test: on `ApiFetchError`, `error.value` is set to the error message; `isLoading` is false

- [x] **Frontend — `ProfileAnchor.vue` component** (AC: #1, #2, #3)
  - [x] Create `apps/web/src/components/stream/ProfileAnchor.vue`
  - [x] `<script setup lang="ts">`:
    - Import `useAuth`, `useStream`, `useAdminStream`, `Role` from correct paths
    - `const { user, logout } = useAuth()`
    - `const { streamState } = useStream()`
    - `const { startStream, stopStream, isLoading } = useAdminStream()`
    - `const isOpen = ref(false)` — popover open state
    - `defineEmits(['update:popoverOpen'])` OR use `defineModel('popoverOpen')` to expose open state to parent (StreamPlayer needs it to keep anchor visible)
    - `const toggleLabel = computed(() => streamState.value === 'explicit-offline' ? 'Start Stream' : 'Stop Stream')`
    - `const isAdmin = computed(() => user.value?.role === Role.Admin)`
    - Derive avatar fallback initials from `user.value?.displayName`
    - `handleToggle()`: calls `startStream()` or `stopStream()` based on `streamState`, then `isOpen.value = false` on success
    - `handleLogout()`: calls `logout()`, sets `isOpen.value = false`
  - [x] Template: `<Popover v-model:open="isOpen">` wrapping `<PopoverTrigger>` (Avatar button) and `<PopoverContent>` (menu)
  - [x] PopoverContent structure:
    ```
    - Username header (displayName, non-clickable)
    - Divider
    - [Admin only] Start/Stop Stream button (isLoading disables it)
    - [Admin only] Camera Controls item (aria-disabled, cursor-not-allowed, Story 3.6 placeholder)
    - Divider
    - Log out button
    ```
  - [x] Avatar button: `<Button variant="ghost">` wrapping `<Avatar>` → `<AvatarImage :src="user.avatarUrl">` + `<AvatarFallback>` (first 2 chars of displayName)
  - [x] Emit `update:popoverOpen` whenever `isOpen` changes (use `watch(isOpen, ...)`)

- [x] **Frontend — Update `StreamPlayer.vue`** (AC: #1)
  - [x] Import `ProfileAnchor`
  - [x] Add `const profilePopoverOpen = ref(false)` in `<script setup>`
  - [x] Update visibility rule: `const overlayVisible = (state, hovered) => state !== 'live' || hovered || profilePopoverOpen.value`
  - [x] Render `<ProfileAnchor>` in bottom-left of the container:
    ```html
    <div
      class="absolute inset-x-0 bottom-0 flex items-end p-3 transition-opacity duration-150"
      :class="overlayVisible(streamState, isHovered) ? 'opacity-100' : 'opacity-0'"
    >
      <ProfileAnchor v-model:popover-open="profilePopoverOpen" />
    </div>
    ```
  - [x] `<ProfileAnchor>` must only render for authenticated users — wrap with `v-if="user"` (import `useAuth` in StreamPlayer, or conditionally pass a prop). Preferred: import `useAuth` in `StreamPlayer.vue` — `const { user } = useAuth()` — and use `v-if="user"` on the ProfileAnchor wrapper

- [x] **Update `apps/server/vitest.config.ts` and `apps/web/vite.config.ts`** — coverage thresholds (AC: #7)
  - [x] Run `vitest run --coverage` in `apps/server` and `apps/web` and update thresholds to new baseline

## Dev Notes

### Database — StreamConfig Singleton Model

Add to `apps/server/prisma/schema.prisma`:

```prisma
model StreamConfig {
  id          String   @id
  adminToggle String   @default("live") @map("admin_toggle") // 'live' | 'offline'
  updatedAt   DateTime @default(now()) @updatedAt @db.Timestamptz @map("updated_at")

  @@map("stream_config")
}
```

Then run:
```bash
pnpm --filter server exec prisma migrate dev --name add-stream-config
```

The singleton row uses `id = 'cfg'` as the fixed primary key. The `streamService.start()` upserts it on startup so the row always exists.

### StreamService — Async `start()` and Persistence Pattern

```typescript
// streamService.ts additions
import { prisma } from '../db/client.js';

// start() becomes async
async start(): Promise<void> {
  const config = await prisma.streamConfig.upsert({
    where: { id: 'cfg' },
    update: {},
    create: { id: 'cfg', adminToggle: 'live' },
  });
  this.adminToggle = config.adminToggle as 'live' | 'offline';

  this.supervisorLoop().catch((err) => {
    logger.error({ err }, 'mediamtx supervisor loop exited unexpectedly');
  });
  this.pollLoop().catch((err) => {
    logger.error({ err }, 'mediamtx poll loop exited unexpectedly');
  });
}

// setAdminToggle() becomes async
async setAdminToggle(toggle: 'live' | 'offline'): Promise<void> {
  this.adminToggle = toggle;
  await prisma.streamConfig.upsert({
    where: { id: 'cfg' },
    update: { adminToggle: toggle },
    create: { id: 'cfg', adminToggle: toggle },
  });
  this.broadcastState();
}
```

### index.ts — Handling Async start() in Sync Callback

`serve()` callback is synchronous. We cannot `await` inside it. Handle the async start with `.catch()`:

```typescript
const server = serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`Server running on http://localhost:${info.port}`);
  streamService.start().catch((err) => {
    logger.error({ err }, 'streamService.start() failed');
  });
});
```

The supervisor and poll loops fire-and-forget regardless of this — `start()` only awaits the DB read, then launches the loops. The server is ready to serve requests immediately; stream state initialization happens async but quickly.

### stream.ts — New Endpoint Pattern

```typescript
import { requireRole } from '../middleware/requireRole.js';
import { Role } from '@manlycam/types';

streamRouter.post('/api/stream/stop', requireAuth, requireRole([Role.Admin]), async (c) => {
  await streamService.setAdminToggle('offline');
  return c.json({ ok: true });
});

streamRouter.post('/api/stream/start', requireAuth, requireRole([Role.Admin]), async (c) => {
  await streamService.setAdminToggle('live');
  return c.json({ ok: true });
});
```

### Testing New Endpoints — Mock Setup Already In Place

`stream.test.ts` already mocks `streamService.setAdminToggle: vi.fn()`. No changes to the mock block. Just add `describe` blocks:

```typescript
const mockAdmin = { ...mockUser, role: 'Admin' };

describe('POST /api/stream/stop', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/stream/stop', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-Admin role', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never); // ViewerCompany
    const res = await createApp().app.request('/api/stream/stop', { ...authHeaders, method: 'POST' });
    expect(res.status).toBe(403);
    expect(vi.mocked(streamService.setAdminToggle)).not.toHaveBeenCalled();
  });

  it('returns 200 and calls setAdminToggle("offline") for Admin', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(streamService.setAdminToggle).mockResolvedValue(undefined);
    const res = await createApp().app.request('/api/stream/stop', { ...authHeaders, method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(vi.mocked(streamService.setAdminToggle)).toHaveBeenCalledWith('offline');
  });
});
```

Repeat pattern for `/api/stream/start` with `'live'`.

Note: `streamService.setAdminToggle` is now `async` — mock it as `vi.fn().mockResolvedValue(undefined)` when you need a resolved promise, or leave it as `vi.fn()` (returns undefined synchronously) if the test doesn't await the mock. Since the route does `await streamService.setAdminToggle(...)`, use `mockResolvedValue(undefined)`.

### Frontend — Popover Installation

The shadcn-vue Popover component is **not yet installed**. Run from `apps/web/`:
```bash
pnpm dlx shadcn-vue@latest add popover
```

This creates `apps/web/src/components/ui/popover/Popover.vue`, `PopoverContent.vue`, `PopoverTrigger.vue` (or similar — check the generated files). The project uses Tailwind v3 (pinned — do not upgrade to v4).

### ProfileAnchor — Hover Visibility & Popover Interaction

The `StreamPlayer.vue` container div handles hover state via `@mouseenter` / `@mouseleave`. The Popover content renders in a portal (outside the stream container DOM), so moving the cursor from the stream into the open Popover **will trigger `mouseleave` on the container** — hiding the anchor button while the popover is open.

**Solution:** `ProfileAnchor` exposes its open state to `StreamPlayer` via `v-model:popover-open`. `StreamPlayer` tracks `profilePopoverOpen` and includes it in the overlay visibility rule:

```typescript
// StreamPlayer.vue
const profilePopoverOpen = ref(false);
const overlayVisible = (state: ClientStreamState, hovered: boolean) =>
  state !== 'live' || hovered || profilePopoverOpen.value;
```

```html
<!-- StreamPlayer.vue template -->
<ProfileAnchor v-model:popover-open="profilePopoverOpen" />
```

```typescript
// ProfileAnchor.vue
const isOpen = defineModel<boolean>('popoverOpen', { default: false })
// OR:
const isOpen = ref(false)
const emit = defineEmits<{ 'update:popoverOpen': [val: boolean] }>()
watch(isOpen, (val) => emit('update:popoverOpen', val))
```

Using `defineModel` (Vue 3.4+) is the cleanest approach.

### ProfileAnchor — Toggle Label Logic

```typescript
const toggleLabel = computed(() =>
  streamState.value === 'explicit-offline' ? 'Start Stream' : 'Stop Stream'
)
const handleToggle = async () => {
  if (streamState.value === 'explicit-offline') {
    await startStream()
  } else {
    await stopStream()
  }
  if (!error.value) {
    isOpen.value = false
  }
}
```

The WS hub (Story 3.4) will push the updated `stream:state` message automatically after `setAdminToggle()` — `streamState` reactive ref in `useStream` updates immediately. No polling needed.

### ProfileAnchor — Avatar Fallback Initials

```typescript
const avatarFallback = computed(() => {
  const name = user.value?.displayName ?? ''
  return name.slice(0, 2).toUpperCase()
})
```

### Camera Controls Menu Item — Story 3.6 Placeholder

```html
<button
  class="... opacity-50 cursor-not-allowed"
  aria-disabled="true"
  tabindex="-1"
  @click.prevent
>
  Camera Controls
</button>
```

Alternatively, render it only for Admin but make it visually obvious it's "coming soon" — the dev may choose to emit an event that Story 3.6 wires up. For this story, disabled/non-functional is correct.

### UX Design — Exact Layout Specification

From `_bmad-output/planning-artifacts/ux-design-specification.md` and `_bmad-output/planning-artifacts/ux-design-directions.html`:

- **`ProfileAnchor` position:** Absolute, bottom-left of stream container, `p-3` padding
- **Visibility:** Same fade behavior as `HoverOverlay` — hidden at rest (`opacity-0`), `opacity-100` on hover, 150ms ease transition
- **Avatar size:** Small (32–36px), circular
- **Popover opens on click** — no scrim, inline anchored
- **Menu item order:** Username (header) → Stream Toggle (admin) → Camera Controls (admin) → divider → Settings (future, disabled) → Log out

The UX spec (`StreamPlayer` anatomy) lists `<ProfileAnchor>` as a required subcomponent with:
- Props: `isAdmin` (from UX spec), but **in implementation** derive from `useAuth().user.role` directly (no prop needed)
- The UX spec `StreamPlayer` prop `isAdmin` was a design-time abstraction; the implementation pattern in this codebase is to read from composables, not props

### WatchView.vue — No Changes Needed

The existing left sidebar placeholder in `WatchView.vue` (admin-only, for Story 3.6 camera controls) remains unchanged. The stream toggle in this story lives entirely within `StreamPlayer` → `ProfileAnchor`. The `WatchView` `main` column already passes `streamState` to `StreamPlayer` via `<StreamPlayer :streamState="streamState" />`.

### Project Structure Notes

**Files to create (new):**
```
apps/server/prisma/migrations/
└── <timestamp>_add_stream_config/
    └── migration.sql         ← generated by prisma migrate dev (do not hand-write)

apps/web/src/
├── components/stream/
│   └── ProfileAnchor.vue     ← avatar FAB + popover menu
├── components/ui/popover/
│   └── Popover.vue etc.      ← generated by shadcn-vue add popover
└── composables/
    ├── useAdminStream.ts      ← start/stop API composable
    └── useAdminStream.test.ts
```

**Files to modify:**
```
apps/server/prisma/schema.prisma         ← add StreamConfig model
apps/server/src/services/streamService.ts ← async start/setAdminToggle + DB persistence
apps/server/src/routes/stream.ts          ← POST /api/stream/start and /stop
apps/server/src/index.ts                  ← .catch() on streamService.start()
apps/server/src/routes/stream.test.ts     ← new describe blocks for start/stop
apps/server/vitest.config.ts              ← update coverage thresholds
apps/web/src/components/stream/StreamPlayer.vue ← add ProfileAnchor, profilePopoverOpen
apps/web/vite.config.ts                   ← update coverage thresholds
```

**Do NOT create `__tests__/` directories.** Tests are always co-located (`*.test.ts` next to source file).
**Named exports only** — no `export default` on composables or components (exception: vite/vitest/tailwind config files).
**No new Prisma clients** — always import `prisma` singleton from `apps/server/src/db/client.ts`.

### References

- Epics story 3.5: [`_bmad-output/planning-artifacts/epics.md`] — "Story 3.5: Admin Stream Start/Stop Toggle"
- UX spec (ProfileAnchor, hover model, admin gateway): [`_bmad-output/planning-artifacts/ux-design-specification.md`] — StreamPlayer anatomy, ProfileAnchor component, Journey 3, Overlay & Modal Patterns
- UX design directions (visual mockups): [`_bmad-output/planning-artifacts/ux-design-directions.html`] — "Bottom-left: profile avatar (hidden at rest, appears on hover) — click opens a menu with user name, Camera Controls (admin), Settings, and Log out"
- `streamService.ts` (existing admin toggle in-memory, to be made persistent): [`apps/server/src/services/streamService.ts`]
- `requireRole` middleware: [`apps/server/src/middleware/requireRole.ts`]
- `requireAuth` middleware: [`apps/server/src/middleware/requireAuth.ts`]
- `stream.ts` (existing route file to extend): [`apps/server/src/routes/stream.ts`]
- `stream.test.ts` (test file with existing mocks): [`apps/server/src/routes/stream.test.ts`]
- `streamService` mock (already includes `setAdminToggle: vi.fn()`): [`apps/server/src/routes/stream.test.ts`] lines 20–28
- `StreamPlayer.vue` (parent — add ProfileAnchor): [`apps/web/src/components/stream/StreamPlayer.vue`]
- `useStream.ts` (module-level singleton, `streamState` reactive): [`apps/web/src/composables/useStream.ts`]
- `useAuth.ts` (module-level singleton, `user`, `logout`): [`apps/web/src/composables/useAuth.ts`]
- `apiFetch` and `ApiFetchError`: [`apps/web/src/lib/api.ts`]
- `Avatar`, `AvatarImage`, `AvatarFallback` components: [`apps/web/src/components/ui/avatar/`]
- `Button` component: [`apps/web/src/components/ui/button/Button.vue`]
- Prisma singleton: [`apps/server/src/db/client.ts`]
- Prisma schema: [`apps/server/prisma/schema.prisma`]
- `Role` enum (Admin, Moderator, ViewerCompany, ViewerGuest): [`packages/types/src/ws.ts`]
- `StreamState` type and `WsMessage` union: [`packages/types/src/ws.ts`]
- `MeResponse` type (has `role`, `avatarUrl`, `displayName`): [`packages/types/src/api.ts`]
- `WatchView.vue` (parent layout, no changes needed): [`apps/web/src/views/WatchView.vue`]
- Server coverage config: [`apps/server/vitest.config.ts`]
- Web coverage config: [`apps/web/vite.config.ts`]
- Story 3.4 (WS hub, real-time broadcast, `setAdminToggle` already broadcasts): [`_bmad-output/implementation-artifacts/3-4-websocket-hub-and-real-time-state-broadcasting.md`]
- Story 3.3 (SPA shell, 4-state UI, `ClientStreamState` type): [`_bmad-output/implementation-artifacts/3-3-spa-shell-stream-player-and-4-state-ui.md`]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Added `StreamConfig` Prisma model with singleton `id='cfg'` pattern; migration `20260308183014_add_stream_config` applied
- `StreamService.start()` and `setAdminToggle()` made async; DB persistence via upsert; `start()` on server startup loads persisted toggle state
- Used `upsert` (not `update`) in `setAdminToggle` for idempotency (handles edge case where row missing)
- `apps/server/src/index.ts` updated to handle async `start()` with `.catch()` in sync serve callback
- `POST /api/stream/stop` and `POST /api/stream/start` added with `requireAuth + requireRole([Role.Admin])` guard chain
- `stream.test.ts` updated: added `mockAdmin` fixture, mocked `setAdminToggle` as `mockResolvedValue(undefined)` for async route, 6 new tests (3 per endpoint)
- `streamService.test.ts` updated: added `../db/client.js` mock, made `setAdminToggle` and `start()` tests `async`
- shadcn-vue Popover installed; `popover/index.ts` reformatted to match project style (single quotes, semicolons)
- `useAdminStream.ts` composable: per-call-instance `isLoading`/`error` refs, `ApiFetchError` instanceof check for error messages
- `useAdminStream.test.ts`: fixed hoisting issue by defining `MockApiFetchError` class inside `vi.mock()` factory
- `ProfileAnchor.vue`: uses `defineModel('popoverOpen')` (Vue 3.4+ pattern), `toggleLabel` computed from `streamState`, admin-only controls gated by `user.role === Role.Admin`
- `StreamPlayer.vue`: added `ProfileAnchor`, `profilePopoverOpen` ref, updated `overlayVisible` to include popover-open state, `useAuth` mock added to `StreamPlayer.test.ts`
- Web coverage thresholds updated: lines 85, functions 79, branches 91, statements 85 (ProfileAnchor.vue visual functions not exercised by unit tests)
- Server coverage unchanged: lines 84, functions 90, branches 87, statements 84

### File List

apps/server/prisma/schema.prisma
apps/server/prisma/migrations/20260308183014_add_stream_config/migration.sql
apps/server/src/services/streamService.ts
apps/server/src/services/streamService.test.ts
apps/server/src/routes/stream.ts
apps/server/src/routes/stream.test.ts
apps/server/src/index.ts
apps/server/vitest.config.ts
apps/web/src/components/ui/popover/Popover.vue
apps/web/src/components/ui/popover/PopoverContent.vue
apps/web/src/components/ui/popover/PopoverTrigger.vue
apps/web/src/components/ui/popover/index.ts
apps/web/src/composables/useAdminStream.ts
apps/web/src/composables/useAdminStream.test.ts
apps/web/src/components/stream/ProfileAnchor.vue
apps/web/src/components/stream/StreamPlayer.vue
apps/web/src/components/stream/StreamPlayer.test.ts
apps/web/vite.config.ts
