# Story 4.2: Chat History on Load and Infinite Scroll

Status: review

## Story

As an **authorized viewer**,
I want to see recent chat history when I open the page and load older messages by scrolling up,
so that I can catch up on what was said before I arrived.

## Acceptance Criteria

1. **Initial history load**
   - When `ChatPanel.vue` mounts, `useChat().initHistory()` is called (no `before` param)
   - This calls `GET /api/chat/history?limit=50` and prepends the returned messages to the module-level `messages` singleton (before any live WS messages already buffered)
   - After the initial history renders, the scroll area is pinned to the bottom — the user sees the newest messages first

2. **Infinite scroll — loading older messages**
   - A sentinel `<div>` at the top of the message list is observed with `IntersectionObserver`
   - When the sentinel enters the viewport and `hasMore` is `true` and `isLoadingHistory` is `false`, `loadOlderMessages()` is called
   - `loadOlderMessages()` calls `GET /api/chat/history?before={oldestMessageId}&limit=50`
   - Older messages are **prepended** above the current list
   - Scroll position is preserved — the user's view does not jump after prepend

3. **End of history**
   - When `hasMore` is `false` in the API response, no further fetches are triggered
   - The sentinel is removed from the DOM (or unobserved) so it cannot trigger more loads

4. **Loading indicator**
   - While `isLoadingHistory` is `true`, a loading indicator appears at the top of the message list
   - When loading completes, the indicator disappears

5. **Day-boundary delineators**
   - When two adjacent messages in the rendered list are from different calendar days (in the user's local timezone), a day-boundary label is rendered between them
   - Format: `"Tuesday, March 3"` using `Intl.DateTimeFormat` (weekday long, month long, day numeric)
   - Delineators are computed from the full `messages` array and update correctly as new messages arrive via WS or are prepended via history load

6. **Server endpoint**
   - `GET /api/chat/history` requires authentication (`requireAuth`)
   - Query params: `limit` (default `50`, max `100`), `before` (optional ULID cursor)
   - When `before` is absent: returns the latest `limit` messages
   - When `before` is present: returns `limit` messages with `id < before`
   - Response: `{ messages: ChatMessage[], hasMore: boolean }` where messages are ordered oldest-to-newest (ascending by `id`)
   - Soft-deleted messages (`deletedAt IS NOT NULL`) are excluded from results

7. **Tests**
   - `chatService.getHistory()` — unit tests: no cursor returns latest N; cursor returns older messages; excludes deleted; `hasMore` reflects whether more exist
   - `chat.ts` route — `GET /api/chat/history`: 200 with messages + hasMore; 401 unauthenticated; cursor pagination works
   - `useChat.ts` — unit tests: `initHistory()` populates messages; `loadMoreHistory()` prepends; `hasMore` goes false; `isLoadingHistory` toggled during fetch
   - `ChatPanel.vue` — unit tests: shows loading indicator; shows day delineators; sentinel triggers load; no double-fetch while loading

---

## Tasks / Subtasks

### Server

- [x] Task 1 — Add `getHistory()` to `apps/server/src/services/chatService.ts` (AC: #6)
  - [x] Signature: `getHistory(params: { limit?: number; before?: string }): Promise<{ messages: ChatMessage[]; hasMore: boolean }>`
  - [x] Clamp `limit` to 1–100, default 50
  - [x] When `before` provided: `WHERE id < before AND deleted_at IS NULL ORDER BY id DESC LIMIT limit+1`
  - [x] When no `before`: `WHERE deleted_at IS NULL ORDER BY id DESC LIMIT limit+1`
  - [x] Fetch `limit+1` rows — if you get `limit+1`, `hasMore = true`, slice to `limit`
  - [x] `include: { user: true }` on the Prisma query (same as `createMessage`) to populate `displayName`, `avatarUrl`, `userTagText`, `userTagColor`, `role`
  - [x] Map each row to `ChatMessage` shape using `computeUserTag()` — reuse the existing helper
  - [x] Reverse the array before returning so messages are ascending (oldest-to-newest)
  - [x] Return `{ messages, hasMore }`

- [x] Task 2 — Add `GET /api/chat/history` to `apps/server/src/routes/chat.ts` (AC: #6)
  - [x] Add alongside existing `POST /api/chat/messages` in the same `createChatRouter()`
  - [x] Apply `requireAuth`
  - [x] Parse query params: `limit` (integer, default 50, clamp to 1–100), `before` (string | undefined)
  - [x] Call `getHistory({ limit, before })` from `chatService`
  - [x] Return `200 { messages, hasMore }`

### Client

- [x] Task 3 — Extend `apps/web/src/composables/useChat.ts` (AC: #1, #2, #3, #4)
  - [x] Add module-level: `hasMore = ref(true)`, `isLoadingHistory = ref(false)`
  - [x] Add computed: `oldestMessageId` — `messages.value[0]?.id` (first item = oldest after prepend order)
  - [x] Add `initHistory(): Promise<void>`:
    - Guard: if `isLoadingHistory.value` return early
    - Set `isLoadingHistory.value = true`
    - Call `GET /api/chat/history?limit=50` via `apiFetch`
    - Prepend returned messages to front of `messages` (they arrive oldest-first; WS messages already in the array are more recent)
    - Set `hasMore.value` from response
    - Set `isLoadingHistory.value = false`
  - [x] Add `loadMoreHistory(): Promise<void>`:
    - Guard: if `isLoadingHistory.value || !hasMore.value` return early
    - Set `isLoadingHistory.value = true`
    - Call `GET /api/chat/history?limit=50&before=${oldestMessageId}` via `apiFetch`
    - **Prepend** returned messages to front of `messages.value` (messages.value = [...fetched, ...messages.value])
    - Set `hasMore.value` from response
    - Set `isLoadingHistory.value = false`
  - [x] Export: `{ messages, sendChatMessage, handleChatMessage, initHistory, loadMoreHistory, hasMore, isLoadingHistory }`

- [x] Task 4 — Add `formatDayLabel()` and `isSameDay()` to `apps/web/src/lib/dateFormat.ts` (AC: #5)
  - [x] `formatDayLabel(iso: string): string` — `Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(iso))`
  - [x] `isSameDay(a: string, b: string): boolean` — compare `getFullYear()`, `getMonth()`, `getDate()` on `new Date(a)` and `new Date(b)`

- [x] Task 5 — Update `apps/web/src/components/chat/ChatPanel.vue` (AC: #1–#5)
  - [x] Import `initHistory`, `loadMoreHistory`, `hasMore`, `isLoadingHistory` from `useChat()`
  - [x] On `onMounted`: call `await initHistory()`; after await, scroll to bottom
  - [x] Add a sentinel `ref<HTMLElement | null>` at the top of the scroll area and wire up `IntersectionObserver`:
    - Create observer in `onMounted`, observe sentinel; disconnect in `onUnmounted`
    - Callback: if `entry.isIntersecting && hasMore.value && !isLoadingHistory.value` → call `loadOlderMessages()`
  - [x] Add `loadOlderMessages()` which:
    1. Captures `scrollRef.value.scrollHeight` before fetch
    2. Calls `await loadMoreHistory()`
    3. After `await nextTick()`, adjusts `scrollRef.value.scrollTop += newScrollHeight - prevScrollHeight`
  - [x] Show loading indicator at top of message list when `isLoadingHistory` is `true` (simple spinner or `"Loading…"` text)
  - [x] Hide sentinel (`v-if="hasMore"`) once `hasMore` is false
  - [x] Add day-boundary delineator computed property: `listItems` — computed from `messages`, produces `Array<{ type: 'message'; data: ChatMessage } | { type: 'day'; label: string }>`
  - [x] Replace the `<ChatMessage v-for="message in messages">` loop with `<template v-for="item in listItems">` rendering either a day divider `<div>` or `<ChatMessage>`

- [x] Task 6 — Tests (AC: #7)
  - [x] `apps/server/src/services/chatService.test.ts` — add `getHistory` tests
  - [x] `apps/server/src/routes/chat.test.ts` — add GET /api/chat/history tests
  - [x] `apps/web/src/composables/useChat.test.ts` — add `initHistory`, `loadMoreHistory` tests
  - [x] `apps/web/src/lib/dateFormat.test.ts` — add `formatDayLabel`, `isSameDay` tests (create file if needed)
  - [x] `apps/web/src/components/chat/ChatPanel.test.ts` — add history/scroll/delineator tests

---

## Dev Notes

### Story 4-1 Learnings Applied

From Story 4-1 completion notes:
- **ScrollArea replaced with manual `<div class="overflow-y-auto">`** — `scrollRef` targets this div directly. Do NOT reintroduce ShadCN `<ScrollArea>` for this story. The `scrollRef.scrollTop` / `scrollHeight` manipulation in `loadOlderMessages()` depends on direct access to the scroll container.
- **Test isolation via `afterEach` unmount** — `ChatPanel.test.ts` must have `afterEach(() => { wrapper?.unmount(); })` to prevent cross-test watcher contamination from the module-level `messages` singleton.
- **Module-level singleton** — `messages`, `hasMore`, `isLoadingHistory` are module-level refs. Tests that modify these must reset them between test runs (`messages.value = []; hasMore.value = true; isLoadingHistory.value = false`).
- **`forceNextScroll` pattern** — already in `ChatPanel.vue` for own-send scroll. The `initHistory()` scroll-to-bottom on mount is separate: after `await initHistory()`, directly call `nextTick(() => { scrollRef.value.scrollTop = scrollRef.value.scrollHeight })`.

### Architecture Constraints

**Server — Prisma query pattern for keyset pagination**
```typescript
// getHistory in chatService.ts
const fetchLimit = Math.min(Math.max(limit ?? 50, 1), 100)
const rows = await prisma.message.findMany({
  where: {
    deletedAt: null,
    ...(before ? { id: { lt: before } } : {}),
  },
  orderBy: { id: 'desc' },
  take: fetchLimit + 1,        // fetch one extra to detect hasMore
  include: { user: true },
})

const hasMore = rows.length > fetchLimit
const messages = rows.slice(0, fetchLimit).map(toApiChatMessage).reverse()
// .reverse() converts desc→asc so client gets oldest-first
return { messages, hasMore }
```

**Why ULID for cursor works**: ULIDs are lexicographically sortable by creation time. `id < before` in string comparison correctly selects older messages. The Prisma `@id @db.Char(26)` ensures proper string comparison in PostgreSQL.

**Server — reuse `computeUserTag`**
The `computeUserTag(user)` function defined at module level in `chatService.ts` should be extracted/reused for `getHistory`. If it's currently not exported, either export it or define a local `toApiChatMessage(row)` helper that calls it — don't duplicate the logic.

**Client — `apiFetch` with query params**
`apiFetch` from `apps/web/src/lib/api.ts` takes a path string. Build the URL string manually:
```typescript
const url = before
  ? `/api/chat/history?limit=50&before=${before}`
  : '/api/chat/history?limit=50'
const data = await apiFetch<{ messages: ChatMessage[]; hasMore: boolean }>(url)
```

**Client — prepend race condition (WS messages vs. history)**
There is a subtle race: if a `chat:message` WS event arrives between the time `initHistory()` starts and finishes, `handleChatMessage` appends to `messages.value`. Then `initHistory()` prepends the history. This means the WS message appears between history messages and new messages — but since the WS message and the last history message are from approximately the same time, deduplication could be needed in future.

For Story 4-2, **do not add deduplication**. The race window is < 50ms on LAN and unlikely to produce visible duplicates. Flag it as a future improvement in the completion notes if it's observed during testing.

**Client — IntersectionObserver lifecycle**
```typescript
let observer: IntersectionObserver | null = null

onMounted(async () => {
  await initHistory()
  await nextTick()
  if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight

  observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && hasMore.value && !isLoadingHistory.value) {
      loadOlderMessages()
    }
  }, { threshold: 0.1 })

  if (sentinelRef.value) observer.observe(sentinelRef.value)
})

onUnmounted(() => {
  observer?.disconnect()
})
```

**Client — scroll position preservation on prepend**
```typescript
async function loadOlderMessages() {
  if (!scrollRef.value) return
  const prevScrollHeight = scrollRef.value.scrollHeight
  await loadMoreHistory()
  await nextTick()
  if (scrollRef.value) {
    // Shift scrollTop by the height of the newly prepended content
    scrollRef.value.scrollTop += scrollRef.value.scrollHeight - prevScrollHeight
  }
}
```
This is the canonical approach for chat infinite scroll — content is prepended above, and the scroll offset is adjusted by the delta so the user's visible content doesn't move.

**Client — `savedWasNearBottom` interaction**
`ChatPanel.vue` already has `savedWasNearBottom` for the tab-switch scroll restoration. The `loadOlderMessages` scroll adjustment is independent of this — it runs immediately after prepend, not on tab switch. These two mechanisms don't interfere.

**Client — day delineator computed property**
```typescript
import { formatDayLabel, isSameDay } from '@/lib/dateFormat'
import type { ChatMessage } from '@manlycam/types'

type ListItem =
  | { type: 'message'; data: ChatMessage }
  | { type: 'day'; label: string }

const listItems = computed<ListItem[]>(() => {
  const items: ListItem[] = []
  for (let i = 0; i < messages.value.length; i++) {
    const msg = messages.value[i]
    const prev = messages.value[i - 1]
    if (!prev || !isSameDay(prev.createdAt, msg.createdAt)) {
      items.push({ type: 'day', label: formatDayLabel(msg.createdAt) })
    }
    items.push({ type: 'message', data: msg })
  }
  return items
})
```

**Template rendering with day delineators**
```html
<!-- Replace the v-for on ChatMessage with this -->
<template v-for="(item, i) in listItems" :key="item.type === 'day' ? `day-${i}` : item.data.id">
  <div
    v-if="item.type === 'day'"
    class="flex items-center gap-2 px-3 py-2"
    role="separator"
    :aria-label="item.label"
  >
    <div class="flex-1 h-px bg-[hsl(var(--border))]" />
    <span class="text-xs text-muted-foreground whitespace-nowrap">{{ item.label }}</span>
    <div class="flex-1 h-px bg-[hsl(var(--border))]" />
  </div>
  <ChatMessage v-else :message="item.data" />
</template>
```

**Template: sentinel and loading indicator**
```html
<!-- At the TOP of the scroll content (inside role="log" div, before messages) -->
<div ref="sentinelRef" v-if="hasMore" class="h-1" aria-hidden="true" />
<div v-if="isLoadingHistory" class="flex justify-center py-2">
  <span class="text-xs text-muted-foreground">Loading…</span>
</div>
```

### `dateFormat.ts` additions

```typescript
export function formatDayLabel(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(iso))
}

export function isSameDay(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}
```

### Project Structure — Files to Modify

```
apps/server/src/
  services/
    chatService.ts    ← ADD: getHistory(), extract toApiChatMessage() helper
    chatService.test.ts ← ADD: getHistory tests

  routes/
    chat.ts           ← ADD: GET /api/chat/history route
    chat.test.ts      ← ADD: GET /api/chat/history tests

apps/web/src/
  composables/
    useChat.ts        ← ADD: initHistory, loadMoreHistory, hasMore, isLoadingHistory, oldestMessageId
    useChat.test.ts   ← ADD: history function tests

  lib/
    dateFormat.ts     ← ADD: formatDayLabel, isSameDay
    dateFormat.test.ts ← CREATE: tests for new functions (formatTime, initials already untested?)

  components/
    chat/
      ChatPanel.vue   ← ADD: IntersectionObserver, loadOlderMessages, listItems, day delineators, sentinel, loading indicator
      ChatPanel.test.ts ← ADD: history/scroll/delineator tests
```

No new files are required — only modifications to existing files.

### Story Boundary — What Is NOT in Scope

| Feature | Story |
|---|---|
| Message grouping (continuation messages) | 4-3 |
| Sidebar collapse/expand, unread badge | 4-4 |
| Message edit/delete | 4-5 |
| Viewer presence list, typing indicator | 4-6 |
| WS deduplication on history/real-time race | Future improvement |

### Testing Approach

**Server tests** — mock Prisma, verify:
- `getHistory()` no cursor: Prisma called with `{ where: { deletedAt: null }, orderBy: { id: 'desc' }, take: 51, include: { user: true } }`
- `getHistory()` with cursor: `where` includes `{ id: { lt: cursor } }`
- Returns ascending messages (last in array has newest `createdAt`)
- `hasMore: true` when 51 rows fetched; `hasMore: false` when ≤ 50
- Route: `GET /api/chat/history` → 200; without auth → 401
- `before` query param threaded through to service

**Client tests** — mock `apiFetch`, test behavior not implementation:
- `initHistory()`: messages populated from response; `hasMore` set; `isLoadingHistory` is false after
- `loadMoreHistory()`: messages prepended (older messages first); guard prevents concurrent fetches
- `ChatPanel`: delineators appear for messages on different days; loading indicator shows during fetch; `hasMore: false` removes sentinel

**Test isolation note**: Module-level `hasMore` and `isLoadingHistory` are refs shared across tests. Add reset in `beforeEach`:
```typescript
beforeEach(() => {
  vi.clearAllMocks()
  messages.value = []
  hasMore.value = true
  isLoadingHistory.value = false
})
```
If these refs are not exported from `useChat.ts`, export them directly for test reset. Don't use `useChat()` to reset — call `ref.value = ...` directly.

### References

- Epic 4-2 story requirements: [Source: `_bmad-output/planning-artifacts/epics.md` §Story 4.2]
- Architecture — chat history pagination: [Source: `_bmad-output/planning-artifacts/architecture.md` §Chat History Pagination — keyset/cursor pagination, before={ulid}, hasMore]
- Architecture — REST surface: [Source: `_bmad-output/planning-artifacts/architecture.md` §REST Surface — `GET /api/chat/history`]
- Architecture — chat schema: [Source: `_bmad-output/planning-artifacts/architecture.md` §Chat Message Schema]
- UX spec — empty/loading states: [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` §Empty States & Loading States]
- Current `useChat.ts`: [Source: `apps/web/src/composables/useChat.ts`]
- Current `ChatPanel.vue` (scroll management, tab handling): [Source: `apps/web/src/components/chat/ChatPanel.vue`]
- Current `chatService.ts` (computeUserTag, createMessage): [Source: `apps/server/src/services/chatService.ts`]
- Current `chat.ts` route: [Source: `apps/server/src/routes/chat.ts`]
- `dateFormat.ts`: [Source: `apps/web/src/lib/dateFormat.ts`]
- Story 4-1 completion notes (ScrollArea replacement, test isolation): [Source: `_bmad-output/implementation-artifacts/4-1-chat-panel-message-sending-and-real-time-delivery.md` §Completion Notes List]
- ULID pattern in Prisma: [Source: `apps/server/prisma/schema.prisma` — `@id @db.Char(26)`]
- Prisma singleton: [Source: `apps/server/src/db/client.ts`]
- `apiFetch`: [Source: `apps/web/src/lib/api.ts`]

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- One test fix: `chatService.test.ts` `makeRow` helper used `String(i).padStart(2,'0')` for hours — invalid for i > 23. Fixed to use base timestamp + `i * 60000` ms offset.
- One test fix: `ChatPanel.test.ts` sentinel test used `[aria-hidden="true"]` selector which matched other component elements. Fixed by adding `data-testid="scroll-sentinel"` to the sentinel element and querying by that.

### Completion Notes List

- Extracted `toApiChatMessage()` helper from `createMessage()` in `chatService.ts` to eliminate code duplication between `createMessage` and `getHistory`. Both now call the same mapping function.
- `getHistory()` uses keyset cursor pagination via ULID lexicographic ordering (`id < before`). Fetches `limit+1` rows to detect `hasMore` without a separate COUNT query.
- `IntersectionObserver` setup deferred until after `initHistory()` resolves so the sentinel is in the correct DOM position. This avoids the observer firing immediately on mount before history is loaded.
- Empty state ("Be the first to say something") now hidden during initial history load (`isLoadingHistory`) to avoid flash before history arrives.
- WS deduplication (race between initHistory and incoming WS messages) intentionally deferred per story spec — flagged here for Story 4.x backlog.
- `data-testid="scroll-sentinel"` added to sentinel element for precise test targeting (avoids collision with other `aria-hidden` elements in the component tree).

### File List

- `apps/server/src/services/chatService.ts` — added `toApiChatMessage()` helper, `getHistory()` function; refactored `createMessage()` to use helper
- `apps/server/src/routes/chat.ts` — added `GET /api/chat/history` route with `requireAuth`, query param parsing, clamping
- `apps/server/src/services/chatService.test.ts` — added 9 `getHistory` tests; updated mock to include `findMany`
- `apps/server/src/routes/chat.test.ts` — added 6 `GET /api/chat/history` tests; updated mock to include `getHistory`
- `apps/web/src/composables/useChat.ts` — added `hasMore`, `isLoadingHistory`, `oldestMessageId`, `initHistory()`, `loadMoreHistory()`; updated exports
- `apps/web/src/lib/dateFormat.ts` — added `formatDayLabel()` and `isSameDay()`
- `apps/web/src/lib/dateFormat.test.ts` — created; tests for `formatTime`, `initials`, `formatDayLabel`, `isSameDay`
- `apps/web/src/components/chat/ChatPanel.vue` — added `sentinelRef`, `IntersectionObserver`, `loadOlderMessages()`, `listItems` computed, day delineators, loading indicator, `onMounted`/`onUnmounted` lifecycle hooks
- `apps/web/src/composables/useChat.test.ts` — added 11 tests for `initHistory` and `loadMoreHistory`
- `apps/web/src/components/chat/ChatPanel.test.ts` — added 10 tests for history, loading indicator, sentinel, delineators; added `IntersectionObserver` global mock

### Change Log

- 2026-03-09: Implemented story 4-2 — chat history on load and infinite scroll. Added server `getHistory()` + `GET /api/chat/history` endpoint; client `initHistory`/`loadMoreHistory` in useChat; `formatDayLabel`/`isSameDay` in dateFormat; ChatPanel updated with IntersectionObserver-based infinite scroll, day delineators, and loading indicator. 337 tests passing (141 server, 196 web). TypeScript and lint clean.
