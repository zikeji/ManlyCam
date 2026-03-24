# Story 10.4: My Clips Page

Status: ready-for-review

## Story

As an **authenticated user**,
I want a My Clips page to view and manage my clips,
So that I can edit clip details, control visibility, share to chat, download, and delete clips.

## Acceptance Criteria

1. **GET /api/clips** returns paginated clips. Zero-indexed `page` param (`skip = page * limit`), default limit 20, newest-first. `deletedAt: null` filter on ALL query variants. By default: own clips only. `?includeShared=true`: adds non-private (`shared`/`public`) non-deleted clips from other users. Admin `?all=true`: all non-deleted clips regardless of owner/visibility. Non-Admin `?all=true` silently ignored. Each item includes `thumbnailUrl` as `{S3_PUBLIC_BASE_URL}/{thumbnailKey}`, name, description, status, visibility, duration, clipper info, creation date.

2. **My Clips page** renders own clips as cards: thumbnail, name, duration badge, visibility badge, status indicator, creation date. Pending clips show processing spinner. Failed clips show error state with Dismiss button. Ready clips show Edit, Share to Chat, Copy Link, Download, and Delete actions.

3. **Dismiss failed clip** calls `DELETE /api/clips/:id`, which hard-deletes (`prisma.clip.delete()`) the `status: 'failed'` record (no S3 objects exist). No `clip:visibility-changed` broadcast. Card removed from UI. 204 response.

4. **Delete ready clip** check order: (1) 401 unauth; (2) fetch clip -- not found/soft-deleted -> 404; (3) RBAC -- not owner AND `canModerateOver` fails -> 404 (not 403); (4) `status: 'pending'` -> 409 Conflict. For ready/failed clips: query `chatClipIds` (message IDs with this clip_id, capped 100), soft-delete (`deletedAt = new Date()`) in `prisma.$transaction()`. Then delete S3 video+thumbnail (only if `status: 'ready'`; skip for failed). S3 failure = orphaned objects (accepted). `clip:visibility-changed` broadcast with `{ clipId, visibility: 'deleted', chatClipIds }` fires ONLY after transaction commit. 204 response.

5. **Moderator/Admin delete non-owned clip** same logic, gated by `canModerateOver(actor.role, clip.owner.role)`. Moderator cannot delete Admin's clip -> 404. Audit log: `action: 'clip:deleted', actorId, targetId: clip.userId, metadata: { clipId, clipName }`. Audit only when `actorId !== clip.userId`.

6. **Edit clip** (owner only for name/description/visibility). Visibility options: `private` (always), `shared` (always), `public` (Moderator/Admin only).

7. **Public visibility PATCH** triggers attribution controls: "Show clipper" toggle; when enabled: "Show clipper avatar" toggle + "Clipper name" field (pre-filled with owner's display name). Server stores on clip record. `showClipperAvatar: true` snapshots owner's current `avatarUrl` into `clipperAvatarUrl` (null guard: if `avatarUrl` null, store `showClipperAvatar: false`). Re-enable re-snapshots. Server calls `PutObjectAcl(public-read)` on video S3 object (try/catch, non-fatal). Thumbnail already public-read.

8. **Visibility downgrade** (public -> shared/private): server calls `PutObjectAcl(private)` on video S3 object. Thumbnail stays public-read.

9. **PATCH /api/clips/:id** accepts partial body `{ name?, description?, visibility?, showClipper?, showClipperAvatar?, clipperName? }`. Check order: (1) 401; (2) fetch clip with `include: { user: { select: { avatarUrl: true } } }`; (3) not found/soft-deleted -> 404; (4) not owner AND `canModerateOver` fails -> 404; (5) Viewer/ViewerGuest setting `visibility: 'public'` -> 422. Returns 200 with full updated clip. `last_edited_at` updated only when name or description changes (not status/visibility/attribution).

10. **Moderator/Admin edit non-owned clip** writes separate audit log rows per changed category: `clip:edited` (name/desc), `clip:visibility-changed`, `clip:attribution-changed`. Audit only when `actorId !== clip.userId`.

11. **Visibility change with chat references** broadcasts `clip:visibility-changed` WsMessage with `{ clipId, visibility, chatClipIds }`. When `visibility` is `shared`/`public`, includes full clip card data for tombstone restoration. `clipThumbnailUrl` = `{S3_PUBLIC_BASE_URL}/{thumbnailKey}`. Omit null `clipperAvatarUrl`. Broadcast only after DB commit.

12. **Share to Chat** on ready clip: if `visibility: 'private'`, update to `shared` + create Message in `prisma.$transaction()`. Broadcast `chat:message` with clip card payload. Also broadcast `clip:visibility-changed` when visibility changed. No uniqueness constraint -- same clip can be shared multiple times. Server checks muted status -> 403 if muted.

13. **Muted users**: Share to Chat button hidden for all clips.

14. **Copy Link**: writes `/clips/{id}` to clipboard. If `private`, tooltip: "Only you can view this link".

15. **Download**: calls `GET /api/clips/:id/download` which presigns a redirect.

16. **Show shared clips toggle**: includes `shared`/`public` clips from other users, sorted newest-first globally (no pinning own clips to top).

17. `shared` visibility available to all authenticated roles including ViewerGuest. Only `public` is role-gated to Moderator/Admin.

18. **Admin "Show all clips" toggle**: all clips regardless of visibility/owner.

## Tasks / Subtasks

### Server

- [x] **Task 1: Clip service** (`apps/server/src/services/clipService.ts`) (AC: #1, #4, #5, #9, #10, #12)
  - [x] 1.1 `listClips({ userId, page, limit, includeShared, all, isAdmin })` -- paginated query with `deletedAt: null` filter; compute `thumbnailUrl` from `S3_PUBLIC_BASE_URL`
  - [x] 1.2 `deleteClip({ clipId, actor })` -- check order per AC #4; `prisma.$transaction()` for soft-delete; S3 cleanup (best-effort); `clip:visibility-changed` broadcast after commit
  - [x] 1.3 `updateClip({ clipId, actor, data })` -- partial update per AC #9 check order; `showClipperAvatar` null guard; S3 ACL transitions; audit logging per AC #10; `clip:visibility-changed` broadcast per AC #11
  - [x] 1.4 `shareClipToChat({ clipId, actor })` -- muted check; private->shared transition + Message insert in `prisma.$transaction()`; broadcast `chat:message` + `clip:visibility-changed`

- [x] **Task 2: Clip routes** (`apps/server/src/routes/clips.ts`) (AC: #1, #3, #4, #9, #12, #15)
  - [x] 2.1 `GET /api/clips` -- requireAuth, parse query params, call `listClips`
  - [x] 2.2 `PATCH /api/clips/:id` -- requireAuth, Zod body validation, call `updateClip`
  - [x] 2.3 `DELETE /api/clips/:id` -- requireAuth, call `deleteClip`
  - [x] 2.4 `POST /api/clips/:id/share` -- requireAuth, call `shareClipToChat`
  - [x] 2.5 Register clip router in `apps/server/src/app.ts`

- [x] **Task 3: Server tests** (`apps/server/src/services/clipService.test.ts`, `apps/server/src/routes/clips.test.ts`)
  - [x] 3.1 clipService unit tests: list pagination, delete check order (all 4 steps), RBAC, soft-delete, audit logging, share-to-chat muted check, visibility transitions
  - [x] 3.2 clips route integration tests: auth enforcement, query params, response shapes

### Web

- [x] **Task 4: Clips composable** (`apps/web/src/composables/useClips.ts`) (AC: #1, #3, #4, #6, #12, #14, #15)
  - [x] 4.1 `fetchClips({ page, includeShared, all })` via `apiFetch`
  - [x] 4.2 `deleteClip(clipId)`, `updateClip(clipId, data)`, `shareClipToChat(clipId)`
  - [x] 4.3 `copyClipLink(clipId, visibility)` -- clipboard write + tooltip logic
  - [x] 4.4 `downloadClip(clipId)` -- navigate to `/api/clips/:id/download`
  - [x] 4.5 Handle `clip:status-changed` and `clip:visibility-changed` WS messages for real-time updates

- [x] **Task 5: My Clips page** (`apps/web/src/views/MyClipsView.vue`) (AC: #2, #16, #18)
  - [x] 5.1 Card grid layout with thumbnail, name, duration, visibility badge, status
  - [x] 5.2 Pending state (spinner), failed state (error + Dismiss), ready state (action buttons)
  - [x] 5.3 "Show shared clips" toggle, Admin "Show all clips" toggle
  - [x] 5.4 Pagination (load more)

- [x] **Task 6: Clip edit form** (`apps/web/src/components/clips/ClipEditForm.vue`) (AC: #6, #7, #8, #17)
  - [x] 6.1 Name + description fields
  - [x] 6.2 Visibility selector (private/shared always; public for Mod/Admin only)
  - [x] 6.3 Attribution controls (show when public selected): show clipper toggle, show avatar toggle, clipper name field

- [x] **Task 7: Router update** (`apps/web/src/router/index.ts`) (AC: #2)
  - [x] 7.1 Add `/clips` route pointing to MyClipsView
  - [x] 7.2 Auth guard -- redirect unauthenticated to login

- [x] **Task 8: Web tests**
  - [x] 8.1 `useClips.test.ts` -- composable tests for fetch, delete, update, share, WS handlers
  - [x] 8.2 `MyClipsView.test.ts` -- card rendering, toggle states, pagination, action buttons
  - [x] 8.3 `ClipEditForm.test.ts` -- form fields, visibility options by role, attribution controls visibility

## Dev Notes

### Prerequisites

Story 10-2 (Clipping Infrastructure) MUST be completed first. It provides:

- `Clip` Prisma model with all columns (id, userId, name, description, status, visibility, s3Key, thumbnailKey, durationSeconds, showClipper, showClipperAvatar, clipperName, clipperAvatarUrl, createdAt, updatedAt, lastEditedAt, deletedAt)
- `clips` relation on User model
- `message_type` and `clip_id` columns on Message model
- `clip:status-changed` and `clip:visibility-changed` WsMessage types in `packages/types/src/ws.ts`
- `ClipChatMessage` type with tombstone support
- S3 client singleton at `apps/server/src/lib/s3-client.ts`
- S3 env vars in `apps/server/src/env.ts` (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_REGION, S3_PUBLIC_BASE_URL, MTX_HLS_URL)

Story 10-3 (Clip Creation Pipeline) provides:

- `POST /api/clips` endpoint
- `GET /api/clips/:id` endpoint
- `GET /api/clips/:id/download` endpoint (presigned redirect)
- Clip processing pipeline (ffmpeg + S3 upload)

### Architecture Patterns to Follow

**Server patterns:**

- Route file: `apps/server/src/routes/clips.ts` -- use `createClipsRouter()` named export, register in `app.ts` (follow `createModerationRouter()` pattern)
- Service file: `apps/server/src/services/clipService.ts` -- business logic separate from routes
- Use `requireAuth` middleware from `apps/server/src/middleware/requireAuth.ts` on all endpoints
- Use `canModerateOver()` and `ROLE_RANK` from `apps/server/src/lib/roleUtils.ts` -- never inline role comparisons
- Use `prisma.$transaction()` for multi-step operations (soft-delete + chatClipIds query; share-to-chat visibility change + message insert)
- Use Prisma singleton from `apps/server/src/db/client.ts`
- Use ULID singleton from `apps/server/src/lib/ulid.ts` for new message IDs
- Use `AppError` from `apps/server/src/lib/errors.ts`
- Audit logging: use existing `auditLogService.ts` pattern -- `action`, `actorId`, `targetId`, `metadata`
- S3 ACL operations: import S3 client from `apps/server/src/lib/s3-client.ts`, use `PutObjectAclCommand` from `@aws-sdk/client-s3`
- S3 presigned URLs: use `@aws-sdk/s3-request-presigner` (already in deps from 10-3)
- `thumbnailUrl` is ALWAYS `{env.S3_PUBLIC_BASE_URL}/{thumbnailKey}` -- never presign thumbnails
- WS broadcasts via `wsHub.broadcast()` or `wsHub.sendToUser()` from `apps/server/src/services/wsHub.ts`

**Web patterns:**

- Composable: `apps/web/src/composables/useClips.ts` -- stateful logic, API calls, WS message handling
- View: `apps/web/src/views/MyClipsView.vue` -- page component
- Component: `apps/web/src/components/clips/ClipEditForm.vue` -- edit form
- Use `apiFetch` from `apps/web/src/lib/api.ts` with `credentials: 'include'`
- Use `Role` from `@manlycam/types` for role checks
- Use Sonner (already available via `apps/web/src/components/ui/sonner/Sonner.vue`) for toast notifications
- Use existing ShadCN-Vue components: Badge, Button, Dialog, Tooltip, Switch, ScrollArea
- Router: add `/clips` route in `apps/web/src/router/index.ts`
- WS message handling: subscribe to `clip:status-changed` and `clip:visibility-changed` via `useWebSocket` composable

**RBAC Rules (CRITICAL):**

- DELETE: not owner AND `canModerateOver(actor.role, clip.owner.role)` fails -> 404 (not 403)
- PATCH: same RBAC check -> 404 (not 403)
- Viewer/ViewerGuest setting `visibility: 'public'` -> 422 (role-gated validation, not RBAC)
- Muted user Share to Chat -> 403 (server authoritative; UI hides button)
- Admin `?all=true` silently ignored for non-Admin (no error)

**S3 ACL Transition Rules:**

- Public: `PutObjectAcl(public-read)` on VIDEO only; thumbnail already public-read from upload
- Private/Shared: `PutObjectAcl(private)` on VIDEO only; thumbnail stays public-read forever
- ACL failures: logged but non-fatal (try/catch, do not fail the visibility transition)

**Soft-Delete Rules:**

- `DELETE /api/clips/:id` for `status: 'ready'` or `status: 'failed'` clips
- `status: 'failed'` -> hard delete (no S3 objects exist)
- `status: 'ready'` -> soft delete (set `deletedAt`), then S3 cleanup
- `status: 'pending'` -> 409 Conflict (must finish processing first)
- `onDelete: SetNull` on message FK is a safety net only; normal flow uses soft-delete

**Broadcast Timing (CRITICAL):**

- `clip:visibility-changed` broadcast fires ONLY after `prisma.$transaction()` commit
- Never broadcast optimistically before commit
- `chatClipIds` capped at first 100 message IDs

### Known Limitations (Accepted)

- Offset-based pagination may duplicate/skip items if clips created/deleted between pages
- S3 deletion failure orphans objects; operator can query `deletedAt IS NOT NULL` for cleanup
- `last_edited_at` only updates on name/description change, not visibility/status/attribution
- Concurrent PATCH requests on same clip may race (no optimistic locking in MVP)

### Project Structure Notes

- All new server files under `apps/server/src/` following existing patterns
- All new web files under `apps/web/src/` following existing patterns
- Tests co-located (`*.test.ts` next to source)
- Named exports only (no `export default`)
- ESM imports with `.js` extension in server code

### References

- [Source: _bmad-output/planning-artifacts/epics.md, Story 10-4 (lines 2214-2291)]
- [Source: _bmad-output/planning-artifacts/epics.md, Story 10-2 (lines 2083-2140) -- prerequisite infrastructure]
- [Source: _bmad-output/planning-artifacts/epics.md, Story 10-3 (lines 2142-2212) -- clip creation pipeline prereq]
- [Source: apps/server/src/routes/moderation.ts -- route pattern reference]
- [Source: apps/server/src/services/auditLogService.ts -- audit log pattern reference]
- [Source: apps/server/src/lib/roleUtils.ts -- canModerateOver, ROLE_RANK]
- [Source: apps/web/src/lib/api.ts -- apiFetch pattern]
- [Source: apps/web/src/router/index.ts -- router pattern]
- [Source: CLAUDE.md -- all project rules and conventions]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — no debug sessions required.

### Completion Notes List

1. **Role name fix**: All test fixtures used `role: 'Viewer'` which doesn't exist in `ROLE_RANK`. Fixed to `role: 'ViewerGuest'` throughout clipService.test.ts.
2. **vi.hoisted + require('vue') pattern**: `vi.mock` factories are hoisted before ESM imports resolve. `vi.hoisted(() => { const vueModule = require('vue'); ... })` is the correct pattern when Vue refs are needed in mock factories — used in MyClipsView.test.ts following WatchView.test.ts precedent.
3. **downloadClip test**: `window.location.href = url` is blocked in jsdom. Fixed by `vi.stubGlobal('location', { href: '' })` before calling the function.
4. **c8 ignore annotations**: Added on defensive/unreachable branches: `visibilityLabel` fallback, `onSaveEdit` null guard, `err instanceof Error` ternary else.
5. **useWebSocket integration**: `handleClipStatusUpdate` wired alongside the existing `handleClipStatusChanged` (from useClipCreate); `handleClipVisibilityChanged` added for new WS message type.
6. **Coverage**: All new lines covered or annotated with `/* c8 ignore next */`. Final: lines 98.34%, branches 93.92%, functions 87.62%, statements 98.34% (all above thresholds).

### File List

**Server:**
- `apps/server/src/services/clipService.ts` (new)
- `apps/server/src/services/clipService.test.ts` (new)
- `apps/server/src/routes/clips.ts` (new)
- `apps/server/src/routes/clips.test.ts` (new)
- `apps/server/src/app.ts` (modified — registered clips router)

**Web:**
- `apps/web/src/composables/useClips.ts` (new)
- `apps/web/src/composables/useClips.test.ts` (new)
- `apps/web/src/composables/useWebSocket.ts` (modified — wired clip WS handlers)
- `apps/web/src/views/MyClipsView.vue` (new)
- `apps/web/src/views/MyClipsView.test.ts` (new)
- `apps/web/src/components/clips/ClipEditForm.vue` (new)
- `apps/web/src/components/clips/ClipEditForm.test.ts` (new)
- `apps/web/src/router/index.ts` (modified — added /clips route + auth guard)
