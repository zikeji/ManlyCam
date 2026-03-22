# Story 10.2: Clipping Infrastructure

Status: ready-for-review

## Story

As a **developer**,
I want the complete server-side clipping infrastructure in place,
So that subsequent stories have a stable foundation of HLS buffer, S3 client, Clip data model, and WsMessage types to build on.

## Acceptance Criteria

1. **Given** the server-side mediamtx config is updated **When** mediamtx is running and the Pi RTSP stream is connected **Then** HLS segments are written to the configured segment path with original frame timestamps preserved (via `useAbsoluteTimestamp: true` on the path); the rolling buffer retains content according to `hlsSegmentCount * hlsSegmentDuration`; the WHEP live viewer endpoint is unaffected
2. **Given** the `docker-compose.yml` is updated **When** `docker compose up` is run **Then** a `hls_segments` named volume exists; the mediamtx container mounts it read-write at the segment output path; the server container mounts it read-only at the same path
3. **Given** `apps/server/src/env.ts` is updated **When** the server starts **Then** it validates `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PUBLIC_BASE_URL`, `S3_FORCE_PATH_STYLE` (boolean, default `true`), and `MTX_HLS_URL` (string, URL, default `http://127.0.0.1:8090`) via Zod; missing vars produce a descriptive startup error
4. **Given** an S3 client singleton is created at `apps/server/src/lib/s3-client.ts` **When** other modules import it **Then** it exports a single `S3Client` instance configured from env vars; no other file constructs an `S3Client` directly
5. **Given** the Prisma schema is updated **When** `pnpm prisma migrate dev` is run **Then** a `clips` table is created with: `id CHAR(26)` PK, `user_id CHAR(26)` FK->users, `name VARCHAR(100) NOT NULL`, `description VARCHAR(500)`, `status TEXT NOT NULL DEFAULT 'pending'`, `visibility TEXT NOT NULL DEFAULT 'private'`, `thumbnail_key TEXT`, `duration_seconds INTEGER`, `show_clipper BOOLEAN NOT NULL DEFAULT false`, `show_clipper_avatar BOOLEAN NOT NULL DEFAULT false`, `clipper_name VARCHAR(50)`, `clipper_avatar_url TEXT`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ` (@updatedAt), `last_edited_at TIMESTAMPTZ`, `deleted_at TIMESTAMPTZ`; `@@index([userId])`; `clips Clip[]` added to User model; S3 object keys follow pattern `clips/{clipId}/video.mp4` and `clips/{clipId}/thumbnail.jpg` (no separate `s3_key` column needed)
6. **Given** the Prisma schema is updated **When** the `messages` table migration runs **Then** two new columns are added: `clip_id CHAR(26)` (nullable FK->clips, `onDelete: SetNull`) and `message_type TEXT NOT NULL DEFAULT 'text'`; an index is added on `clip_id`
7. **Given** the `packages/types/src/ws.ts` WsMessage union is updated **When** other packages import it **Then** it adds `clip:status-changed`, `clip:visibility-changed`, and the `ChatMessage` discriminated union split (`TextChatMessage` + `ClipChatMessage` with `ChatMessage` retained as type alias)
8. **Given** the stream goes from online to explicit offline (admin toggle) **When** the stream state transition is processed **Then** the server calls the mediamtx HTTP API to remove/flush the HLS path (fire-and-forget, logged on error, non-fatal)
9. **Given** the stream is set to online by an admin **When** the stream state transition is processed **Then** `stream_started_at` is written to `stream_config` as an ISO8601 UTC timestamp
10. **Given** `chatService.ts`'s `getHistory()` is updated **When** it queries chat messages **Then** the query includes `clip` relation data; `MessageRow` gains `clipId?`, `messageType`, `clip?` fields; `toApiChatMessage()` maps clip fields to `ClipChatMessage` payload when `messageType = 'clip'`; tombstone logic applies for null `clipId`, private visibility, or soft-deleted clips
11. **And** `ffmpeg` is present in the server Dockerfile and available at runtime
12. **And** Story 10-2 is a prerequisite for Stories 10-3, 10-4, and 10-5

## Tasks / Subtasks

- [x] Task 1: Add new env vars to `apps/server/src/env.ts` (AC: #3)
  - [x] Add `S3_ENDPOINT` (string, min 1)
  - [x] Add `S3_BUCKET` (string, min 1)
  - [x] Add `S3_ACCESS_KEY` (string, min 1)
  - [x] Add `S3_SECRET_KEY` (string, min 1)
  - [x] Add `S3_REGION` (string, min 1)
  - [x] Add `S3_PUBLIC_BASE_URL` (string, min 1)
  - [x] Add `S3_FORCE_PATH_STYLE` (boolean, default `true`)
  - [x] Add `MTX_HLS_URL` (string, URL, default `http://127.0.0.1:8090`)
  - [x] Update `.env.example` with the new vars
  - [x] Update test env mocks if any tests load env.ts

- [x] Task 2: Install `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` (AC: #4)
  - [x] `pnpm --filter @manlycam/server add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`

- [x] Task 3: Create S3 client singleton at `apps/server/src/lib/s3-client.ts` (AC: #4)
  - [x] Import from `env.ts`, construct `S3Client` with `endpoint`, `region`, `credentials`, `forcePathStyle: env.S3_FORCE_PATH_STYLE`
  - [x] Named export only: `export const s3Client = ...`
  - [x] Write co-located test `s3-client.test.ts`

- [x] Task 4: Prisma schema migration for `clips` table (AC: #5)
  - [x] Add `Clip` model to `apps/server/prisma/schema.prisma` with all columns per AC #5 (no `s3Key` field — derive from clipId)
  - [x] Add `clips Clip[]` relation to `User` model
  - [x] Run `pnpm prisma migrate dev --name add-clips-table`

- [x] Task 5: Prisma schema migration for `messages` table changes (AC: #6)
  - [x] Add `clipId` (nullable FK->clips, `onDelete: SetNull`) to `Message` model
  - [x] Add `messageType` (String, default `'text'`) to `Message` model
  - [x] Add `clip Clip?` relation to `Message` model
  - [x] Add `messages Message[]` relation to `Clip` model (Prisma requires both sides)
  - [x] Add `@@index([clipId])` to `Message` model
  - [x] Run `pnpm prisma migrate dev --name add-message-clip-fields`

- [x] Task 6: Update `packages/types/src/ws.ts` WsMessage types (AC: #7)
  - [x] Add `TextChatMessage` interface (existing `ChatMessage` fields + `messageType: 'text'`)
  - [x] Add `ClipChatMessage` interface (base fields + `messageType: 'clip'`, `clipId`, `clipThumbnailUrl`, `clipName`, `clipDurationSeconds`, `tombstone?`)
  - [x] Retain `ChatMessage` as type alias: `export type ChatMessage = TextChatMessage | ClipChatMessage`
  - [x] Add `clip:status-changed` to `WsMessage` union with discriminated payload on `status`
  - [x] Add `clip:visibility-changed` to `WsMessage` union
  - [x] Update `chat:message` payload type to `TextChatMessage | ClipChatMessage`
  - [x] Verify existing consumers compile (build types package)

- [x] Task 7: Update mediamtx config for HLS output (AC: #1)
  - [x] Update `docs/deploy/mediamtx-server.yml`: enable HLS (`hls: true`), set `hlsAddress`, `hlsSegmentDuration`, `hlsSegmentCount`, segment output path (`hlsDirectory`), `hlsAlwaysRemux: true`, and `useAbsoluteTimestamp: true` on the path
  - [x] HLS address set to `:0` (disabled for external access) but output written to volume path

- [x] Task 8: Update docker-compose files for shared HLS volume (AC: #2)
  - [x] Add `hls_segments` named volume to `docs/deploy/docker-compose.yml`
  - [x] Mount in mediamtx container read-write
  - [x] Mount in server container read-only
  - [x] Add S3/clipping env vars to server service environment block
  - [x] Update traefik docker-compose similarly

- [x] Task 9: Add `ffmpeg` to server Dockerfile (AC: #11)
  - [x] Add `RUN apk add --no-cache ffmpeg` in the runner stage

- [x] Task 10: Implement HLS path flush on stream offline (AC: #8)
  - [x] In `streamService.ts` `setAdminToggle()`, when toggle is `'offline'`, call mediamtx API to flush HLS path
  - [x] Fire-and-forget with error logging
  - [x] Write test for the flush call

- [x] Task 11: Write `stream_started_at` on stream online (AC: #9)
  - [x] In `streamService.ts` `setAdminToggle()`, when toggle is `'live'`, write `stream_started_at` to `stream_config` via `streamConfig.setWithClient()` inside transaction
  - [x] Write test

- [x] Task 12: Update `chatService.ts` for clip-aware history (AC: #10)
  - [x] Extend `MessageRow` type with `clipId?`, `messageType`, `clip?` fields
  - [x] Update `getHistory()` query to include `clip` relation with `select`
  - [x] Update `toApiChatMessage()` to produce `TextChatMessage` or `ClipChatMessage` based on `messageType`
  - [x] Implement tombstone logic: `clipId IS NULL` (cascade-nulled), clip visibility `private`, or clip `deletedAt IS NOT NULL` -> `tombstone: true`
  - [x] `clipThumbnailUrl` = `{S3_PUBLIC_BASE_URL}/{thumbnailKey}` (import from env)
  - [x] Omit `clipperAvatarUrl` field when null (do not serialize `null`)
  - [x] Write comprehensive tests for text messages, clip messages, and tombstone cases

- [x] Task 13: Run quality gates
  - [x] `pnpm run typecheck` in `apps/server` and `apps/web` — PASS
  - [x] `pnpm run lint` in both apps — PASS
  - [x] `pnpm run test --coverage` in both apps — PASS (538 server, 1202 web)

## Dev Notes

### Critical Implementation Details

**S3 Client (`@aws-sdk/client-s3`)**

- Use `forcePathStyle: env.S3_FORCE_PATH_STYLE` in the S3Client config — `true` for RustFS/MinIO path-style access (`http://host:port/bucket/key`), `false` for AWS virtual-hosted-style (`http://bucket.host/key`)
- The presigner (`@aws-sdk/s3-request-presigner`) is needed for Story 10-3 download URLs but should be installed now to avoid a dep-add story later
- S3 bucket should support `PutObjectAcl` for object-level ACL operations (used by clip visibility toggle). RustFS supports this at the object level.
- S3 object keys follow pattern `clips/{clipId}/video.mp4` and `clips/{clipId}/thumbnail.jpg` — derive from clipId, no separate key storage needed

**Prisma Migration Notes**

- Run both migrations in sequence: clips table first, then message columns (message FK references clips)
- The `@updatedAt` directive on `Clip.updatedAt` fires on ALL mutations — do not confuse with `lastEditedAt` which is user-edit-only
- `Clip.deletedAt` is for soft-delete; `Message.deletedAt` is separate — clip soft-deletion NEVER sets `messages.deletedAt`
- `onDelete: SetNull` on `Message.clipId` is a safety net for hard-deletes only; normal flow uses soft-delete with tombstone detection via `clip.deletedAt`
- Text field limits: `name` VARCHAR(100), `description` VARCHAR(500), `clipper_name` VARCHAR(50) — enforce at API layer with Zod in Story 10-3

**WsMessage Type Changes — Backward Compatibility**

- `ChatMessage` becomes a type alias (`TextChatMessage | ClipChatMessage`) — all existing consumers that reference `ChatMessage` continue to compile
- Existing `chat:message` consumers must narrow on `payload.messageType` to distinguish text vs clip; until Story 10-3/10-5, only `text` messages exist
- The `clip:status-changed` payload is discriminated on `status` field — use two separate interfaces for `ready` and `failed`, NOT optional fields on a single interface
- `clip:visibility-changed` includes `clip?` card data only for tombstone restoration (visibility moving to `shared`/`public`)

**mediamtx HLS Configuration**

- HLS output is enabled via `hlsAddress` in `mediamtx-server.yml` but should only write segments to the shared volume
- `useAbsoluteTimestamp: true` on the path preserves original frame timestamps from the RTSP stream, enabling accurate timestamp seeking in ffmpeg (Story 10-3)
- The mediamtx HTTP API endpoint for flushing HLS paths uses `MTX_API_URL` (already in env.ts, default `http://127.0.0.1:9997`) — no new env var needed
- The API call to flush HLS is: `DELETE {MTX_API_URL}/v3/hlsmuxers/delete/cam` (path name is hard-coded as 'cam' to match the mediamtx configuration)

**Stream State Transitions**

- `stream_started_at` in `stream_config` is overwritten on each online transition — this is intentional per spec
- HLS flush on offline is fire-and-forget — failures are logged but do not block the admin toggle

**chatService.ts Changes**

- The `include: { clip: { select: { ... } } }` in `getHistory()` uses Prisma camelCase field names, not DB column names
- `clipThumbnailUrl` is `{S3_PUBLIC_BASE_URL}/{thumbnailKey}` when `thumbnailKey` exists — omit the field entirely when null; UI shows generic clip placeholder
- Omit `clipperAvatarUrl` from payload when null — the TypeScript type is `clipperAvatarUrl?: string`, not `string | null`
- Tombstone conditions: `clipId IS NULL` (cascade-nulled), OR clip `visibility === 'private'`, OR clip `deletedAt IS NOT NULL`
- Message rows for deleted/private clips remain intact with their original `deletedAt: null` — the existing `where: { deletedAt: null }` filter on messages continues to work correctly

**Dockerfile**

- Add `ffmpeg` in the Alpine runner stage: `RUN apk add --no-cache ffmpeg`
- This goes in Stage 3 (runner), not the build stages

### Existing Code Patterns to Follow

- **Singleton pattern**: Follow `apps/server/src/db/client.ts` (Prisma) and `apps/server/src/lib/ulid.ts` (ULID) for the S3 client singleton
- **Env vars**: Add to the Zod schema in `apps/server/src/env.ts` — follow existing patterns (z.string().min(1) for required, .default() for optional)
- **Stream config KV store**: Use `streamConfig.set()` / `streamConfig.get()` from `apps/server/src/lib/stream-config.ts` for `stream_started_at`
- **Stream service**: Modify `StreamService.setAdminToggle()` in `apps/server/src/services/streamService.ts` for HLS flush and stream_started_at
- **WsMessage union**: Splice new entries into the existing union at `packages/types/src/ws.ts` line 85 — do not create separate exports
- **Docker compose**: Both `docs/deploy/docker-compose.yml` and `docs/deploy/traefik/docker-compose.yml` need updates
- **Test isolation**: Server tests hit real (test) DB — no Prisma mocks. Vue tests need afterEach cleanup.
- **Named exports only**: No `export default`
- **Error handling**: Use `AppError` from `apps/server/src/lib/errors.ts`
- **Co-located tests**: `foo.ts` -> `foo.test.ts` in same directory

### Project Structure Notes

- S3 client: `apps/server/src/lib/s3-client.ts` (new file — lib directory for singletons)
- Prisma schema: `apps/server/prisma/schema.prisma` (modify existing)
- Types: `packages/types/src/ws.ts` (modify existing)
- Env: `apps/server/src/env.ts` (modify existing)
- Chat service: `apps/server/src/services/chatService.ts` (modify existing)
- Stream service: `apps/server/src/services/streamService.ts` (modify existing)
- Dockerfile: `apps/server/Dockerfile` (modify existing)
- Docker compose: `docs/deploy/docker-compose.yml` and `docs/deploy/traefik/docker-compose.yml` (modify existing)
- mediamtx config: `docs/deploy/mediamtx-server.yml` (modify existing)

### References

- [Source: _bmad-output/planning-artifacts/epics.md, Story 10-2 (lines 2083-2139)]
- [Source: apps/server/src/env.ts — current env schema]
- [Source: apps/server/prisma/schema.prisma — current schema]
- [Source: packages/types/src/ws.ts — current WsMessage union]
- [Source: apps/server/src/services/chatService.ts — current getHistory/toApiChatMessage]
- [Source: apps/server/src/services/streamService.ts — current setAdminToggle]
- [Source: apps/server/src/lib/stream-config.ts — KV store helper]
- [Source: docs/deploy/docker-compose.yml — current compose config]
- [Source: docs/deploy/mediamtx-server.yml — current mediamtx config]
- [Source: apps/server/Dockerfile — current Dockerfile]

## Adversarial Review Findings

Review conducted: 2026-03-22

### Findings Added to Story

1. **~No S3 connectivity validation at startup~** — ACKNOWLEDGED. Add `S3_FORCE_PATH_STYLE` env var (boolean, default `true`) per Finding #10 below. Startup connectivity check is out of scope for infrastructure story; S3 operations will fail fast at runtime with clear errors.

2. **~HLS segment storage has no cleanup policy~** — NOT A CONCERN. mediamtx maintains the rolling buffer per `hlsSegmentCount * hlsSegmentDuration`. The container's lifecycle management handles segment cleanup.

3. **S3 key design** — CLARIFIED. The `s3_key` field should be derived from `clipId` (ULID) for consistency: `clips/{clipId}/video.mp4`. Update AC #5 to reflect this pattern — no separate arbitrary S3 key storage needed.

4. **Stale segment handling** — ADDRESSED. If HLS flush fails (AC #8), segments remain until mediamtx's rolling buffer fills. This is acceptable fire-and-forget behavior. For explicit cleanup on stream offline, implement a background job that scans the HLS path for segments older than `stream_started_at` and removes them (out of scope for this story).

5. **~Migration rollback strategy~** — ACKNOWLOGED. If clipping needs to be disabled, a feature flag would be added in a future story, not via rollback.

6. **~stream_started_at overwrites~** — ACKNOWLEDGED. Admin toggle actions are logged in audit_log, providing history. Overwriting is intentional per spec.

7. **~Tombstone race conditions~** — ACKNOWLEDGED. Tombstone logic applies at read time; the concern is about recipients who already have the data, not data leakage.

8. **Missing max length on text fields** — ADDRESSED. Update AC #5: `name` max 100 chars, `description` max 500 chars, `clipper_name` max 50 chars.

9. **~ffmpeg version pinning~** — ACKNOWLEDGED. Alpine's ffmpeg package is stable; breaking changes are rare.

10. **S3 path-style assumption** — ADDRESSED. Add `S3_FORCE_PATH_STYLE` env var (boolean, default `true`) to support both path-style (MinIO/RustFS) and virtual-hosted-style (AWS S3) endpoints.

11. **~Message type backfill~** — ACKNOWLEDGED. Migrations run during server restart; no concurrent writes during migration.

12. **Missing clip thumbnail fallback** — ADDRESSED. If `thumbnailKey` is null, omit `clipThumbnailUrl` from payload entirely. The UI should show a generic clip placeholder icon when the field is absent.

13. **~No rate limiting~** — ACKNOWLEDGED. Rate limiting for clip operations is part of Story 10-3.

14. **~Mediamtx API endpoint verification~** — ACKNOWLEDGED. The endpoint `DELETE {MTX_API_URL}/v3/hlsmuxers/delete/cam` (hard-coded 'cam' path) verified during implementation smoke testing.

15. **~WHEP and HLS resource competition~** — ACKNOWLEDGED. HLS muxing overhead is minimal; resource allocation guidance out of scope.

### Required Story Updates

- [x] ~~Update AC #3: Add `S3_FORCE_PATH_STYLE` (boolean, default `true`)~~ — Already implemented
- [x] ~~Update AC #5: `name` VARCHAR(100), `description` VARCHAR(500), `clipper_name` VARCHAR(50)~~ — Already implemented
- [x] ~~Update AC #5: Clarify S3 key pattern is `clips/{clipId}/video.mp4` and `clips/{clipId}/thumbnail.jpg` (no arbitrary `s3_key` field needed; derive from clipId)~~ — Already implemented, spec updated
- [x] ~~Update Task 1: Add `S3_FORCE_PATH_STYLE` env var~~ — Already implemented
- [x] ~~Update Dev Notes: Add thumbnail fallback guidance (omit field when null, UI shows placeholder)~~ — Already implemented

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation completed without blocking errors requiring debug log capture.

### Completion Notes List

1. **Prisma migration sequencing**: The bidirectional relation between `Clip` and `Message` required two separate migrations. First migration (`add_clips_table`) added the `Clip` model without the `messages Message[]` back-relation. Second migration (`add_message_clip_fields`) added `Message.clipId`, `Message.messageType`, `Message.clip`, and `Clip.messages` together as both sides of the relation must be declared in the same migration.

2. **`stream_started_at` via transaction**: Implemented using `streamConfig.setWithClient(tx, ...)` inside the existing `prisma.$transaction()` in `setAdminToggle()` rather than `streamConfig.set()` outside the transaction, ensuring atomicity with the audit log entry.

3. **Web consumer compatibility**: The `ChatMessage` discriminated union split (`TextChatMessage | ClipChatMessage`) required adding `messageType: 'text'` to mock objects in 4 web test files (`ChatMessage.test.ts`, `ChatPanel.test.ts`, `useChat.test.ts`, `useReactions.test.ts`). No production web components required changes — narrowing on `messageType` is deferred to Story 10-5.

4. **Lint auto-fix**: 10 Prettier formatting errors were auto-fixed via `pnpm run lint --fix` in `chatService.ts`, `streamService.ts`, and `streamService.test.ts`.

5. **`chatService.ts` ephemeral message**: Updated to use `TextChatMessage` type with `messageType: 'text'` field to satisfy the narrowed type.

### File List

- `apps/server/src/env.ts`
- `apps/server/.env.example`
- `apps/server/src/lib/s3-client.ts` (new)
- `apps/server/src/lib/s3-client.test.ts` (new)
- `apps/server/prisma/schema.prisma`
- `apps/server/prisma/migrations/20260322191718_add_clips_table/migration.sql` (new)
- `apps/server/prisma/migrations/20260322191736_add_message_clip_fields/migration.sql` (new)
- `packages/types/src/ws.ts`
- `docs/deploy/mediamtx-server.yml`
- `docs/deploy/docker-compose.yml`
- `docs/deploy/traefik/docker-compose.yml`
- `apps/server/Dockerfile`
- `apps/server/src/services/streamService.ts`
- `apps/server/src/services/streamService.test.ts`
- `apps/server/src/services/chatService.ts`
- `apps/server/src/services/chatService.test.ts`
- `apps/server/src/routes/chat.test.ts`
- `apps/web/src/components/chat/ChatMessage.test.ts`
- `apps/web/src/components/chat/ChatPanel.test.ts`
- `apps/web/src/composables/useChat.test.ts`
- `apps/web/src/composables/useReactions.test.ts`

### Change Log

| Date       | Change                               | Author            |
| ---------- | ------------------------------------ | ----------------- |
| 2026-03-22 | Initial implementation of Story 10-2 | claude-sonnet-4-6 |
