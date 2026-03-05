---
stepsCompleted: ["step-01-document-discovery", "step-02-prd-analysis", "step-03-epic-coverage-validation", "step-04-ux-alignment", "step-05-epic-quality-review", "step-06-final-assessment"]
documentsUsed:
  prd: "prd.md"
  architecture: "architecture.md"
  epics: "epics.md"
  ux: "ux-design-specification.md"
---

# Implementation Readiness Assessment Report

**Date:** 2026-03-05
**Project:** ManlyCam

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

- FR16: Authenticated users can send text messages in a chat sidebar alongside the stream; all chat activity is delivered in real-time via WebSocket
- FR17: Chat messages support basic markdown formatting
- FR18: The chat sidebar displays the sender's avatar and display name with each message
- FR19: The chat sidebar loads the last 200 messages on page load
- FR20: The chat sidebar is collapsed by default on smaller screens and expanded by default on larger screens
- FR21: Users receive an unread message count indicator on the collapsed chat sidebar while the stream is open
- FR22: Users can expand and collapse the chat sidebar at will
- FR23: Users can edit or delete their own chat messages via a message context menu; edits are recorded as revision history with "edited" indicator and timestamp tooltip; deletions are soft-deletes
- FR24: All authenticated users can view the list of currently connected viewers
- FR25: The chat sidebar supports infinite scroll — scrolling upward loads older messages progressively with day-boundary delineators

**Moderation**

- FR26: Moderator and Admin users can delete any user's chat message via a message context menu (soft-delete with revision history)
- FR27: Moderator and Admin users can mute a user; muted users retain stream access but cannot send chat messages or reactions
- FR28: Moderator and Admin users can ban a user; banned users have access revoked and active sessions terminated immediately
- FR29: Moderator and Admin users can unmute a previously muted user
- FR30: All moderation actions (message delete, mute, unmute, ban) are recorded in an audit log
- FR31: Non-privileged users see no elevated options on other users' profiles or messages they do not own

**Role & User Management**

- FR32: The system enforces a four-tier role hierarchy: Admin, Moderator, Viewer (Company), Viewer (Guest)
- FR33: All users are assigned their base viewer tier automatically on first authenticated login based on allowlist match
- FR34: Admin role can only be assigned via CLI
- FR35: Admin users can promote or demote any previously authenticated user to/from Moderator role via web UI
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
- FR48: The Pi agent reads sensitive configuration from a separate config file not bundled in the binary or CI artifacts
- FR49: Administrators can update the Pi agent via `update-manlycam`, comparing installed version against the latest GitHub release, downloading artifact if newer, and restarting the service
- FR50: The Pi agent includes an install script and README covering the full bootstrap flow
- FR51: The Pi agent activates a captive portal for WiFi configuration when it cannot connect to a known network

**Platform & Developer Operations**

- FR52: The web application is a single-page application; all features accessible within a single page surface
- FR53: The upstream server detects Pi tunnel disconnection and reflects the appropriate stream state to all connected viewers without crashing or data loss
- FR54: GitHub Actions produces cross-compiled ARM binaries for the Pi agent with automatic semver versioning and GitHub Releases; CI artifacts contain no PII or sensitive configuration
- FR55: The application is configurable with an instance-specific pet name and site name, set at upstream server deploy time; no hardcoded references exist in the codebase

**Total FRs: 55**

---

### Non-Functional Requirements

**Performance**

- NFR1: Stream latency minimized to the extent permitted by hardware, camera pipeline, frp tunnel, and network; no artificial buffering introduced at any layer
- NFR2: Upstream server introduces no unnecessary encoding or relay delay; stream proxied to viewers as efficiently as infrastructure permits
- NFR3: Chat messages delivered to all connected clients via WebSocket following best practices for connection management, reconnection, and message ordering; delivery bounded only by network conditions

**Security**

- NFR4: All traffic between clients, upstream server, and Pi is transmitted over encrypted connections (TLS)
- NFR5: Google OAuth validated once at login; server issues JWT for subsequent request authentication; user profile data upserted on each login; clients not instructed to re-validate OAuth tokens mid-session
- NFR6: Allowlist and role checks enforced server-side; access cannot be bypassed by client manipulation
- NFR7: Session revocation (ban, allowlist removal) takes effect immediately via WebSocket signal to affected client
- NFR8: Pi agent binary published via CI contains no credentials, server addresses, or PII; sensitive config stored in separate on-device config file with restricted filesystem permissions
- NFR9: Audit log entries for moderation actions are append-only and cannot be modified or deleted by any web UI action

**Reliability**

- NFR10: Pi frp agent managed by systemd with automatic restart-on-failure; transient crashes must not require manual intervention
- NFR11: Upstream server handles Pi tunnel disconnection gracefully — viewer WebSocket connections remain open and reflect updated stream state without server error or crash
- NFR12: Upstream server handles concurrent viewer connections up to 10–20 without stream degradation; additional capacity addressed by scaling upstream server, not the Pi
- NFR13: A degraded-but-live stream is always preferable to a clean failure; no component should terminate a live stream silently

**Data**

- NFR14: Chat messages and audit log records retained indefinitely; no automated expiry or deletion policy applied
- NFR15: Chat message edits stored as revision history; soft-deleted messages retain server-side record; no user-initiated action results in permanent data loss
- NFR16: Bulk data management is an administrative database operation performed outside the application UI

**Total NFRs: 16**

---

### Additional Requirements & Constraints

- **Scope:** Post-MVP features explicitly deferred: web UI individual email allowlist management, web UI blacklist/unban, audit log viewer, message reactions, frp SSH tunnel, one-time expiring guest links, stream reactions/emoji overlays, background audio, treat dispenser, full web admin UI
- **Browser scope:** Chrome, Firefox, Edge (current + 1 prior major); Safari/iOS explicitly out of scope
- **Mobile-first:** Admin must be able to manage stream state from Firefox on Android (primary mobile use case)
- **Dark mode:** Required
- **AI-assisted development model:** BMAD method; codebase conventions must optimize for AI-generation clarity (well-separated concerns, explicit module boundaries, consistent patterns)
- **Hardware constraint:** Pi Zero W 2 is fixed; no swap or upgrade possible mid-project
- **Uptime philosophy:** Reliability-first; degraded-but-live is always preferable to clean failure

### PRD Completeness Assessment

The PRD is thorough, well-structured, and production-quality. Requirements are numbered, categorized, and traceable to user journeys. The four-state stream model is explicitly defined. Role boundaries are unambiguous. The MVP/post-MVP scoping is clearly delineated, which will be critical for validating epic coverage. No significant gaps or ambiguities detected in the requirements themselves.

---

## Epic Coverage Validation

### Coverage Matrix

| FR | PRD Requirement (Summary) | Epic Coverage | Status |
|---|---|---|---|
| FR1 | Unauthenticated landing page | Epic 2 | ✓ Covered |
| FR2 | Google OAuth sign-in | Epic 2 | ✓ Covered |
| FR3 | Domain allowlist enforcement | Epic 2 | ✓ Covered |
| FR4 | Individual email allowlist enforcement | Epic 2 | ✓ Covered |
| FR5 | Rejection state post-OAuth (no ghost accounts) | Epic 2 | ✓ Covered |
| FR6 | No persistent records for rejected users | Epic 2 | ✓ Covered |
| FR7 | Persistent sessions across visits | Epic 2 | ✓ Covered |
| FR8 | Avatar from OAuth / Gravatar fallback | Epic 2 | ✓ Covered |
| FR9 | Authenticated user live stream access | Epic 3 | ✓ Covered |
| FR10 | 4-state stream UI | Epic 3 | ✓ Covered |
| FR11 | Admin stream start/stop from web UI | Epic 3 | ✓ Covered |
| FR12 | "Check back soon" state (Pi unreachable + toggle live) | Epic 3 | ✓ Covered |
| FR13 | Real-time state broadcast on admin toggle | Epic 3 | ✓ Covered |
| FR14 | Camera settings with real-time v4l2-ctl effect | Epic 3 | ✓ Covered |
| FR15 | Collapsible camera settings sidebar (admin only) | Epic 3 | ✓ Covered |
| FR16 | Real-time chat via WebSocket | Epic 4 | ✓ Covered |
| FR17 | Markdown formatting in messages | Epic 4 | ✓ Covered |
| FR18 | Avatar + display name per message | Epic 4 | ✓ Covered |
| FR19 | Load last 200 messages on page load | Epic 4 | ✓ Covered |
| FR20 | Auto-collapse small / auto-expand large screen | Epic 4 | ✓ Covered |
| FR21 | Unread message count badge | Epic 4 | ✓ Covered |
| FR22 | Manual expand/collapse chat sidebar | Epic 4 | ✓ Covered |
| FR23 | Edit/delete own messages; revision history; soft-delete | Epic 4 | ✓ Covered |
| FR24 | Viewer presence list | Epic 4 | ✓ Covered |
| FR25 | Infinite scroll with day-boundary delineators | Epic 4 | ✓ Covered |
| FR26 | Mod/Admin delete any message (soft-delete) | Epic 5 | ✓ Covered |
| FR27 | Mute user (chat-silenced, stream retained) | Epic 5 | ✓ Covered |
| FR28 | Ban user (access revoked + session terminated) | Epic 5 | ✓ Covered |
| FR29 | Unmute user | Epic 5 | ✓ Covered |
| FR30 | Audit log for all moderation actions | Epic 5 | ✓ Covered |
| FR31 | Non-privileged users see no elevated options | Epic 5 | ✓ Covered |
| FR32 | Four-tier role hierarchy | Epic 5 | ✓ Covered |
| FR33 | Auto-assign base viewer tier on first login | Epic 5 | ✓ Covered |
| FR34 | Admin role CLI-only assignment | Epic 5 | ✓ Covered |
| FR35 | Admin promote/demote Moderator via web UI | Epic 5 | ✓ Covered |
| FR36 | Admin promote/demote any role via CLI | Epic 5 | ✓ Covered |
| FR37 | Admin view all users with timestamps | Epic 5 | ✓ Covered |
| FR38 | Server-computed UserTag on all profiles | Epic 5 | ✓ Covered |
| FR39 | Admin set custom UserTag text | Epic 5 | ✓ Covered |
| FR40 | Admin set custom UserTag color | Epic 5 | ✓ Covered |
| FR41 | CLI add/remove domain allowlist entries | Epic 2 | ✓ Covered |
| FR42 | CLI add/remove individual email allowlist entries | Epic 2 | ✓ Covered |
| FR43 | CLI ban/unban user accounts | Epic 2 | ✓ Covered |
| FR44 | Immediate session enforcement on allowlist/blocklist change | Epic 2 | ✓ Covered |
| FR45 | Pi agent frp stream proxy tunnel on boot | Epic 3 | ✓ Covered |
| FR46 | Pi agent frp API proxy tunnel on boot | Epic 3 | ✓ Covered |
| FR47 | Pi agent systemd restart-on-failure | Epic 3 | ✓ Covered |
| FR48 | Pi agent config file separated from binary | Epic 3 | ✓ Covered |
| FR49 | `update-manlycam` self-update mechanism | Epic 6 | ✓ Covered |
| FR50 | Install script + README bootstrap flow | Epic 6 | ✓ Covered |
| FR51 | Captive portal for WiFi config | Epic 6 | ✓ Covered |
| FR52 | Single-page application constraint | Epic 3 | ✓ Covered |
| FR53 | Graceful Pi tunnel-drop handling | Epic 3 | ✓ Covered |
| FR54 | GitHub Actions CI/CD: cross-compiled ARM binary, semver releases | Epic 1 | ✓ Covered |
| FR55 | Deploy-time pet name / site name config (no hardcoding) | Epic 1 | ✓ Covered |

### Missing Requirements

None. All 55 FRs are accounted for in the epics coverage map.

### Coverage Statistics

- Total PRD FRs: **55**
- FRs covered in epics: **55**
- Coverage percentage: **100%**

### Epic-to-FR Distribution

| Epic | Title | FRs Covered |
|---|---|---|
| Epic 1 | Monorepo Foundation & CI/CD | FR54, FR55 (2 FRs) |
| Epic 2 | Authentication & Access Control | FR1–FR8, FR41–FR44 (12 FRs) |
| Epic 3 | Live Video Stream | FR9–FR15, FR45–FR48, FR52, FR53 (13 FRs) |
| Epic 4 | Real-Time Chat & Presence | FR16–FR25 (10 FRs) |
| Epic 5 | Moderation, Roles & User Management | FR26–FR40 (15 FRs) |
| Epic 6 | Pi Agent Operational Tooling | FR49–FR51 (3 FRs) |

---

## UX Alignment Assessment

### UX Document Status

✅ **Found:** `ux-design-specification.md` (48K, 898 lines, status: complete, 14 steps completed)

The UX Design Specification was used as a direct input document when authoring the Architecture (`architecture.md` frontmatter confirms this). Alignment is deep and structural, not superficial.

---

### UX ↔ PRD Alignment

| Area | UX Spec | PRD | Alignment |
|---|---|---|---|
| Four stream states | ✅ Fully specified with state diagram and copy for each state | ✅ FR10, FR12 | ✓ Aligned |
| Auth flow (one-click OAuth, rejection state) | ✅ Journey 1 fully mapped with Mermaid flowchart | ✅ FR1–FR6 | ✓ Aligned |
| Persistent sessions | ✅ "Return visitors land directly on the stream" | ✅ FR7 | ✓ Aligned |
| Chat sidebar auto-collapse/expand | ✅ Desktop auto-expand, mobile auto-collapse; manual toggle | ✅ FR20, FR22 | ✓ Aligned |
| Unread message badge | ✅ `<SidebarCollapseButton>` with `unreadCount` prop, persists through non-hover state | ✅ FR21 | ✓ Aligned |
| Infinite scroll / history | ✅ Keyset pagination referenced in architecture; day-boundary delineators | ✅ FR25 | ✓ Aligned |
| Admin stream toggle | ✅ Journey 3 (Caleb admin session) — references "CLI: stop stream command" | ✅ FR11 | ⚠️ See note below |
| Camera settings sidebar | ✅ Left sidebar, collapsible, via hover-reveal profile popover | ✅ FR14, FR15 | ✓ Aligned |
| Viewer presence list | ✅ `Tabs` component — "Chat / Viewers" tab strip in right sidebar | ✅ FR24 | ✓ Aligned |
| Dark mode | ✅ Full CSS variable color system; `prefers-color-scheme` respected; dark default | ✅ PRD platform req | ✓ Aligned |
| Mobile-first | ✅ Portrait stream + bottom chat bar; admin cog always visible on mobile | ✅ PRD platform req | ✓ Aligned |
| Typing indicators | ✅ `<TypingIndicator>` component, 400ms debounce, multi-user text | ❌ Not an explicit FR | ⚠️ See note below |
| WCAG accessibility | ✅ WCAG 2.1 AA minimum; AAA for stream status elements | ⚡ PRD says "best-effort; no formal WCAG target" | ⚠️ See note below |

---

### UX ↔ Architecture Alignment

| Area | UX Spec | Architecture | Alignment |
|---|---|---|---|
| Component system | ShadCN UI (Radix UI primitives + Tailwind + CSS variables) | shadcn-vue (Radix Vue + Tailwind v3 + CSS variables) — Vue equivalent | ✓ Aligned |
| Resizable panels | Twitch-style resizable sidebar gutter; "Radix UI react-resizable-panels (or equivalent)" | `splitpanes` via shadcn-vue `Resizable` | ✓ Aligned (UX spec's "(or equivalent)" accommodates Vue-native solution) |
| Tailwind version | Tailwind v3 (ShadCN note) | Tailwind v3 pinned explicitly; v4 deferred | ✓ Aligned |
| Typing indicator WS | Described as social signal | `typing:start` + `typing:stop` WS message types; 400ms debounce in architecture | ✓ Aligned |
| WebSocket connection | Single persistent connection per session | `GET /ws` single connection; `useStream` composable with `@vueuse/core` `useWebSocket` | ✓ Aligned |
| HLS stream playback | Auto-play, no play button | `hls.js` client; native HLS fallback | ✓ Aligned |
| State transitions | Mermaid state diagram (Connecting/Live/TemporaryDowntime/ExplicitOffline) | 4-state machine in stream relay; `stream:state` WS message type | ✓ Aligned |
| Session revocation UX | Session:revoked → client redirects to `/banned` or `/rejected` | `session:revoked { reason: 'banned' \| 'removed' }` WS message; router pushes to `/banned` | ✓ Aligned |
| Color system | Full CSS custom property palette; warm dark base | Same CSS variable contract; `.dark` class swap in architecture | ✓ Aligned |
| Font | Inter (ShadCN/system default) | ShadCN default — implicit match | ✓ Aligned |
| No persistent topbar | Stream edge-to-edge, hover-reveal overlay only | Listed in epics additional requirements | ✓ Aligned |

---

### Alignment Issues

**⚠️ Issue 1: Target Users table — camera settings scope (Documentation inconsistency)**

The UX spec's "Target Users" table (top of document) states:
> "Privileged User (e.g. sister) — camera settings via UI with elevated permissions"

However, the PRD role hierarchy and FR14/FR15 explicitly restrict camera settings to **Admin only**. The detailed UX design sections (Journey 3, hover overlay description, profile popover menu) consistently and correctly show camera settings as Admin-only. This is a documentation artifact in the summary table only — **not a functional design gap**. The detailed implementation guidance is unambiguous.

**Severity:** Low — documentation inconsistency only; all actionable design detail is correct.

**⚠️ Issue 2: Admin stream toggle — UX spec references CLI only**

The UX spec's Journey 3 flowchart shows: "Caleb stops stream via CLI" → "All viewers see 'Manly needs his Zzzs'". The PRD (FR11) explicitly requires Admin to stop/start stream from the **web UI**. The admin stream toggle is a first-class web UI feature (FR11) that the UX spec's journey flow doesn't model in the cursor path — it depicts CLI as the stop mechanism.

The UX spec's chosen desktop direction table mentions a `stream start/stop toggle` for admin (referenced in the "Left sidebar" / admin controls scope), but the admin journey flowchart omits the web UI path for stream control.

**Severity:** Low — the stream toggle element does appear referenced in the design, but its UX journey needs implementation team clarification. The epics correctly include CLI + web UI toggle as co-equal paths per FR11.

**⚠️ Issue 3: Typing indicator — not an explicit FR**

The typing indicator (`<TypingIndicator />` component) is fully specified in UX and architected in the WS message schema (`typing:start`, `typing:stop`) but does not appear as an explicit Functional Requirement in the PRD. This feature will need to be covered in individual epic story acceptance criteria rather than traced from a named FR.

**Severity:** Low — the feature is well-specified and architecturally fully planned; it won't be forgotten. But the formal traceability gap (no FR → no epic FR reference) means it relies on story-level coverage.

**⚠️ Issue 4: UX spec references "React context" terminology**

The UX spec's Component Strategy section states:
> "Compound component pattern for `<StreamPlayer>` — owns stream state, passes context to child overlays via **React context**"

The architecture correctly uses Vue 3 `provide()`/`inject()` for this pattern. This is a copy artifact (UX spec uses React-ecosystem language in what should be implementation-agnostic UX documentation). **No functional impact** — the architecture resolves it correctly.

**Severity:** Very low — documentation artifact only.

---

### Warnings

⚡ **Accessibility standard elevation:** The UX spec specifies WCAG 2.1 AA compliance (AAA for stream status elements), while the PRD scopes accessibility as "best-effort semantic HTML; no formal WCAG target." The UX spec sets a higher bar that will require focused attention during implementation. This is a positive and recommended elevation, but developers should be aware the formal acceptance standard has been upgraded beyond what the PRD requires.

---

### Summary

Overall UX↔PRD and UX↔Architecture alignment is **excellent**. The architecture document was authored using the UX specification as a direct input, resulting in deep structural alignment. No critical gaps exist. Four minor documentation inconsistencies are noted but none block implementation.

---

## Epic Quality Review

### Best Practices Compliance — Summary

| Epic | User Value | Independence | Stories Sized | No Forward Deps | DB Creation Appropriate | Clear ACs | FR Traced |
|---|---|---|---|---|---|---|---|
| Epic 1 | ⚠️ Technical/Dev | ✓ | ✓ | ✓ | ❌ All tables upfront | ✓ | ✓ |
| Epic 2 | ✓ | ✓ (needs Epic 1) | ✓ | ✓ | n/a | ✓ | ✓ |
| Epic 3 | ✓ | ✓ (needs E1+E2) | ✓ | ✓ | n/a | ✓ | ✓ |
| Epic 4 | ✓ | ✓ (needs E1+E2+E3) | ✓ | ✓ | n/a | ✓ | ✓ |
| Epic 5 | ✓ | ✓ (needs E1–E4) | ✓ | ✓ | n/a | ✓ | ✓ |
| Epic 6 | ✓ | ✓ (needs Epic 1) | ✓ | ✓ | n/a | ✓ | ✓ |

---

### 🔴 Critical Violations

None.

---

### 🟠 Major Issues

#### Issue M1: Story 5.4 — Audit Log Viewer UI Included in MVP Scope (PRD Scope Violation)

**Location:** Epic 5, Story 5.4 — "Audit Log Access and Non-Privileged UI Gating"

**Violation:** The PRD explicitly defers the audit log viewer to post-MVP:
> *"Post-MVP Features (Phase 2 — Growth): Audit log viewer (admin-only SPA page)"*

However, Story 5.4 includes `GET /api/admin/audit-log` (read API) and `<AuditLogTable>` (a full viewer component rendered in the Admin Panel) as MVP acceptance criteria. This directly contradicts the PRD's scoping decision.

The story conflates two independent concerns:
1. **Non-privileged UI gating** (FR31 — MVP: non-privileged users see no elevated options) ✓ correctly MVP
2. **Audit log reading API + viewer UI** (PRD explicitly deferred) ❌ scope creep

The audit log write/storage (FR30, NFR9) is correctly MVP. The read API and viewer UI are not.

**Recommendation:** Split Story 5.4 into:
- **Story 5.4 (revised):** "Non-Privileged UI Gating" — retains only the AC about non-privileged users seeing no elevated options (FR31)
- **Story 5.x (deferred):** "Audit Log Viewer" — move to a post-MVP epic or explicitly tag as beyond MVP scope in the story

**Severity:** Major — this will cause implementation to build out-of-scope UI in MVP, potentially introducing unnecessary complexity.

---

### 🟡 Minor Concerns

#### Issue m1: Epic 1 Stories are Developer-Facing, Not User-Facing (Technical Milestone Flag)

**Location:** Epic 1 overall; Stories 1.2, 1.3, 1.4 specifically

**Concern:** The BMAD best practices caution against "technical epics with no user value." Epic 1 ("Monorepo Foundation & CI/CD") is entirely developer-facing — no viewer, admin, or operator can benefit from it directly. Stories 1.2 (Define Prisma Schema), 1.3 (CI/CD Pipelines), and 1.4 (Deployment Configs) deliver only developer/operator value.

**Mitigating factors:**
- The Architecture explicitly marks monorepo initialization as "Epic 1, Story 1 — all other implementation depends on it"
- The step instructions themselves acknowledge greenfield projects need "Initial project setup story" and "CI/CD pipeline setup early"
- This pattern is standard in BMAD greenfield workflows
- Without Epic 1, no other epic can be started

**Recommendation:** No structural change required — this is acceptable for greenfield foundation. Consider adding user-value framing to each story title if workflow standards require it (e.g., "Provide developers a deployable build pipeline" rather than "Set Up GitHub Actions"). **Low priority.**

#### Issue m2: Story 1.2 — All Database Tables Created Upfront (Best Practice Deviation)

**Location:** Epic 1, Story 1.2 — "Configure Prisma Schema with All Data Models and Initial Migration"

**Concern:** This story creates ALL tables (users, sessions, allowlist_entries, messages, audit_log) in the initial `init` migration — including tables not needed until Epics 4 and 5. The standard says: "Each story creates tables it needs; check: are tables created only when first needed?"

**Mitigating factors:**
- Prisma's schema and migration model is a unified graph — `messages.user_id` references `users.id`, `sessions.user_id` references `users.id`, `audit_log.actor_id` references `users.id`. Creating tables piecemeal would require additive migrations and would complicate foreign key constraints significantly.
- This is a Prisma framework convention, not a technical debt choice.
- All subsequent stories reference already-existing tables with no confusion.

**Recommendation:** Accept as a Prisma-specific architectural pattern. Document in the story's notes that this is intentional to satisfy FK relationships across the full schema. **No structural change needed.**

#### Issue m3: Story 5.3 — Misleading Statement About Unban

**Location:** Epic 5, Story 5.3 — "Ban with Immediate Session Revocation"

**Concern:** The final note states: *"there is no unban endpoint at MVP — restoring access requires direct database intervention or a CLI command."*

This statement is correct in intent (no **web UI** for unban at MVP) but technically imprecise: CLI unban IS MVP and IS properly spec'd in Story 2.5 (`manlycam-admin users unban user@company.com`). The phrase "or a CLI command" is an afterthought when it should be the primary path. Additionally, saying "direct database intervention" normalizes a dangerous practice.

**Recommendation:** Update the note in Story 5.3 to: *"Unban is available via CLI (`manlycam-admin users unban`) per Story 2.5. Web UI unban is post-MVP scope."* **Documentation fix during story refinement.**

#### Issue m4: Story 4.6 (Typing Indicator) Has No Corresponding FR

**Location:** Epic 4, Story 4.6 — "Viewer Presence List and Typing Indicator"

**Concern:** The typing indicator (`<TypingIndicator>`, `typing:start`/`typing:stop` WS messages) is fully spec'd in the UX spec and Architecture, and is covered in Story 4.6 — but has **no corresponding FR** in the PRD. The typing indicator does not appear in FR16–FR25 (Chat requirements). This means the feature has no formal requirements traceability.

**Mitigating factors:**
- The feature is well-designed and architecturally sound
- It appears in the UX spec, Architecture WS type list, and epics — so it will not be forgotten
- No implementation confusion will result

**Recommendation:** Either add an implicit FR reference in Story 4.6 (e.g., "Derived from UX Spec §TypingIndicator + Architecture §WS Message Envelope") or acknowledge it as a UX-spec-driven feature. **Minor documentation gap only.**

---

### Epic Independence Verification

| Check | Result |
|---|---|
| Epic 2 functions on Epic 1 alone? | ✓ Yes — scaffold + auth. No stream or chat needed. |
| Epic 3 functions on Epic 1+2 alone? | ✓ Yes — auth sessions required; stream operates independently of chat. |
| Epic 4 functions on Epic 1+2+3 alone? | ✓ Yes — WebSocket hub exists from Epic 3; chat adds messages over it. |
| Epic 5 functions on Epic 1+2+3+4 alone? | ✓ Yes — moderation context menus build on existing chat + presence UI. |
| Epic 6 functions on Epic 1 alone? | ✓ Yes — Pi agent tooling is independent of server/web epics (though frp tunnel connects to server from Epic 3 in production). |
| Any forward dependencies (Epic N needs N+1)? | ✓ None found |

### Story Sizing Assessment

All 24 stories are appropriately sized — each represents 1–3 days of focused implementation work. No story attempts to deliver an entire epic's worth of functionality in one shot. No story is trivially small (1-liner changes).

### Acceptance Criteria Quality

| Metric | Assessment |
|---|---|
| Given/When/Then format | ✓ Consistently applied across all 24 stories |
| Testable outcomes | ✓ All ACs produce verifiable system behavior |
| Happy path coverage | ✓ Fully covered in all stories |
| Error/unhappy path coverage | ✓ Most stories include 403/401 error ACs; authorization failures explicit |
| Non-measurable/vague ACs | ✓ None found — all ACs specify exact behaviors |
| Security-relevant ACs explicitly stated | ✓ Role checks explicit in all moderation/admin stories |

### Starter Template Compliance

- ✅ Architecture specifies starter templates for all three components
- ✅ Story 1.1 correctly implements "Set up initial project from starter template" as the first story
- ✅ Greenfield project indicators all present: initial setup, dev environment configuration, CI/CD early in sequence

---

## Summary and Recommendations

### Overall Readiness Status

## ✅ READY (with one story fix before implementing the audit log viewer)

ManlyCam's planning artifacts are implementation-ready. The PRD, Architecture, UX Design Specification, and Epics are cohesive, comprehensive, and well-aligned. Only one issue exceeds MVP scope in the stories; it is a targeted fix, not a re-plan. All other findings are documentation clean-up items that do not block implementation.

---

### Issues Inventory

| # | Severity | Location | Issue | Action Required Before Building? |
|---|---|---|---|---|
| M1 | 🟠 Major | Epic 5, Story 5.4 | Audit log viewer UI (API + `<AuditLogTable>`) included in MVP scope; PRD explicitly defers to post-MVP | ✅ Fix before implementing Story 5.4 |
| m1 | 🟡 Minor | Epic 1 overall | Technical milestone framing (no direct user value) | ❌ Acceptable for greenfield foundation; no change needed |
| m2 | 🟡 Minor | Epic 1, Story 1.2 | All DB tables created in single initial migration; best practice says create when first needed | ❌ Prisma framework pattern; no change needed |
| m3 | 🟡 Minor | Epic 5, Story 5.3 | Misleading statement about unban at MVP ("no endpoint" — CLI unban IS MVP via Story 2.5) | ❌ Fix during story refinement; wording only |
| m4 | 🟡 Minor | Epic 4, Story 4.6 | Typing indicator has no corresponding FR in PRD; traceability gap | ❌ Documentation note only; no implementation impact |
| UX1 | 🟡 Minor | UX Spec Target Users table | Moderator described as having camera settings access; PRD and detailed UX correctly say Admin-only | ❌ Documentation artifact; all implementation guidance correct |
| UX2 | 🟡 Minor | UX Spec Journey 3 | Admin stream toggle UX journey only shows CLI path; web UI toggle not illustrated in journey flow | ❌ Existing story ACs (Story 3.5) cover web UI toggle correctly |
| UX3 | 🟡 Minor | UX Spec Component Strategy | Uses "React context" terminology; architecture correctly resolves to Vue `provide()`/`inject()` | ❌ Copy artifact; no implementation impact |
| UX4 | ⚡ Note | UX Spec Accessibility | WCAG 2.1 AA standard (higher than PRD's "best-effort") | n/a — positive elevation; teams should be aware |

**Total: 1 major · 4 minor · 4 documentation artifacts**

---

### Critical Issues Requiring Immediate Action

#### 1. Fix Story 5.4 Before Implementing the Audit Log Viewer

**What to do:** Before a developer picks up Story 5.4, split it:

**Story 5.4 (keep as MVP):** "Non-Privileged UI Gating"
- Retain only these ACs: non-privileged users (ViewerCompany/ViewerGuest) see no Mute/Ban/Delete options in context menus; server is the authoritative gate; UI hides elevated affordances

**Story 5.x (move to post-MVP):** "Admin Audit Log Viewer"
- `GET /api/admin/audit-log` read endpoint
- `<AuditLogTable>` component
- Keyset-paginated audit log view in Admin Panel
- Move to Phase 2 (Growth) epic alongside other post-MVP deferred features

Note: FR30 (audit log storage) and NFR9 (append-only) remain MVP and are already being satisfied by the audit write logic in Stories 5.1–5.3.

---

### Recommended Next Steps

1. **Fix Story 5.4** as described above — split it before the first sprint kicks off. (~15 minute task)
2. **Clarify Story 5.3 unban wording** — update the final "And" note to reference Story 2.5 CLI path explicitly. (~5 minute task)
3. **Add typing indicator FR reference** to Story 4.6 — note it's "derived from UX Spec §TypingIndicator + Architecture §WS Message Envelope" to preserve traceability. (~5 minute task)
4. **Begin implementation at Epic 1, Story 1.1** — all planning is solid; the Epic 1 foundation is well-specified and the implementation sequence in the Architecture document is a reliable guide.
5. **Note for implementation team:** The architecture's "Decision Impact Analysis" section provides an explicit recommended implementation sequence (10 steps). Refer to it as the Sprint 1 ordering reference.

---

### Strengths of These Artifacts

These planning documents are notably well-executed for a personal project:

- **55 numbered, categorized FRs** fully traceable to epics — 100% coverage
- **Architecture explicitly consumes both PRD and UX Spec** as input documents; no speculative decisions
- **Four-state stream model** is consistently defined across all four documents
- **Specific technology choices** are justified with rationale, not assumed
- **Anti-patterns explicitly documented** in architecture — enforcement guidelines prevent common mistakes
- **Post-MVP scope** is cleanly separated throughout, reducing scope creep risk
- **24 stories** all have proper Given/When/Then ACs — implementation-ready, not aspirational

---

### Final Note

This assessment identified **9 items** across 3 categories (1 major scope issue, 4 minor concerns, 4 documentation artifacts). Only the major item (Story 5.4 audit log viewer) requires attention before implementing that specific story. All other items are documentation improvements that do not block any sprint.

**Implementation can begin at Epic 1, Story 1.1 immediately.**

---

*Assessment completed: 2026-03-05*
*Report generated: `_bmad-output/planning-artifacts/implementation-readiness-report-2026-03-05.md`*
*Assessor: GitHub Copilot (BMAD Check Implementation Readiness Workflow)*





