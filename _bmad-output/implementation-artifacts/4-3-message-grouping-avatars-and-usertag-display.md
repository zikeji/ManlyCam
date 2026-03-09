# Story 4.3: Message Grouping, Avatars, and UserTag Display

Status: done

## Story

As a **viewer**,
I want to see who sent each message with their avatar, name, and any UserTag,
so that I can tell coworkers apart at a glance and understand their context.

## Acceptance Criteria

1. **Message grouping — continuation messages**
   - Consecutive messages from the same sender, with no day boundary between them, and sent within `GROUP_WINDOW_MS` (5 minutes) of each other are grouped
   - The first message in a group shows: avatar (circular, `h-8 w-8` ~32px), display name (`text-sm font-semibold`), UserTag pill (if `userTag !== null`), and timestamp
   - Continuation messages (same sender, same group window, no day break) show only the message body — no avatar, no name, no tag
   - Continuation messages are indented to align their text with the first message body (`pl-[52px]` = 12px padding + 32px avatar + 8px gap)

2. **Group break conditions**
   - A new group always starts when the sender changes
   - A day boundary delineator always forces a new group (even if the same sender continues)
   - A new group starts when more than `GROUP_WINDOW_MS` (5 minutes) have elapsed since the previous message from that sender

3. **Avatar rendering**
   - When `avatarUrl` is a valid image URL, `<AvatarImage>` renders it with `referrerpolicy="no-referrer"`
   - When the image fails to load (or `avatarUrl` is null), `<AvatarFallback>` renders initials derived from `displayName` via `initials()` from `@/lib/dateFormat`

4. **UserTag display**
   - When a message's `userTag` is not null, a pill is rendered inline after the display name using the provided `color` as a translucent tinted background
   - When `userTag` is null, no tag element is rendered — `<ChatMessage>` renders the prop directly with no role logic

5. **Hover background on message rows**
   - Both group-header rows and continuation rows show a subtle hover background (`hover:bg-white/[.03]`)

6. **user:update WS handling**
   - When `{ type: 'user:update', payload: UserProfile }` is received via WebSocket
   - `useChat().handleUserUpdate(profile)` is called
   - All messages in `messages.value` where `msg.userId === profile.id` are updated in-place: `displayName`, `avatarUrl`, and `userTag` reflect the new `UserProfile` values
   - Vue reactivity triggers a re-render of affected `<ChatMessage>` instances
   - **Scope note:** The epics AC also mentions updating the "presence entry" for that user — but the presence list/Viewers tab is not implemented yet (Story 4-6 scope). This story only handles the chat messages update.

7. **Server-side computeUserTag — already correct, no changes needed**
   - `computeUserTag(user)` in `chatService.ts` already implements: custom `userTagText` → `{ text, color }`; `ViewerGuest` role → `{ text: 'Guest', color: '#9CA3AF' }`; else → `null`
   - Both `createMessage` and `getHistory` already call `computeUserTag` via `toApiChatMessage()`

8. **Tests**
   - `ChatMessage.vue` — `isContinuation=false`: renders avatar + name + tag; `isContinuation=true`: renders only message body, no avatar/name
   - `ChatPanel.vue` — `listItems` grouping: consecutive same-sender messages produce correct `isContinuation` flags; day-boundary breaks group; sender change breaks group; time-window break creates new group
   - `useChat.ts` — `handleUserUpdate()`: updates displayName/avatarUrl/userTag on matching messages; leaves non-matching messages unchanged
   - `useWebSocket.ts` — `user:update` message dispatches to `handleUserUpdate`

---

## Tasks / Subtasks

### Client — ChatMessage.vue

- [x] Task 1 — Add `isContinuation` prop and conditional rendering to `apps/web/src/components/chat/ChatMessage.vue` (AC: #1, #3, #4, #5)
  - [x] Add `isContinuation?: boolean` to `defineProps<{...}>()` (default: `false`)
  - [x] When `isContinuation` is `false` (group header): render avatar + name row + message body (current layout)
  - [x] When `isContinuation` is `true` (continuation): render only `<p>` message body, no avatar, no `<div class="min-w-0 flex-1">` wrapper — use `pl-[52px]` for indentation
  - [x] Add `hover:bg-white/[.03]` to the root `<div>` of both variants
  - [x] Timestamp (`timeLabel`) is hidden from continuation rows — shown only in the group header
  - [x] Maintain `role="listitem"` on the root element for both variants

### Client — ChatPanel.vue

- [x] Task 2 — Update `listItems` computed to include `isContinuation` per message (AC: #1, #2)
  - [x] Add `GROUP_WINDOW_MS = 5 * 60 * 1000` constant at script-setup top
  - [x] Update `ListItem` union type:
    ```typescript
    type ListItem =
      | { type: 'message'; data: ChatMessage; isContinuation: boolean }
      | { type: 'day'; label: string }
    ```
  - [x] In the `listItems` computed loop, compute `isContinuation`:
    - `true` when: prev message exists AND same userId AND same day AND `timeDeltaMs <= GROUP_WINDOW_MS`
    - `false` otherwise (new sender, day boundary, or time gap too large)
    - Day boundary always inserts a separator AND resets group (next message is never a continuation)
  - [x] Pass `isContinuation` prop to `<ChatMessage>`:
    ```html
    <ChatMessage v-else :message="item.data" :is-continuation="item.isContinuation" />
    ```

### Client — useChat.ts

- [x] Task 3 — Add `handleUserUpdate()` to `apps/web/src/composables/useChat.ts` (AC: #6)
  - [x] Import `UserProfile` from `@manlycam/types`
  - [x] Add module-level `handleUserUpdate` function (not inside factory — it modifies the module-level `messages` ref)
  - [x] Add `handleUserUpdate` to the return object of `useChat()` factory

### Client — useWebSocket.ts

- [x] Task 4 — Wire `user:update` WS message to `handleUserUpdate` (AC: #6)
  - [x] In `handleMessage()`, add a branch for `msg.type === 'user:update'`

### Tests

- [x] Task 5 — `apps/web/src/components/chat/ChatMessage.test.ts` — ADD to existing file (AC: #8)
  - [x] Add test: `isContinuation=true` — avatar NOT in DOM, display name NOT in DOM, userTag pill NOT in DOM, message body IS rendered
  - [x] Add test: `isContinuation=true` — root element has `pl-[52px]` class (or contains `pl-[52px]` in its class string)
  - [x] Add test: `isContinuation=false` (explicit) — avatar present, display name present, timestamp present

- [x] Task 6 — `apps/web/src/components/chat/ChatPanel.test.ts` — ADD grouping tests (AC: #8)
  - [x] Two consecutive messages from same userId, same day, within 5 min → second message row has no avatar rendered (continuation)
  - [x] Two messages from same userId, > 5 min apart → second message IS a new group (avatar rendered)
  - [x] Message from different userId → new group (avatar rendered)
  - [x] Day boundary between same-sender messages → day separator rendered, next message is new group (avatar rendered)
  - [x] Existing tests must continue passing (history load, sentinel, day delineators, scroll behavior)

- [x] Task 7 — `apps/web/src/composables/useChat.test.ts` — ADD `handleUserUpdate` tests (AC: #8)
  - [x] Updates `displayName`, `avatarUrl`, `userTag` on messages where `msg.userId === profile.id`
  - [x] Leaves messages from other userIds unchanged
  - [x] Works when `messages` is empty (no error)
  - [x] Correctly sets `userTag: null` when profile has `userTag: null`

- [x] Task 8 — `apps/web/src/composables/useWebSocket.test.ts` — ADD `user:update` test (AC: #8)
  - [x] Added `vi.mock('@/composables/useChat', ...)` with `mockHandleUserUpdate` and `mockHandleChatMessage` before `import { useWebSocket }`
  - [x] Add `mockHandleUserUpdate` to the `vi.clearAllMocks()` scope in `beforeEach`
  - [x] Add test in `onmessage handler` describe block: `user:update` WS message calls `useChat().handleUserUpdate` with correct `UserProfile` payload
  - [x] Existing `stream:state` and `ignores unknown types` tests still pass after adding the mock

---

## Code Review Notes (2026-03-09)

**Review Status:** ✅ PASSED with minor fixes applied

**Findings:**
1. **UserTag opacity '66' (40%)** — INTENTIONAL after QA UX pass (not a spec violation as initially flagged) ✓ Confirmed intentional
2. **handleUserUpdate calling pattern** — FIXED: Changed `useChat().handleUserUpdate()` to direct import + call, consistent with module-level export pattern and test approach
3. **Redundant CSS class (pr-3)** — FIXED: Removed redundant `pr-3` from continuation row (was already included in `px-3`)

**Test Quality:** All 214 tests passing. Comprehensive coverage:
- ChatMessage isContinuation variants (9 tests)
- ChatPanel grouping logic: time window, sender change, day boundary (4 tests)
- useChat handleUserUpdate mutation (4 tests)
- useWebSocket user:update dispatch (1 test)

**AC Coverage:** All 8 Acceptance Criteria fully implemented and verified ✅

---

## Dev Notes

### UX Spec Gaps — Requires Attention

> **⚠️ The following are gaps or ambiguities in the UX specification documents that emerged during story analysis. They are flagged here for awareness — implementation decisions are provided as reasonable defaults but should be confirmed with the product owner.**

**Gap 1: Time window for message grouping is undefined**
- The epics say "a series of messages from the same sender sent within a short time window" but never specify the window duration
- The UX design mockups show grouping but don't document a threshold
- **Implementation decision:** `GROUP_WINDOW_MS = 5 * 60 * 1000` (5 minutes) — matching Slack's well-established convention
- This constant is defined at the top of `ChatPanel.vue` script setup for easy adjustment
- [Source: `_bmad-output/planning-artifacts/epics.md` §Story 4.3]

**Gap 2: Timestamp visibility on continuation messages**
- The UX HTML prototype (`ux-design-directions.html`, `.msg-continuation`) shows no timestamp on continuation rows — only the group header (`.msg-name .ts`) has a timestamp
- The UX spec text does not explicitly address whether continuations show timestamps
- **Implementation decision:** Hide timestamp from continuation rows (consistent with HTML prototype and Slack/Discord UX patterns)
- If timestamps should be shown on hover for continuation rows (Slack hover behavior), that can be added in a future polish pass

**Gap 3: UX spec lists `ScrollArea` for chat scroll — already intentionally diverged**
- `ux-design-specification.md` (line 604) lists `ScrollArea` as the component for chat message scroll
- Story 4-1 intentionally replaced this with a manual `<div class="overflow-y-auto" ref="scrollRef">` because `ScrollArea`'s nested viewport prevents direct `scrollTop`/`scrollHeight` access
- This divergence is correct and should NOT be reverted
- [Source: Story 4-1 completion notes; `apps/web/src/components/chat/ChatPanel.vue`]

**Gap 4: Hover effect on messages not present in current implementation**
- UX spec says `hover (subtle background)` for ChatMessage variants
- UX HTML prototype uses `rgba(255,255,255,.03)` on both `.msg-group:hover` and `.msg-continuation:hover`
- Current `ChatMessage.vue` has no hover state — story 4-3 adds it
- Tailwind equivalent: `hover:bg-white/[.03]`

### Architecture Constraints

**Never import ulidx directly** — if any ID generation is needed, use `apps/server/src/lib/ulid.ts` singleton. (No IDs generated client-side in this story.)

**No server changes** — `computeUserTag` is already correctly implemented in `chatService.ts`. Both `createMessage()` and `getHistory()` already use `toApiChatMessage()` which calls `computeUserTag()`. The AC about server-side tag logic is fully satisfied.

**Module-level exports pattern** — `handleUserUpdate` must be exported at module level (not just returned from factory), following the same pattern as `messages`, `hasMore`, `isLoadingHistory`, `oldestMessageId`. This allows tests to call it directly for reset/testing without going through the factory.

**WsMessage union type** — `user:update` is already defined in `packages/types/src/ws.ts`:
```typescript
| { type: 'user:update'; payload: UserProfile }
```
TypeScript will enforce the correct payload shape.

**isContinuation grouping logic** — The key subtlety is that a day boundary always forces a new group AND inserts a separator. This means the `isContinuation` check must also verify `isSameDay(prev.createdAt, msg.createdAt)`. Example:
```typescript
const GROUP_WINDOW_MS = 5 * 60 * 1000

const listItems = computed<ListItem[]>(() => {
  const items: ListItem[] = []
  for (let i = 0; i < messages.value.length; i++) {
    const msg = messages.value[i]
    const prev = messages.value[i - 1]

    const sameDay = !!(prev && isSameDay(prev.createdAt, msg.createdAt))
    if (!sameDay) {
      items.push({ type: 'day', label: formatDayLabel(msg.createdAt) })
    }

    const timeDelta = prev
      ? new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime()
      : Infinity
    const isContinuation =
      sameDay &&
      !!prev &&
      prev.userId === msg.userId &&
      timeDelta <= GROUP_WINDOW_MS

    items.push({ type: 'message', data: msg, isContinuation })
  }
  return items
})
```

**ChatMessage.vue — continuation layout**

The indentation for continuation rows must produce `pl-[52px]`:
- Parent padding left: `px-3` → 12px
- Avatar width: `h-8 w-8` → 32px
- Gap: `gap-2` → 8px
- Total: 12px + 32px + 8px = 52px

```html
<!-- Continuation row -->
<div
  role="listitem"
  class="px-3 py-0.5 pl-[52px] hover:bg-white/[.03]"
>
  <p
    class="text-sm text-foreground break-words [&_a]:underline [&_a]:text-primary [&_code]:font-mono [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded"
    v-html="renderedContent"
  />
</div>
```

Note: `pl-[52px]` overrides `px-3`'s left padding via Tailwind's specificity. Verify this is correct — if Tailwind merges incorrectly, use `pr-3 pl-[52px]` instead of `px-3 pl-[52px]`.

**ChatMessage.vue — group header row**

```html
<!-- Group header row -->
<div role="listitem" class="flex items-start gap-2 px-3 py-1.5 hover:bg-white/[.03]">
  <Avatar class="h-8 w-8 shrink-0 mt-0.5">
    <AvatarImage
      v-if="message.avatarUrl"
      :src="message.avatarUrl"
      :alt="message.displayName"
      referrer-policy="no-referrer"
    />
    <AvatarFallback class="text-xs">{{ avatarInitials }}</AvatarFallback>
  </Avatar>
  <div class="min-w-0 flex-1">
    <div class="flex items-baseline gap-1.5 flex-wrap">
      <span class="text-sm font-semibold text-foreground truncate">{{ message.displayName }}</span>
      <span
        v-if="message.userTag"
        class="text-xs px-1 py-0.5 rounded font-medium shrink-0"
        :style="{ backgroundColor: message.userTag.color + '33', color: message.userTag.color }"
      >
        {{ message.userTag.text }}
      </span>
      <span class="text-xs text-muted-foreground shrink-0">{{ timeLabel }}</span>
    </div>
    <p
      class="text-sm text-foreground break-words [&_a]:underline [&_a]:text-primary [&_code]:font-mono [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded"
      v-html="renderedContent"
    />
  </div>
</div>
```

**handleUserUpdate — module-level export pattern**

Follow the exact same pattern as existing module-level exports:
```typescript
// In useChat.ts — at module level, NOT inside the factory function
export const handleUserUpdate = (profile: UserProfile): void => {
  messages.value = messages.value.map((msg) =>
    msg.userId === profile.id
      ? {
          ...msg,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          userTag: profile.userTag,
        }
      : msg,
  )
}
```

Then add to the factory return:
```typescript
return {
  messages,
  sendChatMessage,
  handleChatMessage,
  initHistory,
  loadMoreHistory,
  hasMore,
  isLoadingHistory,
  handleUserUpdate,
}
```

### Project Structure — Files to Modify

```
apps/web/src/
  components/
    chat/
      ChatMessage.vue           ← MODIFY: add isContinuation prop, conditional rendering, hover bg
      ChatMessage.test.ts       ← ADD: isContinuation variant tests (file EXISTS — 10 tests passing)
      ChatPanel.vue             ← MODIFY: listItems type + isContinuation computation + prop pass-through
      ChatPanel.test.ts         ← ADD: grouping tests (file EXISTS)

  composables/
    useChat.ts                  ← ADD: handleUserUpdate (module-level export)
    useChat.test.ts             ← ADD: handleUserUpdate tests (file EXISTS)
    useWebSocket.ts             ← ADD: user:update → handleUserUpdate dispatch
    useWebSocket.test.ts        ← ADD: useChat mock + user:update routing test (file EXISTS — 18 tests passing)
```

**No server-side changes required.** All server-side logic (`computeUserTag`, `toApiChatMessage`, `getHistory`) was already correctly implemented in Story 4-2.

### Testing Approach

**ChatMessage.vue tests** — Mount with `mountComponent` from `@vue/test-utils`, pass mock `message` prop:
- For `isContinuation=false`: assert `Avatar` renders (`wrapper.findComponent(Avatar)`), assert display name text present
- For `isContinuation=true`: assert `Avatar` is NOT rendered, assert display name NOT present, assert `pl-[52px]` class on root

**ChatPanel.vue grouping tests** — Mock `useChat` at module level:
```typescript
vi.mock('@/composables/useChat', () => ({
  useChat: () => ({
    messages: mockMessages,
    sendChatMessage: vi.fn(),
    handleChatMessage: vi.fn(),
    initHistory: vi.fn().mockResolvedValue(undefined),
    loadMoreHistory: vi.fn(),
    hasMore: ref(false),
    isLoadingHistory: ref(false),
  }),
}))
```
Set `mockMessages.value` to sequences of messages and assert rendered DOM structure (presence/absence of Avatar components per row).

**Reset module-level refs in beforeEach** (existing pattern from 4-2):
```typescript
beforeEach(() => {
  vi.clearAllMocks()
  messages.value = []
  hasMore.value = true
  isLoadingHistory.value = false
})
```

**useWebSocket test** — Check if `apps/web/src/composables/useWebSocket.test.ts` exists; if not, create it. Mock `useChat()` and verify `handleUserUpdate` is called when a `user:update` message is received.

### Story 4-2 Learnings Applied

- **Module-level exports**: `handleUserUpdate` exported at module level (not just from factory) for test reset — same pattern as `hasMore`, `isLoadingHistory`, `messages`, `oldestMessageId`
- **Test isolation**: `afterEach(() => { wrapper?.unmount() })` in all `ChatPanel.test.ts` tests
- **Module-level refs reset**: `beforeEach` must reset `messages.value = []` in useChat tests
- **Timezone-safe test fixtures**: Use explicit UTC ISO strings for `createdAt` in test messages (e.g., `'2026-03-09T14:14:00.000Z'`) — not locale-dependent constructions

### References

- Story 4-3 epics definition: [Source: `_bmad-output/planning-artifacts/epics.md` §Story 4.3]
- Message grouping visual design: [Source: `_bmad-output/planning-artifacts/ux-design-directions.html` — `.msg-group`, `.msg-continuation` CSS classes and HTML mockup]
- ChatMessage component spec: [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` §`<ChatMessage />` component — variants: group, continuation]
- Spacing and typography tokens: [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` §Spacing System — `gap-1` continuations, `gap-3` new speaker groups, `p-3` per row]
- UserTag computation: [Source: `apps/server/src/services/chatService.ts` — `computeUserTag()`]
- WsMessage union (user:update): [Source: `packages/types/src/ws.ts`]
- Current ChatMessage.vue: [Source: `apps/web/src/components/chat/ChatMessage.vue`]
- Current ChatPanel.vue (listItems, scroll): [Source: `apps/web/src/components/chat/ChatPanel.vue`]
- Current useChat.ts (module-level exports pattern): [Source: `apps/web/src/composables/useChat.ts`]
- Current useWebSocket.ts (handleMessage dispatch): [Source: `apps/web/src/composables/useWebSocket.ts`]
- Story 4-2 completion notes (module singleton export, test isolation): [Source: `_bmad-output/implementation-artifacts/4-2-chat-history-on-load-and-infinite-scroll.md` §Completion Notes List]
- Story 4-1 completion notes (ScrollArea → manual div, afterEach): [Source: `_bmad-output/implementation-artifacts/4-1-chat-panel-message-sending-and-real-time-delivery.md` §Completion Notes List]

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- **ChatMessage.vue**: Added `isContinuation?: boolean` prop with two distinct render paths — group header (avatar + name + tag + timestamp + body) and continuation row (body only, `pl-[52px]` indent, `hover:bg-white/[.03]` on both). Used `v-if`/`v-else` on root divs rather than conditional sections within a single root to keep template clean.
- **ChatPanel.vue**: Added `GROUP_WINDOW_MS = 5 * 60 * 1000` constant. Updated `ListItem` union to include `isContinuation: boolean` on message items. Updated `listItems` computed to compute continuation based on: same day + same userId + timeDelta ≤ GROUP_WINDOW_MS. Day boundary inserts separator AND forces new group. Passes `:is-continuation` to `<ChatMessage>`.
- **useChat.ts**: Added module-level `export const handleUserUpdate` that maps over `messages.value`, replacing `displayName`, `avatarUrl`, `userTag` on matching userId. Added to factory return object.
- **useWebSocket.ts**: Added `user:update` branch in `handleMessage()` dispatching to `useChat().handleUserUpdate(msg.payload)`.
- **Tests**: 214 total passing (up from 210). Added 9 tests to `ChatMessage.test.ts` (continuation/header variants), 4 grouping tests to `ChatPanel.test.ts`, 4 `handleUserUpdate` tests to `useChat.test.ts`, 1 `user:update` dispatch test to `useWebSocket.test.ts`. All existing tests continue passing.
- **Test approach for ChatPanel grouping**: Used `[role="listitem"]` class inspection (`pl-[52px]` presence) to distinguish continuation vs group-header rows, rather than counting Avatar components (which also appear in ProfileAnchor). Timezone-safe UTC ISO timestamps used (midday UTC) to avoid day-boundary ambiguity.

### File List

- `apps/web/src/components/chat/ChatMessage.vue` — MODIFIED: added `isContinuation` prop, conditional render for continuation/group-header, hover bg
- `apps/web/src/components/chat/ChatMessage.test.ts` — MODIFIED: added 9 tests for isContinuation variants
- `apps/web/src/components/chat/ChatPanel.vue` — MODIFIED: GROUP_WINDOW_MS constant, ListItem type with isContinuation, updated listItems computed, pass :is-continuation to ChatMessage
- `apps/web/src/components/chat/ChatPanel.test.ts` — MODIFIED: added 4 message grouping tests
- `apps/web/src/composables/useChat.ts` — MODIFIED: import UserProfile, added module-level handleUserUpdate export, added to factory return
- `apps/web/src/composables/useChat.test.ts` — MODIFIED: imported handleUserUpdate and messages directly, added UserProfile mock, added 4 handleUserUpdate tests
- `apps/web/src/composables/useWebSocket.ts` — MODIFIED: added user:update → handleUserUpdate dispatch branch
- `apps/web/src/composables/useWebSocket.test.ts` — MODIFIED: added useChat mock (mockHandleUserUpdate, mockHandleChatMessage), added beforeEach mock resets, added user:update dispatch test

### Change Log

- 2026-03-09: Implemented Story 4.3 — message grouping (GROUP_WINDOW_MS=5min), isContinuation prop in ChatMessage, handleUserUpdate in useChat, user:update WS dispatch. 214 tests passing (9 new in ChatMessage, 4 new in ChatPanel, 4 new in useChat, 1 new in useWebSocket).
