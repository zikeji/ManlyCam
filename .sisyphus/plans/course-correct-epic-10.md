# Course Correction: Epic 10 Story Specs

## TL;DR

> Fix obsolete `HLS_SEGMENTS_PATH` and `MTX_STREAM_PATH` references across Epic 10 story files. These env vars were removed in Story 10-1 (replaced by `MTX_HLS_URL`) but references remain in epics.md and subsequent story files, misleading dev agents.

---

## Context

Story 10-1 correctly documented removal of `HLS_SEGMENTS_PATH` and `MTX_STREAM_PATH` (line 214 of 10-1-dev-environment-documentation-clipping-infrastructure.md):

> "Removed obsolete `HLS_SEGMENTS_PATH` and `MTX_STREAM_PATH` env vars (replaced by `MTX_HLS_URL`)"

However, the epics.md source of truth was never updated, and subsequent story files (10-2, 10-3, 10-4, 10-7) still contain the obsolete references.

---

## Work Objectives

### Concrete Deliverables

- `epics.md` - Remove obsolete env vars from Story 10-1 description, fix Story 10-3 ffmpeg command, remove MTX_STREAM_PATH from Story 10-7 AC
- `10-2-clipping-infrastructure.md` - Remove MTX_STREAM_PATH from mediamtx API endpoint description
- `10-3-clip-creation-pipeline.md` - Update ffmpeg command, remove obsolete env var tasks
- `10-4-my-clips-page.md` - Clean prerequisites section
- `10-7-production-deployment-documentation.md` - Remove obsolete env vars from tables

### Definition of Done

- [ ] `epics.md` line 2063: `HLS_SEGMENTS_PATH` and `MTX_STREAM_PATH` removed from Story 10-1 description
- [ ] `epics.md` line 2169: ffmpeg command uses `MTX_HLS_URL` pattern
- [ ] `epics.md` line 2415: `MTX_STREAM_PATH` mention removed
- [ ] `10-2` lines 137, 229: `MTX_STREAM_PATH` removed from API endpoint descriptions
- [ ] `10-3` lines 21, 49-50, 103, 189: All obsolete env var references replaced with `MTX_HLS_URL`
- [ ] `10-4` line 110: Prerequisites cleaned
- [ ] `10-7` lines 27, 59, 98-99: Obsolete env vars removed from tables

---

## Verification Strategy

Run after fixes:

```bash
grep -r "HLS_SEGMENTS_PATH\|MTX_STREAM_PATH" _bmad-output/
```

Expected: Only matches in Story 10-1 completion notes (which correctly document the removal).

---

## TODOs

### Task 1: Fix epics.md

**What to do:**

- [ ] Edit `epics.md` line 2063: Replace env vars list in Story 10-1 description
  - OLD: `HLS_SEGMENTS_PATH` (default `/hls` — the shared volume mount path), `MTX_STREAM_PATH` (the mediamtx path name used by the Pi RTSP stream, e.g., `cam` — must match the mediamtx `paths` configuration and the HLS output path)
  - NEW: `MTX_HLS_URL` (mediamtx HLS server base URL, e.g., `http://mediamtx:8090`)

- [ ] Edit `epics.md` line 2169 (Story 10-3 AC): Replace ffmpeg command path
  - OLD: `-ss {startTime_ISO8601} -i {HLS_SEGMENTS_PATH}/{MTX_STREAM_PATH}.m3u8 ...`
  - NEW: `-ss {startTime_ISO8601} -i {MTX_HLS_URL}/cam.m3u8 ...` (mediamtx serves HLS at `{MTX_HLS_URL}/cam.m3u8` — the path name `cam` is hardcoded in mediamtx config)

- [ ] Edit `epics.md` line 2415 (Story 10-7 AC): Remove MTX_STREAM_PATH mention
  - OLD: `MTX_STREAM_PATH` env var (default `cam`) must also be configured to match the mediamtx path name used by the Pi camera
  - DELETE this sentence entirely

---

### Task 2: Fix 10-2-clipping-infrastructure.md

**What to do:**

- [ ] Edit line 137: Remove `MTX_STREAM_PATH` from mediamtx API endpoint
  - OLD: `DELETE {MTX_API_URL}/v3/hlsmuxers/delete/{MTX_STREAM_PATH}`
  - NEW: `DELETE {MTX_API_URL}/v3/hlsmuxers/delete/cam` (path name `cam` is hardcoded)

- [ ] Edit line 229: Remove ACKNOWLEDGED note about `MTX_STREAM_PATH`
  - OLD: `The endpoint DELETE {MTX_API_URL}/v3/hlsmuxers/delete/{MTX_STREAM_PATH} will be verified during implementation smoke testing.`
  - DELETE this sentence

---

### Task 3: Fix 10-3-clip-creation-pipeline.md

**What to do:**

- [ ] Edit line 21 (AC #5 ffmpeg description): Replace path construction
  - OLD: `{HLS_SEGMENTS_PATH}/{MTX_STREAM_PATH}.m3u8`
  - NEW: `{MTX_HLS_URL}/cam.m3u8` (the `cam` path name is hardcoded in mediamtx config)

- [ ] Edit lines 49-50 (Task 1): Remove obsolete env var additions
  - DELETE: `- [ ] Add `HLS_SEGMENTS_PATH` (`z.string().default('/hls')`)`
  - DELETE: `- [ ] Add `MTX_STREAM_PATH` (`z.string().default('cam')`)`

- [ ] Edit line 103 (Task 11): Fix fetchPlaylist comment
  - OLD: `fetchPlaylist()` -- fetch and parse `.m3u8` from `{HLS_SEGMENTS_PATH}/{MTX_STREAM_PATH}.m3u8`
  - NEW: `fetchPlaylist()` -- fetch and parse `.m3u8` from `{MTX_HLS_URL}/cam.m3u8`

- [ ] Edit line 189 (Dev Notes): Fix filesystem path comment
  - OLD: `Read `{HLS_SEGMENTS_PATH}/{MTX_STREAM_PATH}.m3u8` from filesystem`
  - NEW: `Read `{MTX_HLS_URL}/cam.m3u8` from the HLS endpoint` (server accesses via HTTP from mediamtx, not filesystem)

---

### Task 4: Fix 10-4-my-clips-page.md

**What to do:**

- [ ] Edit line 110 (Prerequisites): Remove obsolete env vars
  - OLD: `S3 env vars in `apps/server/src/env.ts` (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_REGION, S3_PUBLIC_BASE_URL, HLS_SEGMENTS_PATH, MTX_STREAM_PATH)`
  - NEW: `S3 env vars in `apps/server/src/env.ts` (S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_REGION, S3_PUBLIC_BASE_URL, MTX_HLS_URL)`

---

### Task 5: Fix 10-7-production-deployment-documentation.md

**What to do:**

- [ ] Edit line 27 (AC #8): Remove MTX_STREAM_PATH mention
  - OLD: `MTX_STREAM_PATH` env var (default `cam`) must also be configured to match the mediamtx path name used by the Pi camera
  - DELETE this sentence

- [ ] Edit line 59 (Task 6.4): Remove task about MTX_STREAM_PATH
  - DELETE: `- [ ] 6.4 Document `MTX_STREAM_PATH` and its relationship to the Pi mediamtx path name`

- [ ] Edit lines 98-99 (Env vars table): Remove obsolete entries
  - DELETE: `| `HLS_SEGMENTS_PATH` | Absolute path where mediamtx writes HLS segments |`/hls` (default)                                   |`
  - DELETE: `| `MTX_STREAM_PATH`   | mediamtx path name matching Pi RTSP stream       |`cam` (default)                                    |`

---

## Success Criteria

- `grep -r "HLS_SEGMENTS_PATH\|MTX_STREAM_PATH" _bmad-output/` returns only matches in Story 10-1 completion notes
- No story file contains references to env vars that don't exist in `apps/server/src/env.ts`
- All path references use the `MTX_HLS_URL` pattern (e.g., `{MTX_HLS_URL}/cam.m3u8`)
