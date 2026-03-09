# Story 4.5: Own Message Edit and Delete

Status: review

## Story

As a **viewer**,
I want to edit or delete my own messages after sending them,
so that I can correct mistakes without asking a moderator.

## Acceptance Criteria

1. **Own message context menu (hover-reveal)**
   - When a user hovers over one of their own messages, a `MoreHorizontal` (⋯) icon button appears at the top-right of the message row
   - Clicking it opens a `DropdownMenu` with "Edit" and "Delete" options
   - The context menu icon is NOT shown on other users' messages for non-privileged users (non-privileged = role below Moderator; Story 5.1 extends this to Mods/Admins)

2. **Edit mode activation**
   - When the user selects "Edit", the message body `<p>` is replaced with a `<textarea>` pre-filled with the current content
   - `Escape` cancels the edit, restoring the original message body
   - `Enter` (without `Shift`) or clicking "Save" submits the edit; `Shift+Enter` inserts a newline

3. **Server edit processing**
   - `PATCH /api/chat/messages/:messageId` (auth required): verifies `message.userId === session user.id`, returns `403` if not; returns `404` if message does not exist or is already deleted
   - Updates `content`, `updated_at = NOW()`, appends `{ content: prevContent, editedAt: NOW().toISOString() }` to `edit_history` JSONB (append-only array)
   - Broadcasts `{ type: 'chat:edit', payload: ChatEdit }` to all connected clients
   - Returns `200 { edit: ChatEdit }`

4. **Client edit receipt (`chat:edit` WS message)**
   - When a `chat:edit` WS message arrives, `useWebSocket.ts` calls `handleChatEdit(msg.payload)` which updates the message in-place in the local `messages` list (content, editHistory, updatedAt)
   - A small `(edited)` indicator appears next to the message timestamp after `updatedAt` becomes non-null

5. **"edited" tooltip**
   - When the user hovers over the `(edited)` indicator, a `Tooltip` shows the `updatedAt` timestamp formatted in the user's local timezone using `formatTime()` from `@/lib/dateFormat`

6. **Delete confirmation and server processing**
   - When the user selects "Delete", a `window.confirm('Delete this message?')` prompt appears
   - If confirmed: `DELETE /api/chat/messages/:messageId` is called; server sets `deleted_at = NOW()`, `deleted_by = userId`; broadcasts `{ type: 'chat:delete', payload: { messageId } }`
   - Server verifies ownership; returns `403` if not owner, `404` if not found or already deleted
   - No hard-delete; `deletedAt` is set (NFR15)

7. **Client delete receipt (`chat:delete` WS message)**
   - When a `chat:delete` WS message arrives, `useWebSocket.ts` calls `handleChatDelete(payload.messageId)` which removes the message from the local `messages` list

---

## Tasks / Subtasks

### Prerequisites — Install shadcn-vue components

- [x] Task 0a — Install `dropdown-menu` from `apps/web/` (AC: #1)
  - [x] Run: `pnpm dlx shadcn-vue@latest add dropdown-menu`
  - [x] Verify `apps/web/src/components/ui/dropdown-menu/` exists with `index.ts`
  - [x] Add `src/components/ui/dropdown-menu/**` to `coverage.exclude` in `apps/web/vite.config.ts` (same pattern as other shadcn components)

- [x] Task 0b — Install `tooltip` from `apps/web/` (AC: #5)
  - [x] Run: `pnpm dlx shadcn-vue@latest add tooltip`
  - [x] Verify `apps/web/src/components/ui/tooltip/` exists with `index.ts`
  - [x] Add `src/components/ui/tooltip/**` to `coverage.exclude` in `apps/web/vite.config.ts`

### Server — `chatService.ts`

- [x] Task 1 — Fix `toApiChatMessage` to map `editHistory` and `updatedAt` (AC: #3)
  - [ ] Change `editHistory: null` → `(row.editHistory as { content: string; editedAt: string }[] | null) ?? null`
  - [ ] Change `updatedAt: null` → `row.updatedAt?.toISOString() ?? null`
  - [ ] Leave `deletedAt: null` and `deletedBy: null` unchanged — `getHistory` always filters `deletedAt: null` so these are always null in practice

- [x] Task 2 — Add `editMessage` service function (AC: #3)
  - [ ] Import `AppError` from `'../lib/errors.js'` (already used in route layer, add to service)
  - [ ] `editMessage({ messageId, userId, content })`:
    1. `findUnique({ where: { id: messageId }, include: { user: true } })`
    2. If `!existing` → throw `new AppError('Message not found', 'NOT_FOUND', 404)`
    3. If `existing.userId !== userId` → throw `new AppError('Forbidden', 'FORBIDDEN', 403)`
    4. If `existing.deletedAt` → throw `new AppError('Message not found', 'NOT_FOUND', 404)`
    5. Build edit history: `const prev = (existing.editHistory as EditHistoryEntry[] | null) ?? []; const entry = { content: existing.content, editedAt: new Date().toISOString() }; const newHistory = [...prev, entry];`
    6. `prisma.message.update({ where: { id: messageId }, data: { content, editHistory: newHistory, updatedAt: new Date() } })`
    7. Build `ChatEdit` shape; `wsHub.broadcast({ type: 'chat:edit', payload: chatEdit })`
    8. Return `chatEdit`
  - [ ] Use `type EditHistoryEntry = { content: string; editedAt: string }` as a local type alias
  - [ ] `ChatEdit` is already defined in `@manlycam/types`; import it

- [x] Task 3 — Add `deleteMessage` service function (AC: #6)
  - [ ] `deleteMessage({ messageId, userId })`:
    1. `findUnique({ where: { id: messageId } })`
    2. If `!existing` → throw `new AppError('Message not found', 'NOT_FOUND', 404)`
    3. If `existing.userId !== userId` → throw `new AppError('Forbidden', 'FORBIDDEN', 403)`
    4. If `existing.deletedAt` → throw `new AppError('Message not found', 'NOT_FOUND', 404)` (already deleted)
    5. `prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date(), deletedBy: userId } })`
    6. `wsHub.broadcast({ type: 'chat:delete', payload: { messageId } })`
    7. Return `void`

### Server — `chat.ts`

- [x] Task 4 — Add `PATCH /api/chat/messages/:messageId` endpoint (AC: #3)
  - [ ] Import `editMessage` from `'../services/chatService.js'`
  - [ ] Add route after existing endpoints:
    ```typescript
    chatRouter.patch('/api/chat/messages/:messageId', requireAuth, async (c) => {
      const messageId = c.req.param('messageId');
      let body: { content?: unknown };
      try { body = await c.req.json<{ content?: unknown }>(); }
      catch { throw new AppError('Invalid JSON in request body', 'INVALID_JSON', 400); }
      const { content } = body;
      if (typeof content !== 'string' || content.trim().length === 0)
        throw new AppError('Content must be a non-empty string', 'VALIDATION_ERROR', 422);
      if (content.length > 1000)
        throw new AppError('Content must not exceed 1000 characters', 'CONTENT_TOO_LONG', 422);
      const user = c.get('user')!;
      const edit = await editMessage({ messageId, userId: user.id, content });
      return c.json({ edit }, 200);
    });
    ```

- [x] Task 5 — Add `DELETE /api/chat/messages/:messageId` endpoint (AC: #6)
  - [ ] Import `deleteMessage` from `'../services/chatService.js'`
  - [ ] Add route:
    ```typescript
    chatRouter.delete('/api/chat/messages/:messageId', requireAuth, async (c) => {
      const messageId = c.req.param('messageId');
      const user = c.get('user')!;
      await deleteMessage({ messageId, userId: user.id });
      return c.body(null, 204);
    });
    ```
  - [ ] Use `c.body(null, 204)` for 204 No Content — Hono's `c.json({}, 204)` also works but `c.body(null, 204)` is semantically correct

### Client — `useChat.ts`

- [x] Task 6 — Add `handleChatEdit` and `handleChatDelete` module-level exports (AC: #4, #7)
  - [ ] Import `ChatEdit` from `'@manlycam/types'` (already imports `ChatMessage` and `UserProfile`)
  - [ ] Add after `handleUserUpdate`:
    ```typescript
    export const handleChatEdit = (edit: ChatEdit): void => {
      messages.value = messages.value.map((msg) =>
        msg.id === edit.messageId
          ? { ...msg, content: edit.content, editHistory: edit.editHistory, updatedAt: edit.updatedAt }
          : msg,
      );
    };

    export const handleChatDelete = (messageId: string): void => {
      messages.value = messages.value.filter((msg) => msg.id !== messageId);
    };
    ```
  - [ ] These are module-level (NOT inside factory) — same pattern as `handleUserUpdate`, `unreadCount`, `resetUnread`, `incrementUnread`

- [x] Task 7 — Add `editMessage` and `deleteMessage` to `useChat` factory (AC: #3, #6)
  - [ ] Add inside the factory function:
    ```typescript
    const editMessage = async (messageId: string, content: string): Promise<void> => {
      await apiFetch<{ edit: ChatEdit }>(`/api/chat/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      // WS broadcast from server drives local state update via handleChatEdit
    };

    const deleteMessage = async (messageId: string): Promise<void> => {
      await apiFetch<void>(`/api/chat/messages/${messageId}`, { method: 'DELETE' });
      // WS broadcast from server drives local state update via handleChatDelete
    };
    ```
  - [ ] Add `editMessage` and `deleteMessage` to the factory return object

### Client — `useWebSocket.ts`

- [x] Task 8 — Dispatch `chat:edit` and `chat:delete` WS messages (AC: #4, #7)
  - [ ] Import `handleChatEdit, handleChatDelete` from `'./useChat'` (alongside existing `handleUserUpdate`)
  - [ ] In `handleMessage`, add after `chat:message` handler:
    ```typescript
    if (msg.type === 'chat:edit') {
      handleChatEdit(msg.payload);
    }
    if (msg.type === 'chat:delete') {
      handleChatDelete(msg.payload.messageId);
    }
    ```

### Client — `ChatMessage.vue`

- [x] Task 9 — Update `ChatMessage.vue` with context menu, edit mode, and edited indicator (AC: #1, #2, #4, #5)

  **New props:**
  - [ ] Add `isOwn?: boolean` prop

  **New emits:**
  - [ ] `requestEdit: [messageId: string, newContent: string]`
  - [ ] `requestDelete: [messageId: string]`

  **New imports:**
  - [ ] `ref, nextTick` from `'vue'` (add `ref`, `nextTick` to existing `computed` import)
  - [ ] `MoreHorizontal` from `'lucide-vue-next'`
  - [ ] `DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem` from `'@/components/ui/dropdown-menu'`
  - [ ] `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider` from `'@/components/ui/tooltip'`

  **New reactive state:**
  - [ ] `const isEditing = ref(false)`
  - [ ] `const editContent = ref('')`
  - [ ] `const editTextareaRef = ref<HTMLTextAreaElement | null>(null)`

  **New computed:**
  - [ ] `const editedLabel = computed(() => props.message.updatedAt ? formatTime(props.message.updatedAt) : null)`

  **New functions:**
  ```typescript
  function startEdit() {
    isEditing.value = true;
    editContent.value = props.message.content;
    nextTick(() => editTextareaRef.value?.focus());
  }

  function cancelEdit() {
    isEditing.value = false;
    editContent.value = '';
  }

  function submitEdit() {
    const trimmed = editContent.value.trim();
    if (!trimmed) return;
    emit('requestEdit', props.message.id, trimmed);
    isEditing.value = false;
    editContent.value = '';
  }

  function handleEditKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitEdit();
    }
    if (e.key === 'Escape') {
      cancelEdit();
    }
  }

  function confirmDelete() {
    if (window.confirm('Delete this message?')) {
      emit('requestDelete', props.message.id);
    }
  }
  ```

  **Context menu button (add to BOTH group and continuation rows):**
  - Add `relative group` class to the outer `<div role="listitem">` in both variants
  - Add context menu block inside (right-aligned, hover-revealed):
    ```html
    <div
      v-if="isOwn"
      class="absolute top-1.5 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button
            class="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Message actions"
          >
            <MoreHorizontal class="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem @click="startEdit">Edit</DropdownMenuItem>
          <DropdownMenuItem @click="confirmDelete" class="text-destructive focus:text-destructive">
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    ```

  **Message body (group row):** Replace `<p v-html="renderedContent">` with:
  ```html
  <template v-if="!isEditing">
    <p class="text-sm ..." v-html="renderedContent" />
  </template>
  <template v-else>
    <textarea
      ref="editTextareaRef"
      v-model="editContent"
      rows="1"
      maxlength="1000"
      class="w-full resize-none rounded border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[32px]"
      @keydown="handleEditKeydown"
    />
    <div class="flex gap-2 mt-1">
      <button
        class="text-xs px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90"
        @click="submitEdit"
      >Save</button>
      <button
        class="text-xs px-2 py-0.5 rounded hover:bg-accent"
        @click="cancelEdit"
      >Cancel</button>
    </div>
  </template>
  ```

  **"edited" indicator (group row timestamp line):** After `<span class="text-xs text-muted-foreground shrink-0">{{ timeLabel }}</span>`, add:
  ```html
  <TooltipProvider v-if="message.updatedAt">
    <Tooltip>
      <TooltipTrigger as-child>
        <span class="text-xs text-muted-foreground/60 italic cursor-default shrink-0">(edited)</span>
      </TooltipTrigger>
      <TooltipContent>
        <p>Edited {{ editedLabel }}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
  ```

  **"edited" indicator (continuation row):** Add inline after the message `<p>`:
  ```html
  <TooltipProvider v-if="!isEditing && message.updatedAt">
    <Tooltip>
      <TooltipTrigger as-child>
        <span class="text-xs text-muted-foreground/60 italic cursor-default">(edited)</span>
      </TooltipTrigger>
      <TooltipContent>
        <p>Edited {{ editedLabel }}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
  ```

### Client — `ChatPanel.vue`

- [x] Task 10 — Update `ChatPanel.vue` to pass `isOwn` and handle edit/delete events (AC: #1, #3, #6)
  - [ ] Import `useAuth` from `'@/composables/useAuth'`
  - [ ] Import `handleChatEdit, handleChatDelete` is NOT needed here — those are WS-driven (server broadcasts). ChatPanel only calls the REST API actions.
  - [ ] Import `editMessage, deleteMessage` from `useChat()` destructuring
  - [ ] Add `const { user } = useAuth()` at top of `<script setup>`
  - [ ] Get `editMessage` and `deleteMessage` from `useChat()`:
    ```typescript
    const { messages, sendChatMessage, initHistory, loadMoreHistory, hasMore, isLoadingHistory, editMessage, deleteMessage } = useChat();
    ```
  - [ ] Add handlers:
    ```typescript
    async function handleMessageEdit(messageId: string, newContent: string) {
      await editMessage(messageId, newContent);
    }

    async function handleMessageDelete(messageId: string) {
      await deleteMessage(messageId);
    }
    ```
  - [ ] Update `<ChatMessage>` in template:
    ```html
    <ChatMessage
      v-else
      :message="item.data"
      :is-continuation="item.isContinuation"
      :is-own="user?.id === item.data.userId"
      @request-edit="handleMessageEdit"
      @request-delete="handleMessageDelete"
    />
    ```

### Tests

- [x] Task 11 — Update `chatService.test.ts` — add editMessage and deleteMessage tests (AC: #3, #6)
  - [ ] Add `message.findUnique: vi.fn()` and `message.update: vi.fn()` to prisma mock
  - [ ] `editMessage` tests:
    - Throws 404 when message not found
    - Throws 403 when userId does not match message.userId
    - Throws 404 when message is already deleted (`deletedAt` non-null)
    - Updates content, builds edit_history (appends to existing null array), sets updatedAt
    - Appends to existing edit_history (not null/empty)
    - Broadcasts `chat:edit` WS event with correct ChatEdit payload
    - Returns correct ChatEdit shape
  - [ ] `deleteMessage` tests:
    - Throws 404 when message not found
    - Throws 403 when userId does not match
    - Throws 404 when already deleted
    - Updates `deletedAt` and `deletedBy` on message row
    - Broadcasts `chat:delete` WS event with `{ messageId }`
    - Returns void (no return value assertion needed)
  - [ ] `toApiChatMessage` fix tests (via createMessage/getHistory):
    - Returns non-null `editHistory` when row has edit_history JSONB
    - Returns non-null `updatedAt` when row has `updated_at`

- [x] Task 12 — Update `chat.test.ts` — add PATCH and DELETE endpoint tests (AC: #3, #6)
  - [ ] Add `editMessage: vi.fn()` and `deleteMessage: vi.fn()` to `chatService.js` mock
  - [ ] Import `editMessage` and `deleteMessage` from `'../services/chatService.js'`
  - [ ] `PATCH /api/chat/messages/:messageId` tests:
    - Returns `401` when not authenticated
    - Returns `200` with `{ edit: ChatEdit }` on success
    - Returns `422` on empty content
    - Returns `422` on whitespace-only content
    - Returns `422` on content > 1000 chars
    - Returns `422` when content is missing
    - Returns `404` when `editMessage` throws `AppError('NOT_FOUND')` — propagated by global error handler
    - Returns `403` when `editMessage` throws `AppError('FORBIDDEN')`
    - Calls `editMessage` with `{ messageId, userId, content }`
  - [ ] `DELETE /api/chat/messages/:messageId` tests:
    - Returns `401` when not authenticated
    - Returns `204` on success
    - Returns `404` when `deleteMessage` throws `AppError('NOT_FOUND')`
    - Returns `403` when `deleteMessage` throws `AppError('FORBIDDEN')`
    - Calls `deleteMessage` with `{ messageId, userId }`

- [x] Task 13 — Update `useChat.test.ts` — add handleChatEdit, handleChatDelete, editMessage, deleteMessage tests (AC: #4, #7)
  - [ ] Import `handleChatEdit, handleChatDelete` from `'./useChat'`
  - [ ] Add to `beforeEach` reset:
    - Reset `messages.value = []` (already present)
    - (no additional module-level refs to reset for this story)
  - [ ] `handleChatEdit` tests:
    - Updates matching message's content, editHistory, updatedAt in-place
    - Leaves non-matching messages unchanged
    - Works correctly when editHistory is null vs. existing array
  - [ ] `handleChatDelete` tests:
    - Removes message with matching ID from the list
    - Leaves messages with non-matching IDs in the list
    - Works when messages list is empty (no-op)
  - [ ] `editMessage` tests:
    - Calls `apiFetch` with `PATCH /api/chat/messages/msg-001` and correct JSON body
    - Resolves without error on success
  - [ ] `deleteMessage` tests:
    - Calls `apiFetch` with `DELETE /api/chat/messages/msg-001`

- [x] Task 14 — Update `useWebSocket.test.ts` — add chat:edit and chat:delete dispatch tests (AC: #4, #7)
  - [ ] Mock `handleChatEdit` and `handleChatDelete` in `vi.mock('./useChat', ...)` factory
  - [ ] Import mocked functions for assertion
  - [ ] `chat:edit` message → `handleChatEdit` called with payload
  - [ ] `chat:delete` message → `handleChatDelete` called with `payload.messageId`

- [x] Task 15 — Create `ChatMessage.test.ts` or update if it exists — context menu, edit mode, edited indicator tests (AC: #1, #2, #4, #5)
  - [ ] Check if file exists first — if not, create `apps/web/src/components/chat/ChatMessage.test.ts`
  - [ ] Mock lucide-vue-next icons with `data-icon` attribute SVG stubs
  - [ ] Mock `@/components/ui/dropdown-menu` with simple stubs
  - [ ] Mock `@/components/ui/tooltip` with simple stubs (render slot content)
  - [ ] Mock `window.confirm` using `vi.spyOn(window, 'confirm')`
  - [ ] Context menu tests:
    - Context menu button (`aria-label="Message actions"`) NOT rendered when `isOwn=false`
    - Context menu button IS rendered when `isOwn=true`
  - [ ] Edit mode tests:
    - Clicking "Edit" in dropdown opens textarea pre-filled with message content
    - `Escape` key cancels edit and restores `<p>` content
    - `Enter` key submits edit and emits `requestEdit` with message ID and trimmed content
    - Clicking "Save" emits `requestEdit` with message ID and trimmed content
    - Clicking "Cancel" restores message body (no emit)
    - Does NOT submit if `editContent` is empty/whitespace
  - [ ] Delete tests:
    - Clicking "Delete" calls `window.confirm`
    - When `confirm` returns `true`, emits `requestDelete` with message ID
    - When `confirm` returns `false`, does NOT emit `requestDelete`
  - [ ] Edited indicator tests:
    - `(edited)` NOT shown when `message.updatedAt` is null
    - `(edited)` IS shown when `message.updatedAt` is non-null
  - [ ] Continuation row — same context menu tests as group row
  - [ ] `afterEach(() => { wrapper?.unmount(); wrapper = null; })` — test isolation

- [x] Task 16 — Update `ChatPanel.test.ts` — add isOwn prop passing and event handling (AC: #1, #3, #6)
  - [ ] Update `ChatMessage` stub to accept `isOwn` prop and emit `requestEdit`/`requestDelete`
  - [ ] Update `useChat` mock to include `editMessage: vi.fn()` and `deleteMessage: vi.fn()`
  - [ ] Add `useAuth` mock: `vi.mock('@/composables/useAuth', () => ({ useAuth: vi.fn(() => ({ user: ref({ id: 'user-001' }) })) }))`
  - [ ] Tests:
    - `isOwn=true` passed when `user.id === message.userId`
    - `isOwn=false` passed when `user.id !== message.userId`
    - `requestEdit` event from ChatMessage triggers `editMessage` with correct args
    - `requestDelete` event from ChatMessage triggers `deleteMessage` with correct messageId

---

## Dev Notes

### Architecture Constraints

**Module-level exports pattern** — `handleChatEdit` and `handleChatDelete` MUST be module-level exports (not inside factory). They are imported by `useWebSocket.ts` for WS message dispatch, identical to `handleUserUpdate`. If put inside the factory, you'd get a new function reference per call, breaking the import in useWebSocket.

**WS-driven local state** — `editMessage` and `deleteMessage` in the factory do NOT update local state directly. The server broadcasts a WS event after the REST call succeeds; `useWebSocket.ts` dispatches that to `handleChatEdit`/`handleChatDelete` which updates `messages.value`. This means local state is always consistent with what all clients see, not just the editor.

**Ownership check — server only** — The client shows/hides the context menu based on `isOwn` for UX, but the server always re-verifies ownership on the PATCH/DELETE endpoints. Never trust the client for security enforcement.

**`toApiChatMessage` fix** — The existing function hardcodes `editHistory: null` and `updatedAt: null`. This must be fixed before `editMessage` is functional — otherwise edited messages returned from the service will have null editHistory even after saving. The `getHistory` route filters `deletedAt: null`, so `deletedAt`/`deletedBy` remain null in practice and can stay hardcoded.

**Prisma message update** — `prisma.message.update` does NOT include `{ include: { user: true } }` for delete (not needed — we don't return a message shape). For edit, we don't include user either since `ChatEdit` doesn't require user fields.

**`c.body(null, 204)`** — Hono's `c.json({}, 204)` sends `{}` body which technically violates HTTP 204 semantics. Use `c.body(null, 204)` for correctness. Alternatively `c.json({ ok: true }, 200)` is acceptable for simplicity — check existing DELETE patterns in the codebase (`auth.ts` POST /logout).

**AppError in chatService** — `AppError` is currently only imported in route files. The service layer needs to import it directly: `import { AppError } from '../lib/errors.js'`. The global error handler in `app.ts` catches AppError instances thrown from anywhere in the middleware stack.

**Dropdown z-index** — The DropdownMenuContent needs adequate z-index to appear above adjacent messages. ShadCN's `DropdownMenuContent` defaults handle this; ensure the trigger parent doesn't have `overflow: hidden`.

**Edit textarea auto-resize** — The ChatInput textarea uses `resize-none` with fixed `rows=1`. The edit textarea should behave similarly. Do not attempt auto-resize; keep simple with `rows=1` and `max-h` if needed.

**`formatTime` reuse** — Already imported in `ChatMessage.vue` for `timeLabel`. Reuse it directly for `editedLabel` — no new import needed.

### Project Structure — Files to Modify / Create

```
apps/server/src/
  services/
    chatService.ts          ← MODIFY: fix toApiChatMessage, add editMessage, deleteMessage
    chatService.test.ts     ← MODIFY: add editMessage/deleteMessage tests + toApiChatMessage fix tests
  routes/
    chat.ts                 ← MODIFY: add PATCH and DELETE endpoints
    chat.test.ts            ← MODIFY: add PATCH and DELETE endpoint tests

apps/web/src/
  components/
    ui/
      dropdown-menu/        ← INSTALL: pnpm dlx shadcn-vue@latest add dropdown-menu
      tooltip/              ← INSTALL: pnpm dlx shadcn-vue@latest add tooltip
    chat/
      ChatMessage.vue       ← MODIFY: isOwn prop, context menu, edit mode, edited indicator
      ChatMessage.test.ts   ← CREATE (or MODIFY if exists): context menu + edit/delete tests
      ChatPanel.vue         ← MODIFY: pass isOwn, handle requestEdit/requestDelete
      ChatPanel.test.ts     ← MODIFY: update stubs, add isOwn/edit/delete tests

  composables/
    useChat.ts              ← MODIFY: add handleChatEdit, handleChatDelete (module-level),
                                       editMessage, deleteMessage (factory)
    useChat.test.ts         ← MODIFY: add handleChatEdit/Delete + editMessage/deleteMessage tests
    useWebSocket.ts         ← MODIFY: dispatch chat:edit and chat:delete
    useWebSocket.test.ts    ← MODIFY: add chat:edit/chat:delete dispatch tests

  vite.config.ts            ← MODIFY: add dropdown-menu + tooltip to coverage exclude
```

### Previous Story Learnings Applied

**From Story 4-1 (test isolation):**
- ALL new component tests MUST have `afterEach(() => { wrapper?.unmount(); wrapper = null; })`
- Declare `wrapper` as `let wrapper: VueWrapper | null = null` at suite level, not `const`

**From Story 4-3 (module-level exports):**
- Module-level refs are NOT returned from factory — they're imported directly by consumers
- `beforeEach` in tests must reset module-level refs: check if any module-level state is added in this story (answer: none new, but `messages.value` reset already covers `handleChatEdit`/`handleChatDelete`)

**From Story 4-4 (shadcn-vue coverage exclude):**
- All newly installed shadcn component directories MUST be added to `coverage.exclude` in `apps/web/vite.config.ts`
- Pattern: `'src/components/ui/dropdown-menu/**'` and `'src/components/ui/tooltip/**'`

**From Story 4-1 (lucide-vue-next icons in tests):**
- `findComponent({ name: 'MoreHorizontal' })` does NOT work with lucide-vue-next in JSDOM
- Mock lucide-vue-next with `data-icon` attributes on `<svg>` stubs:
  ```typescript
  vi.mock('lucide-vue-next', async (importOriginal) => {
    const actual = await importOriginal<typeof import('lucide-vue-next')>();
    return {
      ...actual,
      MoreHorizontal: defineComponent({
        template: '<svg data-icon="MoreHorizontal" />'
      }),
    };
  });
  ```
  Then query: `wrapper.find('[data-icon="MoreHorizontal"]')`

**From Story 4-4 (vi.hoisted for module-level mock):**
- If `useWebSocket.test.ts` mocks useChat module-level exports, use `vi.hoisted()` to avoid "Cannot access before initialization" errors

### Testing Approach

**`chatService.test.ts` mock additions:**
```typescript
vi.mock('../db/client.js', () => ({
  prisma: {
    message: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),  // ADD
      update: vi.fn(),      // ADD
    },
  },
}));
```

**`ChatMessage.test.ts` dropdown mock:**
```typescript
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: defineComponent({ template: '<div><slot/></div>' }),
  DropdownMenuTrigger: defineComponent({ template: '<div><slot/></div>' }),
  DropdownMenuContent: defineComponent({ template: '<div><slot/></div>' }),
  DropdownMenuItem: defineComponent({
    emits: ['click'],
    template: '<div @click="$emit(\'click\')"><slot/></div>'
  }),
}));
```

**`ChatMessage.test.ts` tooltip mock:**
```typescript
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: defineComponent({ template: '<div><slot/></div>' }),
  Tooltip: defineComponent({ template: '<div><slot/></div>' }),
  TooltipTrigger: defineComponent({ template: '<div><slot/></div>' }),
  TooltipContent: defineComponent({ template: '<div><slot/></div>' }),
}));
```

**`window.confirm` mock:**
```typescript
vi.spyOn(window, 'confirm').mockReturnValue(true);
// or: .mockReturnValue(false) to test cancellation
```

**Async emit testing (edit submit):**
- After triggering keydown Enter, await `nextTick()` before checking `wrapper.emitted('requestEdit')`

**ChatPanel.test.ts `useAuth` mock:**
```typescript
import { ref } from 'vue';
vi.mock('@/composables/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: ref({ id: 'user-001', displayName: 'Test', role: 'ViewerCompany' }) })),
}));
```

### UX Notes

**No DropdownMenu on continuation rows belonging to others** — `isOwn` prop correctly gates the entire context menu. There is no case where a non-owner sees Edit/Delete on any message.

**Delete is irreversible from user perspective** — Even though server soft-deletes, the message disappears from the chat immediately (client removes it on `chat:delete` WS event). The `window.confirm` dialog is the user's only chance to reconsider.

**Edit saves the trimmed content** — `editContent.value.trim()` is sent to the server. Whitespace-only edits are rejected client-side (same as `ChatInput`).

**`(edited)` indicator is read-only** — No interaction beyond the tooltip. It does not trigger re-edit. Users must hover the message and use the context menu again to edit a second time.

**Context menu z-index** — Messages with DropdownMenu open should float above adjacent messages. ShadCN DropdownMenuContent renders in a portal (via Radix UI), so z-index stacking context is isolated from message rows.

### References

- Story 4.5 epics definition: [Source: `_bmad-output/planning-artifacts/epics.md` §Story 4.5]
- FR23: Edit/delete own messages; revision history; soft-delete: [Source: `_bmad-output/planning-artifacts/epics.md` §Requirements Inventory]
- NFR15: Edit history append-only; no permanent data loss: [Source: `_bmad-output/planning-artifacts/epics.md` §NFR15]
- ChatMessage schema: `editHistory JSONB`, `updatedAt`, `deletedAt`, `deletedBy`: [Source: `apps/server/prisma/schema.prisma`]
- `ChatEdit` and `WsMessage` types: [Source: `packages/types/src/ws.ts`]
- `toApiChatMessage` function: [Source: `apps/server/src/services/chatService.ts` lines 29–43]
- Module-level export pattern: [Source: `apps/web/src/composables/useChat.ts` lines 7–32]
- `handleUserUpdate` pattern (module-level export for WS dispatch): [Source: `apps/web/src/composables/useChat.ts` lines 21–32]
- WS message dispatch: [Source: `apps/web/src/composables/useWebSocket.ts` lines 26–41]
- `apiFetch` and `ApiFetchError`: [Source: `apps/web/src/lib/api.ts`]
- `AppError` usage: [Source: `apps/server/src/lib/errors.ts`]
- `requireAuth` middleware: [Source: `apps/server/src/middleware/requireAuth.ts`]
- Hono route factory pattern: [Source: `apps/server/src/routes/chat.ts`]
- `formatTime` utility: [Source: `apps/web/src/lib/dateFormat.ts`]
- lucide-vue-next mock pattern: [Source: `_bmad-output/implementation-artifacts/4-4-unread-badge-sidebar-collapse-expand-and-state-persistence.md` §Debug Log References]
- shadcn coverage exclude pattern: [Source: `apps/web/vite.config.ts`]
- ShadCN `DropdownMenu`: Radix UI portal-rendered — z-index isolated by default: [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` §Design System Components]
- Story 4-1 test isolation lesson: [Source: `_bmad-output/implementation-artifacts/4-1-chat-panel-message-sending-and-real-time-delivery.md`]
- Story 4-4 shadcn install + coverage exclude pattern: [Source: `_bmad-output/implementation-artifacts/4-4-unread-badge-sidebar-collapse-expand-and-state-persistence.md`]
- UX design prototype (message hover actions): [Source: `_bmad-output/planning-artifacts/ux-design-directions.html`]

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- **ChatMessage.test.ts selector issue**: Initial `div[class]` selector for dropdown items failed because mocked `DropdownMenuItem` renders as classless `<div>`. Fixed to `findAll('div').find(el => el.element.textContent?.trim() === 'Edit')`.
- **Cancel button selector collision**: `button.hover\\:bg-accent` matched both the "Message actions" trigger button AND the Cancel button (both use `hover:bg-accent` class). Fixed to `findAll('button').find(b => b.text().trim() === 'Cancel')`.
- **TypeScript cast**: `vi.mocked(prisma.message.update).mock.calls[0][0]` required `as unknown as {...}` double-cast to extract `editHistory` without TypeScript errors.
- **Coverage**: `src/components/ui/**` glob already covers dropdown-menu and tooltip; individual entries would be redundant.

### Completion Notes List

- Installed `dropdown-menu` and `tooltip` shadcn-vue components; both already covered by `src/components/ui/**` coverage exclusion glob
- Fixed `toApiChatMessage` to correctly map `editHistory` and `updatedAt` from Prisma rows (were hardcoded null)
- Added `editMessage` and `deleteMessage` to `chatService.ts` with full ownership verification, soft-delete handling, edit history append, and WS broadcast
- Added `PATCH /api/chat/messages/:messageId` and `DELETE /api/chat/messages/:messageId` routes with validation and auth
- Added `handleChatEdit` and `handleChatDelete` as module-level exports in `useChat.ts` (WS-driven state updates)
- Added `editMessage` and `deleteMessage` factory methods to `useChat` (REST-only, WS handles local state)
- Updated `useWebSocket.ts` to dispatch `chat:edit` and `chat:delete` messages to their handlers
- Updated `ChatMessage.vue` with `isOwn` prop, context menu (DropdownMenu), edit mode (textarea), and `(edited)` tooltip indicator — applied to both group and continuation row variants
- Updated `ChatPanel.vue` to pass `isOwn` (user?.id === message.userId), import `useAuth`, and wire up `handleMessageEdit`/`handleMessageDelete` event handlers
- All 444 tests pass (169 server + 275 web); TypeScript clean; ESLint/Prettier clean

### File List

- `apps/server/src/services/chatService.ts` — modified: fixed `toApiChatMessage`, added `editMessage`, `deleteMessage`, imported `AppError` and `ChatEdit`
- `apps/server/src/services/chatService.test.ts` — modified: added `findUnique`/`update` mocks, `toApiChatMessage` fix tests, `editMessage` tests, `deleteMessage` tests
- `apps/server/src/routes/chat.ts` — modified: added `PATCH` and `DELETE` endpoints, imported `editMessage`/`deleteMessage`
- `apps/server/src/routes/chat.test.ts` — modified: added `PATCH` and `DELETE` test suites (14 new tests)
- `apps/web/src/composables/useChat.ts` — modified: added `handleChatEdit`, `handleChatDelete` module-level exports, `editMessage`/`deleteMessage` factory methods
- `apps/web/src/composables/useChat.test.ts` — modified: added `handleChatEdit`, `handleChatDelete`, `editMessage`, `deleteMessage` tests
- `apps/web/src/composables/useWebSocket.ts` — modified: imported `handleChatEdit`/`handleChatDelete`, dispatch `chat:edit` and `chat:delete`
- `apps/web/src/composables/useWebSocket.test.ts` — modified: added `chat:edit` and `chat:delete` dispatch tests with `vi.hoisted` mocks
- `apps/web/src/components/chat/ChatMessage.vue` — modified: added `isOwn` prop, `requestEdit`/`requestDelete` emits, context menu, edit mode, `(edited)` tooltip
- `apps/web/src/components/chat/ChatMessage.test.ts` — modified: rewrote with mocks for dropdown/tooltip/lucide, added all new context menu/edit/delete/indicator tests
- `apps/web/src/components/chat/ChatPanel.vue` — modified: imported `useAuth`, wired `editMessage`/`deleteMessage`, passes `isOwn` and event handlers to `ChatMessage`
- `apps/web/src/components/chat/ChatPanel.test.ts` — modified: updated `useChat`/`useAuth` mocks, added `isOwn` and edit/delete event tests
- `apps/web/src/components/ui/dropdown-menu/` — installed: 15 shadcn-vue generated files
- `apps/web/src/components/ui/tooltip/` — installed: 5 shadcn-vue generated files
