---
status: ready-for-review
slug: fluent-emoji-customizable-offline-message
---

# Fluent Emoji + Customizable Offline Message

## Goal

Replace hardcoded unicode emojis in standalone view screens with Fluent Emoji `<img>` tags; give admins the ability to customize the offline-screen emoji, title line, and body line via a dialog accessible from the BroadcastConsole; record stream start/stop and offline-message changes in the audit log.

---

## Acceptance Criteria

**AC1 — Fluent emoji on Rejected and Banned screens**
Given a user lands on RejectedView or BannedView, when the page renders, then the emoji is an `<img>` served from `/emojis/{codepoint}.svg` (🔒 → `1f512`, 🚫 → `1f6ab`), not a unicode character.

**AC2 — Default offline screen unchanged**
Given no custom offline message has been saved, when the stream is explicitly offline, then StateOverlay shows: the sleeping-face Fluent Emoji (`1f634`), the title `{petName} needs their Zzzs`, and the body `The stream is offline for now. Check back later — they'll be back.`

**AC3 — Custom offline message persists and displays**
Given an admin saves custom values (any combination of emoji/title/description), when any viewer loads the offline screen — immediately on save and after full page reload — then custom non-null fields are displayed and null fields fall back to their respective defaults.

**AC4 — Edit button on desktop**
Given the user is Admin and `isDesktop` is true, when BroadcastConsole renders, then a `SquarePen` icon button with tooltip "Edit offline message" appears immediately to the right of the start/stop stream button in the left flank admin block.

**AC5 — Edit entry in mobile profile popover**
Given the user is Admin and `isDesktop` is false, when the profile popover is open, then an "Offline Message" item appears in the admin section immediately below "Admin" (and above the divider).

**AC6 — Dialog opens and populates**
Given the admin clicks the AC4 button or AC5 item, when the dialog opens, then it fetches `GET /api/stream/offline-message` and pre-populates: the emoji preview shows the current emoji (or the sleeping-face default), the title input shows the saved value or is empty with the default as placeholder text, the description input shows the saved value or is empty with the default as placeholder text.

**AC7 — Save**
Given the admin edits fields and clicks Save, when the request succeeds, then: empty string inputs are treated as null (default), the server PATCHes and broadcasts updated stream state, StateOverlay reflects the new values reactively, the dialog closes.

**AC8 — Cancel**
Given the admin clicks Cancel or dismisses the dialog (Escape / ×), then the dialog closes with no changes saved and no request sent.

**AC9 — Reset**
Given the admin clicks Reset, when the request succeeds, then the server stores null for all three fields, broadcasts defaults, the dialog closes, and the offline screen reverts to AC2 defaults.

**AC10 — Audit log: stream start/stop**
Given an admin starts or stops the stream via POST /api/stream/start or /api/stream/stop, when the handler runs, then an AuditLog row is inserted: action `stream_start` or `stream_stop`, actorId = admin's userId, no targetId, no metadata.

**AC11 — Audit log: offline message update**
Given an admin saves or resets the offline message via PATCH /api/stream/offline-message, when the handler runs, then an AuditLog row is inserted: action `offline_message_update`, actorId = admin's userId, no targetId, metadata = `{ emoji: string|null, title: string|null, description: string|null }` (the stored values, post-normalisation).

---

## Implementation Tasks

### 0. Server — refactor StreamConfig to key:value store

**Files:** `apps/server/prisma/schema.prisma`, `apps/server/prisma/migrations/<timestamp>_refactor_stream_config_kv/migration.sql`, `apps/server/src/lib/stream-config.ts`

**Why:** The current `StreamConfig` model is a single-row table (`id = 'cfg'`) with typed columns. Adding any new config field requires a schema migration. Convert it to a key:value structure identical to `CameraSettings` so future config additions are zero-migration.

**Prisma schema** — replace the existing `StreamConfig` model:

```prisma
model StreamConfig {
  key       String   @id
  value     String
  updatedAt DateTime @default(now()) @updatedAt @db.Timestamptz @map("updated_at")

  @@map("stream_config")
}
```

**Migration SQL** — must be hand-written (Prisma cannot auto-diff a structural retype). The SQL must:
1. Rename existing `stream_config` to a temp name
2. Create the new key/value `stream_config` table
3. Migrate any existing `adminToggle` row: `INSERT INTO stream_config (key, value) SELECT 'adminToggle', admin_toggle FROM <temp> WHERE id = 'cfg'`
4. Drop the temp table

Generate the migration shell with `pnpm --filter @manlycam/server exec prisma migrate dev --name refactor_stream_config_kv --create-only`, then fill in the SQL above.

**Wrapper lib** — create `apps/server/src/lib/stream-config.ts`:

```typescript
import { prisma } from '../db/client.js';

export const streamConfig = {
  async get(key: string, defaultValue: string): Promise<string> {
    const row = await prisma.streamConfig.findUnique({ where: { key } });
    return row?.value ?? defaultValue;
  },
  async getOrNull(key: string): Promise<string | null> {
    const row = await prisma.streamConfig.findUnique({ where: { key } });
    return row?.value ?? null;
  },
  async set(key: string, value: string | null): Promise<void> {
    if (value === null) {
      await prisma.streamConfig.deleteMany({ where: { key } });
    } else {
      await prisma.streamConfig.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }
  },
  async getMany(keys: string[]): Promise<Record<string, string | null>> {
    const rows = await prisma.streamConfig.findMany({ where: { key: { in: keys } } });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return Object.fromEntries(keys.map((k) => [k, map[k] ?? null]));
  },
};
```

Update `streamService.ts` to replace all existing `prisma.streamConfig` calls with the `streamConfig` wrapper (adminToggle reads/writes). No other files change in this task — keep scope to the refactor only.

---

### 1. Shared types — extend StreamState

**File:** `packages/types/src/ws.ts`

Add optional offline message fields to `StreamState` (populated by the server on `explicit-offline`, omitted on other states):

```typescript
export interface StreamState {
  state: 'live' | 'unreachable' | 'explicit-offline'
  adminToggle?: 'live' | 'offline'
  piReachable?: boolean
  offlineEmoji?: string | null
  offlineTitle?: string | null
  offlineDescription?: string | null
}
```

Rebuild: `pnpm --filter @manlycam/types build`

---

### 2. Server — streamService.ts

**File:** `apps/server/src/services/streamService.ts`

This task builds on Task 0 (wrapper already in place for adminToggle). Add:

- Private fields: `offlineEmoji: string | null = null`, `offlineTitle: string | null = null`, `offlineDescription: string | null = null`
- In `start()`: after reading `adminToggle` via `streamConfig.get(...)`, also call `streamConfig.getMany(['offlineEmoji', 'offlineTitle', 'offlineDescription'])` and assign to private fields
- In `getState()` when `explicit-offline`: include `offlineEmoji`, `offlineTitle`, `offlineDescription` in the returned object
- Change `setAdminToggle(toggle)` signature to `setAdminToggle(toggle: 'live' | 'offline', actorId: string)`. After persisting via `streamConfig.set('adminToggle', toggle)`, insert an AuditLog row:
  - `action: toggle === 'live' ? 'stream_start' : 'stream_stop'`, actorId, no targetId, no metadata
- Add `setOfflineMessage({ emoji, title, description, actorId })`:
  - Assigns to private fields
  - Calls `streamConfig.set(...)` for each of the three keys (null → deletes the key)
  - Inserts AuditLog: action `offline_message_update`, actorId, no targetId, metadata `{ emoji, title, description }`
  - Calls `this.broadcastState()`
- Add `getOfflineMessage()`: returns `{ emoji: this.offlineEmoji, title: this.offlineTitle, description: this.offlineDescription }`

---

### 3. Server — stream.ts routes

**File:** `apps/server/src/routes/stream.ts`

- `POST /api/stream/stop`: extract actorId from auth context (same pattern as admin moderation routes), pass to `setAdminToggle('offline', actorId)`
- `POST /api/stream/start`: same, pass to `setAdminToggle('live', actorId)`
- Add `GET /api/stream/offline-message` (`requireAuth`, `requireRole(Role.Admin)`): returns `streamService.getOfflineMessage()`
- Add `PATCH /api/stream/offline-message` (`requireAuth`, `requireRole(Role.Admin)`):
  - Zod body schema: `{ emoji: z.string().max(50).nullable(), title: z.string().max(100).nullable(), description: z.string().max(200).nullable() }`
  - Returns 422 on validation failure
  - Calls `streamService.setOfflineMessage({ ...body, actorId })`
  - Returns `{ ok: true }`

---

### 4. Web — Fluent emoji in RejectedView and BannedView

**Files:** `apps/web/src/views/RejectedView.vue`, `apps/web/src/views/BannedView.vue`

Replace each `<span>` unicode emoji with `<img>`:
- RejectedView: `<img src="/emojis/1f512.svg" aria-hidden="true" class="w-12 h-12" alt="" />`
- BannedView: `<img src="/emojis/1f6ab.svg" aria-hidden="true" class="w-12 h-12" alt="" />`

Match the visual size and opacity of the existing `text-5xl` spans (adjust class as needed for visual parity).

---

### 5. Web — useStream.ts

**File:** `apps/web/src/composables/useStream.ts`

Add three module-level refs: `offlineEmoji`, `offlineTitle`, `offlineDescription` (all `Ref<string | null>`, init `null`).

In `toClientState`, when `s.state === 'explicit-offline'`, assign `offlineEmoji.value = s.offlineEmoji ?? null` (same for title, description).

Include all three in the returned object.

---

### 6. Web — StateOverlay.vue

**File:** `apps/web/src/components/stream/StateOverlay.vue`

In the `explicit-offline` variant:
- Import `useStream` and `getEmojiUrl`
- Compute `emojiUrl = getEmojiUrl(offlineEmoji.value ?? '1f634')`
- Compute `displayTitle = offlineTitle.value || \`${petName} needs their Zzzs\``
- Compute `displayDescription = offlineDescription.value || 'The stream is offline for now. Check back later — they\'ll be back.'`
- Replace `<span class="text-5xl...">😴</span>` with `<img :src="emojiUrl" aria-hidden="true" alt="" class="w-12 h-12 opacity-70" />`
- Replace the two hardcoded `<p>` texts with `{{ displayTitle }}` and `{{ displayDescription }}`

---

### 7. Web — useOfflineMessage.ts (new composable)

**File:** `apps/web/src/composables/useOfflineMessage.ts`

```typescript
export const useOfflineMessage = () => {
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const fetchOfflineMessage = async (): Promise<{ emoji: string | null; title: string | null; description: string | null } | null> => { ... };

  const saveOfflineMessage = async (payload: { emoji: string | null; title: string | null; description: string | null }): Promise<boolean> => { ... };

  return { fetchOfflineMessage, saveOfflineMessage, isLoading, error };
};
```

Both functions use `apiFetch`. `saveOfflineMessage` returns `true` on success, `false` on error (sets `error.value`).

---

### 8. Web — OfflineMessageDialog.vue (new component)

**File:** `apps/web/src/components/stream/OfflineMessageDialog.vue`

Props: `open: boolean`. Emits: `update:open`.

Internal state: `draftEmoji: string | null`, `draftTitle: string`, `draftDescription: string`, `isSubmitting: boolean`.

On open (watch `open` true → fetch via `useOfflineMessage.fetchOfflineMessage()` → populate drafts).

Layout inside Dialog:
- Emoji row: `<img>` of current draft emoji (or `1f634` default), clicking it toggles EmojiPicker. Use existing `EmojiPicker.vue`. On emoji select: set `draftEmoji = emoji.codepoint`, close picker. EmojiPicker must have a z-index higher than the Dialog overlay.
- Title `<input>`: value = `draftTitle`, placeholder = default title text including petName from `getPetName()`
- Description `<input>`: value = `draftDescription`, placeholder = default description text
- Footer buttons (left-to-right): **Reset** | spacer | **Cancel** **Save**
  - Reset: calls `saveOfflineMessage({ emoji: null, title: null, description: null })`, closes on success
  - Cancel: closes without saving
  - Save: normalises (empty string → null), calls `saveOfflineMessage(...)`, closes on success

Use shadcn-vue `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `Button` components.

---

### 9. Web — BroadcastConsole.vue

**File:** `apps/web/src/components/stream/BroadcastConsole.vue`

- Import `SquarePen` from `lucide-vue-next` and `OfflineMessageDialog`
- Add `offlineMessageOpen = ref(false)`
- **Desktop admin block** (inside `v-if="isAdmin && isDesktop"`, after the stream toggle Tooltip): add a `TooltipProvider > Tooltip > TooltipTrigger > Button` (variant ghost, size icon, `SquarePen` icon, tooltip "Edit offline message") that sets `offlineMessageOpen = true`
- **Mobile profile popover admin block** (after the "Admin" button, before the closing `<div class="h-px..."/>`): add `<button v-if="!isDesktop" ...>Offline Message</button>` that closes the popover and sets `offlineMessageOpen = true`
- Render `<OfflineMessageDialog v-model:open="offlineMessageOpen" />` at the bottom of the template (same position as `<PreferencesDialog />`)

---

## File List

```
apps/server/prisma/schema.prisma
apps/server/prisma/migrations/<timestamp>_refactor_stream_config_kv/migration.sql
apps/server/src/lib/stream-config.ts
apps/server/src/services/streamService.ts
apps/server/src/routes/stream.ts
packages/types/src/ws.ts
apps/web/src/views/RejectedView.vue
apps/web/src/views/BannedView.vue
apps/web/src/composables/useStream.ts
apps/web/src/components/stream/StateOverlay.vue
apps/web/src/composables/useOfflineMessage.ts
apps/web/src/components/stream/OfflineMessageDialog.vue
apps/web/src/components/stream/BroadcastConsole.vue
```

Plus test files:
```
apps/server/src/lib/stream-config.test.ts
apps/server/src/services/streamService.test.ts
apps/server/src/routes/stream.test.ts
apps/web/src/composables/useStream.test.ts
apps/web/src/components/stream/StateOverlay.test.ts
apps/web/src/composables/useOfflineMessage.test.ts
apps/web/src/components/stream/OfflineMessageDialog.test.ts
apps/web/src/components/stream/BroadcastConsole.test.ts
apps/web/src/views/RejectedView.test.ts
apps/web/src/views/BannedView.test.ts
```

---

## Dev Agent Record

### Implementation Notes

- **Prisma migrate dev non-interactive**: `prisma migrate dev --create-only` fails in non-interactive environments. The migration directory and SQL were created manually instead.
- **Vite static `src` attribute in tests**: Using `<img src="/emojis/1f512.svg">` caused Vitest to fail with "Failed to resolve import" because Vite processes static `src` attributes as module imports. Fixed by switching to dynamic `:src` binding via `getEmojiUrl()` function in `<script setup>`. Both `RejectedView.vue` and `BannedView.vue` use `:src="lockEmojiUrl"` / `:src="noEntryEmojiUrl"` where the URL is computed in `<script setup>`.
- **shadcn-vue `DialogContent` non-inheritable attrs**: The `data-offline-dialog` test attribute could not be placed on `<DialogContent>` because `DialogContent` renders a `<Teleport>` root node — Vue cannot forward attrs to Teleport roots. Resolved by wrapping the dialog body in a `<div data-offline-dialog>` inside the slot.
- **Dialog Teleport in tests**: `OfflineMessageDialog.test.ts` uses `attachTo: document.body` and queries teleported content via `document.body.querySelector(...)` rather than `wrapper.find(...)`.
- **Watch trigger on initial mount**: The `watch(() => props.open, ...)` does not fire on initial mount with `open: true`. Tests mount with `open: false` then call `wrapper.setProps({ open: true })` to simulate the real transition.
- **`} finally {` V8 branch quirk**: Lines 23 and 41 of `useOfflineMessage.ts` (`} finally {`) show as partially-covered branches in V8 despite all execution paths being tested. This is a known V8 branch-tracking artifact with try/catch/finally; all overall coverage thresholds still pass.

### Quality Gates (2026-03-22)

**Server** (`apps/server`):
- `pnpm run typecheck` — ✅ zero errors (after `prisma generate`)
- `pnpm run lint` — ✅ zero errors (after `--fix`)
- `pnpm run test --coverage` — ✅ 29 files, 516 tests passing, thresholds met

**Web** (`apps/web`):
- `pnpm run typecheck` — ✅ zero errors
- `pnpm run lint` — ✅ zero errors (after `--fix`)
- `pnpm run test --coverage` — ✅ 62 files, 1200 tests passing (up from 1186), thresholds met (lines 98.4%, branches 94.01%, functions 87.26%)

### Smoke Test Required

The following UI interactions need manual smoke-test by Zikeji before story closure:
1. **RejectedView / BannedView**: Fluent emoji images render correctly (not broken-image icons)
2. **StateOverlay offline screen**: Default emoji/title/description display correctly with no saved config
3. **BroadcastConsole desktop**: `SquarePen` button visible for admin; tooltip shows "Edit offline message"; clicking opens OfflineMessageDialog
4. **BroadcastConsole mobile**: "Offline Message" entry appears in profile popover admin section; clicking opens OfflineMessageDialog
5. **OfflineMessageDialog**: Emoji picker works (can change emoji); save/cancel/reset all work correctly; saved values survive page reload

---

## Change Log

| Date | Change |
|------|--------|
| 2026-03-22 | Implementation complete; all quality gates pass; status set to ready-for-review |
