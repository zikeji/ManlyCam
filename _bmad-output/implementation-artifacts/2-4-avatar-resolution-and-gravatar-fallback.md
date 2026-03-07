# Story 2.4: Avatar Resolution and Gravatar Fallback

Status: review

## Story

As an authorized viewer,
I want my Google profile picture to appear next to my chat messages and in my profile menu,
so that I'm recognizable to coworkers without any setup.

## Acceptance Criteria

1. **Given** a user logs in and Google provides a profile picture URL **When** the user record is created or updated **Then** `avatar_url` is set to the Google-provided URL

2. **Given** a user logs in and Google does not provide a profile picture **When** the user record is created **Then** `avatar_url` is set to the Gravatar URL derived from the MD5 hash of the lowercased, trimmed email address, with `?d=identicon&s=128` query params

3. **Given** `GET /api/me` is called **When** the response is returned **Then** `avatarUrl` is always a non-null string — either the Google URL or the Gravatar URL; it is never `null` or omitted

## Tasks / Subtasks

- [x] Task 1: Add `resolveAvatarUrl` helper to `authService.ts` (AC: 1, 2)
  - [x] Add `createHash` to the existing `import { randomBytes } from 'node:crypto'` import
  - [x] Write `resolveAvatarUrl(googleAvatarUrl: string | null, email: string): string`
  - [x] If `googleAvatarUrl` is truthy, return it unchanged
  - [x] Otherwise, MD5-hash `email.toLowerCase().trim()`, return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=128`

- [x] Task 2: Apply `resolveAvatarUrl` in `processOAuthCallback` (AC: 1, 2)
  - [x] New user path (`prisma.user.create`): replace `avatarUrl: profile.avatarUrl` with `avatarUrl: resolveAvatarUrl(profile.avatarUrl, profile.email)`
  - [x] Returning user path (`prisma.user.update`): replace `avatarUrl: profile.avatarUrl` with `avatarUrl: resolveAvatarUrl(profile.avatarUrl, profile.email)`

- [x] Task 3: Add tests to `authService.test.ts` (AC: 1, 2, 3)
  - [x] New user, no Google picture → `prisma.user.create` called with a Gravatar URL (assert URL starts with `https://www.gravatar.com/avatar/` and ends with `?d=identicon&s=128`)
  - [x] Returning user, no Google picture → `prisma.user.update` called with a Gravatar URL
  - [x] New user, with Google picture → `prisma.user.create` called with the Google URL (existing tests already verify this; confirm they still pass)

- [x] Task 4: Run tests and update coverage thresholds if improved (AC: all)
  - [x] `pnpm --filter @manlycam/server exec vitest run --coverage`
  - [x] Update thresholds in `apps/server/vitest.config.ts` if any value improves; never lower them

## Dev Notes

### CRITICAL: What IS and IS NOT the Gap

**Already implemented and working — DO NOT touch:**
- `handleCallback` in `authService.ts`: correctly returns `avatarUrl: picture ?? null`; this is intentionally nullable — resolution happens at the write layer
- `GET /api/me` route (`me.ts`): returns `user.avatarUrl ?? null`; once the write path is fixed, this will always return a valid URL for any properly-created user — no change needed here
- `POST /api/auth/google/callback` route (`auth.ts`): calls `processOAuthCallback` — no change
- `requireAuth`, `requireRole`, `auth middleware`: no change
- `prisma` schema: `avatar_url TEXT` column is already nullable in DB; the Gravatar fallback ensures it is always populated at write time

**THE ONLY GAP — implement this:**
`processOAuthCallback` in `authService.ts` stores `avatarUrl: profile.avatarUrl` directly (can be `null` when Google does not provide a picture). Both the new user create path and the returning user update path need the Gravatar fallback applied.

### CRITICAL: `resolveAvatarUrl` Implementation

```typescript
// Add createHash to existing crypto import at top of authService.ts:
import { randomBytes, createHash } from 'node:crypto';

// Helper — resolves avatar: Google URL takes priority; Gravatar as fallback
function resolveAvatarUrl(googleAvatarUrl: string | null, email: string): string {
  if (googleAvatarUrl) return googleAvatarUrl;
  const hash = createHash('md5').update(email.toLowerCase().trim()).digest('hex');
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=128`;
}
```

This function is **not exported** — it is an internal helper used only within `authService.ts`.

### CRITICAL: Exact Changes to `processOAuthCallback`

**Returning user update path** (around line 118–125):
```typescript
// BEFORE
const updated = await prisma.user.update({
  where: { id: existingUser.id },
  data: {
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,       // <-- BUG: null when Google has no picture
    lastSeenAt: new Date(),
  },
});

// AFTER
const updated = await prisma.user.update({
  where: { id: existingUser.id },
  data: {
    displayName: profile.displayName,
    avatarUrl: resolveAvatarUrl(profile.avatarUrl, profile.email),  // <-- FIXED
    lastSeenAt: new Date(),
  },
});
```

**New user create path** (around line 150–160):
```typescript
// BEFORE
const newUser = await prisma.user.create({
  data: {
    id: userId,
    googleSub: profile.googleSub,
    email: profile.email,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,       // <-- BUG: null when Google has no picture
    role,
  },
});

// AFTER
const newUser = await prisma.user.create({
  data: {
    id: userId,
    googleSub: profile.googleSub,
    email: profile.email,
    displayName: profile.displayName,
    avatarUrl: resolveAvatarUrl(profile.avatarUrl, profile.email),  // <-- FIXED
    role,
  },
});
```

### CRITICAL: New Tests to Add in `authService.test.ts`

Add a new `describe` block **within** `describe('processOAuthCallback')`, after the existing tests. The Gravatar URL for `user@example.com` (lowercased, trimmed) is `MD5("user@example.com")` = `b58996c504c5638798eb6b511e6f49af` — so the expected URL is `https://www.gravatar.com/avatar/b58996c504c5638798eb6b511e6f49af?d=identicon&s=128`.

```typescript
describe('processOAuthCallback - gravatar fallback (no Google picture)', () => {
  beforeEach(() => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'tok' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            sub: 'google-456',
            email: 'user@example.com',
            name: 'No Picture User',
            picture: undefined, // Google did not provide a picture
          }),
      });
  });

  it('new user: sets avatarUrl to Gravatar URL when Google provides no picture', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.allowlistEntry.findFirst).mockResolvedValueOnce({
      id: 'al-1',
      type: 'domain',
      value: 'example.com',
      createdAt: new Date(),
    } as never);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: '01JTEST00000000000000000000',
      role: 'ViewerCompany',
    } as never);
    vi.mocked(prisma.session.create).mockResolvedValue({} as never);

    await processOAuthCallback('code', 'state', 'state');

    const createCall = vi.mocked(prisma.user.create).mock.calls[0]![0];
    const avatarUrl = createCall.data.avatarUrl as string;
    expect(avatarUrl).toMatch(/^https:\/\/www\.gravatar\.com\/avatar\//);
    expect(avatarUrl).toContain('?d=identicon&s=128');
  });

  it('returning user: sets avatarUrl to Gravatar URL when Google provides no picture', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'existing-user-id',
      googleSub: 'google-456',
      email: 'user@example.com',
      bannedAt: null,
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: 'existing-user-id',
    } as never);
    vi.mocked(prisma.session.create).mockResolvedValue({} as never);

    await processOAuthCallback('code', 'state', 'state');

    const updateCall = vi.mocked(prisma.user.update).mock.calls[0]![0];
    const avatarUrl = updateCall.data.avatarUrl as string;
    expect(avatarUrl).toMatch(/^https:\/\/www\.gravatar\.com\/avatar\//);
    expect(avatarUrl).toContain('?d=identicon&s=128');
  });
});
```

**Note on existing tests:** The existing `'processOAuthCallback - existing user ban check'` describe block already mocks `picture: null` for a banned user. Since the banned user returns early (before any avatar resolution), that test is unaffected — no changes needed.

### Architecture Compliance

- `node:crypto` `createHash('md5')`: already available in Node.js runtime — no new package needed; `randomBytes` is already imported from `node:crypto` on line 1 of `authService.ts`
- Named exports only: `resolveAvatarUrl` is unexported (internal helper)
- No new Prisma models, no new migrations (DB column is already nullable TEXT)
- No new routes, no router changes, no frontend changes for this story
- Gravatar URL spec from epics.md: MD5 of `email.toLowerCase().trim()`, `?d=identicon&s=128` [Source: `_bmad-output/planning-artifacts/epics.md#Story 2.4`]
- Architecture note: "gravatar fallback if no Google avatar" [Source: `_bmad-output/planning-artifacts/architecture.md` line 393]
- Tests: co-located `*.test.ts`, Vitest, same mock pattern as existing `authService.test.ts`

### Coverage Context

Current thresholds (Story 2.3, 2026-03-07):
```
lines: 83, functions: 75, branches: 86, statements: 83
```

Adding the `resolveAvatarUrl` helper (new branch: has picture vs. no picture) and tests covering both branches will likely improve branch and function coverage. Run coverage after implementation and update thresholds if any metric improves (follow existing precedent — never lower).

```bash
pnpm --filter @manlycam/server exec vitest run --coverage
```

### File Summary

**Modified files:**
```
apps/server/src/services/authService.ts       # add resolveAvatarUrl helper + apply to both write paths
apps/server/src/services/authService.test.ts  # add Gravatar fallback tests (2 new test cases)
apps/server/vitest.config.ts                  # update thresholds if coverage improves
```

**DO NOT touch:**
- `apps/server/src/routes/me.ts` — complete, no changes needed
- `apps/server/src/routes/auth.ts` — complete
- `apps/server/src/middleware/auth.ts` — complete
- `apps/server/src/middleware/requireAuth.ts` — complete
- `apps/server/src/middleware/requireRole.ts` — complete
- `apps/server/src/routes/me.test.ts` — the existing `'returns null for optional fields, never undefined'` test documents the route's passthrough behavior; it remains valid (the route still passes through DB values)
- Any web/frontend files — avatar display in chat (Story 4.3) is a future story

### Project Structure Notes

- `resolveAvatarUrl` lives alongside the other auth helpers in `authService.ts` — not extracted to `lib/` because it is only used within this one service
- The helper uses `node:crypto` (built-in), keeping zero external dependencies for this feature

### References

- Story requirements: [Source: `_bmad-output/planning-artifacts/epics.md#Story 2.4`]
- Architecture Gravatar note: [Source: `_bmad-output/planning-artifacts/architecture.md` line 393]
- Current `authService.ts` (gap): `avatarUrl: profile.avatarUrl` stored without fallback on lines 122 and 158
- Previous story learnings (mock patterns, coverage flow): [Source: `_bmad-output/implementation-artifacts/2-3-session-persistence-and-auth-middleware.md`]
- Existing `authService.test.ts` patterns: [Source: `apps/server/src/services/authService.test.ts`]
- Coverage thresholds (current): [Source: `apps/server/vitest.config.ts`]
- `node:crypto` MD5: `createHash('md5').update(str).digest('hex')` — standard Node.js built-in, no install needed

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- Added `resolveAvatarUrl(googleAvatarUrl, email)` internal helper to `authService.ts` using `node:crypto` `createHash('md5')` — no new dependencies
- Fixed both write paths in `processOAuthCallback`: returning-user `prisma.user.update` and new-user `prisma.user.create` now call `resolveAvatarUrl` instead of passing `profile.avatarUrl` directly
- Added 2 new tests in `processOAuthCallback - gravatar fallback (no Google picture)` describe block; all 43 tests pass with no regressions
- Coverage improved across all metrics: lines 83→84, functions 75→76, branches 86→87, statements 83→84; thresholds updated in `vitest.config.ts`

### File List

- `apps/server/src/services/authService.ts`
- `apps/server/src/services/authService.test.ts`
- `apps/server/vitest.config.ts`
