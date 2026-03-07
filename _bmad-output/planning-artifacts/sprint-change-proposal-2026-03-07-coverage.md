# Sprint Change Proposal: Test Coverage Audit and Baseline Enforcement

**Date:** 2026-03-07
**Proposed by:** Zikeji
**Change scope:** Minor — direct implementation by development team
**Status:** Approved

---

## Section 1: Issue Summary

**Problem statement:** The ManlyCam project has a functional test suite (Vitest, co-located `*.test.ts` files, CI runs `pnpm test`) but no coverage instrumentation or enforcement. Neither the PRD nor the architecture document specifies coverage requirements. As a result, test coverage can silently degrade across stories with no automated signal.

**Context:** Identified proactively during sprint review after Story 2.1 (Landing Page and Google OAuth Sign-In Flow) was marked done. That story introduced co-located Vitest tests (e.g. `apps/server/src/routes/auth.test.ts`) which run in CI but produce no coverage report and enforce no threshold. With stories 2.2 through 2.5 (allowlist enforcement, session persistence, avatar resolution, CLI tools) still in backlog, now is the correct moment to establish coverage gates before additional critical-path code lands untested.

**Evidence:**
- `server-ci.yml` line 30: `pnpm --filter @manlycam/server test` — no `--coverage` flag
- `web-ci.yml` line 29: `pnpm --filter @manlycam/web test` — no `--coverage` flag
- `apps/web/vite.config.ts`: no `test.coverage` block
- Grep of `architecture.md` and `prd.md`: zero matches for "coverage"
- PRD NFR17–NFR20 cover ESLint/Prettier/CI lint blocking only — testing and coverage absent

**Discovery type:** Proactive gap identification (not triggered by a failing story or production incident).

---

## Section 2: Impact Analysis

**Epic Impact:**
- Epic 2 (Authentication & Access Control): New story 2.1c added before 2.2. Epic scope expands slightly; no stories removed or deferred. Epic can still complete as planned.
- Epics 3–6: All benefit from coverage gates being established before more complex feature code (streaming, WebSockets, IoT agent) lands. No negative impact.

**Story Impact:**
- New story `2-1c-test-coverage-audit-and-baseline-enforcement` inserted between 2.1b and 2.2 in Epic 2.
- Story 2.1b (design system polish) has no dependency on 2.1c — can proceed in parallel.
- Story 2.2 and all subsequent stories will be developed with coverage enforcement active.

**Artifact Conflicts:**
- PRD: No conflict. NFR21 added to the Code Quality & Development section — additive only.
- Architecture: No conflict. New "Test Coverage Strategy" section added after "Code Quality & Linting Strategy" — additive only. Testing bullet updated to reference coverage.
- UI/UX: No impact.
- CI pipelines: `server-ci.yml` and `web-ci.yml` test steps require `--coverage` flag. This is a story 2.1c implementation task, not a proposal conflict.
- Dependencies: `@vitest/coverage-v8` requires installation in `apps/server` and `apps/web`. Minor dev dependency addition.

**Technical Impact:**
- `@vitest/coverage-v8` uses V8's native coverage engine — no instrumentation overhead, compatible with existing Vitest setup.
- `test.coverage.thresholds` configuration in `vite.config.ts` causes non-zero exit on regression automatically — no separate enforcement tooling required.
- No production code changes. No schema changes. No API contract changes.

---

## Section 3: Recommended Approach

**Selected path:** Option 1 — Direct Adjustment

**Approach:**
1. Add Story 2.1c to Epic 2 in epics.md and sprint-status.yaml
2. Update PRD with NFR21
3. Update architecture with Test Coverage Strategy section
4. Story 2.1c implementation: audit → cover gaps → baseline → enforce

**Rationale:**
- Low effort, low risk, high long-term value
- Thresholds anchored to real tested behavior (audit-first) rather than an arbitrary number — avoids false confidence and test-padding
- Established before Epic 2's remaining feature stories so gates apply from story 2.2 onward
- Consistent with the project's existing quality philosophy (NFR17–20: enforce early, no exemptions)
- Follows the precedent set by unplanned story 1-3b (ESLint config), which was added to address a gap discovered mid-sprint

**Effort estimate:** Low
**Risk level:** Low
**Timeline impact:** One small story added to Epic 2; no stories deferred or removed

---

## Section 4: Detailed Change Proposals

### PRD — Add NFR21

**File:** `_bmad-output/planning-artifacts/prd.md`
**Section:** Non-Functional Requirements → Code Quality & Development

Append after NFR20:

```
- **NFR21:** Test coverage is collected on every CI run via Vitest's V8 coverage provider. Before coverage thresholds are enforced, a dedicated story audits the existing test suite, identifies untested paths critical to the user experience (auth flow, allowlist enforcement, session lifecycle, WebSocket state transitions), adds tests to cover those paths, and sets the initial per-package thresholds at the resulting baseline. CI blocks merges on coverage regression below those baselines thereafter.
```

Update rationale paragraph to reference coverage alongside linting.

---

### Architecture — Add Test Coverage Strategy section

**File:** `_bmad-output/planning-artifacts/architecture.md`
**Location:** After "Code Quality & Linting Strategy" section, before `---` separator

New section covering:
- Tooling: `@vitest/coverage-v8` (V8 native, no instrumentation overhead)
- Threshold establishment process (audit → cover → baseline → enforce)
- CI enforcement: `vitest run --coverage`; Vitest's built-in threshold exit code

Also update the Testing bullet (line ~564) to reference `@vitest/coverage-v8` and cross-reference Story 2-1c.

---

### Epics — Add Story 2.1c

**File:** `_bmad-output/planning-artifacts/epics.md`
**Location:** After Story 2.1b, before Story 2.2

New story: **Story 2.1c: Test Coverage Audit and Baseline Enforcement**

Acceptance criteria (Given/When/Then):
1. `vitest run --coverage` identifies all untested critical paths (OAuth callback, allowlist logic, session middleware, role/permission checks)
2. New tests cover each identified gap (happy path + primary failure path, co-located `*.test.ts`)
3. `test.coverage.thresholds` configured in both `apps/server` and `apps/web` at recorded baseline values; `@vitest/coverage-v8` installed
4. Coverage below threshold causes non-zero CI exit
5. Both `server-ci.yml` and `web-ci.yml` run coverage on every push

Notes: Threshold = whatever the audit produces after covering critical paths. V8 provider preferred. Go agent out of scope for this story.

---

### Sprint Status — Add Story 2.1c

**File:** `_bmad-output/implementation-artifacts/sprint-status.yaml`

Add `2-1c-test-coverage-audit-and-baseline-enforcement: backlog` between `2-1b` and `2-2` entries.

---

## Section 5: Implementation Handoff

**Scope classification:** Minor — direct implementation by development team

**Handoff:** Development team (next story to implement after 2.1b, or in parallel with 2.1b)

**Responsibilities:**
- Dev: Implement story 2.1c per acceptance criteria; apply all artifact edits approved in this proposal
- No PO/SM backlog reorganization needed — Epic 2 ordering unchanged except for insertion of 2.1c
- No PM/Architect escalation needed

**Success criteria:**
- `vitest run --coverage` runs without error on both `apps/server` and `apps/web`
- `test.coverage.thresholds` present in both Vitest configs with non-zero values
- CI fails on a PR that removes a test or drops coverage below threshold
- PRD NFR21 and architecture coverage section present and accurate
- Story 2.1c marked `done` in sprint-status.yaml before story 2.2 begins
