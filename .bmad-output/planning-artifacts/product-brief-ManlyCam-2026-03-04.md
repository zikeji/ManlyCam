---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
date: 2026-03-04
author: Caleb
---

# Product Brief: ManlyCam

<!-- Content will be appended sequentially through collaborative workflow steps -->

## Executive Summary

ManlyCam is a DIY novelty dog camera built on a Raspberry Pi Zero W 2 with an Arducam module,
housed in a custom-designed shell modeled after a company product. It delivers a low-latency,
browser-based live stream of a dog to coworkers — accessible via a single Google OAuth sign-in
with domain/email allowlist gating. A collapsible, mobile-friendly chat sidebar lets viewers
engage with the stream in real time. The project is greenfield, maker-driven, and built to
delight — born from an accidental meeting moment that coworkers instantly loved.

---

## Core Vision

### Problem Statement

Remote workers have no delightful, frictionless way to share a live view of their pets with
coworkers. Existing consumer cameras are closed ecosystems that lack social interaction features,
are not customizable, and offer no audience-controlled access management.

### Problem Impact

Without ManlyCam, sharing a dog with coworkers requires improvised setups (phones propped in
meetings) that are fragile and lack permanence. The moment of joy is fleeting rather than
repeatable and accessible on demand.

### Why Existing Solutions Fall Short

Off-the-shelf cameras (Wyze, Ring, etc.) are consumer appliances — they cannot be extended,
embedded in a custom enclosure, or integrated with lightweight social/chat features. They also
offer no OAuth-based access control suited to sharing within a specific organization or trusted
group. They are products, not platforms.

### Proposed Solution

A self-contained Raspberry Pi Zero W 2 + Arducam assembly, enclosed in a novelty shell designed
to resemble a company product, serving a low-latency live video stream via a web interface.
Access is gated by Google OAuth with a configurable domain/email allowlist — one click, no
password. A collapsible, resizable chat sidebar (markdown-enabled, emoji picker, Google avatar
integration, dark mode, mobile-responsive) provides optional social engagement alongside the
stream. Privileged users, assigned via CLI, can manage the stream, allowlist, and viewer activity.

### Key Differentiators

- **Custom physical design**: The enclosure is modeled after a recognizable company product,
  making it a conversation piece and a piece of maker craft, not just a camera.
- **Born from a real moment**: The concept emerged organically from a coworker meeting accident —
  it has proven demand before a line of code was written.
- **Tailored access control**: Google OAuth + domain/email allowlist means zero friction for
  authorized viewers and zero infrastructure overhead (no passwords, no email verification).
- **Extensible architecture**: The SBC-first approach means future integrations (treat dispenser,
  physical triggers) are possible without replacing the platform.
- **Social-first streaming**: The chat sidebar is designed as a first-class feature, not an
  afterthought — responsive, collapsible, and personalized via OAuth identity.

---

## Target Users

### Primary Users

#### Viewer — "The Coworker"
**Segment:** Dev and product team members at Caleb's company (and rare, individually-approved external guests).

**Context:** Knowledge workers, mostly on desktop during working hours. Technically competent —
no hand-holding needed. Likely discovered ManlyCam via a Slack link or a bookmark a coworker
shared. May revisit during meetings, slow moments, or when someone drops the link in chat.

**Motivations:** A moment of levity during the workday. Seeing a familiar face (the dog). Low
commitment — they want to open a URL and immediately see something fun, not configure anything.

**Success Moment:** They click the link, sign in with Google in one click, and the stream is
live. No instructions needed. They share it in Slack. Someone reacts in the chat sidebar.

**Journey:**
- **Discovery:** Link shared in Slack, or bookmark from a previous visit
- **Onboarding:** Google OAuth sign-in (one click, no password) — if their email/domain is
  on the allowlist, they're in immediately
- **Core Usage:** Passive viewing, occasional chat sidebar interaction
- **Long-term:** Bookmarked and revisited during meetings or idle moments; may get reminders

**Notes:** Mobile access is a secondary but real use case (Caleb himself on the go; coworkers
on phones). No audio — video-only stream.

---

#### Owner/Admin — "Caleb"
**Context:** Builder, hardware maintainer, and primary administrator. Manages the Pi, the stream,
and all access control. Uses the product both as an admin and as a viewer (desktop and mobile).

**Motivations:** Reliable uptime, easy access management, and a fun project that delights
coworkers. Wants CLI-level control without needing a UI for admin operations.

**Success Moment:** The stream runs unattended. Access management is a one-liner in the terminal.
Coworkers send messages about how much they love the dog.

**Journey:**
- **Setup:** Deploys hardware and software on the Pi, configures OAuth and allowlist via CLI
- **Day-to-day:** Monitors that the stream is live; checks in on the dog from mobile when away
- **Admin tasks (on demand):** Adds/removes emails from allowlist, grants/revokes privilege,
  views last-seen activity, stops/starts the stream

---

### Secondary Users

#### Privileged User — "The Trusted Moderator" (e.g. Caleb's sister)
**Context:** A trusted individual (currently anticipated to be one person — Caleb's sister, also
at the company) with elevated access beyond standard viewing. Assigned privilege via CLI by Caleb.

**Capabilities:** Stop the stream entirely, add individual emails to the allowlist, view the
user list and last-seen timestamps. Does not have full system/CLI access — operates exclusively
through the web interface with elevated permissions.

**Motivations:** Helping manage the community and keeping things tidy without needing to bug Caleb.

---

#### Occasional External Guest
**Context:** A friend, partner, or outside-company contact granted access via individual email
allowlisting. Rare. Treated the same as a standard viewer once admitted.

**Access lifecycle:** Added by Caleb or a privileged user; can be removed or blocked/banned at
any time, immediately revoking access.

---

### User Journey (Standard Viewer)

| Stage | Experience |
|---|---|
| Discovery | Receives link in Slack or has it bookmarked |
| Sign-in | Clicks "Sign in with Google" — one click, domain/email checked against allowlist |
| Rejected | If not on allowlist, redirected back — no account created |
| Admitted | Stream loads immediately, chat sidebar available (collapsible) |
| Engagement | Watches passively or opens sidebar to chat; emoji picker, markdown, avatar from Google |
| Return | Bookmarks the URL; returns during meetings or when link resurfaces in Slack |

---

## Success Metrics

### What Success Looks Like

ManlyCam is a personal maker project — success is defined by reliability and the ability to
delight coworkers on demand. There are no revenue or growth targets. Success is operational.

### User Success Metrics

- **Stream is live when expected:** Viewers can open the URL during intended hours and see the
  dog immediately with no manual intervention required
- **Concurrent viewer support:** Stream remains stable and uncompromised with 10–20 simultaneous
  viewers
- **Frictionless access:** New authorized viewers complete Google OAuth sign-in and reach the
  stream in under 60 seconds, with no support needed

### Technical Performance Targets

| Metric | Target |
|---|---|
| Stream resolution | 1080p (hardware ceiling of Pi Zero W 2; sensor is 16MP) |
| Concurrent viewers | 10–20 without stream degradation |
| Stream availability | Up whenever the dog is home / during intended hours |
| Unplanned stream stops | Zero — this is the primary failure mode to avoid |

### Business Objectives

N/A — this is a personal novelty project. The "business objective" is joy and maker satisfaction.

### Key Performance Indicators

- **Uptime:** The single most important metric. The stream should not stop unexpectedly.
- **Concurrency headroom:** Stream quality must not degrade under realistic simultaneous viewer
  load (target: 10–20 users).
- **Access control integrity:** No unauthorized viewer should ever reach the stream.

### Primary Failure Mode

> **The stream stops when not desired.** Everything else is secondary. A degraded-but-live
> stream is preferable to a clean failure.

---

## MVP Scope

### Core Features

#### 1. Live Video Stream
- Arducam stream captured and encoded on the Pi Zero W 2
- Streamed to a single upstream connection via **frp** (fast reverse proxy)
- Upstream server handles proxying to all viewers — Pi sees only 1 concurrent outbound stream
- Upstream server manages multiple quality levels (1080p, 720p, etc.) and concurrent viewer load
- Video-only; no audio

#### 2. Google OAuth Access Control
- Sign-in via Google OAuth — one click, no password, no email verification
- Domain-level and individual email allowlisting (e.g. `@company.com` or `user@external.com`)
- Unauthorized domain/email → redirected away, no account created
- Access revocable at any time (ban/block individual accounts)

#### 3. Chat Sidebar
- Right-aligned, collapsible and resizable sidebar
- Basic markdown formatting support
- Emoji picker
- Google OAuth avatar and display name integration
- Dark mode support
- Mobile responsive

#### 4. Privileged Role — Camera Settings Sidebar
- Left-aligned sidebar, visible only to privileged users
- Exposes all `v4l2-ctl --list-ctrls` controls (brightness, contrast, exposure, etc.)
- Changes apply in real time with immediate visual feedback in the stream
- Can be used simultaneously with the chat sidebar open

#### 5. CLI Admin Tools
The following admin operations are available via CLI only in MVP (no web UI equivalent):
- Assign / revoke privileged role for a user
- Add / remove individual emails from the allowlist
- Add / remove domain entries from the allowlist
- Ban / unban / block a user account
- View all users and last-seen timestamps
- Stop / start the stream

#### 6. Network Connectivity — Captive Portal
- On-device captive portal to configure additional WiFi networks
- Ensures the Pi can connect and maintain frp tunnel regardless of deployment location

---

### Out of Scope for MVP

| Feature | Status | Notes |
|---|---|---|
| Web UI for CLI admin tools | Post-MVP | CLI is sufficient for the single admin use case at launch |
| Stream reactions / emoji overlay | Post-MVP | Depends on demand |
| Audio (microphone) | Indefinitely parked | Requires physical change; privacy concerns |
| Royalty-free background audio | Not planned / future | Possible someday, not prioritized |
| Treat dispenser / physical integrations | Future | Hardware TBD; Manly is 14 and low-stimulation |
| Full public open-source release | Future | Will open source eventually; PII hygiene in commits required before going public |

---

### MVP Success Criteria

- Stream is live and accessible to authorized viewers via frp tunnel without manual intervention
- 10–20 concurrent viewers supported without stream degradation (upstream server handles this)
- Google OAuth sign-in flow works end-to-end with allowlist enforcement
- Chat sidebar functional on desktop and mobile in dark mode
- Privileged user can adjust camera settings in real time via left sidebar
- CLI tools cover all admin operations
- Captive portal successfully allows WiFi reconfiguration on new networks

---

### Future Vision

- **Web-based admin UI** — Migrate CLI admin tools into a privileged web interface
- **Stream reactions** — Emoji reactions overlaid or alongside the stream, if demand warrants
- **Treat dispenser integration** — Physical GPIO-triggered treat dispenser, web-activated
- **Background audio** — Optional royalty-free ambient audio overlaid on stream
- **Public open-source release** — Sanitized repo with PII removed, published for the maker community
- **Additional physical sensors** — TBD as Manly's needs (and age) evolve
