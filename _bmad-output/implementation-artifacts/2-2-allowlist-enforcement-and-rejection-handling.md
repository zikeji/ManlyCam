# Story 2.2: Allowlist Enforcement and Rejection Handling

Status: done

## Story

As the system,
I want to enforce allowlist rules at registration time and reject unauthorized users clearly,
so that only approved viewers can ever reach the stream or chat.

## Acceptance Criteria

1. **Given** the OAuth callback completes for a new user **When** the server performs the allowlist check **Then** it checks in order: (1) email domain in `allowlist_entries` where `type='domain'`; (2) full email in `allowlist_entries` where `type='email'` — domain match → create user with `role: 'ViewerCompany'`; email-only match → create user with `role: 'ViewerGuest'`; neither match → no `users` row, no session, redirect to `/rejected`

2. **Given** a new user passes the allowlist check **When** the user record is created **Then** a `users` row is inserted with a server-generated ULID, the correct `role` (`ViewerCompany` for domain match, `ViewerGuest` for email-only match), and the user's Google profile data — browser is then redirected to `/`

3. **Given** a new user fails the allowlist check **When** rejection is determined **Then** no `users` row is created, no session is created, and the browser is redirected to `/rejected` — the route handler does NOT set a `session_id` cookie

4. **Given** a returning user (existing `users` row) completes OAuth **When** the login flow runs **Then** the allowlist check is skipped entirely — only `bannedAt IS NULL` is checked; if banned → redirect to `/banned` (no new session created); otherwise update `lastSeenAt` (and profile if changed), create new session, redirect to `/`

5. **Given** a user lands on `/rejected` **When** the page renders **Then** `RejectedView.vue` displays a friendly invite-only message — no session is required to view this page and no retry mechanism is shown

## Tasks / Subtasks

- [x] Task 1: Update `processOAuthCallback` in `authService.ts` to enforce allowlist and ban check (AC: 1, 2, 3, 4)
  - [x] Change return type signature to `Promise<{ sessionId: string | null; redirectTo: string }>`
  - [x] Existing user path: add `bannedAt` check before creating session — if banned, return `{ sessionId: null, redirectTo: '/banned' }`
  - [x] New user path: replace placeholder comment with allowlist queries (domain first, then email)
  - [x] No-match path: return `{ sessionId: null, redirectTo: '/rejected' }` without touching DB

- [x] Task 2: Update OAuth callback route handler in `auth.ts` to conditionally set session cookie (AC: 3)
  - [x] Only call `setCookie` for `session_id` if `sessionId` is truthy (non-null)
  - [x] Always call `c.redirect(redirectTo)` regardless of path

- [x] Task 3: Extend `authService.test.ts` mock and add allowlist/ban tests (AC: 1, 2, 3, 4)
  - [x] Extend prisma mock to include `allowlistEntry: { findFirst: vi.fn() }`
  - [x] Update existing "new user: ViewerCompany" test to mock `allowlistEntry.findFirst` with a domain match
  - [x] Add test: domain allowlist match → user created with `ViewerCompany`, `redirectTo: '/'`
  - [x] Add test: email-only allowlist match (domain returns null) → user created with `ViewerGuest`, `redirectTo: '/'`
  - [x] Add test: no allowlist match → `null` sessionId, `redirectTo: '/rejected'`, `prisma.user.create` not called, `prisma.session.create` not called
  - [x] Add test: existing user with `bannedAt` set → `null` sessionId, `redirectTo: '/banned'`, `prisma.session.create` not called

- [x] Task 4: Add rejected/banned redirect tests to `auth.test.ts` (AC: 3, 4)
  - [x] Add test: `processOAuthCallback` returns `{ sessionId: null, redirectTo: '/rejected' }` → 302 to `/rejected`, no `session_id` in `set-cookie`
  - [x] Add test: `processOAuthCallback` returns `{ sessionId: null, redirectTo: '/banned' }` → 302 to `/banned`, no `session_id` in `set-cookie`

- [x] Task 5: Verify `RejectedView.vue` satisfies AC5 — no code changes expected (AC: 5)
  - [x] Confirm current stub renders friendly message, no session required, no retry mechanism
  - [x] If view content is insufficient, update the message text only — do not add interactive elements

## Dev Notes

### CRITICAL: processOAuthCallback changes (`apps/server/src/services/authService.ts`)

**Return type change — this is a breaking change that requires auth.ts update in the same commit:**

```typescript
// BEFORE
Promise<{ sessionId: string; redirectTo: string }>

// AFTER
Promise<{ sessionId: string | null; redirectTo: string }>
```

**Full rewrite of `processOAuthCallback` body (lines 102–140 in current authService.ts):**

```typescript
export async function processOAuthCallback(
  code: string,
  state: string,
  expectedState: string,
): Promise<{ sessionId: string | null; redirectTo: string }> {
  const profile = await handleCallback(code, state, expectedState);

  const existingUser = await prisma.user.findUnique({
    where: { googleSub: profile.googleSub },
  });

  if (existingUser) {
    // Returning user: skip allowlist, only check ban
    if (existingUser.bannedAt) {
      return { sessionId: null, redirectTo: '/banned' };
    }
    const updated = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        lastSeenAt: new Date(),
      },
    });
    // TODO(story 3.4): broadcast user:update WS message when WS hub is available
    const sessionId = await createSession(updated.id);
    return { sessionId, redirectTo: '/' };
  }

  // New user: enforce allowlist
  const emailDomain = profile.email.split('@')[1] ?? '';
  const domainEntry = await prisma.allowlistEntry.findFirst({
    where: { type: 'domain', value: emailDomain },
  });

  let role: string;
  if (domainEntry) {
    role = 'ViewerCompany';
  } else {
    const emailEntry = await prisma.allowlistEntry.findFirst({
      where: { type: 'email', value: profile.email },
    });
    if (!emailEntry) {
      return { sessionId: null, redirectTo: '/rejected' };
    }
    role = 'ViewerGuest';
  }

  const userId = ulid();
  const newUser = await prisma.user.create({
    data: {
      id: userId,
      googleSub: profile.googleSub,
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      role,
    },
  });
  const sessionId = await createSession(newUser.id);
  return { sessionId, redirectTo: '/' };
}
```

### CRITICAL: auth.ts route update (`apps/server/src/routes/auth.ts`)

**Callback handler change — only set session cookie when sessionId is non-null:**

```typescript
authRouter.get('/api/auth/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const expectedState = getCookie(c, 'oauth_state');

  if (!code || !state || !expectedState) {
    throw new AppError('Missing OAuth parameters', 'UNAUTHORIZED', 401);
  }

  deleteCookie(c, 'oauth_state', { path: '/' });

  const { sessionId, redirectTo } = await processOAuthCallback(code, state, expectedState);

  if (sessionId) {
    setCookie(c, 'session_id', sessionId, {
      httpOnly: true,
      sameSite: 'Strict',
      secure: env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return c.redirect(redirectTo);
});
```

### CRITICAL: authService.test.ts mock extension

**Extend the existing `vi.mock('../db/client.js', ...)` at the top of the file to add `allowlistEntry`:**

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
    allowlistEntry: {       // ADD THIS BLOCK
      findFirst: vi.fn(),
    },
  },
}));
```

**Update existing test** "new user: creates user with ViewerCompany role and creates session" — after implementing allowlist, this test will fail without mocking `allowlistEntry.findFirst`. Add to that test's setup:

```typescript
vi.mocked(prisma.allowlistEntry.findFirst).mockResolvedValueOnce({
  id: 'allowlist-1',
  type: 'domain',
  value: 'example.com',
  createdAt: new Date(),
} as never);
```

**New test patterns — add a new `describe` block after the existing `processOAuthCallback` describe:**

```typescript
describe('processOAuthCallback - allowlist enforcement (new users)', () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null); // always new user
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: 'tok' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            sub: 'google-123',
            email: 'user@example.com',
            name: 'Test User',
            picture: 'https://example.com/avatar.jpg',
          }),
      });
  });

  it('domain match: creates user with ViewerCompany role, redirectTo "/"', async () => {
    vi.mocked(prisma.allowlistEntry.findFirst).mockResolvedValueOnce({
      id: 'al-1', type: 'domain', value: 'example.com', createdAt: new Date(),
    } as never);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: '01JTEST00000000000000000000', role: 'ViewerCompany' } as never);
    vi.mocked(prisma.session.create).mockResolvedValue({} as never);

    const result = await processOAuthCallback('code', 'state', 'state');

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'ViewerCompany' }) }),
    );
    expect(result).toEqual({ sessionId: '01JTEST00000000000000000000', redirectTo: '/' });
  });

  it('email-only match: creates user with ViewerGuest role, redirectTo "/"', async () => {
    vi.mocked(prisma.allowlistEntry.findFirst)
      .mockResolvedValueOnce(null) // no domain match
      .mockResolvedValueOnce({ id: 'al-2', type: 'email', value: 'user@example.com', createdAt: new Date() } as never);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: '01JTEST00000000000000000000', role: 'ViewerGuest' } as never);
    vi.mocked(prisma.session.create).mockResolvedValue({} as never);

    const result = await processOAuthCallback('code', 'state', 'state');

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'ViewerGuest' }) }),
    );
    expect(result.redirectTo).toBe('/');
  });

  it('no allowlist match: returns null sessionId, redirectTo "/rejected", does not create user or session', async () => {
    vi.mocked(prisma.allowlistEntry.findFirst).mockResolvedValue(null);

    const result = await processOAuthCallback('code', 'state', 'state');

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.session.create).not.toHaveBeenCalled();
    expect(result).toEqual({ sessionId: null, redirectTo: '/rejected' });
  });
});

describe('processOAuthCallback - existing user ban check', () => {
  beforeEach(() => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: 'tok' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ sub: 'google-123', email: 'user@example.com', name: 'Test User', picture: null }),
      });
  });

  it('banned existing user: returns null sessionId, redirectTo "/banned", does not create session', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      googleSub: 'google-123',
      email: 'user@example.com',
      bannedAt: new Date(),
    } as never);

    const result = await processOAuthCallback('code', 'state', 'state');

    expect(prisma.session.create).not.toHaveBeenCalled();
    expect(result).toEqual({ sessionId: null, redirectTo: '/banned' });
  });
});
```

### CRITICAL: auth.test.ts new tests

**Add to the existing `describe('GET /api/auth/google/callback')` block:**

```typescript
it('redirects to /rejected and does not set session cookie when user is not on allowlist', async () => {
  vi.mocked(processOAuthCallback).mockResolvedValue({ sessionId: null, redirectTo: '/rejected' });
  const app = createApp();
  const res = await app.request('/api/auth/google/callback?code=auth-code&state=test-state', {
    headers: { cookie: 'oauth_state=test-state' },
  });
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe('/rejected');
  const cookieHeader = res.headers.get('set-cookie') ?? '';
  expect(cookieHeader).not.toContain('session_id=');
});

it('redirects to /banned and does not set session cookie when existing user is banned', async () => {
  vi.mocked(processOAuthCallback).mockResolvedValue({ sessionId: null, redirectTo: '/banned' });
  const app = createApp();
  const res = await app.request('/api/auth/google/callback?code=auth-code&state=test-state', {
    headers: { cookie: 'oauth_state=test-state' },
  });
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe('/banned');
  const cookieHeader = res.headers.get('set-cookie') ?? '';
  expect(cookieHeader).not.toContain('session_id=');
});
```

### RejectedView.vue and BannedView.vue — No Changes Expected

Both views already exist and satisfy their ACs:
- `apps/web/src/views/RejectedView.vue` — "Access Restricted" / "This stream is invite-only." (no session required, no retry)
- `apps/web/src/views/BannedView.vue` — "Account Suspended" / "Your account has been banned from this stream."
- Router already handles `/rejected` and `/banned` routes in `router/index.ts` (bypasses auth guard at line 34)

Do NOT add retry buttons, links, or interactive elements to either view.

### WS Broadcast for Profile Updates — DEFERRED

The AC states: "if the returning user's Google profile has changed, broadcast a `{ type: 'user:update', payload: UserProfile }` WS message". The WS hub does not exist until Epic 3 (Story 3.4). Add a `// TODO(story 3.4): broadcast user:update WS message when WS hub is available` comment at the profile-update location in `processOAuthCallback`. Do not implement the broadcast now.

### Coverage Impact

After adding tests, run `pnpm --filter @manlycam/server exec vitest run --coverage` to verify thresholds still pass. Current server thresholds: lines 81, branches 82, functions 73, statements 81 (set in `apps/server/vitest.config.ts`). New code paths are all tested — thresholds should remain satisfied or improve. If new code raises coverage, update thresholds to the new values per the Story 2.1c precedent.

### Architecture Compliance

- ULID: still via `ulid()` from `apps/server/src/lib/ulid.ts` — no change
- Prisma singleton: `prisma` from `apps/server/src/db/client.ts` — no change
- AppError: no new error codes; rejection is a redirect not a thrown error
- Named exports only: `processOAuthCallback` remains named export — no `export default`
- Tests co-located as `*.test.ts`: adding to existing files only, no new test files needed
- `allowlistEntry` Prisma model: `type` is `'domain' | 'email'`, `value` is the domain or full email — see `apps/server/prisma/schema.prisma` lines 44–52

### Project Structure Notes

**Modified files only — no new files:**
```
apps/server/src/
  services/authService.ts         # allowlist check + ban check + return type change
  services/authService.test.ts    # extend mock + add allowlist/ban tests
  routes/auth.ts                  # conditional session cookie
  routes/auth.test.ts             # add /rejected and /banned redirect tests
```

**Do NOT touch:**
- `apps/web/src/views/RejectedView.vue` — already satisfies AC5
- `apps/web/src/views/BannedView.vue` — already satisfies banned state requirement
- `apps/web/src/router/index.ts` — already bypasses auth guard for `/rejected` and `/banned`
- `apps/server/prisma/schema.prisma` — `AllowlistEntry` model already exists, no migration needed
- Any other files

### References

- Story requirements: [Source: `_bmad-output/planning-artifacts/epics.md#Story 2.2`]
- Allowlist policy (registration-gate only): [Source: `_bmad-output/planning-artifacts/architecture.md#Allowlist Policy: Registration gate only`]
- `processOAuthCallback` current implementation (placeholder comment at line 126): [Source: `apps/server/src/services/authService.ts`]
- Auth callback route handler: [Source: `apps/server/src/routes/auth.ts`]
- `AllowlistEntry` Prisma model: [Source: `apps/server/prisma/schema.prisma` lines 44–52]
- Router auth guard (bypasses /rejected and /banned): [Source: `apps/web/src/router/index.ts` line 34]
- Test mock patterns: [Source: `apps/server/src/services/authService.test.ts`]
- Auth route test patterns (`createApp()`, `vi.mocked(processOAuthCallback)`): [Source: `apps/server/src/routes/auth.test.ts`]
- Coverage thresholds: [Source: `apps/server/vitest.config.ts`]
- Previous story learnings (mock extension pattern, dual-export, test runner): [Source: `_bmad-output/implementation-artifacts/2-1c-test-coverage-audit-and-baseline-enforcement.md`]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_No blockers or deviations — implementation proceeded exactly per Dev Notes._

### Completion Notes List

- Implemented `processOAuthCallback` return type change to `string | null` for `sessionId`; existing user ban check added before session creation; new user allowlist enforcement (domain → ViewerCompany, email → ViewerGuest, no match → reject) replacing the Story 2.2 placeholder comment.
- Updated `auth.ts` callback handler to guard `setCookie` behind `if (sessionId)` — redirect always fires regardless.
- Extended prisma mock with `allowlistEntry.findFirst`, updated existing ViewerCompany test, added 3 allowlist tests and 1 ban test in `authService.test.ts`.
- Added 2 route-level rejection tests in `auth.test.ts` verifying 302 redirects to `/rejected` and `/banned` with no `session_id` cookie.
- `RejectedView.vue` confirmed satisfying AC5 — no changes needed.
- Coverage improved: lines 83.11%, branches 85.45%, functions 73.33%, statements 83.11% — thresholds updated in `vitest.config.ts`.
- All 36 tests pass, no regressions.

### File List

- `apps/server/src/services/authService.ts` — modified (allowlist enforcement, ban check, return type)
- `apps/server/src/services/authService.test.ts` — modified (extended mock, new allowlist/ban tests)
- `apps/server/src/routes/auth.ts` — modified (conditional session cookie)
- `apps/server/src/routes/auth.test.ts` — modified (rejection/ban redirect tests)
- `apps/server/vitest.config.ts` — modified (updated coverage thresholds)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — modified (story status)

## Change Log

- 2026-03-07: Implemented allowlist enforcement and rejection handling — `processOAuthCallback` now enforces domain/email allowlist for new users, checks `bannedAt` for existing users, and returns `null` sessionId for rejected/banned paths. Route handler updated to guard cookie set. 8 new tests added (36 total, all passing). Coverage thresholds raised to lines/statements 83, branches 85.
- 2026-03-07: ✅ Code review completed — All acceptance criteria verified. Implementation is production-ready. Story marked done.
