---
workflowType: 'correct-course'
date: '2026-03-07'
epic: 'Epic 1: Monorepo Foundation & CI/CD'
trigger: 'Epic 1 completion with unplanned additions'
scope: 'Minor'
status: 'pending-approval'
---

# Sprint Change Proposal: Epic 1 Documentation Updates

**Date:** 2026-03-07
**Project:** ManlyCam
**Epic:** Epic 1 - Monorepo Foundation & CI/CD
**Proposer:** Caleb (Zikeji)
**Approval Status:** Pending

---

## Section 1: Issue Summary

### Change Trigger

Epic 1 (Monorepo Foundation & CI/CD) has been completed with all 5 planned stories done. During implementation, two significant additions were made that were not part of the original planning:

1. **Story 1-3b: ESLint Root Configuration** (Unplanned)
   - **Trigger:** Story 1-3 (GitHub Actions CI/CD) created workflows that call lint scripts, but no ESLint configuration existed
   - **Resolution:** Implemented as quick-dev tech spec; added root `.eslintrc.json` with airbnb-base + @typescript-eslint + Prettier
   - **Status:** Complete with all acceptance criteria met

2. **frps Configuration in Story 1-4** (Enhanced Scope)
   - **Trigger:** Deployment reference configs needed server-side frp configuration examples (not just mentions)
   - **Resolution:** Added `apps/server/deploy/frps.toml` examples (root + traefik variants) with comprehensive documentation
   - **Status:** Complete; included in Story 1-4 implementation

### Context

These additions were necessary to unblock development:
- **ESLint:** CI pipelines require working lint configuration; missing config prevented PR merges
- **frps:** Deployment guides must include server-side configuration for complete deployment picture

Both additions align with Epic 1's goal of providing complete foundation for subsequent epics.

### Evidence

- **Sprint Status:** `epic-1` marked `in-progress` with all 5 stories `done` + 1 unplanned story (1-3b) complete
- **Implementation Artifacts:**
  - `tech-spec-eslint-root-config.md` (Story 1-3b)
  - `1-4-create-deployment-reference-configs-and-environment-templates.md` (Story 1-4 includes frps.toml)
- **Git Commits:** Recent commits include ESLint configuration and deployment configs

---

## Section 2: Impact Analysis

### Epic Impact Assessment

**Epic 1 Status:** ✅ **Complete**

All stories in Epic 1 are done and integrated:
- Story 1-1: Monorepo scaffolding ✅
- Story 1-2: Prisma schema ✅
- Story 1-3: GitHub Actions CI/CD ✅
- **Story 1-3b: ESLint root config ✅** (unplanned addition)
- Story 1-4: Deployment configs ✅ (enhanced with frps)

**Impact on Epic Completion:**
- No blockers introduced
- All acceptance criteria met across all stories
- Epic dependencies for Epic 2-6 are satisfied
- Can proceed to Epic 2 (Authentication) without delays

### Story Impact Assessment

**Story 1-3 (GitHub Actions CI/CD):**
- **Original AC:** Workflows run lint scripts ✓
- **Blocking Issue Resolved:** ESLint config now exists (Story 1-3b)
- **Impact:** Workflows will pass; no changes needed to 1-3 itself
- **Recommendation:** Add note to Story 1-3 documenting the unplanned follow-up

**Story 1-3b (ESLint Root Configuration) — New:**
- **Scope:** Create root ESLint config with airbnb-base + @typescript-eslint + Prettier
- **Acceptance Criteria:** All met
  - AC1: Root `.eslintrc.json` exists and is valid ✓
  - AC2: TypeScript parser correctly resolves .ts/.tsx files ✓
  - AC3: Server and Web lint without violations ✓
  - AC4: Prettier integration detects style issues ✓
  - AC5: CI workflows pass lint stage ✓
  - AC6: Airbnb-base rules enforced ✓
- **Dependencies:** Story 1-3 (CI workflows that call lint scripts)
- **Blocks:** All future Epic 2-6 development (CI requires lint to pass)

**Story 1-4 (Deployment Reference Configs):**
- **Original AC:** All met ✓
- **Enhancement:** Added `apps/server/deploy/frps.toml` examples (both docker-compose and traefik variants)
- **Impact:** Deployment documentation now complete; includes server-side frp configuration
- **Blocks Nothing:** Documentation-only enhancement
- **Enables:** Clear deployment path for both standard and Traefik-based setups

### Artifact Conflict Analysis

**No conflicts detected.** All changes are additive:

| Document | Change Type | Conflict Risk | Impact |
|---|---|---|---|
| **Architecture** | Added code quality section + frps config | None | Enhances completeness; documents decisions |
| **Epics** | Added Story 1-3b + notes | None | Reflects actual work; improves traceability |
| **PRD** | Added NFRs + tooling section | None | Strengthens non-functional requirements |
| **UX Design** | No changes | N/A | Remains current |

**PRD MVP Scope:** Not affected
- All Feature Requirements (FR1-55) remain unchanged
- Non-Functional Requirements expanded to include code quality (appropriate for MVP)
- MVP scope remains achievable

**Architecture Decisions:** Aligned
- Code quality section documents decisions already made
- frps configuration details documented decisions already implemented
- No architectural conflicts or technical debt introduced

**Deployment Readiness:** Enhanced
- frps.toml examples clarify server-side setup
- Deployment guides now complete for all three reverse proxy options
- Traefik and Docker Compose paths fully documented

---

## Section 3: Recommended Approach

### Path Forward: Direct Adjustment (with Documentation)

**Recommended Strategy:** Mark Epic 1 as complete with all stories documented; proceed to Epic 2 without replanning.

**Rationale:**
1. **Scope is minimal and necessary:** ESLint was blocking (unplannedbutnecessary); frps config was documentation enhancement
2. **All acceptance criteria met:** No incomplete work; all stories have clear completion status
3. **Timeline impact:** Zero — work already done; documentation updates are meta-level only
4. **Risk is low:** Code changes already committed; documentation updates clarify decisions already made
5. **Team confidence:** Documenting unplanned work transparently builds trust in planning process

### Implementation Approach

**Step 1: Documentation Updates (Completed)**
- ✅ Architecture: Added code quality section, frps configuration section, tech stack updates
- ✅ Epics: Added Story 1-3b entry, noted unplanned follow-up on Story 1-3, documented frps in Story 1-4
- ✅ PRD: Added code quality NFRs, development tooling section
- ✅ UX Design: Confirmed no changes needed

**Step 2: Sprint Status Updates**
- Update `sprint-status.yaml` to reflect Story 1-3b as complete formal story
- Mark epic-1 as "done" (all stories complete)
- Note optional epic-1-retrospective for post-epic review

**Step 3: Retrospective (Optional)**
- Capture learnings from unplanned work
- Document process improvements for future epics
- Discuss how to better anticipate dependencies (ESLint config for CI)

### Effort & Risk

| Aspect | Assessment |
|---|---|
| **Effort Estimate** | Low — documentation already written; updates are straightforward |
| **Timeline Impact** | None — work already complete; documentation is meta-level |
| **Technical Risk** | None — code changes already committed and tested |
| **Team Impact** | Positive — transparent documentation of process improves trust |
| **MVP Impact** | None — no feature changes; infrastructure enhancements only |

---

## Section 4: Detailed Change Proposals

### Update 1: Epic 1 Completion Status

**Before:**
```yaml
development_status:
  epic-1: in-progress
  1-1-initialize-monorepo-...: done
  1-2-configure-prisma-...: done
  1-3-set-up-github-actions-...: done
  1-3b-configure-eslint-root-config-...: [NOT LISTED]
  1-4-create-deployment-...: done
  epic-1-retrospective: optional
```

**After:**
```yaml
development_status:
  epic-1: done
  1-1-initialize-monorepo-with-application-scaffolds-and-shared-types: done
  1-2-configure-prisma-schema-with-all-data-models-and-initial-migration: done
  1-3-set-up-github-actions-ci-cd-pipelines: done
  1-3b-configure-eslint-root-config-with-modern-flat-config: done  # unplanned: CI lint steps required ESLint config
  1-4-create-deployment-reference-configs-and-environment-templates: done
  epic-1-retrospective: optional
```

**Rationale:** Reflects actual work completed; documents unplanned story transparently; marks epic as done.

---

### Update 2: Architecture Document

**Change Summary:**
- **Added:** Code Quality & Linting Strategy subsection (§4.5, after Key Technical Decisions table)
- **Added:** frps Server Configuration subsection (after Pi Agent configuration)
- **Updated:** Key Technical Decisions table with ESLint entries

**Old → New Examples:**

**Architecture — Code Quality:**
```markdown
[BEFORE: No code quality strategy documented]

[AFTER: New subsection added]
### Code Quality & Linting Strategy

**Approach:** Root-level ESLint configuration enforced across all apps/packages at Epic 1.

**Tooling Stack:**
- ESLint 9.x with airbnb-base config (opinionated, industry-standard JS rules)
- @typescript-eslint 7.x+ for type-aware linting
- Prettier 3.x code formatter, integrated as ESLint rule
- eslint-config-prettier to disable conflicting rules

[... complete subsection as detailed in batched edits ...]
```

**Architecture — frps Configuration:**
```markdown
[BEFORE: Architecture mentions frps tunnels conceptually but shows no configuration]

[AFTER: New subsection added]
### frps Server Configuration

**Overview:**
The upstream server runs `frps` (frp server) to receive tunnels from the Pi agent...

[Configuration file: apps/server/deploy/frps.toml]
[Tunnel configuration details]
[Deployment context]
[Security notes]
```

**Architecture — Key Technical Decisions Table:**
```markdown
[BEFORE]
| Monorepo | pnpm workspaces | Minimal tooling |
| Shared types | `packages/types` | WS shapes, role enums, stream state |

[AFTER]
| Monorepo | pnpm workspaces | Minimal tooling |
| Shared types | `packages/types` | WS shapes, role enums, stream state |
| Code linting | ESLint 9.x + airbnb-base | Root config; all apps/packages; enforced in CI |
| Type-aware linting | @typescript-eslint 7.x+ | Per-app tsconfig overrides; type safety in dev |
| Code formatting | Prettier 3.x | Integrated as ESLint rule; no manual formatting decisions |
```

---

### Update 3: Epics Document

**Change Summary:**
- **Added:** Story 1-3b as formal story entry (60 lines)
- **Updated:** Story 1-3 with unplanned follow-up note
- **Updated:** Story 1-4 with frps configuration notes

**Old → New Examples:**

**Epics — Story 1-3 Note:**
```markdown
[BEFORE: Story 1-3 ends without note about ESLint]

[AFTER: Note added after AC]
**Note — Unplanned Follow-up:**
During implementation of this story, CI workflows required ESLint configuration
that was not part of the original story scope. Story 1-3b was created to address
this blocking issue. Both stories are now complete and dependencies are resolved.
```

**Epics — Story 1-3b (New Entry):**
```markdown
### Story 1-3b: Configure ESLint Root Config with Modern Setup

**Status:** done

**Context:**
Story 1-3 created CI/CD workflows that invoke lint scripts
(`pnpm --filter @manlycam/server lint`, `pnpm --filter @manlycam/web lint`),
but no ESLint configuration existed at the project root. This story was created
as an unplanned follow-up to unblock linting in CI.

[Summary, Acceptance Criteria, Key Implementation Details, Rationale as detailed in batched edits]
```

**Epics — Story 1-4 frps Note:**
```markdown
[BEFORE: No mention of frps.toml in story notes]

[AFTER: Note added after acceptance criteria]
**Note — frps Configuration:**
This story includes server-side frp (fast reverse proxy) configuration examples
at `apps/server/deploy/frps.toml`. The frps server listens for connections from
the Pi agent (`frpc`) and exposes two tunnels:
- **Stream tunnel** (port 11935): Pi rpicam-vid output → upstream ffmpeg ingestion
- **API tunnel** (port 11936): Upstream Hono backend → Pi agent local HTTP server (camera control)

[Configuration details, file locations, setup instructions as detailed in batched edits]
```

---

### Update 4: PRD Document

**Change Summary:**
- **Added:** Code Quality & Development NFRs (NFR17-20)
- **Added:** Development Tooling & Infrastructure section

**Old → New Examples:**

**PRD — Code Quality NFRs:**
```markdown
[BEFORE: NFRs end at NFR16 (Data retention)]

[AFTER: New NFR section added]
### Code Quality & Development

- **NFR17:** All source code is linted via ESLint with airbnb-base + @typescript-eslint
  rules enforced at project root
- **NFR18:** Code style is enforced via Prettier integration; formatting violations
  are reported as lint errors by ESLint
- **NFR19:** CI pipeline blocks merges with lint violations; all code must pass
  `pnpm lint` before deployment
- **NFR20:** Lint enforcement applies equally to server, web, and shared type packages
  — no exemptions for legacy code

**Rationale:** Early code quality enforcement prevents technical debt accumulation
and ensures consistent patterns across multiple developers/AI agents. This supports
long-term maintainability and reduces defect rates.
```

**PRD — Development Tooling Section:**
```markdown
[NEW SECTION ADDED]
## Development Tooling & Infrastructure

### Code Quality
- ESLint 9.x with airbnb-base configuration
- @typescript-eslint for type-aware linting
- Prettier 3.x for code formatting
- Root-level configuration applied across all apps/packages

### Deployment & Operations
- GitHub Actions CI/CD for automated builds, tests, and releases
- Docker Compose for local development and standard deployment
- Reverse proxy options: Caddy, nginx, Traefik
- frp (fast reverse proxy) for Pi-to-upstream tunnel relay
- systemd for bare-metal server deployment

### Package Management
- pnpm workspaces (monorepo with shared dependencies)
- Shared TypeScript config per app (strict mode enforced)

### Rationale
Opinionated, industry-standard tooling reduces decision fatigue during development.
Early enforcement (Epic 1) establishes patterns that scale with team growth.
```

---

## Section 5: Implementation Handoff

### Change Scope Classification

**Classification:** ⚠️ **Minor**

**Rationale:**
- No application code changes required
- Documentation updates only (meta-level)
- No feature scope changes
- No architectural conflicts or trade-offs
- All work already completed; updates are for transparency/completeness

### Handoff Plan

**Responsibility:** Development Team (directly)

**Deliverables:**
1. ✅ Documentation updates (already completed):
   - Architecture: Code quality section + frps config + tech stack updates
   - Epics: Story 1-3b entry + notes
   - PRD: Code quality NFRs + tooling section
2. 📝 Sprint status update: Mark epic-1 as `done`; reflect Story 1-3b in tracking
3. 📝 Optional retrospective: Capture learnings from unplanned work

**Success Criteria:**
- [ ] All documentation updates saved to `_bmad-output/planning-artifacts/`
- [ ] Sprint status updated in `_bmad-output/implementation-artifacts/sprint-status.yaml`
- [ ] Story 1-3b formally tracked in sprint status
- [ ] Epic 1 marked as `done` in sprint status
- [ ] Team confirms documentation matches actual implementation

**Timeline:** Immediate (documentation-only, no blocking work)

**Stakeholders:**
- **Primary Owner:** Caleb (review and approve documentation)
- **Secondary:** Development team (confirm alignment with implementation)

---

## Section 6: Approval & Next Steps

### User Approval Requested

**Question:** Do you approve this Sprint Change Proposal for implementation?

This proposal:
- ✅ Documents all unplanned work transparently
- ✅ Shows no impact to MVP scope or timeline
- ✅ Maintains clean separation of concerns
- ✅ Enables clean transition to Epic 2

**Decision Options:**
- **[yes]** Approve — proceed with sprint status updates and Epic 2
- **[revise]** Request changes to this proposal before approval
- **[no]** Reject — propose alternative approach

---

## Appendix: Supporting Documents

**Related Documentation:**
- Architecture Document: `_bmad-output/planning-artifacts/architecture.md`
- Epics Document: `_bmad-output/planning-artifacts/epics.md`
- PRD Document: `_bmad-output/planning-artifacts/prd.md`
- Story 1-3b Tech Spec: `_bmad-output/implementation-artifacts/tech-spec-eslint-root-config.md`
- Story 1-4 Implementation: `_bmad-output/implementation-artifacts/1-4-create-deployment-reference-configs-and-environment-templates.md`
- Sprint Status: `_bmad-output/implementation-artifacts/sprint-status.yaml`

**Workflow Reference:**
- Workflow Type: Correct Course (Sprint Change Management)
- Workflow Executed: `_bmad/bmm/workflows/4-implementation/correct-course/workflow.yaml`
- Workflow Execution Date: 2026-03-07
- Executor: Claude Code (Haiku 4.5)

---

**End of Sprint Change Proposal**
