# Sprint Change Proposal — Design System Foundation Gap

**Date:** 2026-03-07
**Author:** Correct Course Workflow (SM Agent)
**Status:** Pending Approval
**Scope Classification:** Minor

---

## Section 1: Issue Summary

### Problem Statement

Story 2.1 (Landing Page and Google OAuth Sign-In Flow) was completed successfully in terms of functional acceptance criteria — the landing page renders, Google OAuth initiates, and session routing works. However, the implementation was built on a bare Vite/Vue 3 scaffold with no design system in place. The site has no styling and bears no resemblance to the UX specification.

### Context

Upon reviewing the sprint plan after Story 2.1 was marked done, it was discovered that no story — in Epic 1, Epic 2, or any subsequent epic — addresses the installation and configuration of the design system specified in the UX design specification:

- Tailwind CSS v3 (pinned)
- ShadCN-vue (Radix Vue + Tailwind + CSS variable theming, scaffolded into the repo)
- CSS custom properties implementing the Discord-warmed dark palette
- Dark-mode-by-default behavior (`prefers-color-scheme` + `localStorage` persistence)
- `prefers-reduced-motion` CSS media query coverage
- Global base stylesheet (`main.css`) wiring everything together
- Favicon placeholder

The UX design specification and architecture document both define this foundation explicitly. The gap is a planning oversight — the design system work was implicitly assumed to exist somewhere in the plan but was never converted into a story.

### Root Cause Classification

**Misunderstanding/oversight of original requirements.** Epic 1 is labeled "Monorepo Foundation & CI/CD" — in hindsight, design system setup (Tailwind, ShadCN-vue, CSS custom properties) is a foundational front-end concern that arguably belonged in Story 1.1. However, since Epic 1 is complete and retro'd, the cleanest resolution is to insert a new story into Epic 2 immediately after 2.1 (done). This avoids retroactively reopening a closed epic and keeps the design system work co-located with the first visible UI deliverable (the landing page).

### Evidence

1. Story 2.1 is `done` — site has no Tailwind, no ShadCN-vue, no CSS custom properties
2. UX spec explicitly specifies Discord-warmed dark palette (`#313338` surface reference), CSS custom properties driving all colors, `.dark` class swap, ShadCN-vue components scaffolded into repo
3. Architecture "Additional Requirements / UX — Design System" section lists all of the above as concrete specs
4. `sprint-status.yaml` has no story in any epic covering Tailwind install, ShadCN init, or CSS variable theming
5. `LoginView.vue` meets functional acceptance criteria but diverges from UX spec appearance

---

## Section 2: Impact Analysis

### Epic Impact

| Epic | Impact |
|---|---|
| Epic 1 (done) | No impact. Design system story was missed here in hindsight, but Epic 1 is complete and retro'd. Root cause is a planning gap, not an Epic 1 failure. |
| Epic 2 (in-progress) | New story 2.1b inserted as next story before 2.2. Remaining stories (2.2–2.5) are mostly backend/API-focused and are not blocked, but 2.2 introduces `RejectedView.vue` which benefits from the design system being in place first. |
| Epic 3 (backlog) | All stories have UI components (SPA shell, stream player, 4-state UI, admin controls). All implicitly require the design system. No story changes needed — they build naturally on 2.1b's foundation. |
| Epic 4 (backlog) | All stories have UI components (chat panel, message list, sidebar). Same as Epic 3. |
| Epic 5 (backlog) | All stories have UI components (moderation UI, role management, user tags). Same as Epics 3–4. |
| Epic 6 (backlog) | Pi agent / operational tooling. No UI impact. |

### Story Impact

| Story | Impact |
|---|---|
| 2.1 (done) | Functionally complete. Needs a post-completion note in epics.md flagging the visual gap. `LoginView.vue` will be restyled as part of 2.1b. |
| 2.1b (new) | New story inserted as the next story in Epic 2. Covers full design system setup + landing page restyle. |
| 2.2–2.5 (backlog) | No story changes. They benefit from 2.1b being done first; 2.2's `RejectedView.vue` will be styled properly in context. |
| All Epic 3–5 UI stories (backlog) | No story changes. All build on the design system foundation established in 2.1b. |

### Artifact Conflicts

| Artifact | Conflict | Resolution |
|---|---|---|
| `epics.md` | Story 2.1 has no post-completion note about the visual gap; Story 2.1b does not exist | Add 2.1b story definition; add post-completion note to 2.1 |
| `sprint-status.yaml` | No 2.1b entry | Add `2-1b-design-system-foundation-and-landing-page-polish: backlog` |
| `LoginView.vue` | Bare scaffold, no design system applied | Restyled in Story 2.1b scope |
| PRD | No conflict — PRD states "Dark mode required" and SPA architecture. MVP unaffected. | No change needed |
| Architecture | No conflict — architecture already specifies ShadCN-vue + Tailwind v3. 2.1b implements what was specified. | No change needed |

### Technical Impact

- `apps/web/package.json`: Add `tailwindcss@^3`, `@tailwindcss/vite`, `autoprefixer`, `tailwind-merge`
- `apps/web/tailwind.config.js`: Create with `darkMode: 'class'`, content paths covering `src/**/*.{vue,ts}`
- `apps/web/src/assets/main.css`: Establish CSS custom properties and Tailwind directives
- `apps/web/src/components/ui/`: ShadCN-vue component directory (Button, Avatar minimum)
- `apps/web/src/lib/utils.ts`: `cn()` helper from ShadCN init
- `apps/web/public/favicon.svg`: Placeholder SVG
- `apps/web/index.html`: Favicon link in `<head>`
- `apps/web/src/views/LoginView.vue`: Restyled using ShadCN Button + Tailwind + CSS vars
- No CI/CD changes, no Dockerfile changes, no backend changes

---

## Section 3: Recommended Approach

**Selected: Option 1 — Direct Adjustment**

Insert Story 2.1b into Epic 2 as the next story. The development team implements it before moving to Story 2.2.

**Rationale:**

- **Low effort, low risk.** Installing Tailwind + ShadCN-vue and establishing CSS custom properties is well-understood, well-documented work. No architectural unknowns.
- **No rollback needed.** Story 2.1's functional implementation (routing, OAuth, session detection) is correct. Only the visual layer needs to be added on top.
- **MVP unaffected.** This is not a scope reduction question — it is catching up implementation to what was already specified.
- **Foundational leverage.** Doing this before Story 2.2 means every subsequent UI story (2.2 through all of Epic 5) builds on the correct foundation. Deferring would compound the rework.

**Effort:** Low
**Risk:** Low
**Timeline impact:** One additional story before 2.2 begins. No epic-level timeline disruption.

---

## Section 4: Detailed Change Proposals

### Change 4.1 — New Story in epics.md

**Location:** `_bmad-output/planning-artifacts/epics.md`, Epic 2 section, after Story 2.1

**ADD:**

```markdown
### Story 2.1b: Design System Foundation and Landing Page Polish

As a **developer**,
I want Tailwind v3, ShadCN-vue, and the project's CSS custom property theme
established in apps/web,
So that all current and future UI stories build on a consistent, spec-aligned
design system from this point forward.

**Acceptance Criteria:**

**Given** `apps/web/package.json` is inspected
**When** dependencies are reviewed
**Then** `tailwindcss@^3` (pinned), `@tailwindcss/vite`, `autoprefixer`, and
`tailwind-merge` are present; `apps/web/tailwind.config.js` exists with
`darkMode: 'class'` and content paths covering `src/**/*.{vue,ts}`; ShadCN-vue
has been initialized (`components.json` present, `apps/web/src/components/ui/`
contains at least `Button.vue` and `Avatar.vue`, `src/lib/utils.ts` exports `cn()`)

**Given** `apps/web/src/assets/main.css` is inspected
**When** its contents are reviewed
**Then** it contains Tailwind directives and defines CSS custom properties for the
Discord-warmed dark palette per the UX spec (at minimum: `--background`,
`--foreground`, `--card`, `--card-foreground`, `--primary`, `--primary-foreground`,
`--muted`, `--muted-foreground`, `--border`, `--ring`, `--radius`) in both
`:root` (light) and `.dark` overrides

**Given** the user has no system dark/light preference (`prefers-color-scheme`
unset or `no-preference`)
**When** the app loads for the first time
**Then** the `.dark` class is applied to `<html>` by default

**Given** the user has previously toggled the theme
**When** the app loads
**Then** `localStorage.getItem('theme')` is read and the correct class applied
before first paint — no flash of incorrect theme on reload

**Given** `prefers-color-scheme: light` is active in the user's OS
**When** the app loads for the first time (no `localStorage` override)
**Then** light mode is applied

**Given** `prefers-reduced-motion: reduce` is set
**When** any CSS transition or animation runs
**Then** all transitions and animations in the design system are suppressed
via `@media (prefers-reduced-motion: reduce)` in `main.css`

**Given** an unauthenticated user visits `/`
**When** `LoginView.vue` renders
**Then** the page reflects the UX spec: warm dark background, centered card
layout, `SITE_NAME` in a prominent heading, `PET_NAME` referenced in copy,
a styled "Sign in with Google" button using the ShadCN `Button` component —
not a bare `<button>` — and the overall aesthetic matches the warm/cozy tone
specified in the UX design specification

**And** `apps/web/public/favicon.svg` exists (placeholder SVG acceptable;
final Manly tooth SVG is a post-MVP design asset) and `index.html` links to it

**And** `apps/web/src/main.ts` imports `./assets/main.css` as the global stylesheet
```

---

### Change 4.2 — Post-completion note in epics.md

**Location:** `_bmad-output/planning-artifacts/epics.md`, end of Story 2.1

**ADD after Story 2.1 acceptance criteria:**

```
**Post-completion note (2026-03-07):** Story 2.1 was implemented and marked done
before the design system gap was identified. `LoginView.vue` satisfies all functional
acceptance criteria but does not yet match the UX specification visually — it was
built on a bare Vite/Vue scaffold with no Tailwind, ShadCN-vue, or CSS custom
properties in place. Story 2.1b addresses this gap and includes restyling
`LoginView.vue` to match the spec.
```

---

### Change 4.3 — sprint-status.yaml

**Location:** `_bmad-output/implementation-artifacts/sprint-status.yaml`, Epic 2 block

**OLD:**
```yaml
  epic-2: in-progress
  2-1-landing-page-and-google-oauth-sign-in-flow: done
  2-2-allowlist-enforcement-and-rejection-handling: backlog
```

**NEW:**
```yaml
  epic-2: in-progress
  2-1-landing-page-and-google-oauth-sign-in-flow: done
  2-1b-design-system-foundation-and-landing-page-polish: backlog
  2-2-allowlist-enforcement-and-rejection-handling: backlog
```

**Rationale:** 2.1b is the next story to be created and worked before 2.2.

---

## Section 5: Implementation Handoff

**Scope Classification: Minor**
Direct implementation by the development team. No backlog reorganization, PO, SM, or PM escalation required.

**Handoff recipients:** Development team (dev-story agent)

**Responsibilities:**
- Create Story 2.1b story file via `create-story` workflow
- Implement Story 2.1b before beginning Story 2.2
- Verify `LoginView.vue` matches UX spec after implementation
- Mark 2.1b `done` before creating Story 2.2

**Success criteria:**
- `tailwindcss@^3` pinned and `darkMode: 'class'` configured
- ShadCN-vue initialized: `components.json` and `src/components/ui/` present with Button and Avatar
- CSS custom properties in `main.css` match the Discord-warmed dark palette from UX spec
- Dark mode is the default; `localStorage` persistence works without flash
- `LoginView.vue` matches UX spec visually (warm dark card, styled button, correct copy)
- Favicon placeholder present and linked in `index.html`
- All existing tests pass; `pnpm lint` passes

**Dependencies:** None. Story 2.1b has no blockers and can begin immediately.

**Next steps after approval:**
1. Update `epics.md` — add Story 2.1b definition + post-completion note to 2.1
2. Update `sprint-status.yaml` — insert `2-1b` entry
3. Run `create-story` for Story 2.1b
4. Implement 2.1b
5. Continue with Story 2.2

---

**End of Sprint Change Proposal**
