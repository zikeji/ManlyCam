# Sprint Change Proposal — 2026-03-23

## Section 1: Issue Summary

**Problem statement:**
Story 10-3 delivered a functional server-side clip creation pipeline but produced a clip creation UI (`ClipModal.vue`) that does not match the intended experience. The implementation reduced the spec's "HLS scrubber with drag handles" to an abstract modal dialog with preset buttons and numeric offset calculations — no video playback, no visual timeline track, no drag handles, no seek capability. The UX gap originated in the design phase (the UX spec has no clip creation screen), was not caught during story creation, and was discovered post-implementation during smoke testing.

**Context:**
- Discovered: 2026-03-23, after Story 10-3 code review
- Server pipeline (ffmpeg, S3, WsMessages, rate limiting, clip API) is correct and reusable
- Only the frontend clip creation UI needs replacement
- Stories 10-4 through 10-7 are unblocked and can proceed once 10-3b is done

---

## Section 2: Impact Analysis

**Epic Impact:**
- **Epic 10** (`in-progress`): Insert story `10-3b` between `10-3` (done) and `10-4` (ready-for-dev). No renumbering. Stories 10-4 through 10-7 remain unblocked — none have a UI dependency on the clip creation interface.
- All other epics: unaffected.

**Story Impact:**

| Story | Impact |
|---|---|
| 10-3 (done) | Server pipeline untouched. AC #2 (modal UI) annotated as superseded by 10-3b. |
| 10-3b (new) | Replaces ClipModal with ClipEditor overlay. Primary deliverable of this proposal. |
| 10-4 through 10-7 | No impact. Can proceed in parallel. |

**Artifact Conflicts:**

| Artifact | Change Needed |
|---|---|
| `epics.md` | Add `10-3b` to Epic 10 story list; annotate 10-3 AC #2 as superseded |
| `sprint-status.yaml` | Add `10-3b-clip-editor-ui` entry, status `ready-for-dev` |
| `CLAUDE.md` | Document hls.js as permitted for clip editor only (not live stream) |
| `architecture.md` | Note new `GET /api/stream/hls/:path` proxy route (additive) |

**Technical Impact:**
- New `hls.js` dependency (frontend, clip editor only)
- New `GET /api/stream/hls/:path` proxy route on Hono server (auth-gated, proxies to MTX_HLS_URL)
- `CLIP_MIN_DURATION_SECONDS` + `CLIP_MAX_DURATION_SECONDS` added to `env.ts` (replaces hardcoded constants in `clipService.ts`)
- `GET /api/clips/segment-range` response expanded: `earliest` clamped to `stream_started_at`; adds `minDurationSeconds` and `maxDurationSeconds`

---

## Section 3: Recommended Approach

**Selected approach:** Direct Adjustment — insert story `10-3b`

**Rationale:**
The server pipeline from 10-3 is production-quality and requires no changes. The UI replacement is self-contained. No rollback of completed work is required. No MVP scope reduction is required.

**Effort:** Medium — significant frontend component work (drag-handle scrubber, HLS `<video>` swap, timeline animation). Server additions are small (proxy route, 2 env vars, 1 validation tweak).

**Risk:** Low — all new code is isolated to the clip editor overlay. The live WHEP stream is never unmounted; the HLS player is hidden until clip mode is entered. No regressions to existing features.

**Timeline impact:** One additional story in Epic 10. Story 10-4 can start in parallel.

---

## Section 4: Detailed Change Proposals

### 4.1 — New Story: `10-3b` (Clip Editor UI)

**Story title:** `10-3b: Clip Editor UI — Stream-Integrated Timeline Scrubber`

**Full story spec:** See `_bmad-output/implementation-artifacts/10-3b-clip-editor-ui.md` (to be created by SM agent via `create-story`).

**Key acceptance criteria summary:**

1. **Clip button behavior** — When clicked, silently begins loading the HLS stream in the background. Clip button shows a loading spinner. Clip button disabled with tooltip "Stream just started — try again in a moment" for the first 60 seconds after `stream_started_at`.

2. **Seamless stream swap** — On HLS ready: CSS-hide the WHEP `<video>` element (do not pause or unmount it), reveal the HLS `<video>` in the same area. On submit or cancel: reverse the swap. WHEP resumes instantly.

3. **Clip editor overlay** — Overlays the video area (not a Dialog modal). Contains: HLS `<video>` player, timeline scrubber at bottom, name/description fields, share-to-chat switch, submit/cancel buttons.

4. **Timeline scrubber** — Visual sliding-window track showing available HLS buffer. Left bound clamped to `max(stream_started_at, hlsEarliest)`. Default selection: last 30 seconds at time of opening, auto-advancing as live stream progresses.
   - Dual drag handles: resize selection from either end
   - Click-drag inside selection: moves entire selection as a unit
   - Play/pause button: plays HLS from `startTime` through `endTime`
   - Seekable: click anywhere on track to reposition playhead
   - Min/max handle distance enforced visually (driven by `minDurationSeconds`/`maxDurationSeconds` from server)

5. **Preset buttons** — 30s, 1min, 2min; values driven by server config (not hardcoded). Only show presets ≤ `maxDurationSeconds`.

6. **Duration config** — Server exposes `minDurationSeconds` and `maxDurationSeconds` via `GET /api/clips/segment-range` response. Frontend reads these on clip editor open.

7. **HLS proxy route** — `GET /api/stream/hls/:path` (auth-required) proxies to `${MTX_HLS_URL}/cam/:path`. Used by hls.js in the frontend.

8. **Env vars** — `CLIP_MIN_DURATION_SECONDS` (default: `10`) and `CLIP_MAX_DURATION_SECONDS` (default: `120`) added to `env.ts`. Replace hardcoded `MAX_DURATION_S = 2 * 60` in `clipService.ts`; add min duration validation (422 if duration < `CLIP_MIN_DURATION_SECONDS`).

9. **`ClipModal.vue` removed** — Delete `ClipModal.vue` and `ClipModal.test.ts`. Replace with `ClipEditor.vue`. Update `BroadcastConsole.vue` accordingly.

10. **Quality gates** — typecheck, lint, test --coverage all pass. Zikeji smoke-tests on hardware before close.

---

### 4.2 — `epics.md` Edit

**Story:** Epic 10, story list (line ~437)

OLD:
```
- 10-3: Clip Creation Pipeline (endpoint, ffmpeg, S3 upload, rate limiting, Sonner, GET+download endpoints) _(depends on 10-2)_
- 10-4: My Clips Page ...
```

NEW:
```
- 10-3: Clip Creation Pipeline (endpoint, ffmpeg, S3 upload, rate limiting, Sonner, GET+download endpoints) _(depends on 10-2)_
- 10-3b: Clip Editor UI (stream-integrated timeline scrubber, HLS player swap, drag handles, min/max config, HLS proxy route) _(supersedes 10-3 AC #2; depends on 10-3)_
- 10-4: My Clips Page ...
```

**Rationale:** Registers the new story in the canonical epic list.

---

### 4.3 — `sprint-status.yaml` Edit

**Section:** Epic 10 block

OLD:
```yaml
  10-3-clip-creation-pipeline: done
  10-4-my-clips-page: ready-for-dev
```

NEW:
```yaml
  10-3-clip-creation-pipeline: done
  10-3b-clip-editor-ui: ready-for-dev
  10-4-my-clips-page: ready-for-dev
```

---

### 4.4 — `CLAUDE.md` Edit

**Section:** Anti-Patterns / Never Do These

OLD:
```
- **Never use HLS or introduce a new stream format** — the stream pipeline is WebRTC WHEP via mediamtx. Do not change it.
```

NEW:
```
- **Never use HLS or introduce a new stream format for the live stream** — the live stream pipeline is WebRTC WHEP via mediamtx. Do not change it. Exception: `hls.js` is used in `ClipEditor.vue` solely to play the mediamtx HLS rolling buffer during clip creation mode. This is intentional and confined to that component.
```

---

### 4.5 — `architecture.md` Edit

**Section:** Architecture Component Map / deviations table

Add row to the deviations table:

```
| Clip editor stream | N/A (new feature) | `GET /api/stream/hls/:path` Hono proxy → `${MTX_HLS_URL}/cam/:path`; `hls.js` in `ClipEditor.vue` plays HLS rolling buffer for clip preview; WHEP live stream hidden (not unmounted) during clip mode | [10-3b] |
```

---

## Section 5: Implementation Handoff

**Change scope:** Minor — direct implementation by dev agent.

**Handoff:**

| Role | Responsibility |
|---|---|
| **SM (this session)** | Apply artifact edits (epics.md, sprint-status.yaml, CLAUDE.md, architecture.md); create story file `10-3b` via `create-story` |
| **Dev agent (10-3b)** | Implement all server + frontend changes per story spec |
| **Zikeji** | Smoke-test clip editor on actual hardware before 10-3b closes: HLS load + WHEP swap, drag handles, move-selection drag, play/pause, clamp behavior, min/max enforcement, submit flow, cancel/resume |

**Success criteria:**
- `ClipModal.vue` replaced by `ClipEditor.vue` with HLS video playback
- WHEP stream hidden (not unmounted) during clip mode; resumes instantly on exit
- Timeline scrubber: dual drag handles + click-drag-to-move working
- Left bound clamped to `stream_started_at`; default selects last 30s, auto-advances
- Clip button disabled for first 60s of stream
- Min/max duration enforced visually and server-side via env vars
- All quality gates pass (typecheck, lint, test --coverage)
- Zikeji smoke-test sign-off
