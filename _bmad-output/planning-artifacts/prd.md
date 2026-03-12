---
stepsCompleted: [step-01-init, step-02-discovery, step-02b-vision, step-02c-executive-summary, step-03-success, step-04-journeys, step-05-domain, step-06-innovation, step-07-project-type, step-08-scoping, step-09-functional, step-10-nonfunctional, step-11-polish]
inputDocuments:
  - _bmad-output/planning-artifacts/product-brief-ManlyCam-2026-03-04.md
workflowType: 'prd'
date: 2026-03-04
author: Caleb
classification:
  projectType: IoT/Embedded + Web App (hybrid)
  domain: General (personal maker / consumer device)
  complexity: low-medium
  projectContext: greenfield
---

# Product Requirements Document - ManlyCam

**Author:** Caleb
**Date:** 2026-03-04
**Project Type:** IoT/Embedded + Web App (hybrid) · General / personal maker · Low–Medium complexity · Greenfield

---

## Executive Summary

ManlyCam is a self-built IoT camera platform centered on Manly — a deaf senior dog and unofficial office mascot at Caleb's construction-camera company. It delivers a browser-based live video stream accessible only to authorized viewers via Google OAuth, allowing remote and in-office coworkers to look in on Manly on demand. The hardware is a Raspberry Pi Zero W 2 with an Arducam module, enclosed in a custom shell styled after the company's own construction camera products. The stream is relayed through an frp (fast reverse proxy) tunnel so the Pi maintains a single upstream connection while the upstream server handles all viewer load. A collapsible chat sidebar provides real-time social engagement alongside the stream. The project is greenfield, maker-driven, and personal.

The primary design constraint is **uptime over perfection** — a degraded but live stream is always preferable to a clean failure. Access is controlled by a domain and email allowlist because the camera physically moves between Caleb's home and the office; unauthorized access to either location is a genuine professional and personal liability, not merely an inconvenience.

### What Makes This Special

ManlyCam was not designed — it emerged. Manly appeared on screen during a meeting, coworkers reacted, and the idea was already validated before a line of code was written. The product formalizes a social ritual that already exists: Caleb talks to his dog (who cannot hear him), and coworkers want to be in that moment too. ManlyCam makes that participation frictionless and repeatable.

The physical enclosure is intentional. Modeling it after one of the company's construction camera products is a self-aware maker joke — a nod to where Caleb works, and a piece of craft that exists as a conversation piece before anyone loads the URL. This distinguishes it from a commodity webcam setup.

No off-the-shelf solution fits the use case: consumer cameras are closed ecosystems with no OAuth integration, no embeddable social layer, and no custom access control. ManlyCam is built on open infrastructure (Raspberry Pi, frp, standard web stack) that can be extended or redeployed as needs evolve.

---

## Success Criteria

### User Success

- **Stream access in under 60 seconds:** From unauthenticated landing page through Google OAuth to live stream, with no support required for any authorized user
- **Stream state is always communicated clearly:** Viewers always know whether the stream is live, intentionally offline, or temporarily unreachable — the UI never leaves them with a silent blank screen
- **"Coming back soon" grace state:** If the admin toggle is set to live but the Pi is unreachable, the stream page displays a friendly "check back soon" message rather than an error
- **Chat participation:** Coworkers engage with the chat sidebar in candid (non-meeting) moments; success is actual usage, not just availability
- **No unauthorized access:** No viewer outside the domain/email allowlist ever reaches the stream or chat

### Business Success

This is a personal maker project with no revenue or growth objectives. Success is operational and relational:

- Manly is reliably viewable by coworkers during working hours when Caleb is present
- Coworkers discover the stream, return to it, and engage in the chat during candid moments
- Caleb can manage access and stream state quickly and without friction, from CLI or (post-MVP) web admin UI
- No incident where unauthorized access occurs to either the home or office environment

### Technical Success

| Metric | Target |
|---|---|
| Stream resolution | 1080p |
| Concurrent viewers | 10–20 without degradation |
| Unplanned stream stops | Zero — Pi-side or upstream |
| Stream state accuracy | UI reflects all states correctly: live, offline, unreachable |
| Auth + access time | ≤ 60 seconds from unauthenticated landing to live stream |
| Chat history on load | Last 200 messages retrieved and displayed |
| Access control integrity | Zero unauthorized viewer access events |

### Measurable Outcomes

- Stream is live and stable whenever Caleb is present with the device during working hours
- All authorized viewers complete OAuth onboarding without support contact
- Concurrent viewer load (10–20 users) does not cause stream degradation on the upstream relay
- Chat messages persist and load correctly on page load; unread indicator functions while stream is open
- Admin can stop/start stream and manage allowlist and blacklist with no downtime to existing sessions

---

## User Journeys

### Journey 1: The Coworker — First Visit (Standard Viewer, New)

**Persona:** Jordan, a product manager at the company. Remote today, three meetings deep, mildly over it.

**Opening Scene:** It's mid-afternoon. Jordan's in a Slack huddle when Caleb says something quietly to an unseen presence off-camera. Someone asks "wait, is that a dog?" Caleb drops the ManlyCam URL in the meeting chat. Jordan opens it in a new tab.

**Rising Action:** An unfamiliar page loads — clean, friendly, a brief note that this is a private stream and a "Sign in with Google" button. Jordan clicks it, the Google OAuth flow opens, they grant access (email + avatar), and they're redirected back.

**Climax:** The stream loads. Manly is just sitting there, calm and oblivious. Jordan laughs. They type something in the chat sidebar — then close it. They bookmark the URL.

**Resolution:** Jordan drops the link in a team Slack channel later that afternoon. Three people click it within the hour. Manly doesn't react to any of them.

**Requirements revealed:** Friendly unauthenticated landing page with context; frictionless Google OAuth; domain allowlist auto-admission; stream loads immediately post-auth; chat available but non-intrusive; bookmarkable URL state.

---

### Journey 2: The Coworker — Return Visit (Standard Viewer, Returning)

**Persona:** Jordan again, two weeks later.

**Opening Scene:** Someone in #general says "Manly is asleep on his back." Jordan opens the bookmark.

**Rising Action:** Already authenticated — the stream loads directly. Manly is indeed asleep on his back. The chat sidebar is collapsed. An unread badge shows 4 messages. Jordan expands it, scrolls through recent messages, adds a comment.

**Climax:** Jordan's on a small laptop today — the auto-collapsed chat was the right call. Type, send, collapse. Stream is full-width.

**Resolution:** Two minutes. In and out. That's the whole interaction.

**Requirements revealed:** Persistent auth session; stream loads without re-auth; unread indicator on collapsed chat; chat history (last 200 messages); auto-collapse logic based on screen size; smooth collapse/expand UX.

---

### Journey 3: Caleb — Admin Setup and Day-to-Day

**Persona:** Caleb. Builder, owner, the one person who can see Manly right now in person.

**Opening Scene — First Setup:** The Pi is deployed and the web app is running. Caleb authenticates via Google OAuth like any other user — he arrives as a standard company viewer. He then opens a terminal and assigns himself the Admin role: `manlycam role assign caleb@company.com admin`. From that point forward, his web session reflects Admin capabilities: stream start/stop toggle, camera settings sidebar, viewer list, and full moderation controls.

**Day-to-day:** Caleb arrives at the office with the Pi, plugs it in, the frp tunnel auto-connects. He checks ManlyCam on his phone — stream is live, picture looks good. He adjusts exposure from the camera settings sidebar, then leaves it running.

**Climax:** At the end of the day, Caleb taps Stop Stream from ManlyCam on his phone. The toggle flips, all viewers see the offline state. He promotes a trusted coworker to Moderator from the web UI user list — they've already authenticated, so they appear in the list.

**Edge case — remote stop:** Already home, stream still running. Opens ManlyCam on phone, taps Stop Stream. Done. No SSH needed.

**Edge case — allowlist management:** A visiting friend needs access. `manlycam allowlist add guest@gmail.com`. Later removed the same way.

**Requirements revealed:** All users begin as their allowlist-derived tier on first login; Admin role granted CLI-only; Admin web capabilities: stream start/stop toggle, camera settings sidebar, full moderation, viewer list, promote/demote authenticated users to/from Moderator; CLI as secondary admin path; frp tunnel auto-connects on boot; stream state UI reflects all states for all viewers.

---

### Journey 4: The Privileged Moderator — Wrangling Without Caleb

**Persona:** A trusted coworker promoted to Moderator by Caleb via web UI or CLI. Caleb is in back-to-back meetings.

**Opening Scene:** Someone in the chat starts sending disruptive messages. A viewer DMs the moderator on Slack.

**Rising Action:** The moderator opens ManlyCam. Their view includes chat moderation controls and the viewer list — but no camera settings sidebar and no stream start/stop toggle. They issue a **mute** — the user can still watch but is silenced in chat.

**Climax:** The person creates a second account and tries again. The moderator **bans** them — access revoked, active session ended immediately.

**Alternatively:** A coworker's contact wants access. The moderator adds their individual email via the web UI (post-MVP). The contact authenticates, gets in.

**Requirements revealed:** Moderator web capabilities: chat message deletion, user mute (chat-silenced, stream access retained), user ban (access revoked + session ended immediately), individual email allowlist add/remove (post-MVP web UI), viewer list. Moderator explicitly excluded from: stream start/stop toggle, camera settings sidebar. Mute and ban are distinct states. Ban takes immediate effect on active sessions.

---

### Journey 5: The External Guest — Edge Case

**Persona:** A friend of Caleb's, not at the company, not on the domain allowlist.

**Opening Scene:** Caleb runs `manlycam allowlist add guest@gmail.com`. Texts them the URL.

**Rising Action:** Guest opens the URL, hits the landing page, signs in with Google. Their Gmail is on the allowlist — admitted. Stream loads.

**Constraint acknowledged:** This flow requires a Google account — an inherent limitation of the OAuth-only auth model at MVP.

**Edge case — rejected user:** Someone gets the URL who isn't allowlisted. They complete OAuth and are redirected back with a clear rejection message. No account created, no stream data exposed.

**Future vision — one-time guest links:** Caleb generates a named, expiring link. Guest clicks it, gets time-limited access with no Google account required. *(Vision scope)*

**Requirements revealed:** Individual email allowlist (personal emails, non-domain); clear rejection state post-OAuth; no ghost accounts for rejected users; guest access revocable immediately. Future: one-time expiring guest links.

---

### Role Hierarchy

| Role | Assignment | Web Capabilities |
|---|---|---|
| **Admin** | CLI only | Stream start/stop, camera settings, full moderation, viewer list, promote/demote authenticated users to/from Moderator |
| **Moderator** | CLI or Admin via web UI (previously authenticated users only) | Chat delete, user mute, user ban, email allowlist add/remove (post-MVP web UI), viewer list |
| **Viewer (Company)** | Domain allowlist | View stream, chat |
| **Viewer (Guest)** | Individual email allowlist | View stream, chat |

**Key rule:** Admin role is CLI-only. Moderator role can be assigned via CLI or promoted/demoted by an Admin through the web UI — but only for users who have already authenticated at least once.

### Journey Requirements Summary

| Journey | Key Capabilities Revealed |
|---|---|
| Coworker first visit | Landing page, OAuth, domain allowlist, stream load, chat sidebar |
| Coworker return visit | Persistent auth, unread badge, chat history (200 msg), screen-size-aware collapse |
| Caleb admin | CLI role assignment, web stream toggle (primary), CLI (secondary), frp auto-connect, camera settings, web promote/demote Moderator |
| Privileged moderator | Chat delete, mute (chat-only), ban (session revoked), email allowlist add (post-MVP web); no stream toggle; no camera settings |
| External guest | Individual email allowlist, OAuth rejection state, no ghost accounts; future: one-time expiring links |

---

## Technical Architecture Requirements

### IoT / Pi Layer

The Raspberry Pi Zero W 2 runs **frpc** and **mediamtx** as two independent systemd services — no custom binary. Its sole responsibility is maintaining frp tunnels to the upstream server and exposing the mediamtx camera pipeline.

**frp Tunnel Architecture (Pi-side):**

| Tunnel | Purpose | MVP |
|---|---|---|
| Stream proxy | Forwards mediamtx RTSP to upstream for WebRTC relay to viewers | ✅ Yes |
| API proxy | Forwards mediamtx HTTP API to upstream server for camera control | ✅ Yes |
| SSH tunnel | Allows remote SSH access to Pi via upstream | ❌ Post-MVP |

**Deployment:**
- The Pi runs frpc and mediamtx as two independent **systemd** services, each with restart-on-failure
- Sensitive configuration (upstream server address, frp auth tokens) stored in `frpc.toml` and `mediamtx.yml` — native config files for each tool, with restricted filesystem permissions
- An install script (`install.sh --endpoint <url>`) handles downloading frpc and mediamtx, generating both config files, and registering the systemd units
- No custom binary is distributed; no CI artifact is published for the Pi

**Power and Shutdown Behavior:**
- Pi may be unplugged without graceful shutdown — this is expected and normal
- "Stopping the stream" is an upstream/server-side operation; the Pi has no awareness of stream state
- When Pi loses power or connectivity, the frp tunnel drops; upstream server detects this and displays the "unreachable" state to viewers
- Upstream must handle tunnel drop gracefully with no crashes or data loss

---

### Web Application Layer

**Application Architecture:**
- Single-page application (SPA) — one route/page for all viewer and admin experiences
- Admin features (user management, role promotion/demotion, allowlist) are in-page panels or modals, not separate routes
- Stream, chat sidebar, and camera settings sidebar coexist on a single page surface

**Browser Support:**
- Modern evergreen browsers only (Chrome, Firefox, Edge — current + 1 prior major version)
- Safari / iOS explicitly out of scope — if it works, fine; if streaming implementation would require Safari-specific workarounds or degrade the experience for other users, deprioritize it entirely
- Caleb's admin mobile use case: Firefox on Android

**Accessibility:**
- Best-effort semantic HTML; no formal WCAG target
- Dark mode required

**Responsive Behavior:**
- Mobile-first considerations for Caleb's admin use case (stream start/stop from phone)
- Chat sidebar: auto-collapsed on smaller screens, auto-expanded where screen real estate allows
- Camera settings sidebar (admin-only): collapsible, non-essential on mobile

---

### Upstream Server Layer

The upstream server is the **primary application host** — it handles all viewer connections, serves the web app, owns the backend API, manages authentication, and controls stream state.

**Responsibilities:**
- Receives Pi stream via frp and relays to multiple viewers (handles concurrent load so Pi sees only 1 outbound connection)
- Serves the SPA
- Implements Google OAuth flow, allowlist enforcement, session management
- Hosts the camera control API (receives commands from privileged web UI → proxies to Pi via frp API tunnel)
- Owns stream state toggle (live/offline); communicates state to all connected viewers
- Stores and serves chat history (persistent, last 200 messages on load)
- Manages user records, roles, allowlist, blocklist
- Configured at deploy time via server-side environment/config: OAuth credentials, database credentials, `site_url`, `pet_name`, `site_name`, and any other instance-specific values; no hardcoded branding or credentials in the codebase

**Stream State Logic:**

| Pi State | Admin Toggle | Viewer Experience |
|---|---|---|
| Connected | Live | Stream plays |
| Connected | Offline | "Stream is offline" message |
| Unreachable | Live | "Check back soon" message |
| Unreachable | Offline | "Stream is offline" message |

---

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Reliability-first. The product is only useful if the stream is live when expected. Every MVP decision is filtered through this lens — features that threaten uptime or add complexity without clear viewer/admin value are deferred.

**Development Model:** AI-assisted (BMAD) with a senior SWE as curator and technical steering. No hard deadline. Codebase conventions should optimize for AI-generation clarity: well-separated concerns, explicit module boundaries, consistent patterns.

**Resource Model:** Single upstream server (horizontally scalable if concurrent viewer load exceeds capacity). Pi is a fixed hardware constraint — it will not be swapped or upgraded mid-project.

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
- Viewer first visit and return visit (stream + chat)
- Caleb admin setup, day-to-day control (web UI stream toggle, camera settings)
- Privileged moderator (chat moderation, ban/mute, allowlist add)
- External guest (individual email allowlist, OAuth rejection)

**Must-Have Capabilities:**

*Pi / IoT Setup:*
- frpc and mediamtx installed as systemd services via `install.sh --endpoint <url>`; both services managed with restart-on-failure
- All sensitive configuration in `frpc.toml` and `mediamtx.yml` — no credentials in any CI artifact
- Install script + operator README: flash Raspberry Pi OS Lite → verify camera with `rpicam-still` → run install script
- WiFi configuration is the operator's responsibility; wifi-connect is one option and is documented (optional)

*Authentication & Access:*
- Google OAuth sign-in (`openid email profile` scopes; gravatar fallback for avatar)
- Domain-level and individual email allowlist enforcement
- Friendly unauthenticated landing page; clear rejection state post-OAuth (no ghost accounts)

*Stream & State:*
- Live video stream relayed via upstream server (Pi sees 1 outbound connection)
- 4-state stream UI: live / intentionally offline / unreachable-but-should-be-live / offline+unreachable

*Chat:*
- Collapsible chat sidebar: auto-collapsed on small screens, auto-expanded on large screens
- Persistent chat history (last 200 messages on page load)
- Unread message badge while stream is open
- Message context menu — own messages: edit / delete; mod view of others' messages: delete
- User profile context menu (mod-only): mute / ban
- All moderation actions audit-logged (audit log storage is MVP; viewer UI is post-MVP)
- Viewer list visible to all authenticated users

*Camera Controls:*
- Camera settings sidebar (admin only): mediamtx `rpiCamera` runtime parameters (brightness, contrast, AWB, gain, exposure, focus, etc.), real-time effect via mediamtx HTTP API proxy

*Roles & Permissions:*
- Role hierarchy: Admin → Moderator → Viewer (Company) → Viewer (Guest)
- Admin role: CLI-only assignment
- Moderator role: CLI or Admin via web UI (previously authenticated users only)
- Admin web UI: stream start/stop toggle, promote/demote authenticated users to/from Moderator
- Moderator capabilities: message delete, user mute (chat-silenced, stream retained), user ban (access revoked, session ended immediately)
- CLI admin tools: role assignment, domain allowlist, individual allowlist, ban/unban, view users + last-seen, stop/start stream

*Platform:*
- Dark mode, mobile-responsive (Firefox on Android validated for admin use case)
- Modern evergreen browsers (Chrome, Firefox, Edge); Safari/iOS explicitly out of scope

### Post-MVP Features (Phase 2 — Growth)

- Web admin UI: individual email allowlist management (add/remove without CLI)
- Web admin UI: blacklist/unban management (without CLI)
- Audit log viewer (admin-only SPA page)
- Message reactions — Discord-style per-message reactions; mods can remove/manage; muted users cannot react
- frp SSH tunnel — separate SPA page, admin role only

### Future Vision (Phase 3 — Expansion)

- One-time expiring guest links (no Google account required)
- Stream reactions / emoji overlays
- Background ambient audio (royalty-free)
- Treat dispenser integration (GPIO, web-activated)
- Full web-based admin UI replacing all CLI operations
- Public open-source release (PII-sanitized commit history)

### Risk Mitigation Strategy

| Risk | Assessment | Mitigation |
|---|---|---|
| frp relay performance at 10–20 viewers | Infrastructure concern, not technical blocker | Scale upstream server vertically/horizontally as needed |
| Google OAuth avatar scope | Resolved — `openid email profile` | Gravatar fallback if profile image unavailable |
| Camera control implementation | mediamtx HTTP API proxied via frp tunnel; settings persisted in DB and re-applied on Pi reconnect | Resolved during 3.2c pivot — see 3-6 architecture notes |
| Stream stops unexpectedly | Primary failure mode | systemd restart-on-failure; upstream detects tunnel drop and shows graceful state |
| PII in CI artifacts | No Pi binary is published; frpc.toml and mediamtx.yml stay on-device | Install script generates config files on the Pi; no credentials in any CI artifact |

---

## Functional Requirements

### Authentication & Access Control

- **FR1:** Unauthenticated users can view a landing page that explains the stream's private nature and provides a login entry point
- **FR2:** Users can authenticate via Google OAuth using their Google account
- **FR3:** The system grants stream access to users whose email domain matches a configured domain allowlist
- **FR4:** The system grants stream access to users whose individual email address is on the allowlist
- **FR5:** The system denies access to users who do not match any allowlist entry and presents a clear rejection message post-OAuth
- **FR6:** The system does not create persistent account records for rejected users
- **FR7:** Authenticated users' sessions persist across visits without requiring re-authentication
- **FR8:** User profile information (display name, avatar) is sourced from Google OAuth; gravatar is used as fallback when no Google avatar is available

### Stream & State Management

- **FR9:** Authenticated users can view a live video stream
- **FR10:** The stream UI communicates one of four explicit states: live, intentionally offline, unreachable-but-should-be-live, or offline-and-unreachable
- **FR11:** Admin users can start and stop the stream from the web UI on any device
- **FR12:** When the Pi is unreachable and the stream toggle is set to live, the UI displays a "check back soon" message
- **FR13:** When the stream is stopped by an admin, all active viewer sessions immediately reflect the offline state
- **FR14:** Admin users can adjust camera settings (brightness, contrast, AWB, gain, exposure, focus, and other runtime parameters) from the web UI with real-time effect on the stream
- **FR15:** Admin users can access camera settings controls from a collapsible sidebar in the web UI

### Chat

- **FR16:** Authenticated users can send text messages in a chat sidebar alongside the stream; all chat activity (new messages, edits, deletions) is delivered in real-time to all connected users via WebSocket
- **FR17:** Chat messages support basic markdown formatting
- **FR18:** The chat sidebar displays the sender's avatar and display name with each message
- **FR19:** The chat sidebar loads the last 200 messages on page load
- **FR20:** The chat sidebar is collapsed by default on smaller screens and expanded by default on larger screens
- **FR21:** Users receive an unread message count indicator on the collapsed chat sidebar while the stream is open
- **FR22:** Users can expand and collapse the chat sidebar at will
- **FR23:** Users can edit or delete their own chat messages via a message context menu; edits are recorded as revision history and display an "edited" indicator with a timestamp tooltip on hover; deletions are soft-deletes (record retained server-side)
- **FR24:** All authenticated users can view the list of currently connected viewers
- **FR25:** The chat sidebar supports infinite scroll — scrolling upward loads older messages progressively with clear day-boundary delineators between message groups

### Moderation

- **FR26:** Moderator and Admin users can delete any user's chat message via a message context menu; deletions are soft-deletes with revision history retained server-side
- **FR27:** Moderator and Admin users can mute a user via that user's profile context menu; muted users retain stream access but cannot send chat messages or reactions
- **FR28:** Moderator and Admin users can ban a user via that user's profile context menu; banned users have access revoked and active sessions terminated immediately
- **FR29:** Moderator and Admin users can unmute a previously muted user
- **FR30:** All moderation actions (message delete, mute, unmute, ban) are recorded in an audit log
- **FR31:** Non-privileged users see no elevated options on other users' profiles or messages they do not own

### Role & User Management

- **FR32:** The system enforces a four-tier role hierarchy: Admin, Moderator, Viewer (Company), Viewer (Guest)
- **FR33:** All users are assigned their base viewer tier automatically on first authenticated login based on their allowlist match (company domain = Viewer Company; individual email = Viewer Guest)
- **FR34:** Admin role can only be assigned via CLI
- **FR35:** Admin users can promote or demote any previously authenticated user to/from the Moderator role via the web UI
- **FR36:** Admin users can promote or demote users to/from any role via CLI
- **FR37:** Admin users can view all registered users and their first-seen and last-seen timestamps
- **FR38:** Viewer (Guest) users display a visible "Guest" pill/tag adjacent to their username in the chat interface
- **FR39:** Admin users can assign a custom label to any user that replaces or overrides the default role pill/tag displayed in chat
- **FR40:** Admin users can assign a custom color to a user's label pill/tag; colors must be theme-compatible and legible in both dark and light mode

### Allowlist & Blocklist Management

- **FR41:** Admin users can add or remove domain entries from the allowlist via CLI
- **FR42:** Admin users can add or remove individual email addresses from the allowlist via CLI
- **FR43:** Admin users can ban or unban individual user accounts via CLI
- **FR44:** The allowlist controls registration eligibility only; adding or removing domain or individual email entries does not affect already-authenticated users. Banning a user takes effect immediately, revoking all active sessions via WebSocket signal.

### IoT Agent & Infrastructure

- **FR45:** frpc is installed as a systemd service on the Pi and establishes the stream proxy tunnel to the upstream server automatically on boot, with restart-on-failure
- **FR46:** frpc is configured with an API proxy tunnel to the upstream server on boot, enabling camera control commands from the backend to reach mediamtx's HTTP API on the Pi
- **FR47:** frpc and mediamtx are each managed as independent systemd services with automatic restart-on-failure; transient crashes in either service do not require manual intervention
- **FR48:** All Pi-side sensitive configuration (upstream server address, frp auth tokens) is stored in `frpc.toml` and `mediamtx.yml` — native config files for each tool, with restricted filesystem permissions; no credentials are stored in any CI artifact
- **FR50:** An install script and operator README cover the full bootstrap flow: OS flash → camera verification (`rpicam-still`) → frpc and mediamtx installation and systemd service configuration via `./install.sh --endpoint <url>`; an uninstall script provides clean removal
- **FR51:** WiFi configuration on a new Pi is the operator's responsibility; the operator documentation optionally covers wifi-connect as one approach — operators who configure WiFi via other means (Pi Imager preconfiguration, wpa_supplicant, etc.) are fully supported; no custom captive portal is implemented

### Platform & Developer Operations

- **FR52:** The web application is a single-page application; all viewer, chat, and admin features are accessible within a single page surface without full navigation
- **FR53:** The upstream server detects Pi tunnel disconnection and reflects the appropriate stream state to all connected viewers without crashing or data loss
- **FR54:** GitHub Actions CI/CD pipelines build and publish Docker images for the server and web app; the Go agent workspace and its CI pipeline have been removed from the monorepo; no Pi binary artifact is published from this repository
- **FR55:** The application is configurable with an instance-specific pet name (e.g. "Manly") and site name (e.g. "ManlyCam"); these values are set at upstream server deploy time alongside other server-side configuration (OAuth credentials, database credentials, `site_url`, etc.) and are used throughout the UI, landing page, and any branding surfaces — no hardcoded references to either value exist in the codebase

### Stream Title & Snapshot

- **FR56:** The Broadcast Console displays a configurable stream title (flavor text) in the center; the title has a default value and can be updated at runtime by Admin and Moderator users via an inline edit popover; title changes are persisted in server memory and broadcast immediately to all connected viewers via WebSocket so all clients reflect the change without reload
- **FR57:** All authenticated users can capture the current stream frame as a still image via a snapshot button (camera icon) in the Broadcast Console right flank; the capture is performed client-side using a canvas element and the resulting JPEG downloads to the user's device

### PiSugar Battery Monitor

- **FR58:** When `FRP_PISUGAR_PORT` is set in the server environment, the server maintains a persistent TCP socket connection to the PiSugar power manager (proxied via frpc from the Pi) and polls for battery state on a 30-second interval; the polled data — battery level (%), plug state, charging state, and charging range — is broadcast exclusively to connected Admin users via a dedicated WebSocket message type; the Broadcast Console left flank (admin-only) displays a battery icon reflecting current status with a detail popover; when the TCP connection cannot be established or maintained, the icon reflects an "unknown" state

### Resizable Chat Sidebar

- **FR59:** On desktop (≥ 1024px), the right chat sidebar is resizable by dragging a handle between the stream column and the chat sidebar; the sidebar width is constrained to a min/max range; the width is persisted to `localStorage` and restored on next visit; the sidebar can be fully collapsed via the Broadcast Console chat toggle and re-expanded to its last saved width

---

## Non-Functional Requirements

### Performance

- **NFR1:** Stream latency is minimized to the extent permitted by the Pi Zero W 2 hardware, camera pipeline, frp tunnel, and network conditions; no artificial buffering or delay is introduced at any layer
- **NFR2:** The upstream server introduces no unnecessary encoding or relay delay; stream is proxied to viewers as efficiently as the infrastructure permits
- **NFR3:** Chat messages are delivered to all connected clients via WebSocket following established best practices for connection management, reconnection handling, and message ordering; delivery is bounded only by network conditions

### Security

- **NFR4:** All traffic between clients, the upstream server, and the Pi is transmitted over encrypted connections (TLS)
- **NFR5:** Google OAuth is validated once at login; the server issues a DB-backed session cookie (`httpOnly SameSite=Strict Secure`) for subsequent request authentication. User profile data (display name, avatar) is upserted to the user record on each login; if profile information changes between sessions, the update is reflected on next login and broadcast to all connected clients via WebSocket. Clients are not instructed to re-validate OAuth tokens mid-session.
- **NFR6:** User allowlist and role checks are enforced server-side; access cannot be bypassed by client manipulation
- **NFR7:** Session revocation on ban takes effect immediately via WebSocket signal to the affected client's active connection; allowlist removal does not revoke existing sessions
- **NFR8:** No Pi agent binary is published via CI; all Pi-side sensitive configuration is stored in `frpc.toml` and `mediamtx.yml` on-device with restricted filesystem permissions
- **NFR9:** Audit log entries for moderation actions are append-only and cannot be modified or deleted by any web UI action

### Reliability

- **NFR10:** The Pi frp agent is managed by systemd with automatic restart-on-failure; transient crashes must not require manual intervention to recover
- **NFR11:** The upstream server handles Pi tunnel disconnection gracefully — active viewer WebSocket connections remain open and reflect the updated stream state without server error or crash
- **NFR12:** The upstream server handles concurrent viewer connections up to the concurrent viewer target (10–20) without stream degradation; additional capacity is addressed by scaling the upstream server, not the Pi
- **NFR13:** A degraded-but-live stream is always preferable to a clean failure; no component should terminate a live stream silently

### Data

- **NFR14:** Chat messages and audit log records are retained indefinitely; no automated expiry or deletion policy is applied by the application
- **NFR15:** Chat message edits are stored as revision history; soft-deleted messages retain their server-side record; no user-initiated action results in permanent data loss
- **NFR16:** Bulk data management (e.g. deleting records older than a given date) is an administrative database operation performed outside the application UI

### Code Quality & Development

- **NFR17:** All source code is linted via ESLint with airbnb-base + @typescript-eslint rules enforced at project root
- **NFR18:** Code style is enforced via Prettier integration; formatting violations are reported as lint errors by ESLint
- **NFR19:** CI pipeline blocks merges with lint violations; all code must pass `pnpm lint` before deployment
- **NFR20:** Lint enforcement applies equally to server, web, and shared type packages — no exemptions for legacy code
- **NFR21:** Test coverage is collected on every CI run via Vitest's V8 coverage provider. Before coverage thresholds are enforced, a dedicated story audits the existing test suite, identifies untested paths critical to the user experience (auth flow, allowlist enforcement, session lifecycle, WebSocket state transitions), adds tests to cover those paths, and sets the initial per-package thresholds at the resulting baseline. CI blocks merges on coverage regression below those baselines thereafter.

**Rationale:** Early code quality enforcement prevents technical debt accumulation and ensures consistent patterns across multiple developers/AI agents. Coverage thresholds anchored to real critical-path coverage — rather than an arbitrary target — are both achievable and meaningful. This supports long-term maintainability and reduces defect rates.

---

## Development Tooling & Infrastructure

### Code Quality

- **ESLint 9.x** with airbnb-base configuration (enforces industry-standard JS best practices)
- **@typescript-eslint** for type-aware linting (server and web apps use strict TypeScript)
- **Prettier 3.x** for code formatting (integrated as ESLint rule, eliminates formatting debates)
- **Root-level configuration** applied across all apps/packages; no per-app overrides needed (keeps setup simple)

### Deployment & Operations

- **GitHub Actions CI/CD** for automated builds, tests, and releases
- **Docker Compose** for local development and standard deployment
- **Reverse proxy options:** Caddy (simplest), nginx (most familiar), Traefik (Docker-native)
- **frp (fast reverse proxy)** for Pi-to-upstream tunnel relay (stream + API control)
- **systemd** for bare-metal server deployment (automatic restart-on-failure)

### Package Management

- **pnpm workspaces** (monorepo with shared dependencies at root)
- **Shared TypeScript config** per app (strict mode enforced across all packages)

### Rationale

Opinionated, industry-standard tooling reduces decision fatigue during development. Early enforcement (Epic 1) establishes patterns that scale with team growth.
