---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
documentsIncluded:
  prd: _bmad-output/planning-artifacts/prd.md
  architecture: _bmad-output/planning-artifacts/architecture.md
  epics: _bmad-output/planning-artifacts/epics.md
  ux: _bmad-output/planning-artifacts/ux-design-specification.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-03-06
**Project:** ManlyCam

## Document Inventory

| # | Type | File |
|---|------|------|
| 1 | PRD | `_bmad-output/planning-artifacts/prd.md` |
| 2 | Architecture | `_bmad-output/planning-artifacts/architecture.md` |
| 3 | Epics & Stories | `_bmad-output/planning-artifacts/epics.md` |
| 4 | UX Design | `_bmad-output/planning-artifacts/ux-design-specification.md` |

---

## PRD Analysis

### Functional Requirements

**Authentication & Access Control**

- FR1: Unauthenticated users can view a landing page that explains the stream's private nature and provides a login entry point
- FR2: Users can authenticate via Google OAuth using their Google account
- FR3: The system grants stream access to users whose email domain matches a configured domain allowlist
- FR4: The system grants stream access to users whose individual email address is on the allowlist
- FR5: The system denies access to users who do not match any allowlist entry and presents a clear rejection message post-OAuth
- FR6: The system does not create persistent account records for rejected users
- FR7: Authenticated users' sessions persist across visits without requiring re-authentication
- FR8: User profile information (display name, avatar) is sourced from Google OAuth; gravatar is used as fallback when no Google avatar is available

**Stream & State Management**

- FR9: Authenticated users can view a live video stream
- FR10: The stream UI communicates one of four explicit states: live, intentionally offline, unreachable-but-should-be-live, or offline-and-unreachable
- FR11: Admin users can start and stop the stream from the web UI on any device
- FR12: When the Pi is unreachable and the stream toggle is set to live, the UI displays a "check back soon" message
- FR13: When the stream is stopped by an admin, all active viewer sessions immediately reflect the offline state
- FR14: Admin users can adjust camera settings (all v4l2-ctl exposed controls) from the web UI with real-time effect on the stream
- FR15: Admin users can access camera settings controls from a collapsible sidebar in the web UI

**Chat**

- FR16: Authenticated users can send text messages in a chat sidebar alongside the stream; all chat activity (new messages, edits, deletions) is delivered in real-time to all connected users via WebSocket
- FR17: Chat messages support basic markdown formatting
- FR18: The chat sidebar displays the sender's avatar and display name with each message
- FR19: The chat sidebar loads the last 200 messages on page load
- FR20: The chat sidebar is collapsed by default on smaller screens and expanded by default on larger screens
- FR21: Users receive an unread message count indicator on the collapsed chat sidebar while the stream is open
- FR22: Users can expand and collapse the chat sidebar at will
- FR23: Users can edit or delete their own chat messages via a message context menu; edits are recorded as revision history and display an "edited" indicator with a timestamp tooltip on hover; deletions are soft-deletes (record retained server-side)
- FR24: All authenticated users can view the list of currently connected viewers
- FR25: The chat sidebar supports infinite scroll — scrolling upward loads older messages progressively with clear day-boundary delineators between message groups

**Moderation**

- FR26: Moderator and Admin users can delete any user's chat message via a message context menu; deletions are soft-deletes with revision history retained server-side
- FR27: Moderator and Admin users can mute a user via that user's profile context menu; muted users retain stream access but cannot send chat messages or reactions
- FR28: Moderator and Admin users can ban a user via that user's profile context menu; banned users have access revoked and active sessions terminated immediately
- FR29: Moderator and Admin users can unmute a previously muted user
- FR30: All moderation actions (message delete, mute, unmute, ban) are recorded in an audit log
- FR31: Non-privileged users see no elevated options on other users' profiles or messages they do not own

**Role & User Management**

- FR32: The system enforces a four-tier role hierarchy: Admin, Moderator, Viewer (Company), Viewer (Guest)
- FR33: All users are assigned their base viewer tier automatically on first authenticated login based on their allowlist match (company domain = Viewer Company; individual email = Viewer Guest)
- FR34: Admin role can only be assigned via CLI
- FR35: Admin users can promote or demote any previously authenticated user to/from the Moderator role via the web UI
- FR36: Admin users can promote or demote users to/from any role via CLI
- FR37: Admin users can view all registered users and their first-seen and last-seen timestamps
- FR38: Viewer (Guest) users display a visible "Guest" pill/tag adjacent to their username in the chat interface
- FR39: Admin users can assign a custom label to any user that replaces or overrides the default role pill/tag displayed in chat
- FR40: Admin users can assign a custom color to a user's label pill/tag; colors must be theme-compatible and legible in both dark and light mode

**Allowlist & Blocklist Management**

- FR41: Admin users can add or remove domain entries from the allowlist via CLI
- FR42: Admin users can add or remove individual email addresses from the allowlist via CLI
- FR43: Admin users can ban or unban individual user accounts via CLI
- FR44: Removal of a user from the allowlist or addition to the blocklist takes effect immediately on any active session

**IoT Agent & Infrastructure**

- FR45: The Pi agent establishes and maintains an frp stream proxy tunnel to the upstream server on boot
- FR46: The Pi agent establishes and maintains an frp API proxy tunnel to the upstream server on boot, enabling camera control commands from the backend
- FR47: The Pi agent is managed by systemd with automatic restart-on-failure
- FR48: The Pi agent reads sensitive configuration (upstream server address, auth tokens) from a separate config file that is not bundled in the binary or CI artifacts
- FR49: Administrators can update the Pi agent via `update-manlycam`, which compares the installed version against the latest GitHub release, downloads the artifact if a newer version exists, and restarts the service
- FR50: The Pi agent includes an install script and README covering the full bootstrap flow (OS flash → camera verification via `rpicam-still` → endpoint configuration via `--endpoint <url>`)
- FR51: The Pi agent activates a captive portal for WiFi configuration when it cannot connect to a known network; the captive portal loosely follows the branding and theming guidelines of the main web interface

**Platform & Developer Operations**

- FR52: The web application is a single-page application; all viewer, chat, and admin features are accessible within a single page surface without full navigation
- FR53: The upstream server detects Pi tunnel disconnection and reflects the appropriate stream state to all connected viewers without crashing or data loss
- FR54: GitHub Actions produces cross-compiled ARM binaries for the Pi agent with automatic semver versioning and GitHub Releases; CI artifacts contain no PII or sensitive configuration
- FR55: The application is configurable with an instance-specific pet name and site name; these values are set at upstream server deploy time; no hardcoded references to either value exist in the codebase

**Total FRs: 55**

---

### Non-Functional Requirements

**Performance**

- NFR1: Stream latency is minimized to the extent permitted by hardware, camera pipeline, frp tunnel, and network conditions; no artificial buffering or delay is introduced at any layer
- NFR2: The upstream server introduces no unnecessary encoding or relay delay; stream is proxied to viewers as efficiently as the infrastructure permits
- NFR3: Chat messages are delivered to all connected clients via WebSocket following established best practices; delivery is bounded only by network conditions

**Security**

- NFR4: All traffic between clients, the upstream server, and the Pi is transmitted over encrypted connections (TLS)
- NFR5: Google OAuth is validated once at login; the server issues a JWT for subsequent request authentication; user profile data is upserted on each login; clients are not instructed to re-validate OAuth tokens mid-session
- NFR6: User allowlist and role checks are enforced server-side; access cannot be bypassed by client manipulation
- NFR7: Session revocation (ban, allowlist removal) takes effect immediately via WebSocket signal to the affected client's active connection
- NFR8: The Pi agent binary published via CI contains no credentials, server addresses, or PII; all sensitive configuration is stored in a separate on-device config file with restricted filesystem permissions
- NFR9: Audit log entries for moderation actions are append-only and cannot be modified or deleted by any web UI action

**Reliability**

- NFR10: The Pi frp agent is managed by systemd with automatic restart-on-failure; transient crashes must not require manual intervention to recover
- NFR11: The upstream server handles Pi tunnel disconnection gracefully — active viewer WebSocket connections remain open and reflect the updated stream state without server error or crash
- NFR12: The upstream server handles concurrent viewer connections up to 10–20 without stream degradation; additional capacity is addressed by scaling the upstream server, not the Pi
- NFR13: A degraded-but-live stream is always preferable to a clean failure; no component should terminate a live stream silently

**Data**

- NFR14: Chat messages and audit log records are retained indefinitely; no automated expiry or deletion policy is applied by the application
- NFR15: Chat message edits are stored as revision history; soft-deleted messages retain their server-side record; no user-initiated action results in permanent data loss
- NFR16: Bulk data management is an administrative database operation performed outside the application UI

**Total NFRs: 16**

---

### Additional Requirements / Constraints

- **Browser scope:** Modern evergreen browsers only (Chrome, Firefox, Edge — current + 1 prior major version); Safari/iOS explicitly out of scope
- **Mobile:** Mobile-first for admin use case (Firefox on Android); stream toggle must be usable from phone
- **Accessibility:** Best-effort semantic HTML; no formal WCAG target; dark mode required
- **Pi hardware:** Pi Zero W 2 is a fixed constraint — not upgradeable mid-project; Pi is a thin frp agent only (no application logic)
- **Development model:** AI-assisted (BMAD); single dev; no hard deadline; optimize for AI-generation clarity
- **Post-MVP deferred:** Web UI allowlist/banlist management, audit log viewer, message reactions, SSH tunnel SPA page

### PRD Completeness Assessment

The PRD is **comprehensive and well-structured**. Requirements are numbered, categorized, and traceable to user journeys. Key strengths:

- Clear 4-state stream model with explicit Pi+toggle matrix
- Role hierarchy is unambiguous with capability boundaries defined per role
- MVP vs post-MVP scoping is explicit
- Security and reliability constraints are specific and actionable
- IoT agent lifecycle is fully described

No gaps identified in the PRD itself.

---

## Epic Coverage Validation

### Coverage Matrix

| FR | PRD Requirement (summary) | Epic Coverage | Status |
|---|---|---|---|
| FR1 | Unauthenticated landing page | Epic 2 → Story 2.1 | ✓ Covered |
| FR2 | Google OAuth sign-in | Epic 2 → Story 2.1 | ✓ Covered |
| FR3 | Domain allowlist enforcement | Epic 2 → Story 2.2 | ✓ Covered |
| FR4 | Individual email allowlist | Epic 2 → Story 2.2 | ✓ Covered |
| FR5 | Clear rejection state post-OAuth | Epic 2 → Story 2.2 | ✓ Covered |
| FR6 | No ghost accounts for rejected users | Epic 2 → Story 2.2 | ✓ Covered |
| FR7 | Persistent sessions across visits | Epic 2 → Story 2.3 | ✓ Covered |
| FR8 | Avatar from Google / Gravatar fallback | Epic 2 → Story 2.4 | ✓ Covered |
| FR9 | Authenticated live stream access | Epic 3 → Story 3.2/3.3 | ✓ Covered |
| FR10 | 4-state stream UI | Epic 3 → Story 3.3 | ✓ Covered |
| FR11 | Admin stream start/stop from web UI | Epic 3 → Story 3.5 | ✓ Covered |
| FR12 | "Check back soon" when Pi unreachable + toggle live | Epic 3 → Story 3.3 | ✓ Covered |
| FR13 | Immediate offline state broadcast on admin toggle | Epic 3 → Story 3.5 | ✓ Covered |
| FR14 | Camera settings controls with real-time v4l2-ctl effect | Epic 3 → Story 3.6 | ✓ Covered |
| FR15 | Collapsible camera settings sidebar (admin only) | Epic 3 → Story 3.6 | ✓ Covered |
| FR16 | Real-time chat via WebSocket | Epic 4 → Story 4.1 | ✓ Covered |
| FR17 | Markdown formatting in chat | Epic 4 → Story 4.1 | ✓ Covered |
| FR18 | Avatar + display name with each message | Epic 4 → Story 4.3 | ✓ Covered |
| FR19 | Load last 200 messages on page load | Epic 4 → Story 4.2 | ✓ Covered |
| FR20 | Auto-collapse (small) / auto-expand (large) | Epic 4 → Story 4.4 | ✓ Covered |
| FR21 | Unread message count badge on collapsed sidebar | Epic 4 → Story 4.4 | ✓ Covered |
| FR22 | Manual expand/collapse of chat sidebar | Epic 4 → Story 4.4 | ✓ Covered |
| FR23 | Edit/delete own messages; revision history; soft-delete | Epic 4 → Story 4.5 | ✓ Covered |
| FR24 | Viewer presence list (all authenticated users) | Epic 4 → Story 4.6 | ✓ Covered |
| FR25 | Infinite scroll with day-boundary delineators | Epic 4 → Story 4.2 | ✓ Covered |
| FR26 | Mod/Admin delete any message; soft-delete | Epic 5 → Story 5.1 | ✓ Covered |
| FR27 | Mod/Admin mute user (chat-silenced, stream retained) | Epic 5 → Story 5.2 | ✓ Covered |
| FR28 | Mod/Admin ban user (access revoked + immediate session end) | Epic 5 → Story 5.3 | ✓ Covered |
| FR29 | Mod/Admin unmute user | Epic 5 → Story 5.2 | ✓ Covered |
| FR30 | Audit log for all moderation actions | Epic 5 → Story 5.4 | ✓ Covered |
| FR31 | Non-privileged users see no elevated options | Epic 5 → Story 5.4 | ✓ Covered |
| FR32 | Four-tier role hierarchy | Epic 5 → Story 5.5 | ✓ Covered |
| FR33 | Auto-assign base viewer tier on first login | Epic 5 → Story 5.5 | ✓ Covered |
| FR34 | Admin role CLI-only assignment | Epic 5 → Story 5.5 | ✓ Covered |
| FR35 | Admin promote/demote Moderator via web UI | Epic 5 → Story 5.5 | ✓ Covered |
| FR36 | Admin promote/demote any role via CLI | Epic 5 → Story 5.5 | ✓ Covered |
| FR37 | Admin view all users with timestamps | Epic 5 → Story 5.5 | ✓ Covered |
| FR38 | Server-computed UserTag on all user profiles | Epic 5 → Story 5.6 | ✓ Covered |
| FR39 | Admin set custom UserTag text | Epic 5 → Story 5.6 | ✓ Covered |
| FR40 | Admin set custom UserTag color | Epic 5 → Story 5.6 | ✓ Covered |
| FR41 | CLI add/remove domain allowlist entries | Epic 2 → Story 2.5 | ✓ Covered |
| FR42 | CLI add/remove individual email allowlist entries | Epic 2 → Story 2.5 | ✓ Covered |
| FR43 | CLI ban/unban user accounts | Epic 2 → Story 2.5 | ✓ Covered |
| FR44 | Immediate active session enforcement on allowlist/blocklist change | Epic 2 → Story 2.5 | ⚠️ Partial |
| FR45 | Pi agent frp stream proxy tunnel on boot | Epic 3 → Story 3.1 | ✓ Covered |
| FR46 | Pi agent frp API proxy tunnel on boot | Epic 3 → Story 3.1 | ✓ Covered |
| FR47 | Pi agent systemd restart-on-failure | Epic 3 → Story 3.1 | ✓ Covered |
| FR48 | Pi agent config file separated from binary | Epic 3 → Story 3.1 | ✓ Covered |
| FR49 | `update-manlycam` self-update command | Epic 6 → Story 6.1 | ✓ Covered |
| FR50 | Install script + README: bootstrap flow | Epic 6 → Story 6.2 | ✓ Covered |
| FR51 | Captive portal for WiFi config | Epic 6 → Story 6.3 | ✓ Covered |
| FR52 | Single-page application constraint | Epic 3 → Story 3.3 | ✓ Covered |
| FR53 | Graceful Pi tunnel-drop handling | Epic 3 → Story 3.2 | ✓ Covered |
| FR54 | GitHub Actions CI/CD: cross-compiled ARM, semver releases | Epic 1 → Story 1.3 | ✓ Covered |
| FR55 | Deploy-time configurable pet name / site name | Epic 1 → Story 1.1/1.4 | ✓ Covered |

### Missing Requirements

No FRs are fully missing from the epics. FR44 has partial coverage — see issues below.

### Coverage Statistics

- **Total PRD FRs:** 55
- **FRs fully covered in epics:** 54
- **FRs partially covered:** 1 (FR44)
- **Coverage percentage:** 98% (100% addressed; 1 implementation gap)

### Issues Found During Coverage Validation

#### ISSUE-1: FR44 Partial Implementation (MEDIUM)

**FR44:** "Removal of a user from the allowlist or addition to the blocklist takes effect immediately on any active session."

Story 2.5 explicitly states: *"the domain entry is removed — existing registered users are not affected (allowlist gates registration only)"* and *"the individual email entry is removed — the user's existing account is not deleted."* Only the ban operation terminates active sessions atomically.

**Gap:** The PRD requires allowlist removal to take immediate effect on active sessions. The stories only implement immediate effect for bans, not for allowlist removal. Allowlist removal currently has no impact on already-authenticated users.

**Recommendation:** Add a clarifying story or acceptance criterion: either confirm that allowlist removal intentionally does NOT revoke existing sessions (and update FR44 to clarify), or add a session-revocation step to `manlycam-admin allowlist remove-domain` and `remove-email` commands.

---

#### ISSUE-2: NFR5 PRD/Architecture Conflict — JWT vs Session Cookie (MEDIUM)

**PRD NFR5:** "the server issues a JWT for subsequent request authentication"

**Epics Architecture note + Story 2.3:** "DB-backed sessions (`sessions` table) — no stateless JWT; `httpOnly SameSite=Strict Secure` cookie"

The architecture explicitly chose DB-backed sessions over JWTs. This is a valid and defensible decision, but the PRD NFR5 text was never updated to reflect it. Story 2.3 implements session cookies, not JWTs.

**Recommendation:** Update PRD NFR5 to read "session cookie" instead of "JWT" to eliminate the contradiction and prevent developer confusion.

---

#### ISSUE-3: Audit Log UI Scope Expansion (MEDIUM)

**PRD MVP scope:** "All moderation actions audit-logged (audit log storage is MVP; **viewer UI is post-MVP**)"

**PRD Post-MVP list:** "Audit log viewer (admin-only SPA page)"

**Story 5.4** includes a full audit log UI: `GET /api/admin/audit-log`, `<AuditLogTable>` component, pagination. This exceeds the PRD MVP scope definition.

**Recommendation:** Decide: (a) accept this scope expansion and update the PRD MVP scope, or (b) move Story 5.4's UI portion to a future epic and scope it as post-MVP. The backend audit log writes (FR30) remain MVP regardless.

---

#### ISSUE-4: CLI Naming Inconsistency (LOW)

**PRD:** Uses `manlycam` as the CLI command (e.g., `manlycam allowlist add guest@gmail.com`, `manlycam role assign caleb@company.com admin`).

**Story 2.5:** Uses `manlycam-admin allowlist add-domain company.com` / `manlycam-admin users ban user@company.com`

**Story 5.5:** Uses `npm run cli -- grant-admin --email=<email>` and `npm run cli -- set-role`

Three different CLI invocation patterns appear across the epics. This will cause friction for the developer and for operators following the docs.

**Recommendation:** Standardize to a single CLI invocation pattern across all stories before implementation begins. The PRD's `manlycam` pattern is the most user-friendly; `npm run cli --` is a dev convenience that should not appear in operator-facing documentation.

---

#### ISSUE-5: Pi Agent Config Format Conflict (LOW)

**Story 1.4 / Story 3.1:** References `config.example.toml` with TOML sections `[stream]`, `[frp]`, `[update]`; config stored at `/etc/manlycam/config.toml`

**Story 6.2:** References `~/.config/manlycam/config.yaml` (YAML, user-home path); config keys listed as `serverEndpoint`, `serverToken`, `streamName`, `stunServer`

Two conflicting config formats (TOML vs YAML), two different paths (`/etc/manlycam/` vs `~/.config/manlycam/`), and different key names appear in the same document. `stunServer` in Story 6.2 is unexplained — no STUN/WebRTC usage is present elsewhere in the architecture.

**Recommendation:** Standardize config format and path across all stories (TOML at `/etc/manlycam/config.toml` aligns with the architecture doc and systemd conventions). Remove `stunServer` from Story 6.2 or document its purpose.

---

#### ISSUE-6: Session Revocation Method Inconsistency (LOW)

**Story 2.5 (CLI ban):** On session delete, "the WS hub detects the missing session on the next heartbeat and sends `{ type: 'session:revoked', payload: { reason: 'banned' } }` to that user's connection"

**Story 5.3 (Web UI ban):** "the WS connection is closed with close code `4003 Banned`"

Two different mechanisms are described for the same logical outcome (ban → session revocation). This will result in duplicate client handling paths.

**Recommendation:** Standardize on a single revocation mechanism across both CLI and web UI ban. The WS `session:revoked` message (already in the `WsMessage` discriminated union) is more flexible and already typed. WebSocket close code `4003` is simpler but less extensible. Pick one and apply consistently.

---

## UX Alignment Assessment

### UX Document Status

**Found** — `_bmad-output/planning-artifacts/ux-design-specification.md` (complete, 14 steps, status: complete)

The UX document is comprehensive and of high quality. It covers: visual design system (color tokens, typography, spacing), component library (ShadCN-vue), all user journeys with Mermaid flow diagrams, responsive strategy (4 breakpoints), accessibility requirements, and a complete component inventory with custom components specified.

### UX ↔ PRD Alignment

**Strong alignment overall.** The UX document is consistent with PRD user journeys and functional requirements in nearly all areas. The following gaps were identified:

#### UX-1: WCAG Target Mismatch (LOW)

**UX spec:** "WCAG 2.1 AA throughout. WCAG 2.1 AAA for stream status elements."

**PRD:** "Best-effort semantic HTML; no formal WCAG target"

The UX sets a materially higher accessibility bar than the PRD. The epics adopted the UX's WCAG 2.1 AA target (confirmed in epics additional requirements). The PRD text was not updated.

**Recommendation:** Update PRD accessibility requirement to match the UX and epics (WCAG 2.1 AA throughout, AAA for stream status). This is an improvement, not a conflict.

---

#### UX-2: Safari/iOS Testing in UX Contradicts PRD (LOW)

**UX testing strategy:** "Actual iOS Safari — iPhone portrait + landscape — mobile bottom bar, touch targets, drawer swipe-to-close"

**PRD:** "Safari / iOS explicitly out of scope — if it works, fine; if streaming implementation would require Safari-specific workarounds or degrade the experience for other users, deprioritize it entirely"

The UX includes iOS Safari in its formal testing matrix. The PRD explicitly deprioritizes Safari.

**Recommendation:** Align: either remove iOS Safari from the UX testing strategy, or update the PRD to acknowledge that basic layout testing on iOS Safari is acceptable as long as no HLS-specific Safari workarounds are introduced.

---

#### UX-3: `connecting` as a 5th Stream State (LOW)

**PRD FR10:** Defines four explicit states: live, intentionally offline, unreachable-but-should-be-live, offline-and-unreachable.

**UX:** Adds a `connecting` initial state (skeleton at 16:9 + "Connecting…" badge) before any stream state is known.

This is a sensible UX addition and is already implemented in Story 3.3. No conflict in practice — it's an initial transient state before the real 4-state machine takes over.

**Recommendation:** No action required. Story 3.3 correctly implements both the connecting state and the 4-state machine.

### UX ↔ Architecture Alignment

#### UX-4: React References in a Vue 3 Project (MEDIUM)

The UX spec contains two React-specific references:

1. **"Compound component pattern for `<StreamPlayer>` — owns stream state, passes context to child overlays via **React context**"** — The stack is Vue 3; the equivalent is Vue `provide/inject`.

2. **"Radix UI `react-resizable-panels` (or equivalent) for the resizable sidebar gutter model"** — `react-resizable-panels` is a React package and cannot be used in Vue 3.

The epics correctly reference Vue-native patterns (`useWebSocket.ts` composable, `provide()`/`inject()`), so the epics have already normalized this. But the UX doc's wording could mislead the implementing developer.

**Recommendation:** Update UX spec to reference Vue `provide/inject` and a Vue-compatible resizable panel library (e.g. `vue-resizable-panels` or CSS `grid-template-columns` with drag logic). Low priority since epics take precedence.

---

#### UX-5: Resizable Sidebars Not in Stories (MEDIUM)

The UX spec specifies **draggable gutter/resizable sidebars**: "Draggable gutters at each sidebar edge give users direct control over screen real estate allocation" and sidebar widths are "resizable via drag gutter."

No epic story includes acceptance criteria for resizable sidebars. Story 3.3 and Story 4.4 only describe collapse/expand behavior, not resize-by-drag.

**Recommendation:** Add a story or acceptance criterion for sidebar resize-by-drag if this is intended as MVP behavior. If it's nice-to-have, explicitly mark it post-MVP in both the UX spec and the epics, and ensure the collapse-only behavior is sufficient for MVP.

---

#### UX-6: Mobile Admin Access — Persistent Cog Not in Stories (LOW)

**UX spec (mobile design):** "Admin cog — Always visible in stream top bar on mobile (not hover-gated)"

**Story 3.6:** Describes camera controls on mobile as a bottom `<Sheet>` drawer, but does not specify the trigger mechanism on mobile (it only describes the desktop hover + profile popover path).

The mobile trigger for camera controls (the "always-visible cog") is specified in the UX but has no corresponding acceptance criterion in any story.

**Recommendation:** Add an acceptance criterion to Story 3.6 covering the mobile admin trigger: "Given the admin is on a mobile viewport (`< md`), a persistent camera/settings control icon is visible in the stream top bar without requiring hover."

---

#### UX-7: `CUSTOM_FOOTER` Env Var Not in Architecture (LOW)

**UX spec footer:** "configurable copyright/brand line driven by deploy-time config (`CUSTOM_FOOTER`) — no hardcoded company name in codebase"

**Architecture / PRD / Stories:** Use `SITE_NAME` and `PET_NAME` as the configurable values. `CUSTOM_FOOTER` does not appear anywhere else.

**Recommendation:** Remove `CUSTOM_FOOTER` from UX spec and replace with the established `SITE_NAME` env var pattern. Alternatively, if a full custom footer string is desired, add `CUSTOM_FOOTER` to Story 1.1's env var list and `.env.example`.

### Warnings

None critical. The UX document is aligned with the overall product vision and architecture. Issues UX-4, UX-5, and UX-6 are the most important to resolve before implementation begins to avoid developer confusion or scope ambiguity.

---

## Epic Quality Review

### Validation Standards Applied

- Epics must deliver user value (not be technical milestones)
- Epic independence: Epic N cannot require Epic N+1
- Stories must be independently completable
- No forward dependencies within or between epics
- Acceptance criteria must follow BDD format, be testable and complete

---

### Epic Structure Validation

#### Epic 1: Monorepo Foundation & CI/CD

**User Value:** Borderline. Title is technical ("Monorepo Foundation") rather than user-centric. However, the epic goal is correctly phrased as "the development team can scaffold, build, test, and deploy all three components from a single repository." For a greenfield project, this setup epic is a necessary and accepted first epic.

**Independence:** ✓ Stands alone — no prior epics required.

**Greenfield check:** ✓ Includes initial project setup (Story 1.1), development environment configuration, and CI/CD pipelines (Story 1.3).

**Stories:**
- Story 1.1: Initialize Monorepo ✓ — appropriate sizing, clear developer value
- Story 1.2: Prisma Schema ✓ — foundational, well-defined
- Story 1.3: CI/CD Pipelines ✓ — well-structured, path-filtered
- Story 1.4: Deployment Configs ✓ — clear developer value

**Verdict:** ✓ Acceptable. The technical framing is expected for a foundation epic.

---

#### Epic 2: Authentication & Access Control

**User Value:** ✓ Clear — "Authorized viewers can sign in with Google and access the platform." A user can fully authenticate and access (or be rejected) after this epic.

**Independence:** ✓ Depends only on Epic 1 (scaffold + DB schema).

**Stories:** 2.1 through 2.5 — logically sequential and independently completable within the epic.

**Verdict:** ✓ Well-structured.

---

#### Epic 3: Live Video Stream

**User Value:** ✓ Clear — "Viewers can watch Manly live in their browser."

**Independence:** ✓ Depends on Epics 1+2.

**Stories:** 3.1 through 3.6.

**Verdict:** ✓ Well-structured with one soft intra-epic dependency noted below.

---

#### Epic 4: Real-Time Chat & Presence

**User Value:** ✓ Clear — "Viewers can chat alongside the stream in real time."

**Independence:** ✓ Depends on Epics 1+2+3 (WebSocket hub in Epic 3).

**Verdict:** ✓ Well-structured.

---

#### Epic 5: Moderation, Roles & User Management

**User Value:** ✓ Clear — "Moderators can maintain a healthy chat environment."

**Independence:** ✓ Depends on Epics 1–4.

**Verdict:** ✓ Acceptable, with issues noted below.

---

#### Epic 6: Pi Agent Operational Tooling

**User Value:** ✓ Clear — "Admin can bootstrap a new Pi from scratch, update the agent, and recover WiFi."

**Independence:** ✓ Depends on Epic 1 (CI for ARM binaries) and Epic 3 (frp tunnel concepts).

**Verdict:** ✓ Well-structured.

---

### 🔴 Critical Violations

None identified. No epics are purely technical with zero user value, no circular dependencies exist, and no stories are too large to complete independently.

---

### 🟠 Major Issues

#### EQ-1: Story 1.2 Creates All Database Tables Upfront

**Standard:** Each story should create the database tables it needs, not all tables upfront.

**Violation:** Story 1.2 defines and migrates the complete schema (`users`, `sessions`, `allowlist_entries`, `messages`, `audit_log`) in a single story as part of Epic 1.

**Context/Mitigation:** This follows Prisma's standard schema-first workflow, where all models are defined together and a single initial migration is applied. Incremental per-story migrations in Prisma are possible but add complexity. The team has made a deliberate architectural choice to front-load schema definition.

**Recommendation:** Acknowledge this as an intentional architectural decision and document it. If incremental migrations are preferred, split Story 1.2 by epic (e.g., only `users`/`sessions`/`allowlist_entries` in Epic 1, `messages` in Epic 4, `audit_log` in Epic 5). This is a pragmatic call for the team.

---

#### EQ-2: Audit_Log Schema Conflict Between Story 1.2 and Story 5.4

**Story 1.2 (Prisma Schema):** `audit_log` table has columns `target_user_id CHAR(26) (nullable FK → users)` and `target_message_id CHAR(26) (nullable)` — two separate columns.

**Story 5.4 (Audit Log Access):** States the `audit_log` table schema as `target_id TEXT` — a single, non-FK text column, plus a `metadata JSONB` column not mentioned in Story 1.2.

These two stories define the audit_log table differently. A developer implementing Story 1.2 and then Story 5.4 will encounter a contradiction.

**Recommendation:** Reconcile the schema. Decide: (a) Use two separate FK columns (`target_user_id`, `target_message_id`) per Story 1.2 — more relational integrity; or (b) Use a single `target_id TEXT` with `metadata JSONB` per Story 5.4 — more flexible but looser typing. Update both stories to use the same definition.

---

#### EQ-3: Story 5.4 Combines Two Unrelated Concerns

Story 5.4 is titled "Audit Log Access and Non-Privileged UI Gating." It covers:
1. A full admin audit log UI (`GET /api/admin/audit-log`, `<AuditLogTable>`, pagination)
2. Verifying non-privileged users see no elevated UI affordances (mute/ban/delete hidden)

These are separate features. Concern #2 (non-privileged UI gating) is a cross-cutting concern that arguably belongs as acceptance criteria on Stories 5.1, 5.2, and 5.3 rather than a standalone section in 5.4. This creates ambiguity about when gating is implemented — if 5.4 is deferred, does the non-privileged gating also get deferred?

**Recommendation:** Move the non-privileged UI gating acceptance criteria into Stories 5.1, 5.2, and 5.3 (where the moderation actions are implemented). Story 5.4 should focus solely on the audit log viewer. If the audit log UI is deferred (see ISSUE-3), the moderation action stories still enforce correct UI gating.

---

### 🟡 Minor Concerns

#### EQ-4: Story 3.3 Soft Intra-Epic Dependency on Story 3.4 (WebSocket)

Story 3.3 (SPA Shell + Stream Player) references real-time stream state via WebSocket (`stream:state` messages). Story 3.4 (WebSocket Hub) implements the WebSocket infrastructure.

Story 3.3 partially mitigates this by calling `GET /api/stream/state` on initial page load for HTTP-based state hydration. But the real-time state updates (Pi disconnection → unreachable state) require Story 3.4's WebSocket hub.

This is a soft dependency — Story 3.3 is partially functional without Story 3.4, but the full 4-state real-time behavior requires 3.4.

**Recommendation:** Reorder implementation: complete Story 3.4 before Story 3.3, or add a note in Story 3.3 ACs that real-time state changes are validated after Story 3.4 is merged.

---

#### EQ-5: Story 4.6 Sizing (Larger but Acceptable)

Story 4.6 covers: viewer presence list UI, `presence:join`/`presence:leave` events, typing indicator (start, stop, debounce, multi-user, animation, aria-live). This is on the larger side for a single story.

The two concerns (presence list + typing indicator) are often developed together since they share the WebSocket presence infrastructure. Splitting would create a half-implemented presence feature.

**Recommendation:** Acceptable as-is for MVP given the shared infrastructure. If needed, the typing indicator animation and multi-user copy could be deferred post-MVP with a simplified single-user typing indicator first.

---

#### EQ-6: Story 6.2 Install Script References Inconsistent Config Format

(Already documented as ISSUE-5 in Epic Coverage Validation — `~/.config/manlycam/config.yaml` vs `/etc/manlycam/config.toml`.) The inconsistency spans Story 6.2 vs Stories 1.4 and 3.1.

---

### Best Practices Compliance Summary

| Epic | Delivers User Value | Independent | Stories Sized OK | No Forward Deps | ACs BDD-Structured | FR Traceability |
|---|---|---|---|---|---|---|
| Epic 1 | ✓ (dev team) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Epic 2 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Epic 3 | ✓ | ✓ | ✓ | ⚠️ soft (3.3→3.4) | ✓ | ✓ |
| Epic 4 | ✓ | ✓ | ⚠️ 4.6 large | ✓ | ✓ | ✓ |
| Epic 5 | ✓ | ✓ | ⚠️ 5.4 mixed | ✓ | ✓ | ✓ |
| Epic 6 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Overall Epic Quality: HIGH.** All stories use proper BDD Given/When/Then format with specific, testable acceptance criteria. Error conditions are consistently covered. Role gating is explicit in every relevant story. The two schema conflicts (EQ-1, EQ-2) are the most important issues to resolve before implementation begins.

---

## Summary and Recommendations

### Overall Readiness Status

## 🟢 READY — All critical and high-priority issues resolved. Implementation can begin on all epics.

The ManlyCam planning artifacts are **comprehensive and of high quality**. The PRD is thorough and well-structured, the UX specification is detailed and component-specific, the epics are logically sequenced with proper BDD acceptance criteria, and all 55 FRs are traceable to stories. No planning artifact is missing.

All 3 critical implementation conflicts and all 5 high-priority scope/clarity issues identified in the original assessment have been resolved in the planning documents (epics.md, prd.md, ux-design-specification.md). Only low-priority documentation cleanup items remain, none of which block implementation.

---

### Critical Issues — All Resolved

| # | Issue | Resolution Applied |
|---|---|---|
| **C1** | **EQ-2**: `audit_log` schema conflict between Story 1.2 and Story 5.4 | Resolved: Unified on `target_id TEXT` + `metadata JSONB` + `performed_at` in both stories |
| **C2** | **ISSUE-5**: Pi agent config TOML vs YAML conflict; `stunServer` unexplained | Resolved: Standardized to TOML at `/etc/manlycam/config.toml` in Story 6.2; key names reconciled to `[frp]`/`[stream]`/`[update]` sections; `stunServer` removed |
| **C3** | **ISSUE-6**: Session revocation WS message vs close code `4003` conflict | Resolved: Standardized on `{ type: 'session:revoked', payload: { reason: 'banned' } }` WS message across all ban paths (Story 5.3 updated) |

---

### High Priority — All Resolved

| # | Issue | Resolution Applied |
|---|---|---|
| **H1** | **ISSUE-3 + EQ-3**: Audit Log UI post-MVP per PRD but in Story 5.4; Story 5.4 mixed concerns | Resolved: Story 5.4 scoped to non-privileged UI gating only; audit log UI moved to Post-MVP Story PM-1 |
| **H2** | **ISSUE-2**: PRD NFR5 said "JWT" but stories use DB-backed session cookie | Resolved: PRD NFR5 updated to "DB-backed session cookie (`httpOnly SameSite=Strict Secure`)" |
| **H3** | **UX-4**: UX spec referenced React context and `react-resizable-panels` in Vue 3 project | Resolved: UX spec updated to Vue `provide/inject`; `react-resizable-panels` reference removed |
| **H4** | **UX-5**: Resizable sidebars in UX spec but no story or ACs | Resolved: Drag-resize explicitly marked post-MVP in UX spec; Story PM-2 added to epics post-MVP section |
| **H5** | **ISSUE-1 / FR44**: Allowlist removal stories said no session effect; FR44 required immediate effect | Resolved: FR44 updated in both PRD and epics — allowlist controls registration only; ban revokes sessions immediately |

---

### Low Priority — Documentation Cleanup (No Implementation Blocker)

| # | Issue | Action |
|---|---|---|
| L1 | **ISSUE-4**: CLI naming inconsistent — `manlycam`, `manlycam-admin`, `npm run cli` | Standardize to one pattern before writing operator docs |
| L2 | **UX-1**: PRD says "no formal WCAG target"; UX + epics say WCAG 2.1 AA | Update PRD to reflect adopted WCAG 2.1 AA target |
| L3 | **UX-2**: UX testing matrix includes iOS Safari; PRD says out of scope | Align: remove from UX testing or soften PRD language |
| L4 | **UX-6**: Mobile admin persistent cog not captured in Story 3.6 ACs | Add acceptance criterion to Story 3.6 for mobile admin trigger |
| L5 | **UX-7**: `CUSTOM_FOOTER` env var in UX spec not in architecture or `.env.example` | Replace with `SITE_NAME` or add to Story 1.1 env var list |
| L6 | **EQ-4**: Story 3.3 real-time state ACs require Story 3.4's WebSocket | Note in Story 3.3 that real-time ACs are validated after Story 3.4 merges |
| L7 | **EQ-1**: All DB tables created upfront in Story 1.2 | Acceptable for Prisma schema-first — document as intentional architectural decision |

---

### Recommended Next Steps

1. **Begin Epic 1:** No blockers. Initialize monorepo, Prisma schema (using the unified `audit_log` schema), CI/CD, and deployment configs.

2. **Begin Epic 2:** No blockers. Authentication, allowlist enforcement (registration-only semantics confirmed), session cookie auth, and CLI allowlist/ban management.

3. **Address low-priority items as-needed:** L1 (CLI naming) is the most practically impactful before operator docs are written. L2–L7 are cosmetic cleanup and can be done any time.

---

### Final Note

This assessment originally identified **19 issues** (3 critical, 5 high priority, 7 low priority, 4 informational). All critical and high-priority issues were resolved by updating the planning documents before implementation began. The planning artifacts are now internally consistent and implementation-ready across all 6 epics.

**Report updated 2026-03-06** to reflect post-assessment resolutions.

---

*Assessment completed: 2026-03-06 | Updated: 2026-03-06 | Assessor: Claude (BMAD PM + SM agent) | Project: ManlyCam*

