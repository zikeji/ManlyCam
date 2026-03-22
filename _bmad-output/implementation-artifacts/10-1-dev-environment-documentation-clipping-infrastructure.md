# Story 10.1: Dev Environment Documentation (Clipping Infrastructure)

Status: ready-for-review

## Story

As a **developer setting up a local environment**,
I want complete documentation covering all new clipping infrastructure prerequisites,
So that I can run a fully functional clipping stack locally without a Backblaze B2 account.

## Acceptance Criteria

1. **Given** a developer reads the updated dev setup documentation **When** they follow the clipping infrastructure section **Then** it documents: the RustFS container service (image, ports, env vars, volume mount, bucket creation via console), and all new required env vars: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PUBLIC_BASE_URL`, `MTX_HLS_URL`

2. **Given** a developer reads the mediamtx configuration section **When** they follow it **Then** it documents the HLS output additions to `mediamtx-server.yml`: enabling HLS output, setting `hlsSegmentDuration` and `hlsSegmentCount`, and `useAbsoluteTimestamp: true` on the path to preserve original frame timestamps for accurate clip/UI synchronization; it also notes that the HLS path flush on stream offline uses the existing `MTX_API_URL` env var (already present in `env.ts` at default `http://127.0.0.1:9997`)

3. **Given** a developer reads the non-Docker / bare-metal section **When** they follow the clipping prerequisites **Then** it documents: installing ffmpeg on Linux (apt), verifying the install (`ffmpeg -version`), and running a local RustFS instance standalone with equivalent configuration

4. **And** all env var names documented here exactly match those validated in `apps/server/src/env.ts`

5. **And** the documentation notes that RustFS supports `PutObjectAcl` for object-level ACL operations (used by the clip visibility toggle)

6. **And** the documentation notes that `S3_PUBLIC_BASE_URL` for RustFS dev is `http://localhost:9000` and for Backblaze B2 is `https://f{n}.backblazeb2.com/file` (operator must supply correct B2 CDN hostname)

## Tasks / Subtasks

- [x] Task 1: Update `docs/deploy/README.md` with clipping infrastructure section (AC: #1, #4, #5, #6)
  - [x] 1.1 Add "Clipping Infrastructure (Development)" section after existing "Full-Stack Checklist" section
  - [x] 1.2 Document RustFS container service configuration (image: `rustfs/rustfs:latest`, ports: `9000:9000` and `9001:9001`, env vars, volume mount)
  - [x] 1.3 Document all new env vars in the existing "Environment Variables" section: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PUBLIC_BASE_URL`, `MTX_HLS_URL`
  - [x] 1.4 Document RustFS bucket creation via the RustFS web console (port 9001)
  - [x] 1.5 Document `S3_PUBLIC_BASE_URL` values for Docker (`http://rustfs:9000`), bare-metal (`http://localhost:9000`), and production B2 (`https://f{n}.backblazeb2.com/file`)
  - [x] 1.6 Document 15-minute max clip duration (450 segments × 2s)
  - [x] 1.7 Note that `MTX_API_URL` already exists in env.ts at default `http://127.0.0.1:9997` -- no new var needed for HLS flush

- [x] Task 2: Update `docs/deploy/mediamtx-server.yml` documentation (AC: #2)
  - [x] 2.1 Document HLS output additions: `hlsAddress`, `hlsSegmentDuration`, `hlsSegmentCount`
  - [x] 2.2 Document `useAbsoluteTimestamp: true` for accurate clip/UI timestamp synchronization

- [x] Task 3: Update bare-metal / non-Docker section in `docs/deploy/README.md` (AC: #3)
  - [x] 3.1 Document ffmpeg installation on Linux (`apt install ffmpeg`), macOS (`brew install ffmpeg`), and version check (`ffmpeg -version`)
  - [x] 3.2 Document standalone RustFS setup equivalent to the Docker service configuration

- [x] Task 4: Update `apps/server/.env.example` with new env vars (AC: #4)
  - [x] 4.1 Add `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PUBLIC_BASE_URL`, `MTX_HLS_URL` with dev defaults

- [x] Task 5: Update `docs/deploy/docker-compose.yml` (simple variant) with clipping services (AC: #1)
  - [x] 5.1 Add RustFS service definition
  - [x] 5.2 Add new S3/HLS env vars to server service environment block
  - [x] 5.3 Add rustfs to server service depends_on

- [x] Task 6: Update `docs/deploy/traefik/docker-compose.yml` with same clipping additions (AC: #1)
  - [x] 6.1 Mirror all changes from Task 5 into the Traefik variant
  - [x] 6.2 Fix rustfs service placement (must be inside services section, not after volumes)

- [x] Task 7: Verify env var name consistency (AC: #4)
  - [x] 7.1 Cross-check every documented env var name against `apps/server/src/env.ts` Zod schema (Story 10-2 will add these to env.ts; document the exact names here so 10-2 matches)

## Dev Notes

### This is a documentation + configuration story -- no application code changes

This story creates documentation and updates config files only. The actual env.ts Zod schema changes, Prisma migration, S3 client singleton, and WsMessage type updates happen in Story 10-2. The env var names documented here must exactly match what 10-2 will add to `env.ts`.

### Existing documentation structure

- **Deployment docs**: `docs/deploy/README.md` -- comprehensive guide covering simple Docker, Traefik, and bare-metal deployments
- **Docker Compose (simple)**: `docs/deploy/docker-compose.yml` -- 4 services: server, mediamtx, frps, postgres
- **Docker Compose (Traefik)**: `docs/deploy/traefik/docker-compose.yml` -- 5 services: traefik + same 4
- **mediamtx config**: `docs/deploy/mediamtx-server.yml` -- currently has HLS disabled (`hlsAddress: ":0"`)
- **Env example**: `apps/server/.env.example` -- all current env vars with dev defaults
- **Env validation**: `apps/server/src/env.ts` -- Zod schema (do NOT modify in this story)

### RustFS specifics

RustFS is a Rust-based S3-compatible object storage server. It serves as the local dev replacement for Backblaze B2 production storage. Key details:

- Docker image: `rustfs/rustfs:latest` (DockerHub)
- Port 9000: S3 API endpoint
- Port 9001: Web console (used for bucket creation and management)
- Default credentials: `manlycam`/`manlycam` (change to secure values for non-local deployments)
- RustFS supports `PutObjectAcl` for object-level ACL operations, which the clip visibility toggle uses to switch video objects between private and public-read

### mediamtx HLS configuration additions

The current `mediamtx-server.yml` has `hlsAddress: ":0"` (disabled). Story 10-1 documents (and 10-2 implements) these additions:

- `hlsAddress: ":8090"` -- HLS is internal-only (not exposed to browsers). Server accesses HLS via HTTP at this port.
- `hlsSegmentDuration` -- controls segment length (e.g., `2s`)
- `hlsSegmentCount` -- controls rolling buffer depth (450 segments = 15 min max clip duration at 2s/segment)
- `hlsAlwaysRemux: true` -- ensures continuous segment generation
- `useAbsoluteTimestamp: true` -- preserves original frame timestamps for accurate clip/UI synchronization

### Env var names (must match future env.ts additions in 10-2)

| Env Var              | Type   | Default    | Description                                                                                                                                 |
| -------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `S3_ENDPOINT`        | string | (required) | S3-compatible endpoint URL (dev: `http://localhost:9000`)                                                                                   |
| `S3_BUCKET`          | string | (required) | Bucket name for clip storage                                                                                                                |
| `S3_ACCESS_KEY`      | string | (required) | S3 access key                                                                                                                               |
| `S3_SECRET_KEY`      | string | (required) | S3 secret key                                                                                                                               |
| `S3_REGION`          | string | (required) | S3 region (dev: `us-east-1`, B2: your bucket region)                                                                                        |
| `S3_PUBLIC_BASE_URL` | string | (required) | Public URL base for thumbnails (Docker: `http://rustfs:9000`, bare-metal: `http://localhost:9000`, B2: `https://f{n}.backblazeb2.com/file`) |
| `MTX_HLS_URL`        | string | (required) | mediamtx HLS server base URL (e.g., `http://mediamtx:8090`)                                                                                 |

### Docker Compose additions pattern

Add RustFS service to the `services:` section:

```yaml
rustfs:
  image: rustfs/rustfs:latest
  restart: unless-stopped
  ports:
    - '9000:9000' # S3 API
    - '9001:9001' # Web console
  environment:
    RUSTFS_ROOT_USER: manlycam
    RUSTFS_ROOT_PASSWORD: manlycam
  volumes:
    - rustfsdata:/data
```

Add to the existing `volumes:` section at the bottom:

```yaml
volumes:
  pgdata:
  rustfsdata: # RustFS data persistence
```

And add `rustfsdata:` to named volumes.

### Ffmpeg requirement

The server Dockerfile already needs ffmpeg for clip processing (Story 10-2 will add `RUN apk add --no-cache ffmpeg` to the runtime stage). For bare-metal dev, document:

- Ubuntu/Debian: `sudo apt install ffmpeg`
- macOS: `brew install ffmpeg`
- Verify: `ffmpeg -version`

### Cross-story dependency chain

```
10-1 (this story: docs) <-- must land first
  |
  v
10-2 (infrastructure: env.ts, Prisma, S3 client, mediamtx config, WsMessage types)
  |
  +---> 10-3 (clip creation pipeline)
  +---> 10-4 (My Clips page)
  |       |
  |       v
  +---> 10-5 (chat clip integration) -- depends on 10-3
  +---> 10-6 (public clip pages) -- depends on 10-2 and 10-3
  |
  v
10-7 (production deployment docs) <-- closes epic
```

### Project Structure Notes

- All documentation lives in `docs/deploy/` -- follow the existing structure and style
- The `.env.example` lives at `apps/server/.env.example` (not root)
- Docker Compose files: `docs/deploy/docker-compose.yml` (simple) and `docs/deploy/traefik/docker-compose.yml` (Traefik)
- mediamtx config: `docs/deploy/mediamtx-server.yml` -- shared by both Docker variants
- Env validation: `apps/server/src/env.ts` -- do NOT modify in this story (10-2 adds the Zod entries)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 10: Clipping & Clip Sharing]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 10-1: Dev Environment Documentation]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 10-2: Clipping Infrastructure] (for env var name cross-reference)
- [Source: docs/deploy/README.md] (existing deployment documentation)
- [Source: docs/deploy/docker-compose.yml] (simple Docker Compose)
- [Source: docs/deploy/traefik/docker-compose.yml] (Traefik Docker Compose)
- [Source: docs/deploy/mediamtx-server.yml] (current mediamtx config -- HLS currently disabled)
- [Source: apps/server/src/env.ts] (current env validation schema)
- [Source: apps/server/.env.example] (current env example file)
- [Source: apps/server/Dockerfile] (current Dockerfile -- ffmpeg not yet present)

## Dev Agent Record

### Agent Model Used

kimi-k2.5

### Debug Log References

N/A - Documentation story with no code implementation issues

### Completion Notes List

1. **README.md Updates**: Added comprehensive "Clipping Infrastructure (Development)" section covering RustFS setup, mediamtx HLS configuration, and all new environment variables. Updated the Environment Variables table to include S3 and HLS vars with dev/production values. Documented 15-minute max clip duration (450 segments × 2s).

2. **Bare-metal Section**: Added ffmpeg installation instructions (apt, brew) and standalone RustFS systemd service configuration for non-Docker deployments.

3. **mediamtx-server.yml**: Updated to enable HLS output with `hls: true`, `hlsAddress: :8090`, `hlsSegmentDuration: 2s`, `hlsSegmentCount: 450`, `hlsAlwaysRemux: true`, and `useAbsoluteTimestamp: true` on the path. Added comprehensive inline documentation explaining each setting. (Note: Server accesses HLS via HTTP; no shared volume required.)

4. **.env.example**: Added S3 and HLS environment variables with dev defaults pointing to RustFS.

5. **docker-compose.yml (simple)**: Added RustFS service, rustfsdata volume, S3/HLS env vars to server service, and rustfs to server depends_on.

6. **docker-compose.yml (traefik)**: Mirrored all changes from simple variant. **Fixed critical bug**: moved rustfs service inside services section (was incorrectly placed after volumes).

7. **Env Var Consistency**: Verified all env var names (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PUBLIC_BASE_URL`, `MTX_HLS_URL`) are consistent across README.md, .env.example, and both docker-compose.yml files.

8. **Security Updates**: Changed RustFS default credentials from `minioadmin/minioadmin` to `manlycam/manlycam` with security warnings about changing for non-local deployments.

9. **Code Review Fixes** (2026-03-22):
   - Fixed Traefik docker-compose.yml structure (rustfs service placement)
   - Fixed S3_PUBLIC_BASE_URL default to `http://rustfs:9000` for Docker deployments
   - Removed obsolete `hls_segments` volume references (smoke testing confirmed HTTP-based HLS access works)
   - Removed obsolete `HLS_SEGMENTS_PATH` and `MTX_STREAM_PATH` env vars (replaced by `MTX_HLS_URL`)
   - Added rustfs to server depends_on in both docker-compose files
   - Documented 15-minute max clip duration

### File List

- `docs/deploy/README.md` (modified -- add clipping infrastructure sections, env var tables with MTX_HLS_URL, bare-metal ffmpeg/rustfs instructions, 15-min clip duration note, security warnings)
- `docs/deploy/docker-compose.yml` (modified -- add RustFS service, rustfsdata volume, new S3/HLS env vars, rustfs depends_on, fix credentials and S3_PUBLIC_BASE_URL)
- `docs/deploy/traefik/docker-compose.yml` (modified -- add RustFS service, rustfsdata volume, new S3/HLS env vars, rustfs depends_on, fix credentials and S3_PUBLIC_BASE_URL, fix service placement bug)
- `docs/deploy/mediamtx-server.yml` (modified -- enable HLS output, add configuration with inline documentation)
- `apps/server/.env.example` (modified -- add S3 and HLS env vars with dev defaults, update credentials)

### Change Log

- 2026-03-22: Story 10.1 implementation complete -- all documentation and configuration files updated for clipping infrastructure
