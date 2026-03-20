---
project_name: 'ManlyCam'
user_name: 'Zikeji'
date: '2026-03-20'
sections_completed:
  [
    'technology_stack',
    'language_rules',
    'framework_rules',
    'testing_rules',
    'quality_rules',
    'workflow_rules',
    'anti_patterns',
  ]
status: 'complete'
rule_count: 52
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

### Runtime & Server

- **Runtime**: Node.js (ESM modules — `"type": "module"` in all package.json)
- **Server framework**: Hono ^4.12.5 + `@hono/node-server` ^1.19.11
- **WebSocket**: `@hono/node-ws` ^1.3.0 — use `createNodeWebSocket({ app })` → `{ upgradeWebSocket, injectWebSocket }`
- **ORM**: Prisma ^6.0.0 with SQLite (dev + prod on Pi)
- **Validation**: Zod ^3.0.0
- **Logging**: Pino ^9.0.0
- **ID generation**: ulidx ^2.0.0 (accessed ONLY via `apps/server/src/lib/ulid.ts` singleton)

### Frontend

- **Framework**: Vue 3 ^3.5.0 + Vite ^7.3.1
- **Router**: vue-router ^4.4.0
- **UI components**: reka-ui ^2.9.0 (shadcn-vue registry)
- **Utilities**: VueUse ^12.0.0
- **Styling**: Tailwind CSS **3.4.19 (pinned to v3 — do NOT upgrade to v4)**
- **Icons**: lucide-vue-next ^0.577.0
- **Markdown**: markdown-it ^14.1.0 + highlight.js ^11.10.0
- **Stream protocol**: WebRTC WHEP (via mediamtx — NOT HLS/hls.js)

### Shared

- **Types package**: `@manlycam/types` (workspace:\*) — always build before server typecheck
- **Monorepo**: pnpm workspaces
- **Package manager**: pnpm ONLY — never use `npm` or `yarn`. Use `pnpm dlx` instead of `npx` for one-off commands.
- **Language**: TypeScript ^5.8.3 (server) / ~5.9.3 (web)
- **Testing**: Vitest ^3.0.0 + @vue/test-utils ^2.4.0 (web)

---

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

- **ESM only**: All packages use `"type": "module"`. Use `import`/`export`, never `require()`.
- **Named exports only**: No `export default` anywhere except tool config files (`vite.config.ts`, `vitest.config.ts`, `tailwind.config.js`, `eslint.config.mjs`). All source code uses named exports.
- **Absolute paths from `import.meta.url`**: When computing file paths at runtime (e.g., Prisma schema location, CLI asset paths), always derive from `import.meta.url` — never use relative paths or `__dirname` directly (use `fileURLToPath` + `path.dirname`).
- **Unused vars**: Prefix intentionally unused parameters/variables with `_` (ESLint enforces this pattern).
- **Import order**: Import from `@manlycam/types` workspace package, not by relative path crossing package boundaries.
- **Async/await**: Always prefer `async/await` over raw `.then()` chains.
- **Error handling**: Use `new AppError(message, code, statusCode)` from `apps/server/src/lib/errors.ts` — do NOT create ad-hoc error objects or throw plain strings.
- **Environment validation**: Server env vars are validated at startup via Zod in `apps/server/src/env.ts`. Add new env vars there — never read `process.env` directly in handlers.
- **Typecheck must pass**: Run `pnpm run typecheck` from the relevant app directory (`apps/server` or `apps/web`) before declaring any work done. For server, this also builds `@manlycam/types` first (`pnpm --filter @manlycam/types build && tsc --noEmit`).

### Framework-Specific Rules

#### Server — Hono + Node.js

- **WebSocket setup**: Use `@hono/node-ws` (NOT `@hono/node-server/ws` — that path does not exist). API: `createNodeWebSocket({ app })` returns `{ upgradeWebSocket, injectWebSocket }`. Call `injectWebSocket(server)` after `serve()`.
- **WebSocket hub**: All WS broadcast logic goes through `wsHub` — never hold raw socket references in route handlers.
- **Prisma singleton**: Always import from `apps/server/src/db/client.ts` — never `new PrismaClient()`.
- **ULID singleton**: Always import from `apps/server/src/lib/ulid.ts` — never import `ulidx` directly.
- **Multi-step DB operations**: Use `prisma.$transaction()` for any operation that must be atomic (e.g., ban = update bannedAt + delete sessions). Never allow partial-failure states.
- **RBAC**: All permission checks use `canModerateOver()` and `ROLE_RANK` from `apps/server/src/lib/roleUtils.ts`. Never inline role comparisons.
- **User tags**: All user tag computation goes through `apps/server/src/lib/user-tag.ts` (`computeUserTag`). Never inline tag logic.
- **Session cookie**: `session_id`, httpOnly, SameSite=**Strict**, Secure (prod), 30-day expiry.
- **OAuth state cookie**: `oauth_state`, SameSite=**Lax** (required for OAuth redirect flow — NOT Strict).
- **OAuth HTTP calls**: Use native `fetch()` — no external HTTP libs.

#### Frontend — Vue 3

- **Composables**: Stateful logic lives in `apps/web/src/composables/use*.ts`. Keep components thin.
- **WebSocket**: Use `useWebSocket` composable — never open raw WebSockets in components.
- **Scroll containers**: Use a plain `<div class="overflow-y-auto" ref="scrollRef">` when direct ref scroll access is needed. Do NOT use shadcn-vue `<ScrollArea>` for containers requiring scroll calculations — its nested viewport adds indirection that breaks `scrollTop` reads.
- **Stream protocol**: WebRTC WHEP via `useWhep` composable. The server proxies mediamtx's `/whep` endpoint. Do NOT introduce HLS or any other stream format.
- **Chrome textarea alignment**: When a `<textarea>` is a flex sibling, add `align-top` class. Chrome's `vertical-align: baseline` causes misalignment that `items-end`/`self-end`/height-matching do not fix.
- **Emoji picker / fixed-position overlays**: Use `position: fixed` with viewport-relative coordinates for any picker or floating overlay. `position: absolute` breaks inside transformed/overflow-hidden ancestors.
- **Role definitions**: Import `Role` and role utilities from `@manlycam/types` — four tiers: `Admin`, `Moderator`, `Viewer`, `ViewerGuest`.

### Testing Rules

- **Co-located tests**: Test files live next to the source file they test (`foo.ts` → `foo.test.ts`). Never use `__tests__/` directories.
- **Run commands**:
  - Server: `pnpm run test --coverage` from `apps/server`
  - Web: `pnpm run test --coverage` from `apps/web`
  - Never use `npx vitest run` directly.
- **Coverage thresholds** (server): lines 80%, functions 90%, branches 87%, statements 80%. Do not lower thresholds — raise them to match actuals when coverage improves.
- **Every new line must be covered**: All new code introduced in a story must be covered by tests. If a line/branch logically cannot be covered (e.g., a Pi hardware reconnect path, defensive fallback, or impossible type guard), add `/* istanbul ignore next */` (or `/* istanbul ignore if */` / `/* istanbul ignore else */` for branches) with a brief inline comment explaining why. Do NOT leave uncovered lines without an explicit ignore annotation.
- **Vue component cleanup**: Every Vue Test Utils test suite MUST have `afterEach(() => { wrapper?.unmount(); wrapper = null; })`. Missing cleanup causes watchers from prior tests to pollute subsequent tests → non-deterministic failures.
- **Wrapper pattern**: Declare `let wrapper: VueWrapper | null = null` at suite level, assign in `beforeEach`, unmount in `afterEach`. Never use top-level `const wrapper = mount(...)`.
- **No database mocks on server**: Server integration tests hit a real (test) database — do not mock Prisma. Mocked tests can pass while prod migrations are broken.
- **ESLint globals for web tests**: The web ESLint config includes `globals.vitest` — `describe`, `it`, `expect`, `vi`, etc. are available without import in `apps/web/**/*.test.ts`.
- **Test file must be in story File List**: If a test file is modified during implementation (even for lint/typecheck fixes), it must appear in the story's File List. Omitting it causes review confusion.
- **Smoke-test UI before closing**: Dev agents must not self-declare UI behavior "fixed" based on test output alone. Request Zikeji to manually smoke-test specific interactions before closing a story.

### Code Quality & Style Rules

- **Linting**: ESLint flat config at repo root (`eslint.config.mjs`). Run `pnpm run lint` from the relevant app directory. Must pass before story close.
- **Formatting**: Prettier via ESLint plugin — `prettier/prettier` is an error. Run `pnpm run lint` (it enforces formatting). Do not run Prettier separately.
- **Web ESLint globals**: The web block in `eslint.config.mjs` includes `globals.browser` + `globals.vitest`. If adding new web TS files that use `window`, `WebSocket`, `describe`, `it`, etc., this is why they are not flagged — do not add explicit imports for these globals.
- **Naming conventions**:
  - Files: `kebab-case.ts` for utilities/libs, `PascalCase.vue` for Vue components, `useCamelCase.ts` for composables
  - Variables/functions: `camelCase`
  - Types/interfaces: `PascalCase`
  - Constants: `SCREAMING_SNAKE_CASE` for module-level constants (e.g., `EDIT_WINDOW_MS`, `ROLE_RANK`)
- **No comments unless logic is non-obvious**: Do not add docstrings, JSDoc, or inline comments to code that is self-evident. Only comment genuinely non-obvious decisions or intentional deviations.
- **No over-engineering**: Do not add error handling, fallbacks, or abstractions for scenarios that cannot happen. Do not design for hypothetical future requirements. Three similar lines is better than a premature abstraction.
- **Shadcn-vue components**: Add via `pnpm dlx shadcn-vue@latest add <component>` (e.g., `pnpm dlx shadcn-vue@latest add accordion`). Do not hand-write reka-ui primitives from scratch. Components land in `apps/web/src/components/ui/`.
- **Tailwind v3 only**: Tailwind is pinned to `3.4.19`. Do not use v4 syntax or upgrade. `shadcn-vue` does not have stable v4 support.

### Development Workflow Rules

- **Quality gate before story close**: All three must pass from the relevant app directory:
  1. `pnpm run typecheck` — zero TypeScript errors
  2. `pnpm run lint` — zero ESLint/Prettier errors
  3. `pnpm run test --coverage` — all tests pass, coverage thresholds met

  Never self-declare a story done without running all three.

- **Story status field**: NEVER update the story file's `status` field to `done` without explicit permission from Zikeji. Set it to `ready-for-review` when implementation is complete and all quality gates pass, then wait for instruction.
- **Story File List**: Every file created or modified during implementation must be listed in the story's File List — including test files touched only for lint/typecheck fixes.
- **Unplanned work**: If work outside the story's scope is needed (e.g., fixing a related bug, adding a missing test), formalize it as a new story rather than silently folding it in.
- **Commit syntax**: Use Conventional Commits — `type(scope): description`. Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `style`, `perf`. Scope is the app or area (e.g., `feat(chat):`, `fix(server):`, `chore(deps):`). Subject line is lowercase, imperative, no trailing period.
- **Commit hygiene**: Prefer specific file staging over `git add -A`. Never use `--no-verify` to skip hooks unless explicitly instructed.
- **Branch naming**: `fix/`, `feat/`, `chore/` prefixes — e.g., `feat/story-5-2-moderation`.
- **Pi hardware stories**: Cannot be self-declared done from tests alone — must be smoke-tested on actual hardware before closure.
- **Types package**: Build `@manlycam/types` before server typecheck or test runs: `pnpm --filter @manlycam/types build`. The server `typecheck` script does this automatically; manual `tsc --noEmit` runs do not.

### Critical Don't-Miss Rules

#### Anti-Patterns — Never Do These

- **Never use `npm` or `npx`** — this project uses pnpm exclusively. Use `pnpm` for all package operations and `pnpm dlx` instead of `npx` for one-off commands.
- **Never `new PrismaClient()`** — always import the singleton from `apps/server/src/db/client.ts`.
- **Never import `ulidx` directly** — always import from `apps/server/src/lib/ulid.ts` singleton.
- **Never read `process.env` directly in handlers** — all env vars go through `apps/server/src/env.ts` (Zod-validated at startup).
- **Never inline role comparisons** — use `canModerateOver()` and `ROLE_RANK` from `roleUtils.ts`.
- **Never inline user tag logic** — use `computeUserTag` from `apps/server/src/lib/user-tag.ts`.
- **Never use `@hono/node-server/ws`** — it does not exist. Use `@hono/node-ws`.
- **Never use HLS or introduce a new stream format** — the stream pipeline is WebRTC WHEP via mediamtx. Do not change it.
- **Never upgrade Tailwind past v3** — pinned to `3.4.19`.
- **Never set story status to `done`** without explicit permission from Zikeji.
- **Never leave new uncovered lines without `/* istanbul ignore next */`** (or `if`/`else` variant) and a brief explanation.

#### Security Rules

- **OAuth state cookie must be SameSite=Lax** (not Strict) — required for OAuth redirect flow. Tests enforce this; do not change it.
- **Session cookie must be SameSite=Strict** — tests enforce this; do not change it.
- **Normalize emails before Gravatar hashing** — lowercase + trim. Tests enforce this.
- **Multi-step DB mutations must use `prisma.$transaction()`** — ban operations, session cleanup, any operation that must be atomic. Partial failures are a security/consistency risk.
- **All sensitive endpoints must have server-side RBAC** — never rely solely on client-side role gating.

#### Story Closure Checklist

Before marking any story `ready-for-review`, confirm ALL of the following:

1. `pnpm run typecheck` passes (from affected app directories)
2. `pnpm run lint` passes
3. `pnpm run test --coverage` passes with thresholds met
4. All new lines are covered or have `istanbul ignore` annotations
5. Story File List includes every modified file
6. UI changes have been flagged for Zikeji to smoke-test
7. Story `status` is set to `ready-for-review` — NOT `done`

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Reference the Story Closure Checklist before every `ready-for-review` transition

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when technology stack or patterns change
- Remove rules that become obvious over time

_Last Updated: 2026-03-20_
