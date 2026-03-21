# Story 9-3: Audit Log Viewer

Status: ready-for-dev

## Story

As an **admin**,
I want to view a paginated log of all moderation actions in the web UI,
So that I can review what happened, who acted, and when — without database access.

## Acceptance Criteria

1. **Given** Story 9-3 is being implemented, **Then** the shadcn-vue `table` base component is added via CLI (`npx shadcn-vue@latest add table`) and `@tanstack/vue-table` is installed as a dependency in `apps/web`.

2. **Given** the shadcn-vue table and TanStack Table are installed, **Then** a reusable `DataTable.vue` wrapper is created in `apps/web/src/components/ui/data-table/` following the shadcn-vue data table pattern, supporting sorting, pagination, and a configurable empty-state slot.

3. **Given** the audit log table is rendered, **Then** it uses TanStack Table column definitions with columns: Action (human-readable label badge), Actor (display name), Target (display name or identifier, or `—` if none), Timestamp (formatted local date+time), Metadata (condensed summary string or `—` if empty).

4. **Given** the audit log table is rendered, **Then** it is sorted by Timestamp descending by default.

5. **Given** the audit log table is visible, **When** I click a sortable column header, **Then** TanStack Table's built-in sort toggles: ascending → descending → unsorted.

6. **Given** there are more than 50 audit log entries, **Then** the table shows 50 rows per page, a pagination control shows current page info (e.g. "Page 1 of N"), and `GET /api/admin/audit-log?cursor=<ulid>&limit=50` drives each subsequent page in descending `performedAt` order.

7. **Given** an audit log entry with a raw action string, **Then** it is rendered as a human-readable badge: `message_delete` → "Message Deleted", `mute` → "User Muted", `unmute` → "User Unmuted", `ban` → "User Banned", `unban` → "User Unbanned" (action string added by Story 9-4 — pre-mapped here so the viewer is ready), `reaction_remove` → "Reaction Removed". Unknown actions fall back to the raw string.

8. **Given** no moderation actions have been logged, **Then** an empty-state message reads: "No moderation actions recorded yet."

9. **Given** a non-Admin user (including Moderator) calls `GET /api/admin/audit-log`, **Then** the server returns 403 — Moderators cannot access the audit log.

10. **Given** the admin opens the audit log, **Then** the table is accessible inside a dedicated "Audit Log" section of the admin panel (new tab or section — see Dev Notes).

## Tasks / Subtasks

- [ ] Task 1: Install dependencies (AC: #1)
  - [ ] Subtask 1.1: Run `pnpm add @tanstack/vue-table` in `apps/web`
  - [ ] Subtask 1.2: Run `npx shadcn-vue@latest add table` in `apps/web` (generates `apps/web/src/components/ui/table/`)
  - [ ] Subtask 1.3: Verify table component files landed in `apps/web/src/components/ui/table/` and `index.ts` exists

- [ ] Task 2: Create reusable DataTable.vue component (AC: #2, #5)
  - [ ] Subtask 2.1: Create `apps/web/src/components/ui/data-table/DataTable.vue`
  - [ ] Subtask 2.2: Create `apps/web/src/components/ui/data-table/index.ts` (named export only)
  - [ ] Subtask 2.3: Accept `columns`, `data`, `pageSize` props; expose sort state and pagination via TanStack Table's `useVueTable`
  - [ ] Subtask 2.4: Render shadcn-vue `Table` / `TableHeader` / `TableBody` / `TableRow` / `TableHead` / `TableCell` primitives
  - [ ] Subtask 2.5: Emit or expose pagination callbacks (`nextPage`, `prevPage`, `canNextPage`, `canPrevPage`, `pageIndex`)
  - [ ] Subtask 2.6: Accept `emptyMessage` prop (string) for the empty-state row

- [ ] Task 3: Create `auditLogService.ts` and server route (AC: #6, #9)
  - [ ] Subtask 3.1: Create `apps/server/src/services/auditLogService.ts` with one export: `getAuditLogPage({ cursor, limit }: { cursor?: string; limit: number })` — this function owns all Prisma access for audit log queries; the route calls the service, not Prisma directly (consistent with how all other admin routes call service functions and mock them in tests)
  - [ ] Subtask 3.2: Inside `getAuditLogPage`: validate `limit` — clamp to `Math.min(limit, 50)` and `Math.max(limit, 1)`; validate `cursor` format if provided (must be a 26-character alphanumeric ULID) — throw `AppError` 422 on invalid cursor
  - [ ] Subtask 3.3: Query using `orderBy: { id: 'desc' }` only (ULIDs are time-ordered; single-key sort avoids tie-collision bugs with two-key sort + `id`-only cursor); apply cursor as `id: { lt: cursor }` if provided; `include: { actor: { select: { displayName: true } } }`
  - [ ] Subtask 3.4: Map Prisma result to flat `AuditLogEntry[]`: `entries.map(e => ({ id: e.id, action: e.action, actorId: e.actorId, actorDisplayName: e.actor.displayName, targetId: e.targetId, metadata: e.metadata, performedAt: e.performedAt.toISOString() }))` — do NOT return the nested `actor` object
  - [ ] Subtask 3.5: Return `{ entries: AuditLogEntry[], nextCursor: string | null }` where `nextCursor` is `entries[entries.length - 1].id` if `entries.length === limit`, else `null`
  - [ ] Subtask 3.6: Add `GET /audit-log` handler in `createAdminRouter()` that calls `getAuditLogPage(...)` and returns the result; parse `cursor` and `limit` from query params; return 200; the route inherits `requireRole(Role.Admin)` from `router.use('*', ...)`
  - [ ] Subtask 3.7: Create `apps/server/src/services/auditLogService.test.ts` — test `getAuditLogPage` with mocked Prisma; test: returns entries in id-desc order, cursor filtering, limit clamping, invalid cursor 422, empty result

- [ ] Task 4: Create useAuditLog composable (AC: #6, #8)
  - [ ] Subtask 4.1: Create `apps/web/src/composables/useAuditLog.ts`
  - [ ] Subtask 4.2: Expose `entries` (ref array), `isLoading`, `error`, `hasMore` (boolean), `fetchInitial()`, `fetchNextPage()`
  - [ ] Subtask 4.3: `fetchInitial()` — GET `/api/admin/audit-log?limit=50`, sets entries; `fetchNextPage()` appends using cursor from last entry id
  - [ ] Subtask 4.4: Track `nextCursor` internally; set `hasMore = false` when server returns `nextCursor: null`
  - [ ] **Note:** `useAuditLog` intentionally does NOT include `onMounted` — unlike `useAdminUsers`, this composable is dialog-gated. `AuditLogTable.vue` (the component that uses this composable) calls `fetchInitial()` in its own `onMounted` so data only loads when the dialog is first opened. Do not add `onMounted` to the composable itself.

- [ ] Task 5: Create AuditLogTable.vue component (AC: #3, #4, #7, #8, #10)
  - [ ] Subtask 5.1: Create `apps/web/src/components/admin/AuditLogTable.vue`
  - [ ] Subtask 5.2: Use `useAuditLog` composable; call `fetchInitial()` in `AuditLogTable.vue`'s own `onMounted` (NOT in the composable — see Task 4 Note)
  - [ ] Subtask 5.3: Define TanStack Table column definitions for: Action (badge), Actor, Target, Timestamp, Metadata
  - [ ] Subtask 5.4: Use `DataTable.vue` with these columns; pass `emptyMessage="No moderation actions recorded yet."`
  - [ ] Subtask 5.5: Implement `ACTION_LABELS` map: `message_delete→"Message Deleted"`, `mute→"User Muted"`, `unmute→"User Unmuted"`, `ban→"User Banned"`, `unban→"User Unbanned"`, `reaction_remove→"Reaction Removed"`; fallback to raw action string for unknowns
  - [ ] Subtask 5.6: Format Timestamp with date + time (e.g. `"Mar 19, 2026, 3:45 PM"`) using `Intl.DateTimeFormat` — NOT just `formatTime()` from `dateFormat.ts` (that is time-only)
  - [ ] Subtask 5.7: Pass `hasMore` from `useAuditLog` as a prop to `DataTable.vue` (add `hasMore?: boolean` prop); when TanStack Table is on its last accumulated page AND `hasMore === true`, `DataTable.vue` renders a "Load more" button below the table that emits `loadMore`; `AuditLogTable.vue` listens to `loadMore` and calls `fetchNextPage()`. **Note:** client-side sort (AC #5) operates on the accumulated entries array only — sorting after multiple cursor pages are loaded may produce a page-boundary discontinuity (older entries from page N+1 interleaved with newer from page N). This is a known MVP limitation and does not need to be fixed.
  - [ ] Subtask 5.8: Show loading spinner on initial fetch

- [ ] Task 6: Add Audit Log tab to AdminDialog (AC: #10)
  - [ ] Subtask 6.1: Add "Audit Log" as third tab in `AdminDialog.vue` (after Users, Allowlist)
  - [ ] Subtask 6.2: The Audit Log tab renders `AuditLogTable` component
  - [ ] Subtask 6.3: No additional trigger needed in BroadcastConsole — the existing "Admin" button (renamed from "Users" in Story 9-2) opens AdminDialog with all three tabs accessible
  - [ ] Subtask 6.4: Update `AdminDialog.test.ts` to verify Audit Log tab renders `AuditLogTable`

- [ ] Task 7: Tests (AC: All)
  - [ ] Subtask 7.1: `apps/server/src/routes/admin.test.ts` — add tests for `GET /api/admin/audit-log`: 403 for non-Admin, 200 with entries, cursor pagination, empty result. **Follow the existing mock pattern:** add `vi.mock('../services/auditLogService.js', () => ({ getAuditLogPage: vi.fn() }))` alongside the existing `vi.mock('../services/userService.js', ...)` — do NOT mock Prisma directly. The existing admin.test.ts uses service mocks throughout; the audit log route must follow the same pattern (which is why `getAuditLogPage` lives in a service file, not inline in the route).
  - [ ] Subtask 7.2: `apps/web/src/composables/useAuditLog.test.ts` — test fetchInitial, fetchNextPage, hasMore tracking, error handling
  - [ ] Subtask 7.3: `apps/web/src/components/ui/data-table/DataTable.test.ts` — test column rendering, sort toggling, empty state, pagination controls
  - [ ] Subtask 7.4: `apps/web/src/components/admin/AuditLogTable.test.ts` — test action label mapping (all 6 known: `message_delete`, `mute`, `unmute`, `ban`, `unban`, `reaction_remove` + unknown fallback), empty state message, timestamp format
  - [ ] Subtask 7.5: `apps/server/src/routes/admin.test.ts` — also assert that `limit` is clamped to 50 when a larger value is passed
  - [ ] Subtask 7.6: `apps/web/src/components/admin/AdminDialog.test.ts` — add test for Audit Log tab rendering `AuditLogTable`

## Dev Notes

### Critical: Actual Audit Log Action Strings

The epics file uses examples like `chat:delete`, `user:ban`, `user:mute` — **these are NOT the actual strings in the database.** The real action strings recorded by the server are:

| Service                                                   | Action string stored in `audit_log.action` |
| --------------------------------------------------------- | ------------------------------------------ |
| `chatService.ts` (`deleteMessage`)                        | `message_delete`                           |
| `moderationService.ts` (`muteUser`)                       | `mute`                                     |
| `moderationService.ts` (`unmuteUser`)                     | `unmute`                                   |
| `moderationService.ts` (`banUser`)                        | `ban`                                      |
| `reactionsService.ts` (`modRemoveReaction`)               | `reaction_remove`                          |
| `moderationService.ts` (`unbanUser`) — added in Story 9-4 | `unban`                                    |

Map these exactly in `ACTION_LABELS`. Do not invent new strings.

### DataTable.vue — Design Intent (Bootstrapping for Story 9-4)

This component is the **primary deliverable** of Story 9-3 and will be reused by Story 9-4 (Users List Enhancements). Design it generically.

**Important:** Vue 3.3+ generic component syntax is required for typed props. Use `generic="TData, TValue"` on `<script setup>`:

```vue
<script setup lang="ts" generic="TData, TValue">
import type { ColumnDef } from '@tanstack/vue-table';

interface Props {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pageSize?: number;
  emptyMessage?: string;
  hasMore?: boolean; // for audit log "Load more" flow
}
const props = withDefaults(defineProps<Props>(), {
  pageSize: 10,
  emptyMessage: 'No data.',
  hasMore: false,
});
const emit = defineEmits<{ loadMore: [] }>();
</script>
```

Without `generic="TData, TValue"` on the `<script setup>` tag, TypeScript will reject generic type parameters in `defineProps`.

Use `@tanstack/vue-table`'s `useVueTable` composable with `getCoreRowModel`, `getSortingRowModel`, `getPaginationRowModel`. Wire the shadcn-vue `Table` component family for rendering.

The component handles **client-side pagination of the loaded entries array**. When TanStack Table is on its last page and `hasMore === true`, render a "Load more" button that `emit('loadMore')`. The `useAuditLog` composable handles fetching more pages from the server.

**Expose for tests:** Use `defineExpose({ table })` to expose the TanStack Table instance for unit tests that need to verify sort/filter state.

### Pagination Strategy Decision

The epics spec (AC #6) says `GET /api/admin/audit-log?cursor=<ulid>&limit=50` drives each page. The implementation should:

1. `useAuditLog` fetches pages of 50, accumulating all entries into a single flat array.
2. `DataTable.vue` uses TanStack Table's built-in pagination (client-side) on that accumulated array.
3. When TanStack Table reaches the last page of accumulated data AND `hasMore === true`, show a "Load more" button to fetch next 50 from server.

This matches the epics requirement for cursor pagination while using TanStack Table's built-in pagination UI.

### Where to Surface the Audit Log in the UI

The admin UI structure (after Story 9-2):

- `CameraControlsPanel.vue` — left-side camera controls sidebar (desktop only)
- `AdminDialog.vue` — tabbed modal dialog with: Users, Allowlist, Audit Log tabs

**Approach:** Add "Audit Log" as the third tab in `AdminDialog.vue`. The existing "Admin" button in `BroadcastConsole.vue` profile popover (renamed from "Users" in Story 9-2) opens this dialog. No separate `AuditLogDialog.vue` needed — all admin functions consolidated into one dialog.

### Server Route — `auditLogService.ts` Pattern

All Prisma access lives in `apps/server/src/services/auditLogService.ts`. The route in `admin.ts` calls `getAuditLogPage(...)` and returns the result. This enables service-level mocking in `admin.test.ts` — consistent with how all other admin routes work (e.g., `getSessionUser`, `getAllUsers` are mocked from `userService`).

**Why single-key sort (`id DESC` only):** Two-key sort `[performedAt DESC, id DESC]` combined with cursor `id < cursor` produces incorrect pagination when two records share the same `performedAt` (ties). Single-key `id DESC` with `id < cursor` is always correct because ULID IDs are monotonically increasing within a process (time-embedded), making them a reliable sort and cursor key.

Cursor pagination query:

```typescript
const rows = await prisma.auditLog.findMany({
  where: cursor ? { id: { lt: cursor } } : undefined,
  orderBy: { id: 'desc' },
  take: limit,
  include: { actor: { select: { displayName: true } } },
});
// Flatten nested actor to actorDisplayName
const entries = rows.map((e) => ({
  id: e.id,
  action: e.action,
  actorId: e.actorId,
  actorDisplayName: e.actor.displayName,
  targetId: e.targetId,
  metadata: e.metadata,
  performedAt: e.performedAt.toISOString(),
}));
const nextCursor = entries.length === limit ? entries[entries.length - 1].id : null;
```

### Timestamp Formatting

The Timestamp column must show **date + time** in local timezone. The existing `formatTime()` in `apps/web/src/lib/dateFormat.ts` is time-only (hour + minute). Use a new inline formatter or add `formatDateTime()` to `dateFormat.ts`:

```typescript
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}
```

### API Response Shape

```typescript
// Server returns:
interface AuditLogEntry {
  id: string; // ULID
  action: string; // e.g. "message_delete", "ban"
  actorId: string;
  actorDisplayName: string; // joined from actor.displayName
  targetId: string | null;
  metadata: unknown | null; // JSON object or null
  performedAt: string; // ISO timestamp
}

interface AuditLogResponse {
  entries: AuditLogEntry[];
  nextCursor: string | null;
}
```

### Metadata Summary

The `metadata` column displays a condensed string. For the existing actions, metadata is always `null` (no server code sets it). Render `—` for null. If metadata is a non-null object, render `JSON.stringify(metadata)` truncated to 80 characters.

### Target Column — reaction_remove Composite ID

For `reaction_remove` entries, `reactionsService.ts` stores `targetId` as a composite string `"${messageId}:${targetUserId}:${emoji}"` — not a plain user ID. The Target column should render this raw composite string as-is (it is the best available identifier for that action). Do not attempt to resolve it to a display name.

### apiFetch Pattern

Use `apiFetch<AuditLogResponse>('/api/admin/audit-log?...')` from `apps/web/src/lib/api.ts` — the same pattern used in `useAdminUsers.ts`. Always `credentials: 'include'` is set by `apiFetch` automatically.

### Named Exports

All source files use named exports only. `DataTable.vue` must export from `index.ts`:

```typescript
// apps/web/src/components/ui/data-table/index.ts
export { default as DataTable } from './DataTable.vue';
```

**Note:** Vue SFCs compiled by Vite emit a `default` export internally. The `export { default as DataTable }` re-export in `index.ts` is the standard shadcn-vue pattern for re-exporting Vue SFC components as named exports — it is NOT a violation of CLAUDE.md's "no `export default` in source files" rule (which targets hand-written `.ts` source files, not SFC compiler output). The `index.ts` itself only re-exports and has no default export.

The `table` shadcn-vue component will generate its own `index.ts` — do not modify it.

### AdminDialog.vue — Adding Audit Log Tab

After Story 9-2 converts `AdminDialog.vue` to a tabbed dialog, add the Audit Log tab as the third tab:

```vue
<TabsList class="px-6 pt-2 shrink-0">
  <TabsTrigger value="users">Users</TabsTrigger>
  <TabsTrigger value="allowlist">Allowlist</TabsTrigger>
  <TabsTrigger value="audit-log">Audit Log</TabsTrigger>
</TabsList>
<!-- ... existing Users and Allowlist TabsContent ... -->
<TabsContent value="audit-log" class="flex-1 overflow-hidden m-0">
  <AuditLogTable />
</TabsContent>
```

The dialog is opened via the "Admin" button in `BroadcastConsole.vue`'s profile popover (renamed from "Users" in Story 9-2).

### Client-Side Role Gating

Task 6 Subtask 6.2 says to gate the audit log trigger on `user.value?.role === Role.Admin`. This is an inline role comparison in a Vue component — an acceptable pattern for **client-side UI gating only**. The server enforces RBAC on the actual API endpoint (403 for non-Admin). Do not import `canModerateOver` or `ROLE_RANK` into Vue components — those are server-side utilities. The CLAUDE.md anti-pattern rule ("never inline role comparisons") applies to server-side RBAC logic, not client-side display gating.

### `targetId` Schema Note

The `AuditLog.targetId` field in the Prisma schema is `String?` with no `@db.Char(26)` length constraint — this is **intentional**. The `reaction_remove` action stores a composite string `"${messageId}:${targetUserId}:${emoji}"` which exceeds 26 characters. Do not add a length constraint.

### No Migration Required

The `AuditLog` model and `audit_log` table already exist in the Prisma schema (added in Epic 5 stories). No `prisma migrate` step is needed in this story.

### Testing Patterns

**Server route tests** (`admin.test.ts`) — follow existing pattern: mount a test Hono app with `createAdminRouter()`, mock `auditLogService.js` via `vi.mock` alongside the existing `userService.js` mock. The route calls `getAuditLogPage` from the service — mock that function with `vi.fn()` and control its return value per test. Do NOT mock Prisma in route tests. Service-level Prisma mocking happens in `auditLogService.test.ts`.

**Web tests** — follow the `useAdminUsers.test.ts` pattern for composable tests. For Vue component tests, use the `afterEach(() => { wrapper?.unmount(); wrapper = null; })` cleanup pattern required by CLAUDE.md.

**Coverage note:** `DataTable.vue` is in `apps/web/src/components/ui/` which is excluded from web coverage (`src/components/ui/**` exclusion in `vite.config.ts`). Tests for `DataTable.vue` should still be written but won't affect coverage thresholds. `AuditLogTable.vue` is in `src/components/admin/` — it IS included in coverage.

### ESLint and TypeScript

- Run `pnpm run typecheck` from `apps/web` and `apps/server` before marking done
- `@tanstack/vue-table` ships its own TypeScript types — no `@types/` package needed
- The `ColumnDef` type from `@tanstack/vue-table` is generic; ensure the column accessor key strings match the data shape

## File List

- `apps/web/package.json` — add `@tanstack/vue-table`
- `apps/web/src/components/ui/table/` — generated by shadcn-vue CLI (all files)
- `apps/web/src/components/ui/data-table/DataTable.vue` — new
- `apps/web/src/components/ui/data-table/index.ts` — new
- `apps/web/src/components/ui/data-table/DataTable.test.ts` — new
- `apps/web/src/composables/useAuditLog.ts` — new
- `apps/web/src/composables/useAuditLog.test.ts` — new
- `apps/web/src/components/admin/AuditLogTable.vue` — new
- `apps/web/src/components/admin/AuditLogTable.test.ts` — new
- `apps/web/src/components/admin/AdminDialog.vue` — modified (add Audit Log tab)
- `apps/web/src/components/admin/AdminDialog.test.ts` — modified (add Audit Log tab tests)
- `apps/web/src/lib/dateFormat.ts` — modified (add `formatDateTime` export)
- `apps/web/src/lib/dateFormat.test.ts` — modified (add test for `formatDateTime`)
- `apps/server/src/services/auditLogService.ts` — new
- `apps/server/src/services/auditLogService.test.ts` — new
- `apps/server/src/routes/admin.ts` — modified (add `GET /audit-log` handler)
- `apps/server/src/routes/admin.test.ts` — modified (add audit-log route tests)

## References

- Epics: `_bmad-output/planning-artifacts/epics.md` — Story 9-3 (line ~2126), Story PM-1 (line ~1658), Epic 9 overview (line ~407)
- Prisma schema: `apps/server/prisma/schema.prisma` — `AuditLog` model (line 89)
- Server admin routes: `apps/server/src/routes/admin.ts`
- Server admin tests: `apps/server/src/routes/admin.test.ts`
- Audit log action strings: `apps/server/src/services/moderationService.ts`, `chatService.ts`, `reactionsService.ts`
- Composable pattern: `apps/web/src/composables/useAdminUsers.ts`
- API fetch utility: `apps/web/src/lib/api.ts`
- Date format utilities: `apps/web/src/lib/dateFormat.ts`
- Existing shadcn-vue UI components: `apps/web/src/components/ui/`
- UserManagerDialog pattern: `apps/web/src/components/admin/AdminDialog.vue`
- BroadcastConsole (profile popover): `apps/web/src/components/stream/BroadcastConsole.vue`
- Web coverage config: `apps/web/vite.config.ts` (test.coverage section)
- CLAUDE.md project rules (Vue test cleanup, named exports, apiFetch pattern, no default exports)
