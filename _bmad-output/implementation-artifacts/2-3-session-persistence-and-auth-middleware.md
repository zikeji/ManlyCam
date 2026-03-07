# Story 2.3: Session Persistence and Auth Middleware

Status: review

## Story

As an authorized viewer,
I want my session to persist across visits,
so that I can return to the stream without re-authenticating every time.

## Acceptance Criteria

1. **Given** an authenticated user closes and reopens the browser **When** they visit `/` **Then** `GET /api/me` returns their user profile (session cookie is still valid) and `WatchView.vue` renders — no OAuth redirect occurs

2. **Given** an authenticated user makes any request to a protected route **When** the `requireAuth` middleware runs **Then** it: (1) reads `session_id` from the cookie, (2) looks up the session in the `sessions` table, (3) checks `expires_at > NOW()`, (4) checks `users.banned_at IS NULL` — all four must pass or the middleware returns `401 { error: { code: 'UNAUTHORIZED', message: '...' } }`

3. **Given** a request arrives with a banned user's valid session **When** `requireAuth` runs **Then** it returns `401 { error: { code: 'BANNED', message: '...' } }` — the SPA client reacts by redirecting to `/banned`

4. **Given** `POST /api/auth/logout` is called **When** the handler runs **Then** the `sessions` row is deleted, the `session_id` cookie is cleared (expired), and `{ ok: true }` is returned

5. **Given** a `requireRole(['Admin'])` middleware-protected route is accessed by a `ViewerCompany` user **When** the middleware evaluates the role **Then** the server returns `403 { error: { code: 'FORBIDDEN', message: '...' } }`

6. **And** sessions expire 30 days after creation (`expires_at = NOW() + 30 days`) — no sliding expiry; re-authentication required after expiry

## Tasks / Subtasks

- [x] Task 1: Update `requireAuth` to add BANNED check and message fields (AC: 2, 3)
  - [x] Add `user.bannedAt` check after null check — return `401 { error: { code: 'BANNED', message: 'Your account has been banned.' } }`
  - [x] Add `message` field to UNAUTHORIZED response: `401 { error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } }`

- [x] Task 2: Create `requireRole` middleware (AC: 5)
  - [x] New file: `apps/server/src/middleware/requireRole.ts`
  - [x] Factory function `requireRole(roles: Role[])` returns a `MiddlewareHandler<AppEnv>`
  - [x] Import `Role` from `@manlycam/types` for type safety
  - [x] If `user.role` is not in `roles`, return `403 { error: { code: 'FORBIDDEN', message: 'Insufficient permissions.' } }`
  - [x] Named export only (no `export default`)

- [x] Task 3: Update `requireAuth.test.ts` (AC: 2, 3)
  - [x] Update existing UNAUTHORIZED test: change `.toEqual({ code: 'UNAUTHORIZED' })` to `.toMatchObject({ code: 'UNAUTHORIZED' })` OR add `message` to the expected object
  - [x] Add test: banned user (valid session but `bannedAt` set) → `401 { error: { code: 'BANNED' } }`

- [x] Task 4: Create `requireRole.test.ts` (AC: 5)
  - [x] New co-located file: `apps/server/src/middleware/requireRole.test.ts`
  - [x] Test: Admin role accessing Admin-only route → 200
  - [x] Test: ViewerCompany accessing Admin-only route → 403 FORBIDDEN
  - [x] Test: ViewerGuest accessing Moderator-or-Admin route → 403 FORBIDDEN
  - [x] Test: multiple allowed roles (e.g., `['Admin', 'Moderator']`) → passes for each

- [x] Task 5: Verify all existing ACs already satisfied and confirm no regressions (AC: 1, 4, 6)
  - [x] AC1 — confirm `GET /api/me` + WatchView work for returning session (no code changes, but run tests to confirm)
  - [x] AC4 — confirm `POST /api/auth/logout` works (already implemented in Story 2.1)
  - [x] AC6 — confirm `createSession` sets `expiresAt = NOW() + 30 days` (verified in Story 2.1, no change needed)
  - [x] Run `pnpm --filter @manlycam/server exec vitest run --coverage` and update thresholds if coverage improves

## Dev Notes

### CRITICAL: What IS and IS NOT Already Implemented

**DO NOT re-implement — these are complete and working:**
- `authMiddleware` (`apps/server/src/middleware/auth.ts`): reads `session_id` cookie → calls `getSessionUser` → sets `c.set('user', user)` (null if missing/expired)
- `getSessionUser` (`apps/server/src/services/authService.ts`): finds session by ID with user join, checks `expiresAt < new Date()`, returns `session.user` (or null)
- `requireAuth` (`apps/server/src/middleware/requireAuth.ts`): exists but needs BANNED check and message fields added
- `GET /api/me` (`apps/server/src/routes/me.ts`): complete, returns full user profile shape
- `POST /api/auth/logout` (`apps/server/src/routes/auth.ts`): complete, calls `destroySession`, clears cookie
- `createSession` (`apps/server/src/services/authService.ts`): 30-day expiry (`expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)`) already correct
- Router guard (`apps/web/src/router/index.ts`): already handles `error.code === 'BANNED'` → redirect `/banned`
- All routes registered in `app.ts`

**DO implement — the actual gaps:**
1. `requireAuth` BANNED path (update existing file)
2. `requireRole` factory middleware (new file)
3. Tests for both

### CRITICAL: `requireAuth` Update (`apps/server/src/middleware/requireAuth.ts`)

Current state:
```typescript
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: { code: 'UNAUTHORIZED' } }, 401);
  }
  await next();
};
```

Required final state:
```typescript
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../lib/types.js';

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } }, 401);
  }
  if (user.bannedAt) {
    return c.json({ error: { code: 'BANNED', message: 'Your account has been banned.' } }, 401);
  }
  await next();
};
```

Key point: `getSessionUser` returns `session.user` including `bannedAt`. A banned user with a valid session currently passes `requireAuth` (bug). The BANNED check here is the fix.

### CRITICAL: `requireRole` New File (`apps/server/src/middleware/requireRole.ts`)

```typescript
import type { MiddlewareHandler } from 'hono';
import type { Role } from '@manlycam/types';
import type { AppEnv } from '../lib/types.js';

export function requireRole(roles: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user')!; // requireRole always chains after requireAuth; user is guaranteed non-null and non-banned
    if (!roles.includes(user.role as Role)) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions.' } }, 403);
    }
    await next();
  };
}
```

Usage pattern (for future stories): `app.use('/api/admin/*', requireAuth, requireRole(['Admin']))`

`Role` values from `packages/types/src/ws.ts`: `'Admin' | 'Moderator' | 'ViewerCompany' | 'ViewerGuest'`

### CRITICAL: `requireAuth.test.ts` Update

The existing test at line 48 uses `.toEqual({ code: 'UNAUTHORIZED' })` which is a deep equality check. Adding `message` to the response will break this test. Fix:

```typescript
// BEFORE (will break)
expect(body.error).toEqual({ code: 'UNAUTHORIZED' });

// AFTER (correct)
expect(body.error.code).toBe('UNAUTHORIZED');
expect(body.error.message).toBeDefined();
```

Add a new test for the BANNED path:
```typescript
it('returns 401 BANNED when authenticated user is banned', async () => {
  const bannedUser = { id: 'user-1', email: 'test@example.com', bannedAt: new Date() };
  vi.mocked(getSessionUser).mockResolvedValue(bannedUser as never);

  const app = new Hono<AppEnv>();
  app.use('*', authMiddleware);
  app.use('*', requireAuth);
  app.get('/protected', (c) => c.json({ ok: true }));

  const res = await app.request('/protected', {
    headers: { cookie: 'session_id=banned-user-session' },
  });
  expect(res.status).toBe(401);
  const body = await res.json();
  expect(body.error.code).toBe('BANNED');
});
```

### CRITICAL: `requireRole.test.ts` New File

Follow the exact same mock pattern as `requireAuth.test.ts` (same module mocks at top):

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
import { requireAuth } from './requireAuth.js';
import { requireRole } from './requireRole.js';
import type { AppEnv } from '../lib/types.js';

describe('requireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeApp = (roles: string[]) => {
    const app = new Hono<AppEnv>();
    app.use('*', authMiddleware);
    app.use('*', requireAuth);
    app.use('*', requireRole(roles as never));
    app.get('/admin', (c) => c.json({ ok: true }));
    return app;
  };

  it('passes when user role is in the allowed list', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'u1', role: 'Admin', bannedAt: null } as never);
    const res = await makeApp(['Admin']).request('/admin', {
      headers: { cookie: 'session_id=s1' },
    });
    expect(res.status).toBe(200);
  });

  it('returns 403 FORBIDDEN when user role is not in allowed list', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'u1', role: 'ViewerCompany', bannedAt: null } as never);
    const res = await makeApp(['Admin']).request('/admin', {
      headers: { cookie: 'session_id=s1' },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 403 FORBIDDEN for ViewerGuest accessing Moderator-or-Admin route', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'u1', role: 'ViewerGuest', bannedAt: null } as never);
    const res = await makeApp(['Admin', 'Moderator']).request('/admin', {
      headers: { cookie: 'session_id=s1' },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('passes for any role in a multi-role allowlist', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'u1', role: 'Moderator', bannedAt: null } as never);
    const res = await makeApp(['Admin', 'Moderator']).request('/admin', {
      headers: { cookie: 'session_id=s1' },
    });
    expect(res.status).toBe(200);
  });
});
```

### Why `getSessionUser` Does NOT Check `bannedAt`

`getSessionUser` returns `session.user` which includes `bannedAt`. It intentionally does NOT filter out banned users — that's `requireAuth`'s responsibility. This design allows `authMiddleware` to provide the full user context (including ban status) without making an access control decision, keeping concerns separated. Changing `getSessionUser` to return null for banned users would eliminate the BANNED vs UNAUTHORIZED distinction in `requireAuth`.

### Architecture Compliance

- `Role` type: import from `@manlycam/types` (not raw strings) — `ws.ts` exports `Role` const and type
- Named exports only: `requireRole` is a named export, no `export default`
- Error shape: `{ error: { code: string, message: string } }` — matches global error handler pattern in `app.ts`
- `requireRole` always chains after `requireAuth` — user is guaranteed non-null and non-banned when `requireRole` runs; the `user!` non-null assertion is safe
- Tests: co-located `*.test.ts`, Vitest, same mock pattern as existing middleware tests
- No new Prisma models, no migrations, no new routes

### Coverage Thresholds

Current thresholds (set after Story 2.2, `apps/server/vitest.config.ts`):
```
lines: 83, functions: 73, branches: 85, statements: 83
```

Adding new middleware (requireRole) with full test coverage will likely improve or maintain thresholds. Run coverage after implementation:
```
pnpm --filter @manlycam/server exec vitest run --coverage
```
Update thresholds to the new values if they improve (following Story 2.1c/2.2 precedent). Do not lower thresholds.

### File Summary

**Modified files:**
```
apps/server/src/middleware/requireAuth.ts         # add BANNED check + message to UNAUTHORIZED
apps/server/src/middleware/requireAuth.test.ts    # fix .toEqual assertion, add BANNED test
apps/server/vitest.config.ts                      # update thresholds if coverage improves
```

**New files:**
```
apps/server/src/middleware/requireRole.ts         # new requireRole factory middleware
apps/server/src/middleware/requireRole.test.ts    # new requireRole tests
```

**DO NOT touch:**
- `apps/server/src/middleware/auth.ts` — complete
- `apps/server/src/services/authService.ts` — complete (getSessionUser intentionally does not check bannedAt)
- `apps/server/src/routes/me.ts` — complete
- `apps/server/src/routes/auth.ts` — complete
- `apps/server/src/app.ts` — complete (all routes registered)
- `apps/web/src/router/index.ts` — complete (already handles BANNED redirect)
- `apps/web/src/composables/useAuth.ts` — complete
- Any other files

### Project Structure Notes

- `middleware/requireRole.ts` follows the same pattern as `middleware/requireAuth.ts` — single named export
- The `Role` import from `@manlycam/types` avoids string literals and ensures type safety at the middleware boundary
- `user.role` from Prisma is typed as `string`, not `Role` — the `as Role` cast in `requireRole` is safe because `Role` values are the only values stored in the DB (enforced at write time)

### References

- Story requirements: [Source: `_bmad-output/planning-artifacts/epics.md#Story 2.3`]
- `requireSession` / `requireRole` architecture spec: [Source: `_bmad-output/planning-artifacts/architecture.md` lines 401–402]
- `banned_at IS NULL` check on every request: [Source: `_bmad-output/planning-artifacts/architecture.md` line 342]
- BANNED error code → /banned client redirect: [Source: `_bmad-output/planning-artifacts/architecture.md` lines 563–564]
- Current `requireAuth` implementation: [Source: `apps/server/src/middleware/requireAuth.ts`]
- Current `authMiddleware` implementation: [Source: `apps/server/src/middleware/auth.ts`]
- Current `getSessionUser` (returns user with bannedAt): [Source: `apps/server/src/services/authService.ts`]
- `Role` type definition: [Source: `packages/types/src/ws.ts`]
- Existing middleware test patterns: [Source: `apps/server/src/middleware/requireAuth.test.ts`, `apps/server/src/middleware/auth.test.ts`]
- Coverage thresholds (current): [Source: `apps/server/vitest.config.ts`]
- Previous story learnings (test patterns, coverage flow): [Source: `_bmad-output/implementation-artifacts/2-2-allowlist-enforcement-and-rejection-handling.md`]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

(none)

### Completion Notes List

- Updated `requireAuth` to add `message` field to UNAUTHORIZED response and a new BANNED path for users with `bannedAt` set. Bug fix: banned users with valid sessions previously passed `requireAuth`.
- Created `requireRole` factory middleware that checks `user.role` against an allowed roles list, returns 403 FORBIDDEN if not in list. Named export, chains after `requireAuth`.
- Updated `requireAuth.test.ts`: replaced fragile `.toEqual({ code: 'UNAUTHORIZED' })` deep-equality check with individual field assertions, added `beforeEach(vi.clearAllMocks)`, added BANNED test case.
- Created `requireRole.test.ts` with 4 tests covering: Admin pass, ViewerCompany → 403, ViewerGuest on multi-role → 403, Moderator on multi-role → pass.
- All 41 tests pass, no regressions. Coverage improved: functions 73→75, branches 85→86. Thresholds updated in vitest.config.ts.

### File List

apps/server/src/middleware/requireAuth.ts
apps/server/src/middleware/requireAuth.test.ts
apps/server/src/middleware/requireRole.ts
apps/server/src/middleware/requireRole.test.ts
apps/server/vitest.config.ts

## Change Log

- 2026-03-07: Implemented Story 2.3 — added BANNED check + message fields to `requireAuth`, created `requireRole` factory middleware, updated/created associated tests, updated coverage thresholds (functions 73→75, branches 85→86). 41 tests pass, no regressions.
