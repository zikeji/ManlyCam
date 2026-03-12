# Sprint Change Proposal: Root Documentation and Architectural Visualization

**Date:** 2026-03-11
**Status:** Draft
**Related Epic:** Epic 6 (Pi Operational Tooling)

## 1. Issue Summary
The ManlyCam monorepo currently lacks a central entry point. While the Raspberry Pi setup, server, and web applications have individual documentation, there is no high-level `README.md` at the project root to explain the overall architecture, project goals, and multi-component relationship.

## 2. Impact Analysis
- **Epic Impact:** Adds Story 6-4 to Epic 6. This story completes the "Operational Tooling" theme by providing the "Front Door" to the project.
- **Story Impact:** New story 6-4.
- **Artifact Conflicts:** None. This is an additive documentation task.
- **Technical Impact:** No code changes; assets will be stored in `docs/assets/`.

## 3. Recommended Approach: Direct Adjustment
Add Story 6-4 to the current sprint to implement the root `README.md`.

**Rationale:**
Providing a clear architectural overview via Mermaid diagrams and a central "Why" statement (including the project's mascot) is critical for long-term maintainability and for any external contributors or operators.

## 4. Detailed Change Proposals

### Story: [6-4] Implement Root README with Architectural Overview
**Section:** New Story

**Proposed Content:**
- **Intro:** Why ManlyCam exists (Social ritual for a senior deaf dog).
- **Visuals:** Project mascot photo in `docs/assets/manly.jpg`.
- **Badges:** CI Status, License, Tech Stack (TS, Node, Vue, Pi), and **Dynamic** Code Coverage.
- **Automation:** Update `server-ci.yml` and `web-ci.yml` to extract coverage percentages and push to a GitHub Gist for a real-time badge.
- **Architecture:** Mermaid diagram showing the mediamtx/frp pipeline (Pi Camera → frp tunnel → Upstream mediamtx → WebRTC WHEP → Vue SPA).
- **Navigation:** Deep links to `apps/server/README.md`, `apps/web/README.md`, and `pi/README.md`.
- **Requirements:** Basic prerequisites for the full stack.

**Effort Estimate:** Low
**Risk Level:** Low

## 5. Implementation Handoff
- **Scope:** Minor
- **Recipient:** Development Team
- **Success Criteria:** Root `README.md` exists, Mermaid diagram renders correctly, dog photo is visible, and all shields reflect current project status.
