# Story 2.1c: Test Coverage Audit and Baseline Enforcement

Status: review

## Story

As a **developer**,
I want the test suite audited for critical-path coverage gaps, those gaps covered, and the resulting percentages enforced as CI thresholds,
so that coverage cannot silently degrade in future stories and the thresholds reflect genuine confidence in user-critical behavior.

## Acceptance Criteria

1. **Given** `vitest run --coverage` is executed across `apps/server` and `apps/web`
   **When** the coverage report is reviewed
   **Then** all untested or under-tested paths in the following categories are identified and documented: Google OAuth callback and token validation, allowlist enforcement logic, session creation and middleware, role/permission checks on protected routes, and any other path directly affecting a user's ability to authenticate or access the stream

2. **Given** the identified coverage gaps have been documented
   **When** new tests are written to address them
   **Then** each critical-path gap from the audit has at minimum one test covering the happy path and one covering the primary failure/rejection path; tests are co-located (`*.test.ts`) and follow existing test conventions

3. **Given** the new tests are committed and `vitest run --coverage` is re-run
   **When** the resulting coverage percentages are recorded
   **Then** `apps/server/vitest.config.ts` and `apps/web/vite.config.ts` define `test.coverage.thresholds` for lines, functions, branches, and statements at or below the recorded values; `@vitest/coverage-v8` is installed as a dev dependency in both packages

4. **Given** the coverage thresholds are configured
   **When** `pnpm --filter @manlycam/server test` or `pnpm --filter @manlycam/web test` is run with coverage below any threshold
   **Then** the process exits non-zero, causing the CI job to fail

5. **Given** `server-ci.yml` and `web-ci.yml` are inspected
   **When** the test step is reviewed
   **Then** both workflows run `vitest run --coverage` (or equivalent) rather than bare `vitest run`, ensuring coverage collection and threshold enforcement occur on every CI run

## Tasks / Subtasks

- [x] Task 1: Install `@vitest/coverage-v8` in both packages (AC: 3)
  - [x] In `apps/server/`: `pnpm add -D @vitest/coverage-v8`
  - [x] In `apps/web/`: `pnpm add -D @vitest/coverage-v8`

- [x] Task 2: Create `apps/server/vitest.config.ts` with coverage config (AC: 3, 4)
  - [x] Create the file (server has no vite/vitest config yet — see Dev Notes for exact content)
  - [x] Add `provider: 'v8'` and `include` pointing at `src/**/*.ts` (excluding test files)
  - [x] Leave thresholds commented-out as placeholders — fill in AFTER Task 4

- [x] Task 3: Update `apps/web/vite.config.ts` to add coverage config (AC: 3, 4)
  - [x] Add `coverage` section under `test` — see Dev Notes for exact shape
  - [x] Leave thresholds as placeholders — fill in AFTER Task 4

- [x] Task 4: Write tests for critical-path coverage gaps (AC: 1, 2)
  - [x] Add `processOAuthCallback` tests to `apps/server/src/services/authService.test.ts`:
    - [x] Existing user path: mock `prisma.user.findUnique` returning a user → verifies `user.update` called with `displayName`/`avatarUrl`/`lastSeenAt`, returns `{ sessionId, redirectTo: '/' }`
    - [x] New user path: mock `prisma.user.findUnique` returning null → verifies `user.create` called with correct fields (`id` is ULID, `role: 'ViewerCompany'`), returns `{ sessionId, redirectTo: '/' }`
  - [x] Add `handleCallback` failure tests to `apps/server/src/services/authService.test.ts`:
    - [x] Token exchange failure: mock `fetch` to return `{ ok: false }` → expects AppError thrown
    - [x] Profile fetch failure: mock `fetch` first call ok, second call `{ ok: false }` → expects AppError thrown
  - [x] Create `apps/server/src/middleware/auth.test.ts`:
    - [x] With valid session cookie: mock `getSessionUser` to return a user object → verifies `c.set('user', user)` called and `next()` called
    - [x] Without session cookie: verifies `c.set('user', null)` and `next()` called
  - [x] Create `apps/server/src/middleware/requireAuth.test.ts`:
    - [x] With user set in context: verifies `next()` is called (request passes through)
    - [x] Without user (null): verifies 401 response with `{ error: { code: 'UNAUTHORIZED' } }`

- [x] Task 5: Record actual coverage percentages and set thresholds (AC: 3)
  - [x] Run `pnpm --filter @manlycam/server exec vitest run --coverage` — record lines/functions/branches/statements
  - [x] Run `pnpm --filter @manlycam/web exec vitest run --coverage` — record lines/functions/branches/statements
  - [x] Fill in threshold values in `apps/server/vitest.config.ts` (use recorded values, NOT arbitrary targets)
  - [x] Fill in threshold values in `apps/web/vite.config.ts` (use recorded values)
  - [x] Verify: running tests again exits 0 (thresholds pass at current levels)

- [x] Task 6: Update CI workflows to enforce coverage (AC: 5)
  - [x] In `.github/workflows/server-ci.yml`: change `pnpm --filter @manlycam/server test` → `pnpm --filter @manlycam/server exec vitest run --coverage`
  - [x] In `.github/workflows/web-ci.yml`: change `pnpm --filter @manlycam/web test` → `pnpm --filter @manlycam/web exec vitest run --coverage`
  - [x] Verify: intentionally setting a threshold 1% above recorded value causes non-zero exit (then revert)

## Dev Notes

### CRITICAL: Order of Operations

**Do NOT hardcode specific percentage values in tasks 2/3.** The correct workflow is:
1. Install `@vitest/coverage-v8` (Task 1)
2. Create config files with `provider: 'v8'` but NO thresholds yet (Tasks 2/3)
3. Write the gap tests (Task 4)
4. Run coverage to get actual numbers from the real code (Task 5)
5. Set those recorded numbers as the thresholds (Task 5)
6. Update CI (Task 6)

The goal is a **meaningful baseline**, not a high number. If coverage comes out at 58% lines after writing the critical-path gap tests, 58% is the correct threshold. Do not inflate by writing padding tests.

### Coverage Gap Analysis (Pre-Existing Tests)

Current test files (`apps/**/*.test.ts`):

| File | What's Tested | Gaps |
|---|---|---|
| `apps/server/src/services/authService.test.ts` | `createSession`, `destroySession`, `getSessionUser`, `handleCallback` CSRF + happy path | `processOAuthCallback` (not tested at all); `handleCallback` token-exchange failure, profile-fetch failure |
| `apps/server/src/routes/auth.test.ts` | GET `/api/auth/google`, POST `/api/auth/logout`, GET `/api/auth/google/callback` (parameter validation) | Successful callback completing (mocked service returns undefined → 500); but authService tests cover that logic |
| `apps/server/src/routes/me.test.ts` | GET `/api/me` — 401 and 200 shapes | Adequate |
| `apps/web/src/composables/useAuth.test.ts` | `useAuth` initial state, success fetch, 401 error, network error | Adequate |
| `apps/web/src/views/LoginView.test.ts` | SITE_NAME, PET_NAME, Google link, ShadCN Button presence | Adequate |

**Files with ZERO test coverage:**
- `apps/server/src/middleware/auth.ts` — `authMiddleware` (always mocked in other tests)
- `apps/server/src/middleware/requireAuth.ts` — `requireAuth` (used by `/api/me` route but never tested directly)

**`processOAuthCallback` has zero coverage.** This is the most critical gap — it handles:
- Existing user returning to the app (update profile + create session)
- New user registering for the first time (Story 2.2 will add allowlist check here)

### Task 2 — `apps/server/vitest.config.ts` (Create New File)

The server uses `tsc` for build and `tsx` for dev — there is NO `vite.config.ts`. Create `apps/server/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export const vitestConfig = defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      // Thresholds set after recording actual post-gap-fix coverage (Task 5)
      thresholds: {
        lines: 0,       // REPLACE with recorded value
        functions: 0,   // REPLACE with recorded value
        branches: 0,    // REPLACE with recorded value
        statements: 0,  // REPLACE with recorded value
      },
    },
  },
});

// Tool configs require export default to function
export default vitestConfig;
```

`src/index.ts` is excluded from coverage because it's the process entrypoint (just calls `serve()`) — not unit-testable without running the actual server.

**Named export (`vitestConfig`) + `export default` — both required.** The named export follows the project convention (architecture.md: "Named exports only — no `export default` except tool configs"). The `export default` is required for Vitest to pick it up. This pattern matches the established convention from `apps/web/vite.config.ts` which uses the same dual-export pattern.

### Task 3 — `apps/web/vite.config.ts` Coverage Addition

Current state (already has `test: { environment: 'jsdom' }`). Add `coverage` section:

```typescript
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';

export const config = defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
      // Thresholds set after recording actual post-gap-fix coverage (Task 5)
      thresholds: {
        lines: 0,       // REPLACE with recorded value
        functions: 0,   // REPLACE with recorded value
        branches: 0,    // REPLACE with recorded value
        statements: 0,  // REPLACE with recorded value
      },
    },
  },
});

// Tool configs require export default to function
export default config;
```

`src/main.ts` is excluded because it's the app bootstrap (creates Vue app, mounts to DOM) — not independently testable.

### Task 4 — Test Patterns for Gap Coverage

**`processOAuthCallback` tests** — add to existing `apps/server/src/services/authService.test.ts`.

The mock setup at the top already mocks `prisma.session` but NOT `prisma.user`. You need to extend the mock:

```typescript
vi.mock('../db/client.js', () => ({
  prisma: {
    session: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));
```

Also extend the import:
```typescript
import { prisma } from '../db/client.js';
import { createSession, destroySession, getSessionUser, handleCallback, processOAuthCallback } from './authService.js';
```

Test patterns:
```typescript
describe('processOAuthCallback', () => {
  const mockProfile = {
    googleSub: 'google-123',
    email: 'user@example.com',
    displayName: 'Test User',
    avatarUrl: 'https://example.com/avatar.jpg',
  };

  beforeEach(() => {
    // Mock handleCallback to return a fixed profile
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: 'tok' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sub: 'google-123', email: 'user@example.com', name: 'Test User', picture: 'https://example.com/avatar.jpg' }) });
  });

  it('existing user: updates profile and creates session, returns redirectTo "/"', async () => {
    const existingUser = { id: 'existing-user-id', googleSub: 'google-123', email: 'user@example.com' };
    vi.mocked(prisma.user.findUnique).mockResolvedValue(existingUser as never);
    vi.mocked(prisma.user.update).mockResolvedValue({ ...existingUser, displayName: 'Test User' } as never);
    vi.mocked(prisma.session.create).mockResolvedValue({} as never);

    const result = await processOAuthCallback('code', 'state', 'state');

    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'existing-user-id' },
      data: expect.objectContaining({ displayName: 'Test User', avatarUrl: mockProfile.avatarUrl }),
    }));
    expect(result.redirectTo).toBe('/');
    expect(result.sessionId).toBe('01JTEST00000000000000000000');
  });

  it('new user: creates user with ViewerCompany role and creates session, returns redirectTo "/"', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: '01JTEST00000000000000000000', role: 'ViewerCompany' } as never);
    vi.mocked(prisma.session.create).mockResolvedValue({} as never);

    const result = await processOAuthCallback('code', 'state', 'state');

    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        googleSub: 'google-123',
        email: 'user@example.com',
        role: 'ViewerCompany',
      }),
    }));
    expect(result.redirectTo).toBe('/');
  });
});
```

**`handleCallback` failure tests** — add to the existing `handleCallback` describe block in `authService.test.ts`:

```typescript
it('throws when token exchange returns non-ok response', async () => {
  global.fetch = vi.fn().mockResolvedValueOnce({ ok: false });
  await expect(handleCallback('code', 'state', 'state')).rejects.toThrow('Failed to exchange OAuth code');
});

it('throws when userinfo endpoint returns non-ok response', async () => {
  global.fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: 'tok' }) })
    .mockResolvedValueOnce({ ok: false });
  await expect(handleCallback('code', 'state', 'state')).rejects.toThrow('Failed to fetch Google user profile');
});
```

**`authMiddleware` tests** — create `apps/server/src/middleware/auth.test.ts`:

Testing Hono middleware requires constructing a minimal Hono app and using `app.request()`. Pattern mirrors what `auth.test.ts` does for routes:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../env.js', () => ({
  env: { NODE_ENV: 'test', BASE_URL: 'http://localhost:3000' },
}));
vi.mock('../db/client.js', () => ({ prisma: {} }));
vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => 'test-ulid') }));
vi.mock('../services/authService.js', () => ({
  getSessionUser: vi.fn(),
}));

import { Hono } from 'hono';
import { getSessionUser } from '../services/authService.js';
import { authMiddleware } from './auth.js';
import type { AppEnv } from '../lib/types.js';

describe('authMiddleware', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sets user in context when valid session cookie exists', async () => {
    const mockUser = { id: 'user-1', email: 'test@example.com' };
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);

    const app = new Hono<AppEnv>();
    app.use('*', authMiddleware);
    app.get('/test', (c) => c.json({ user: c.get('user') }));

    const res = await app.request('/test', { headers: { cookie: 'session_id=valid-session' } });
    const body = await res.json();
    expect(body.user).toEqual(mockUser);
    expect(getSessionUser).toHaveBeenCalledWith('valid-session');
  });

  it('sets user to null when no session cookie present', async () => {
    const app = new Hono<AppEnv>();
    app.use('*', authMiddleware);
    app.get('/test', (c) => c.json({ user: c.get('user') }));

    const res = await app.request('/test');
    const body = await res.json();
    expect(body.user).toBeNull();
    expect(getSessionUser).not.toHaveBeenCalled();
  });
});
```

**`requireAuth` tests** — create `apps/server/src/middleware/requireAuth.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../env.js', () => ({
  env: { NODE_ENV: 'test', BASE_URL: 'http://localhost:3000' },
}));
vi.mock('../db/client.js', () => ({ prisma: {} }));
vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => 'test-ulid') }));
vi.mock('../services/authService.js', () => ({
  getSessionUser: vi.fn(),
}));

import { Hono } from 'hono';
import { authMiddleware } from './auth.js';
import { requireAuth } from './requireAuth.js';
import { getSessionUser } from '../services/authService.js';
import type { AppEnv } from '../lib/types.js';

describe('requireAuth', () => {
  it('passes to next handler when user is authenticated', async () => {
    const mockUser = { id: 'user-1', email: 'test@example.com' };
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);

    const app = new Hono<AppEnv>();
    app.use('*', authMiddleware);
    app.use('*', requireAuth);
    app.get('/protected', (c) => c.json({ ok: true }));

    const res = await app.request('/protected', { headers: { cookie: 'session_id=valid-session' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('returns 401 UNAUTHORIZED when user is not authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);

    const app = new Hono<AppEnv>();
    app.use('*', authMiddleware);
    app.use('*', requireAuth);
    app.get('/protected', (c) => c.json({ ok: true }));

    const res = await app.request('/protected');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});
```

### Task 6 — CI Workflow Updates

The test scripts in both `package.json` files currently run `vitest run` (bare, no coverage). The CI step calls `pnpm --filter @manlycam/server test`. The cleanest approach is to update the CI step directly rather than changing the package.json `test` script — this makes it explicit that CI enforces coverage while local `pnpm test` can still be used without generating coverage reports.

**`server-ci.yml`** — change:
```yaml
- run: pnpm --filter @manlycam/server test
```
to:
```yaml
- run: pnpm --filter @manlycam/server exec vitest run --coverage
```

**`web-ci.yml`** — change:
```yaml
- run: pnpm --filter @manlycam/web test
```
to:
```yaml
- run: pnpm --filter @manlycam/web exec vitest run --coverage
```

The `--coverage` flag triggers `@vitest/coverage-v8` and enforces `coverage.thresholds` — non-zero exit if any threshold is not met.

### Architecture Compliance Notes

- `vitest.config.ts` uses named export (`vitestConfig`) + `export default` — same dual-export pattern as `vite.config.ts` (tool config exception to the no-default-export rule) [Source: architecture.md#Enforcement Guidelines]
- Tests co-located as `*.test.ts` — no `__tests__/` directories [Source: architecture.md line 680]
- `@vitest/coverage-v8` preferred over Istanbul: no instrumentation overhead, accurate branch tracking [Source: epics.md#Story 2.1c Notes, architecture.md line 282]
- Server has no Vite build pipeline — `vitest.config.ts` (not `vite.config.ts`) is the correct location for server test config [Source: server does not use Vite]
- `src/index.ts` and `src/main.ts` excluded from coverage — process entrypoints, not independently unit-testable
- Go agent (`apps/agent`) coverage is out of scope — `go test -coverprofile` deferred [Source: epics.md#Story 2.1c Notes]

### Previous Story Intelligence (from Story 2.1b)

From Story 2.1b completion notes (all relevant to this story's test infrastructure):
- `vite.config.ts` in `apps/web` already has `test: { environment: 'jsdom' }` — do NOT add a second `environment` key
- `jsdom` already installed in `apps/web/devDependencies`
- Web has 8 passing tests total: 4 `LoginView.test.ts` + 4 `useAuth.test.ts`
- ShadCN-vue components mock pattern established: `vi.mock('@/components/ui/button', () => ({...}))`
- Test mock pattern for env vars: set `import.meta.env.VITE_*` directly in `beforeEach`
- Named export + `export default` dual pattern established and confirmed working in `vite.config.ts`

From git log (recent commits relevant to this story):
- `review(story-2.1b)`: fixed orphaned `index.css`, `components.json` baseColor → `stone`, fixed test mock (Boolean prop type), strengthened Button test assertions
- `feat(story-2.1b)`: established design system, vite test environment, LoginView tests
- `fix(ci)`: established pattern of `pnpm --filter @manlycam/server exec prisma generate` before typecheck — similar exec pattern should be used for coverage step

### Project Structure Notes

**Files to create (new):**
```
apps/server/
  vitest.config.ts                   # New — server has no Vite/Vitest config yet
  src/middleware/
    auth.test.ts                     # New — authMiddleware coverage
    requireAuth.test.ts              # New — requireAuth coverage
```

**Files to modify:**
```
apps/server/
  src/services/authService.test.ts   # Add processOAuthCallback tests + handleCallback failure tests
                                     # Extend prisma mock to include user.findUnique/create/update
apps/web/
  vite.config.ts                     # Add coverage section under test
.github/workflows/
  server-ci.yml                      # Change test step to use --coverage
  web-ci.yml                         # Change test step to use --coverage
```

**Do NOT touch:**
- `apps/server/src/routes/auth.test.ts` — current tests are adequate; callback route testing is correctly delegated to service tests
- `apps/server/src/routes/me.test.ts` — adequate coverage
- `apps/web/src/composables/useAuth.test.ts` — adequate coverage
- `apps/web/src/views/LoginView.test.ts` — adequate coverage
- `apps/server/package.json` `test` script — leave as `vitest run` (CI calls coverage explicitly)
- `apps/web/package.json` `test` script — leave as `vitest run` (CI calls coverage explicitly)

### References

- Story requirements: [Source: `_bmad-output/planning-artifacts/epics.md#Story 2.1c`]
- Test coverage strategy: [Source: `_bmad-output/planning-artifacts/architecture.md#Test Coverage Strategy` lines 277–299]
- Testing standards (co-located, v8 provider): [Source: `_bmad-output/planning-artifacts/architecture.md` lines 282, 645, 680, 784]
- CI workflow structure (server + web): [Source: `.github/workflows/server-ci.yml`, `.github/workflows/web-ci.yml`]
- Named export convention (tool config exception): [Source: `_bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines`]
- Previous test patterns (mocking, withRouter): [Source: `_bmad-output/implementation-artifacts/2-1b-design-system-foundation-and-landing-page-polish.md`]
- `processOAuthCallback` source (current placeholder implementation): [Source: `apps/server/src/services/authService.ts` lines 102–140]
- Auth middleware sources: [Source: `apps/server/src/middleware/auth.ts`, `apps/server/src/middleware/requireAuth.ts`]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_No debug issues encountered._

### Completion Notes List

- Installed `@vitest/coverage-v8@^3.2.4` (matched to vitest 3.2.4) in both `apps/server` and `apps/web`.
- Created `apps/server/vitest.config.ts` — new file; server has no Vite pipeline so vitest.config.ts is the correct location. Uses dual export pattern (named `vitestConfig` + `export default`).
- Updated `apps/web/vite.config.ts` — added `coverage` block under `test`; did NOT add a second `environment` key.
- Extended prisma mock in `authService.test.ts` to include `user.findUnique/create/update`; added `processOAuthCallback` (2 tests) and `handleCallback` failure tests (2 tests). All 30 server tests pass.
- Created `auth.test.ts` and `requireAuth.test.ts` — both use Hono's `app.request()` pattern consistent with existing route tests. 2 tests each.
- Server coverage (post-gap tests): Statements 82.56%, Branches 85.41%, Functions 73.33%, Lines 82.56% → thresholds set to 82/85/73/82 (floored integers).
- Web coverage: Statements 23.29%, Branches 80.76%, Functions 77.77%, Lines 23.29% → thresholds set to 23/80/77/23. Low statement coverage expected — many views are stub/placeholder not yet tested.
- Both `vitest run --coverage` runs exit 0 with thresholds at these values. Breach test (lines: 99) confirmed exit 1.
- Updated `server-ci.yml` and `web-ci.yml` test steps to use `vitest run --coverage`.

### File List

**New files:**
- `apps/server/vitest.config.ts`
- `apps/server/src/middleware/auth.test.ts`
- `apps/server/src/middleware/requireAuth.test.ts`

**Modified files:**
- `apps/server/package.json` (added `@vitest/coverage-v8@^3.2.4` devDependency)
- `apps/server/src/services/authService.test.ts` (extended prisma mock; added processOAuthCallback + handleCallback failure tests)
- `apps/web/package.json` (added `@vitest/coverage-v8@^3.2.4` devDependency)
- `apps/web/vite.config.ts` (added coverage section under test)
- `.github/workflows/server-ci.yml` (test step: bare vitest → vitest run --coverage)
- `.github/workflows/web-ci.yml` (test step: bare vitest → vitest run --coverage)
- `pnpm-lock.yaml` (updated with new dependencies)

## Change Log

- 2026-03-07: Story 2.1c implemented — test coverage audit, gap tests added, coverage baselines recorded, thresholds enforced in config and CI.
