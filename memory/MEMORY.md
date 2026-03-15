# ManlyCam Project Memory

## Project Overview
- **Name:** ManlyCam — DIY dog camera (Raspberry Pi Zero W 2 + Arducam), browser-based live stream gated by Google OAuth
- **Monorepo:** pnpm workspaces — `packages/types`, `apps/server` (Hono/Node), `apps/web` (Vue 3/Vite) — `apps/agent` (Go) removed in Story 6-1
- **Key docs:** `_bmad-output/planning-artifacts/` (prd.md, architecture.md, epics.md, ux-design-specification.md)
- **Sprint tracking:** `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Sprint Status
- [project_epic7.md](project_epic7.md) — Epic 7 details (added 2026-03-12)

## Architecture Patterns
- [project_system_user.md](project_system_user.md) — System user (SYSTEM_USER_ID) for slash command authoring

## Feedback
- [feedback_lint_fix.md](feedback_lint_fix.md) — Use `pnpm run lint --fix`, not `npx eslint --fix`
