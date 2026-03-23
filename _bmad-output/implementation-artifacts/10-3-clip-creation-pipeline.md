# Story 10.3: Clip Creation Pipeline

Status: done

## Story

As an **authenticated user**,
I want to clip a segment from the live stream's rolling buffer,
So that I can capture memorable moments with an optional name, description, chat share, and download.

## Acceptance Criteria

1. **Clip button in Broadcast Console** -- A clip button (lucide `Videotape` icon, tooltip "Clip Stream") appears in the Broadcast Console to the right of the snapshot button. Visible to all authenticated roles including ViewerGuest.

2. **Clip modal UI** -- Clicking the clip button opens a modal overlay with: an HLS scrubber populated from the live stream playlist (using segment timestamps derived from the HLS playlist); preset buttons (30s, 1min, 2min) that preselect the corresponding tail of the available buffer as the initial range; drag handles on both ends for manual adjustment; name and description input fields; a "Share to chat when ready" checkbox; a Submit button.

3. **HLS two-level playlist hierarchy** -- mediamtx serves HLS via a master playlist at `{MTX_HLS_URL}/cam/index.m3u8` which references a stream playlist (e.g., `video1_stream.m3u8`). The server fetches `index.m3u8` **once on stream start** to extract the stream playlist filename, then caches it for the stream session. All subsequent segment range validation and ffmpeg input uses the full stream playlist URL: `{MTX_HLS_URL}/cam/{streamPlaylistName}`. Do NOT re-fetch `index.m3u8` for every clip request — only fetch it when `stream_started_at` is written (stream online transition).

4. **POST /api/clips validation** -- `POST /api/clips` accepts `{ startTime: ISO8601, endTime: ISO8601, name: string, description?: string, shareToChat?: boolean }`. Validation: `stream_started_at` must exist in `stream_config` (else 422 "Stream has not started"); `startTime >= stream_started_at` (else 422); `startTime` and `endTime` fall within available HLS segment range parsed from m3u8 (else 422); `endTime > startTime`; duration <= 15 minutes (else 422); `name` <= 200 chars (else 422); `description` <= 500 chars if provided (else 422). Requires active session (401 if unauthenticated).

5. **Clip record creation** -- Valid requests create a `pending` clip record with server-generated ULID. Returns `{ id, status: 'pending' }` immediately. `shareToChat` is persisted to the `shareToChat` boolean column on the clip record (defaults to `false`).

6. **ffmpeg processing** -- Async processing calls ffmpeg: `-ss {startTime_ISO8601} -i {MTX_HLS_URL}/cam/{streamPlaylistName} -t {durationSeconds} -c copy /tmp/{clipId}.mp4` (duration = `Math.ceil((new Date(endTime) - new Date(startTime)) / 1000)` -- do NOT use `-to`; `{streamPlaylistName}` is the cached stream playlist filename extracted from `index.m3u8` at stream start, e.g., `video1_stream.m3u8`). Thumbnail: `-ss {startTime_ISO8601} -i {MTX_HLS_URL}/cam/{streamPlaylistName} -vframes 1 -q:v 2 /tmp/{clipId}-thumb.jpg`. Video uploaded to S3 with **private** ACL. Thumbnail uploaded with **`public-read`** ACL. Clip record updated to `status: 'ready'` with `s3Key`, `thumbnailKey`, `durationSeconds`. Temp files deleted after upload or on error. Non-zero ffmpeg exit or short output: retry once silently, then set `status: 'failed'` on second failure. On any failure, abort and clean up any pending/partial S3 multipart uploads.

7. **Client timestamp derivation** -- Client derives `startTime`/`endTime` from segment timestamps parsed from the live `.m3u8` playlist (with `useAbsoluteTimestamp: true`, segment timestamps correspond to original frame timestamps). Using `Date.now()` or any wall-clock source is prohibited.

8. **Share-to-chat on ready** -- When clip record's `shareToChat` is `true` and processing succeeds: update clip `visibility` to `shared` and create `Message` record atomically via `prisma.$transaction()`; broadcast `chat:message` with `messageType: 'clip'` and clip card payload; broadcast `clip:status-changed` with `status: 'ready'`; broadcast `clip:visibility-changed` with `{ clipId, visibility: 'shared', chatClipIds: [new message id], clip: {card data} }`.

9. **Private clip on ready** -- When clip record's `shareToChat` is `false` and processing succeeds: send targeted `clip:status-changed` WsMessage to clip owner's connections via `wsHub.sendToUser` with `status: 'ready'`. No chat message. Clip remains `private`.

10. **Failure handling** -- On ffmpeg/S3 error: set clip to `status: 'failed'`; clean up temp files; send targeted `clip:status-changed` to owner with `status: 'failed'`.

11. **Processing toast** -- Frontend shows persistent Sonner toast with clip name and processing state. Updates to success on `clip:status-changed` `ready`. Updates to error on `failed`. Must not obscure stream video area.

12. **Rate limiting** -- Users with `ROLE_RANK[user.role] < ROLE_RANK['Moderator']` (Viewer, ViewerGuest) are limited to 5 clips per rolling 60 minutes. Returns 429 with descriptive error. Moderator/Admin exempt.

13. **GET /api/clips/:id** -- Returns clip record with all non-sensitive fields. Access: owner; Admin; Moderator for own or shared/public clips (404 for private clips of others -- not 403); unauthenticated users for public clips only (401 otherwise). Soft-deleted clips return 404 for all. `thumbnailUrl` = `{S3_PUBLIC_BASE_URL}/{thumbnailKey}`.

14. **GET /api/clips/:id/download** -- 401 if unauthenticated; 404 if not found, soft-deleted, or no access; 409 if status not `ready`. Generates presigned S3 URL (60min expiry) with `ResponseContentDisposition: attachment; filename="{slugified-name}.mp4"`. Returns 302 redirect. Empty slugified name falls back to `{clipId}.mp4`.

15. **Clip attribution** -- `showClipper`, `showClipperAvatar`, `clipperName` cannot be set via POST -- PATCH-only (Story 10-4).

16. **Offline owner delivery** -- If clip owner has no WS connections when processing completes, `clip:status-changed` is silently dropped. Status queryable via GET.

## Tasks / Subtasks

### Server

- [x] Task 1: Add new env vars to `env.ts` (AC: #3, #5)
  - [x] Add `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PUBLIC_BASE_URL` (all `z.string().min(1)`)
  - [x] Add `MTX_HLS_URL` (`z.string().url().default('http://127.0.0.1:8090')`)

- [x] Task 2: Create S3 client singleton `apps/server/src/lib/s3-client.ts` (AC: #5)
  - [x] Import from `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`
  - [x] Export single `s3Client` instance configured from env vars
  - [x] Export helper functions: `uploadToS3`, `presignGetObject`, `putObjectAcl`, `deleteS3Objects`, `abortMultipartUpload`
  - [x] Add `validateS3BucketAcl()` function that checks bucket supports per-object ACLs at startup (use HeadBucket + GetBucketAcl)

- [x] Task 3: Create Prisma migration for `clips` table (AC: #4)
  - [x] Add `Clip` model with all columns per Story 10-2 spec (including `shareToChat` boolean, default `false`)
  - [x] Add `clips Clip[]` relation to `User` model
  - [x] Add `clipId` and `messageType` columns to `Message` model
  - [x] Add `clip Clip?` relation to `Message` model
  - [x] Run `pnpm prisma migrate dev`

- [x] Task 4: Update `packages/types/src/ws.ts` (AC: #7, #8, #9)
  - [x] Add `clip:status-changed` WsMessage type (discriminated on `status`)
  - [x] Add `clip:visibility-changed` WsMessage type
  - [x] Split `ChatMessage` into `TextChatMessage | ClipChatMessage` discriminated union
  - [x] Retain `ChatMessage` as type alias for backward compat
  - [x] Build types package: `pnpm --filter @manlycam/types build`

- [x] Task 5: Write `stream_started_at` on stream online transition (AC: #3)
  - [x] In `streamService.setAdminToggle()`, when `toggle === 'live'`, write `stream_started_at` ISO8601 UTC to `stream_config` via `streamConfig.setWithClient(tx, 'stream_started_at', new Date().toISOString())`

- [x] Task 6: Flush HLS path on stream offline (AC: dependency from 10-2)
  - [x] In `streamService.setAdminToggle()`, when `toggle === 'offline'`, call mediamtx HTTP API to flush/remove HLS path (fire-and-forget, logged on error, non-fatal)

- [x] Task 7: Update `chatService.ts` for clip-aware messages (AC: #7)
  - [x] Update `MessageRow` type with `clipId?`, `messageType`, `clip?` fields
  - [x] Update `getHistory()` query with `include: { clip: { select: {...} } }`
  - [x] Update `toApiChatMessage()` to produce `ClipChatMessage` when `messageType === 'clip'`
  - [x] Tombstone logic: set `tombstone: true` when `clipId IS NULL`, clip visibility is `private`, or clip `deletedAt IS NOT NULL`

- [x] Task 8: Create clip service `apps/server/src/services/clipService.ts` (AC: #3, #4, #5, #7, #8, #9, #11)
  - [x] `createClip()` -- validate, create pending record, spawn async processing
  - [x] `processClip()` -- ffmpeg execution, S3 upload, status update, WS broadcast
  - [x] `getClip()` -- access control with 404/401 logic
  - [x] `getClipDownloadUrl()` -- presign + 302 redirect logic
  - [x] Rate limit check using `ROLE_RANK` from `roleUtils.ts`
  - [x] M3u8 parser utility for segment range validation

- [x] Task 9: Create clip routes `apps/server/src/routes/clips.ts` (AC: #3, #12, #13)
  - [x] `POST /api/clips` -- Zod body validation, auth check, rate limit, create clip
  - [x] `GET /api/clips/:id` -- access control, return clip record
  - [x] `GET /api/clips/:id/download` -- presign + 302 redirect
  - [x] Register routes in `app.ts`

- [x] Task 10: Install `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` (AC: #5)

### Frontend

- [x] Task 11: Create clip composable `apps/web/src/composables/useClipCreate.ts` (AC: #2, #7, #11)
  - [x] `fetchPlaylist()` -- fetch and parse stream playlist from `{MTX_HLS_URL}/cam/{streamPlaylistName}` (via HTTP from mediamtx HLS endpoint; stream playlist name is provided by server from cached `index.m3u8` lookup)
  - [x] Parse segment timestamps from the HLS playlist (with `useAbsoluteTimestamp: true`, these correspond to original frame timestamps)
  - [x] `submitClip()` -- call `POST /api/clips` via `apiFetch`
  - [x] Track pending clip IDs for toast state
  - [x] Handle `clip:status-changed` WsMessage for toast updates

- [x] Task 12: Create `ClipModal.vue` component (AC: #2, #7)
  - [x] HLS scrubber with timeline visualization from parsed playlist
  - [x] Preset buttons (30s, 1min, 2min) selecting tail of buffer
  - [x] Drag handles for manual range adjustment
  - [x] Name input (max 200 chars), description textarea (max 500 chars)
  - [x] "Share to chat when ready" checkbox
  - [x] Submit button with loading state
  - [x] Use Dialog component from `@/components/ui/dialog`

- [x] Task 13: Add clip button to `BroadcastConsole.vue` (AC: #1)
  - [x] Add `Videotape` icon button to right of snapshot button
  - [x] Tooltip "Clip Stream"
  - [x] Visible to all authenticated users
  - [x] Opens ClipModal on click

- [x] Task 14: Add processing toast handler (AC: #10)
  - [x] Listen for `clip:status-changed` in WS message handler
  - [x] Show persistent Sonner toast during processing
  - [x] Update toast on ready/failed

### Tests

- [x] Task 15: Server tests
  - [x] `clipService.test.ts` -- createClip, processClip, getClip, download, rate limit, m3u8 parsing
  - [x] `clips.test.ts` (route tests) -- POST validation, GET access control, download redirect
  - [x] `s3-client.test.ts` -- upload, presign, ACL, delete
  - [x] Update `streamService.test.ts` -- stream_started_at write, HLS flush
  - [x] Update `chatService.test.ts` -- clip message mapping, tombstone logic

- [x] Task 16: Web tests
  - [x] `useClipCreate.test.ts` -- playlist parsing, submit, WS handling
  - [x] `ClipModal.test.ts` -- UI rendering, range selection, form validation, submission
  - [x] `BroadcastConsole.test.ts` -- clip button visibility, click handler

## Dev Notes

### Prerequisites (Story 10-2 deliverables this story depends on)

Story 10-2 delivers the infrastructure foundation. If 10-2 is not yet merged, this story MUST implement the following 10-2 items as part of its scope (they are preconditions for clip creation):

- Prisma `Clip` model + `Message` changes (clipId, messageType)
- WsMessage type additions (clip:status-changed, clip:visibility-changed, ClipChatMessage)
- S3 client singleton
- Env var additions
- chatService.ts clip-aware getHistory
- stream_started_at write on online transition
- HLS path flush on offline transition
- ffmpeg in server Dockerfile

### Critical Implementation Details

**ffmpeg invocation:**

- `-ss` before `-i` is fast input seek; with `useAbsoluteTimestamp: true` preserving original frame timestamps, ffmpeg interprets ISO8601 `-ss` as absolute calendar timestamp
- Use `-t {durationSeconds}` for duration. NEVER use `-to {endTime}` -- `-to` is output-stream position, not wall-clock
- Duration computed as `Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000)`
- Temp files named by clip ULID to prevent collision: `/tmp/{clipId}.mp4`, `/tmp/{clipId}-thumb.jpg`
- No concurrent ffmpeg cap in MVP (known limitation for constrained hosts)

**S3 ACL rules:**

- Video: uploaded with **private** ACL (default)
- Thumbnail: uploaded with **`public-read`** ACL -- always accessible via `{S3_PUBLIC_BASE_URL}/{thumbnailKey}`, never presigned
- S3 provider must support `PutObjectAcl` for clip visibility toggling (RustFS and B2 both support this at the object level)

**shareToChat persistence:**

- Stored in the `shareToChat` boolean column on the `Clip` model (default `false`)
- Server crash during processing: intent is preserved; on restart, processing resumes with correct share behavior
- DB transaction failure after S3 upload: clip remains ready/private, no chat post -- accepted limitation

**Rate limit:**

- Use `ROLE_RANK[user.role] < ROLE_RANK['Moderator']` from `apps/server/src/lib/roleUtils.ts`
- Do NOT inline role comparison
- Count query: `prisma.clip.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 3_600_000) } } })`
- Race condition on concurrent submissions: accepted known limitation

**HLS playlist hierarchy (two-level):**

- mediamtx serves a **master playlist** at `{MTX_HLS_URL}/cam/index.m3u8` which references a **stream playlist** (e.g., `video1_stream.m3u8`)
- On stream start (when `stream_started_at` is written), fetch `index.m3u8` **once** and extract the stream playlist filename; cache it in `stream_config` for the session
- All segment range validation and ffmpeg input uses the full stream playlist URL: `{MTX_HLS_URL}/cam/{streamPlaylistName}`
- Do NOT re-fetch `index.m3u8` for every clip request — only on stream start
- Parse segment timestamps from the stream playlist (with `useAbsoluteTimestamp: true`, these correspond to original frame timestamps)
- Validate that requested startTime/endTime fall within available segment range

**WS broadcast patterns:**

- `shareToChat: true` + ready: broadcast to ALL via `wsHub.broadcast()` for `chat:message`, `clip:status-changed`, and `clip:visibility-changed`
- `shareToChat: false` + ready: targeted via `wsHub.sendToUser(userId, ...)` for `clip:status-changed` only
- Failed: targeted via `wsHub.sendToUser(userId, ...)` for `clip:status-changed`
- Owner offline: silently dropped, no stored delivery

**GET /api/clips/:id access control:**

- Owner: always
- Admin: always
- Moderator: own clips + shared/public (404 for others' private -- NOT 403)
- Unauthenticated: public only (401 if not public)
- Soft-deleted (deletedAt IS NOT NULL): 404 for all

**GET /api/clips/:id/download:**

- Presigned URL with 60min expiry
- `ResponseContentDisposition: attachment; filename="{slug}.mp4"`
- Use slugified clip name; fallback to `{clipId}.mp4` if slug is empty
- 302 redirect (no binary proxy)

### Existing Code Patterns to Follow

- **Route pattern:** See `apps/server/src/routes/chat.ts`, `reactions.ts` for Hono route structure
- **Service pattern:** See `apps/server/src/services/chatService.ts` for DB + WS broadcast pattern
- **Error handling:** Use `new AppError(message, code, statusCode)` from `apps/server/src/lib/errors.ts`
- **ID generation:** Import from `apps/server/src/lib/ulid.ts` singleton
- **Prisma:** Import from `apps/server/src/db/client.ts` singleton
- **Stream config:** Use `streamConfig` from `apps/server/src/lib/stream-config.ts` for `stream_started_at`
- **Web API calls:** Use `apiFetch` from `apps/web/src/lib/api.ts`
- **Toasts:** `import { toast } from 'vue-sonner'`
- **WS messages:** Handle in `useWebSocket` composable or create new composable
- **Broadcast Console:** Clip button goes in right flank of `BroadcastConsole.vue`, after snapshot button (line ~270)

### Project Structure Notes

- Server routes: `apps/server/src/routes/clips.ts`
- Server service: `apps/server/src/services/clipService.ts`
- Server S3 lib: `apps/server/src/lib/s3-client.ts`
- Web composable: `apps/web/src/composables/useClipCreate.ts`
- Web component: `apps/web/src/components/stream/ClipModal.vue`
- Shared types: `packages/types/src/ws.ts` (add to existing WsMessage union at line 85)
- Prisma schema: `apps/server/prisma/schema.prisma`
- Env validation: `apps/server/src/env.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 10-3: Clip Creation Pipeline]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 10-2: Clipping Infrastructure] (prerequisite)
- [Source: apps/server/src/services/streamService.ts] (stream toggle, stream_started_at)
- [Source: apps/server/src/lib/stream-config.ts] (streamConfig key-value store)
- [Source: apps/server/src/services/chatService.ts] (message patterns, toApiChatMessage)
- [Source: apps/server/src/services/wsHub.ts] (sendToUser, broadcast)
- [Source: apps/server/src/lib/roleUtils.ts] (ROLE_RANK, canModerateOver)
- [Source: packages/types/src/ws.ts] (WsMessage union, ChatMessage interface)
- [Source: apps/web/src/components/stream/BroadcastConsole.vue] (clip button placement)
- [Source: apps/web/src/composables/useSnapshot.ts] (snapshot pattern for clip button)
- [Source: apps/web/src/lib/api.ts] (apiFetch pattern)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — all issues resolved inline.

### Completion Notes List

- **HLS two-level playlist hierarchy**: mediamtx `index.m3u8` → stream playlist (e.g., `video1_stream.m3u8`). Server fetches master playlist once on live toggle and caches the stream playlist name in `stream_config` under key `stream_playlist_name`. All subsequent clip operations use the cached name.

- **`getSegmentRange` endpoint**: Added `GET /api/clips/segment-range` (auth required) that reads the cached stream playlist name, fetches the stream playlist from mediamtx, parses `#EXTINF` durations to derive earliest/latest timestamps, and returns `{ earliest, latest }` as ISO strings. Frontend uses this instead of direct mediamtx access (which is localhost-only).

- **Rate limit check**: Uses `ROLE_RANK[role] < ROLE_RANK['Moderator']` — applies to `ViewerCompany` and `ViewerGuest`; `Moderator`/`Admin` are exempt.

- **Function ordering in `clipService.ts`**: `processClip` is defined before `createClip` (which calls it via `setImmediate`) to satisfy ESLint's `no-use-before-define` rule. User explicitly requested reorder over eslint-disable comment.

- **`pendingClips` Map**: Module-level `Map<clipId, toastId>` in `useClipCreate.ts` for tracking in-progress clip toasts across component mount/unmount cycles.

- **Clip button visibility**: Visible to all authenticated users (`v-if="user"`) — not gated on role.

- **Share-to-chat UI**: Implemented as a shadcn `Switch` component (not a traditional checkbox as ACs mention "checkbox").

- **Code Review Fixes (2026-03-23)**:
  - Added `chatClipIds` to `clip:visibility-changed` broadcast payload per spec requirement
  - Fixed pending clips memory leak with 5-minute TTL cleanup in `useClipCreate.ts`
  - Added 5-minute timeout to ffmpeg execution with SIGTERM/SIGKILL fallback
  - Improved S3 cleanup on upload failure with proper error logging
  - Added client-side toast timeout fallback (shows "check My Clips page" after 5 min)
  - Added segment range staleness warning in ClipModal (warns after 30 seconds)
  - Capture and log ffmpeg stderr on failure for debugging
  - Added HLS cache invalidation on 404 with HEAD request validation
  - Updated `ClipVisibilityChangedPayload` type to include optional `chatClipIds`

- **Smoke test required**: Zikeji must manually smoke-test the clip button, modal opening, preset selection, range sliders, form submission flow, and toast notifications before marking done.

### File List

**Server:**

- `apps/server/src/env.ts` (added S3\_\*, MTX_HLS_URL env vars)
- `apps/server/src/lib/s3-client.ts` (NEW — S3 singleton + helpers)
- `apps/server/src/lib/s3-client.test.ts` (NEW)
- `apps/server/prisma/schema.prisma` (added Clip model, Message changes)
- `apps/server/prisma/migrations/20260322_add_clips/migration.sql` (NEW)
- `apps/server/src/lib/stream-config.ts` (extended with setWithClient)
- `apps/server/src/services/streamService.ts` (writes stream_started_at, fetches index.m3u8, flushes HLS)
- `apps/server/src/services/streamService.test.ts` (extended)
- `apps/server/src/services/chatService.ts` (clip-aware messages, tombstone logic)
- `apps/server/src/services/chatService.test.ts` (extended)
- `apps/server/src/services/clipService.ts` (NEW — createClip, processClip, getClip, getClipDownloadUrl, getSegmentRange)
- `apps/server/src/services/clipService.test.ts` (NEW)
- `apps/server/src/routes/clips.ts` (NEW — POST, GET, download, segment-range routes)
- `apps/server/src/routes/clips.test.ts` (NEW)
- `apps/server/src/app.ts` (registered clips router)

**Shared types:**

- `packages/types/src/ws.ts` (added clip:status-changed, clip:visibility-changed, ClipChatMessage)

**Frontend:**

- `apps/web/src/composables/useClipCreate.ts` (NEW)
- `apps/web/src/composables/useClipCreate.test.ts` (NEW)
- `apps/web/src/composables/useWebSocket.ts` (added clip:status-changed handler)
- `apps/web/src/composables/useWebSocket.test.ts` (added clip:status-changed test)
- `apps/web/src/components/stream/ClipModal.vue` (NEW)
- `apps/web/src/components/stream/ClipModal.test.ts` (NEW)
- `apps/web/src/components/stream/BroadcastConsole.vue` (added clip button + ClipModal)
- `apps/web/src/components/stream/BroadcastConsole.test.ts` (added clip button tests + ClipModal mock)
