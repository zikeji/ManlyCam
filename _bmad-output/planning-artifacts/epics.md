---
stepsCompleted:
  [
    step-01-validate-prerequisites,
    step-02-design-epics,
    step-03-create-stories,
    step-04-final-validation,
    epic-8-planning,
  ]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
  - _bmad-output/implementation-artifacts/epic-7-retro-2026-03-13.md
---

# ManlyCam - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for ManlyCam, decomposing the requirements from the PRD, UX Design, and Architecture requirements into implementable stories.

## Requirements Inventory

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
- FR13: When the stream is stopped by an admin, all active viewer sessions immediately reflect the offline state via WebSocket
- FR14: Admin users can adjust camera settings (all v4l2-ctl exposed controls) from the web UI with real-time effect on the stream
- FR15: Admin users can access camera settings controls from a collapsible sidebar in the web UI

**Chat**

- FR16: Authenticated users can send text messages in a chat sidebar alongside the stream; all chat activity is delivered in real-time to all connected users via WebSocket
- FR17: Chat messages support basic markdown formatting
- FR18: The chat sidebar displays the sender's avatar and display name with each message
- FR19: The chat sidebar loads the last 200 messages on page load
- FR20: The chat sidebar is collapsed by default on smaller screens and expanded by default on larger screens
- FR21: Users receive an unread message count indicator on the collapsed chat sidebar while the stream is open
- FR22: Users can expand and collapse the chat sidebar at will
- FR23: Users can edit or delete their own chat messages via a message context menu; edits are recorded as revision history and display an "edited" indicator; deletions are soft-deletes
- FR24: All authenticated users can view the list of currently connected viewers
- FR25: The chat sidebar supports infinite scroll — scrolling upward loads older messages progressively with clear day-boundary delineators

**Moderation**

- FR26: Moderator and Admin users can delete any user's chat message via a message context menu; deletions are soft-deletes with revision history retained server-side
- FR27: Moderator and Admin users can mute a user via that user's profile context menu; muted users retain stream access but cannot send chat messages or reactions
- FR28: Moderator and Admin users can ban a user via that user's profile context menu; banned users have access revoked and active sessions terminated immediately
- FR29: Moderator and Admin users can unmute a previously muted user
- FR30: All moderation actions (message delete, mute, unmute, ban) are recorded in an audit log
- FR31: Non-privileged users see no elevated options on other users' profiles or messages they do not own

**Role & User Management**

- FR32: The system enforces a four-tier role hierarchy: Admin, Moderator, Viewer (Company), Viewer (Guest)
- FR33: All users are assigned their base viewer tier automatically on first authenticated login based on their allowlist match
- FR34: Admin role can only be assigned via CLI
- FR35: Admin users can promote or demote any previously authenticated user to/from the Moderator role via the web UI
- FR36: Admin users can promote or demote users to/from any role via CLI
- FR37: Admin users can view all registered users and their first-seen and last-seen timestamps
- FR38: Every user has a computed `UserTag` (text + color) sent by the server in all profile responses and `user:update` WebSocket messages; ViewerGuest users receive a default `{ text: 'Guest', color: <default> }` UserTag unless overridden; ViewerCompany/Moderator/Admin users have `userTag: null` unless overridden
- FR39: Admin users can set a custom UserTag text on any user, overriding the default or adding one where none existed
- FR40: Admin users can set a custom UserTag color on any user; colors must be theme-compatible and legible in both dark and light mode

**Allowlist & Blocklist Management**

- FR41: Admin users can add or remove domain entries from the allowlist via CLI
- FR42: Admin users can add or remove individual email addresses from the allowlist via CLI
- FR43: Admin users can ban or unban individual user accounts via CLI
- FR44: The allowlist controls registration eligibility only; adding or removing entries does not affect already-authenticated users. Banning a user takes effect immediately, revoking all active sessions via WebSocket signal.

**IoT Agent & Infrastructure**

- FR45: frpc is installed as a systemd service on the Pi and establishes the stream proxy tunnel to the upstream server on boot, with restart-on-failure
- FR46: frpc is configured with an API proxy tunnel to the upstream server on boot, enabling camera control commands from the backend to reach mediamtx's HTTP API on the Pi
- FR47: frpc and mediamtx are each managed as independent systemd services with automatic restart-on-failure
- FR48: All Pi-side sensitive configuration is stored in frpc.toml and mediamtx.yml — native config files for each tool, with restricted filesystem permissions; no credentials in any CI artifact
- FR50: An install script and operator README cover the full bootstrap flow: OS flash → camera verification → frpc + mediamtx installation via `./install.sh --endpoint <url>`; an uninstall script provides clean removal
- FR51: WiFi configuration is the operator's responsibility; the operator documentation optionally covers wifi-connect as one approach — no custom captive portal is implemented

**Platform & Developer Operations**

- FR52: The web application is a single-page application; all viewer, chat, and admin features are accessible within a single page surface without full navigation
- FR53: The upstream server detects Pi tunnel disconnection and reflects the appropriate stream state to all connected viewers without crashing or data loss
- FR54: GitHub Actions CI/CD builds and publishes Docker images for the server and web app; the Go agent workspace and its CI pipeline have been removed from the monorepo; no Pi binary artifact is published
- FR55: The application is configurable with an instance-specific pet name and site name set at deploy time; no hardcoded references exist in the codebase

**Chat Enhancement (Epic 8)**

- FR60: Chat Emojis & Emoji Picker — full emoji picker with search and categories for chat input; Discord/Slack-style `:emoji_name:` shortcuts with autocomplete; reusable picker architecture for reactions
- FR61: Message Reactions — users can react to any chat message with an emoji; Moderator/Admin can remove any reaction; muted users see disabled reaction controls
- FR62: Expanded Markdown Support — code blocks with syntax highlighting (triple backticks), blockquotes, auto-detected links, italics, strikethrough, markdown images with max-height constraint, multiline rendering with spam prevention (consecutive newlines collapsed)
- FR63: @Mentions — `@Full Name` mentions with autocomplete (spaces ignored in matching), highlighted messages for mentioned users, titlebar flash on mention preference
- FR64: Browser Notifications — chat message, @mention, and stream state change notifications with granular per-type user preferences; scoped to active browser tabs only (no service worker/push API)
- FR65: Programmable Slash Commands — admin-defined JavaScript commands with name, description, placeholder, handler, and role-based visibility gate; ephemeral response option; built-in text expansions (`/shrug`, `/tableflip`)

**Clipping & Clip Sharing (Epic 10)**

- FR66: Clip Creation — Any authenticated user (all roles including ViewerGuest) can clip a segment from the server-side HLS rolling buffer; preset duration options (30s, 1min, 2min) preselect a range in the clip scrubber UI which can be manually adjusted; all authenticated users are rate-limited (5 clips/hour) except Moderator and Admin who are exempt
- FR67: Clip Processing Pipeline — Server-side ffmpeg extracts clips from HLS segments using stream copy (no re-encoding), uploads to configured S3-compatible storage (Backblaze B2 in production, RustFS container in development); clips carry `pending`/`ready`/`failed` status; a persistent Sonner toast tracks processing progress without disrupting stream visibility; a thumbnail is captured and stored for each clip
- FR68: Clip Visibility Tiers — Three states: `private` (owner + Admin only), `shared` (accessible by all authenticated users via direct link and visible in the shared clips view), `public` (accessible by unauthenticated users via direct link and shareable externally); only Admin or Moderator can set visibility to `public`; a clip made private after being shared in chat tombstones the chat card on the next history load; a clip made shared/public while referenced in chat restores its live preview to all connected clients in real-time
- FR69: My Clips Dialog — Authenticated users open a dialog from the profile popover (above Preferences) to view and manage their own clips (edit title, description, visibility); a toggle reveals shared clips from all other users; Admin users can additionally toggle to view all clips regardless of visibility; each clip card exposes Copy Link and Share to Chat actions
- FR70: Chat Clip Sharing — Clips can be shared to chat at creation time via a "Share to chat when ready" checkbox, or manually from My Clips; shared clips appear as a distinct clip message type in the chat timeline with thumbnail, title, duration, and a Watch action; clicking Watch opens a modal overlay so the stream continues behind it; the browser URL updates to `/clips/[id]` while the modal is open enabling direct-link copying; refreshing while in this state renders the standalone clip page
- FR71: Chat Clip Tombstone — When a clip referenced in the chat timeline is set to private, subsequent message history loads replace the clip card with a "This clip is private" placeholder of identical dimensions; currently connected viewers are not disrupted but will see the placeholder on their next history fetch; no information about the original clip content is exposed in the placeholder
- FR72: Public Clip Pages — Public clips are accessible at `/clips/[id]` without authentication; the page renders a video player, title, description, and optional clipper attribution; no stream link, chat, or application navigation is shown to unauthenticated visitors; authenticated users see a stream-status-aware CTA ("Watch Live →" when stream is online, "Go to Stream →" when offline); the Hono backend injects OG meta tags (`og:title`, `og:description`, `og:image`) server-side before serving `index.html` enabling social unfurling without SSR; non-public clips return 403 to unauthenticated requests
- FR73: Clipper Attribution — When a clip is set to public, Admin or Moderator can enable per-clip clipper attribution; controls include a "Show clipper" toggle, a conditional "Show clipper avatar" toggle, and a "Clipper name" text field (pre-filled with the user's display name, editable); attribution fields are stored on the clip record

### NonFunctional Requirements

**Performance**

- NFR1: Stream latency is minimized to the extent permitted by the Pi Zero W 2 hardware, camera pipeline, frp tunnel, and network conditions; no artificial buffering introduced at any layer
- NFR2: The upstream server introduces no unnecessary encoding or relay delay; stream is proxied to viewers as efficiently as the infrastructure permits
- NFR3: Chat messages are delivered to all connected clients via WebSocket following established best practices; delivery is bounded only by network conditions

**Security**

- NFR4: All traffic between clients, the upstream server, and the Pi is transmitted over encrypted connections (TLS)
- NFR5: Google OAuth is validated once at login; the server issues a session cookie for subsequent request authentication; profile data is upserted on each login
- NFR6: User allowlist and role checks are enforced server-side; access cannot be bypassed by client manipulation
- NFR7: Session revocation on ban takes effect immediately via WebSocket signal to the affected client's active connection; allowlist removal does not revoke existing sessions
- NFR8: The Pi agent binary published via CI contains no credentials, server addresses, or PII; all sensitive configuration is stored in a separate on-device config file with restricted filesystem permissions
- NFR9: Audit log entries for moderation actions are append-only and cannot be modified or deleted by any web UI action

**Reliability**

- NFR10: The Pi frp agent is managed by systemd with automatic restart-on-failure; transient crashes must not require manual intervention to recover
- NFR11: The upstream server handles Pi tunnel disconnection gracefully — active viewer WebSocket connections remain open and reflect the updated stream state without server error or crash
- NFR12: The upstream server handles concurrent viewer connections up to 10–20 without stream degradation
- NFR13: A degraded-but-live stream is always preferable to a clean failure; no component should terminate a live stream silently

**Data**

- NFR14: Chat messages and audit log records are retained indefinitely; no automated expiry or deletion policy is applied by the application
- NFR15: Chat message edits are stored as revision history; soft-deleted messages retain their server-side record; no user-initiated action results in permanent data loss
- NFR16: Bulk data management is an administrative database operation performed outside the application UI

### Additional Requirements

**Architecture — Starter Template & Monorepo**

- Pnpm monorepo with workspaces: `apps/agent` (Go), `apps/server` (Hono/Node.js), `apps/web` (Vue 3/Vite), `packages/types` (shared TypeScript types)
- Server scaffolded via `pnpm create hono@latest apps/server --template nodejs`
- Web SPA scaffolded via `pnpm create vite@latest apps/web -- --template vue-ts`
- Pi agent initialized via `go mod init`; `github.com/spf13/cobra` for CLI
- This monorepo scaffold is **Epic 1, Story 1** — all other implementation depends on it

**Architecture — Database & IDs**

- PostgreSQL via Prisma 6 ORM with strict snake_case DB column mapping
- All primary keys use ULID (`CHAR(26)`), server-generated only via `monotonicFactory()` from `ulidx`
- ULID generation centralized to `src/lib/ulid.ts` — single import point
- DB-backed sessions (`sessions` table) — no stateless JWT; `httpOnly SameSite=Strict Secure` cookie
- Ban is atomic: sets `banned_at` + deletes all sessions in a single `prisma.$transaction()`

**Architecture — Stream Pipeline**

- Pi runs `rpicam-vid` subprocess → H.264 MPEG-TS → frp stream tunnel → upstream ffmpeg → HLS (2s segments, 5-segment rolling window)
- HLS segments written to `HLS_SEGMENT_PATH` env var (default `/tmp/hls`); tmpfs ramdisk recommended in production
- frp and ffmpeg are separate processes, not managed by Node.js directly
- Two frp tunnels: stream proxy + API proxy (separate auth layers: frp token for tunnel, `X-Agent-Key` for agent API calls)

**Architecture — WebSocket & Real-time**

- Single WS connection per authenticated session at `GET /ws`
- In-process `EventEmitter` fan-out (appropriate for 10–20 viewers; Redis seam documented for future horizontal scaling)
- Typed `WsMessage` discriminated union in `packages/types/src/ws.ts` — 12 message types
- WS used for: chat messages/edits/deletes, stream state transitions, presence join/leave, typing indicators, session revocation, moderation events, user profile updates

**Architecture — CI/CD**

- Path-filtered GitHub Actions: `agent.yml`, `server.yml`, `web.yml`, `types.yml`
- Agent: semver tags required (for `--self-update` version comparison); GitHub Releases with ARM artifact
- Server + Web: rolling Docker deploy (image tagged with commit SHA + `latest`)
- All CI artifacts must be PII-free

**Architecture — Observability**

- Structured JSON logging via `pino` (server) and `log/slog` (agent)
- Prometheus metrics via `prom-client` (server) exposed at `GET /metrics`
- Grafana Cloud: Loki for logs, Prometheus for metrics (via agent scrape)

**UX — Responsive Layout** _(updated Epic 7 — sprint-change-proposal-2026-03-12.md)_

- Mobile-first CSS: base styles for `< 768px`, layer `md:` / `lg:` upward
- Desktop (`≥ 1024px`): stream top-aligned (approx. 5vh top padding), `<BroadcastConsole>` strip directly below, `<AtmosphericVoid>` fills remaining height; right sidebar (chat + viewers) runs full height alongside; left sidebar (admin camera controls) opened via Console left flank toggle; right sidebar is drag-resizable between a min and max width
- Mobile portrait (`< 768px`): stream full-width at top, `<BroadcastConsole>` directly below, chat panel fills remaining height; admin controls and viewers as bottom Sheet drawers
- Mobile landscape: immersive — stream fills full screen; chat panel slides in from right as overlay; `<BroadcastConsole>` elements (live status, viewer count, toggles) integrated into chat sidebar header
- Sidebar collapse state persisted to `localStorage`; re-hydrated before first paint to prevent flash

**UX — Broadcast Console** _(new — Epic 7; replaces Hover-Reveal Overlay)_

- Persistent semi-transparent horizontal strip directly below the stream on desktop and mobile portrait
- Left flank (admin-only): Camera Controls toggle, Stream Start/Stop toggle, Battery Indicator (if PiSugar configured via `FRP_PISUGAR_PORT`)
- Center: Stream title / flavor text (editable by Admin/Mod via inline popover; changes broadcast via WS); Live status badge; Viewer count
- Right flank (all users): Snapshot button (camera icon, "Take Snapshot" tooltip); Profile avatar popover; Chat sidebar toggle with unread badge
- No hover-gated controls on the stream itself — the video element is unobstructed at all times
- Mobile landscape: Console elements move into chat sidebar header; stream is edge-to-edge immersive

**UX — Accessibility**

- WCAG 2.1 AA throughout; AAA for stream status elements
- `prefers-color-scheme` respected; dark mode is default when no system preference declared
- Manual dark/light toggle persisted in `localStorage`
- `prefers-reduced-motion` respected — all CSS transitions/animations wrapped accordingly
- All interactive controls: minimum `44×44px` touch target
- Focus styles always visible (`outline: none` forbidden); ShadCN `focus-visible` styles preserved

**UX — Design System**

- ShadCN-vue (Radix Vue + Tailwind v3 + CSS variable theming) — components scaffolded into repo
- Tailwind v3 pinned (shadcn-vue does not yet have stable v4 support)
- Dark palette: warmed toward cozy (reference: Discord `#313338` surface, `#1E1F22` sidebar, warmed)
- CSS custom properties drive all colours; `.dark` class swap for theme switching
- Favicon: custom SVG of Manly's signature tooth
- Footer: configurable copyright/brand line driven by `SITE_NAME` env var — no hardcoded company name in codebase

### FR Coverage Map

| FR   | Epic    | Description                                                                                                                                 |
| ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1  | Epic 2  | Unauthenticated landing page                                                                                                                |
| FR2  | Epic 2  | Google OAuth sign-in                                                                                                                        |
| FR3  | Epic 2  | Domain allowlist enforcement                                                                                                                |
| FR4  | Epic 2  | Individual email allowlist enforcement                                                                                                      |
| FR5  | Epic 2  | Rejection state post-OAuth                                                                                                                  |
| FR6  | Epic 2  | No ghost accounts for rejected users                                                                                                        |
| FR7  | Epic 2  | Persistent session across visits                                                                                                            |
| FR8  | Epic 2  | Avatar from Google OAuth / Gravatar fallback                                                                                                |
| FR9  | Epic 3  | Authenticated live stream access                                                                                                            |
| FR10 | Epic 3  | 4-state stream UI (live / offline / unreachable-live / unreachable-offline)                                                                 |
| FR11 | Epic 3  | Admin stream start/stop from web UI                                                                                                         |
| FR12 | Epic 3  | "Check back soon" state when Pi unreachable + toggle live                                                                                   |
| FR13 | Epic 3  | Real-time state broadcast to all viewers on admin toggle                                                                                    |
| FR14 | Epic 3  | Camera settings controls with real-time v4l2-ctl effect                                                                                     |
| FR15 | Epic 3  | Collapsible camera settings sidebar (admin only)                                                                                            |
| FR16 | Epic 4  | Real-time chat via WebSocket                                                                                                                |
| FR17 | Epic 4  | Markdown formatting in chat messages                                                                                                        |
| FR18 | Epic 4  | Avatar + display name with each message                                                                                                     |
| FR19 | Epic 4  | Load last 200 messages on page load                                                                                                         |
| FR20 | Epic 4  | Auto-collapse on small screens, auto-expand on large                                                                                        |
| FR21 | Epic 4  | Unread message count indicator on collapsed sidebar                                                                                         |
| FR22 | Epic 4  | Manual expand/collapse of chat sidebar                                                                                                      |
| FR23 | Epic 4  | Edit/delete own messages; revision history; soft-delete                                                                                     |
| FR24 | Epic 4  | Viewer presence list (all authenticated users)                                                                                              |
| FR25 | Epic 4  | Infinite scroll with day-boundary delineators                                                                                               |
| FR26 | Epic 5  | Moderator/Admin delete any message; soft-delete                                                                                             |
| FR27 | Epic 5  | Moderator/Admin mute user (chat-silenced, stream retained)                                                                                  |
| FR28 | Epic 5  | Moderator/Admin ban user (access revoked + immediate session termination)                                                                   |
| FR29 | Epic 5  | Moderator/Admin unmute user                                                                                                                 |
| FR30 | Epic 5  | Audit log for all moderation actions                                                                                                        |
| FR31 | Epic 5  | Non-privileged users see no elevated options                                                                                                |
| FR32 | Epic 5  | Four-tier role hierarchy: Admin > Moderator > Viewer Company > Viewer Guest                                                                 |
| FR33 | Epic 5  | Auto-assign base viewer tier on first login from allowlist match                                                                            |
| FR34 | Epic 5  | Admin role CLI-only assignment                                                                                                              |
| FR35 | Epic 5  | Admin promote/demote Moderator via web UI                                                                                                   |
| FR36 | Epic 5  | Admin promote/demote any role via CLI                                                                                                       |
| FR37 | Epic 5  | Admin view all users with first-seen / last-seen timestamps                                                                                 |
| FR38 | Epic 5  | Server-computed UserTag on all user profiles; default Guest UserTag for ViewerGuest                                                         |
| FR39 | Epic 5  | Admin set custom UserTag text on any user                                                                                                   |
| FR40 | Epic 5  | Admin set custom UserTag color on any user                                                                                                  |
| FR41 | Epic 2  | CLI add/remove domain allowlist entries                                                                                                     |
| FR42 | Epic 2  | CLI add/remove individual email allowlist entries                                                                                           |
| FR43 | Epic 2  | CLI ban/unban user accounts                                                                                                                 |
| FR44 | Epic 2  | Immediate active session enforcement on allowlist/blocklist change                                                                          |
| FR45 | Epic 6  | frpc systemd service: stream proxy tunnel on boot                                                                                           |
| FR46 | Epic 6  | frpc systemd service: API proxy tunnel on boot (camera control)                                                                             |
| FR47 | Epic 6  | frpc + mediamtx systemd restart-on-failure                                                                                                  |
| FR48 | Epic 6  | frpc.toml + mediamtx.yml: sensitive config in native config files                                                                           |
| FR49 | N/A     | REMOVED — no Go binary; no self-update mechanism                                                                                            |
| FR50 | Epic 6  | Install script + operator README: OS flash → camera verify → frpc/mediamtx setup                                                            |
| FR51 | Epic 6  | WiFi config: operator's choice; wifi-connect optionally documented in README                                                                |
| FR52 | Epic 3  | Single-page application constraint                                                                                                          |
| FR53 | Epic 3  | Graceful Pi tunnel-drop handling (no server crash, state broadcast)                                                                         |
| FR54 | Epic 1  | GitHub Actions CI/CD: server + web Docker images; agent CI removed                                                                          |
| FR55 | Epic 1  | Deploy-time config: pet name, site name, OAuth creds, DB URL                                                                                |
| FR56 | Epic 7  | Editable stream title in Broadcast Console (Admin/Mod); changes broadcast via WS                                                            |
| FR57 | Epic 7  | Snapshot button in Broadcast Console; client-side JPEG frame capture + download                                                             |
| FR58 | Epic 7  | PiSugar battery monitor: server TCP poller + admin-only WS broadcast + UI indicator                                                         |
| FR59 | Epic 7  | Resizable chat sidebar (desktop drag handle); width persisted to localStorage                                                               |
| FR60 | Epic 8  | Chat Emojis & Emoji Picker — full emoji picker with search and categories; `:emoji_name:` shortcuts with autocomplete                       |
| FR61 | Epic 8  | Message Reactions — react to messages with emojis; mod/admin can remove; muted users see disabled controls                                  |
| FR62 | Epic 8  | Expanded Markdown — code blocks with syntax highlighting, blockquotes, links, italics, strikethrough, images, multiline                     |
| FR63 | Epic 8  | @Mentions — `@Full Name` with autocomplete, highlighted messages, titlebar flash on mention                                                 |
| FR64 | Epic 8  | Browser Notifications — chat, mention, stream state notifications with granular preferences                                                 |
| FR65 | Epic 8  | Programmable Slash Commands — admin-defined JS commands with role-based visibility, ephemeral option                                        |
| FR66 | Epic 10 | Clip Creation — any authenticated user clips from HLS rolling buffer; presets + adjustable range; rate-limited except Moderator+            |
| FR67 | Epic 10 | Clip Processing — server-side ffmpeg stream-copy, S3 upload, pending/ready/failed status, Sonner processing toast, thumbnail capture        |
| FR68 | Epic 10 | Clip Visibility Tiers — private/shared/public; public requires Admin/Moderator; tombstone on private; live restore on shared/public in chat |
| FR69 | Epic 10 | My Clips Dialog — manage own clips via profile-menu dialog, edit title/description/visibility, shared clips toggle, admin all-clips view, copy-link + share-to-chat |
| FR70 | Epic 10 | Chat Clip Sharing — share at creation or from My Clips; clip message type; Watch modal overlay; URL updates to /clips/[id]                  |
| FR71 | Epic 10 | Chat Clip Tombstone — private clip replaced with placeholder on next history load; active viewers unaffected until reload                   |
| FR72 | Epic 10 | Public Clip Pages — /clips/[id] unauthenticated; OG meta server-injected; stream-status CTA for auth users; 403 for non-public clips        |
| FR73 | Epic 10 | Clipper Attribution — per-clip show-clipper toggle + avatar toggle + custom name field (Admin/Mod only, stored on clip record)              |

## Epic List

### Epic 1: Monorepo Foundation & CI/CD

The development team can scaffold, build, test, and deploy all three components of ManlyCam from a single repository. The monorepo is initialized with pnpm workspaces, shared TypeScript types, all application scaffolds, Prisma schema, CI/CD pipelines, and deployment reference configurations — providing the complete foundation on which all subsequent epics are built.

**FRs covered:** FR54, FR55
**Additional:** pnpm workspace root, `packages/types` (WsMessage discriminated union, role enums, ULID helpers), Prisma schema (all models + initial migration), Hono server scaffold, Vite/Vue SPA scaffold, all Dockerfile + deploy reference configs (Caddy, nginx, Traefik, docker-compose), pino + prom-client skeleton, `.env.example` files, zod-validated env module

---

### Epic 2: Authentication & Access Control

Authorized viewers — both company domain users and individually allowlisted guests — can sign in with Google and access the platform. Unauthorized visitors are gracefully rejected. The admin can manage who has access (domain allowlist, individual email allowlist, bans) entirely via CLI, with changes taking immediate effect on active sessions.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR41, FR42, FR43, FR44

---

### Epic 3: Live Video Stream

Viewers can watch Manly live in their browser with clear stream state communication at all times. The admin can start/stop the stream and adjust camera settings from any device, on any screen size. The Pi agent tunnels the camera feed through frp, and the upstream server transcodes and relays it to all viewers — handling tunnel drops and state transitions gracefully.

**FRs covered:** FR9, FR10, FR11, FR12, FR13, FR14, FR15, FR52, FR53
**Note:** FR45, FR46, FR47, FR48 moved to Epic 6 — Pi setup is now an install script + systemd services, not a story within Epic 3

---

### Epic 4: Real-Time Chat & Presence

Viewers can chat alongside the stream in real time, see who else is watching, receive unread message notifications when the sidebar is collapsed, scroll back through chat history, and edit or delete their own messages — all delivered over a persistent WebSocket connection.

**FRs covered:** FR16, FR17, FR18, FR19, FR20, FR21, FR22, FR23, FR24, FR25

---

### Epic 5: Moderation, Roles & User Management

Moderators can maintain a healthy chat environment by muting, banning, and deleting messages — with all actions audit-logged and bans taking immediate effect on active sessions. The admin can manage the full role hierarchy, assign custom UserTags (text + color), and review the complete user roster.

**FRs covered:** FR26, FR27, FR28, FR29, FR30, FR31, FR32, FR33, FR34, FR35, FR36, FR37, FR38, FR39, FR40

---

### Epic 6: Pi Operational Tooling

Any operator can bootstrap a Raspberry Pi Zero W 2 as a ManlyCam camera node from scratch using a single install script. The script installs frpc and mediamtx, configures each with correct defaults for ManlyCam, and registers both as systemd services. WiFi configuration is handled by the operator's tool of choice (wifi-connect is one option, documented as optional). Complete documentation covers initial setup, service management, troubleshooting, and clean uninstall.

**FRs covered:** FR45, FR46, FR47, FR48, FR50, FR51

---

### Epic 7: Post-MVP UX Redesign & Feature Additions

The web UI shell is redesigned from the hover-overlay model to the Broadcast Console + Atmospheric Void layout approved by the UX designer. All existing functionality (admin toggle, stream start/stop, chat toggle, profile menu) is preserved but relocated into the persistent Broadcast Console strip. Five post-MVP features are delivered alongside: an editable stream title, a client-side snapshot button, an optional PiSugar battery monitor for admin users, and a resizable chat sidebar using Reka-UI Splitter.

**FRs covered:** FR57, FR58, FR59 _(FR56 deferred per sprint-change-proposal-2026-03-12.md)_
**Approved via:** sprint-change-proposal-2026-03-12.md

**Stories:**

- 7-1: UX Shell Redesign — Broadcast Console + Atmospheric Void _(must be first; all others depend on BroadcastConsole existing)_
- 7-3: Camera Snapshot Button (Client-Side Frame Capture)
- 7-4: PiSugar Battery Monitor (Server TCP Poller + Admin UI)
- 7-5: Resizable Chat Sidebar via Reka-UI Splitter

---

### Epic 8: Chat Enhancement & Engagement

Transform the chat experience from basic messaging into a rich, engaging communication platform with emoji support, reactions, mentions, enhanced markdown formatting, browser notifications, and extensible slash commands.

**FRs covered:** FR60, FR61, FR62, FR63, FR64, FR65

**Dependencies:**

- Story 8-3 depends on 8-2 (notifications include mention triggers)
- Story 8-6 depends on 8-5 (reactions reuse emoji picker)

**Stories:**

- 8-1: Expanded Markdown & Multiline Support _(no dependencies)_
- 8-2: @Mentions & Highlighting _(no dependencies)_
- 8-3: Browser Notifications & Preferences _(depends on 8-2)_
- 8-4: Programmable Slash Commands _(no dependencies)_
- 8-5: Emoji Picker Component _(no dependencies)_
- 8-6: Message Reactions _(depends on 8-5)_

---

### Epic 9: Admin Tooling & UX Enhancements

Quality-of-life improvements across admin tooling, stream UX, and chat customisation. Delivers a web-based allowlist management UI, an audit log viewer, users list enhancements, camera settings improvements, stream pinch-to-zoom, and a customisable offline message with Fluent Emoji support.

**Stories:**

- 9-1: Camera Settings Enhancements
- 9-2: Allowlist Management Web UI
- 9-3: Audit Log Viewer
- 9-4: Users List Enhancements
- 9-5: Stream Scroll / Pinch-to-Zoom
- 9-6: Fluent Emoji + Customisable Offline Message

---

### Epic 10: Clipping & Clip Sharing

Users can clip segments from the rolling server-side HLS buffer, manage clips through a per-account My Clips dialog (accessible from the profile popover) with three-tier visibility (private, shared, public), share clips into the chat timeline as a rich clip card, view clips in a modal overlay without leaving the stream, and share public clips externally via shareable pages with OG social meta tags. S3-compatible storage (Backblaze B2 in production, RustFS in development) stores all clip assets.

**FRs covered:** FR66, FR67, FR68, FR69, FR70, FR71, FR72, FR73

**Dependencies:**

- All implementation stories depend on 10-1 (dev docs must land before any implementation begins)
- 10-3 depends on 10-2 (infrastructure)
- 10-4 depends on 10-2
- 10-5 depends on 10-3 (clip records must exist)
- 10-6 depends on 10-2 and 10-3
- 10-7 closes the epic (no implementation dependency, but should come last)

**Stories:**

- 10-1: Dev Environment Documentation _(must be first; unblocks all implementation)_
- 10-2: Clipping Infrastructure (HLS buffer, shared volume, ffmpeg, S3 client, Prisma Clip model)
- 10-3: Clip Creation Pipeline (endpoint, ffmpeg, S3 upload, rate limiting, Sonner, GET+download endpoints) _(depends on 10-2)_
- 10-3b: Clip Editor UI (stream-integrated timeline scrubber, HLS player swap, drag handles, min/max duration config, HLS proxy route) _(supersedes 10-3 AC #2; depends on 10-3)_
- 10-4: My Clips Dialog (clip management via profile-menu dialog, visibility + ACL, audit logging, shared clips toggle, deletion, download) _(depends on 10-2)_
- 10-5: Chat Clip Integration (clip message type, Watch modal, tombstone, live visibility updates, download) _(depends on 10-3)_
- 10-6: Public Clip Pages (unauthenticated route, OG meta injection, clipper attribution, stream-status CTA, download) _(depends on 10-2, 10-3)_
- 10-7: Production Deployment Documentation _(closes epic)_

---

## Epic 1: Monorepo Foundation & CI/CD

The development team can scaffold, build, test, and deploy all three components of ManlyCam from a single repository.

### Story 1.1: Initialize Monorepo with Application Scaffolds and Shared Types

As a **developer**,
I want the monorepo workspace initialized with all three application scaffolds and the shared types package,
So that all subsequent development has a consistent, dependency-linked foundation to build on.

**Acceptance Criteria:**

**Given** a fresh clone of the repository
**When** `pnpm install` is run from the repo root
**Then** all workspace packages resolve without errors (`apps/agent`, `apps/server`, `apps/web`, `packages/types`)

**Given** the monorepo is initialized
**When** `packages/types/src/ws.ts` is inspected
**Then** it exports the full `WsMessage` discriminated union (12 message types: `chat:message`, `chat:edit`, `chat:delete`, `stream:state`, `presence:join`, `presence:leave`, `typing:start`, `typing:stop`, `session:revoked`, `moderation:muted`, `moderation:unmuted`, `user:update`), role enums as `const` + `as const` objects, and stream state types

**Given** a TypeScript file in `apps/server`
**When** it imports from `packages/types`
**Then** the import resolves correctly via pnpm workspace linking and `tsconfig` paths

**Given** `apps/server` is scaffolded
**When** `pnpm --filter apps/server dev` is run
**Then** the Hono server starts on the configured port with the health endpoint responding `{ ok: true }` at `GET /api/health`

**Given** `apps/web` is scaffolded
**When** `pnpm --filter apps/web dev` is run
**Then** the Vite dev server starts and serves the Vue 3 SPA root

**Given** `apps/agent` is initialized
**When** `go build ./...` is run from `apps/agent/`
**Then** the Go binary compiles without errors

**And** `src/lib/ulid.ts` in `apps/server` exports a single `ulid` function powered by `monotonicFactory()` from `ulidx` — all other modules import from this file, never from `ulidx` directly

**And** `src/db/client.ts` in `apps/server` exports a single `PrismaClient` instance — no other file calls `new PrismaClient()`

**And** `src/env.ts` in `apps/server` exports a zod-validated env object covering all required env vars (`PORT`, `BASE_URL`, `DATABASE_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `HLS_SEGMENT_PATH`, `FRP_STREAM_PORT`, `FRP_API_PORT`, `AGENT_API_KEY`, `PET_NAME`, `SITE_NAME`) — server fails to start with a descriptive error if any required var is missing

---

### Story 1.2: Configure Prisma Schema with All Data Models and Initial Migration

As a **developer**,
I want the complete Prisma schema defined with all data models and an initial migration applied,
So that the database is ready to support all application features from the start.

**Acceptance Criteria:**

**Given** `DATABASE_URL` points to a running PostgreSQL instance
**When** `pnpm prisma migrate dev --name init` is run
**Then** all tables are created: `users`, `sessions`, `allowlist_entries`, `messages`, `audit_log`

**Given** the schema is applied
**When** the `users` table is inspected
**Then** it has columns: `id CHAR(26)` (PK, no DB default), `google_sub TEXT UNIQUE`, `email TEXT UNIQUE`, `display_name TEXT`, `avatar_url TEXT`, `role TEXT` (Admin/Moderator/ViewerCompany/ViewerGuest), `user_tag_text TEXT`, `user_tag_color TEXT`, `muted_at TIMESTAMPTZ`, `banned_at TIMESTAMPTZ`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `last_seen_at TIMESTAMPTZ`

**Given** the schema is applied
**When** the `sessions` table is inspected
**Then** it has columns: `id CHAR(26)` (PK), `user_id CHAR(26)` (FK → users), `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `expires_at TIMESTAMPTZ NOT NULL`

**Given** the schema is applied
**When** the `messages` table is inspected
**Then** it has columns: `id CHAR(26)` (PK), `user_id CHAR(26)` (FK), `content TEXT NOT NULL`, `edit_history JSONB`, `updated_at TIMESTAMPTZ`, `deleted_at TIMESTAMPTZ`, `deleted_by CHAR(26)` (FK → users), `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

**Given** the schema is applied
**When** the `audit_log` table is inspected
**Then** it has columns: `id CHAR(26)` (PK), `action TEXT NOT NULL`, `actor_id CHAR(26)` (FK → users), `target_id TEXT` (nullable), `metadata JSONB`, `performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` — no `updated_at`, no `deleted_at` (append-only)

**And** all models use explicit `@@map` to snake_case table names and `@map` on all FK/multi-word columns

**And** no model has a DB-generated default for `id` — IDs are always set in the service layer before `prisma.model.create()`

**And** all timestamp columns use `@db.Timestamptz` — no `DateTime` without timezone

---

### Story 1.3: Set Up GitHub Actions CI/CD Pipelines

As a **developer**,
I want path-filtered GitHub Actions workflows for all three components,
So that each component can be built, tested, and released independently when its code changes.

**Acceptance Criteria:**

**Given** a commit is pushed that modifies files under `apps/agent/`
**When** the agent CI workflow runs
**Then** it runs `go vet ./...`, runs `go test ./...`, cross-compiles for `GOOS=linux GOARCH=arm GOARM=7`, and creates a GitHub Release with the binary artifact when a semver tag is pushed — the artifact contains no credentials or hardcoded server addresses

**Given** a commit is pushed that modifies files under `apps/server/`
**When** the server CI workflow runs
**Then** it runs ESLint, runs `tsc --noEmit`, runs Vitest, builds the Docker image (Node.js + ffmpeg), and pushes to the configured registry tagged with commit SHA and `latest`

**Given** a commit is pushed that modifies files under `apps/web/`
**When** the web CI workflow runs
**Then** it runs ESLint, runs `tsc --noEmit`, runs Vitest, runs `vite build`, builds the Docker image (nginx:alpine serving `dist/`), and pushes to the configured registry tagged with commit SHA and `latest`

**Given** a commit is pushed that modifies only `packages/types/`
**When** the types CI workflow runs
**Then** it runs `tsc --noEmit` only — no Docker build, no release artifact

**And** each workflow is path-filtered so only the changed component's workflow fires on a given commit

**And** no workflow embeds secrets in build artifacts — all sensitive values are injected at runtime via environment variables

**Note — Unplanned Follow-up:**
During implementation of this story, CI workflows required ESLint configuration that was not part of the original story scope. Story 1-3b was created to address this blocking issue. Both stories are now complete and dependencies are resolved.

---

### Story 1-3b: Configure ESLint Root Config with Modern Setup

**Status:** done

**Context:**
Story 1-3 created CI/CD workflows that invoke lint scripts (`pnpm --filter @manlycam/server lint`, `pnpm --filter @manlycam/web lint`), but no ESLint configuration existed at the project root. This story was created as an unplanned follow-up to unblock linting in CI.

**Summary:**
Configure ESLint at the project root with a modern, opinionated setup: airbnb-base + @typescript-eslint + Prettier. The root config applies globally to all apps/packages; per-app `tsconfig.json` overrides ensure type-aware linting for each app's specific TypeScript target.

**Acceptance Criteria:**

- **AC1:** Root ESLint config file exists and is syntactically valid
- **AC2:** ESLint parser correctly resolves TypeScript for .ts/.tsx files
- **AC3:** Server and Web lint without violations
- **AC4:** Prettier integration detects code style issues
- **AC5:** CI workflows pass lint stage
- **AC6:** Airbnb-base rules are enforced across codebase

**Key Implementation Details:**

- Root `.eslintrc.json` with airbnb-base + @typescript-eslint/recommended + Prettier extends
- Per-app `tsconfig.json` overrides for type-aware linting
- Dependencies added to root `package.json`: eslint 9.x, @typescript-eslint 7.x+, prettier 3.x, airbnb-base, and plugins
- Enforcement from Epic 1 onward; all code must pass lint before merge

**Rationale:**
Early code quality enforcement prevents technical debt. Opinionated rule set (airbnb-base) ensures consistency across monorepo. Type-aware linting catches subtle bugs; Prettier integration eliminates formatting disputes.

---

### Story 1.4: Create Deployment Reference Configs and Environment Templates

As a **developer deploying ManlyCam**,
I want complete deployment reference configurations and environment templates,
So that I can get the server running in production with my choice of reverse proxy with minimal configuration effort.

**Acceptance Criteria:**

**Given** the repo is cloned on a fresh server
**When** `apps/server/deploy/docker-compose.yml` is used
**Then** running `docker compose up` starts `server` (Hono + ffmpeg) and `postgres` containers, with all required env vars documented in the compose file comments

**Given** Caddy is the chosen reverse proxy
**When** `apps/server/deploy/Caddyfile` is used
**Then** it configures: automatic TLS via Let's Encrypt, proxying `/api` and `/ws` to the Hono server, and serving `apps/web/dist/` as the static SPA root

**Given** nginx is the chosen reverse proxy
**When** `apps/server/deploy/nginx.conf` is used
**Then** it configures: TLS termination, static SPA serving for `apps/web/dist/`, and proxy to Hono for `/api` + `/ws` — including correct WebSocket upgrade headers

**Given** Traefik is the chosen reverse proxy
**When** `apps/server/deploy/traefik/docker-compose.yml` and `traefik.yml` are used
**Then** Traefik provides Docker-native auto-TLS via Let's Encrypt with label-based routing to the server container

**Given** a new developer needs to set up the local environment
**When** they copy `apps/server/.env.example` to `.env`
**Then** the file contains all required env vars with safe placeholder values and inline comments explaining each one — including `PET_NAME` and `SITE_NAME`

**And** `apps/agent/deploy/config.example.toml` exists with all config fields annotated, showing the `[stream]`, `[frp]`, and `[update]` sections

**And** `apps/server/deploy/manlycam-server.service` is a working systemd unit file for bare-metal deployment without Docker

**Note — frps Configuration:**
This story includes server-side frp (fast reverse proxy) configuration examples at `apps/server/deploy/frps.toml`. The frps server listens for connections from the Pi agent (`frpc`) and exposes two tunnels:

- **Stream tunnel** (port 11935): Pi rpicam-vid output → upstream ffmpeg ingestion
- **API tunnel** (port 11936): Upstream Hono backend → Pi agent local HTTP server (camera control)

Configuration files provided for:

- Docker Compose variant: `apps/server/deploy/frps.toml`
- Traefik variant: `apps/server/deploy/traefik/frps.toml` (identical)

Both docker-compose files include frps service (`snowdreamtech/frps:latest`) with mounted config. Complete setup instructions are documented in the story 1-4 implementation artifact.

---

## Epic 2: Authentication & Access Control

Authorized viewers can sign in with Google and access the platform. Unauthorized visitors are gracefully rejected. The admin can manage access via CLI with changes taking immediate effect on active sessions.

### Story 2.1: Landing Page and Google OAuth Sign-In Flow

As an **unauthenticated visitor**,
I want to see a friendly landing page and sign in with my Google account in one click,
So that I can access the stream without creating a new account or remembering a password.

**Acceptance Criteria:**

**Given** a user visits `/` with no active session
**When** the page loads
**Then** `LoginView.vue` renders with: the configured `SITE_NAME` and `PET_NAME` in the heading, a brief explanation that this is a private stream, and a single "Sign in with Google" button — no other form fields or UI

**Given** the user clicks "Sign in with Google"
**When** the OAuth redirect completes
**Then** `GET /api/auth/google` initiates the Google OAuth flow with scopes `openid email profile`

**Given** Google completes the OAuth flow
**When** `GET /api/auth/google/callback` is called
**Then** the server exchanges the code for tokens, fetches the user profile (display name, email, avatar URL), and proceeds to the allowlist check

**Given** the server validates the OAuth callback
**When** a new session is created
**Then** an `httpOnly SameSite=Strict Secure` cookie named `session_id` is set with the session ULID — the value is never exposed to JavaScript

**Given** a user has a valid active session
**When** they visit `/`
**Then** `App.vue` detects the session via `GET /api/me` and renders `WatchView.vue` — `LoginView.vue` is never shown

**And** the `GET /api/me` response shape is `{ id, displayName, email, role, avatarUrl, bannedAt: null, mutedAt: null }` — all optional fields are explicit `null`, never omitted

---

**Post-completion note (2026-03-07):** Story 2.1 was implemented and marked done before the design system gap was identified. `LoginView.vue` satisfies all functional acceptance criteria but does not yet match the UX specification visually — it was built on a bare Vite/Vue scaffold with no Tailwind, ShadCN-vue, or CSS custom properties in place. Story 2.1b addresses this gap and includes restyling `LoginView.vue` to match the spec.

---

### Story 2.1b: Design System Foundation and Landing Page Polish

As a **developer**,
I want Tailwind v3, ShadCN-vue, and the project's CSS custom property theme established in apps/web,
So that all current and future UI stories build on a consistent, spec-aligned design system from this point forward.

**Acceptance Criteria:**

**Given** `apps/web/package.json` is inspected
**When** dependencies are reviewed
**Then** `tailwindcss@^3` (pinned), `@tailwindcss/vite`, `autoprefixer`, and `tailwind-merge` are present; `apps/web/tailwind.config.js` exists with `darkMode: 'class'` and content paths covering `src/**/*.{vue,ts}`; ShadCN-vue has been initialized (`components.json` present, `apps/web/src/components/ui/` contains at least `Button.vue` and `Avatar.vue`, `src/lib/utils.ts` exports `cn()`)

**Given** `apps/web/src/assets/main.css` is inspected
**When** its contents are reviewed
**Then** it contains Tailwind directives and defines CSS custom properties for the Discord-warmed dark palette per the UX spec (at minimum: `--background`, `--foreground`, `--card`, `--card-foreground`, `--primary`, `--primary-foreground`, `--muted`, `--muted-foreground`, `--border`, `--ring`, `--radius`) in both `:root` (light) and `.dark` overrides

**Given** the user has no system dark/light preference (`prefers-color-scheme` unset or `no-preference`)
**When** the app loads for the first time
**Then** the `.dark` class is applied to `<html>` by default

**Given** the user has previously toggled the theme
**When** the app loads
**Then** `localStorage.getItem('theme')` is read and the correct class applied before first paint — no flash of incorrect theme on reload

**Given** `prefers-color-scheme: light` is active in the user's OS
**When** the app loads for the first time (no `localStorage` override)
**Then** light mode is applied

**Given** `prefers-reduced-motion: reduce` is set
**When** any CSS transition or animation runs
**Then** all transitions and animations in the design system are suppressed via `@media (prefers-reduced-motion: reduce)` in `main.css`

**Given** an unauthenticated user visits `/`
**When** `LoginView.vue` renders
**Then** the page reflects the UX spec: warm dark background, centered card layout, `SITE_NAME` in a prominent heading, `PET_NAME` referenced in copy, a styled "Sign in with Google" button using the ShadCN `Button` component — not a bare `<button>` — and the overall aesthetic matches the warm/cozy tone specified in the UX design specification

**And** `apps/web/public/favicon.svg` exists (placeholder SVG acceptable; final Manly tooth SVG is a post-MVP design asset) and `index.html` links to it

**And** `apps/web/src/main.ts` imports `./assets/main.css` as the global stylesheet

---

### Story 2.1c: Test Coverage Audit and Baseline Enforcement

As a **developer**,
I want the test suite audited for critical-path coverage gaps, those gaps covered, and the resulting percentages enforced as CI thresholds,
So that coverage cannot silently degrade in future stories and the thresholds reflect genuine confidence in user-critical behavior.

**Acceptance Criteria:**

**Given** `vitest run --coverage` is executed across `apps/server` and `apps/web`
**When** the coverage report is reviewed
**Then** all untested or under-tested paths in the following categories are identified and documented: Google OAuth callback and token validation, allowlist enforcement logic, session creation and middleware, role/permission checks on protected routes, and any other path directly affecting a user's ability to authenticate or access the stream

**Given** the identified coverage gaps have been documented
**When** new tests are written to address them
**Then** each critical-path gap from the audit has at minimum one test covering the happy path and one covering the primary failure/rejection path; tests are co-located (`*.test.ts`) and follow existing test conventions

**Given** the new tests are committed and `vitest run --coverage` is re-run
**When** the resulting coverage percentages are recorded
**Then** `apps/server/vite.config.ts` (or `vitest.config.ts`) and `apps/web/vite.config.ts` define `test.coverage.thresholds` for lines, functions, branches, and statements at or below the recorded values; `@vitest/coverage-v8` is installed as a dev dependency in the relevant packages

**Given** the coverage thresholds are configured
**When** `pnpm --filter @manlycam/server test` or `pnpm --filter @manlycam/web test` is run with coverage below any threshold
**Then** the process exits non-zero, causing the CI job to fail

**Given** `server-ci.yml` and `web-ci.yml` are inspected
**When** the test step is reviewed
**Then** both workflows run `vitest run --coverage` (or equivalent) rather than bare `vitest run`, ensuring coverage collection and threshold enforcement occur on every CI run

**Notes:**

- The goal of this story is a meaningful baseline — not a high number. If the audit produces 58% line coverage after covering critical paths, 58% is the right threshold.
- `@vitest/coverage-v8` is preferred over Istanbul: no instrumentation overhead, accurate branch tracking with native V8.
- Agent (`apps/agent`) uses `go test`; Go coverage tooling (`-coverprofile`) is out of scope for this story.

---

### Story 2.2: Allowlist Enforcement and Rejection Handling

As **the system**,
I want to enforce allowlist rules at registration time and reject unauthorized users clearly,
So that only approved viewers can ever reach the stream or chat.

**Acceptance Criteria:**

**Given** the OAuth callback completes for a new user
**When** the server performs the allowlist check
**Then** it checks in order: (1) is the user's email domain in the domain allowlist? (2) is the user's full email in the individual allowlist? — if either matches, registration proceeds; if neither matches, the user is rejected

**Given** a new user passes the allowlist check
**When** the user record is created
**Then** a `users` row is inserted with a server-generated ULID, `role` set to `ViewerCompany` (domain match) or `ViewerGuest` (individual email match), and the user's Google profile data — then the browser is redirected to `/`

**Given** a new user fails the allowlist check
**When** rejection is determined
**Then** no `users` row is created, no session is created, and the browser is redirected to `/rejected`

**Given** a user lands on `/rejected`
**When** the page renders
**Then** `RejectedView.vue` displays a friendly message explaining the stream is invite-only — no session is required to view this page, and no retry mechanism is shown

**Given** a returning user (existing `users` row) completes OAuth
**When** the login flow runs
**Then** the allowlist check is skipped entirely — only `banned_at IS NULL` is checked; if `banned_at` is set, the user is redirected to `/banned`; otherwise a new session is created and `last_seen_at` is updated

**And** if the returning user's Google profile (display name or avatar URL) has changed since last login, the `users` row is upserted with the new values and a `{ type: 'user:update', payload: UserProfile }` WebSocket message is broadcast to all connected clients

---

### Story 2.3: Session Persistence and Auth Middleware

As an **authorized viewer**,
I want my session to persist across visits,
So that I can return to the stream without re-authenticating every time.

**Acceptance Criteria:**

**Given** an authenticated user closes and reopens the browser
**When** they visit `/`
**Then** `GET /api/me` returns their user profile (session cookie is still valid) and `WatchView.vue` renders — no OAuth redirect occurs

**Given** an authenticated user makes any request to a protected route
**When** the `requireSession` middleware runs
**Then** it: (1) reads `session_id` from the cookie, (2) looks up the session in the `sessions` table, (3) checks `expires_at > NOW()`, (4) checks `users.banned_at IS NULL` — all four must pass or the middleware returns `401 { error: { code: 'UNAUTHORIZED', message: '...' } }`

**Given** a request arrives with a banned user's valid session
**When** `requireSession` runs
**Then** it returns `401 { error: { code: 'BANNED', message: '...' } }` — the SPA client reacts by redirecting to `/banned`

**Given** `POST /api/auth/logout` is called
**When** the handler runs
**Then** the `sessions` row is deleted, the `session_id` cookie is cleared (expired), and `{ ok: true }` is returned

**Given** a `requireRole(['Admin'])` middleware-protected route is accessed by a `ViewerCompany` user
**When** the middleware evaluates the role
**Then** the server returns `403 { error: { code: 'FORBIDDEN', message: '...' } }`

**And** sessions expire 30 days after creation (`expires_at = NOW() + 30 days`) — no sliding expiry; re-authentication required after expiry

---

### Story 2.4: Avatar Resolution and Gravatar Fallback

As an **authorized viewer**,
I want my Google profile picture to appear next to my chat messages and in my profile menu,
So that I'm recognizable to coworkers without any setup.

**Acceptance Criteria:**

**Given** a user logs in and Google provides a profile picture URL
**When** the user record is created or updated
**Then** `avatar_url` is set to the Google-provided URL

**Given** a user logs in and Google does not provide a profile picture
**When** the user record is created
**Then** `avatar_url` is set to the Gravatar URL derived from the MD5 hash of the lowercased, trimmed email address, with `?d=identicon&s=128` query params

**Given** `GET /api/me` is called
**When** the response is returned
**Then** `avatarUrl` is always a non-null string — either the Google URL or the Gravatar URL; it is never `null` or omitted

---

### Story 2.5: CLI Allowlist and Ban Management

As **the admin**,
I want to manage the domain allowlist, individual email allowlist, and user bans from the CLI,
So that I can control access to the platform without needing to use a web UI.

**Acceptance Criteria:**

**Given** the admin CLI is installed
**When** `manlycam-admin allowlist add-domain company.com` is run
**Then** `company.com` is added to the `allowlist_entries` table with `type = 'domain'`, and future users with `@company.com` emails are admitted on first login

**Given** `manlycam-admin allowlist remove-domain company.com` is run
**When** it executes
**Then** the domain entry is removed — existing registered users are not affected (allowlist gates registration only)

**Given** `manlycam-admin allowlist add-email guest@gmail.com` is run
**When** it executes
**Then** an individual email entry is added to `allowlist_entries` with `type = 'email'`

**Given** `manlycam-admin allowlist remove-email guest@gmail.com` is run
**When** it executes
**Then** the individual email entry is removed — the user's existing account is not deleted

**Given** `manlycam-admin users ban user@company.com` is run
**When** it executes
**Then** in a single `prisma.$transaction()`: `users.banned_at` is set to `NOW()`, AND all `sessions` rows for that user are deleted — the operation is atomic

**Given** a banned user has an active WebSocket connection
**When** their sessions are deleted
**Then** the WS hub detects the missing session on the next heartbeat and sends `{ type: 'session:revoked', payload: { reason: 'banned' } }` to that user's connection — the client immediately redirects to `/banned`

**Given** `manlycam-admin users unban user@company.com` is run
**When** it executes
**Then** `users.banned_at` is set to `NULL` — the user can log in again on their next OAuth attempt

**And** all CLI commands produce human-readable output confirming the action taken (e.g. `✓ Domain company.com added to allowlist`)

---

## Epic 3: Live Video Stream

Viewers can watch Manly live in their browser with clear stream state communication at all times. The admin can start/stop the stream and adjust camera settings from any device. The Pi agent tunnels the camera feed through frp; the upstream server transcodes to HLS and relays to all viewers — handling tunnel drops and state transitions gracefully.

### Story 3.1: Pi Agent — Camera Pipeline and frp Tunnels

As **the admin**,
I want the Pi agent to launch the camera pipeline and maintain frp tunnels to the upstream server on boot,
So that the stream is available automatically whenever the Pi is powered on and connected.

**Acceptance Criteria:**

**Given** the Pi agent starts with a valid `config.toml`
**When** the boot sequence runs
**Then** the agent reads `[stream]` config, constructs and launches an `rpicam-vid` subprocess with the configured `width`, `height`, `framerate`, `codec`, `hflip`, `vflip`, and `output_port` — the exact constructed command args are verifiable via `go test` without hardware

**Given** `rpicam-vid` is running
**When** it produces H.264 MPEG-TS output
**Then** the agent pipes it to a TCP listener on `output_port` for the frp stream tunnel to forward

**Given** the agent has started
**When** the frp stream proxy tunnel connects to the upstream server
**Then** the frp client maintains a persistent tunnel on `[frp].server_addr:server_port` using the configured `auth_token` — stream data flows over this single outbound connection

**Given** the agent has started
**When** the frp API proxy tunnel connects
**Then** a second persistent tunnel exposes the agent's local HTTP port (8080) to the upstream server on `FRP_API_PORT` — this enables camera control commands from the backend

**Given** the `rpicam-vid` subprocess crashes
**When** the agent detects the exit
**Then** the agent restarts the subprocess automatically without restarting the frp tunnels

**Given** the frp tunnel connection drops
**When** the agent detects the disconnect
**Then** the agent reconnects with exponential backoff — no manual intervention required

**Given** the agent binary is deployed
**When** it is inspected
**Then** it contains no hardcoded server addresses, tokens, or credentials — all sensitive values are read exclusively from `/etc/manlycam/config.toml` at startup

**And** the systemd unit (`manlycam-agent.service`) is configured with `Restart=on-failure` and `RestartSec=5s` so crashes recover automatically without manual intervention

---

### Story 3.2: Server — frp Stream Ingestion and HLS Transcoding

As a **viewer**,
I want the server to receive the Pi's camera stream and make it available as HLS,
So that I can watch the stream in any modern browser without a plugin.

**Acceptance Criteria:**

**Given** the frp stream tunnel is connected and `rpicam-vid` is sending MPEG-TS
**When** the server's ffmpeg process ingests from `tcp://0.0.0.0:{FRP_STREAM_PORT}`
**Then** ffmpeg transcodes to HLS: 2-second segments, 5-segment rolling window, written to `HLS_SEGMENT_PATH`

**Given** HLS segments are being written to `HLS_SEGMENT_PATH`
**When** `GET /hls/stream.m3u8` is requested by an authenticated viewer
**Then** the current HLS playlist is served with `Cache-Control` headers matching the segment duration (2s)

**Given** `GET /hls/{segment}.ts` is requested
**When** the segment file exists in `HLS_SEGMENT_PATH`
**Then** it is served with content-type `video/MP2T`

**Given** the Pi tunnel disconnects (Pi powered off or network loss)
**When** the server detects the frp connection drop
**Then** the server updates stream state to `unreachable`, broadcasts `{ type: 'stream:state', payload: { state: 'unreachable', adminToggle: 'live' } }` via WebSocket to all connected clients, and the Hono server does not crash or lose other active connections

**Given** the Pi reconnects after a drop
**When** the frp tunnel re-establishes and ffmpeg resumes ingestion
**Then** new segments are generated and the server broadcasts `{ type: 'stream:state', payload: { state: 'live' } }` to all connected clients

**And** HLS segment files are ephemeral — cleared on server restart, never persisted beyond `HLS_SEGMENT_PATH`; a tmpfs ramdisk mount at `HLS_SEGMENT_PATH` is documented in the deployment reference configs

---

### Story 3.3: SPA Shell, Stream Player, and 4-State UI

As a **viewer**,
I want to see the live stream immediately after signing in, with honest state communication at all times,
So that I always know whether Manly is live, temporarily unavailable, or intentionally offline.

**Acceptance Criteria:**

**Given** an authenticated user loads the app
**When** `WatchView.vue` renders
**Then** the three-column layout renders: left sidebar (hidden for non-admin), `StreamPlayer.vue` filling remaining space edge-to-edge with no padding on the video element, and right sidebar (chat panel)

**Given** `StreamPlayer.vue` mounts
**When** stream state is `live`
**Then** `hls.js` attaches to the `<video>` element, begins loading segments from `/hls/stream.m3u8`, and auto-plays without user interaction — `<StreamStatusBadge>` shows green pulse dot + `"{PET_NAME} is live"`

**Given** stream state is `connecting`
**When** `StreamPlayer.vue` renders before the first segment loads
**Then** a `<Skeleton>` at 16:9 ratio is shown and `<StreamStatusBadge>` shows amber static dot + "Connecting…"

**Given** stream state is `unreachable` with admin toggle set to `live`
**When** the `stream:state` WebSocket message arrives
**Then** `<StateOverlay>` renders the temporary-downtime variant: dark frosted overlay + amber spinner + "Trying to reconnect…" — no user action required

**Given** stream state is `explicit-offline` (admin toggled off)
**When** the `stream:state` WebSocket message arrives
**Then** `<StateOverlay>` renders the explicit-offline variant: centered 😴 + `"{PET_NAME} needs their Zzzs"` + "The stream is offline for now. Check back later." — no spinner, no retry

**Given** the browser window is resized below the `lg` (1024px) breakpoint
**When** the layout recalculates
**Then** the layout transitions to the mobile shell — stream fills full viewport width, sidebars collapse — without a page reload

**And** the `<video>` element has `role="img"` and `aria-label="Live stream of {PET_NAME}"` — stream state changes are announced via `aria-live="polite"` on the status badge container

**And** `GET /api/stream/state` is called on initial page load to hydrate stream state before the WebSocket connection is established — the SPA does not wait for a WS message to determine initial state

---

### Story 3.4: WebSocket Hub and Real-Time State Broadcasting

As a **viewer**,
I want stream state changes to appear instantly in my browser without refreshing,
So that I always see the current stream status in real time.

**Acceptance Criteria:**

**Given** an authenticated user connects to `GET /ws`
**When** the WebSocket upgrade handshake occurs
**Then** the server validates the `session_id` cookie (same `requireSession` logic as REST), registers the connection in the hub registry with a ULID connection ID, and the client receives the current stream state as the first outbound message

**Given** the WS hub has multiple connected clients
**When** `broadcast(msg: WsMessage)` is called
**Then** all registered connections receive the message via the in-process `EventEmitter` fan-out

**Given** a client's WebSocket connection closes (tab closed, network loss)
**When** the `close` event fires on the server
**Then** the connection is removed from the registry immediately — no orphaned entries accumulate

**Given** a client reconnects after a drop
**When** the WS upgrade completes
**Then** the client receives the current stream state immediately as the first message — it does not rely on a prior cached state

**Given** an unauthenticated request hits `GET /ws`
**When** the upgrade is attempted
**Then** the server rejects with `401` — no WebSocket connection is established

**And** `useWebSocket.ts` in the SPA implements exponential backoff reconnection on close events — the composable is provided at app root via `provide()` and injected by child components via `inject()`; components never call WS `send()` directly

---

### Story 3.5: Admin Stream Start/Stop Toggle

As **the admin**,
I want to start and stop the stream from the web UI on any device,
So that I can control stream availability without SSH or CLI access.

**Acceptance Criteria:**

**Given** the admin is authenticated and the stream page renders
**When** `WatchView.vue` evaluates the user's role
**Then** a stream start/stop toggle control is visible in the admin area — this control is not rendered for Moderator, ViewerCompany, or ViewerGuest roles

**Given** the admin clicks "Stop Stream"
**When** `POST /api/stream/stop` is called
**Then** the server sets the admin toggle to `offline` in the database, broadcasts `{ type: 'stream:state', payload: { state: 'explicit-offline' } }` to all connected WebSocket clients, and returns `{ ok: true }`

**Given** the admin clicks "Start Stream"
**When** `POST /api/stream/start` is called
**Then** the server sets the admin toggle to `live` in the database; if Pi tunnel is connected → broadcasts `{ state: 'live' }`; if disconnected → broadcasts `{ state: 'unreachable', adminToggle: 'live' }` — returns `{ ok: true }` in both cases

**Given** a non-admin calls `POST /api/stream/start` or `POST /api/stream/stop`
**When** `requireRole(['Admin'])` middleware evaluates
**Then** `403 { error: { code: 'FORBIDDEN', message: '...' } }` is returned — stream state is unchanged

**And** the admin toggle state (`live` | `offline`) is persisted to the database so it survives server restarts — the stream does not auto-start on server reboot if the admin had stopped it

---

### Story 3.6: Admin Camera Controls Sidebar

As **the admin**,
I want to adjust camera settings from the web UI and see the effect live in the stream,
So that I can get the best picture without SSH or physical access to the Pi.

**Acceptance Criteria:**

**Given** the admin hovers over the stream on desktop
**When** the profile avatar appears (bottom-left overlay)
**Then** clicking it opens a profile popover containing a "Camera Controls" menu item — this item is absent for non-admin roles

**Given** the admin clicks "Camera Controls"
**When** the left sidebar opens
**Then** `CameraControls.vue` renders within `AdminPanel.vue` with sliders for brightness, contrast, saturation, sharpness, and switches for Auto Exposure and Auto White Balance

**Given** the admin adjusts a control
**When** the slider or toggle value changes
**Then** `POST /api/camera/control { control: string, value: number | string }` fires immediately — no save button; changes apply in real time

**Given** `POST /api/camera/control` is received by the server
**When** validated (Admin role required via `requireRole(['Admin'])`)
**Then** the server proxies the v4l2-ctl command to the Pi agent via the frp API tunnel and returns `{ ok: true }` on success or `{ ok: false, error: string }` on failure

**Given** the Pi agent receives the camera control command on its local HTTP server
**When** it processes the request
**Then** it applies the v4l2-ctl parameter to the running `rpicam-vid` subprocess in real time — the stream reflects the change within the next HLS segment

**Given** a non-admin calls `POST /api/camera/control`
**When** `requireRole(['Admin'])` evaluates
**Then** `403 FORBIDDEN` is returned — the Pi agent's local HTTP port is not publicly accessible (only reachable via frp API tunnel)

**Given** the admin is on a mobile screen (`< md` breakpoint)
**When** camera controls are accessed
**Then** they render in a bottom `<Sheet>` drawer rather than a persistent left sidebar — dismissible by tapping the scrim or swiping down

---

## Epic 4: Real-Time Chat & Presence

Viewers can chat alongside the stream in real time, see who else is watching, receive unread message notifications when the sidebar is collapsed, scroll back through chat history, and edit or delete their own messages — all delivered over a persistent WebSocket connection.

### Story 4.1: Chat Panel, Message Sending, and Real-Time Delivery

As an **authorized viewer**,
I want to send messages in the chat sidebar and see everyone else's messages appear instantly,
So that watching Manly becomes a shared social moment with coworkers.

**Acceptance Criteria:**

**Given** an authenticated user has the chat sidebar open
**When** they type in the `<ChatInput>` textarea and press Enter
**Then** the message is sent via `sendChatMessage(content)` in `useChat.ts` — the component never calls WS `send()` directly

**Given** a chat message is sent
**When** it is received by the server's WS handler
**Then** a `messages` row is inserted with a server-generated ULID, `user_id`, `content`, and `created_at` — then `{ type: 'chat:message', payload: ChatMessage }` is broadcast to all connected clients including the sender

**Given** a `chat:message` WS message arrives at the client
**When** `useChat.ts` dispatches it
**Then** the message appears at the bottom of `ChatPanel.vue`'s scroll area in real time — no page refresh required

**Given** a message body contains markdown syntax
**When** it is rendered in `<ChatMessage>`
**Then** bold (`**text**`), inline code (`` `text` ``), and links are rendered as HTML — no other markdown elements are required at MVP

**Given** the chat textarea is empty
**When** Enter is pressed or the send button is clicked
**Then** no message is sent and the send button remains disabled

**And** Shift+Enter inserts a newline instead of sending; message content is capped at 1000 characters with a counter appearing at 800+ characters

---

### Story 4.2: Chat History on Load and Infinite Scroll

As an **authorized viewer**,
I want to see recent chat history when I open the page and load older messages by scrolling up,
So that I can catch up on what was said before I arrived.

**Acceptance Criteria:**

**Given** an authenticated user loads `WatchView.vue`
**When** `useChat.ts` initializes
**Then** `GET /api/chat/history?limit=50` is called — no `before` param returns the latest 50 messages

**Given** the initial history response arrives
**When** the messages are rendered in `<ChatPanel>`
**Then** the scroll position is pinned to the bottom — the user sees the most recent messages first

**Given** the user scrolls up to the top of the loaded message list
**When** the scroll sentinel enters the viewport
**Then** `GET /api/chat/history?before={oldestLoadedMessageId}&limit=50` is called — older messages are prepended above the current list without losing scroll position

**Given** the history API returns `{ messages: [...], hasMore: false }`
**When** `useChat.ts` processes the response
**Then** no further scroll-triggered fetches are attempted — the absence of a loading sentinel signals the end of history

**Given** two adjacent messages in the list are from different calendar days
**When** they are rendered in `<ChatPanel>`
**Then** a day-boundary delineator (e.g. "Tuesday, March 3") appears between them, formatted in the user's local timezone via `Intl.DateTimeFormat`

**And** REST `GET /api/chat/history` uses keyset/cursor pagination only — `before={ulid}` is the sole backward-navigation mechanism; no `offset` or `page` params exist

---

### Story 4.3: Message Grouping, Avatars, and UserTag Display

As a **viewer**,
I want to see who sent each message with their avatar, name, and any UserTag,
So that I can tell coworkers apart at a glance and understand their context.

**Acceptance Criteria:**

**Given** a series of messages from the same sender sent within a short time window
**When** they are rendered in `<ChatPanel>`
**Then** the first message in the group shows the sender's avatar (circular, ~32px) and display name; subsequent continuation messages from the same sender show neither — continuation messages are indented to align with the first message body

**Given** a new sender posts after the previous sender
**When** their message is rendered
**Then** a new group begins with that sender's avatar and display name displayed

**Given** a user's `avatarUrl` is a valid image URL
**When** `<Avatar>` renders
**Then** the image loads; if the image fails to load, initials derived from `displayName` are shown as a fallback

**Given** a user profile is included in a chat message, presence event, or history response
**When** the server computes the response
**Then** it includes a `userTag: { text: string; color: string } | null` field computed as follows: (1) if `user_tag_text` is set on the user record → `{ text: user_tag_text, color: user_tag_color ?? defaultTagColor }`; (2) else if role is `ViewerGuest` → `{ text: 'Guest', color: defaultGuestTagColor }`; (3) else → `null` — this logic lives entirely server-side; no client component performs role checks to determine tag visibility

**Given** a chat message group header renders for a user with `userTag !== null`
**When** `<ChatMessage>` renders
**Then** the UserTag text is displayed inline after the display name using the provided color — the component renders `props.userTag` directly with no conditional role logic

**Given** a chat message group header renders for a user with `userTag === null`
**When** `<ChatMessage>` renders
**Then** only the display name is shown — no tag element is rendered

**Given** a user's UserTag changes (admin updates or role changes)
**When** `{ type: 'user:update', payload: UserProfile }` is received by connected clients
**Then** all visible instances of that user's messages and presence entry update to reflect the new `userTag` value

---

### Story 4.4: Unread Badge, Sidebar Collapse/Expand, and State Persistence

As a **viewer**,
I want the chat sidebar to auto-collapse on small screens and show an unread count when collapsed,
So that I never miss a message even when the sidebar is out of view.

**Acceptance Criteria:**

**Given** the app loads on a desktop viewport (`≥ lg`, 1024px) with no stored preference
**When** `WatchView.vue` renders
**Then** the right chat sidebar is expanded by default

**Given** the app loads on a mobile viewport (`< md`, 768px) with no stored preference
**When** `WatchView.vue` renders
**Then** the right chat sidebar is collapsed by default

**Given** the user has previously collapsed or expanded the sidebar
**When** they return to the page
**Then** the sidebar state is restored from `localStorage` before first paint — no layout flash occurs

**Given** the chat sidebar is collapsed and a new `chat:message` WS event arrives
**When** `useChat.ts` dispatches it
**Then** the unread count increments on the `<SidebarCollapseButton>` badge — the badge remains visible through the non-hover state without requiring the user to hover the stream

**Given** the user expands the chat sidebar
**When** the panel becomes visible
**Then** the unread count resets to zero and the badge disappears

**Given** the user clicks the `|→` collapse button
**When** the animation completes (150ms)
**Then** the sidebar disappears entirely (no persistent strip), the stream expands to fill the freed space, and the button becomes `←|` with any pending unread badge

**And** `<SidebarCollapseButton>` `aria-label` updates dynamically: `"Collapse chat sidebar"` when open / `"Expand chat sidebar (N unread)"` when collapsed with unread messages

---

### Story 4.5: Own Message Edit and Delete

As a **viewer**,
I want to edit or delete my own messages after sending them,
So that I can correct mistakes without asking a moderator.

**Acceptance Criteria:**

**Given** a user hovers over one of their own messages
**When** the message context menu appears
**Then** it contains "Edit" and "Delete" options — these options are absent on other users' messages for non-privileged users

**Given** the user selects "Edit"
**When** edit mode activates
**Then** the message body is replaced with an editable input pre-filled with the current content; Escape cancels (restoring original); Enter/submit saves

**Given** the user saves an edit
**When** the server processes the request
**Then** the `messages` row is updated: `content` set to new text, `updated_at` set to `NOW()`, previous content appended to `edit_history` JSONB (append-only) — `{ type: 'chat:edit', payload: ChatEdit }` is broadcast to all connected clients

**Given** a `chat:edit` WS message arrives at a client
**When** `useChat.ts` processes it
**Then** the message in the local list updates in place and a small "edited" indicator appears on the message

**Given** a user hovers over the "edited" indicator
**When** the tooltip renders
**Then** it shows the `updated_at` timestamp formatted in the user's local timezone

**Given** the user selects "Delete" on their own message
**When** the deletion is confirmed
**Then** `DELETE /api/chat/messages/:messageId` is called; server sets `deleted_at = NOW()` and `deleted_by = userId`; `{ type: 'chat:delete', payload: { messageId } }` is broadcast; the message is removed from all clients' visible chat lists

**And** deleted message records are retained server-side with `deleted_at` set — no API endpoint performs a hard delete (NFR15)

---

### Story 4.6: Viewer Presence List and Typing Indicator

As a **viewer**,
I want to see who else is currently watching and know when someone is composing a message,
So that the experience feels like a shared moment, not solo viewing.

**Acceptance Criteria:**

**Given** the chat sidebar is open
**When** `ChatPanel.vue` renders
**Then** a "Viewers" tab alongside the "Chat" tab shows the live presence list — all currently connected authenticated users displayed with their avatar, display name, and `userTag` (if non-null)

**Given** a user connects to `GET /ws` and is registered in the hub
**When** their connection is confirmed
**Then** `{ type: 'presence:join', payload: UserPresence }` is broadcast to all other connected clients — `UserPresence` includes `userId`, `displayName`, `avatarUrl`, and `userTag`

**Given** a connected user closes their tab or disconnects
**When** the server detects the WS close
**Then** `{ type: 'presence:leave', payload: { userId } }` is broadcast — the user is removed from all clients' viewer lists

**Given** a user begins typing in the chat input
**When** the first keystroke fires after a 400ms debounce
**Then** `{ type: 'typing:start', payload: { userId, displayName } }` is sent via the `useChat.ts` action — no component calls WS `send()` directly

**Given** a `typing:start` message is received by other clients
**When** `<TypingIndicator>` renders
**Then** it shows `"{displayName} is typing"` with three CSS-animated bouncing dots (staggered 0/200ms/400ms delays)

**Given** multiple users are typing simultaneously
**When** `<TypingIndicator>` renders
**Then** two typers → `"{Name1} and {Name2} are typing"`; three or more → `"Several people are typing"`

**Given** a user stops typing (2 seconds after last keystroke) or sends their message
**When** the cleanup fires
**Then** `{ type: 'typing:stop', payload: { userId } }` is sent — the indicator clears for that user on all other clients

**And** `<TypingIndicator>` has `aria-live="polite"` — announces once when a new typer is detected; animations respect `prefers-reduced-motion`

---

## Epic 5: Moderation, Roles & User Management

Moderators and Admins can silence, remove, and manage users through a context-menu-driven UI. A four-tier role hierarchy (Admin, Moderator, ViewerCompany, ViewerGuest) is enforced server-side; non-privileged users see no elevated options. All moderation actions are audit-logged. Admins can manage roles via the web UI (Moderator tier) or CLI (all tiers), and can assign custom UserTags (text + color) to any user.

### Story 5.1: Moderator and Admin — Delete Any Chat Message

As a **moderator or admin**,
I want to delete any user's chat message from the message context menu,
So that I can keep the chat appropriate without needing dev tooling.

**Acceptance Criteria:**

**Given** a moderator or admin hovers over any message in `ChatPanel.vue`
**When** the message context menu renders
**Then** a "Delete" option appears — this option is absent from the context menu for users with `role` below `Moderator`

**Given** the moderator/admin selects "Delete"
**When** `DELETE /api/chat/messages/:messageId` is called with their session
**Then** the server verifies the caller has `role >= Moderator`, then performs a soft-delete: sets `deleted_at = NOW()` and `deleted_by = callerId`; does not hard-delete the row (NFR15)

**Given** the soft-delete succeeds
**When** the server broadcasts `{ type: 'chat:delete', payload: { messageId } }`
**Then** all connected clients remove the message from their visible chat list

**Given** the moderator/admin issues the delete
**When** the action completes
**Then** an audit log row is created: `action = 'message_delete'`, `actor_id`, `target_id` (message ID), `performed_at`

**And** a non-privileged user sending `DELETE /api/chat/messages/:messageId` for a message they do not own receives `403 Forbidden`

---

### Story 5.2: Mute and Unmute

As a **moderator or admin**,
I want to mute a disruptive user so they lose chat access while keeping stream access, and later unmute them,
So that minor infractions don't require a full ban.

**Acceptance Criteria:**

**Given** a moderator/admin opens a user's profile context menu (avatar in presence list or message group header)
**When** that user is not currently muted
**Then** a "Mute" option is available; "Unmute" is absent

**Given** the moderator/admin selects "Mute"
**When** `POST /api/users/:userId/mute` is called
**Then** the server sets `muted_at = NOW()` on the target user record; an audit log row is created with `action = 'mute'`, `actor_id`, `target_id`, `performed_at`

**Given** a muted user's session receives any WS connection or REST call to `POST /api/chat/messages`
**When** the server evaluates the request
**Then** it returns `403 Forbidden` with `{ code: 'USER_MUTED' }`; chat stream read access and HLS stream access remain unaffected

**Given** a moderator/admin opens a muted user's context menu
**When** the menu renders
**Then** "Unmute" is available; "Mute" is absent

**Given** the moderator/admin selects "Unmute"
**When** `POST /api/users/:userId/unmute` is called
**Then** `muted_at` is cleared to `NULL`; an audit row is created with `action = 'unmute'`; the user can send chat messages again immediately

**And** a Moderator cannot mute or unmute a user with `role >= Moderator` — the server returns `403 Forbidden` with `{ code: 'INSUFFICIENT_ROLE' }` if attempted

---

### Story 5.3: Ban with Immediate Session Revocation

As a **moderator or admin**,
I want to ban a user so their access is revoked immediately and all active sessions are terminated,
So that banned users cannot continue to view or interact with the stream.

**Acceptance Criteria:**

**Given** a moderator/admin opens a non-banned user's profile context menu
**When** the menu renders
**Then** a "Ban" option is available

**Given** the moderator/admin selects "Ban" and confirms the action
**When** `POST /api/users/:userId/ban` is called
**Then** the server executes a single `prisma.$transaction()` that: (1) sets `banned_at = NOW()` on the target user record; (2) deletes all rows in `sessions` where `user_id = targetId`

**Given** the ban transaction commits
**When** any server middleware evaluates subsequent requests bearing a previously valid session cookie for that user
**Then** the session lookup fails (session row deleted); the user is redirected to the login page or receives `401 Unauthorized`

**Given** the banned user had an active WebSocket connection at ban time
**When** the ban transaction commits and sessions are deleted
**Then** the WS hub detects the missing session and sends `{ type: 'session:revoked', payload: { reason: 'banned' } }` to that user's active WebSocket connection — the client immediately redirects to `/banned` and closes the connection

**Given** the ban is applied
**When** the action completes
**Then** an audit log row is created: `action = 'ban'`, `actor_id`, `target_id`, `performed_at`

**And** a Moderator cannot ban a user with `role >= Moderator` — the server returns `403 Forbidden` with `{ code: 'INSUFFICIENT_ROLE' }`

**And** there is no unban endpoint at MVP — restoring access requires direct database intervention or a CLI command (unban can be added post-MVP)

---

### Story 5.4: Non-Privileged UI Gating

As a **non-privileged viewer** (ViewerCompany or ViewerGuest),
I want the UI to only show me controls appropriate to my role,
So that I am never presented with moderation options I cannot use.

**Acceptance Criteria:**

**Given** a non-privileged user (ViewerCompany or ViewerGuest) views the presence list or a message context menu
**When** the UI renders those components
**Then** no "Mute", "Ban", or "Delete" options appear — the server is the authoritative gate, but the UI also hides all elevated affordances for non-privileged roles

**And** the four moderation actions recorded in the audit log are: `message_delete`, `mute`, `unmute`, `ban`; the `audit_log` table schema: `id CHAR(26)`, `action TEXT NOT NULL`, `actor_id CHAR(26)` (FK → users), `target_id TEXT`, `metadata JSONB`, `performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` — append-only, no `updated_at` or `deleted_at`

---

### Story 5.5: Four-Tier Role Hierarchy, CLI Admin Grant, Web UI Moderator Management

As an **admin**,
I want to promote or demote users to/from Moderator via a web UI and manage all roles via CLI,
So that I can delegate moderation without sharing server access.

**Acceptance Criteria:**

**Given** the system enforces the role hierarchy `Admin > Moderator > ViewerCompany > ViewerGuest`
**When** any role-gated action is evaluated server-side
**Then** the check compares the caller's role ordinal against the required minimum — a role comparison helper `hasRole(user, minRole)` is imported from `packages/types` and used in all server middleware and route handlers

**Given** a new user authenticates via Google OAuth for the first time
**When** the server processes the callback
**Then** their role is set automatically: if their email domain matches the `ALLOWED_DOMAIN` env var → `ViewerCompany`; else if their email appears in the `GUEST_ALLOWLIST` (newline-separated env var or config) → `ViewerGuest`; else → login is rejected with `403 Not Allowed`

**Given** no Admin user exists yet
**When** the server operator runs the CLI command `npm run cli -- grant-admin --email=<email>`
**Then** the target user's role is set to `Admin` in the database — this is the only way to create an Admin; the web UI provides no path to grant Admin

**Given** an admin navigates to Admin Panel → Users
**When** the user table renders
**Then** every registered user is listed with their display name, email, role badge, `first_seen` and `last_seen` timestamps

**Given** an admin clicks "Promote to Moderator" on a `ViewerCompany` user
**When** `POST /api/admin/users/:userId/role` is called with `{ role: 'Moderator' }`
**Then** the user's role is updated in the database and a `{ type: 'user:update', payload: UserProfile }` WS message is broadcast — all connected clients update their local representation of that user

**Given** an admin clicks "Demote to Viewer" on a `Moderator` user
**When** `POST /api/admin/users/:userId/role` is called with `{ role: 'ViewerCompany' }`
**Then** the role is downgraded and a `user:update` event is broadcast

**And** the CLI (`npm run cli -- set-role --email=<email> --role=<role>`) supports all four role values; the web UI role editor supports only `Moderator ↔ ViewerCompany` transitions

**And** an Admin cannot change their own role via the web UI — the "Change Role" control is disabled for the currently authenticated admin's own row

---

### Story 5.6: UserTag Assignment and Server-Computed Effective UserTag

As an **admin**,
I want to assign a custom UserTag (text + color) to any user,
So that I can give special members a distinguishing identity badge that appears consistently across the chat and presence list.

**Acceptance Criteria:**

**Given** an admin opens a user's detail panel in Admin Panel → Users
**When** the UserTag section renders
**Then** it shows the user's current effective UserTag (text + color, or "None") and provides inputs for "Tag Text" (max 20 chars) and "Tag Color" (color picker constrained to a theme-safe palette)

**Given** the admin submits a UserTag update
**When** `PATCH /api/admin/users/:userId/user-tag` is called with `{ userTagText: string; userTagColor: string }`
**Then** the server updates `user_tag_text` and `user_tag_color` on the `users` record; then computes the new `effectiveUserTag` and broadcasts `{ type: 'user:update', payload: UserProfile }` to all connected clients

**Given** a `user:update` WS message is received
**When** `useChat.ts` and `usePresence.ts` process it
**Then** all visible instances of that user's messages in `ChatPanel.vue` and their entry in the Viewers list update immediately to reflect the new UserTag — no page refresh required

**Given** an admin clears a user's UserTag (submits empty text)
**When** the server processes `PATCH /api/admin/users/:userId/user-tag` with `{ userTagText: '' }`
**Then** `user_tag_text` and `user_tag_color` are set to `NULL`; the effective UserTag reverts to the default logic: `ViewerGuest` → `{ text: 'Guest', color: defaultGuestTagColor }`, all other roles → `null`

**And** the server `effectiveUserTag` computation is a pure function in `apps/server/src/lib/user-tag.ts`:

```ts
function computeUserTag(user: {
  role: Role;
  userTagText: string | null;
  userTagColor: string | null;
}): UserTag {
  if (user.userTagText)
    return { text: user.userTagText, color: user.userTagColor ?? DEFAULT_TAG_COLOR };
  if (user.role === 'ViewerGuest') return { text: 'Guest', color: DEFAULT_GUEST_TAG_COLOR };
  return null;
}
```

This function is called in every code path that returns a `UserProfile` — REST responses, WS `presence:join`, and `user:update` broadcasts

**And** no Vue component or `useX.ts` composable re-implements `computeUserTag` — they receive and render `userTag` as provided

---

## Epic 6: Pi Operational Tooling

Any operator can bootstrap a Raspberry Pi Zero W 2 as a ManlyCam camera node from scratch using a single install script. The script installs frpc and mediamtx, configures each with correct defaults for ManlyCam, and registers both as systemd services. WiFi configuration is handled by the operator's tool of choice (wifi-connect is one option, documented as optional). Complete documentation covers initial setup, service management, troubleshooting, and clean uninstall.

> **Planning note (2026-03-08):** Epic 6 was redefined via sprint change proposal after the Epic 3 retrospective revealed that the Go Pi agent's purpose was fully absorbed by mediamtx. The original stories (self-update command, Go install script, captive portal) have been replaced. See `sprint-change-proposal-2026-03-08.md` for the full rationale.

### Story 6.1: Remove Go Agent, Extract mediamtx, and Clean Unused Dependencies

> **Scope expanded (2026-03-11):** Originally "Remove Go Agent from Monorepo". Expanded via sprint-change-proposal-2026-03-11.md to include server-side mediamtx subprocess extraction, Docker Compose mediamtx service definition, and hls.js removal.

As a **developer**,
I want the Go agent removed, the server-side mediamtx subprocess extracted to a standalone service, and unused dependencies cleaned up,
So that the codebase reflects the current architecture with no dead code, no unnecessary process-supervision complexity, and no stale dependencies.

**Acceptance Criteria:**

**Given** the `apps/agent/` directory exists in the monorepo
**When** Story 6.1 is complete
**Then** `apps/agent/` is deleted, `.github/workflows/agent.yml` is deleted, and `pnpm-workspace.yaml` no longer references `apps/agent`

**Given** `AGENT_API_KEY` exists in `apps/server/src/env.ts`
**When** an audit confirms it is unused (no server-side code sends or validates this header post-agent removal)
**Then** `AGENT_API_KEY` is removed from `env.ts`, `.env.example`, and `agentAuth.ts` middleware is removed

**Given** the cleanup is complete
**When** `pnpm install` is run from the repo root
**Then** workspace resolves without errors; no broken imports or references to the agent remain

**And** server CI and web CI still pass after the removal

**Given** `streamService.ts` currently spawns mediamtx as a child process
**When** Story 6.1 is complete
**Then** `buildMTXConfig()`, `supervisorLoop()`, `runMediamtx()`, the `ChildProcess` import, the `proc` field, and all `configDir` temp directory logic are removed from `streamService.ts`; the server no longer spawns or supervises any mediamtx process

**Given** mediamtx is no longer spawned by the server
**When** the server starts
**Then** `streamService` polls the external mediamtx API using `MTX_API_URL` (new env var, e.g. `http://127.0.0.1:9997` for local dev, `http://mediamtx:9997` in Docker Compose) and the WHEP proxy in `stream.ts` forwards to `MTX_WEBRTC_URL` (new env var, e.g. `http://127.0.0.1:8888` for local dev, `http://mediamtx:8888` in Docker Compose)

**Given** a Docker Compose example file exists (or is created at `docker-compose.example.yml` or similar)
**When** Story 6.1 is complete
**Then** the compose file includes a named `mediamtx` service with: an appropriate public image, RTSP port (8554), WebRTC port (8888), API port (9997), a `mediamtx.yml` config volume, and `restart: unless-stopped`

**And** a `mediamtx.yml` example config is included in the repository (e.g. at `deploy/mediamtx-server.yml`) configured for the server-side role: RTSP source from frp tunnel → WebRTC WHEP output, all other protocols disabled

**Given** `hls.js` is listed as a dependency in `apps/web/package.json`
**When** Story 6.1 is complete
**Then** `hls.js` is removed from `package.json`, `pnpm-lock.yaml` is updated accordingly, and no import of `hls.js` remains anywhere in `apps/web/src/`

**And** all existing server CI and web CI checks continue to pass

**Dev Notes:**

- `streamService.ts` retains: `pollLoop()`, `pollMediamtxState()`, `reapplyCameraSettings()`, admin toggle, `getState()`, `isPiReachable()`, `broadcastState()` — all behavior unchanged
- `stream.ts`: `mtxWhepBase()` changes from hardcoded `127.0.0.1:${MTX_WEBRTC_PORT}` to `env.MTX_WEBRTC_URL` (full base URL string)
- `env.ts`: Remove `MTX_WEBRTC_PORT` and `MTX_API_PORT`; add `MTX_API_URL` and `MTX_WEBRTC_URL` as zod `url()` or `string()` with sensible local-dev defaults
- The `mediamtx.yml` config previously generated by `buildMTXConfig()` should be provided as a static example file in the repo (e.g. `deploy/mediamtx-server.yml`) — this becomes the reference config for 6-3 documentation
- Server Dockerfile: remove any mediamtx binary installation step if present
- `streamService.test.ts`: update fetch mock URLs to match the new `MTX_API_URL` env var pattern

---

### Story 6.2: Pi Install and Uninstall Script

As a **Pi operator**,
I want a single install script that configures frpc and mediamtx as systemd services,
So that I can get a Pi up and running as a ManlyCam camera node with one command.

**Acceptance Criteria:**

**Given** a freshly flashed Raspberry Pi OS Lite (64-bit) with SSH access
**When** the operator runs `./install.sh --endpoint <upstream-url> --frp-token <token>`
**Then** the script downloads frpc and mediamtx binaries for linux/arm, generates `/etc/manlycam/frpc.toml` and `/etc/manlycam/mediamtx.yml` with correct defaults, creates systemd service units for both, enables and starts both services

**Given** the install script has run successfully
**When** the operator checks service status
**Then** `systemctl status frpc` and `systemctl status mediamtx` both report active (running)

**Given** both services are running and the upstream server is reachable
**When** the operator checks the stream
**Then** the RTSP tunnel is established and mediamtx API is accessible via the frp API tunnel

**Given** the install script is run a second time on an already-configured Pi
**When** the script executes
**Then** it is idempotent — updates config files and restarts services without error; does not overwrite any manual config changes made outside the script's managed keys

**Given** the operator runs `./uninstall.sh`
**When** the script completes
**Then** both services are stopped and disabled, config files are removed, binaries are removed, and the Pi is in a clean state

**And** both scripts are tested on Raspberry Pi OS Lite (64-bit) on a Pi Zero W 2

---

### Story 6.3: Operator Documentation

> **Scope expanded (2026-03-11):** Originally Pi-only documentation. Expanded via sprint-change-proposal-2026-03-11.md to include server-side mediamtx setup documentation (Docker Compose and non-Docker paths).

As an **operator (Pi or server)**,
I want complete documentation covering both the Pi lifecycle and the server-side mediamtx setup,
So that I can deploy the full ManlyCam stack — Pi camera node through to server infrastructure — without requiring deep knowledge of frpc, mediamtx, or Docker internals.

**Acceptance Criteria:**

**Given** an operator reads the `pi/README.md`
**When** they follow the bootstrap section
**Then** the documented steps cover: OS flash (Raspberry Pi Imager, SSH key setup) → camera verification (`rpicam-still`) → install script usage → confirming stream is live

**Given** the README covers service management
**When** an operator reads it
**Then** it documents: checking status (`systemctl status`), restarting services, viewing logs (`journalctl -u frpc` / `journalctl -u mediamtx`), and what to do when the stream is down

**Given** the README covers WiFi configuration
**When** an operator reads it
**Then** it notes that WiFi setup is the operator's responsibility; wifi-connect is mentioned as one optional approach with a link to its documentation — operators using other methods (Pi Imager preconfiguration, wpa_supplicant, etc.) require no additional steps

**Given** the README covers the full lifecycle
**When** an operator reads it
**Then** it also documents: the uninstall procedure and how to update frpc/mediamtx to newer versions

**And** all documented commands are accurate and tested against the actual install script from Story 6.2

**Given** an operator reads the server setup section of the documentation
**When** they follow the Docker Compose path
**Then** the documentation explains what mediamtx does in the server context (ingests RTSP from the Pi via frp tunnel, re-publishes as WebRTC WHEP for browsers), references the compose example and `mediamtx-server.yml` config produced in Story 6-1, and lists the required server env vars (`MTX_API_URL`, `MTX_WEBRTC_URL`, `FRP_HOST`, `FRP_RTSP_PORT`, `FRP_API_PORT`) with example values

**Given** an operator who does not use Docker reads the server setup documentation
**When** they follow the non-Docker / bare-metal path
**Then** the documentation provides freeform instructions for: downloading and installing the mediamtx binary, the minimum `mediamtx.yml` configuration for the server role (referencing the example from Story 6-1), and running mediamtx as a systemd service on the server host

**And** the server-side documentation clearly cross-references the Pi README (Story 6-2 output) so an operator can follow both documents together to bring up the full stack

---

### Story 6.4: Implement Root README with Architectural Overview

As an **operator or developer**,
I want a central README.md in the project root with architectural visualization and project context, including a dynamic code coverage badge,
So that I can understand the full stack at a glance and see the real-time health of the codebase.

**Acceptance Criteria:**

**Given** a user visits the repository root
**When** the README.md is viewed
**Then** it contains a high-level project intro, a photo of Manly in `docs/assets/manly.jpg`, and a set of "fancy shields" (CI Status, License, TypeScript, Node.js, Vue.js, Raspberry Pi)

**Given** the code coverage shield in the README
**When** a CI run completes on the `main` branch
**Then** the shield dynamically updates to reflect the latest line coverage percentage extracted from the Vitest reports (using a GitHub Gist or similar dynamic endpoint)

**Given** the architecture section of the README
**When** viewed in a browser that supports Mermaid
**Then** a Mermaid diagram renders showing the end-to-end pipeline: Pi Camera → mediamtx (Pi) → frp tunnel → mediamtx (Server) → WebRTC WHEP → Vue SPA

**Given** the monorepo structure
**When** the README is viewed
**Then** it contains deep links to `apps/server/README.md`, `apps/web/README.md`, and `pi/README.md` with brief descriptions of each component's role

**Given** the requirements section
**When** viewed
**Then** it lists the high-level prerequisites for running the full stack (Node.js, Docker, Raspberry Pi hardware)

---

## Post-MVP / Phase 2

> The following stories are deferred from the MVP scope. They are documented here for planning continuity. See the Implementation Readiness Report (2026-03-06) for the rationale behind each deferral.

---

### Story PM-1: Admin Audit Log Viewer

> **Deferred from MVP** — See ISSUE-3 in the Implementation Readiness Report (2026-03-06). The PRD marks the audit log viewer UI as post-MVP; only backend audit log writes (FR30) are required at MVP. These ACs were originally in Story 5.4 and relocated here.

As an **admin**,
I want to view a chronological log of all moderation actions,
So that I can audit what moderators have done and maintain accountability.

**Acceptance Criteria:**

**Given** an admin navigates to the Admin Panel → Audit Log view
**When** the page loads
**Then** `GET /api/admin/audit-log?limit=50` is called and returns a paginated list of audit entries sorted by `performed_at DESC`

**Given** the audit log response arrives
**When** `<AuditLogTable>` renders
**Then** each row shows: timestamp (local timezone), actor display name, action type, target identifier (user display name or message ID), and any relevant metadata

**Given** there are more than 50 audit entries
**When** the user scrolls to the bottom of the log
**Then** `GET /api/admin/audit-log?before={lastEntryId}&limit=50` is called and older entries are appended — keyset pagination, no offset params

**Given** the audit log route `GET /api/admin/audit-log` is called without an active Admin session
**When** the server evaluates the request
**Then** it returns `403 Forbidden` — Moderators cannot access the audit log

---

### Story PM-2: Resizable Sidebars (Drag Gutter)

> **Deferred from MVP** — See UX-5 in the Implementation Readiness Report (2026-03-06). The UX spec includes draggable sidebar gutters, but this was deferred to post-MVP. MVP sidebars are fixed-width and collapse-only.

As a **viewer**,
I want to resize the chat and camera control sidebars by dragging their edges,
So that I can allocate screen real estate to suit my preference.

**Acceptance Criteria:**

**Given** the desktop three-column layout is visible
**When** the user drags the gutter at the edge of a sidebar
**Then** the sidebar width changes fluidly and the stream fills the remaining space, maintaining 16:9 aspect ratio

**Given** the user has resized a sidebar
**When** they return to the page
**Then** the sidebar width is restored from `localStorage` — no layout flash occurs

**And** a Vue-compatible drag-resize library is used (not `react-resizable-panels`); sidebar widths are constrained to min/max values to prevent the stream from becoming unusably small

---

## Epic 8: Chat Enhancement & Engagement

Transform the chat experience from basic messaging into a rich, engaging communication platform with emoji support, reactions, mentions, enhanced markdown formatting, browser notifications, and extensible slash commands.

### Story 8-1: Expanded Markdown & Multiline Support

As an **authorized viewer**,
I want to format my chat messages with rich markdown including code blocks, blockquotes, links, italics, strikethrough, and images,
So that I can express myself more clearly and share code snippets or relevant content.

**Acceptance Criteria:**

**Given** a message contains a fenced code block starting with triple backticks and an optional language identifier
**When** the message is rendered
**Then** the content between the opening and closing triple backticks displays as a code block with syntax highlighting for the specified language

**Given** a message contains a fenced code block with no closing triple backticks
**When** the message is rendered
**Then** the code block is assumed to continue until the end of the message and displays with syntax highlighting (or plain if no language specified)

**Given** a message contains lines starting with `>` (blockquote syntax)
**When** the message is rendered
**Then** those lines display as blockquotes with appropriate styling

**Given** a message contains a URL like `https://example.com`
**When** the message is rendered
**Then** the URL is auto-detected and rendered as a clickable link with `target="_blank"`

**Given** a message contains text wrapped in single asterisks or underscores like `*italic*` or `_italic_`
**When** the message is rendered
**Then** the text displays in italics

**Given** a message contains text wrapped in double tildes like `~~strikethrough~~`
**When** the message is rendered
**Then** the text displays with a strikethrough line

**Given** a message contains markdown image syntax like `![alt](https://example.com/image.gif)`
**When** the message is rendered
**Then** the image displays with a max-height constraint that fits within the chat width

**Given** a message contains multiple consecutive newlines outside of code blocks
**When** the message is rendered
**Then** consecutive newlines are collapsed into a single line break (spam prevention)

**Given** a message contains a code block with multiple consecutive newlines
**When** the message is rendered
**Then** all newlines within the code block are preserved exactly as typed

**Given** a message contains intentional single line breaks outside of code blocks
**When** the message is rendered
**Then** the line break is preserved and rendered as a new line

**And** the markdown renderer sanitizes input to prevent XSS attacks (existing `sanitizeHref` pattern extended for new elements)

**And** the implementation replaces or extends `apps/web/src/lib/markdown.ts` with a library-based solution (e.g., `marked` + `highlight.js` or `markdown-it`)

---

### Story 8-2: @Mentions & Highlighting

As an **authorized viewer**,
I want to mention other users with `@Full Name` and be notified when someone mentions me,
So that I can get someone's attention in chat and know when I'm being spoken to.

**Acceptance Criteria:**

**Given** a user types `@` in the chat input
**When** the autocomplete popup appears
**Then** it shows all currently connected viewers sorted by most recently chatted (default list)

**Given** a user types `@` followed by characters (e.g., `@John`)
**When** the autocomplete filters results
**Then** it filters the list by matching against full names with spaces removed (e.g., "John Smith" matches `@johns`, `@johnsmith`)

**Given** the autocomplete popup is visible
**When** a user clicks or taps on a name in the list
**Then** that name is inserted into the chat input at the cursor position

**Given** the autocomplete popup is visible
**When** a user presses the up/down arrow keys
**Then** the selection highlight moves through the list items

**Given** the autocomplete popup is visible and a name is highlighted via arrow keys
**When** the user presses Enter or Tab
**Then** the highlighted name is inserted into the chat input at the cursor position

**Given** a user sends a message containing a valid `@Full Name`
**When** the message is stored
**Then** the mention is persisted with a reference to the mentioned user

**Given** a message contains an `@mention` of the current user
**When** the message is rendered for that user
**Then** the mention is visually highlighted (e.g., different background color, pill styling)

**Given** a user is mentioned while the browser tab is in the background
**When** the message arrives
**Then** the `window.title` changes to draw attention (e.g., "mentioned you! • ManlyCam")
**And** the tab title restores to its original value when the tab regains focus

**And** mentioned users are stored server-side for future notification features (Story 8-3)

**Note:** Flash titlebar behavior defaults to enabled. A configurable preference toggle will be added in Story 8-3 (Browser Notifications & Preferences).

---

### Story 8-3: Browser Notifications & Preferences

As an **authorized viewer**,
I want to receive browser notifications for chat activity and control which notifications I receive,
So that I can stay informed about activity even when the tab is in the background.

**Acceptance Criteria:**

**Given** a user has not yet granted notification permission
**When** they toggle on any preference that requires browser notifications in the preferences dialog
**Then** the browser's native notification permission prompt is displayed

**Given** a user clicks the Avatar button in the Broadcast Console
**When** the dropdown menu appears
**Then** a "Preferences" option is visible alongside existing options (Logout, etc.)

**Given** a user clicks "Preferences" from the Avatar dropdown
**When** the preferences dialog opens
**Then** a ShadCN modal/dialog displays with notification toggles

**Given** a user grants browser notification permission
**When** a chat message is sent while the user's tab is hidden
**Then** a browser notification displays with the sender's name and message preview

**Given** a user grants browser notification permission
**When** they are mentioned while the tab is hidden
**Then** a browser notification displays indicating they were mentioned

**Given** the stream state changes (live → offline or offline → live)
**When** the user's tab is hidden and stream notifications are enabled
**Then** a browser notification displays the stream state change

**Given** a user has multiple ManlyCam tabs open
**When** a notification-triggering event occurs
**Then** only one browser notification is shown (no duplicates across tabs)

**Given** a user views the notification settings in the preferences dialog
**Then** they see toggles for: Chat messages, @Mentions, Stream state changes

**Given** a user disables a notification type in preferences
**When** the corresponding event occurs
**Then** no browser notification is shown for that event type

**Given** a user enables a previously disabled notification type
**When** the corresponding event occurs
**Then** browser notifications resume for that event type

**Given** a user toggles the "Flash titlebar on mention" preference
**When** the preference is saved
**Then** the titlebar flash behavior from Story 8-2 respects this setting

**And** all notification preferences are persisted per-user and restored on next visit

**And** notifications are scoped to active browser tabs only (no service worker / push API)

---

### Story 8-4: Programmable Slash Commands

As an **admin**,
I want to define custom slash commands via JavaScript files that users can invoke in chat,
So that I can create custom text expansions and interactions without modifying the codebase.

**Acceptance Criteria:**

**Given** an admin creates a JavaScript file in the configured slash commands folder
**When** the server starts
**Then** the command is loaded and available to users based on its `gate.applicableRoles` setting

**Given** a command file exports the following interface:

```typescript
interface SlashCommand {
  name: string; // e.g., "shrug"
  description: string; // e.g., "Appends ¯\\_(ツ)_/¯"
  placeholder?: string; // e.g., "[message]" - shown in autocomplete as "/shrug [message]"
  handler: (input: string, user: SimplifiedUser) => MessageResponse;
  gate?: { applicableRoles?: Role[] }; // optional visibility gate
}

interface MessageResponse {
  content: string;
  ephemeral?: boolean; // if true, only invoker sees it (not persisted); defaults to false
}
```

**When** the command is invoked
**Then** the handler receives the message text (after the command) and a simplified user object

**Given** a user types `/` in the chat input
**When** the autocomplete popup appears
**Then** it shows all commands visible to the user's role with format: `/command-name {placeholder}` (or just `/command-name` if no placeholder)

**Given** a command defines `placeholder: "[message]"`
**When** the autocomplete popup displays the command
**Then** it shows as `/shrug [message]` with the description alongside

**Given** an admin creates multiple commands with the same name
**When** the server loads commands
**Then** all commands with that name are loaded (no deduplication)

**Given** a user types `/` and multiple commands share the same name
**When** the autocomplete popup appears
**Then** all commands with that name are shown (differentiated by description)

**Given** a user types `/shrug` and submits the message
**When** the command is processed
**Then** the handler's returned `content` is posted as the chat message instead of the raw input

**Given** a command specifies `gate: { applicableRoles: ['admin', 'moderator'] }`
**When** a viewer without those roles types `/`
**Then** that command does not appear in their autocomplete list

**Given** a command file has invalid syntax or missing required fields
**When** the server loads commands
**Then** an error is logged and the invalid command is skipped (server does not crash)

**Given** a command handler returns `{ content: "Only you see this", ephemeral: true }`
**When** the command is processed
**Then** only the invoking user sees the message via WebSocket (not broadcast to others)
**And** the message is not persisted to the database

**Given** a command handler returns `{ content: "Everyone sees this" }` or `{ content: "...", ephemeral: false }`
**When** the command is processed
**Then** the message is broadcast to all connected users and persisted normally

**And** built-in commands are provided: `/shrug` (appends `¯\\_(ツ)_/¯`), `/tableflip` (appends `(╯°□°）╯︵ ┻━┻`)

**And** the slash commands folder path is configurable via server environment variable

---

### Story 8-5: Emoji Picker Component

As an **authorized viewer**,
I want to insert emojis into my chat messages using a visual picker or keyboard shortcuts,
So that I can express emotions and reactions quickly without memorizing emoji codes.

**Acceptance Criteria:**

**Given** a user clicks the emoji button in the chat input area
**When** the emoji picker opens
**Then** a searchable, categorized emoji picker displays using Fluent Emoji image assets (consistent cross-platform rendering)

**Given** the emoji picker is open
**When** a user types in the search field
**Then** the emoji list filters to show only matching emojis by name or keyword

**Given** the emoji picker is open
**When** a user clicks an emoji
**Then** the Fluent Emoji image is inserted at the cursor position in the chat input and the picker remains open

**Given** a user types `:` followed by text (e.g., `:smile`)
**When** an autocomplete popup appears
**Then** it shows Fluent Emoji images matching the typed shortcut with their names

**Given** the emoji shortcut autocomplete is visible
**When** a user clicks/taps or uses arrow keys + Enter to select an emoji
**Then** the `:shortcut` text is replaced with the Fluent Emoji image in the chat input

**Given** a user presses Escape while the emoji picker or shortcut autocomplete is open
**When** the picker/popup closes
**Then** focus returns to the chat input

**And** Fluent Emoji assets are loaded from CDN (`emoji.fluent-cdn.com`) or self-hosted via server configuration

**And** the emoji picker component is reusable for both chat input and message reactions (Story 8-6)

**And** the architecture supports future custom emoji extensibility (not required for this story)

---

### Story 8-6: Message Reactions

As an **authorized viewer**,
I want to react to chat messages with emojis and see others' reactions,
So that I can express my feelings about a message without typing a response.

**Acceptance Criteria:**

**Given** a user hovers over or long-presses a chat message
**When** the reaction UI appears
**Then** a quick reaction bar displays with commonly used emojis and an option to open the full emoji picker

**Given** a user clicks a quick reaction emoji or selects one from the full picker
**When** the reaction is added
**Then** the emoji appears below the message with a count (or the count increments if already present)

**Given** a message has existing reactions
**When** rendered
**Then** each unique emoji displays with its count, sorted oldest reaction first (to prevent UI jumping during interaction)

**Given** a user clicks on an existing reaction emoji they previously added
**When** the click is processed
**Then** their reaction is removed and the count decrements (or emoji removed if count reaches 0)

**Given** a user clicks on an existing reaction emoji they did NOT add
**When** the click is processed
**Then** their reaction is added (toggles on) and the count increments

**Given** a moderator or admin hovers over a reaction
**When** the reaction detail tooltip appears
**Then** it includes an option to remove the reaction (moderation capability)

**Given** a muted user views a message with reactions
**When** the message renders
**Then** existing reaction buttons appear disabled (visible but non-interactive) and the add reaction UI is disabled

**Given** a user adds or removes a reaction
**When** the action completes
**Then** the change is broadcast to all connected clients via WebSocket in real-time

**And** the emoji picker component from Story 8-5 is reused for the full picker option

---

## Epic 10: Clipping & Clip Sharing

Users can clip segments from the rolling server-side HLS buffer, manage clips through a per-account My Clips dialog (accessible from the profile popover) with three-tier visibility, share clips to chat, view clips in a modal overlay without leaving the stream, download clips, and share public clips externally via OG-tagged shareable pages. S3-compatible storage (Backblaze B2 in production, RustFS in development) stores all clip assets.

---

### Story 10-1: Dev Environment Documentation (Clipping Infrastructure)

As a **developer setting up a local environment**,
I want complete documentation covering all new clipping infrastructure prerequisites,
So that I can run a fully functional clipping stack locally without a Backblaze B2 account.

**Acceptance Criteria:**

**Given** a developer reads the updated dev setup documentation
**When** they follow the clipping infrastructure section
**Then** it documents: adding the `hls_segments` named Docker volume to `docker-compose`, the RustFS container service (image, ports, env vars, volume mount, bucket creation via console), and all new required env vars: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PUBLIC_BASE_URL`, `MTX_HLS_URL` (mediamtx HLS server base URL, e.g., `http://mediamtx:8090`)

**Given** a developer reads the mediamtx configuration section
**When** they follow it
**Then** it documents the HLS output additions to `mediamtx-server.yml`: enabling HLS (`hls: true`), setting `hlsSegmentDuration` and `hlsSegmentCount`, the segment output path matching the shared volume mount, `hlsAlwaysRemux: true` (ensures continuous segment generation for the clip buffer), and `useAbsoluteTimestamp: true` on the path (preserves original frame timestamps for accurate clip/UI synchronization); it also notes that the HLS path flush on stream offline uses the existing `MTX_API_URL` env var (already present in `env.ts` at default `http://127.0.0.1:9997`) — no new env var is needed for this purpose

**Given** a developer reads the non-Docker / bare-metal section
**When** they follow the clipping prerequisites
**Then** it documents: installing ffmpeg on Linux (apt), verifying the install (`ffmpeg -version`), and running a local RustFS instance standalone with equivalent configuration

**And** the documentation clearly states that `hls_segments` must be mounted read-write in the mediamtx container and read-only in the server container

**And** all env var names documented here exactly match those validated in `apps/server/src/env.ts`

**And** the documentation notes that RustFS supports `PutObjectAcl` for object-level ACL operations (used by the clip visibility toggle)

**And** the documentation notes that `S3_PUBLIC_BASE_URL` for RustFS dev is `http://localhost:9000` and for Backblaze B2 is `https://f{n}.backblazeb2.com/file` (operator must supply correct B2 CDN hostname)

---

### Story 10-2: Clipping Infrastructure

As a **developer**,
I want the complete server-side clipping infrastructure in place,
So that subsequent stories have a stable foundation of HLS buffer, S3 client, Clip data model, and WsMessage types to build on.

**Acceptance Criteria:**

**Given** the server-side mediamtx config is updated
**When** mediamtx is running and the Pi RTSP stream is connected
**Then** HLS segments are written to the configured segment path with original frame timestamps preserved (via `useAbsoluteTimestamp: true`); the rolling buffer retains content according to `hlsSegmentCount × hlsSegmentDuration`; the WHEP live viewer endpoint is unaffected

**Given** the `docker-compose.yml` is updated
**When** `docker compose up` is run
**Then** a `hls_segments` named volume exists; the mediamtx container mounts it read-write at the segment output path; the server container mounts it read-only at the same path

**Given** `apps/server/src/env.ts` is updated
**When** the server starts
**Then** it validates `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PUBLIC_BASE_URL`, `S3_FORCE_PATH_STYLE` (boolean, default `true`), and `MTX_HLS_URL` (string, URL, default `http://127.0.0.1:8090` — the mediamtx HLS server base URL) via Zod; missing vars produce a descriptive startup error

**Given** an S3 client singleton is created at `apps/server/src/lib/s3-client.ts`
**When** other modules import it
**Then** it exports a single `S3Client` instance configured from env vars; no other file constructs an `S3Client` directly

**Given** the Prisma schema is updated
**When** `pnpm prisma migrate dev` is run
**Then** a `clips` table is created with columns: `id CHAR(26)` (PK, server-generated ULID), `user_id CHAR(26)` (FK → users), `name VARCHAR(100) NOT NULL`, `description VARCHAR(500)`, `status TEXT NOT NULL DEFAULT 'pending'` (pending/ready/failed), `visibility TEXT NOT NULL DEFAULT 'private'` (private/shared/public), `thumbnail_key TEXT`, `duration_seconds INTEGER`, `show_clipper BOOLEAN NOT NULL DEFAULT false`, `show_clipper_avatar BOOLEAN NOT NULL DEFAULT false`, `clipper_name VARCHAR(50)`, `clipper_avatar_url TEXT`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ` (uses `@updatedAt` — fires on ALL mutations including status transitions and visibility changes; do not use for "last user edit" signals), `last_edited_at TIMESTAMPTZ` (null until first user PATCH; updated only when name or description is changed by a user PATCH — not on status transitions, visibility changes, or ACL operations), `deleted_at TIMESTAMPTZ` (null until soft-deleted; set to current timestamp by `DELETE /api/clips/:id` instead of hard-deleting the row; all list and detail queries must filter `deletedAt: null`; soft-deleted records are retained to allow S3 orphan cleanup by a background sweep); add `@@index([userId])` on the `clips` model (consistent with all other FK-bearing tables in the schema — `sessions`, `messages`, `reactions`, `audit_log` all index their FK columns); developer must also add `clips Clip[]` to the existing `User` model in `schema.prisma` — Prisma requires both sides of a FK relation to be declared, or `prisma generate` will error; **S3 object keys follow pattern `clips/{clipId}/video.mp4` and `clips/{clipId}/thumbnail.jpg` — no separate `s3_key` column needed; derive from clipId**

**Given** the Prisma schema is updated
**When** the `messages` table migration runs
**Then** two new columns are added: `clip_id CHAR(26)` (nullable FK → clips, `onDelete: SetNull`) and `message_type TEXT NOT NULL DEFAULT 'text'` (text/clip); an index is added on `clip_id`

**Given** the `packages/types/src/ws.ts` WsMessage union is updated
**When** other packages import it
**Then** it adds three new entries to the existing `WsMessage` **discriminated union at line 85 of `ws.ts`** (splice into the union — do not create a separate export or a parallel union type):

- `{ type: 'clip:status-changed'; payload: { clipId: string; status: 'ready'; durationSeconds: number; thumbnailKey: string | null } | { clipId: string; status: 'failed' } }` — discriminated on `status`; `durationSeconds` and `thumbnailKey` are present on `ready` and absent on `failed`; `thumbnailKey` may be null if thumbnail generation failed; do not use `status: 'ready' | 'failed'` with optional fields — TypeScript will not enforce presence on the `ready` branch; **S3 video key is derived from clipId as `clips/{clipId}/video.mp4` — no separate `s3Key` field needed**
- `{ type: 'clip:visibility-changed'; payload: { clipId: string; visibility: 'private' | 'shared' | 'public' | 'deleted'; chatClipIds: string[]; clip?: { name: string; clipThumbnailUrl: string; durationSeconds: number; clipperDisplayName?: string; clipperAvatarUrl?: string } } }` (`clip` card data is included only when restoring from tombstone, i.e., when visibility moves to `shared` or `public`; `chatClipIds` is capped at the first 100 message IDs; `clipThumbnailUrl` is always `{S3_PUBLIC_BASE_URL}/{thumbnailKey}` — thumbnails are `public-read` and never require presigning; if `clipperAvatarUrl` is null, omit the field — do not serialize `null`)
- The `ChatMessage` interface is split into a discriminated union: `TextChatMessage` = existing `ChatMessage` interface with `messageType: 'text'` added (all existing fields are preserved); `ClipChatMessage` = all base fields from `ChatMessage` with exact field names matching the interface — `id: string`, `userId: string`, `displayName: string`, `avatarUrl: string | null`, `authorRole: Role`, `userTag: UserTag | null`, `content: string`, `createdAt: string`, `editHistory: { content: string; editedAt: string }[] | null`, `updatedAt: string | null`, `deletedAt: string | null`, `deletedBy: string | null`, `reactions?: Reaction[]`, `ephemeral?: boolean` — plus `messageType: 'clip'`, `clipId: string`, `clipThumbnailUrl: string` (`{S3_PUBLIC_BASE_URL}/{thumbnailKey}` — thumbnails are always `public-read`, no presigning), `clipName: string`, `clipDurationSeconds: number`, `tombstone?: true` (present and `true` only when the clip is unavailable — deleted, private, or soft-deleted; absent on live clip messages; clients narrow on `payload.tombstone === true` to render the "clip unavailable" card); `ChatMessage` is retained as a type alias `export type ChatMessage = TextChatMessage | ClipChatMessage` so all existing consumers (`createMessage()`, moderation service, reactions service, etc.) continue to compile without changes; the `chat:message` union member's payload type is updated from `ChatMessage` to `TextChatMessage | ClipChatMessage`; existing `chat:message` consumers must narrow on `payload.messageType` to distinguish text vs. clip messages

**Given** the stream goes from online to explicit offline (admin toggle)
**When** the stream state transition is processed
**Then** the server calls the mediamtx HTTP API (`MTX_API_URL` — the existing env var) to remove/flush the HLS path for the stream (fire-and-forget, logged on error, non-fatal)

**Given** the stream is set to online by an admin
**When** the stream state transition is processed
**Then** `stream_started_at` is written to `stream_config` as an ISO8601 UTC timestamp key-value entry (no Prisma schema migration is required — `stream_config` is a key-value store); this value persists until the next online transition; each new online transition overwrites it — this is intentional, as clip creation validation only fires at submission time and existing clips are unaffected by stream restarts

**Given** `chatService.ts`'s `getHistory()` function is updated as part of this story
**When** it queries chat messages
**Then** the query gains `include: { clip: { select: { id: true, visibility: true, name: true, thumbnailKey: true, durationSeconds: true, clipperName: true, clipperAvatarUrl: true, showClipper: true, showClipperAvatar: true, deletedAt: true } } }` (all field names are Prisma camelCase — Prisma maps `thumbnail_key` → `thumbnailKey`, `deleted_at` → `deletedAt`, etc.; use Prisma field names in `select`, not DB column names); the `MessageRow` type gains `clipId?`, `messageType`, and `clip?` fields; `toApiChatMessage()` maps clip fields to the `ClipChatMessage` payload shape when `messageType = 'clip'`; `clipThumbnailUrl` is always `{S3_PUBLIC_BASE_URL}/{thumbnailKey}` (thumbnails are always public-read — no presigning); if `clipperAvatarUrl` is null in the DB, omit the field from the payload (do not emit `clipperAvatarUrl: null` — the TypeScript type is `clipperAvatarUrl?: string`, not `string | null`); for clip messages where `clipId IS NULL` (cascade-nulled after hard deletion), where the joined clip has `visibility: 'private'`, or where the joined clip has `deletedAt IS NOT NULL` (soft-deleted), set `tombstone: true` on the returned `ClipChatMessage` — **clip soft-deletion sets only `clips.deletedAt`; it NEVER sets `messages.deletedAt`** (message rows for deleted clips remain intact with their original `deletedAt: null`; the existing `getHistory()` filter `where: { deletedAt: null }` on message rows continues to work correctly and does not accidentally hide clip-tombstone rows)

**And** `ffmpeg` is present in the server Dockerfile and available at runtime

**And** the S3 bucket must support `PutObjectAcl` for clip visibility toggling; ACL behavior and configuration vary by provider (RustFS dev vs B2 production) — refer to Story 10-1 (dev) and Story 10-7 (production) for provider-specific notes

**And** Story 10-2 is a prerequisite for Stories 10-3, 10-4, and 10-5; the WsMessage type additions and `chatService.ts` changes must be merged before implementing those stories to ensure TypeScript type safety

---

### Story 10-3: Clip Creation Pipeline

As an **authenticated user**,
I want to clip a segment from the live stream's rolling buffer,
So that I can capture memorable moments with an optional name, description, chat share, and download.

**Acceptance Criteria:**

**Given** an authenticated user views the stream
**When** they look at the Broadcast Console
**Then** a clip button (lucide `Videotape` icon, tooltip "Clip Stream") appears to the right of the snapshot button; it is visible to all authenticated roles including ViewerGuest

**Given** a user clicks the clip button
**When** the clip UI opens
**Then** a modal overlay renders with: an HLS scrubber populated from the live `.m3u8` playlist (using segment timestamps derived from the HLS playlist); preset buttons (30s, 1min, 2min) that preselect the corresponding tail of the available buffer as the initial range; drag handles on both ends for manual adjustment; name and description input fields; a "Share to chat when ready" checkbox; a Submit button

**Given** the user submits a clip request
**When** `POST /api/clips` is called with `{ startTime: ISO8601, endTime: ISO8601, name: string, description?: string, shareToChat?: boolean }`
**Then** the server validates: if the `stream_started_at` key does not exist in `stream_config` (stream has never been started), return 422 "Stream has not started"; `startTime >= stream_started_at` (else 422 "Cannot clip footage from before the stream started"); `startTime` and `endTime` fall within the available HLS segment range parsed from the stream playlist (else 422 "Requested range is not available in the buffer"); `endTime > startTime`; the resulting duration does not exceed 15 minutes (else 422); `name` must not exceed 200 characters (else 422); `description` must not exceed 500 characters if provided (else 422)

**Given** the stream goes online (admin toggles to 'live')
**When** `stream_started_at` is written to `stream_config`
**Then** the server fetches the HLS master playlist at `{MTX_HLS_URL}/cam/index.m3u8` **once**, extracts the stream playlist filename (e.g., `video1_stream.m3u8`), and caches it in `stream_config` for the duration of the stream session; all subsequent segment range validation and ffmpeg input use the full stream playlist URL `{MTX_HLS_URL}/cam/{streamPlaylistName}`; the master playlist is NOT re-fetched for every clip request — only on stream start

**Given** a valid clip request is received
**When** the server creates the clip record
**Then** a `pending` clip record is created with a server-generated ULID; the endpoint returns `{ id, status: 'pending' }` immediately without waiting for processing; `shareToChat` is held as a closure variable passed to the async processing function — it is **not persisted** to the `clips` table (no `share_to_chat` column exists); if the server crashes during ffmpeg processing, the `shareToChat` intent is permanently lost and the clip will be `pending`/`ready`/`failed` with no chat share attempted; crash recovery for in-flight processing is out of scope for MVP

**Given** the clip record is created
**When** async processing runs
**Then** ffmpeg is called with `-ss {startTime_ISO8601} -i {MTX_HLS_URL}/cam/{streamPlaylistName} -t {durationSeconds} -c copy /tmp/{clipId}.mp4` (`-ss` before `-i` is fast input seek; with `useAbsoluteTimestamp: true` preserving original frame timestamps, ffmpeg correctly interprets the ISO8601 `-ss` value as an absolute calendar timestamp seek; `-t` takes duration in seconds computed server-side as `Math.round((new Date(endTime) - new Date(startTime)) / 1000)` — **do not use `-to {endTime}`** as `-to` takes an output-stream position, not a wall-clock timestamp, and will produce wrong output; `{streamPlaylistName}` is the cached stream playlist filename extracted from `index.m3u8` at stream start, e.g., `video1_stream.m3u8`); a thumbnail JPEG is extracted with a separate invocation: `-ss {startTime_ISO8601} -i {MTX_HLS_URL}/cam/{streamPlaylistName} -vframes 1 -q:v 2 /tmp/{clipId}-thumb.jpg`; both temp files are named by clip ULID to prevent collision between concurrent invocations; the video file is uploaded to S3 with **private** ACL (default); the thumbnail file is uploaded to S3 with **`public-read`** ACL — thumbnails are always publicly accessible via `S3_PUBLIC_BASE_URL` and never require presigned URLs; `thumbnailUrl` is always constructed as `{S3_PUBLIC_BASE_URL}/{thumbnailKey}`; the clip record is updated to `status: 'ready'` with `s3Key`, `thumbnailKey`, and `durationSeconds`; temp files are deleted after upload or on error; if ffmpeg exits with a non-zero code or produces output shorter than expected (TOCTOU: a segment may have rolled out of the buffer between validation and processing), the clip is set to `status: 'failed'`; concurrent ffmpeg invocation count is not capped in MVP — documented as a known limitation for constrained hosts

**Given** the clip creation request contains `startTime` and `endTime`
**When** the client computes these values
**Then** the client derives them from segment timestamps parsed from the live stream playlist (with `useAbsoluteTimestamp: true`, segment timestamps correspond to original frame timestamps); using `Date.now()` or any other wall-clock source is prohibited — the scrubber must be driven entirely by playlist-reported timestamps to ensure correct HLS segment mapping

**Given** processing completes successfully with `shareToChat: true`
**When** the clip is ready
**Then** the clip's `visibility` is updated to `shared` and a `Message` record is created atomically via `prisma.$transaction()`; a `chat:message` WsMessage is broadcast to all connected users with `messageType: 'clip'` and the clip card payload (`clipId`, `clipThumbnailUrl` as `{S3_PUBLIC_BASE_URL}/{thumbnailKey}` — thumbnails are always public-read, no presigning, `clipName`, `clipDurationSeconds`); a `clip:status-changed` WsMessage is also broadcast to all connected users with `status: 'ready'`; a `clip:visibility-changed` WsMessage is also broadcast with `{ clipId, visibility: 'shared', chatClipIds: [the new message id] }` and the full clip card in `clip` — this ensures any prior tombstone (e.g., from an earlier failed share attempt) is restored and My Clips visibility badges update in real-time on other open sessions; if the DB transaction fails after S3 upload succeeds, the clip remains `ready`/`private` with no chat post and no notification — this is an accepted known limitation; the owner can manually Share to Chat from My Clips

**Given** processing completes successfully with `shareToChat: false`
**When** the clip is ready
**Then** a targeted `clip:status-changed` WsMessage is sent to all active WebSocket connections for the clip owner's userId (via `wsHub.sendToUser`) with `status: 'ready'`; no chat message is created; clip remains `private`

**Given** ffmpeg or S3 upload fails
**When** the error is caught
**Then** the clip record is updated to `status: 'failed'`; temp files are cleaned up; a targeted `clip:status-changed` WsMessage is sent to all active WebSocket connections for the clip owner's userId with `status: 'failed'`

**Given** a clip is being processed
**When** the user's frontend is connected
**Then** a persistent Sonner toast shows the clip name and processing state; it updates to success (with clip name) when the `clip:status-changed` WsMessage with `status: 'ready'` is received; it updates to error when `status: 'failed'` is received; it does not obscure the stream video area

**Given** an authenticated user submits a clip request
**When** they have submitted 5 or more clips in the past 60 minutes (rolling window, counted via `prisma.clip.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 3_600_000) } } })`; concurrent near-simultaneous submissions from the same user may both pass this check in a race — documented as an accepted known limitation)
**Then** the server returns 429 with a descriptive error; the Sonner surfaces this message; this rate limit applies to all roles below Moderator (Viewer and ViewerGuest); use `ROLE_RANK[user.role] < ROLE_RANK['Moderator']` from `apps/server/src/lib/roleUtils.ts` — do not inline the role comparison

**Given** a Moderator or Admin submits a clip request
**When** any number of clips exist for that user in the past hour
**Then** no rate limit is applied

**And** if the clip owner has no active WebSocket connections when processing completes (they went offline), the `clip:status-changed` notification is silently dropped; no stored delivery or retry mechanism exists; the current status is always queryable via `GET /api/clips/:id`

**Given** `GET /api/clips/:id` is called
**When** the clip exists and the requester has access (owner; Admin; Moderator only for their own clips or clips with `shared`/`public` visibility — a Moderator cannot access `private` clips owned by others and receives **404** (not 403) to avoid confirming the clip's existence to unauthorized callers; unauthenticated users can access `public` clips only; 401 if unauthenticated and clip is not public; soft-deleted clips (`deletedAt IS NOT NULL`) are treated as not found → 404 for all callers)
**Then** the clip record is returned with all non-sensitive fields; `thumbnailUrl` is always constructed as `{S3_PUBLIC_BASE_URL}/{thumbnailKey}` — thumbnails are uploaded as `public-read` and never require presigning; the download URL is generated separately via `GET /api/clips/:id/download` which presigns the video object

**Given** `GET /api/clips/:id/download` is called
**When** the request is processed
**Then** 401 if unauthenticated; 404 if clip not found, soft-deleted, or if the requester lacks access (use 404 — not 403 — to avoid confirming clip existence, consistent with all other clip endpoints); 409 if clip `status` is not `ready` (pending and failed clips are not downloadable); for `ready` clips with access, the server generates a presigned S3 URL (60-minute expiry) with `ResponseContentDisposition: attachment; filename="{slugified-clip-name}.mp4"` and responds with a 302 redirect; no binary data is proxied; if the slugified clip name is empty (e.g., entirely non-ASCII), the clip ULID is used as the filename instead (`{clipId}.mp4`); if a download begins and the presigned URL expires before the transfer completes, the download will fail mid-transfer — this is an accepted limitation of presigned URLs

**And** `POST /api/clips` requires an active session — 401 if unauthenticated; the `authMiddleware` is informational only and does not auto-reject unauthenticated requests, so this endpoint must explicitly verify a session exists

**And** clip attribution fields (`showClipper`, `showClipperAvatar`, `clipperName`) cannot be set via `POST /api/clips`; they are PATCH-only

---

### Story 10-4: My Clips Dialog

As an **authenticated user**,
I want a My Clips dialog accessible from the profile menu to view and manage my clips,
So that I can edit clip details, control visibility, share to chat, download, and delete clips.

**Acceptance Criteria:**

**Given** `GET /api/clips` is called
**When** the request is authenticated
**Then** it returns a paginated list (page + limit query params; `page` is **zero-indexed** — `page=0` is the first page, `skip = page * limit`; default limit 20, newest-first) of clips the requester can see; `deletedAt: null` is applied to **all variants** of the query — own clips, `?includeShared=true`, and Admin `?all=true` all exclude soft-deleted clips; by default: own clips only; with `?includeShared=true`: includes all non-private (`shared` or `public`) non-deleted clips from other users; Admin with `?all=true`: includes all non-deleted clips regardless of owner or visibility; non-Admin callers passing `?all=true` have it silently ignored (treated as if not passed); passing both `?all=true&includeShared=true` is valid for Admin (`?all=true` is a superset); each item includes `thumbnailUrl` always as `{S3_PUBLIC_BASE_URL}/{thumbnailKey}` (thumbnails are always public-read — no presigning), name, description, status, visibility, duration, clipper info, and creation date; offset-based pagination may return duplicates or skip items if clips are created/deleted between page requests — documented as a known limitation

**Given** an authenticated user opens the My Clips dialog (via the profile popover, above Preferences)
**When** the dialog loads
**Then** their own clips are displayed as cards (thumbnail, name, duration badge, visibility badge, status indicator, creation date); pending clips show a processing spinner; failed clips show an error state with a Dismiss button; ready clips show Edit, Share to Chat, Copy Link, Download, and Delete actions

**Given** a user clicks Dismiss on a failed clip
**When** the action completes
**Then** the Dismiss action calls `DELETE /api/clips/:id`; the endpoint detects `status: 'failed'` and **hard-deletes** the clip record (`prisma.clip.delete()`) — no S3 objects exist for failed clips so no S3 cleanup is needed; no `clip:visibility-changed` broadcast is required because failed clips are never shared to chat and no tombstones exist to update; the card is removed from the UI; responds 204

**Given** a user clicks Delete on a ready clip they own
**When** `DELETE /api/clips/:id` is called
**Then** check order: (1) 401 if unauthenticated; (2) fetch clip — if not found or soft-deleted, 404; (3) RBAC — if not owner AND `canModerateOver(actor.role, clip.owner.role)` fails, return **404** (not 403 — avoids confirming the clip exists to unauthorized callers); (4) if `status: 'pending'`, return 409 Conflict (the clip must finish processing before deletion; RBAC check fires first so unauthorized callers always see 404, never 409); for `ready` or `failed` clips: the server first queries `chatClipIds` (`SELECT id FROM messages WHERE clip_id = $clipId`, capped at 100) and then soft-deletes the clip record — both operations wrapped in `prisma.$transaction()`; soft-delete sets `deletedAt = new Date()` on the clip record rather than hard-deleting it (the row is retained for S3 orphan cleanup); following the transaction, delete the S3 video and thumbnail objects (only if `status: 'ready'` — failed clips have no S3 objects, skip S3 cleanup); if S3 deletion fails (connectivity error), the clip record remains soft-deleted and the S3 objects are orphaned — this is an accepted known limitation; a background sweep or admin CLI can find soft-deleted records with `deletedAt IS NOT NULL` and retry S3 cleanup; `onDelete: SetNull` on the message FK acts as a safety net only for any hard-deletes that may occur outside normal flow — in normal soft-delete operation, the message `clip_id` FK remains intact, and chatService tombstones via `clip.deletedAt IS NOT NULL`; the `clip:visibility-changed` broadcast fires only after the `prisma.$transaction()` has confirmed a successful commit — never optimistically before commit; broadcasts `{ clipId, visibility: 'deleted', chatClipIds }` so active sessions tombstone the clip card in real-time; responds 204

**Given** a Moderator or Admin clicks Delete on a clip they do not own
**When** the delete completes
**Then** the same deletion logic applies; this action is gated by `canModerateOver(actor.role, clip.owner.role)` — a Moderator cannot delete a clip owned by an Admin and receives **404** (not 403, to avoid confirming clip existence); an audit log entry is written: `action: 'clip:deleted', actorId, targetId: clip.userId, metadata: { clipId, clipName }`; audit log fires only when `actorId !== clip.userId` — an Admin deleting their own clip (including their own public clips) produces no audit log entry (self-action audit is intentionally excluded)

**Given** a user clicks Edit on a clip they own
**When** the edit form opens
**Then** they can update name and description; visibility options available: `private` (always), `shared` (always); `public` option is shown only to Moderator and Admin users

**Given** a Moderator or Admin sets visibility to `public`
**When** the PATCH is submitted
**Then** attribution controls appear before confirmation: "Show clipper" toggle; when enabled: "Show clipper avatar" toggle + "Clipper name" text field (pre-filled with clip owner's display name); server stores these values on the clip; when `showClipperAvatar` is true, the clip owner's current `avatarUrl` is snapshotted into `clipperAvatarUrl` on the clip record; `showClipperAvatar` must only be set to `true` if the clip owner's `avatarUrl` is non-null at snapshot time — if null, `showClipperAvatar` is stored as `false` regardless of the request value; if `showClipperAvatar` is later disabled and then re-enabled, `clipperAvatarUrl` is re-snapshotted from the clip owner's current `avatarUrl` at that time (same null guard applies); the public clip page renders the attribution block without an avatar image when `clipperAvatarUrl` is null; the server calls `PutObjectAcl(public-read)` on the **video** S3 object only (wrapped in try/catch — failure is logged but does not fail the visibility transition; requires ACL-enabled bucket); the thumbnail object is already `public-read` from upload time and requires no ACL transition; `thumbnailUrl` is always `{S3_PUBLIC_BASE_URL}/{thumbnailKey}` regardless of visibility

**Given** a clip is changed from `public` to `shared` or `private`
**When** the PATCH completes
**Then** the server calls `PutObjectAcl(private)` on the **video** S3 object only; the thumbnail object is always `public-read` and is never reverted to private; `thumbnailUrl` remains `{S3_PUBLIC_BASE_URL}/{thumbnailKey}` at all visibility levels; `GET /api/clips/:id/download` generates a presigned URL for `private` and `shared` videos

**Given** `PATCH /api/clips/:id` is called
**When** the request is processed
**Then** the endpoint accepts a partial body (only send fields to change): `{ name?: string, description?: string | null, visibility?: 'private' | 'shared' | 'public', showClipper?: boolean, showClipperAvatar?: boolean, clipperName?: string | null }`; check order: (1) 401 if unauthenticated; (2) fetch clip with `include: { user: { select: { avatarUrl: true } } }` (the user join is required for the `showClipperAvatar` snapshot path); (3) if clip not found or soft-deleted → 404; (4) if requester is not owner AND `canModerateOver(requester.role, clip.owner.role)` fails → **404** (not 403, to avoid confirming clip existence); (5) validate field values — a Viewer or ViewerGuest setting `visibility: 'public'` → **422** (this is role-gated validation on a clip the requester owns, not an RBAC failure; do not conflate with step 4); returns 200 with the full updated clip record on success — same shape as `GET /api/clips/:id` response including computed `thumbnailUrl`; a Viewer can PATCH their own clip for name, description, or visibility to `private`/`shared` only; when `name` or `description` is changed, `last_edited_at` is updated to the current timestamp; status transitions, visibility changes, and attribution changes do NOT update `last_edited_at`

**Given** a Moderator or Admin edits a clip they do not own
**When** any field is changed (name, description, visibility, attribution)
**Then** multiple separate `AuditLog` rows are written — one per changed category: `action: 'clip:edited'` for name/description changes, `action: 'clip:visibility-changed'` for visibility changes, `action: 'clip:attribution-changed'` for attribution changes; `actorId` = actor's userId, `targetId` = clip owner's userId, `metadata: { clipId, clipName, ...changed fields }`; audit logging only fires when `actorId !== clip.userId`

**Given** a visibility change affects a clip referenced in the chat timeline
**When** the PATCH completes
**Then** the server broadcasts a `clip:visibility-changed` WsMessage with `{ clipId, visibility, chatClipIds: [message IDs with this clip_id, capped at first 100] }`; when `visibility` is `shared` or `public`, the payload also includes the full clip card data for tombstone restoration; `clipThumbnailUrl` in the clip card is always `{S3_PUBLIC_BASE_URL}/{thumbnailKey}` (thumbnails are always public-read, no presigning at broadcast time); if `clipperAvatarUrl` is null, omit it from the payload — do not serialize `null` (same rule as `ClipChatMessage`); the broadcast fires only after the PATCH DB write has committed successfully

**Given** a user clicks Share to Chat on a ready clip
**When** the action completes
**Then** if the clip's current `visibility` is `private`, it is first updated to `shared` within the same `prisma.$transaction()` as the Message insert; a `Message` record is created (`messageType: 'clip'`, `clip_id` set, `content` = the clip's **current name at share time**, snapshotted into `content` — if the clip is shared again after a name change, the new message `content` reflects the current name; the `ClipChatMessage` `clipName` field also reflects the current name); a `chat:message` WsMessage is broadcast with clip card payload (`clipThumbnailUrl` = `{S3_PUBLIC_BASE_URL}/{thumbnailKey}` — thumbnails are always public-read, no presigning); a `clip:visibility-changed` WsMessage is also broadcast when visibility changed (see Story 10-3 for the full broadcast spec on the `shareToChat` path); there is no uniqueness constraint preventing the same clip from being shared to chat multiple times; the button remains active; the server verifies the requesting user is not muted and returns 403 if they are (UI hides the button but server validation is authoritative)

**Given** a muted user opens My Clips
**When** the dialog renders
**Then** the Share to Chat button is hidden for all clips (muted users cannot post to chat)

**Given** a user clicks Copy Link
**When** the action completes
**Then** `/clips/{id}` is written to clipboard; if the clip's visibility is `private`, a tooltip reads "Only you can view this link"

**Given** a user clicks Download on a ready clip
**When** the action completes
**Then** the browser calls `GET /api/clips/:id/download` which issues a presigned redirect with the clip's slugified name as the download filename

**Given** the "Show shared clips" toggle is active
**When** the page renders
**Then** clips from other users with `shared` or `public` visibility are included in the list, sorted newest-first globally (no pinning of own clips to top — this is intentional; the view functions as a discovery feed when the toggle is active)

**And** `shared` visibility is available to all authenticated roles including ViewerGuest; only `public` is role-gated to Moderator and Admin

**Given** an Admin toggles "Show all clips"
**When** the page renders
**Then** all clips regardless of visibility or owner are included

---

### Story 10-5: Chat Clip Integration

As an **authenticated viewer**,
I want clip shares to appear as rich cards in the chat timeline,
So that I can watch, download, and interact with clips without leaving the stream.

**Acceptance Criteria:**

**Given** a `chat:message` WsMessage is received with `messageType: 'clip'`
**When** it renders in the chat timeline
**Then** a clip card displays: thumbnail image, clip name, duration badge, and Watch + Download action buttons; standard message metadata (sender avatar, display name, timestamp) appears as with text messages

**Given** a user clicks Watch on a clip card
**When** the modal opens
**Then** a clip viewer modal overlays the current page; the stream and chat continue behind it; the browser URL is updated to `/clips/{id}` via `history.pushState({ clipModal: true, fromRoute: '/' }, '', '/clips/{id}')`; whether to use `pushState` or `replaceState` is determined by a composable-level reactive: `const isClipModalOpen = ref(false)` (or equivalent in the clip composable) — if `isClipModalOpen.value === true` when Watch is clicked, use `history.replaceState({ clipModal: true, fromRoute: '/' }, '', '/clips/{newId}')` to prevent stacking multiple clip entries in browser history; if `false`, use `pushState`; the modal can be closed via an X button or Escape key, which calls `history.back()`

**Given** a user presses the browser back button while the clip modal is open
**When** the `popstate` event fires
**Then** the modal closes and the URL returns to the stream page; the stream is unaffected

**Given** a user refreshes the browser while at `/clips/{id}` with no `history.state`
**When** the page loads
**Then** Vue Router detects the absence of `history.state.clipModal` and renders the standalone clip page (Story 10-6) rather than the modal-over-stream

**Given** a user clicks Download on a clip card in chat
**When** the action completes
**Then** the browser calls `GET /api/clips/:id/download` and the file downloads with the clip's slugified name

**Given** a clip referenced in the chat timeline is set to `private` or is deleted
**When** a user's chat history is next fetched (page load or pagination scroll)
**Then** the chat history endpoint joins the `clips` table on `message.clip_id` to check current visibility; a `message_type = 'clip'` row where `clip_id IS NULL` (nulled by `onDelete: SetNull` cascade after clip deletion) is always returned as a tombstone; if the joined clip has `visibility: 'private'`, it is also returned as a tombstone; the clip card renders as "This clip is no longer available" with identical card dimensions

**Given** a clip is currently private/deleted and displayed as a tombstone in an active session
**When** a `clip:visibility-changed` WsMessage is received
**Then** if `visibility` is `shared` or `public` AND the payload includes `chatClipIds` containing message IDs currently rendered as tombstones, ALL matching tombstones are immediately replaced with live clip cards using the card data from the WS payload; the client must update every message ID in `chatClipIds` (not just the first), since the same clip may have been shared to chat multiple times

**And** the reverse (going private) is intentionally deferred: active sessions are not disrupted; the tombstone only appears on the next history fetch; no immediate real-time tombstoning occurs

**And** a rapid `private → public → private` sequence will leave active sessions showing the clip card as live until the next page load; this is an accepted consequence of the asymmetric tombstone design and requires no special handling

**Given** a user scroll-back paginates and re-fetches a page of messages that already contains rendered clip cards
**When** the paginated response returns tombstone flags for some of those messages
**Then** the frontend merges tombstone state into the existing rendered message list (not merely appending new results); any already-rendered message ID in the paginated response that arrives with `tombstone: true` replaces the existing rendered card with the tombstone card

**And** muted users can view clip cards, watch clips, and download clips; they cannot share clips to chat (Share to Chat is absent from their My Clips dialog per Story 10-4)

---

### Story 10-6: Public Clip Pages

As an **unauthenticated user with a clip link**,
I want to view a public clip without logging in,
So that I can watch shared moments without requiring stream access.

**Acceptance Criteria:**

**Given** the Hono app routes are registered
**When** `app.ts` is updated
**Then** a `GET /clips/:id` route handler is registered at module level, entirely outside the `if (env.NODE_ENV === 'production')` block — this guarantees it is always registered before the `serveStatic` block and is never accidentally inside the production guard; in development there is no `serveStatic` registered, so no special dev branch is needed — the route simply returns plain `index.html` from disk if `distPath` is reachable, or a graceful fallback if not; **`distPath` must be hoisted** to before the production guard (`const distPath = join(__dirname, '../../web/dist')` — move it out of the `if` block in `app.ts` so the OG injection route can reference it), then the production block continues to use the same `distPath` variable; this unconditional placement works in all environments including bare-metal with nginx/traefik in front

**Given** `GET /clips/:id` is requested and the clip exists with `visibility: 'public'`
**When** the server processes the request
**Then** it fetches the clip record, reads `index.html` from the web dist, injects into `<head>`: `og:title` (clip name), `og:description` (clip description or a default), `og:image` (`{S3_PUBLIC_BASE_URL}/{thumbnailKey}`), `og:url` (`{BASE_URL}/clips/{id}` — use the existing `BASE_URL` env var, already validated in `env.ts`); if the DB lookup fails, the server falls through to plain `index.html` with no OG tags (non-fatal)

**Given** `GET /clips/:id` is requested and the clip is non-public or does not exist
**When** the server processes the request
**Then** plain `index.html` is served with no OG tag injection; the SPA renders an appropriate state: "Sign in to view this clip" for unauthenticated requests to shared clips; "Clip not found" for missing or private clips

**Given** an unauthenticated user views a public clip page
**When** the SPA loads
**Then** it renders: video player, clip name, description, and (if `showClipper: true`) the stored `clipperName` and (if `showClipperAvatar: true`) the stored `clipperAvatarUrl`; no stream link, chat panel, or application navigation is shown; no stream CTA is shown for unauthenticated users; the Download button navigates directly to `{S3_PUBLIC_BASE_URL}/{s3Key}` (public S3 URL) — `GET /api/clips/:id/download` requires authentication and returns 401 for unauthenticated requests, so public clip downloads bypass the API entirely

**Given** an authenticated user views any clip page at `/clips/:id` directly (not via modal)
**When** `history.state.clipModal` is absent or false
**Then** the standalone clip page renders; a stream-status-aware CTA is shown (stream status is derived from the authenticated user's existing WebSocket `stream:state` messages — no separate REST endpoint is needed); the CTA reads "Watch Live →" when the stream is online and "Go to Stream →" when offline or when WS state is not yet known; a Download button is shown for clips the user has access to

**Given** an authenticated user accesses a `shared` clip at `/clips/:id` directly
**When** the SPA loads
**Then** the full clip page renders (same layout as public, plus the stream CTA); access is permitted to all authenticated users for `shared` visibility

**Given** a user at `/clips/:id` has `history.state.clipModal: true`
**When** Vue Router resolves the route
**Then** the router checks `history.state?.clipModal === true && history.state?.fromRoute === '/'` — at `pushState` time (Story 10-5), the state object is stored as `{ clipModal: true, fromRoute: '/' }` (hardcoded — the stream is always at `/`; do not use `router.currentRoute.value.path` dynamically, as this would produce a different value and break the stale-state detection check); if either condition fails (stale state from a session restore, external navigation, or `fromRoute` mismatch), the standalone clip page renders instead; otherwise the clip modal overlay renders over the stream page with the stream active in the background

**And** a Download button is shown on the standalone clip page for ready clips; for authenticated users it calls `GET /api/clips/:id/download`; for unauthenticated users on public clip pages it navigates directly to `{S3_PUBLIC_BASE_URL}/{s3Key}`

**And** if the DB lookup fails when processing a `GET /clips/:id` OG injection request, the server falls through to plain `index.html` with no OG tags (non-fatal); operators should note that social media crawlers aggressively cache OG meta tags — a transient DB error at crawl time may result in blank/generic previews cached for 7–30 days with no retry mechanism

---

### Story 10-7: Production Deployment Documentation

As an **operator deploying ManlyCam to production**,
I want complete documentation for configuring Backblaze B2 and the clipping stack in a production environment,
So that I can deploy the full clipping feature without guessing at configuration details.

**Acceptance Criteria:**

**Given** an operator reads the B2 setup section
**When** they follow it
**Then** it documents: creating a private B2 bucket, creating an application key scoped to the bucket with read/write permissions, configuring per-object ACLs (B2 supports `s3:PutObjectAcl` — operator must enable it on the bucket policy), and which env vars map to B2 settings (`S3_ENDPOINT` → `https://s3.{region}.backblazeb2.com`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PUBLIC_BASE_URL` → `https://f{n}.backblazeb2.com/file` — operator must supply the correct CDN hostname from B2 dashboard)

**Given** an operator reads the mediamtx HLS configuration section
**When** they follow it
**Then** it documents: enabling HLS output, setting `useAbsoluteTimestamp: true` on the path for accurate timestamp synchronization, and the rolling buffer formula: `hlsSegmentCount = desired_buffer_minutes × 60 / hlsSegmentDuration`; example: 15 min buffer with 2s segments = 450 segments; disk space guidance: approximately `bitrate_mbps × buffer_minutes × 7.5` MB (e.g., 2 Mbps × 15 min ≈ 225 MB); recommendation to back the HLS path with sufficient disk space

**Given** an operator reads the Docker Compose production section
**When** they follow it
**Then** it documents: the `hls_segments` named volume declaration, read-write mount for mediamtx, read-only mount for the server container, and how to verify the volume is functioning after deploy

**Given** an operator deploys without Docker
**When** they read the bare-metal section
**Then** it documents: verifying ffmpeg is installed and in PATH, configuring mediamtx to write HLS segments to a shared directory readable by the Hono process, and recommended systemd service ordering (mediamtx before server)

**And** the documentation notes that B2 egress costs apply to clip playback from public clip pages and presigned download URLs; operators should review B2 pricing before enabling public clips at scale

**And** the documentation notes that **all clip thumbnails** are uploaded as `public-read` and served at `{S3_PUBLIC_BASE_URL}/{thumbnailKey}` regardless of the clip's visibility — no ACL management is performed on thumbnail objects; this means thumbnail URLs appearing in OG meta tags, WsMessages, or chat history cannot be revoked by changing clip visibility; operators should be aware that thumbnails of deleted or private clips remain accessible via their S3 URL if an attacker has the key (ULID keys are not guessable without prior access to the URL)

**And** the documentation notes that `DELETE /api/clips/:id` soft-deletes the clip record (sets `deleted_at` timestamp) and then attempts best-effort S3 deletion; if S3 deletion fails, S3 objects are orphaned until a manual cleanup is performed; operators can identify orphaned objects by querying `SELECT id, s3_key, thumbnail_key FROM clips WHERE deleted_at IS NOT NULL` and cross-referencing with S3 bucket contents

**And** all documented env var names exactly match those validated in `apps/server/src/env.ts`; the `MTX_HLS_URL` env var must be configured to point to the mediamtx HLS server (e.g., `http://mediamtx:8090`)

**And** the operator guide cross-references the dev environment documentation (Story 10-1) so operators can verify local behaviour before deploying
