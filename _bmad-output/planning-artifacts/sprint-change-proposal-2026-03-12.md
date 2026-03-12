# Sprint Change Proposal — 2026-03-12
## UX Shell Redesign + Epic 7: Broadcast Console & Post-MVP Feature Additions

**Date:** 2026-03-12
**Prepared by:** SM / Correct Course Workflow
**Status:** Pending Approval

---

## Section 1: Issue Summary

### Problem Statement

With MVP delivery complete through Epic 6, the UX designer has delivered a significant redesign of the desktop and mobile shell layout. The approved direction shifts from a *Hover-Overlay Three-Column* model (stream fills full viewport height, all controls hidden at rest and revealed on hover) to a *Top-Aligned Stream with Broadcast Console & Atmospheric Void* model (stream anchored near the top, a persistent `<BroadcastConsole>` strip directly below, atmospheric void fills remaining height). Additionally, five new post-MVP features have been scoped for Epic 7.

### Discovery Context

- All 6 planned epics are DONE as of 2026-03-12.
- The UX designer produced and committed the updated `ux-design-specification.md` (diff reviewed in full).
- The prior implementation (Epic 3 Story 3-3, Epic 4 Story 4-4/4-4b) built the hover-overlay model. Those components are now being superseded — not rolled back, but replaced in-place by the new Epic 7 work.
- Five additional post-MVP features were identified alongside the redesign: editable stream title, camera snapshot, PiSugar battery monitor, and resizable chat sidebar.

### Evidence

- Git diff: `_bmad-output/planning-artifacts/ux-design-specification.md` — full direction change in the "Chosen Direction" table, all user flows, component inventory, and implementation roadmap.
- Existing components affected: `StreamPlayer.vue`, `WatchView.vue`, `ProfileAnchor.vue`, `SidebarCollapseButton.vue`.

---

## Section 2: Impact Analysis

### Epic Impact

| Epic | Status | Impact |
|---|---|---|
| Epics 1–6 | DONE | No modification required. All prior work intact. |
| Epic 7 | NEW | 5 stories added (see below). |

### Story Impact

**Existing stories:** No changes needed. Stories 3-3, 4-4, 4-4b implemented the hover-overlay model — that code is being replaced, not amended. The story files remain as historical record.

**New stories introduced:**
- 7-1: UX Shell Redesign — Broadcast Console + Atmospheric Void
- 7-2: Stream Title / Flavor Text (Admin/Mod Editable, Live Broadcast)
- 7-3: Camera Snapshot Button (Client-Side Frame Capture)
- 7-4: PiSugar Battery Monitor (Server TCP Poller + Admin UI)
- 7-5: Resizable Chat Sidebar via Reka-UI Splitter

### Artifact Conflicts

| Artifact | Conflict | Action Required |
|---|---|---|
| `prd.md` | "UX — Responsive Layout" describes old three-column with stream-fills-viewport | Update to Broadcast Console layout |
| `prd.md` | "UX — Hover-Reveal Overlay (Desktop)" section describes eliminated pattern | Replace with "UX — Broadcast Console" section |
| `prd.md` | No FRs for stream title, snapshot, PiSugar, resizable sidebar | Add FR56–FR59 |
| `architecture.md` | No PiSugar TCP service documented | Add PiSugar service section |
| `architecture.md` | WS message type list incomplete | Add `stream:title_update`, `pisugar:status` |
| `apps/server/src/env.ts` | No `FRP_PISUGAR_PORT` env var | Add optional env var |
| `packages/types/src/ws.ts` | Missing new message union members | Add in 7-2 and 7-4 stories |
| Pi frpc.toml | No PiSugar TCP tunnel | Add in 7-4 story (and operator docs) |
| Operator docs | No PiSugar setup section | Add frpc tunnel + PiSugar manager setup note |

### Technical Impact

**Web App (apps/web):**
- `WatchView.vue` — full layout restructure (not a minor edit)
- `StreamPlayer.vue` — remove hover overlay, profile anchor, sidebar collapse button from within stream component
- `ProfileAnchor.vue` — deleted; functionality absorbed into `BroadcastConsole.vue`
- `SidebarCollapseButton.vue` — deleted; functionality absorbed into `BroadcastConsole.vue`
- New: `BroadcastConsole.vue`, `AtmosphericVoid.vue`, `BatteryIndicator.vue`
- Test files: `ProfileAnchor.test.ts`, `SidebarCollapseButton.test.ts` deleted; `StreamPlayer.test.ts`, `WatchView.test.ts` significantly updated; new test files for new components

**Server (apps/server):**
- New: `src/lib/pisugar.ts` — TCP socket poller (7-4 only)
- New endpoint: `PATCH /api/stream/title` (7-2)
- `src/env.ts` — add `FRP_PISUGAR_PORT` (7-4)
- WS hub — broadcast `pisugar:status` to admin connections only (7-4)

**Shared Types (packages/types):**
- `src/ws.ts` — new union members for `stream:title_update` (7-2) and `pisugar:status` (7-4)

---

## Section 3: Recommended Approach

**Selected: Option 1 — Direct Adjustment** (new Epic 7, no rollback of prior work)

**Rationale:**
- All 6 MVP epics are complete and deployed. No in-flight work to disrupt.
- The UX redesign is a shell-level change — the chat, moderation, auth, and stream pipeline subsystems are untouched.
- The five feature additions are independent of each other and can be developed sequentially without blocking dependencies (except 7-1 must come before 7-2/7-3/7-4/7-5 since they all depend on `BroadcastConsole.vue` existing).
- No rollback needed; the hover-overlay components are simply replaced.

**Effort:** Medium (7-1 is the largest story; 7-4 has the most server-side novelty)
**Risk:** Low–Medium (7-4 PiSugar has hardware dependency; 7-1 has broad component surface area)
**Timeline impact:** New Epic 7 appended post-MVP; no existing deliverables affected.

---

## Section 4: Detailed Change Proposals

### Group A: PRD Updates

---

#### PRD Change A-1 — Replace "UX — Responsive Layout" section

**Section:** Requirements Inventory → Additional Requirements → UX — Responsive Layout

**OLD:**
```
**UX — Responsive Layout**
- Mobile-first CSS: base styles for `< 768px`, layer `md:` / `lg:` upward
- Desktop (`≥ 1024px`): three-column layout — left sidebar (admin camera controls) + stream (fills remaining) + right sidebar (chat + viewers)
- Mobile portrait (`< 768px`): stream full-width + persistent bottom chat bar; sidebars as bottom Sheet drawers
- Mobile landscape: stream fills left side; chat panel on right (collapsible)
- Sidebar collapse state persisted to `localStorage`; re-hydrated before first paint to prevent flash
```

**NEW:**
```
**UX — Responsive Layout**
- Mobile-first CSS: base styles for `< 768px`, layer `md:` / `lg:` upward
- Desktop (`≥ 1024px`): stream top-aligned (approx. 5vh top padding), `<BroadcastConsole>` strip directly below, `<AtmosphericVoid>` fills remaining height; right sidebar (chat + viewers) runs full height alongside; left sidebar (admin camera controls) opened via Console left flank toggle; right sidebar is drag-resizable between a min and max width
- Mobile portrait (`< 768px`): stream full-width at top, `<BroadcastConsole>` directly below, chat panel fills remaining height; admin controls and viewers as bottom Sheet drawers
- Mobile landscape: immersive — stream fills full screen; chat panel slides in from right as overlay; `<BroadcastConsole>` elements (live status, viewer count, toggles) integrated into chat sidebar header
- Sidebar collapse state persisted to `localStorage`; re-hydrated before first paint to prevent flash
```

**Rationale:** Reflects the approved UX redesign direction.

---

#### PRD Change A-2 — Replace "UX — Hover-Reveal Overlay (Desktop)" section

**Section:** Requirements Inventory → Additional Requirements → UX — Hover-Reveal Overlay (Desktop)

**OLD:**
```
**UX — Hover-Reveal Overlay (Desktop)**
- No persistent topbar — stream fills edge-to-edge, full viewport height
- Gradient overlay fades in (150ms) on cursor hover over stream; hidden at rest
- Top-right overlay: `|→` collapses right sidebar; `←|` expands it (with unread badge persisting through non-hover state)
- Bottom-left overlay: avatar profile button hidden at rest (appears on hover); click opens popover: username / Camera Controls (admin only) / Settings / Log out
```

**NEW:**
```
**UX — Broadcast Console**
- Persistent semi-transparent horizontal strip directly below the stream on desktop and mobile portrait
- Left flank (admin-only): Camera Controls toggle, Stream Start/Stop toggle, Battery Indicator (if PiSugar configured)
- Center: Stream title / flavor text (static by default; Admin and Moderator can click to edit via inline popover); Live status badge; Viewer count
- Right flank (all users): Snapshot button (camera icon, "Take Snapshot" tooltip); Profile avatar (click to open profile popover); Chat sidebar toggle with unread badge
- No hover-gated controls on the stream itself — the video element is unobstructed at all times
- Mobile landscape: Console elements move into chat sidebar header; stream is edge-to-edge immersive
```

**Rationale:** Replaces eliminated hover-overlay pattern with new Broadcast Console spec.

---

#### PRD Change A-3 — Add new Functional Requirements FR56–FR59

**Section:** Requirements Inventory → Functional Requirements (append after FR55)

**ADD:**
```
**Stream Title & Snapshot**
- FR56: The Broadcast Console displays a configurable stream title (flavor text) in the center; the title has a default value set at deploy time and can be updated at runtime by Admin and Moderator users via an inline edit popover; title changes are persisted in server memory and broadcast immediately to all connected viewers via WebSocket so all clients reflect the change without reload
- FR57: All authenticated users can capture the current stream frame as a still image via a snapshot button (camera icon) in the Broadcast Console right flank; the capture is performed client-side using a canvas element; the resulting image downloads to the user's device

**PiSugar Battery Monitor**
- FR58: When `FRP_PISUGAR_PORT` is set in the server environment, the server maintains a persistent TCP socket connection to the PiSugar power manager (proxied via frpc from the Pi) and polls for battery state on a 30-second interval; the polled data — battery level (%), plug state, charging state, and charging range — is broadcast exclusively to connected Admin users via a dedicated WebSocket message type; the Broadcast Console left flank (admin-only) displays a battery icon reflecting current status with a detail popover; when the TCP connection cannot be established or maintained, the icon reflects an "unknown" state

**Resizable Chat Sidebar**
- FR59: On desktop (`≥ 1024px`), the right chat sidebar is resizable by dragging a handle between the stream column and the chat sidebar; the sidebar width is constrained to a reasonable min/max range; the width is persisted to `localStorage` and restored on next visit; the sidebar can be fully collapsed via the Broadcast Console chat toggle, and re-expanded to its last saved width
```

**Rationale:** Covers all five Epic 7 stories at the requirements level.

---

### Group B: Architecture Updates

---

#### Architecture Change B-1 — Add PiSugar service documentation

**Section:** Add new subsection under server-side services / background processes

**ADD:**
```
**PiSugar Battery Monitor Service (Optional)**
- Activation: only when `FRP_PISUGAR_PORT` env var is set
- Transport: persistent TCP socket to `localhost:FRP_PISUGAR_PORT`
  - frpc on the Pi must have a corresponding TCP tunnel proxying Pi's PiSugar manager port (default 8423) to `FRP_PISUGAR_PORT` on the server
- Protocol: plain-text newline-delimited commands (`get battery`, `get battery_power_plugged`, `get battery_charging`, `get battery_charging_range`); responses are plain-text values
- Poll interval: 30 seconds
- On connection failure: emits `{ connected: false }` status and retries with backoff
- Fan-out: status emitted via in-process EventEmitter; WS hub filters to admin-role connections only before broadcasting `pisugar:status` message
- Implementation: `apps/server/src/lib/pisugar.ts`
```

---

#### Architecture Change B-2 — New WebSocket message types

**Section:** WebSocket & Real-time → WS message types

**ADD to existing WS message type list:**
```
- `stream:title_update` — `{ type: 'stream:title_update'; payload: { title: string } }` — broadcast to all connected viewers when an admin/mod updates the stream title
- `pisugar:status` — `{ type: 'pisugar:status'; payload: PiSugarStatus }` — broadcast to admin connections only on each poll cycle
  where PiSugarStatus =
    | { connected: false }
    | { connected: true; level: number; plugged: boolean; charging: boolean; chargingRange: [number, number] | null }
```

---

### Group C: Epic 7 Story Definitions

---

#### Epic 7 Definition

```
## Epic 7: Post-MVP UX Redesign & Feature Additions

**Goal:** Implement the approved UX redesign (Broadcast Console + Atmospheric Void replacing the hover-overlay model) and ship five post-MVP feature additions: editable stream title, client-side snapshot, PiSugar battery monitoring, and resizable chat sidebar.

**Stories:**
- 7-1: UX Shell Redesign — Broadcast Console + Atmospheric Void
- 7-2: Editable Stream Title (Admin/Mod, Live Broadcast)
- 7-3: Camera Snapshot Button (Client-Side Frame Capture)
- 7-4: PiSugar Battery Monitor (Server TCP Poller + Admin UI)
- 7-5: Resizable Chat Sidebar via Reka-UI Splitter
```

---

#### Story 7-1: UX Shell Redesign — Broadcast Console + Atmospheric Void

**Summary:** Implement the new layout — top-aligned stream, `<BroadcastConsole>` strip, `<AtmosphericVoid>` fill — replacing the hover-overlay shell. All existing functionality (admin toggle, chat toggle, profile menu, stream start/stop) is preserved but relocated into the Console.

**Key changes:**
- `WatchView.vue`: restructure layout from "stream fills viewport" to "stream at top + BroadcastConsole + AtmosphericVoid" with full-height right sidebar
- `StreamPlayer.vue`: remove all hover-overlay logic, `<ProfileAnchor>` and `<SidebarCollapseButton>` children; retain video element, state overlays, WHEP connection; expose `videoRef` via `defineExpose` for snapshot (7-3)
- Delete: `ProfileAnchor.vue`, `SidebarCollapseButton.vue` (and their test files)
- Create: `BroadcastConsole.vue` — three flanks:
  - Left (admin-only): Camera Controls toggle button, Stream Start/Stop toggle button; placeholder slots for 7-2 title (center), 7-4 battery (left)
  - Center: static stream title text placeholder (`"Manly is live 🐾"` default), `<StreamStatusBadge>` variant, viewer count
  - Right (all users): placeholder camera icon button (wired in 7-3), profile avatar popover (absorbs `ProfileAnchor` functionality), chat toggle with unread badge (absorbs `SidebarCollapseButton` functionality)
- Create: `AtmosphericVoid.vue` — `<video>` or `<canvas>` element mirroring the stream source, `filter: blur(40px) brightness(0.6)`, fills remaining vertical height; hidden in mobile portrait (chat fills height instead)
- Mobile portrait: BroadcastConsole below stream, chat panel fills remaining height
- Mobile landscape: stream edge-to-edge; BroadcastConsole elements (live badge, viewer count, chat toggle) moved into `ChatPanel.vue` header slot
- `AdminPanel.vue`: no change to close button (Console toggle handles desktop collapse)
- `WatchView.vue`: sidebar collapse state management moves from stream overlay events to Console events

**Test changes:**
- Delete: `ProfileAnchor.test.ts`, `SidebarCollapseButton.test.ts`
- Update: `StreamPlayer.test.ts` (remove hover/overlay tests), `WatchView.test.ts` (layout restructure)
- Create: `BroadcastConsole.test.ts`, `AtmosphericVoid.test.ts`

**Note for dev agent:** 7-1 intentionally leaves three placeholder slots wired but inactive — the camera icon button in the right flank (wired in 7-3), the stream title text (made editable in 7-2), and the battery icon in the left flank (added in 7-4). These should render as non-interactive elements or be omitted entirely with a comment stub, not be fully functional.

---

#### Story 7-2: Editable Stream Title (Admin/Mod, Live Broadcast)

**Summary:** The stream title / flavor text displayed in the `BroadcastConsole` center becomes runtime-editable by Admin and Moderator users. Edits are persisted server-side (in-memory) and broadcast to all connected viewers via WebSocket.

**Key changes:**
- `packages/types/src/ws.ts`: add `stream:title_update` message type
- `apps/server/src/lib/streamState.ts` (or equivalent state module): add `streamTitle: string` field; initialize with a default (e.g. `"Manly is live 🐾"`) or from a future env var
- `apps/server`: new route `PATCH /api/stream/title` (Admin + Moderator roles); validates non-empty string; updates in-memory state; broadcasts `stream:title_update` to all WS connections
- WS init message: include current `streamTitle` in the connection initialization payload so late-joining viewers see the current title immediately
- `BroadcastConsole.vue`:
  - Center: stream title text becomes clickable for Admin/Mod → opens `<Popover>` with `<Input>` pre-filled with current title
  - Submit on Enter or "Save" button → `PATCH /api/stream/title`
  - On `stream:title_update` WS message: update displayed title reactively for all viewers
  - Non-admin/mod viewers: title is read-only text

**Test changes:**
- New: `apps/server` — title route tests (auth, validation, broadcast)
- Update: `BroadcastConsole.test.ts` — edit popover interaction, WS message handling

---

#### Story 7-3: Camera Snapshot Button (Client-Side Frame Capture)

**Summary:** A camera icon button in the `BroadcastConsole` right flank lets any authenticated viewer capture the current stream frame as a still image (JPEG download). Entirely client-side — no server involvement.

**Key changes:**
- `BroadcastConsole.vue`: activate the camera icon button stub from 7-1
  - Tooltip: "Take Snapshot"
  - On click: call `takeSnapshot()` composable/function
  - Disabled state + tooltip "Stream not live" when stream is not in `live` state
- `StreamPlayer.vue`: expose `videoRef` via `defineExpose({ videoRef })` (may already be done in 7-1 for AtmosphericVoid to read)
- New composable `apps/web/src/composables/useSnapshot.ts`:
  ```
  function takeSnapshot(videoEl: HTMLVideoElement, petName: string): void
    1. Create off-screen <canvas> matching videoEl.videoWidth × videoEl.videoHeight
    2. ctx.drawImage(videoEl, 0, 0)
    3. canvas.toBlob(blob => { ... }, 'image/jpeg', 0.92)
    4. Create object URL → create <a> with download="${petName}-snapshot-${timestamp}.jpg" → click → revoke URL
  ```
- `BroadcastConsole.vue` receives `videoRef` and `streamState` props (or via provide/inject from WatchView)

**Test changes:**
- New: `useSnapshot.test.ts` — canvas mock, blob creation, download trigger
- Update: `BroadcastConsole.test.ts` — button disabled when not live, click handler

---

#### Story 7-4: PiSugar Battery Monitor (Server TCP Poller + Admin UI)

**Summary:** Optional PiSugar support. When `FRP_PISUGAR_PORT` is set, the server maintains a TCP connection to the PiSugar power manager (proxied via frpc from the Pi) and polls battery state every 30 seconds. Status is broadcast to Admin connections only via WebSocket. The Broadcast Console left flank (admin-only) shows a battery icon with a detail popover.

**Key changes:**

*Server:*
- `apps/server/src/env.ts`: add `FRP_PISUGAR_PORT: z.coerce.number().optional()`
- New `apps/server/src/lib/pisugar.ts`:
  - On startup (if `FRP_PISUGAR_PORT` set): establish TCP socket to `localhost:FRP_PISUGAR_PORT`
  - Poll every 30s: send `get battery\n`, `get battery_power_plugged\n`, `get battery_charging\n`, `get battery_charging_range\n` in sequence; parse responses
  - On connection error or timeout: emit `{ connected: false }`
  - On successful poll: emit `{ connected: true, level: number, plugged: boolean, charging: boolean, chargingRange: [number, number] | null }`
  - Reconnect with exponential backoff (cap at 60s) on failure
  - Emit events via the existing EventEmitter / state bus
- WS hub: on `pisugar:status` event, broadcast `{ type: 'pisugar:status', payload }` to admin-role connections only (filter by session role)
- WS init: include latest cached `PiSugarStatus` in admin connection init payload (so admin sees status immediately on join)

*Shared types:*
- `packages/types/src/ws.ts`: add `pisugar:status` message type with `PiSugarStatus` union

*Web:*
- `BroadcastConsole.vue` left flank: add `<BatteryIndicator />` (admin-only, only rendered if pisugar status has ever been received or if a `pisugarEnabled` flag is passed from WatchView — driven by presence of status messages, not a client-side env var)
- New `apps/web/src/components/admin/BatteryIndicator.vue`:
  - Props: `status: PiSugarStatus | null`
  - Renders icon + tooltip; click opens `<Popover>` with detailed view
  - States (icon + tooltip + popover behavior):

  | Scenario | Icon | Tooltip | Popover |
  |---|---|---|---|
  | `status === null` (never received) | — (hidden) | — | — |
  | `connected: false` | `BatteryWarning` or `BatteryQuestionMark` (lucide) | "Status Unknown" | Skeleton content with "Communication Failed, Status Unknown" overlay |
  | `connected: true, plugged: false, level > 20` | `Battery` (fill proportional to level) | "Battery: {level}%" | Level bar, not charging, not plugged |
  | `connected: true, plugged: false, level ≤ 20` | `BatteryLow` (amber/red) | "Battery Low: {level}%" | Warning color, level bar |
  | `connected: true, plugged: true, charging: true` | `BatteryCharging` (animated) | "Charging: {level}%" | Level bar, charging indicator, no range shown |
  | `connected: true, plugged: true, charging: false, chargingRange ≠ null` | `BatteryFull` or `BatteryMedium` (green) | "Smart Charge: {level}%" | Level bar, "Intentional discharge mode" note, range: "{range[0]}%–{range[1]}%" |

*Infrastructure (Pi side — documented in operator docs update):*
- Add TCP tunnel in Pi's `frpc.toml`:
  ```toml
  [[proxies]]
  name = "pisugar"
  type = "tcp"
  localIP = "127.0.0.1"
  localPort = 8423
  remotePort = <FRP_PISUGAR_PORT>
  ```
- PiSugar manager must be running on the Pi (installed separately per PiSugar docs)

**Test changes:**
- New: `apps/server/src/lib/pisugar.test.ts` — TCP mock, parse logic, reconnect behavior
- New: `BatteryIndicator.test.ts` — all 5 state variants
- Update: WS hub tests — admin-only broadcast filter
- Update: `BroadcastConsole.test.ts` — BatteryIndicator slot integration

---

#### Story 7-5: Resizable Chat Sidebar via Reka-UI Splitter

**Summary:** Replace the fixed-width right chat sidebar on desktop with a `<SplitterGroup>` / `<SplitterPanel>` layout using Reka-UI's Splitter. Width is drag-resizable within min/max constraints, persisted to `localStorage`, and collapsible via the Broadcast Console chat toggle.

**Key changes:**
- `WatchView.vue` (desktop layout only, `≥ 1024px`):
  - Wrap `[main column + right chat panel]` in `<SplitterGroup direction="horizontal" auto-save-id="manly-chat-sidebar">`
  - `<SplitterPanel>` for main column (stream + console + void) — `min-size` ensures stream is never squeezed below usable width
  - `<SplitterResizeHandle>` — styled to be subtle (thin vertical line, cursor `col-resize`, hover highlight)
  - `<SplitterPanel>` for chat sidebar — `size-unit="px"`, `default-size="320"`, `min-size="240"`, `max-size="600"`, `collapsible`, `collapsed-size="0"`; expose template ref for programmatic `collapse()` / `expand()`
  - Wire Broadcast Console chat toggle to call `chatPanel.collapse()` / `chatPanel.expand()` on the SplitterPanel ref
  - `auto-save-id` handles `localStorage` persistence automatically (Reka-UI built-in)
- Mobile (`< 1024px`): unchanged — Splitter is desktop-only; mobile portrait/landscape retain existing behavior
- No new shadcn-vue scaffold needed — Reka-UI Splitter components (`SplitterGroup`, `SplitterPanel`, `SplitterResizeHandle`) are imported directly from `reka-ui` (already installed at `^2.9.0`)
- Keyboard navigation: Splitter provides arrow key resize and Home/End out of the box; no additional a11y work needed

**Note for dev agent:** The `auto-save-id` on `SplitterGroup` persists the panel sizes automatically. The existing `localStorage` key for sidebar open/closed state (`chatSidebarOpen` or similar) must be reconciled — either keep both (open/closed as boolean, width as splitter state) or migrate to splitter-only state. Decision: keep both; boolean controls `collapse()` / `expand()`, splitter remembers width.

**Test changes:**
- Update: `WatchView.test.ts` — splitter renders on desktop, not on mobile; collapse/expand via Console toggle
- Minimal unit tests needed for Reka-UI Splitter itself (external library)

---

### Group D: Sprint Status Updates

```yaml
# Addition to _bmad-output/implementation-artifacts/sprint-status.yaml

  epic-7: backlog
  7-1-ux-shell-redesign-broadcast-console-atmospheric-void: backlog
  7-2-editable-stream-title-admin-mod-live-broadcast: backlog
  7-3-camera-snapshot-button-client-side-frame-capture: backlog
  7-4-pisugar-battery-monitor-server-tcp-poller-admin-ui: backlog
  7-5-resizable-chat-sidebar-reka-ui-splitter: backlog
```

---

## Section 5: Implementation Handoff

### Change Scope Classification: **Moderate**

Requires backlog formalization (SM creates story files) and dev implementation. No fundamental replan of MVP required — this is additive post-MVP work.

### Handoff Plan

| Role | Responsibility |
|---|---|
| SM | Create story files for 7-1 through 7-5 using `create-story` workflow; sequence 7-1 first (all others depend on BroadcastConsole existing) |
| Dev | Implement 7-1; then 7-2, 7-3, 7-4, 7-5 in any order (no inter-story dependencies after 7-1) |
| PM | Apply PRD changes (Group A) once proposal is approved |
| Architect | Apply architecture changes (Group B) once proposal is approved |
| Zikeji | Smoke-test 7-1 visually (layout, all controls functional); smoke-test 7-4 on actual Pi with PiSugar hardware before declaring done |

### Story Sequencing

```
7-1 → (7-2, 7-3, 7-4, 7-5 in any order — no dependencies between them)
```

7-1 must ship first. After that, stories can be developed independently in any sequence.

### Success Criteria

- **7-1:** Stream plays in new top-aligned layout; Console renders with all three flanks; AtmosphericVoid animates; hover-overlay controls are gone; all prior functionality (admin toggle, stream start/stop, chat toggle, profile popover, user manager) is accessible via Console; mobile portrait and landscape both correct; all tests passing
- **7-2:** Admins/mods can edit title; title updates instantly for all connected viewers; non-privileged users see read-only title; server restart resets title to default (acceptable for in-memory MVP)
- **7-3:** Snapshot button captures frame; JPEG downloads to device; button disabled (with tooltip) when stream not live
- **7-4:** Battery indicator appears in Console left flank when PiSugar status received; all 5 status states render correctly; no PiSugar env var = feature completely absent from UI; smoke-tested on actual Pi hardware
- **7-5:** Chat sidebar is drag-resizable on desktop; width persists on refresh; Console toggle collapses/expands correctly; mobile unaffected

---

## Section 6: Final Review Notes

- **ux-design-specification.md** is already committed with the new direction — no further update needed for that artifact.
- **PiSugar frpc tunnel** must be documented in operator docs update (part of 7-4 story scope).
- **`FRP_PISUGAR_PORT`** must also be added to `.env.example` in the server (7-4 scope).
- **7-1 is the largest story** — dev agent must explicitly request Zikeji to smoke-test the full UI before closing (per Epic 4 retro rule).
- **AtmosphericVoid** uses the same stream source as `StreamPlayer`. Preferred approach: pass the stream `src` URL as a prop to `AtmosphericVoid` rather than duplicating WHEP connections — a CSS `filter` on a `<video>` element pointed at the same WHEP or `<canvas>` copy of the video frame is the right implementation choice. Dev agent should assess the WHEP single-connection constraint and may use a canvas-mirror approach instead.
