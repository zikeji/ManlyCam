---
name: Epic 7 — Post-MVP UX Redesign & Feature Additions
description: Epic 7 added 2026-03-12 via correct-course workflow; UX shell redesign + 5 new stories
type: project
---

Epic 7 added 2026-03-12 with status backlog. Approved via sprint-change-proposal-2026-03-12.md.

**Why:** UX designer delivered new direction — Broadcast Console + Atmospheric Void — replacing the hover-overlay shell. Also scoped 4 new post-MVP features.

**Stories (7-1 must be first; 7-2 through 7-5 independent after that):**
- 7-1: UX Shell Redesign — BroadcastConsole.vue + AtmosphericVoid.vue; deletes ProfileAnchor.vue + SidebarCollapseButton.vue; restructures WatchView.vue + StreamPlayer.vue
- 7-2: Editable stream title in Console center (Admin/Mod inline popover); new `stream:title_update` WS message; `PATCH /api/stream/title` route
- 7-3: Snapshot button (camera icon) in Console right flank; client-side canvas capture → JPEG download; `useSnapshot` composable; uses `videoRef` exposed from StreamPlayer
- 7-4: Optional PiSugar battery monitor; env var `FRP_PISUGAR_PORT`; server TCP poller (`apps/server/src/lib/pisugar.ts`); new `pisugar:status` WS message (admin-only); `BatteryIndicator.vue` with 5 state variants; Pi frpc.toml needs new TCP tunnel entry; smoke test on actual Pi hardware required before close
- 7-5: Reka-UI Splitter (already installed at ^2.9.0) for resizable chat sidebar; SplitterGroup/Panel/ResizeHandle; auto-save-id for localStorage; desktop only

**New FRs:** FR56 (stream title), FR57 (snapshot), FR58 (PiSugar), FR59 (resizable sidebar)
**New WS message types:** stream:title_update, pisugar:status
**Artifacts updated:** prd.md, epics.md, architecture.md, sprint-status.yaml

**How to apply:** When creating story files for Epic 7, 7-1 must come first. For 7-4, remind Zikeji to smoke-test on actual Pi with PiSugar hardware before declaring done.
