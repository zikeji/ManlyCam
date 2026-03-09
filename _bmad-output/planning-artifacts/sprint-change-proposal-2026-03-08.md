# Sprint Change Proposal: Go Pi Agent Elimination

**Date:** 2026-03-08
**Workflow:** correct-course
**Change Classification:** Major — Fundamental replan of Epic 6; PRD + Architecture + Epics artifact updates required
**Triggered By:** Epic 3 Retrospective discovery (`epic-3-retro-2026-03-08.md`)
**Status:** Approved 2026-03-08

---

## Section 1: Issue Summary

### Problem Statement

The Go Pi agent was designed with two primary purposes:

1. **HTTP camera API server** — expose `v4l2-ctl` / rpiCamera parameter changes to the upstream server via an frp API proxy tunnel
2. **Process supervisor** — launch and restart frpc and mediamtx as supervised child processes

After the Epic 3 mediamtx pivot (Stories 3-2b and 3-2c):

1. **Purpose #1 is fully absorbed by mediamtx.** The camera pipeline is owned natively by mediamtx, which exposes its own HTTP API at `127.0.0.1:9997`. Story 3.6 wires the admin camera controls sidebar directly to that API via the frp API tunnel — the Go HTTP server was never built and is no longer needed.

2. **Purpose #2 is thin subprocess supervision.** The agent now only starts frpc and mediamtx as child processes. Both of these are stable, mature binaries that have native systemd integration. Two `systemd` service unit files achieve the same supervision (restart-on-failure, start-on-boot) with zero custom code and zero build pipeline.

The Go agent binary adds:
- Go toolchain + cross-compile pipeline in CI
- GitHub Releases + ARM artifact management
- A self-update mechanism (`update-manlycam`) to distribute a binary that provides no unique value
- The `apps/agent/` workspace in the monorepo

...for a component that provides zero capability beyond what `systemd` already handles natively.

Additionally, the captive portal story (Epic 6 Story 6-3) planned to implement WiFi configuration in Go — a significant, complex feature (WPA supplicant, DNS capture, captive portal HTTP server). [wifi-connect](https://github.com/balena-os/wifi-connect) by balena is a battle-tested, open-source project that handles this completely, with a standard install flow. Building a custom implementation would duplicate existing work for no gain.

### Discovery Context

Surfaced during the Epic 3 retrospective (2026-03-08) as the team reviewed the agent's remaining footprint after Stories 3-1 through 3-6 were complete. The retrospective flagged Epic 6 as a **CRITICAL PATH requiring planning reset** before any stories are written.

### Evidence

- Epic 3 retro: *"The agent is now a thin subprocess launcher for things that could be systemd units."*
- Story 3.6: Camera controls connect directly to `127.0.0.1:9997` (mediamtx HTTP API) via the frp tunnel — Go agent HTTP server was never built.
- Story 3-1: The agent code exists in `apps/agent/` but its camera API server implementation was superseded before it was ever needed.
- Retrospective action item: *"Hold Epic 6 planning review session... Redefine Epic 6 goal: 'robust documentation + install/uninstall scripts' (not agent features)"*

---

## Section 2: Impact Analysis

### Epic Impact

| Epic | Status | Impact |
|---|---|---|
| Epic 1 | DONE | Minor cleanup: agent workspace + CI artifacts were included in monorepo scaffold; removal is straightforward |
| Epic 2 | DONE | No impact |
| Epic 3 | DONE | No impact; Story 3-1 delivered the agent as-designed, now superseded by this proposal |
| Epic 4 | Backlog | No impact — chat + presence are pure server/web |
| Epic 5 | Backlog | No impact — moderation + roles are pure server/web |
| **Epic 6** | **Backlog** | **Fully redefined** — see detailed changes below |

### Story Impact

**Removed stories (no longer applicable):**
- `6-1-update-manlycam-self-update-command` — removes the Go binary, removes the need for self-update
- `6-3-captive-portal-for-wifi-configuration` — deferred entirely to wifi-connect; documentation only

**Replaced/expanded stories:**
- `6-2-install-script-and-operator-readme` → expanded and split into two focused stories

**New stories:**
- `6-1-remove-go-agent-from-monorepo` — delete `apps/agent/`, remove `agent.yml`, clean up workspace and any unused env vars (e.g., `AGENT_API_KEY` if no longer used)
- `6-2-pi-install-script` — bash install script: downloads + installs frpc and mediamtx, generates config files from `--endpoint <url>` flag, creates systemd service units for both, enables and starts services; includes uninstall counterpart
- `6-3-operator-documentation` — full operator README: OS flash → camera verification → install script usage → service management → WiFi troubleshooting with wifi-connect guide → update and uninstall procedures

### Artifact Conflicts

| Artifact | Conflict | Action |
|---|---|---|
| `prd.md` | FR45–FR51 reference "Pi agent binary"; FR49 is N/A; FR51 captive portal N/A; FR54 references agent CI | Update FRs — see Section 4 |
| `architecture.md` | `apps/agent (Go)` in monorepo; agent CI/CD section; Pi-side description as "single compiled binary" | Update — see Section 4 |
| `epics.md` | Epic 6 description, story list, FR coverage map entries | Rewrite — see Section 4 |
| `sprint-status.yaml` | Epic 6 story keys | Replace — see Section 4 |
| `apps/agent/` (code) | Dead code — Go agent source | Remove in Story 6-1 |
| `.github/workflows/agent.yml` | CI pipeline for removed component | Remove in Story 6-1 |
| `apps/server/src/env.ts` | `AGENT_API_KEY` may be unused post-agent | Audit in Story 6-1; remove if unused |

### Technical Impact

- **Monorepo:** `apps/agent/` workspace removed; pnpm workspace config updated; Go toolchain no longer required in CI
- **CI:** `agent.yml` workflow removed; no more ARM cross-compile or GitHub Releases for agent
- **Server:** `FRP_STREAM_PORT` and `FRP_API_PORT` env vars remain (frpc still tunnels — just managed by systemd); `AGENT_API_KEY` requires audit
- **Pi deployment:** frpc and mediamtx become direct systemd services; config files are their own native formats (`frpc.toml`, `mediamtx.yml`) — no wrapper binary
- **Stream pipeline:** Unchanged — frpc tunnel + mediamtx RTSP→WHEP relay still works exactly the same; the removal is the management layer only

---

## Section 3: Recommended Approach

**Recommendation: Direct Adjustment (Option 1)**

Redefine Epic 6 in-place. The existing Epic 4 and 5 backlogs are unaffected and can proceed normally. Epic 6 work begins with a cleanup story (remove dead code), followed by the install script and documentation.

**Rationale:**

| Factor | Assessment |
|---|---|
| Implementation effort | Low-Medium — mostly deletion + shell script + markdown |
| Technical risk | Low — removing complexity, not adding it |
| Timeline impact | Net positive — Epic 6 scope shrinks significantly |
| Team morale | Positive — "we recognized we were over-engineering and fixed it" |
| Long-term maintainability | Strongly positive — no custom binary to maintain, update, or distribute |
| Stakeholder expectations | Neutral — product capabilities unchanged; Pi setup is simpler |

**What changes:** How the Pi is set up. frpc and mediamtx go from "supervised by a Go binary" to "two systemd services." The end result is identical from the stream's perspective.

**What doesn't change:** The stream pipeline, server, web app, auth, chat, moderation — nothing visible to viewers or admin is affected.

---

## Section 4: Detailed Change Proposals

### 4.1 — PRD Changes (`prd.md`)

**FR45** — Pi stream tunnel

```
OLD:
FR45: The Pi agent establishes and maintains an frp stream proxy tunnel to the upstream server on boot

NEW:
FR45: frpc is installed as a systemd service on the Pi and establishes the stream proxy tunnel to
the upstream server automatically on boot, with restart-on-failure
```

**FR46** — Pi API tunnel

```
OLD:
FR46: The Pi agent establishes and maintains an frp API proxy tunnel to the upstream server on boot,
enabling camera control commands from the backend

NEW:
FR46: frpc is configured with an API proxy tunnel to the upstream server on boot, enabling camera
control commands from the backend to reach mediamtx's HTTP API on the Pi
```

**FR47** — Pi service management

```
OLD:
FR47: The Pi agent is managed by systemd with automatic restart-on-failure

NEW:
FR47: frpc and mediamtx are each managed as independent systemd services with automatic
restart-on-failure; transient crashes in either service do not require manual intervention
```

**FR48** — Pi sensitive config

```
OLD:
FR48: The Pi agent reads sensitive configuration (upstream server address, auth tokens) from a
separate config file that is not bundled in the binary or CI artifacts

NEW:
FR48: All Pi-side sensitive configuration (upstream server address, frp auth tokens) is stored in
frpc.toml and mediamtx.yml — native config files for each tool, with restricted filesystem
permissions; no credentials are stored in any CI artifact
```

**FR49** — Self-update command

```
OLD:
FR49: Administrators can update the Pi agent via `update-manlycam`, which compares the installed
version against the latest GitHub release, downloads the artifact if newer, and restarts the service

NEW:
FR49: REMOVED — The Go agent binary is eliminated; frpc and mediamtx are updated via standard
system package management; the install script can be re-run to reconfigure services
```
*(Remove FR49 entirely from the FR list; renumber or mark N/A)*

**FR50** — Install script + README

```
OLD:
FR50: The Pi agent includes an install script and README covering the full bootstrap flow
(OS flash → camera verification via `rpicam-still` → endpoint configuration via `--endpoint <url>`)

NEW:
FR50: An install script and operator README cover the full bootstrap flow: OS flash → camera
verification (`rpicam-still`) → frpc and mediamtx installation and systemd service configuration
via `./install.sh --endpoint <url>`; an uninstall script provides clean removal
```

**FR51** — Captive portal

```
OLD:
FR51: The Pi agent activates a captive portal for WiFi configuration when it cannot connect to a
known network; the captive portal loosely follows the branding and theming guidelines of the main
web interface

NEW:
FR51: WiFi configuration on a new Pi is handled via the operator's choice of tool; the operator
documentation optionally covers wifi-connect (https://github.com/balena-os/wifi-connect) as one
approach — it is not required, and operators who configure WiFi via other means (Pi Imager
preconfiguration, wpa_supplicant, etc.) are fully supported; no custom captive portal is
implemented
```

**FR54** — CI/CD pipeline (Pi agent section)

```
OLD:
FR54: GitHub Actions produces cross-compiled ARM binaries for the Pi agent with automatic semver
versioning and GitHub Releases; CI artifacts contain no PII or sensitive configuration

NEW:
FR54: The Go agent workspace (`apps/agent/`) and its CI pipeline (`agent.yml`) are removed from
the monorepo; the Pi is configured via an install script, not a distributed binary
```

*(Remove the agent CI references from the IoT/Pi section of the PRD entirely; retain the monorepo scaffold description without the Go agent workspace)*

---

### 4.2 — Architecture Changes (`architecture.md`)

**Monorepo structure**

```
OLD:
- Pnpm monorepo with workspaces: `apps/agent` (Go), `apps/server` (Hono/Node.js),
  `apps/web` (Vue 3/Vite), `packages/types` (shared TypeScript types)
- Pi agent initialized via `go mod init`; `github.com/spf13/cobra` for CLI

NEW:
- Pnpm monorepo with workspaces: `apps/server` (Hono/Node.js), `apps/web` (Vue 3/Vite),
  `packages/types` (shared TypeScript types)
- The Go agent workspace (`apps/agent/`) is removed; the Pi is configured via an install script
```

**Pi-side deployment description**

```
OLD:
- The Pi runs a single compiled binary managed by systemd
- Install path: /opt/manlycam/ (standard for non-package-managed binaries)
- systemd unit starts the binary on boot; responsible for restart-on-failure
- Sensitive configuration stored in a separate config file on the Pi — never baked into the binary
- GitHub Actions builds Pi binaries (cross-compiled for ARM); CI artifacts contain no PII
- A CLI helper command (e.g. `manlycam download-latest`) pulls the latest binary from CI and
  restarts the service — primary update mechanism

NEW:
- The Pi runs frpc and mediamtx as two independent systemd services (no custom binary)
- frpc.toml: frp client config (server address, auth token, tunnel definitions)
- mediamtx.yml: mediamtx config (rpiCamera source, RTSP/WHEP settings, HTTP API)
- Both services managed by systemd with restart-on-failure; enabled on boot
- Sensitive configuration lives in each tool's native config file, restricted permissions
- No custom CI artifact; frpc and mediamtx installed via install script (download from upstream
  GitHub Releases)
- Update path: re-run install script or update binaries directly; no custom update mechanism
```

**CI/CD section**

```
OLD:
- Path-filtered GitHub Actions: `agent.yml`, `server.yml`, `web.yml`, `types.yml`
- Agent: semver tags required (for `--self-update` version comparison); GitHub Releases with ARM artifact

NEW:
- Path-filtered GitHub Actions: `server.yml`, `web.yml`, `types.yml`
- `agent.yml` is removed; no Pi binary artifact published from this repository
```

**`AGENT_API_KEY` env var**

```
OLD:
AGENT_API_KEY env var: used to authenticate agent HTTP API calls to the server

NEW:
Audit required: if AGENT_API_KEY was only used by the Go agent → server call path
(which was never built per Story 3.6 notes), this env var can be removed from env.ts
and .env.example. Confirm during Story 6-1.
```

---

### 4.3 — Epics.md Changes

**Epic 6 description (rewrite)**

```
OLD:
### Epic 6: Pi Agent Operational Tooling

The admin can bootstrap a new Pi from scratch, update the agent in the field via a single command,
and recover WiFi connectivity without SSH. First-time setup is fully documented; subsequent
updates are self-contained and automated.

FRs covered: FR49, FR50, FR51

---

Stories:
- 6-1: `update-manlycam` self-update command
- 6-2: Install script + operator README
- 6-3: Captive portal for WiFi configuration

NEW:
### Epic 6: Pi Operational Tooling

Any operator can bootstrap a Raspberry Pi Zero W 2 as a ManlyCam camera node from scratch using
a single install script. The script installs frpc and mediamtx, configures each with correct
defaults for ManlyCam, and registers both as systemd services. WiFi configuration is handled by
the operator's tool of choice (wifi-connect documented and recommended). Complete documentation
covers initial setup, service management, troubleshooting, and clean uninstall.

FRs covered: FR45, FR46, FR47, FR48, FR50, FR51 (FR49 removed; FR54 agent section N/A)

---

Stories:
- 6-1: Remove Go Agent from Monorepo
- 6-2: Pi Install and Uninstall Script
- 6-3: Operator Documentation
```

**Story 6-1 (new)**

```
### Story 6-1: Remove Go Agent from Monorepo

As a **developer**,
I want the Go agent workspace and its CI pipeline removed from the monorepo,
So that the codebase reflects the current architecture and there is no dead code to maintain.

Acceptance Criteria:
- apps/agent/ directory is deleted
- .github/workflows/agent.yml is deleted
- pnpm-workspace.yaml no longer references apps/agent
- AGENT_API_KEY is removed from apps/server/src/env.ts and .env.example if confirmed unused
  (verify no remaining server-side code sends or validates this header)
- pnpm install passes with no workspace errors
- server CI and web CI still pass; no broken imports or references to agent
- Architecture.md is updated to reflect the removal (Pi deployment section + CI section)
```

**Story 6-2 (new)**

```
### Story 6-2: Pi Install and Uninstall Script

As an **operator**,
I want a single install script that configures frpc and mediamtx as systemd services,
So that I can get a Pi up and running as a ManlyCam camera node with one command.

Acceptance Criteria:
- install.sh accepts --endpoint <upstream-url> and --frp-token <token> flags
- Script downloads frpc and mediamtx binaries appropriate for Pi Zero W 2 (linux/arm)
- Generates frpc.toml with stream proxy and API proxy tunnel definitions
- Generates mediamtx.yml with rpiCamera source and RTSP/WHEP settings matching the production config
- Creates /etc/systemd/system/frpc.service and /etc/systemd/system/mediamtx.service units
- Enables and starts both services
- Idempotent: re-running updates config and restarts services without error
- uninstall.sh stops and disables both services, removes config files, removes binaries
- Both scripts tested on Raspberry Pi Zero W 2 running Raspberry Pi OS Lite (64-bit)
```

**Story 6-3 (new)**

```
### Story 6-3: Operator Documentation

As an **operator**,
I want complete documentation for the full Pi lifecycle,
So that I can set up, manage, and troubleshoot the camera node without requiring SSH expertise
or deep knowledge of frpc or mediamtx internals.

Acceptance Criteria:
- README covers: OS flash (Raspberry Pi Imager, SSH key setup) → camera verification
  (rpicam-still) → install script usage → confirming stream is live
- README covers service management: checking status, restarting, viewing logs (journalctl)
- README covers WiFi configuration: optional section noting wifi-connect as one approach;
  operators who configure WiFi via other means (Pi Imager preconfiguration, wpa_supplicant,
  etc.) require no additional steps
- README covers uninstall procedure
- README covers update procedure (how to get new frpc/mediamtx versions)
- README is accurate and tested against the actual install script from Story 6-2
```

**FR Coverage Map updates (epics.md)**

```
OLD:
| FR45 | Epic 3 | Pi agent frp stream proxy tunnel on boot |
| FR46 | Epic 3 | Pi agent frp API proxy tunnel on boot (camera control) |
| FR47 | Epic 3 | Pi agent systemd restart-on-failure |
| FR48 | Epic 3 | Pi agent config file separated from binary (no PII in CI) |
| FR49 | Epic 6 | `update-manlycam` self-update: version compare → download → restart |
| FR50 | Epic 6 | Install script + README: OS flash → camera verify → endpoint config |
| FR51 | Epic 6 | Captive portal for WiFi config on boot (unknown network) |
| FR54 | Epic 1 | GitHub Actions CI/CD: cross-compiled ARM binary, semver releases |

NEW:
| FR45 | Epic 6 | frpc systemd service: stream proxy tunnel on boot |
| FR46 | Epic 6 | frpc systemd service: API proxy tunnel on boot (camera control) |
| FR47 | Epic 6 | frpc + mediamtx systemd restart-on-failure |
| FR48 | Epic 6 | frpc.toml + mediamtx.yml: sensitive config in native config files |
| FR49 | N/A   | REMOVED — no Go binary; no self-update mechanism |
| FR50 | Epic 6 | Install script + README: OS flash → camera verify → frpc/mediamtx setup |
| FR51 | Epic 6 | WiFi config: operator's choice; wifi-connect optionally documented in README |
| FR54 | Epic 1 | GitHub Actions CI/CD: server + web Docker images; agent.yml removed |
```

---

### 4.4 — sprint-status.yaml Changes

```yaml
OLD (Epic 6 section):
  epic-6: backlog
  6-1-update-manlycam-self-update-command: backlog
  6-2-install-script-and-operator-readme: backlog
  6-3-captive-portal-for-wifi-configuration: backlog
  epic-6-retrospective: optional

NEW:
  epic-6: backlog
  6-1-remove-go-agent-from-monorepo: backlog
  6-2-pi-install-and-uninstall-script: backlog
  6-3-operator-documentation: backlog
  epic-6-retrospective: optional
```

---

## Section 5: Implementation Handoff

**Change scope classification: Major**

*Rationale:* This change touches the PRD, Architecture, Epics, sprint tracking, and requires code deletion in the monorepo. However, scope impact is bounded and clear; no implementation in Epics 4 or 5 is affected. The agent code removal (Story 6-1) can be done any time before Epic 6 begins.

**Handoff recipients and responsibilities:**

| Role | Responsibility |
|---|---|
| **Product Manager** | Approve FR updates in PRD (FR45–FR51, FR54) |
| **Architect** | Approve architecture.md updates (remove agent, describe frpc+mediamtx as systemd services) |
| **Scrum Master** | Update epics.md Epic 6 section and sprint-status.yaml after approval |
| **Dev** | Implement Story 6-1 (agent removal) before Epic 6 kickoff; implement 6-2 and 6-3 during Epic 6 |

**Recommended sequencing:**
1. Approve this proposal → update all planning artifacts
2. Implement Story 6-1 (agent removal) as a standalone housekeeping task — can happen before, during, or after Epics 4/5
3. Execute Epics 4 and 5 normally — no blockers from this change
4. Execute Epic 6 (6-2 and 6-3) as planned

**Success criteria:**
- All planning artifacts reflect the new architecture (no references to Go agent binary, self-update command, or custom captive portal)
- `apps/agent/` and `agent.yml` removed from monorepo; CI still passes
- Epic 6 stories are scoped to install script + documentation only
- A new Pi can be bootstrapped to a live stream using only the install script and the operator README

---

## Section 6: Final Review Notes

| Checklist | Status |
|---|---|
| 1.1 Triggering story identified | ✅ Epic 3 retrospective (3-1 → 3-6 collectively) |
| 1.2 Issue type categorized | ✅ Strategic pivot / scope collapse |
| 1.3 Evidence documented | ✅ Retro document, Story 3-6 notes, architecture pivot records |
| 2.1–2.5 Epic impact assessed | ✅ Epic 6 fully redefined; Epics 1–5 unaffected |
| 3.1 PRD conflicts identified | ✅ FR45–FR51, FR54 — all change proposals written |
| 3.2 Architecture conflicts identified | ✅ Monorepo, Pi description, CI section — all change proposals written |
| 3.3 UX conflicts | ✅ N/A — UX spec has no Pi agent content |
| 3.4 Other artifacts | ✅ sprint-status.yaml, `apps/agent/`, `agent.yml` |
| 4.4 Path forward selected | ✅ Direct Adjustment |
| 5.1–5.5 Proposal components complete | ✅ All sections present |
| 6.4 sprint-status.yaml update ready | ✅ Exact YAML change specified |

---

*Sprint Change Proposal generated by correct-course workflow — 2026-03-08*
