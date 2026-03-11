# Sprint Change Proposal — Epic 6 Scope Expansion

**Date:** 2026-03-11
**Proposed by:** Zikeji
**Change Scope:** Minor
**Status:** Pending approval

---

## Section 1: Issue Summary

Three scope gaps were identified in Epic 6 during pre-sprint planning review, before any story files have been created and all stories remain in `backlog` status.

**Gap 1 — Story 6-1 scope too narrow:**
The story only covers removing the Go agent. However, `apps/server/src/services/streamService.ts` still spawns mediamtx as a child subprocess with full lifecycle management: a supervisor loop, dynamic config generation (`buildMTXConfig()`), temp directory creation, and process supervision via `ChildProcess`. This server-side wrapping is unnecessary complexity — mediamtx should run as an independent external service (Docker Compose or systemd), not a subprocess managed by Hono. Additionally, `hls.js` (`^1.5.0`) remains in `apps/web/package.json` despite HLS being fully removed in Story 3-2c in favor of WebRTC WHEP. It is an unused, stale dependency.

**Gap 2 — No story covers Docker Compose mediamtx integration:**
When mediamtx is extracted from the server process, the deploy-time compose example must include a mediamtx service definition. No story currently owns this artifact. It belongs in 6-1 as an infrastructure deliverable alongside the code cleanup.

**Gap 3 — Story 6-3 scope too narrow:**
The story only covers Pi operator documentation. There is no story covering server-side operator documentation: what mediamtx does in the server context, how to run it via Docker Compose (referencing 6-1 artifacts), and how to set it up manually for operators not using Docker.

**Discovery context:** Pre-implementation planning review. No Epic 6 story files exist yet. Zero implementation to rework — all changes are to backlog story specs and planning artifacts.

---

## Section 2: Impact Analysis

### Epic Impact

- **Epic 6** can complete as originally planned — no new epics, no resequencing required
- **Story 6-1** gains significant additional scope (mediamtx extraction is a non-trivial refactor of `streamService.ts`; compose example is a new deliverable; hls.js removal is minor)
- **Story 6-3** gains additive scope (server-side mediamtx setup docs, both Docker and non-Docker paths)
- **Story 6-2** is completely unaffected
- **Sequencing unchanged:** 6-1 → 6-2 → 6-3 (6-3 docs reference 6-1 compose artifacts)

### Artifact Conflicts

| Artifact | Change Required |
|---|---|
| `_bmad-output/planning-artifacts/epics.md` | Update story 6.1 goal + ACs; update story 6.3 goal + ACs |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Update story 6-1 key to reflect new title |
| `_bmad-output/planning-artifacts/architecture.md` | Update server CI/CD table (no longer "Node.js + mediamtx" image); add mediamtx compose service to component map |
| `apps/server/src/services/streamService.ts` | Remove subprocess management code (implementation, not doc change) |
| `apps/server/src/routes/stream.ts` | WHEP proxy URL source changes to use configurable env var (implementation) |
| `apps/server/src/env.ts` | Replace or rename MTX port vars with URL vars (implementation) |
| `apps/web/package.json` | Remove `hls.js` (implementation) |
| Docker Compose example file(s) | Add mediamtx service (new artifact, created in 6-1) |

### Technical Impact

**`streamService.ts` loses:**
- `buildMTXConfig()` — dynamic YAML generation
- `supervisorLoop()` — subprocess restart loop
- `runMediamtx()` — `spawn()` wrapper with process event handlers
- `ChildProcess` import and `proc` field
- `configDir` temp directory creation and cleanup

**`streamService.ts` retains (behavior unchanged):**
- `pollLoop()` and `pollMediamtxState()` — polls external mediamtx API
- `reapplyCameraSettings()` — proxies PATCH to Pi mediamtx via frp tunnel
- Admin toggle, state broadcasting, `getState()`, `isPiReachable()`

**`stream.ts` change:** `mtxWhepBase()` changes from `http://127.0.0.1:${env.MTX_WEBRTC_PORT}/cam/whep` to a configurable env var URL.

**`env.ts` change:** `MTX_WEBRTC_PORT` and `MTX_API_PORT` (127.0.0.1-assumed) replaced by `MTX_API_URL` and `MTX_WEBRTC_URL` (full base URLs, configurable for local dev and Docker Compose).

**Server Docker image:** No longer needs mediamtx binary on PATH. Dockerfile and server-ci.yml description should reflect this.

**PRD impact:** None — FR54 already acknowledges mediamtx as a separate service. No PRD goals affected.

**UX/UI impact:** None.

---

## Section 3: Recommended Approach

**Option 1: Direct Adjustment** — Expand story scopes for 6-1 and 6-3; update planning and architecture docs.

**Rationale:**
- All Epic 6 stories are in `backlog` with no story files created — zero cost to change
- mediamtx extraction is architecturally clean: remove subprocess lifecycle code, add env vars pointing to external mediamtx, update poll/proxy URLs — the public API of `streamService` and `stream.ts` routes is unchanged
- `hls.js` removal is a one-line package.json change plus verifying no imports remain
- Docker Compose mediamtx service definition is a config artifact, not novel engineering
- 6-3 scope expansion is purely additive documentation work

**Effort:** Low-to-moderate (6-1 refactor is the largest item; 6-3 is more docs to write)
**Risk:** Low (no completed work touched; no test logic changes; streamService public API unchanged)
**Timeline impact:** Minimal — 6-1 becomes a larger but still focused story

---

## Section 4: Detailed Change Proposals

---

### 4.1 — Story 6.1: Goal Update

**Story:** 6-1
**Section:** User Story (goal statement)

**OLD:**
```
As a developer,
I want the Go agent workspace and its CI pipeline removed from the monorepo,
So that the codebase reflects the current architecture and there is no dead code to maintain.
```

**NEW:**
```
As a developer,
I want the Go agent removed, the server-side mediamtx subprocess extracted to a standalone
service, and unused dependencies cleaned up,
So that the codebase reflects the current architecture with no dead code, no unnecessary
process-supervision complexity, and no stale dependencies.
```

**Rationale:** Story scope now covers three cleanup items: Go agent removal, mediamtx subprocess extraction, and hls.js removal.

---

### 4.2 — Story 6.1: Existing Acceptance Criteria (retain as-is)

All four existing ACs are retained unchanged:

```
Given the apps/agent/ directory exists in the monorepo
When Story 6.1 is complete
Then apps/agent/ is deleted, .github/workflows/agent.yml is deleted,
and pnpm-workspace.yaml no longer references apps/agent

Given AGENT_API_KEY exists in apps/server/src/env.ts
When an audit confirms it is unused (no server-side code sends or validates this header
post-agent removal)
Then AGENT_API_KEY is removed from env.ts, .env.example, and agentAuth.ts middleware is removed

Given the cleanup is complete
When pnpm install is run from the repo root
Then workspace resolves without errors; no broken imports or references to the agent remain

And server CI and web CI still pass after the removal
```

---

### 4.3 — Story 6.1: New Acceptance Criteria (mediamtx extraction)

**ADD** the following ACs after the existing ones:

```
Given streamService.ts currently spawns mediamtx as a child process
When Story 6.1 is complete
Then buildMTXConfig(), supervisorLoop(), runMediamtx(), the ChildProcess import,
the proc field, and all configDir temp directory logic are removed from streamService.ts;
the server no longer spawns or supervises any mediamtx process

Given mediamtx is no longer spawned by the server
When the server starts
Then streamService polls the external mediamtx API using MTX_API_URL (new env var,
e.g. "http://127.0.0.1:9997" for local dev, "http://mediamtx:9997" in Docker Compose)
and the WHEP proxy in stream.ts forwards to MTX_WEBRTC_URL (new env var,
e.g. "http://127.0.0.1:8888" for local dev, "http://mediamtx:8888" in Docker Compose)

Given a Docker Compose example file exists (or is created at docker-compose.example.yml
or similar)
When Story 6.1 is complete
Then the compose file includes a named mediamtx service with: an appropriate public image,
RTSP port (8554), WebRTC port (8888), API port (9997), a mediamtx.yml config volume
mounting the server-side config, and restart: unless-stopped

And a mediamtx.yml example config is included in the repository (e.g. at
deploy/mediamtx.yml or alongside the compose file) configured for the server-side role:
RTSP source from frp tunnel → WebRTC WHEP output, all other protocols disabled

Given hls.js is listed as a dependency in apps/web/package.json
When Story 6.1 is complete
Then hls.js is removed from package.json, pnpm-lock.yaml is updated accordingly,
and no import of hls.js remains anywhere in apps/web/src/

And all existing server CI and web CI checks continue to pass
```

---

### 4.4 — Story 6.1: Dev Notes (add)

**ADD** the following Dev Notes section to story 6.1 (to be included when create-story generates the file):

```
## Dev Notes

### mediamtx extraction
- streamService.ts retains: pollLoop(), pollMediamtxState(), reapplyCameraSettings(),
  admin toggle, getState(), isPiReachable(), broadcastState() — all behavior unchanged
- stream.ts: mtxWhepBase() changes from hardcoded 127.0.0.1:${MTX_WEBRTC_PORT}
  to env.MTX_WEBRTC_URL (full base URL string, no port arithmetic needed)
- env.ts: Remove MTX_WEBRTC_PORT and MTX_API_PORT; add MTX_API_URL and MTX_WEBRTC_URL
  as zod url() or string() with sensible local-dev defaults
- The mediamtx.yml config previously generated by buildMTXConfig() should be
  provided as a static example file in the repo (e.g. deploy/mediamtx-server.yml)
  to document the required server-side mediamtx configuration for 6-3 docs reference
- Server Dockerfile: remove any mediamtx binary installation step if present
- streamService.test.ts: update fetch mock URLs to match new MTX_API_URL env var pattern
```

---

### 4.5 — Story 6.1: Title in sprint-status.yaml

**File:** `_bmad-output/implementation-artifacts/sprint-status.yaml`

**OLD key:**
```yaml
  6-1-remove-go-agent-from-monorepo: backlog
```

**NEW key:**
```yaml
  6-1-remove-go-agent-extract-mediamtx-clean-dependencies: backlog
```

**Rationale:** Key mirrors story title per project convention; updated to reflect expanded scope.

---

### 4.6 — Story 6.3: Goal Update

**Story:** 6-3
**Section:** User Story (goal statement)

**OLD:**
```
As a Pi operator,
I want complete documentation for the full Pi lifecycle,
So that I can set up, manage, and troubleshoot the camera node without requiring deep
knowledge of frpc or mediamtx internals.
```

**NEW:**
```
As an operator (Pi or server),
I want complete documentation covering both the Pi lifecycle and the server-side
mediamtx setup,
So that I can deploy the full ManlyCam stack — Pi camera node through to server
infrastructure — without requiring deep knowledge of frpc, mediamtx, or Docker internals.
```

**Rationale:** 6-3 is the general operator documentation story; server-side setup docs belong here alongside Pi docs.

---

### 4.7 — Story 6.3: Existing Acceptance Criteria (retain as-is)

All existing Pi-facing ACs are retained unchanged (pi/README.md bootstrap, service management, WiFi config, lifecycle/uninstall, and accuracy requirement against Story 6.2 install script).

---

### 4.8 — Story 6.3: New Acceptance Criteria (server-side docs)

**ADD** the following ACs after the existing ones:

```
Given an operator reads the server setup section of the documentation
When they follow the Docker Compose path
Then the documentation explains what mediamtx does in the server context (ingests RTSP
from the Pi via frp tunnel, re-publishes as WebRTC WHEP for browsers), references the
compose example and mediamtx.yml config produced in Story 6-1, and lists the required
server env vars (MTX_API_URL, MTX_WEBRTC_URL, FRP_HOST, FRP_RTSP_PORT, FRP_API_PORT)
with example values

Given an operator who does not use Docker reads the server setup documentation
When they follow the non-Docker / bare-metal path
Then the documentation provides freeform instructions for: downloading and installing
the mediamtx binary, the minimum mediamtx.yml configuration needed for the server role
(reference the example from Story 6-1), and running mediamtx as a systemd service
on the server host

And the server-side documentation clearly cross-references the Pi README (Story 6-2
output) so an operator can follow both documents together to bring up the full stack
```

---

### 4.9 — Architecture Doc: CI/CD Table

**File:** `_bmad-output/planning-artifacts/architecture.md`
**Section:** CI/CD Strategy table

**OLD:**
```
| `server-ci.yml` | `apps/server/**` | lint (ESLint), typecheck (tsc --noEmit), test (Vitest), build Docker image (Node.js + mediamtx), push to registry, rolling deploy |
```

**NEW:**
```
| `server-ci.yml` | `apps/server/**` | lint (ESLint), typecheck (tsc --noEmit), test (Vitest), build Docker image (Node.js), push to registry, rolling deploy |
```

**Rationale:** After Story 6-1, mediamtx runs as its own Docker Compose service. The server image no longer bundles or requires the mediamtx binary.

---

### 4.10 — Architecture Doc: Component Map

**File:** `_bmad-output/planning-artifacts/architecture.md`
**Section:** Architecture Component Map table

**ADD** row after the existing Pi setup row:

```
| Server mediamtx | mediamtx (Docker Compose service or systemd) | Ingests RTSP from Pi via frp tunnel → publishes WebRTC WHEP for browsers; HTTP API used by server for Pi reachability polling and camera settings forwarding |
```

**Rationale:** mediamtx on the server side was always logically a separate process; Story 6-1 formalizes it as an independent compose service. The architecture component map should reflect it explicitly.

---

## Section 5: Implementation Handoff

**Change scope classification:** Minor — all changes are to backlog story specs and planning docs; development team implements directly from expanded ACs.

**Sequencing (unchanged):** 6-1 → 6-2 → 6-3
- 6-3 references compose artifacts and mediamtx.yml produced in 6-1; 6-3 must come after 6-1
- 6-2 is independent but logically before 6-3 (6-3 docs reference the install script)

**Development team responsibilities:**
- **6-1:** Remove Go agent; extract mediamtx subprocess to external service; update env vars; add compose example + mediamtx.yml example; remove hls.js
- **6-2:** Unchanged — Pi install script
- **6-3:** Write expanded docs (Pi lifecycle docs + server-side mediamtx Docker and non-Docker setup)

**Success criteria:**
- After 6-1: `streamService.ts` contains no `spawn()`, no supervisor loop, no temp config; server starts cleanly with external mediamtx; `hls.js` absent from `package.json`; compose example includes mediamtx service; all CI passes
- After 6-3: An operator can deploy the full ManlyCam stack (Pi + server) using only the documentation, with both Docker Compose and bare-metal server paths explicitly covered
