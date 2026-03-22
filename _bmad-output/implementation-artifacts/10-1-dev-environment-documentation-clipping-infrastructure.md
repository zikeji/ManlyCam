# Story 10.1: Dev Environment Documentation (Clipping Infrastructure)

Status: ready-for-dev

## Story

As a **developer setting up a local environment**,
I want complete documentation covering all new clipping infrastructure prerequisites,
So that I can run a fully functional clipping stack locally without a Backblaze B2 account.

## Acceptance Criteria

1. **Given** a developer reads the updated dev setup documentation **When** they follow the clipping infrastructure section **Then** it documents: adding the `hls_segments` named Docker volume to `docker-compose`, the RustFS container service (image, ports, env vars, volume mount, bucket creation via console), and all new required env vars: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PUBLIC_BASE_URL`, `HLS_SEGMENTS_PATH` (default `/hls`), `MTX_STREAM_PATH` (the mediamtx path name used by the Pi RTSP stream, e.g., `cam`)

2. **Given** a developer reads the mediamtx configuration section **When** they follow it **Then** it documents the HLS output additions to `mediamtx-server.yml`: enabling HLS output, setting `hlsSegmentDuration` and `hlsSegmentMaxCount`, the segment output path matching the shared volume mount, and enabling `hlsProgramDateTime: yes` (required for absolute timestamp scrubbing); it also notes that the HLS path flush on stream offline uses the existing `MTX_API_URL` env var (already present in `env.ts` at default `http://127.0.0.1:9997`)

3. **Given** a developer reads the non-Docker / bare-metal section **When** they follow the clipping prerequisites **Then** it documents: installing ffmpeg on Linux (apt), verifying the install (`ffmpeg -version`), and running a local RustFS instance standalone with equivalent configuration

4. **And** the documentation clearly states that `hls_segments` must be mounted read-write in the mediamtx container and read-only in the server container

5. **And** all env var names documented here exactly match those validated in `apps/server/src/env.ts`

6. **And** the documentation notes that the RustFS dev bucket must be created with ACL support enabled (not owner-enforced mode); `PutObjectAcl` calls will return `AccessControlListNotSupported` on owner-enforced buckets, making the public/private visibility transition path untestable in development; this is a bucket creation flag, not a code change

7. **And** the documentation notes that `S3_PUBLIC_BASE_URL` for RustFS dev is `http://localhost:9000` and for Backblaze B2 is `https://f{n}.backblazeb2.com/file` (operator must supply correct B2 CDN hostname)

## Tasks / Subtasks

- [ ] Task 1: Update `docs/deploy/README.md` with clipping infrastructure section (AC: #1, #4, #5, #6, #7)
  - [ ] 1.1 Add "Clipping Infrastructure (Development)" section after existing "Full-Stack Checklist" section
  - [ ] 1.2 Document RustFS container service configuration (image: `ghcr.io/rustfs/rustfs:latest`, ports: `9000:9000` and `9001:9001`, env vars, volume mount)
  - [ ] 1.3 Document `hls_segments` named volume with mount directives (read-write for mediamtx, read-only for server)
  - [ ] 1.4 Document all new env vars in the existing "Environment Variables" section: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PUBLIC_BASE_URL`, `HLS_SEGMENTS_PATH`, `MTX_STREAM_PATH`
  - [ ] 1.5 Document RustFS bucket creation via the RustFS web console (port 9001) with ACL support enabled
  - [ ] 1.6 Document `S3_PUBLIC_BASE_URL` values for dev (`http://localhost:9000`) and production (`https://f{n}.backblazeb2.com/file`)
  - [ ] 1.7 Note that `MTX_API_URL` already exists in env.ts at default `http://127.0.0.1:9997` -- no new var needed for HLS flush

- [ ] Task 2: Update `docs/deploy/mediamtx-server.yml` documentation (AC: #2)
  - [ ] 2.1 Document HLS output additions: `hlsAddress`, `hlsSegmentDuration`, `hlsSegmentMaxCount`, segment output path, `hlsProgramDateTime: yes`
  - [ ] 2.2 Document the segment output path matching the shared volume mount path
  - [ ] 2.3 Explain `EXT-X-PROGRAM-DATE-TIME` requirement for absolute timestamp scrubbing

- [ ] Task 3: Update bare-metal / non-Docker section in `docs/deploy/README.md` (AC: #3)
  - [ ] 3.1 Document ffmpeg installation on Linux (`apt install ffmpeg`), macOS (`brew install ffmpeg`), and version check (`ffmpeg -version`)
  - [ ] 3.2 Document standalone RustFS setup equivalent to the Docker service configuration

- [ ] Task 4: Update `apps/server/.env.example` with new env vars (AC: #5)
  - [ ] 4.1 Add `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PUBLIC_BASE_URL` with dev defaults
  - [ ] 4.2 Add `HLS_SEGMENTS_PATH` (default `/hls`) and `MTX_STREAM_PATH` (default `cam`)

- [ ] Task 5: Update `docs/deploy/docker-compose.yml` (simple variant) with clipping services (AC: #1, #4)
  - [ ] 5.1 Add `hls_segments` named volume
  - [ ] 5.2 Add volume mounts: mediamtx read-write, server read-only
  - [ ] 5.3 Add RustFS service definition
  - [ ] 5.4 Add new S3/HLS env vars to server service environment block

- [ ] Task 6: Update `docs/deploy/traefik/docker-compose.yml` with same clipping additions (AC: #1, #4)
  - [ ] 6.1 Mirror all changes from Task 5 into the Traefik variant

- [ ] Task 7: Verify env var name consistency (AC: #5)
  - [ ] 7.1 Cross-check every documented env var name against `apps/server/src/env.ts` Zod schema (Story 10-2 will add these to env.ts; document the exact names here so 10-2 matches)

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
- Docker image: `ghcr.io/rustfs/rustfs:latest`
- Port 9000: S3 API endpoint
- Port 9001: Web console (used for bucket creation and management)
- Default credentials: `minioadmin`/`minioadmin` (RustFS uses MinIO-compatible defaults)
- Bucket must be created with ACL support enabled via the web console -- this is a manual step after first container start
- The `PutObjectAcl` S3 API call (used for clip visibility toggle between private/public) requires per-object ACL mode. Owner-enforced mode will silently fail or return `AccessControlListNotSupported`.

### mediamtx HLS configuration additions

The current `mediamtx-server.yml` has `hlsAddress: ":0"` (disabled). Story 10-1 documents (and 10-2 implements) these additions:
- `hlsAddress: ":8888"` -- note: this conflicts with existing `webrtcAddress: ":8888"`. The actual mediamtx config uses different ports. HLS is internal-only (not exposed to browsers). Use a non-conflicting port like `:8090` or let mediamtx default. The dev agent must verify the correct port in mediamtx docs.
- `hlsSegmentDuration` -- controls segment length (e.g., `2s`)
- `hlsSegmentMaxCount` -- controls rolling buffer depth (e.g., 450 segments = 15 min at 2s/segment for max clip duration)
- `hlsProgramDateTime: yes` -- required for `EXT-X-PROGRAM-DATE-TIME` tags that enable absolute timestamp seeking in ffmpeg
- Segment output path must match the `hls_segments` volume mount path

### Volume mount permissions

- mediamtx writes HLS segments, so it needs read-write: `- hls_segments:/hls:rw` (or just `- hls_segments:/hls`)
- The server container reads segments for ffmpeg clip extraction, so read-only: `- hls_segments:/hls:ro`
- Both containers must mount at the same path (`/hls`) for `HLS_SEGMENTS_PATH` to work consistently

### Env var names (must match future env.ts additions in 10-2)

| Env Var | Type | Default | Description |
|---------|------|---------|-------------|
| `S3_ENDPOINT` | string | (required) | S3-compatible endpoint URL (dev: `http://localhost:9000`) |
| `S3_BUCKET` | string | (required) | Bucket name for clip storage |
| `S3_ACCESS_KEY` | string | (required) | S3 access key |
| `S3_SECRET_KEY` | string | (required) | S3 secret key |
| `S3_REGION` | string | (required) | S3 region (dev: `us-east-1`, B2: your bucket region) |
| `S3_PUBLIC_BASE_URL` | string | (required) | Public URL base for thumbnails (dev: `http://localhost:9000`, B2: `https://f{n}.backblazeb2.com/file`) |
| `HLS_SEGMENTS_PATH` | string | `/hls` | Absolute path where mediamtx writes HLS segments |
| `MTX_STREAM_PATH` | string | `cam` | mediamtx path name for the Pi RTSP stream; used as `{HLS_SEGMENTS_PATH}/{MTX_STREAM_PATH}.m3u8` |

### Docker Compose additions pattern

Add to the existing `volumes:` section at the bottom:
```yaml
volumes:
  pgdata:
  hls_segments:  # Shared HLS segment buffer between mediamtx and server
```

Add RustFS service:
```yaml
  rustfs:
    image: ghcr.io/rustfs/rustfs:latest
    restart: unless-stopped
    ports:
      - "9000:9000"   # S3 API
      - "9001:9001"   # Web console
    environment:
      RUSTFS_ROOT_USER: minioadmin
      RUSTFS_ROOT_PASSWORD: minioadmin
    volumes:
      - rustfsdata:/data
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

### Debug Log References

### Completion Notes List

### File List

- `docs/deploy/README.md` (modified -- add clipping infrastructure sections)
- `docs/deploy/docker-compose.yml` (modified -- add hls_segments volume, RustFS service, new env vars)
- `docs/deploy/traefik/docker-compose.yml` (modified -- mirror clipping additions)
- `docs/deploy/mediamtx-server.yml` (modified -- document HLS output configuration)
- `apps/server/.env.example` (modified -- add S3 and HLS env vars)
