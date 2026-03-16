---
name: lint fix command
description: Use pnpm run lint --fix, not npx eslint --fix
type: feedback
---

Use `pnpm run lint --fix` to autofix lint errors, not `npx eslint --fix`.

**Why:** User rejected the npx approach — the project uses pnpm and the lint script is defined in package.json.

**How to apply:** Any time lint errors need to be autofixed, run `pnpm run lint --fix` from the relevant app directory (apps/server or apps/web).
