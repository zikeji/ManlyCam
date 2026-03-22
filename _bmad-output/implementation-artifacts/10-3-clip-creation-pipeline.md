# Story 10.3: Clip Creation Pipeline

Status: ready-for-dev

## Story

As an **authenticated user**,
I want to clip a segment from the live stream's rolling buffer,
So that I can capture memorable moments with an optional name, description, chat share, and download.

## Acceptance Criteria

1. **Clip button in Broadcast Console** -- A clip button (lucide `Videotape` icon, tooltip "Clip Stream") appears in the Broadcast Console to the right of the snapshot button. Visible to all authenticated roles including ViewerGuest.

2. **Clip modal UI** -- Clicking the clip button opens a modal overlay with: an HLS scrubber populated from the live `.m3u8` playlist (using `EXT-X-PROGRAM-DATE-TIME` timestamps); preset buttons (30s, 1min, 2min) that preselect the corresponding tail of the available buffer as the initial range; drag handles on both ends for manual adjustment; name and description input fields; a "Share to chat when ready" checkbox; a Submit button.

3. **POST /api/clips validation** -- `POST /api/clips` accepts `{ startTime: ISO8601, endTime: ISO8601, name: string, description?: string, shareToChat?: boolean }`. Validation: `stream_started_at` must exist in `stream_config` (else 422 "Stream has not started"); `startTime >= stream_started_at` (else 422); `startTime` and `endTime` fall within available HLS segment range parsed from m3u8 (else 422); `endTime > startTime`; duration <= 15 minutes (else 422); `name` <= 200 chars (else 422); `description` <= 500 chars if provided (else 422). Requires active session (401 if unauthenticated).

4. **Clip record creation** -- Valid requests create a `pending` clip record with server-generated ULID. Returns `{ id, status: 'pending' }` immediately. `shareToChat` is persisted to the `shareToChat` boolean column on the clip record (defaults to `false`).

5. **ffmpeg processing** -- Async processing calls ffmpeg: `-ss {startTime_ISO8601} -i {HLS_SEGMENTS_PATH}/{MTX_STREAM_PATH}.m3u8 -t {durationSeconds} -c copy /tmp/{clipId}.mp4` (duration = `Math.ceil((new Date(endTime) - new Date(startTime)) / 1000)` -- do NOT use `-to`). Thumbnail: `-ss {startTime_ISO8601} -i {HLS_SEGMENTS_PATH}/{MTX_STREAM_PATH}.m3u8 -vframes 1 -q:v 2 /tmp/{clipId}-thumb.jpg`. Video uploaded to S3 with **private** ACL. Thumbnail uploaded with **`public-read`** ACL. Clip record updated to `status: 'ready'` with `s3Key`, `thumbnailKey`, `durationSeconds`. Temp files deleted after upload or on error. Non-zero ffmpeg exit or short output: retry once silently, then set `status: 'failed'` on second failure. On any failure, abort and clean up any pending/partial S3 multipart uploads.

6. **Client timestamp derivation** -- Client derives `startTime`/`endTime` exclusively from `EXT-X-PROGRAM-DATE-TIME` timestamps parsed from the live `.m3u8` playlist. Using `Date.now()` or any wall-clock source is prohibited.

7. **Share-to-chat on ready** -- When clip record's `shareToChat` is `true` and processing succeeds: update clip `visibility` to `shared` and create `Message` record atomically via `prisma.$transaction()`; broadcast `chat:message` with `messageType: 'clip'` and clip card payload; broadcast `clip:status-changed` with `status: 'ready'`; broadcast `clip:visibility-changed` with `{ clipId, visibility: 'shared', chatClipIds: [new message id], clip: {card data} }`.

8. **Private clip on ready** -- When clip record's `shareToChat` is `false` and processing succeeds: send targeted `clip:status-changed` WsMessage to clip owner's connections via `wsHub.sendToUser` with `status: 'ready'`. No chat message. Clip remains `private`.

9. **Failure handling** -- On ffmpeg/S3 error: set clip to `status: 'failed'`; clean up temp files; send targeted `clip:status-changed` to owner with `status: 'failed'`.

10. **Processing toast** -- Frontend shows persistent Sonner toast with clip name and processing state. Updates to success on `clip:status-changed` `ready`. Updates to error on `failed`. Must not obscure stream video area.

11. **Rate limiting** -- Users with `ROLE_RANK[user.role] < ROLE_RANK['Moderator']` (Viewer, ViewerGuest) are limited to 5 clips per rolling 60 minutes. Returns 429 with descriptive error. Moderator/Admin exempt.

12. **GET /api/clips/:id** -- Returns clip record with all non-sensitive fields. Access: owner; Admin; Moderator for own or shared/public clips (404 for private clips of others -- not 403); unauthenticated users for public clips only (401 otherwise). Soft-deleted clips return 404 for all. `thumbnailUrl` = `{S3_PUBLIC_BASE_URL}/{thumbnailKey}`.

13. **GET /api/clips/:id/download** -- 401 if unauthenticated; 404 if not found, soft-deleted, or no access; 409 if status not `ready`. Generates presigned S3 URL (60min expiry) with `ResponseContentDisposition: attachment; filename="{slugified-name}.mp4"`. Returns 302 redirect. Empty slugified name falls back to `{clipId}.mp4`.

14. **Clip attribution** -- `showClipper`, `showClipperAvatar`, `clipperName` cannot be set via POST -- PATCH-only (Story 10-4).

15. **Offline owner delivery** -- If clip owner has no WS connections when processing completes, `clip:status-changed` is silently dropped. Status queryable via GET.

## Tasks / Subtasks

### Server

- [ ] Task 1: Add new env vars to `env.ts` (AC: #3, #5)
  - [ ] Add `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PUBLIC_BASE_URL` (all `z.string().min(1)`)
  - [ ] Add `HLS_SEGMENTS_PATH` (`z.string().default('/hls')`)
  - [ ] Add `MTX_STREAM_PATH` (`z.string().default('cam')`)

- [ ] Task 2: Create S3 client singleton `apps/server/src/lib/s3-client.ts` (AC: #5)
  - [ ] Import from `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`
  - [ ] Export single `s3Client` instance configured from env vars
  - [ ] Export helper functions: `uploadToS3`, `presignGetObject`, `putObjectAcl`, `deleteS3Objects`, `abortMultipartUpload`
  - [ ] Add `validateS3BucketAcl()` function that checks bucket supports per-object ACLs at startup (use HeadBucket + GetBucketAcl)

- [ ] Task 3: Create Prisma migration for `clips` table (AC: #4)
  - [ ] Add `Clip` model with all columns per Story 10-2 spec (including `shareToChat` boolean, default `false`)
  - [ ] Add `clips Clip[]` relation to `User` model
  - [ ] Add `clipId` and `messageType` columns to `Message` model
  - [ ] Add `clip Clip?` relation to `Message` model
  - [ ] Run `pnpm prisma migrate dev`

- [ ] Task 4: Update `packages/types/src/ws.ts` (AC: #7, #8, #9)
  - [ ] Add `clip:status-changed` WsMessage type (discriminated on `status`)
  - [ ] Add `clip:visibility-changed` WsMessage type
  - [ ] Split `ChatMessage` into `TextChatMessage | ClipChatMessage` discriminated union
  - [ ] Retain `ChatMessage` as type alias for backward compat
  - [ ] Build types package: `pnpm --filter @manlycam/types build`

- [ ] Task 5: Write `stream_started_at` on stream online transition (AC: #3)
  - [ ] In `streamService.setAdminToggle()`, when `toggle === 'live'`, write `stream_started_at` ISO8601 UTC to `stream_config` via `streamConfig.setWithClient(tx, 'stream_started_at', new Date().toISOString())`

- [ ] Task 6: Flush HLS path on stream offline (AC: dependency from 10-2)
  - [ ] In `streamService.setAdminToggle()`, when `toggle === 'offline'`, call mediamtx HTTP API to flush/remove HLS path (fire-and-forget, logged on error, non-fatal)

- [ ] Task 7: Update `chatService.ts` for clip-aware messages (AC: #7)
  - [ ] Update `MessageRow` type with `clipId?`, `messageType`, `clip?` fields
  - [ ] Update `getHistory()` query with `include: { clip: { select: {...} } }`
  - [ ] Update `toApiChatMessage()` to produce `ClipChatMessage` when `messageType === 'clip'`
  - [ ] Tombstone logic: set `tombstone: true` when `clipId IS NULL`, clip visibility is `private`, or clip `deletedAt IS NOT NULL`

- [ ] Task 8: Create clip service `apps/server/src/services/clipService.ts` (AC: #3, #4, #5, #7, #8, #9, #11)
  - [ ] `createClip()` -- validate, create pending record, spawn async processing
  - [ ] `processClip()` -- ffmpeg execution, S3 upload, status update, WS broadcast
  - [ ] `getClip()` -- access control with 404/401 logic
  - [ ] `getClipDownloadUrl()` -- presign + 302 redirect logic
  - [ ] Rate limit check using `ROLE_RANK` from `roleUtils.ts`
  - [ ] M3u8 parser utility for segment range validation

- [ ] Task 9: Create clip routes `apps/server/src/routes/clips.ts` (AC: #3, #12, #13)
  - [ ] `POST /api/clips` -- Zod body validation, auth check, rate limit, create clip
  - [ ] `GET /api/clips/:id` -- access control, return clip record
  - [ ] `GET /api/clips/:id/download` -- presign + 302 redirect
  - [ ] Register routes in `app.ts`

- [ ] Task 10: Install `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` (AC: #5)

### Frontend

- [ ] Task 11: Create clip composable `apps/web/src/composables/useClipCreate.ts` (AC: #2, #6, #10)
  - [ ] `fetchPlaylist()` -- fetch and parse `.m3u8` from `{HLS_SEGMENTS_PATH}/{MTX_STREAM_PATH}.m3u8` (via API proxy or direct)
  - [ ] Parse `EXT-X-PROGRAM-DATE-TIME` tags for segment timestamps
  - [ ] `submitClip()` -- call `POST /api/clips` via `apiFetch`
  - [ ] Track pending clip IDs for toast state
  - [ ] Handle `clip:status-changed` WsMessage for toast updates

- [ ] Task 12: Create `ClipModal.vue` component (AC: #2, #6)
  - [ ] HLS scrubber with timeline visualization from parsed playlist
  - [ ] Preset buttons (30s, 1min, 2min) selecting tail of buffer
  - [ ] Drag handles for manual range adjustment
  - [ ] Name input (max 200 chars), description textarea (max 500 chars)
  - [ ] "Share to chat when ready" checkbox
  - [ ] Submit button with loading state
  - [ ] Use Dialog component from `@/components/ui/dialog`

- [ ] Task 13: Add clip button to `BroadcastConsole.vue` (AC: #1)
  - [ ] Add `Videotape` icon button to right of snapshot button
  - [ ] Tooltip "Clip Stream"
  - [ ] Visible to all authenticated users
  - [ ] Opens ClipModal on click

- [ ] Task 14: Add processing toast handler (AC: #10)
  - [ ] Listen for `clip:status-changed` in WS message handler
  - [ ] Show persistent Sonner toast during processing
  - [ ] Update toast on ready/failed

### Tests

- [ ] Task 15: Server tests
  - [ ] `clipService.test.ts` -- createClip, processClip, getClip, download, rate limit, m3u8 parsing
  - [ ] `clips.test.ts` (route tests) -- POST validation, GET access control, download redirect
  - [ ] `s3-client.test.ts` -- upload, presign, ACL, delete
  - [ ] Update `streamService.test.ts` -- stream_started_at write, HLS flush
  - [ ] Update `chatService.test.ts` -- clip message mapping, tombstone logic

- [ ] Task 16: Web tests
  - [ ] `useClipCreate.test.ts` -- playlist parsing, submit, WS handling
  - [ ] `ClipModal.test.ts` -- UI rendering, range selection, form validation, submission
  - [ ] `BroadcastConsole.test.ts` -- clip button visibility, click handler

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

- `-ss` before `-i` is fast input seek; with `EXT-X-PROGRAM-DATE-TIME` tags, ffmpeg interprets ISO8601 `-ss` as absolute calendar timestamp
- Use `-t {durationSeconds}` for duration. NEVER use `-to {endTime}` -- `-to` is output-stream position, not wall-clock
- Duration computed as `Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000)`
- Temp files named by clip ULID to prevent collision: `/tmp/{clipId}.mp4`, `/tmp/{clipId}-thumb.jpg`
- No concurrent ffmpeg cap in MVP (known limitation for constrained hosts)

**S3 ACL rules:**

- Video: uploaded with **private** ACL (default)
- Thumbnail: uploaded with **`public-read`** ACL -- always accessible via `{S3_PUBLIC_BASE_URL}/{thumbnailKey}`, never presigned
- Bucket must have per-object ACL support enabled (not owner-enforced)

**shareToChat persistence:**

- Stored in the `shareToChat` boolean column on the `Clip` model (default `false`)
- Server crash during processing: intent is preserved; on restart, processing resumes with correct share behavior
- DB transaction failure after S3 upload: clip remains ready/private, no chat post -- accepted limitation

**Rate limit:**

- Use `ROLE_RANK[user.role] < ROLE_RANK['Moderator']` from `apps/server/src/lib/roleUtils.ts`
- Do NOT inline role comparison
- Count query: `prisma.clip.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 3_600_000) } } })`
- Race condition on concurrent submissions: accepted known limitation

**M3u8 parsing:**

- Read `{HLS_SEGMENTS_PATH}/{MTX_STREAM_PATH}.m3u8` from filesystem (the server container has read-only access to the HLS volume)
- Parse `#EXT-X-PROGRAM-DATE-TIME` tags to extract segment timestamps
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

### Debug Log References

### Completion Notes List

### File List
