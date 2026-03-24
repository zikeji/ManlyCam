# Story 10.7: Production Deployment Documentation

Status: ready-for-dev

## Story

As an **operator deploying ManlyCam to production**,
I want complete documentation for configuring Backblaze B2 and the clipping stack in a production environment,
So that I can deploy the full clipping feature without guessing at configuration details.

## Acceptance Criteria

1. **B2 bucket setup section** documents: creating a private B2 bucket, creating an application key scoped to the bucket with read/write permissions, and which env vars map to B2 settings (`S3_ENDPOINT` = `https://s3.{region}.backblazeb2.com`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`); notes that B2 does NOT support per-object ACLs (`PutObjectAcl` is not available) — the bucket stays fully private; thumbnails are proxied through the backend at `/api/clips/:clipId/thumbnail` rather than served directly from B2.

2. **mediamtx HLS configuration section** documents: enabling HLS output, setting `useAbsoluteTimestamp: true` on the path for accurate timestamp synchronization, and the rolling buffer formula: `hlsSegmentCount = desired_buffer_minutes x 60 / hlsSegmentDuration`; example: 15 min buffer with 2s segments = 450 segments; disk space guidance: approximately `bitrate_mbps x buffer_minutes x 7.5` MB (e.g., 2 Mbps x 15 min = 225 MB); recommendation to back the HLS path with sufficient disk space.

3. **Docker Compose production section** documents: the `hls_segments` named volume declaration, read-write mount for mediamtx, read-only mount for the server container, and how to verify the volume is functioning after deploy.

4. **Bare-metal section** documents: verifying ffmpeg is installed and in PATH, configuring mediamtx to write HLS segments to a shared directory readable by the Hono process, and recommended systemd service ordering (mediamtx before server).

5. **B2 egress cost notice**: documentation notes that B2 egress costs apply to clip playback from public clip pages and presigned download URLs; operators should review B2 pricing before enabling public clips at scale.

6. **Thumbnail proxy notice**: documentation notes that clip thumbnails are served through the backend proxy endpoint `/api/clips/:clipId/thumbnail` (responds with `Cache-Control: public, max-age=86400`); access control is enforced by the proxy — thumbnails of private or deleted clips are not served to unauthorised callers; operators may configure Traefik or Caddy to cache this endpoint for up to 24 h to reduce origin load.

7. **Soft-delete and S3 orphan notice**: documentation notes that `DELETE /api/clips/:id` soft-deletes the clip record and then attempts best-effort S3 deletion; if S3 deletion fails, S3 objects are orphaned until manual cleanup; operators can identify orphaned objects by querying `SELECT id, s3_key, thumbnail_key FROM clips WHERE deleted_at IS NOT NULL` and cross-referencing with S3 bucket contents.

8. **Env var name match**: all documented env var names exactly match those validated in `apps/server/src/env.ts`; the `MTX_HLS_URL` env var must be configured to point to the mediamtx HLS server (e.g., `http://mediamtx:8090`).

9. **Dev environment cross-reference**: the operator guide cross-references the dev environment documentation (Story 10-1) so operators can verify local behaviour before deploying.

## Tasks / Subtasks

- [ ] Task 1: Add Backblaze B2 setup section to `docs/deploy/README.md` (AC: #1, #5)
  - [ ] 1.1 Document bucket creation (private bucket; note B2 does NOT support per-object ACLs)
  - [ ] 1.2 Document application key creation (scoped to bucket, read/write)
  - [ ] 1.3 Map B2 dashboard values to env vars (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`)
  - [ ] 1.4 Add B2 egress cost warning for public clips at scale
  - [ ] 1.5 Document thumbnail proxy approach: thumbnails served via `/api/clips/:clipId/thumbnail`, not directly from B2
- [ ] Task 2: Add mediamtx HLS configuration section to `docs/deploy/README.md` (AC: #2)
  - [ ] 2.1 Document enabling HLS output in `mediamtx-server.yml`
  - [ ] 2.2 Document `useAbsoluteTimestamp: true` on the path for accurate timestamp synchronization
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
  - [ ] 5.1 Document thumbnail proxy behavior (`/api/clips/:clipId/thumbnail`, `Cache-Control: public, max-age=86400`) and proxy-level caching guidance (Traefik/Caddy examples for 24 h cache)
  - [ ] 5.2 Document soft-delete behavior and S3 orphan cleanup query
- [ ] Task 6: Update env var documentation (AC: #8)
  - [ ] 6.1 Add all new clipping env vars to the "Required variables" table in `docs/deploy/README.md` (note: `S3_PUBLIC_BASE_URL` is NOT present — thumbnails use the proxy, not a public base URL)
  - [ ] 6.2 Add all new clipping env vars to `apps/server/.env.example` with comments
  - [ ] 6.3 Verify all documented env var names match `apps/server/src/env.ts` exactly
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

| Variable        | Description                | Example (Production)                     |
| --------------- | -------------------------- | ---------------------------------------- |
| `S3_ENDPOINT`   | S3-compatible endpoint URL | `https://s3.us-west-004.backblazeb2.com` |
| `S3_BUCKET`     | Bucket name                | `manlycam-clips`                         |
| `S3_ACCESS_KEY` | B2 application key ID      | _(from B2 dashboard)_                    |
| `S3_SECRET_KEY` | B2 application key secret  | _(from B2 dashboard)_                    |
| `S3_REGION`     | B2 region                  | `us-west-004`                            |

Note: `S3_PUBLIC_BASE_URL` is NOT required. Thumbnails are proxied through the backend at `/api/clips/:clipId/thumbnail` with `Cache-Control: public, max-age=86400` — they are never served directly from B2.

### mediamtx HLS Configuration

The current `mediamtx-server.yml` has `hlsAddress: ":0"` (disabled). The clipping feature requires HLS output enabled so the server can read the rolling buffer for ffmpeg clip extraction. Key settings to document:

```yaml
hls: true # enable HLS output
hlsAddress: ':8888' # or appropriate port -- internal only
hlsSegmentDuration: 2s # recommended
hlsSegmentCount: 450 # 15 min buffer at 2s segments
hlsDirectory: /hls # segment output path
hlsAlwaysRemux: true # generate segments continuously for clip buffer
# On the path:
useAbsoluteTimestamp: true # preserves original frame timestamps for accurate clip/UI sync
```

The HLS segments path must be a shared volume: mediamtx writes (read-write), server reads (read-only).

### Docker Volume Architecture

```
hls_segments (named volume)
  mediamtx container: /hls (read-write) -- writes HLS segments
  server container:   /hls (read-only)  -- ffmpeg reads segments for clip extraction
```

### B2 Architecture Note

B2 does NOT support per-object ACLs (`PutObjectAcl` is not available). The clipping feature is designed to work with a fully private B2 bucket:

- Video clips are uploaded with private ACL (served via presigned URLs from `GET /api/clips/:id/download`)
- Thumbnails are also stored privately and served through the backend proxy at `/api/clips/:clipId/thumbnail` (with `Cache-Control: public, max-age=86400`)
- No `PutObjectAcl` calls are made — the bucket stays private at all times

Operators may configure their reverse proxy (Traefik or Caddy) to cache the thumbnail endpoint for up to 24 h to reduce origin load, since the `Cache-Control` header already signals this is safe to cache.

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
