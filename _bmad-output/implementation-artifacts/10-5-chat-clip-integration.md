# Story 10.5: Chat Clip Integration

Status: ready-for-review

## Story

As an **authenticated viewer**,
I want clip shares to appear as rich cards in the chat timeline,
So that I can watch, download, and interact with clips without leaving the stream.

## Acceptance Criteria

1. **Given** a `chat:message` WsMessage is received with `messageType: 'clip'`, **When** it renders in the chat timeline, **Then** a clip card displays: thumbnail image, clip name, duration badge, and Watch + Download action buttons; standard message metadata (sender avatar, display name, timestamp) appears as with text messages.

2. **Given** a user clicks Watch on a clip card, **When** the modal opens, **Then** a clip viewer modal overlays the current page; the stream and chat continue behind it; the browser URL is updated to `/clips/{id}` via `history.pushState({ clipModal: true, fromRoute: '/' }, '', '/clips/{id}')`. If `isClipModalOpen.value === true` when Watch is clicked, use `history.replaceState` instead to prevent stacking multiple clip entries in browser history. The modal can be closed via an X button or Escape key, which calls `history.back()`.

3. **Given** a user presses the browser back button while the clip modal is open, **When** the `popstate` event fires, **Then** the modal closes and the URL returns to the stream page; the stream is unaffected.

4. **Given** a user refreshes the browser while at `/clips/{id}` with no `history.state`, **When** the page loads, **Then** Vue Router detects the absence of `history.state.clipModal` and renders the standalone clip page (Story 10-6) rather than the modal-over-stream.

5. **Given** a user clicks Download on a clip card in chat, **When** the action completes, **Then** the browser calls `GET /api/clips/:id/download` and the file downloads with the clip's slugified name.

6. **Given** a clip referenced in the chat timeline is set to `private` or is deleted, **When** a user's chat history is next fetched (page load or pagination scroll), **Then** the clip card renders as "This clip is no longer available" with identical card dimensions (tombstone).

7. **Given** a clip is currently displayed as a tombstone in an active session, **When** a `clip:visibility-changed` WsMessage is received with `visibility` of `shared` or `public` AND the payload includes `chatClipIds` containing rendered tombstone message IDs, **Then** ALL matching tombstones are immediately replaced with live clip cards using the card data from the WS payload.

8. **Given** the reverse (going private), **Then** active sessions are NOT disrupted; tombstone only appears on the next history fetch. No immediate real-time tombstoning occurs. A rapid `private -> public -> private` sequence leaves active sessions showing the clip card as live until the next page load.

9. **Given** a user scroll-back paginates and re-fetches a page of messages that already contains rendered clip cards, **When** the paginated response returns tombstone flags for some of those messages, **Then** the frontend merges tombstone state into the existing rendered message list (not merely appending).

10. **Given** a muted user views clip cards, **Then** they can view clip cards, watch clips, and download clips; they cannot share clips to chat (enforced elsewhere in Story 10-4).

## Tasks / Subtasks

- [ ] Task 1: Create `ClipCard.vue` component (AC: #1)
  - [ ] 1.1 Create `apps/web/src/components/chat/ClipCard.vue`
  - [ ] 1.2 Accept `ClipChatMessage` as prop; render thumbnail, clip name, duration badge
  - [ ] 1.3 Add Watch and Download action buttons (lucide icons: `Play`, `Download`)
  - [ ] 1.4 Render tombstone state when `message.tombstone === true` ("This clip is no longer available")
  - [ ] 1.5 Maintain identical card dimensions for tombstone vs live card
  - [ ] 1.6 Write `ClipCard.test.ts` co-located tests

- [ ] Task 2: Update `ChatMessage.vue` to handle `ClipChatMessage` (AC: #1)
  - [ ] 2.1 Import `ClipCard.vue`
  - [ ] 2.2 Narrow on `message.messageType` — render `ClipCard` for `'clip'`, existing markdown content for `'text'` (or absent `messageType` for backward compat)
  - [ ] 2.3 Preserve all existing message metadata (avatar, display name, timestamp, reactions, context menu)
  - [ ] 2.4 Update `ChatMessage.test.ts` with clip message rendering tests

- [ ] Task 3: Create `useClipModal` composable (AC: #2, #3, #4)
  - [ ] 3.1 Create `apps/web/src/composables/useClipModal.ts`
  - [ ] 3.2 Expose `isClipModalOpen: Ref<boolean>`, `activeClipId: Ref<string | null>`, `openClip(clipId)`, `closeClip()`
  - [ ] 3.3 `openClip`: use `pushState` when `isClipModalOpen === false`, `replaceState` when `true`; state object: `{ clipModal: true, fromRoute: '/' }`
  - [ ] 3.4 `closeClip`: call `history.back()`; set `isClipModalOpen = false`, `activeClipId = null`
  - [ ] 3.5 Listen for `popstate` event — if `history.state?.clipModal !== true`, close modal
  - [ ] 3.6 Cleanup: remove `popstate` listener on unmount
  - [ ] 3.7 Write `useClipModal.test.ts` co-located tests

- [ ] Task 4: Create `ClipViewerModal.vue` component (AC: #2, #3)
  - [ ] 4.1 Create `apps/web/src/components/clip/ClipViewerModal.vue`
  - [ ] 4.2 Render as `position: fixed` overlay (same pattern as emoji picker overlays — fixed positioning avoids transform/overflow-hidden ancestor issues)
  - [ ] 4.3 Fetch clip data via `GET /api/clips/:id` on open
  - [ ] 4.4 Render `<video>` element with presigned URL from `GET /api/clips/:id/download` (302 redirect)
  - [ ] 4.5 Show clip name, description, duration, clipper attribution if present
  - [ ] 4.6 X close button + Escape key handler (calls `closeClip()` from composable)
  - [ ] 4.7 Download button on modal
  - [ ] 4.8 Write `ClipViewerModal.test.ts` co-located tests

- [ ] Task 5: Add `/clips/:id` route to Vue Router (AC: #4)
  - [ ] 5.1 Update `apps/web/src/router/index.ts` — add `/clips/:id` route
  - [ ] 5.2 Route component checks `history.state?.clipModal === true && history.state?.fromRoute === '/'` — if both true, render modal-over-stream; otherwise render standalone clip page placeholder (Story 10-6 implements the full standalone page)
  - [ ] 5.3 For this story, standalone route renders a minimal "Clip page coming soon" or redirects to `/` (Story 10-6 will replace this)
  - [ ] 5.4 Update router `beforeEach` guard to allow `/clips/:id` without redirect

- [ ] Task 6: Handle `clip:visibility-changed` WsMessage for tombstone restoration (AC: #7, #8)
  - [ ] 6.1 Add handler in `useWebSocket.ts` for `clip:visibility-changed` message type
  - [ ] 6.2 When `visibility` is `shared` or `public` and payload includes `chatClipIds` and `clip` card data: iterate all `chatClipIds`, find matching messages in `messages` ref, replace tombstone data with live clip card data from payload
  - [ ] 6.3 When `visibility` is `private` or `deleted`: no-op for active sessions (tombstone only on next fetch)
  - [ ] 6.4 Write tests for WS handler

- [ ] Task 7: Update `useChat.ts` for tombstone merge on pagination (AC: #9)
  - [ ] 7.1 In `loadMoreHistory` and `initHistory`: when merging paginated results, if an existing rendered message ID appears in the response with `tombstone: true`, update the existing message in the `messages` ref
  - [ ] 7.2 Write tests for tombstone merge behavior

- [ ] Task 8: Wire `ClipViewerModal` into `WatchView.vue` (AC: #2, #3)
  - [ ] 8.1 Import and render `ClipViewerModal` in `WatchView.vue`, controlled by `useClipModal`
  - [ ] 8.2 Ensure stream + chat continue running behind the modal overlay
  - [ ] 8.3 Wire `ClipCard` Watch button → `openClip(clipId)` via emit chain or provide/inject

- [ ] Task 9: Handle Download action (AC: #5)
  - [ ] 9.1 `ClipCard` Download button opens `GET /api/clips/:id/download` in a new tab or via `window.location.assign`
  - [ ] 9.2 `ClipViewerModal` Download button does the same

## Dev Notes

### Architecture & Patterns

- **WsMessage types**: Story 10-2 adds `clip:status-changed` and `clip:visibility-changed` to the `WsMessage` discriminated union in `packages/types/src/ws.ts` (line 85). Story 10-2 also splits `ChatMessage` into `TextChatMessage | ClipChatMessage` with `messageType` discriminator. This story consumes those types — do NOT re-declare them.
- **ChatMessage backward compat**: The existing `ChatMessage` type becomes `TextChatMessage | ClipChatMessage`. Existing code that only accesses base fields (`id`, `userId`, `content`, etc.) continues to work. Only code that renders message body content needs to narrow on `messageType`.
- **ClipChatMessage fields**: `messageType: 'clip'`, `clipId: string`, `clipThumbnailUrl: string` (the proxy path `/api/clips/{clipId}/thumbnail`), `clipName: string`, `clipDurationSeconds: number`, `tombstone?: true`. When `tombstone === true`, render the "clip unavailable" card.
- **Module-level singleton pattern**: `useChat.ts` uses module-level `ref` singletons (`messages`, `ephemeralMessages`, etc.) shared across all callers. Follow this same pattern for any new clip-related refs. The `messages` ref already holds the array of all chat messages — clip messages will be mixed in.
- **Fixed positioning for overlays**: Per CLAUDE.md, use `position: fixed` with viewport-relative coordinates for the clip viewer modal. Do NOT use `position: absolute` — it breaks inside transformed/overflow-hidden ancestors.
- **ScrollArea pattern**: ChatPanel uses ShadCN `ScrollArea` with `getViewport()` for scroll calculations. Do not replace this.
- **Emoji picker overlay pattern**: See `EmojiPicker.vue` for the established `position: fixed` overlay pattern in this codebase.

### Tombstone Design (Asymmetric)

- **Going unavailable (private/deleted)**: NOT real-time for active sessions. Tombstone only appears on next `getHistory()` call (page load or pagination). This is intentional — the AC explicitly states "active viewers unaffected until reload."
- **Going available (shared/public)**: IS real-time. The `clip:visibility-changed` WsMessage with `visibility: 'shared'|'public'` includes full `clip` card data. Client must update ALL message IDs in `chatClipIds` (same clip can be shared multiple times).
- **Pagination merge**: When `loadMoreHistory` returns messages that overlap with already-rendered messages (by ID), tombstone state from the server response must overwrite the client state. This prevents stale live cards from persisting after a clip went private between page loads.

### History.pushState Modal Pattern

- This is a new pattern for this codebase. No existing code uses `history.pushState` or `popstate`.
- The modal is NOT a Vue Router navigation — it uses raw History API to avoid disrupting the stream page lifecycle.
- `fromRoute` is hardcoded to `'/'` (the stream is always at `/`). Do NOT use `router.currentRoute.value.path` dynamically.
- On browser refresh at `/clips/:id`, `history.state` will be empty (browsers do not persist custom state across refreshes). Vue Router will match the `/clips/:id` route and render the standalone page.
- The `isClipModalOpen` ref prevents history stack pollution when clicking Watch on multiple clips in succession (replaceState instead of pushState).

### Download Pattern

- `GET /api/clips/:id/download` returns a 302 redirect to a presigned S3 URL. The browser follows the redirect and starts downloading.
- Use `window.open(url, '_blank')` or an `<a>` tag with `download` attribute for the Download button. Do not use `fetch()` — the 302 redirect must be followed by the browser, not JS.

### Existing File Touchpoints

Key files that will be modified (not exhaustive — Story 10-2 creates infrastructure this story depends on):

- `packages/types/src/ws.ts` — already updated by Story 10-2 (consume, don't modify)
- `apps/web/src/components/chat/ChatMessage.vue` — add `ClipCard` rendering branch
- `apps/web/src/components/chat/ChatMessage.test.ts` — add clip message tests
- `apps/web/src/composables/useChat.ts` — tombstone merge logic in pagination
- `apps/web/src/composables/useChat.test.ts` — tombstone merge tests
- `apps/web/src/composables/useWebSocket.ts` — add `clip:visibility-changed` handler
- `apps/web/src/composables/useWebSocket.test.ts` — WS handler tests
- `apps/web/src/router/index.ts` — add `/clips/:id` route
- `apps/web/src/views/WatchView.vue` — mount `ClipViewerModal`

New files:
- `apps/web/src/components/chat/ClipCard.vue`
- `apps/web/src/components/chat/ClipCard.test.ts`
- `apps/web/src/components/clip/ClipViewerModal.vue`
- `apps/web/src/components/clip/ClipViewerModal.test.ts`
- `apps/web/src/composables/useClipModal.ts`
- `apps/web/src/composables/useClipModal.test.ts`

### Project Structure Notes

- Components follow `PascalCase.vue` naming in `apps/web/src/components/`
- Composables follow `useCamelCase.ts` naming in `apps/web/src/composables/`
- Tests are co-located (`Foo.test.ts` next to `Foo.ts` or `Foo.vue`)
- No `__tests__/` directories
- Named exports only (no `export default` except tool configs)
- Clip-specific UI components go in `apps/web/src/components/clip/` (new directory)
- Chat-integrated clip card stays in `apps/web/src/components/chat/` (co-located with ChatMessage)

### Testing Requirements

- All new lines must be covered or have `/* c8 ignore next */` with explanation
- Use `c8` syntax, NOT `istanbul` — V8 coverage provider ignores istanbul comments
- Every Vue Test Utils test suite MUST have `afterEach(() => { wrapper?.unmount(); wrapper = null; })`
- Wrapper pattern: `let wrapper: VueWrapper | null = null` at suite level
- Run `pnpm run test --coverage` from `apps/web` — never use `npx vitest run`
- ESLint globals for web tests: `describe`, `it`, `expect`, `vi` are available without import

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 10-5 acceptance criteria]
- [Source: _bmad-output/planning-artifacts/epics.md — Story 10-2 for WsMessage type additions and ChatMessage split]
- [Source: _bmad-output/planning-artifacts/epics.md — Story 10-3 for clip:status-changed broadcast spec]
- [Source: _bmad-output/planning-artifacts/epics.md — Story 10-4 for clip:visibility-changed broadcast spec and deletion flow]
- [Source: _bmad-output/planning-artifacts/epics.md — FR70 (Chat Clip Sharing), FR71 (Chat Clip Tombstone)]
- [Source: packages/types/src/ws.ts — current WsMessage union, ChatMessage interface]
- [Source: apps/web/src/composables/useChat.ts — module-level singleton pattern, message handling]
- [Source: apps/web/src/composables/useWebSocket.ts — WS message dispatch pattern]
- [Source: apps/web/src/components/chat/ChatMessage.vue — existing message rendering]
- [Source: apps/web/src/router/index.ts — current route definitions]
- [Source: CLAUDE.md — fixed positioning rule, ScrollArea rule, testing rules, naming conventions]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

1. **ClipCard.vue Watch button**: Calls `openClip(clipId)` via direct module-level import from `useClipModal` (not emit chain). Consistent with `useChat.ts` module-level singleton pattern.

2. **ClipViewerModal.vue**: Uses `position: fixed` overlay. Fetches `GET /api/clips/:id` for metadata on `activeClipId` watch with `immediate: true`. Video `src` uses `/api/clips/:id/download` (browser follows 302 redirect). Escape key and backdrop click close the modal.

3. **History API modal pattern**: `history.pushState` bypasses Vue Router, so `$route.path` stays as `/` and `WatchView` remains mounted. Direct navigation to `/clips/:id` hits the router and shows standalone placeholder. `ClipStandalonePage` is a minimal inline component — Story 10-6 will implement the full page.

4. **Tombstone merge in pagination**: `mergeMessages()` helper in `useChat.ts` applies `tombstone: true` from incoming messages to existing ones. Prevents stale live cards persisting after a clip went private between page loads.

5. **Real-time tombstone restoration**: `handleClipTombstoneRestore()` in `useChat.ts` handles `clip:visibility-changed` with `visibility: 'shared'|'public'` — updates all matching tombstoned messages to live cards using the WS payload's clip data. Called from `useWebSocket.ts` alongside `handleClipVisibilityChanged`.

6. **vi.hoisted for mock refs**: `ClipViewerModal.test.ts` uses `vi.hoisted` with `__v_isRef: true` on the fake `activeClipId` mock so Vue's `watch(activeClipId, ...)` functions correctly in the test environment.

7. **router/index.ts defineComponent import**: Added `import { defineComponent } from 'vue'` (separate from `vue-router` import) for the `ClipStandalonePage` placeholder. The initial implementation incorrectly imported from `vue-router`.

### File List

- `apps/web/src/components/chat/ClipCard.vue` (NEW)
- `apps/web/src/components/chat/ClipCard.test.ts` (NEW)
- `apps/web/src/components/chat/ChatMessage.vue` (MODIFIED)
- `apps/web/src/components/chat/ChatMessage.test.ts` (MODIFIED)
- `apps/web/src/components/clip/ClipViewerModal.vue` (NEW)
- `apps/web/src/components/clip/ClipViewerModal.test.ts` (NEW)
- `apps/web/src/composables/useClipModal.ts` (NEW)
- `apps/web/src/composables/useClipModal.test.ts` (NEW)
- `apps/web/src/composables/useChat.ts` (MODIFIED)
- `apps/web/src/composables/useChat.test.ts` (MODIFIED)
- `apps/web/src/composables/useWebSocket.ts` (MODIFIED)
- `apps/web/src/composables/useWebSocket.test.ts` (MODIFIED)
- `apps/web/src/router/index.ts` (MODIFIED)
- `apps/web/src/views/WatchView.vue` (MODIFIED)
