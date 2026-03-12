# Story 6.4: Implement Root README with Architectural Overview

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer or visitor**,
I want a comprehensive root README with high-level architecture and dynamic status shields,
so that I can quickly understand the project's purpose, technical stack, and health at a glance.

## Acceptance Criteria

1. **Given** a user visits the repository root, **When** the README.md is viewed, **Then** it contains a high-level project intro, a photo of Manly in `docs/assets/manly.jpg`, and a set of "fancy shields" (CI Status, License, TypeScript, Node.js, Vue.js, Raspberry Pi).
2. **Given** the code coverage shield in the README, **When** a CI run completes on the `main` branch, **Then** the shield dynamically updates to reflect the latest line coverage percentage extracted from the Vitest reports (using a GitHub Gist or similar dynamic endpoint).
3. **Given** the architecture section of the README, **When** viewed in a browser that supports Mermaid, **Then** a Mermaid diagram renders showing the end-to-end pipeline: Pi Camera → mediamtx (Pi) → frp tunnel → mediamtx (Server) → WebRTC WHEP → Vue SPA.
4. **Given** the monorepo structure, **When** the README is viewed, **Then** it contains deep links to `apps/server/README.md`, `apps/web/README.md`, and `pi/README.md` with brief descriptions of each component's role.
5. **Given** the requirements section, **When** viewed, **Then** it lists the high-level prerequisites for running the full stack (Node.js, Docker, Raspberry Pi hardware).

## Tasks / Subtasks

- [x] Task 1: Create the root `README.md` structure (AC: #1, #4, #5)
  - [x] Add project title and intro
  - [x] Embed `docs/assets/manly.jpg`
  - [x] Add "Fancy Shields" section (CI, License, TS, Node, Vue, Pi)
  - [x] Add monorepo component deep links with descriptions
  - [x] Add prerequisites/requirements section

- [x] Task 2: Implement Mermaid architecture diagram (AC: #3)
  - [x] Create a sequence or flowchart diagram in Mermaid
  - [x] Cover the path: Pi Camera → mediamtx (Pi) → frp tunnel → mediamtx (Server) → WebRTC WHEP → Vue SPA

- [x] Task 3: Set up dynamic coverage shield (AC: #2)
  - [x] Update `.github/workflows/server-ci.yml` to extract coverage percentages from `coverage-summary.json`
  - [x] Implement a mechanism (e.g., `Schneegans/dynamic-badges-action` + Gist) to update the coverage badge dynamically on `main` branch pushes

## Dev Notes

- **Architecture Diagram**: Use Mermaid `graph LR` or `sequenceDiagram`. Ensure it reflects the mediamtx-based WebRTC pipeline confirmed in Epic 3 retrospective and Story 6-3.
- **Coverage Shield**: The `server-ci.yml` already runs Vitest with `json-summary` reporter. You'll need to combine coverage from `apps/server` and `apps/web` or show them as separate shields. The AC implies a single line coverage percentage; you can average them or pick the lowest.
- **Dynamic Badge**: A common pattern is using `Schneegans/dynamic-badges-action`. It requires a GITHUB_TOKEN with gist permission and a GIST_ID. You may need to ask the user to provide a Gist ID or set up the token.
- **Shields**: Use [Shields.io](https://shields.io/) for static shields.

### Project Structure Notes

- **Monorepo links**:
  - `apps/server/` — Hono API + WebSocket + stream relay + admin CLI
  - `apps/web/` — Vue 3 + Vite SPA
  - `pi/` — Pi-side install scripts and operator documentation
  - `packages/types/` — Shared TypeScript types

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-6.4] — Story details and ACs
- [Source: _bmad-output/planning-artifacts/architecture.md#Architecture-Decision-Document] — Current architecture and mediamtx pivot details
- [Source: _bmad-output/planning-artifacts/prd.md#Product-Requirements-Document---ManlyCam] — Project vision and success criteria
- [Source: .github/workflows/server-ci.yml] — Existing CI pipeline with Vitest coverage reporting
- [Source: apps/web/vite.config.ts] — Web coverage configuration and thresholds
- [Source: docs/assets/manly.jpg] — Image location for AC #1

## Dev Agent Record

### Agent Model Used

gemini-2.0-flash-thinking-exp-01-21

### Debug Log References

- [2026-03-12 11:00] Created root README.md with intro, mermaid diagram, shields, and requirements.
- [2026-03-12 11:10] Updated .github/workflows/server-ci.yml with coverage extraction and dynamic badge update steps.

### Completion Notes List

- Root README.md created with high-level architecture diagram.
- CI pipeline now calculates average code coverage and updates a dynamic shield.
- Documentation added to README on how to configure Gist-based shields.
- Cleaned up monorepo structure links to remove dead/empty READMEs and pointed to `docs/deploy/README.md`.
- Added "✨ Inspiration" section to root README.md describing project's organic origins.

### File List

- `README.md`
- `.github/workflows/server-ci.yml`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/6-4-implement-root-readme-with-architectural-overview.md`
- `docs/deploy/README.md` (referenced)
- `pi/README.md` (referenced)
