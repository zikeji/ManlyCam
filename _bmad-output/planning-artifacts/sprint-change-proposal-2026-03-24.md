# Sprint Change Proposal — 2026-03-24

## Trigger

Three UX gaps surfaced during Story 10-6 review cycle. Story 10-6 was in `review` / code-review-complete status.

## Issue Summary

1. **Clipper attribution missing in My Clips mixed-ownership views** — When "Show shared" or "Show all" is active, clip cards for all clips show no indication of who created them. The data (`clipperDisplayName`, `clipperAvatarUrlOwner`, `userId`) is already returned by the API but not rendered in the card.

2. **Orphaned visibility state for admin-set public clips** — When an Admin sets a Viewer's clip to `public`, the Viewer opens the edit form and sees no visibility button selected (the Public button is hidden for non-Moderator users). This looks broken. No warning is shown when the Viewer changes away from public that they cannot restore it themselves.

3. **No spacebar shortcut for clip editor playback** — The clip editor has Play/Pause buttons but no keyboard shortcut, forcing mouse movement away from the timeline to control playback.

## Impact Analysis

- **Epic:** No change — all three items fall within the existing Epic 10 FR scope (FR66, FR68, FR69)
- **Stories:** Story 10-6 is complete and unmodified. New story 10-6b added as a direct successor
- **Artifacts:** `ClipEditForm.vue`, `MyClipsDialog.vue`, `ClipEditor.vue` — frontend only, no server or schema changes
- **Technical risk:** Low — no new dependencies, no API changes

## Recommended Approach

**Option selected: Direct Adjustment** — add Story 10-6b immediately after 10-6.

Rationale: All three changes are purely frontend, scope is small, data model is already sufficient, and folding into 10-6 would invalidate the completed code review.

## Change Summary

| Artifact | Change |
|---|---|
| `_bmad-output/implementation-artifacts/10-6b-clip-ux-polish.md` | New story file created |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | Added `10-6b-clip-ux-polish: ready-for-dev` |
| `_bmad-output/planning-artifacts/epics.md` | Added 10-6b to Epic 10 story list |

## Handoff

**Scope:** Minor — direct implementation by dev agent
**Branch from:** `main` after 10-6 is merged
**Blocks:** 10-7 is unaffected (documentation only, no implementation dependency)
**Approved by:** Zikeji — 2026-03-24
