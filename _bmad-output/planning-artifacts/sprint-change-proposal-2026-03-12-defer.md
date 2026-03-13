# Sprint Change Proposal

**Date:** 2026-03-12
**Project:** ManlyCam
**Trigger:** User request to skip story 7-2
**Status:** ✅ Approved & Implemented

---

## 1. Issue Summary

**Problem:** Story 7-2 (editable stream title) is being de-scoped from Epic 7.

**Context:**
- Story 7-2-editable-stream-title-admin-mod-live-broadcast was in `backlog` status
- Story stub has been removed by project owner
- No implementation work existed for this story
- Decision is intentional scope reduction

**Evidence:**
- User explicitly stated: "we need to skip 7-2 - I've removed the stub, we're not going to implement 7-2"

---

## 2. Impact Analysis

### Epic Impact
- **Epic 7:** Remove story 7-2 from story list; epic remains viable with 4 remaining stories (7-1, 7-3, 7-4, 7-5)
- **Epic Status:** `in-progress` — no change needed

### Artifact Conflicts

| Artifact | Change Needed | Impact |
|---|---|---|
| **PRD.md** | Mark FR56 as deferred | FR56 (Stream Title) will not be implemented; non-critical enhancement feature |
| **epics.md** | Remove 7-2 from story list; update FRs covered | Consistency with sprint status |
| **architecture.md** | No changes | No architecture decisions tied to stream title |
| **ux-design-specification.md** | No changes | No UX design for stream title feature |

### Technical Impact
- Zero — no code, infrastructure, or deployment changes needed
- Story was never started; no rollback required

---

## 3. Recommended Approach

**Selected Path:** Direct Adjustment

**Rationale:**
- Story 7-2 was in backlog status with zero implementation work
- No dependencies on 7-2 exist in remaining stories (7-3, 7-4, 7-5)
- This is a straightforward scope reduction, not a replan
- Epic 7 can continue unchanged with 4 stories instead of 5

**Effort Estimate:** Low
**Risk Level:** Low
**Timeline Impact:** Reduces scope (net positive)

---

## 4. Detailed Change Proposals

### 4.1 sprint-status.yaml

**File:** `_bmad-output/implementation-artifacts/sprint-status.yaml`

**OLD:**
```yaml
  epic-7: in-progress
  7-1-ux-shell-redesign-broadcast-console-atmospheric-void: done
  7-2-editable-stream-title-admin-mod-live-broadcast: backlog
  7-3-camera-snapshot-button-client-side-frame-capture: backlog
  7-4-pisugar-battery-monitor-server-tcp-poller-admin-ui: backlog
  7-5-resizable-chat-sidebar-reka-ui-splitter: backlog
```

**NEW:**
```yaml
  epic-7: in-progress
  7-1-ux-shell-redesign-broadcast-console-atmospheric-void: done
  7-3-camera-snapshot-button-client-side-frame-capture: backlog
  7-4-pisugar-battery-monitor-server-tcp-poller-admin-ui: backlog
  7-5-resizable-chat-sidebar-reka-ui-splitter: backlog
```

**Status:** ✅ Completed

---

### 4.2 epics.md

**File:** `_bmad-output/planning-artifacts/epics.md`

**OLD:**
```markdown
**FRs covered:** FR56, FR57, FR58, FR59
**Approved via:** sprint-change-proposal-2026-03-12.md

**Stories:**
- 7-1: UX Shell Redesign — Broadcast Console + Atmospheric Void
- 7-2: Editable Stream Title (Admin/Mod, Live Broadcast)
- 7-3: Camera Snapshot Button (Client-Side Frame Capture)
- 7-4: PiSugar Battery Monitor (Server TCP Poller + Admin UI)
- 7-5: Resizable Chat Sidebar via Reka-UI Splitter
```

**NEW:**
```markdown
**FRs covered:** FR57, FR58, FR59 *(FR56 deferred per sprint-change-proposal-2026-03-12.md)*
**Approved via:** sprint-change-proposal-2026-03-12.md

**Stories:**
- 7-1: UX Shell Redesign — Broadcast Console + Atmospheric Void
- 7-3: Camera Snapshot Button (Client-Side Frame Capture)
- 7-4: PiSugar Battery Monitor (Server TCP Poller + Admin UI)
- 7-5: Resizable Chat Sidebar via Reka-UI Splitter
```

**Status:** ✅ Completed

---

### 4.3 prd.md

**File:** `_bmad-output/planning-artifacts/prd.md`

**Section:** Functional Requirements - Stream Title & Snapshot

**OLD:**
```markdown
- **FR56:** The Broadcast Console displays a configurable stream title (flavor text) in center; title has a default value and can be updated at runtime by Admin and Moderator users via an inline edit popover; title changes are persisted in server memory and broadcast immediately to all connected viewers via WebSocket so all clients reflect the change without reload
- **FR57:** All authenticated users can capture the current stream frame as a still image via a snapshot button (camera icon) in the Broadcast Console right flank; the capture is performed client-side using a canvas element and the resulting JPEG downloads to the user's device
```

**NEW:**
```markdown
- ~~**FR56:** The Broadcast Console displays a configurable stream title (flavor text) in center; the title has a default value and can be updated at runtime by Admin and Moderator users via an inline edit popover; title changes are persisted in server memory and broadcast immediately to all connected viewers via WebSocket so all clients reflect the change without reload~~ *(Deferred - out of current scope per sprint-change-proposal-2026-03-12.md)*
- **FR57:** All authenticated users can capture the current stream frame as a still image via a snapshot button (camera icon) in the Broadcast Console right flank; the capture is performed client-side using a canvas element and the resulting JPEG downloads to the user's device
```

**Status:** ✅ Completed

---

## 5. Implementation Handoff

### Change Scope Classification: **Minor**

**Handoff Recipients:** Development team (Zikeji directly)

### Responsibilities
- ✅ Remove 7-2 from sprint-status.yaml
- ✅ Update epics.md to remove 7-2 from story list
- ✅ Mark FR56 as deferred in prd.md

### Success Criteria
- [x] Story 7-2 no longer appears in sprint-status.yaml
- [x] Epic 7 continues with stories 7-3, 7-4, 7-5
- [x] Planning documents accurately reflect the de-scoping decision
- [x] No conflicts or inconsistencies between planning artifacts

---

## 6. Completion Summary

**Issue addressed:** Story 7-2 (editable stream title) removed from scope
**Change scope:** Minor
**Artifacts modified:**
- sprint-status.yaml
- epics.md
- prd.md

**Status:** ✅ All changes implemented successfully

---

*Generated via: /bmad-bmm-correct-course workflow*
*Approved by: Zikeji*
*Implementation date: 2026-03-12*
