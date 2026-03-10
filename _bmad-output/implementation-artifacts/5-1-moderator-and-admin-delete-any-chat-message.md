# Story 5.1: Moderator and Admin — Delete Any Chat Message

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **moderator or admin**,
I want to delete any user's chat message from the message context menu,
so that I can keep the chat appropriate without needing dev tooling.

## Acceptance Criteria

**AC 1 — Context menu appears for privileged users on permitted messages**
**Given** a Moderator or Admin right-clicks (desktop) or long-presses (mobile) on a message they are permitted to delete (per permission matrix below)
**When** the `ContextMenu` renders
**Then** a "Delete" option appears styled with destructive color (`text-red-400`)

**AC 2 — Context menu is inert for non-privileged users viewing others' messages**
**Given** a user with `role = ViewerCompany` or `role = ViewerGuest` right-clicks any message they do not own
**When** the context menu would render
**Then** no context menu popup appears (no trigger registered for that row)

**AC 3 — Client enforces the role permission matrix (context menu visibility)**
**Given** the current user is Moderator
**When** they right-click a message authored by another Moderator or any Admin
**Then** no context menu appears for that message row

**Given** the current user is Admin
**When** they right-click a message authored by another Admin
**Then** no context menu appears for that message row

**Given** the current user is Admin
**When** they right-click a message authored by a Moderator
**Then** a context menu appears with a "Delete" option

**AC 4 — Server soft-delete (moderator-initiated)**
**Given** a Moderator or Admin calls `DELETE /api/chat/messages/:messageId` for a message they are permitted to delete
**When** the server processes the request
**Then** it performs a soft-delete: sets `deleted_at = NOW()`, `deleted_by = callerId`; does NOT hard-delete the row

**AC 5 — Server enforces permission matrix (moderator cannot delete moderator/admin messages)**
**Given** a Moderator sends `DELETE /api/chat/messages/:messageId` for a message authored by another Moderator or any Admin
**When** the server processes the request
**Then** it returns `403 Forbidden` with `{ error: { code: 'INSUFFICIENT_ROLE', message: 'Cannot delete messages from users with equal or higher role.' } }`

**AC 6 — Server enforces permission matrix (admin cannot delete other admin messages)**
**Given** an Admin sends `DELETE /api/chat/messages/:messageId` for a message authored by a different Admin
**When** the server processes the request
**Then** it returns `403 Forbidden` with `{ error: { code: 'INSUFFICIENT_ROLE', message: 'Cannot delete messages from users with equal or higher role.' } }`

**AC 7 — Non-privileged users cannot delete others' messages**
**Given** a user with `role = ViewerCompany` or `role = ViewerGuest` sends `DELETE /api/chat/messages/:messageId` for a message they do not own
**When** the server processes the request
**Then** it returns `403 Forbidden` with `{ error: { code: 'FORBIDDEN', message: 'Insufficient permissions.' } }`

**AC 8 — Audit log written for moderator-initiated deletions**
**Given** a Moderator or Admin successfully deletes another user's message
**When** the soft-delete completes
**Then** an `AuditLog` row is created: `action = 'message_delete'`, `actorId = callerId`, `targetId = messageId`, `performedAt = NOW()`
**And** audit log is NOT created for self-deletes (own messages)

**AC 9 — Real-time broadcast removes message from all clients**
**Given** the soft-delete succeeds (either self-delete or moderator-initiated)
**When** the server broadcasts `{ type: 'chat:delete', payload: { messageId } }`
**Then** all connected clients remove the message from their visible chat list (outright removal, not a tombstone)

**AC 10 — Own-message context menu (Story 4-5) is unchanged**
**Given** any authenticated user right-clicks or long-presses their own message
**When** the context menu renders
**Then** both "Edit" and "Delete" options are present (existing behavior)
**And** the server correctly processes their self-delete without requiring mod-level role

**AC 11 — AlertDialog confirmation for all deletes**
**Given** a user selects "Delete" from the context menu (own message or moderator-initiated)
**When** the selection is processed
**Then** a shadcn `AlertDialog` appears with title "Delete message?", description "This action cannot be undone.", and "Cancel" / "Delete" buttons
**And** clicking "Cancel" dismisses the dialog without making any API call
**And** clicking "Delete" in the dialog confirms the action and triggers the API call
**And** shift-clicking "Delete" in the context menu bypasses the dialog entirely and calls the API immediately (power-user shortcut, consistent with Story 4-5)

**AC 12 — Mobile context menu via long-press**
**Given** any user on a touch device long-presses a message row they have permission to act on
**When** the long-press gesture completes
**Then** the `ContextMenu` popup appears (reka-ui `ContextMenuTrigger` handles touch long-press natively)
**And** the same Edit/Delete options appear as on desktop right-click

### Permission Matrix

| Caller Role | Can delete messages from |
|---|---|
| Admin | ViewerGuest, ViewerCompany, Moderator (not other Admins, except own) |
| Moderator | ViewerGuest, ViewerCompany (not Moderators, not Admins, except own) |
| ViewerCompany | Own messages only |
| ViewerGuest | Own messages only |

Own-message self-delete works for **all roles** regardless of the above (no change from Story 4-5).

## Tasks / Subtasks

- [x] Task 1: Install new shadcn-vue components (AC: #1, #11, #12)
  - [x] 1.1: From `apps/web`, run: `pnpm shadcn-vue add @shadcn/context-menu @shadcn/alert-dialog`
  - [x] 1.2: Verify `apps/web/src/components/ui/context-menu/` and `apps/web/src/components/ui/alert-dialog/` directories created with their `index.ts` exports

- [x] Task 2: Update shared types — add `authorRole` to `ChatMessage` (AC: #1, #3)
  - [x] 2.1: In `packages/types/src/ws.ts`, add `authorRole: Role` field to `ChatMessage` interface
  - [x] 2.2: Run `pnpm -w build` to ensure the type change is compiled across workspaces

- [x] Task 3: Server — add role rank utility (AC: #4, #5, #6, #7)
  - [x] 3.1: Create `apps/server/src/lib/roleUtils.ts` exporting `ROLE_RANK: Record<Role, number>` (`Admin: 3, Moderator: 2, ViewerCompany: 1, ViewerGuest: 0`) and `canModerateOver(callerRole: Role, targetRole: Role): boolean`
  - [x] 3.2: Write unit tests in `apps/server/src/lib/roleUtils.test.ts` covering all matrix cases

- [x] Task 4: Server — update `chatService.ts::deleteMessage` (AC: #4, #5, #6, #7, #8, #9)
  - [x] 4.1: Update function signature to `deleteMessage(params: { messageId: string; userId: string; callerRole: Role })`
  - [x] 4.2: Update `prisma.message.findUnique` to `include: { user: true }` so author's role is available
  - [x] 4.3: Self-delete path (`existing.userId === userId`): soft-delete only, no audit log (existing behavior)
  - [x] 4.4: Mod-delete path (`existing.userId !== userId`): check `ROLE_RANK[callerRole] >= ROLE_RANK.Moderator` → 403 `FORBIDDEN`; then `canModerateOver(callerRole, existing.user.role)` → 403 `INSUFFICIENT_ROLE`; then soft-delete + `AuditLog` entry
  - [x] 4.5: Update `toApiChatMessage` to include `authorRole: row.user.role as Role`
  - [x] 4.6: Write tests in `chatService.test.ts`: mod deletes valid target, mod attempts peer (403), mod attempts admin (403), admin deletes mod (ok), admin attempts peer admin (403), viewer attempts other (403)

- [x] Task 5: Server — update `chat.ts` route (AC: #4, #5, #6, #7)
  - [x] 5.1: Pass `callerRole: user.role as Role` to `deleteMessage` in `DELETE /api/chat/messages/:messageId`
  - [x] 5.2: Import `Role` type from `@manlycam/types`
  - [x] 5.3: Update `chat.test.ts`: fix existing `deleteMessage` call assertion to include `callerRole`; add tests for `INSUFFICIENT_ROLE` 403 path

- [x] Task 6: Web — refactor `ChatMessage.vue` to ContextMenu + AlertDialog (AC: #1, #2, #3, #10, #11, #12)
  - [x] 6.1: Remove the MoreHorizontal hover-button div (the `absolute inset-y-0 right-2` block) from BOTH template branches (continuation and group)
  - [x] 6.2: Add `canModerateDelete?: boolean` prop
  - [x] 6.3: Add `showDeleteDialog = ref(false)` and `executeDelete()` function (see Dev Notes)
  - [x] 6.4: Update `confirmDelete` — shift-click emits directly (existing); else set `showDeleteDialog = true` (replaces `window.confirm`)
  - [x] 6.5: Wrap the message row div in `<ContextMenu>` + `<ContextMenuTrigger as-child>` when `isOwn || canModerateDelete`; render a plain div otherwise (see template pattern in Dev Notes)
  - [x] 6.6: Add `<ContextMenuContent>` with `<ContextMenuItem>Edit</ContextMenuItem>` (v-if isOwn) and `<ContextMenuItem>Delete</ContextMenuItem>` (always shown when menu is rendered)
  - [x] 6.7: Add the `<AlertDialog>` once per component, outside the ContextMenu (see Dev Notes)
  - [x] 6.8: Update `ChatMessage.test.ts`: test context menu triggers for own/canModerateDelete/neither; test AlertDialog appears on Delete click; test shift-click bypasses dialog; test Edit absent when `canModerateDelete=true` + `isOwn=false`

- [x] Task 7: Web — update `ChatPanel.vue` (AC: #1, #2, #3)
  - [x] 7.1: Add `ROLE_RANK` constant and `canModerateDeleteMsg(msg)` function (see Dev Notes)
  - [x] 7.2: Pass `:can-moderate-delete="canModerateDeleteMsg(item.data)"` to `<ChatMessage>`
  - [x] 7.3: Add error handling in `handleMessageDelete` for 403 `INSUFFICIENT_ROLE` (see Dev Notes)
  - [x] 7.4: Update `ChatPanel.test.ts`: add tests verifying `canModerateDelete` prop value for various user role / message author role combinations

- [x] Task 8: Run full test suite and verify no regressions
  - [x] 8.1: `pnpm -w test` — all tests pass (215 server + 349 web = 564 total)
  - [x] 8.2: `pnpm -w typecheck` — TypeScript clean
  - [x] 8.3: `pnpm -w lint` — lint clean

## Dev Notes

### Component Installation

Run from `apps/web`:
```bash
pnpm shadcn-vue add @shadcn/context-menu @shadcn/alert-dialog
```

This creates:
- `apps/web/src/components/ui/context-menu/index.ts` — exports `ContextMenu`, `ContextMenuTrigger`, `ContextMenuContent`, `ContextMenuItem`, `ContextMenuSeparator`, etc.
- `apps/web/src/components/ui/alert-dialog/index.ts` — exports `AlertDialog`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`, `AlertDialogCancel`

### Permission Matrix Implementation

Create `apps/server/src/lib/roleUtils.ts`:

```typescript
import type { Role } from '@manlycam/types';

export const ROLE_RANK: Record<Role, number> = {
  Admin:         3,
  Moderator:     2,
  ViewerCompany: 1,
  ViewerGuest:   0,
};

/**
 * Returns true if callerRole can moderate (mute/ban/delete) a user/message with targetRole.
 * Caller must strictly outrank target. Used for all moderation operations in Stories 5-1 through 5-3.
 */
export function canModerateOver(callerRole: Role, targetRole: Role): boolean {
  return ROLE_RANK[callerRole] > ROLE_RANK[targetRole];
}
```

Do NOT inline this in `chatService.ts` — it will be reused in Stories 5-2 (mute/unmute) and 5-3 (ban).

### ChatMessage Type Update (packages/types/src/ws.ts)

```typescript
export interface ChatMessage {
  id: string
  userId: string
  displayName: string
  avatarUrl: string | null
  authorRole: Role          // ← ADD: needed for client-side permission matrix gating
  content: string
  editHistory: { content: string; editedAt: string }[] | null
  updatedAt: string | null
  deletedAt: string | null
  deletedBy: string | null
  createdAt: string
  userTag: UserTag | null
}
```

Update `toApiChatMessage` in `chatService.ts`:
```typescript
function toApiChatMessage(row: MessageRow): ChatMessage {
  return {
    // ... existing fields ...
    authorRole: row.user.role as Role,  // ← ADD
  };
}
```

### Updated deleteMessage (chatService.ts)

```typescript
export async function deleteMessage(params: {
  messageId: string;
  userId: string;
  callerRole: Role;
}): Promise<void> {
  const { messageId, userId, callerRole } = params;

  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    include: { user: true },  // need author's role for permission check
  });
  if (!existing) throw new AppError('Message not found', 'NOT_FOUND', 404);
  if (existing.deletedAt) throw new AppError('Message not found', 'NOT_FOUND', 404);

  if (existing.userId === userId) {
    // Self-delete: no role check, no audit log (existing behavior unchanged)
    await prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
  } else {
    // Moderator-initiated delete
    if (ROLE_RANK[callerRole] < ROLE_RANK.Moderator) {
      throw new AppError('Insufficient permissions.', 'FORBIDDEN', 403);
    }
    if (!canModerateOver(callerRole, existing.user.role as Role)) {
      throw new AppError(
        'Cannot delete messages from users with equal or higher role.',
        'INSUFFICIENT_ROLE',
        403,
      );
    }
    await prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    await prisma.auditLog.create({
      data: { id: ulid(), action: 'message_delete', actorId: userId, targetId: messageId },
    });
  }

  wsHub.broadcast({ type: 'chat:delete', payload: { messageId } });
}
```

### Route Update (chat.ts)

```typescript
import type { Role } from '@manlycam/types';

chatRouter.delete('/api/chat/messages/:messageId', requireAuth, async (c) => {
  const messageId = c.req.param('messageId');
  const user = c.get('user')!;
  await deleteMessage({ messageId, userId: user.id, callerRole: user.role as Role });
  return c.body(null, 204);
});
```

### ChatMessage.vue — Full Refactor Pattern

**Script changes:**

```typescript
// Replace DropdownMenu imports with:
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
// Remove: MoreHorizontal import from lucide-vue-next (if no longer used elsewhere)

// Add prop:
const props = defineProps<{
  message: ChatMessage;
  isContinuation?: boolean;
  isOwn?: boolean;
  canModerateDelete?: boolean;  // ← ADD
}>();

// Add AlertDialog state:
const showDeleteDialog = ref(false);

// Replace confirmDelete:
function confirmDelete(e?: MouseEvent) {
  if (e?.shiftKey) {
    emit('requestDelete', props.message.id);
    return;
  }
  showDeleteDialog.value = true;
}

// Add executeDelete:
function executeDelete() {
  showDeleteDialog.value = false;
  emit('requestDelete', props.message.id);
}
```

**Template pattern — ContextMenu wrapping:**

The message row needs to be wrapped in `<ContextMenu>` only when there are actions to show. Since the component has two branches (continuation and group), use `v-if` / `v-else` on each:

```vue
<!-- Continuation row example -->
<ContextMenu v-if="(isOwn || canModerateDelete) && !isEditing">
  <ContextMenuTrigger as-child>
    <div role="listitem" class="relative group px-3 py-0.5 pl-[52px] hover:bg-white/[.03]">
      <!-- message content (no hover button div) -->
    </div>
  </ContextMenuTrigger>
  <ContextMenuContent>
    <ContextMenuItem v-if="isOwn" @click="startEdit">Edit</ContextMenuItem>
    <ContextMenuItem @click="(e) => confirmDelete(e as MouseEvent)" class="text-red-400 focus:text-red-400">
      Delete
    </ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
<div v-else role="listitem" class="relative group px-3 py-0.5 pl-[52px] hover:bg-white/[.03]">
  <!-- same message content -->
</div>
```

Repeat the same `v-if` / `v-else` pattern for the group header row.

**AlertDialog — rendered once, outside the ContextMenu, at the bottom of `<template>`:**

```vue
<AlertDialog :open="showDeleteDialog" @update:open="showDeleteDialog = $event">
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete message?</AlertDialogTitle>
      <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        @click="executeDelete"
      >
        Delete
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**Notes on the v-if / v-else template duplication:**
- The message body content is duplicated between the `v-if` and `v-else` branches, but this is straightforward and correct
- The `isEditing` guard is moved to the `v-if` condition on ContextMenu (show plain div when editing)
- The inline editing textarea block remains inside both branches, gated by `v-if="!isEditing"` / `v-else` as before

### Mobile Context Menu (Resolves Hover Gap)

The switch to `ContextMenu` / `ContextMenuTrigger` (reka-ui) resolves the pre-existing mobile hover gap:
- **Desktop:** right-click on the message row triggers the context menu popup
- **Mobile:** long-press on the message row triggers the context menu popup
- reka-ui handles both gestures natively via `ContextMenuTrigger` — no additional touch event handling required

This replaces the previous approach of a `group-hover:opacity-100` trigger button that was invisible on touch devices.

### ChatPanel.vue — canModerateDeleteMsg

```typescript
import { Role } from '@manlycam/types'; // const object, not just type

const ROLE_RANK: Record<string, number> = {
  Admin: 3, Moderator: 2, ViewerCompany: 1, ViewerGuest: 0,
};

const isPrivileged = computed(() =>
  user.value?.role === Role.Admin || user.value?.role === Role.Moderator,
);

function canModerateDeleteMsg(msg: ChatMessageType): boolean {
  if (!user.value || !isPrivileged.value) return false;
  if (msg.userId === user.value.id) return false; // own messages handled by isOwn
  return (ROLE_RANK[user.value.role] ?? 0) > (ROLE_RANK[msg.authorRole] ?? 0);
}
```

Pass to `<ChatMessage>`:
```vue
<ChatMessage
  ...
  :can-moderate-delete="canModerateDeleteMsg(item.data)"
  ...
/>
```

**Error handling in `handleMessageDelete`:** If the API returns 403 `INSUFFICIENT_ROLE` (should not normally occur given client-side gating, but a safe fallback), log a warning. A `window.alert` is acceptable for MVP; do not add a new notification system in this story.

**NOTE on `ROLE_RANK` duplication:** The web app cannot import from `apps/server/src/lib/roleUtils.ts`. If sharing this constant across web + server is desired, export it from `packages/types`. This is NOT required for this story — inline in `ChatPanel.vue`.

### Error Code Distinction

Two distinct 403 codes:
- `FORBIDDEN` — caller has no mod-level permissions (non-privileged deleting others' messages)
- `INSUFFICIENT_ROLE` — caller is mod/admin but cannot outrank the target author

Both are `new AppError(message, code, 403)` — the error handler propagates them automatically.

### Existing Test that Must Change

`apps/server/src/routes/chat.test.ts` — the assertion at line ~460:
```typescript
// Before:
expect(deleteMessage).toHaveBeenCalledWith({ messageId: 'msg-001', userId: 'user-001' });
// After:
expect(deleteMessage).toHaveBeenCalledWith({ messageId: 'msg-001', userId: 'user-001', callerRole: expect.any(String) });
```

### UX Spec Analysis & Gap Flags

**⚠️ GAP: No UX spec for message context menu (addressed by this story)**

The `ChatMessage` component spec in `ux-design-specification.md` (lines 641–649) only describes `default · hover (subtle background)` states with no mention of a context menu. Story 4-5 established the MoreHorizontal dropdown pattern; this story replaces that with the more standard `ContextMenu` (right-click / long-press) pattern. The UX spec should be updated in a future UX pass to document this.

**✅ Mobile hover gap — RESOLVED by ContextMenu switch**

The pre-existing `group-hover:opacity-100` trigger was invisible on touch devices. Switching to `ContextMenu` + `ContextMenuTrigger` resolves this: reka-ui provides long-press support on touch devices natively. No separate mobile fix is needed.

**⚠️ GAP: No visual distinction between own-message and mod-delete menu**

Own messages: "Edit" + "Delete" in context menu.
Others' messages (mod-deletable): "Delete" only.
The UX spec doesn't define a different visual treatment — this implicit behavior is acceptable for MVP.

**⚠️ GAP: No tombstone vs. removal spec**

Epics say "remove from visible chat list" — outright removal (no "Message deleted" tombstone). Correct per spec and current `chat:delete` client handler behavior.

### Project Structure Notes

- `packages/types/src/ws.ts` — `ChatMessage` interface, add `authorRole: Role`. Named exports only.
- `apps/server/src/lib/roleUtils.ts` — NEW — `ROLE_RANK`, `canModerateOver`
- `apps/server/src/lib/roleUtils.test.ts` — NEW — unit tests
- `apps/server/src/services/chatService.ts` — update `deleteMessage`, `toApiChatMessage`
- `apps/server/src/routes/chat.ts` — pass `callerRole` to `deleteMessage`
- `apps/web/src/components/ui/context-menu/` — NEW (installed via shadcn CLI)
- `apps/web/src/components/ui/alert-dialog/` — NEW (installed via shadcn CLI)
- `apps/web/src/components/chat/ChatMessage.vue` — full refactor: ContextMenu + AlertDialog
- `apps/web/src/components/chat/ChatPanel.vue` — add `canModerateDeleteMsg` + prop passing

### References

- Epic 5 Story 5.1 definition: `_bmad-output/planning-artifacts/epics.md` lines 1161–1187
- Permission clarification (from user): Moderators cannot delete Moderator or Admin messages; Admins cannot delete other Admin messages; both can delete messages from roles they strictly outrank
- `ChatMessage` interface (current): `packages/types/src/ws.ts` lines 32–44
- `deleteMessage` current implementation: `apps/server/src/services/chatService.ts` lines 127–141
- `requireRole` middleware: `apps/server/src/middleware/requireRole.ts`
- `ChatMessage.vue` (current, to be refactored): `apps/web/src/components/chat/ChatMessage.vue`
- AuditLog Prisma model: `apps/server/prisma/schema.prisma` — `id CHAR(26) PK`, `action String`, `actorId CHAR(26)`, `targetId String?`, `metadata Json?`, `performedAt DateTime @default(now())`
- `chat:delete` WsMessage: `packages/types/src/ws.ts` — `{ type: 'chat:delete'; payload: { messageId: string } }`
- Role enum: `packages/types/src/ws.ts` — `Admin`, `Moderator`, `ViewerCompany`, `ViewerGuest`
- Architecture error response pattern: `{ error: { code: string, message: string } }` [Source: `_bmad-output/planning-artifacts/architecture.md`]
- UX ChatMessage spec (gap): `_bmad-output/planning-artifacts/ux-design-specification.md` lines 641–649
- UX Destructive button color: `hsl(0,65%,60%)` [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` line 716]
- shadcn-vue ContextMenu install: `pnpm shadcn-vue add @shadcn/context-menu` (reka-ui dependency, handles long-press on touch)
- shadcn-vue AlertDialog install: `pnpm shadcn-vue add @shadcn/alert-dialog`
- Previous story (presence/typing): `_bmad-output/implementation-artifacts/4-6-viewer-presence-list-and-typing-indicator.md`
- Previous story (own delete, Story 4-5): `_bmad-output/implementation-artifacts/4-5-own-message-edit-and-delete.md`
- ULID singleton: `apps/server/src/lib/ulid.ts` — always use this, never import `ulidx` directly
- Prisma singleton: `apps/server/src/db/client.ts` — never `new PrismaClient()`
- AppError: `apps/server/src/lib/errors.ts` — `new AppError(message, code, statusCode)`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation proceeded cleanly.

### Completion Notes List

1. **shadcn components committed separately** — `context-menu` and `alert-dialog` were installed and committed as a dedicated `chore(ui)` commit before story implementation work, per project convention.
2. **`canModerateOver('ViewerCompany', 'ViewerGuest')` returns `true`** — the function is a pure rank comparison; the Moderator-level guard at service level prevents viewers from ever reaching the mod-delete path. Test expectations updated to reflect this.
3. **`mountWithRole` helper removed** — it was scaffolded during development with an invalid `await` inside a non-async function. Unused; removed. Tests use `mountWithStub()` + `vi.mocked(useAuth).mockReturnValueOnce(...)` pattern instead.
4. **`useChat.test.ts` updated** — `mockMessage` fixture needed `authorRole` field added after `ChatMessage` interface was updated; not in original File List.
5. **Context menu `(e: MouseEvent)` type annotation** — template event handlers `(e) => confirmDelete(e as MouseEvent)` triggered `no-explicit-any` / implicit-any in vue-tsc; fixed by annotating `(e: MouseEvent) => confirmDelete(e)`.
6. **Two distinct 403 codes implemented** — `FORBIDDEN` (viewer trying to delete others' messages) vs `INSUFFICIENT_ROLE` (mod/admin trying to outrank equal/higher peer). Both propagated correctly through `AppError`.
7. **Test count: 564 total** (215 server + 349 web). Server: +25 net new (16 roleUtils + 12 chatService delete matrix + 2 chat.test.ts − existing count delta). Web: +36 net new (45 ChatMessage + 36 ChatPanel − prior counts).

### File List

- `packages/types/src/ws.ts` — add `authorRole: Role` to `ChatMessage` interface
- `apps/server/src/lib/roleUtils.ts` — NEW — `ROLE_RANK`, `canModerateOver`
- `apps/server/src/lib/roleUtils.test.ts` — NEW — unit tests for `canModerateOver` (16 tests)
- `apps/server/src/services/chatService.ts` — update `deleteMessage` (callerRole param, mod-delete path, audit log), update `toApiChatMessage` (authorRole)
- `apps/server/src/services/chatService.test.ts` — add moderator-delete permission tests
- `apps/server/src/routes/chat.ts` — pass `callerRole` to `deleteMessage`
- `apps/server/src/routes/chat.test.ts` — update existing assertion + add `INSUFFICIENT_ROLE` tests; add `authorRole` to `mockChatMessage`
- `apps/web/src/components/ui/context-menu/` — NEW (shadcn install, separate commit)
- `apps/web/src/components/ui/alert-dialog/` — NEW (shadcn install, separate commit)
- `apps/web/src/components/chat/ChatMessage.vue` — full refactor: remove hover button, add ContextMenu + AlertDialog, add `canModerateDelete` prop
- `apps/web/src/components/chat/ChatMessage.test.ts` — add ContextMenu visibility + AlertDialog + shift-click tests (45 tests)
- `apps/web/src/components/chat/ChatPanel.vue` — add `canModerateDeleteMsg` + `:can-moderate-delete` prop
- `apps/web/src/components/chat/ChatPanel.test.ts` — add `canModerateDelete` prop value tests (6 new tests)
- `apps/web/src/composables/useChat.test.ts` — add `authorRole` to `mockMessage` fixture
