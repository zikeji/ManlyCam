# Sprint Change Proposal — 2026-03-09

**Project:** ManlyCam
**Date:** 2026-03-09
**Status:** Approved
**Scope Classification:** Minor

---

## Section 1: Issue Summary

Three issues were discovered during real-device testing after Epic 3 was marked done and Epic 4 reached story 4-4:

**Bug #1 — Camera Control Toggles Non-Functional**
The admin camera controls sidebar (Story 3.6) renders correctly but toggle interactions do not call the backend `PATCH /api/stream/camera-settings` endpoint. The controls appear to fire events but the camera settings are never applied to mediamtx on the Pi. Discovered during local testing.

**Bug #2 — Mobile Landscape: Layout and Overlay Interaction Broken**
On mobile in landscape orientation, the stream does not fill available viewport space cleanly (causes a scrollbar). Additionally, tapping the stream area does not surface the controls overlay — meaning admin stream controls and camera settings are inaccessible on mobile landscape. Covers Story 3.3 (stream player + 4-state UI) and Story 3.6 (overlay controls). Discovered during real-device testing. This issue also blocks proper QA of Story 4-6 (viewer presence list), which requires mobile landscape testing.

**Issue #3 — WHEP WebRTC Requires Separate UDP Port (Deferred — No Change)**
Real-device testing confirmed that WebRTC WHEP media transport requires a separate UDP port (observed as 8189 externally). This was explicitly flagged in Story 3-2c as deferred to Epic 6. It remains deferred. Additional operator note: Cloudflare's free proxy tier is HTTP/S only and will not relay UDP, so the WebRTC media port must be directly exposed or the Cloudflare proxy must be set to DNS-only (grey-cloud) for the relevant hostname. This note will be added to Story 6-3 (operator documentation).

---

## Section 2: Impact Analysis

**Epic Impact**
- Epic 3 (done): Bugs originate here but epic remains done — fixes are injected as an unplanned story per established project pattern (ref: 3-2b, 3-2c)
- Epic 4 (in-progress): One unplanned story `4-4b` injected before `4-5`. Stories 4-5 and 4-6 are unblocked by bugs today but Bug #2 must be resolved before 4-6 can be fully QA'd on mobile
- Epic 6 (backlog): Story 6-3 gains a Cloudflare/UDP operator note — no structural change

**Story Impact**
- Stories 3.3 and 3.6 are the origin of the bugs — no changes to those story artifacts; bugs are addressed in 4-4b
- Story 4-6 unblocked for implementation now but requires 4-4b to be done before final QA

**Artifact Conflicts**
- PRD: None — bugs are implementation failures, not requirement gaps
- Architecture: None — 3-2c and 3-6 architecture notes already describe the correct design; bugs are deviations from it
- UX Spec: None — mobile layout intent is already captured; implementation didn't match

**Technical Impact**
- Frontend: Mobile landscape CSS (viewport fill without scrollbar), touch-tap overlay event wiring
- Frontend/Backend: Camera settings toggle → `PATCH /api/stream/camera-settings` call not firing; requires tracing and fixing the event/API wiring in the controls sidebar component
- Deployment (Epic 6 only): Cloudflare proxy incompatibility with WebRTC UDP — operator doc addition

---

## Section 3: Recommended Approach

**Direct Adjustment** — inject one unplanned story `4-4b` into Epic 4, to be completed before story 4-5.

**Rationale:**
- Follows established project pattern: mid-epic unplanned corrections (3-2b, 3-2c) have been handled this way before without disrupting the epic structure
- Both bugs (#1 and #2) are frontend-adjacent, independently scoped, and can be fixed and reviewed in a single focused story without excessive overhead
- Bug #2 creates a real testing dependency for 4-6 — resolving it now keeps the epic clean
- Issue #3 correctly stays deferred to Epic 6; no code change required today
- MVP scope and timeline are unaffected

**Effort estimate:** Low
**Risk level:** Low
**Timeline impact:** Minimal — single focused story inserted before already-backlog stories

---

## Section 4: Detailed Change Proposals

### Change 1: New Story — `4-4b: Bug Fixes — Camera Control Toggles and Mobile Landscape`

**Type:** New unplanned story, inserted between 4-4 and 4-5

**Sprint-status.yaml change:**

```yaml
# ADD after 4-4 entry:
4-4b-bug-fixes-camera-control-toggles-and-mobile-landscape: backlog
```

**Story scope (to be expanded in create-story):**
- Fix camera controls sidebar toggles: trace why toggle interactions are not invoking `PATCH /api/stream/camera-settings`; ensure changes reach the mediamtx API via the frp tunnel
- Fix mobile landscape stream layout: stream should fill available viewport without causing scrollbar
- Fix mobile landscape overlay: tapping stream area should surface controls and overlay on mobile landscape (same behaviour as desktop hover-gate but tap-triggered for touch)
- All existing tests must continue passing; add regression tests where applicable

**Files likely affected:** `apps/web/src/` — camera controls component, stream player / overlay component, mobile layout CSS

---

### Change 2: Epic 6 Story 6-3 Operator Note (annotation only — no story file change yet)

When Story 6-3 is created, include the following in operator documentation:

> **Cloudflare and WebRTC:** Cloudflare's free proxy (orange-cloud) does not relay UDP traffic. Since WebRTC media transport (DTLS-SRTP) uses UDP, the WebRTC port must be directly reachable. Use DNS-only mode (grey-cloud) for the hostname serving WebRTC, or expose the UDP port outside Cloudflare's proxy. The WebRTC signaling (WHEP POST/PATCH/DELETE) routes through Hono over HTTPS and is compatible with Cloudflare proxy.

---

## Section 5: Implementation Handoff

**Scope classification:** Minor — direct implementation by development team

**Handoff:** Dev agent via `dev-story` on story `4-4b` once story file is created via `create-story`

**Sequencing:**
1. Create story `4-4b` via `create-story` workflow
2. Implement and code-review `4-4b`
3. Continue with `4-5` → `4-6` as planned
4. Epic 6 story 6-3 creation: include Cloudflare/UDP operator note in scope

**Success criteria:**
- Camera control toggles invoke `PATCH /api/stream/camera-settings` and settings apply to mediamtx
- Mobile landscape: stream fills viewport, no scrollbar, overlay/controls accessible via tap
- All existing tests passing post-fix
- Story 4-6 can be fully QA'd on mobile landscape after 4-4b is done
