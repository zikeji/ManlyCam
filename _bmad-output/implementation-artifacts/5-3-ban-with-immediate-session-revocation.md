# Story 5.3: Ban with Immediate Session Revocation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **moderator or admin**,
I want to ban a user so their access is revoked immediately and all active sessions are terminated,
so that banned users cannot continue to view or interact with the stream.

## Acceptance Criteria

**AC 1 — "Ban" option available in profile context menu for non-banned users**
**Given** a moderator/admin opens a non-banned user's profile context menu (in `PresenceList.vue` or `ChatMessage.vue`)
**When** the menu renders
**Then** a "Ban" option is available.

**AC 2 — Ban action calls DELETE /api/users/:userId/ban**
**Given** the moderator/admin selects "Ban" and confirms the action
**When** the request is sent
**Then** the server executes a single `prisma.$transaction()` that: (1) sets `banned_at = NOW()` on the target user record; (2) deletes all rows in `sessions` where `user_id = targetId`.

**AC 3 — Subsequent requests fail session lookup**
**Given** the ban transaction commits
**When** any server middleware evaluates subsequent requests bearing a previously valid session cookie for that user
**Then** the session lookup fails (session row deleted); the user is redirected to the login page or receives `401 Unauthorized`.

**AC 4 — Active WebSocket connection revocation**
**Given** the banned user had an active WebSocket connection at ban time
**When** the ban transaction commits and sessions are deleted
**Then** the WS hub sends `{ type: 'session:revoked', payload: { reason: 'banned' } }` to all active WebSocket connections for that user ID, and then closes those connections.

**AC 5 — Client-side revocation handling**
**Given** a client receives a `{ type: 'session:revoked', payload: { reason: 'banned' } }` WS message
**When** the event is processed
**Then** the client immediately redirects the user to `/banned` (or `/login` with a banned message) and stops all further activity.

**AC 6 — Audit log entry created**
**Given** the ban is applied
**When** the action completes
**Then** an audit log row is created: `action = 'ban'`, `actor_id`, `target_id`, `performed_at`.

**AC 7 — Role hierarchy enforcement**
**Given** a Moderator attempts to ban a user with `role >= Moderator`
**When** the server processes the request
**Then** the server returns `403 Forbidden` with `{ error: { code: 'INSUFFICIENT_ROLE' } }`.

**AC 8 — No unban endpoint at MVP**
**Given** a user is banned
**When** the moderation UI is inspected
**Then** there is no "Unban" option; restoring access requires direct database intervention or a CLI command (unban can be added post-MVP).

## Tasks / Subtasks

- [x] Task 1: Server — Implement `banUser` in `moderationService.ts` (AC: #2, #4, #6, #7)
  - [x] 1.1: Add `banUser({ actorId, actorRole, targetUserId }: MuteParams): Promise<void>` to `apps/server/src/services/moderationService.ts`.
  - [x] 1.2: Implement `prisma.$transaction`: update user `bannedAt`, delete user sessions.
  - [x] 1.3: Create audit log entry.
  - [x] 1.4: Call `wsHub.revokeUserSessions(targetUserId, 'banned')`.
  - [x] 1.5: Enforce `canModerateOver(actorRole, target.role)` check.

- [x] Task 2: Server — Update `wsHub.ts` with `revokeUserSessions` (AC: #4)
  - [x] 2.1: Add `revokeUserSessions(userId: string, reason: string): void` to `apps/server/src/services/wsHub.ts`.
  - [x] 2.2: Find all connections for `userId`, send `session:revoked` message, and force close the connection.

- [x] Task 3: Server — Add ban route to `moderation.ts` (AC: #2, #7)
  - [x] 3.1: Add `DELETE /api/users/:userId/ban` to `apps/server/src/routes/moderation.ts`.
  - [x] 3.2: Use `requireAuth` and `requireRole(['Admin', 'Moderator'])`.
  - [x] 3.3: Call `moderationService.banUser`.

- [x] Task 4: Client — Handle `session:revoked` in `useWebSocket.ts` (AC: #5)
  - [x] 4.1: In `handleMessage`, check for `session:revoked`.
  - [x] 4.2: Redirect to `/banned` on receipt.

- [x] Task 5: Client — Update `PresenceList.vue` and `ChatMessage.vue` with Ban option (AC: #1, #7, #8)
  - [x] 5.1: Add "Ban" to context menus for moderators/admins.
  - [x] 5.2: Ensure "Ban" is only shown for outranked users.
  - [x] 5.3: Add confirmation dialog before calling ban API.

- [x] Task 6: Client — Create `BannedView.vue` (AC: #5)
  - [x] 6.1: Create a simple view explaining the user is banned.
  - [x] 6.2: Add route to `router/index.ts`.

- [x] Task 7: Verification & Testing
  - [x] 7.1: Add server tests for `banUser` service and route.
  - [x] 7.2: Add client tests for context menu and WS message handling.
  - [x] 7.3: Manual verification of immediate session termination.

## Dev Agent Record

### Implementation Plan

- Implement `banUser` in `moderationService.ts` using `prisma.$transaction` for atomicity.
- Update `WsHub` to support closing connections and sending revocation signals.
- Add moderation route for banning.
- Update client components (`PresenceList`, `ChatMessage`) with Ban option and `AlertDialog` confirmation.
- Handle `session:revoked` in `useWebSocket.ts` for immediate redirection.
- Add comprehensive tests for both server and client.

### Debug Log

- `vitest` hoisting issue in `useWebSocket.test.ts` fixed by using `vi.hoisted`.
- `AlertDialogAction` stub in tests updated to support slot content.

### Completion Notes

- All tasks completed and verified with tests.
- 75 tests passing in `apps/web`.
- 17 tests passing in `moderationService.test.ts`.
- 12 tests passing in `moderation.test.ts`.
- 15 tests passing in `wsHub.test.ts`.

## File List

- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/server/src/services/moderationService.ts`
- `apps/server/src/services/moderationService.test.ts`
- `apps/server/src/services/wsHub.ts`
- `apps/server/src/services/wsHub.test.ts`
- `apps/server/src/routes/moderation.ts`
- `apps/server/src/routes/moderation.test.ts`
- `apps/server/src/routes/ws.ts`
- `apps/web/src/composables/useWebSocket.ts`
- `apps/web/src/composables/useWebSocket.test.ts`
- `apps/web/src/components/chat/ChatPanel.vue`
- `apps/web/src/components/chat/PresenceList.vue`
- `apps/web/src/components/chat/PresenceList.test.ts`
- `apps/web/src/components/chat/ChatMessage.vue`
- `apps/web/src/components/chat/ChatMessage.test.ts`
- `apps/web/src/views/BannedView.vue`

## Change Log

- Implemented ban functionality with immediate session revocation.
- Added server-side transaction to update user status and delete sessions.
- Enhanced WebSocket hub to support targeted session revocation and connection closure.
- Updated UI components with Ban option and confirmation dialogs.
- Added comprehensive unit and integration tests for new functionality.

## Status

review

## Dev Notes

- Reuse `canModerateOver` logic from `roleUtils.ts`.
- The `requireSession` middleware already has some ban check logic from Story 2.3; verify it covers the session deletion case correctly (it should, as the session row will be gone).
- For `wsHub.revokeUserSessions`, iterate through `connections` Map and identify those matching `userId`.
- For the confirmation dialog in Vue, use `window.confirm` for MVP or the ShadCN `AlertDialog` if already established.

### Project Structure Notes

- Server: `apps/server/src/services/moderationService.ts`, `apps/server/src/routes/moderation.ts`, `apps/server/src/services/wsHub.ts`
- Client: `apps/web/src/components/chat/PresenceList.vue`, `apps/web/src/components/chat/ChatMessage.vue`, `apps/web/src/composables/useWebSocket.ts`, `apps/web/src/views/BannedView.vue`

### References

- [Source: apps/server/src/lib/roleUtils.ts] - Role hierarchy logic
- [Source: apps/server/src/services/moderationService.ts] - Pattern from Story 5.2
- [Source: packages/types/src/ws.ts] - `session:revoked` message type
- [Source: apps/server/prisma/schema.prisma] - `bannedAt` field on User model
