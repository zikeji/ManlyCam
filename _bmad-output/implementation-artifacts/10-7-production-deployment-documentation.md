# Story 10.7: Production Deployment Documentation

Status: ready-for-dev

## Story

As an **operator deploying ManlyCam to production**,
I want complete documentation for configuring Backblaze B2 and the clipping stack in a production environment,
So that I can deploy the full clipping feature without guessing at configuration details.

## Acceptance Criteria

1. **B2 bucket setup section** documents: creating a private B2 bucket, creating an application key scoped to the bucket with read/write permissions, configuring per-object ACLs (B2 supports `s3:PutObjectAcl` -- operator must enable it on the bucket policy), and which env vars map to B2 settings (`S3_ENDPOINT` = `https://s3.{region}.backblazeb2.com`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PUBLIC_BASE_URL` = `https://f{n}.backblazeb2.com/file` -- operator must supply the correct CDN hostname from B2 dashboard).

2. **mediamtx HLS configuration section** documents: enabling HLS output, setting `hlsProgramDateTime: yes`, and the rolling buffer formula: `hlsSegmentMaxCount = desired_buffer_minutes x 60 / hlsSegmentDuration`; example: 15 min buffer with 2s segments = 450 segments; disk space guidance: approximately `bitrate_mbps x buffer_minutes x 7.5` MB (e.g., 2 Mbps x 15 min = 225 MB); recommendation to back the HLS path with sufficient disk space.

3. **Docker Compose production section** documents: the `hls_segments` named volume declaration, read-write mount for mediamtx, read-only mount for the server container, and how to verify the volume is functioning after deploy.

4. **Bare-metal section** documents: verifying ffmpeg is installed and in PATH, configuring mediamtx to write HLS segments to a shared directory readable by the Hono process, and recommended systemd service ordering (mediamtx before server).

5. **B2 egress cost notice**: documentation notes that B2 egress costs apply to clip playback from public clip pages and presigned download URLs; operators should review B2 pricing before enabling public clips at scale.

6. **Thumbnail public-read notice**: documentation notes that all clip thumbnails are uploaded as `public-read` and served at `{S3_PUBLIC_BASE_URL}/{thumbnailKey}` regardless of clip visibility -- no ACL management is performed on thumbnail objects; thumbnails of deleted or private clips remain accessible via their S3 URL if an attacker has the key (ULID keys are not guessable without prior access to the URL).

7. **Soft-delete and S3 orphan notice**: documentation notes that `DELETE /api/clips/:id` soft-deletes the clip record and then attempts best-effort S3 deletion; if S3 deletion fails, S3 objects are orphaned until manual cleanup; operators can identify orphaned objects by querying `SELECT id, s3_key, thumbnail_key FROM clips WHERE deleted_at IS NOT NULL` and cross-referencing with S3 bucket contents.

8. **Env var name match**: all documented env var names exactly match those validated in `apps/server/src/env.ts`; the `MTX_STREAM_PATH` env var (default `cam`) must also be configured to match the mediamtx path name used by the Pi camera.

9. **Dev environment cross-reference**: the operator guide cross-references the dev environment documentation (Story 10-1) so operators can verify local behaviour before deploying.

## Tasks / Subtasks

- [ ] Task 1: Add Backblaze B2 setup section to `docs/deploy/README.md` (AC: #1, #5)
  - [ ] 1.1 Document bucket creation (private, per-object ACL enabled)
  - [ ] 1.2 Document application key creation (scoped to bucket, read/write)
  - [ ] 1.3 Map B2 dashboard values to env vars (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PUBLIC_BASE_URL`)
  - [ ] 1.4 Add B2 egress cost warning for public clips at scale
- [ ] Task 2: Add mediamtx HLS configuration section to `docs/deploy/README.md` (AC: #2)
  - [ ] 2.1 Document enabling HLS output in `mediamtx-server.yml`
  - [ ] 2.2 Document `hlsProgramDateTime: yes` requirement
  - [ ] 2.3 Document rolling buffer formula with worked example (15 min / 2s segments = 450)
  - [ ] 2.4 Document disk space guidance formula with worked example
- [ ] Task 3: Update Docker Compose sections for clipping volumes (AC: #3)
  - [ ] 3.1 Document `hls_segments` named volume in both `docker-compose.yml` and `traefik/docker-compose.yml`
  - [ ] 3.2 Document mediamtx read-write mount and server read-only mount
  - [ ] 3.3 Document new S3/clipping env vars in the server service environment block
  - [ ] 3.4 Document volume verification steps
- [ ] Task 4: Update bare-metal section for clipping prerequisites (AC: #4)
  - [ ] 4.1 Document ffmpeg installation verification (`ffmpeg -version`)
  - [ ] 4.2 Document shared HLS segment directory setup (mediamtx writable, Hono readable)
  - [ ] 4.3 Document systemd service ordering (mediamtx before server)
- [ ] Task 5: Add clipping security/operations notices (AC: #6, #7)
  - [ ] 5.1 Document thumbnail public-read behavior and privacy implications
  - [ ] 5.2 Document soft-delete behavior and S3 orphan cleanup query
- [ ] Task 6: Update env var documentation (AC: #8)
  - [ ] 6.1 Add all new clipping env vars to the "Required variables" table in `docs/deploy/README.md`
  - [ ] 6.2 Add all new clipping env vars to `apps/server/.env.example` with comments
  - [ ] 6.3 Verify all documented env var names match `apps/server/src/env.ts` exactly
  - [ ] 6.4 Document `MTX_STREAM_PATH` and its relationship to the Pi mediamtx path name
- [ ] Task 7: Update `mediamtx-server.yml` with HLS output config (AC: #2)
  - [ ] 7.1 Add HLS-related settings to `docs/deploy/mediamtx-server.yml` with comments
  - [ ] 7.2 Add HLS segment output path configuration using shared volume mount
- [ ] Task 8: Update Docker Compose files with clipping infrastructure (AC: #3)
  - [ ] 8.1 Add `hls_segments` named volume to `docs/deploy/docker-compose.yml`
  - [ ] 8.2 Add mediamtx read-write mount and server read-only mount to `docs/deploy/docker-compose.yml`
  - [ ] 8.3 Add new S3/clipping env vars to server service in `docs/deploy/docker-compose.yml`
  - [ ] 8.4 Repeat for `docs/deploy/traefik/docker-compose.yml`
- [ ] Task 9: Add dev environment cross-reference (AC: #9)
  - [ ] 9.1 Add note referencing Story 10-1 dev environment documentation for local verification
- [ ] Task 10: Update Full-Stack Checklist with clipping verification steps

## Dev Notes

### What This Story Is

This is a **documentation-only story** -- no application code changes. All modifications target deployment configuration files and documentation under `docs/deploy/`. The clipping infrastructure code (env.ts changes, S3 client, Prisma model, etc.) is implemented in Story 10-2. This story documents how operators configure the production environment to support that infrastructure.

### Key Files to Modify

- `docs/deploy/README.md` -- primary deployment guide; add new sections for B2, HLS config, clipping env vars, security notices
- `docs/deploy/mediamtx-server.yml` -- add HLS output configuration (currently HLS is disabled with `hlsAddress: ":0"`)
- `docs/deploy/docker-compose.yml` -- add `hls_segments` volume, mediamtx RW mount, server RO mount, new env vars
- `docs/deploy/traefik/docker-compose.yml` -- same volume/mount/env var changes as simple compose
- `apps/server/.env.example` -- add new clipping env vars with documentation comments

### New Env Vars to Document

These env vars will be added to `apps/server/src/env.ts` by Story 10-2. This story documents them for operators:

| Variable | Description | Example (Production) |
|---|---|---|
| `S3_ENDPOINT` | S3-compatible endpoint URL | `https://s3.us-west-004.backblazeb2.com` |
| `S3_BUCKET` | Bucket name | `manlycam-clips` |
| `S3_ACCESS_KEY` | B2 application key ID | *(from B2 dashboard)* |
| `S3_SECRET_KEY` | B2 application key secret | *(from B2 dashboard)* |
| `S3_REGION` | B2 region | `us-west-004` |
| `S3_PUBLIC_BASE_URL` | Public URL base for thumbnails | `https://f004.backblazeb2.com/file/manlycam-clips` |
| `HLS_SEGMENTS_PATH` | Absolute path where mediamtx writes HLS segments | `/hls` (default) |
| `MTX_STREAM_PATH` | mediamtx path name matching Pi RTSP stream | `cam` (default) |

### mediamtx HLS Configuration

The current `mediamtx-server.yml` has `hlsAddress: ":0"` (disabled). The clipping feature requires HLS output enabled so the server can read the rolling buffer for ffmpeg clip extraction. Key settings to document:

```yaml
hlsAddress: ":8888"            # or appropriate port -- internal only
hlsSegmentDuration: 2s         # recommended
hlsSegmentMaxCount: 450        # 15 min buffer at 2s segments
hlsProgramDateTime: yes        # required for absolute timestamp scrubbing
```

The HLS segments path must be a shared volume: mediamtx writes (read-write), server reads (read-only).

### Docker Volume Architecture

```
hls_segments (named volume)
  mediamtx container: /hls (read-write) -- writes HLS segments
  server container:   /hls (read-only)  -- ffmpeg reads segments for clip extraction
```

### B2 Per-Object ACL Requirement

B2 buckets default to "owner-enforced" ACL mode. The clipping feature requires per-object ACL support because:
- Video clips are uploaded with **private** ACL (served via presigned URLs)
- Thumbnails are uploaded with **`public-read`** ACL (served directly via `S3_PUBLIC_BASE_URL`)
- Visibility changes toggle ACL between private and public-read on the video object

If the bucket uses owner-enforced mode, `PutObjectAcl` calls will fail with `AccessControlListNotSupported`. This must be set at bucket creation time in the B2 dashboard.

### Existing Deployment Doc Structure

The current `docs/deploy/README.md` has this structure:
1. Architecture Overview (mermaid diagram)
2. Required Ports
3. Deployment Paths
4. Environment Variables (Required / Traefik-only / Container image)
5. Google OAuth Setup
6. Docker Compose -- Simple
7. Docker Compose -- Traefik
8. Bare-Metal / Non-Docker
9. First-Run Admin Steps
10. Custom Slash Commands
11. Deploy File Reference
12. Full-Stack Checklist

New clipping sections should be integrated into existing sections (env vars into the env vars table, volumes into the compose setup steps) rather than appended as a separate "Clipping" mega-section. This keeps the guide operator-flow-oriented rather than feature-oriented.

### Bare-Metal ffmpeg Requirement

Story 10-2 adds ffmpeg to the server Dockerfile. For bare-metal, operators must install ffmpeg separately. The existing bare-metal section covers mediamtx and frps installation; ffmpeg and the shared HLS directory need to be added.

### Systemd Service Ordering

For bare-metal, mediamtx must start before the Hono server so HLS segments are available when the server starts processing clip requests. The existing `manlycam-server.service` has `After=network.target`; it should add `After=mediamtx.service` dependency.

### Cross-Reference to Story 10-1

Story 10-1 covers the dev environment setup (RustFS instead of B2, local Docker volumes). This story's documentation should reference 10-1 so operators can verify the clipping stack locally before deploying to production with B2.

### Testing

This is a documentation story. No automated tests are required. Quality gate is:
- All documented env var names verified against `apps/server/src/env.ts` (after Story 10-2 lands)
- Docker Compose files are valid YAML
- mediamtx config additions are valid YAML
- README content is complete and operator-actionable

### Project Structure Notes

- All deployment docs live under `docs/deploy/`
- Docker Compose variants: `docs/deploy/docker-compose.yml` (simple) and `docs/deploy/traefik/docker-compose.yml` (Traefik)
- mediamtx config: `docs/deploy/mediamtx-server.yml` (shared by both compose variants -- Traefik docs say to copy it)
- Bare-metal systemd reference: `docs/deploy/manlycam-server.service`
- Env example: `apps/server/.env.example`

### Sequencing Note

This story closes Epic 10 and should come last (after 10-1 through 10-6). However, it has no implementation dependency -- it can be worked independently since it only documents configuration that Story 10-2 implements. The env var names and volume paths documented here must match what 10-2 adds to `env.ts` and `docker-compose.yml`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 10-7] -- acceptance criteria
- [Source: _bmad-output/planning-artifacts/epics.md#Story 10-1] -- dev environment documentation (cross-reference target)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 10-2] -- clipping infrastructure (env vars, volumes, Prisma model)
- [Source: _bmad-output/planning-artifacts/architecture.md] -- deployment architecture, Docker Compose patterns
- [Source: docs/deploy/README.md] -- existing deployment guide (target for modifications)
- [Source: docs/deploy/docker-compose.yml] -- current simple Docker Compose (no clipping volumes yet)
- [Source: docs/deploy/traefik/docker-compose.yml] -- current Traefik Docker Compose (no clipping volumes yet)
- [Source: docs/deploy/mediamtx-server.yml] -- current mediamtx config (HLS disabled)
- [Source: apps/server/src/env.ts] -- current env validation (no S3/clip vars yet)
- [Source: apps/server/.env.example] -- current env example (no S3/clip vars yet)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
