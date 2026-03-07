# Story 2.5: CLI Allowlist and Ban Management

Status: review

## Story

As the admin,
I want to manage the domain allowlist, individual email allowlist, and user bans from the CLI,
so that I can control access to the platform without needing to use a web UI.

## Acceptance Criteria

1. **Given** the admin CLI is installed **When** `manlycam-admin allowlist add-domain company.com` is run **Then** `company.com` is added to `allowlist_entries` with `type = 'domain'`, and future users with `@company.com` emails are admitted on first login

2. **Given** `manlycam-admin allowlist remove-domain company.com` is run **When** it executes **Then** the domain entry is removed from `allowlist_entries` — existing registered users are not affected (allowlist gates registration only)

3. **Given** `manlycam-admin allowlist add-email guest@gmail.com` is run **When** it executes **Then** an individual email entry is added to `allowlist_entries` with `type = 'email'`

4. **Given** `manlycam-admin allowlist remove-email guest@gmail.com` is run **When** it executes **Then** the individual email entry is removed from `allowlist_entries` — the user's existing account is not deleted

5. **Given** `manlycam-admin users ban user@company.com` is run **When** it executes **Then** in a single `prisma.$transaction()`: `users.banned_at` is set to `NOW()`, AND all `sessions` rows for that user are deleted — the operation is atomic

6. **Given** a banned user has an active WebSocket connection **When** their sessions are deleted **Then** the WS hub detects the missing session on the next heartbeat and sends `{ type: 'session:revoked', payload: { reason: 'banned' } }` — **NOTE: the hub is not yet built; this detection happens in Story 3.4. This story only performs the DB-level atomicity. The auth middleware already re-checks `banned_at` on every REST request, so the user is blocked immediately from all subsequent REST calls.**

7. **Given** `manlycam-admin users unban user@company.com` is run **When** it executes **Then** `users.banned_at` is set to `NULL` — the user can log in again on their next OAuth attempt

8. **Given** any CLI command is run **When** it completes **Then** human-readable output is printed confirming the action (e.g. `✓ Domain company.com added to allowlist`), and the process exits with code 0 on success, code 1 on error

## Tasks / Subtasks

- [x] Task 1: Create `allowlistService.ts` with CRUD functions (AC: 1, 2, 3, 4)
  - [x] `addDomain(domain: string): Promise<void>` — upsert AllowlistEntry type='domain' (handle unique constraint gracefully)
  - [x] `removeDomain(domain: string): Promise<void>` — delete AllowlistEntry type='domain'; throw if not found
  - [x] `addEmail(email: string): Promise<void>` — upsert AllowlistEntry type='email' (handle unique constraint gracefully)
  - [x] `removeEmail(email: string): Promise<void>` — delete AllowlistEntry type='email'; throw if not found

- [x] Task 2: Create `allowlistService.test.ts` with full coverage (AC: 1, 2, 3, 4)
  - [x] `addDomain`: inserts with type='domain' and ULID id; handles duplicate gracefully (no error)
  - [x] `removeDomain`: calls `deleteMany` for type='domain' + value; throws if zero rows deleted
  - [x] `addEmail`: inserts with type='email' and ULID id; handles duplicate gracefully
  - [x] `removeEmail`: calls `deleteMany` for type='email' + value; throws if zero rows deleted

- [x] Task 3: Create `userService.ts` with ban/unban functions (AC: 5, 7)
  - [x] `banUser(email: string): Promise<{ sessionCount: number }>` — look up user by email; throw if not found; `prisma.$transaction([update bannedAt, deleteMany sessions])`; return count of deleted sessions
  - [x] `unbanUser(email: string): Promise<void>` — look up user by email; throw if not found; update `bannedAt: null`

- [x] Task 4: Create `userService.test.ts` with full coverage (AC: 5, 7)
  - [x] `banUser`: user not found → throws; user found → transaction sets bannedAt + deletes sessions; returns correct sessionCount
  - [x] `unbanUser`: user not found → throws; user found → sets bannedAt to null

- [x] Task 5: Create CLI command files (AC: 1–8)
  - [x] `cli/commands/allowlist.ts` — exports `runAllowlistCommand(action, arg)` function calling allowlistService; prints `✓`/`✗` output
  - [x] `cli/commands/users.ts` — exports `runUsersCommand(action, arg)` function calling userService; prints `✓`/`✗` output

- [x] Task 6: Create CLI entry point `cli/index.ts` (AC: 8)
  - [x] Import `dotenv/config` as first import (loads DATABASE_URL before Prisma client initialization)
  - [x] DO NOT import `../env.js` — the server env schema requires all server vars; the CLI only needs DATABASE_URL
  - [x] Parse `process.argv` for: `[node, script, subcommand, action, arg]`
  - [x] Route to `allowlist` or `users` command modules; print usage and exit 1 on unknown commands
  - [x] Catch all errors, print `✗ Error: <message>` to stderr, exit 1

- [x] Task 7: Add `src/cli/**` to vitest coverage excludes and update thresholds if improved (AC: all)
  - [x] In `vitest.config.ts`, add `'src/cli/**'` to the `coverage.exclude` array
  - [x] Run `pnpm --filter @manlycam/server exec vitest run --coverage`
  - [x] Update thresholds if any metric improves; never lower them

## Dev Notes

### CRITICAL: env.ts Must NOT Be Imported by CLI

The server's `env.ts` validates ALL server environment variables (PORT, BASE_URL, SESSION_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, HLS_SEGMENT_PATH, etc.) and calls `process.exit(1)` if any are missing. The CLI only needs `DATABASE_URL`.

The Prisma client reads `DATABASE_URL` directly from `process.env` via Prisma's own env mechanism (configured in `schema.prisma` as `url = env("DATABASE_URL")`). The `db/client.ts` singleton (`new PrismaClient()`) has NO dependency on `env.ts`.

**CLI entry point MUST be:**
```typescript
// cli/index.ts — first line of ACTUAL imports
import 'dotenv/config';  // Loads .env file before anything else reads process.env
// Then import command modules (which import services, which import db/client.ts)
import { runAllowlistCommand } from './commands/allowlist.js';
import { runUsersCommand } from './commands/users.js';
// NO import from '../env.js'
```

### CRITICAL: Ban Is an Atomic Transaction

The ban operation MUST use a single `prisma.$transaction()`. The architecture is explicit:
> "Ban must atomically set `banned_at` + delete sessions in a single Prisma transaction"

```typescript
// userService.ts
export async function banUser(email: string): Promise<{ sessionCount: number }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`User not found: ${email}`);

  const [, deletedSessions] = await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { bannedAt: new Date() },
    }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);

  return { sessionCount: deletedSessions.count };
}

export async function unbanUser(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`User not found: ${email}`);
  await prisma.user.update({
    where: { id: user.id },
    data: { bannedAt: null },
  });
}
```

### CRITICAL: WS Session Revocation Scope Boundary

AC #6 mentions the WS hub detecting missing sessions and sending `{ type: 'session:revoked', payload: { reason: 'banned' } }`. **This is NOT in scope for Story 2.5.** The WS hub is built in Story 3.4.

What Story 2.5 DOES accomplish:
- Sessions are deleted atomically with the ban → banned user's WS connection becomes sessionless
- Auth middleware already checks `banned_at` on every REST request → blocked immediately on next call
- Story 3.4 WS hub will handle the real-time `session:revoked` signal detection via heartbeat

Add a TODO in the relevant code: `// TODO(story-3.4): WS hub will detect missing session on heartbeat and emit session:revoked`

### CRITICAL: AllowlistEntry Upsert vs. Insert

The `allowlist_entries` table has `@@unique([type, value])`. Attempting to insert a duplicate will throw a Prisma unique constraint violation. For `add-domain` and `add-email`:
- Use `prisma.allowlistEntry.upsert()` (idempotent — silently succeeds if already exists), OR
- Use `prisma.allowlistEntry.create()` and catch Prisma error code `P2002` to print a friendly message

Recommended: `upsert` with `where: { type_value: { type, value } }`, `create: { id: ulid(), type, value }`, `update: {}` — this is idempotent and requires no error handling.

For `remove-domain` and `remove-email`:
- Use `prisma.allowlistEntry.deleteMany({ where: { type, value } })`
- Check `count` — if 0, the entry didn't exist → print `✗ Domain/Email not found` and throw

### AllowlistService Pattern

```typescript
// apps/server/src/services/allowlistService.ts
import { prisma } from '../db/client.js';
import { ulid } from '../lib/ulid.js';

export async function addDomain(domain: string): Promise<void> {
  await prisma.allowlistEntry.upsert({
    where: { type_value: { type: 'domain', value: domain } },
    create: { id: ulid(), type: 'domain', value: domain },
    update: {},
  });
}

export async function removeDomain(domain: string): Promise<void> {
  const result = await prisma.allowlistEntry.deleteMany({
    where: { type: 'domain', value: domain },
  });
  if (result.count === 0) throw new Error(`Domain not found: ${domain}`);
}

export async function addEmail(email: string): Promise<void> {
  await prisma.allowlistEntry.upsert({
    where: { type_value: { type: 'email', value: email } },
    create: { id: ulid(), type: 'email', value: email },
    update: {},
  });
}

export async function removeEmail(email: string): Promise<void> {
  const result = await prisma.allowlistEntry.deleteMany({
    where: { type: 'email', value: email },
  });
  if (result.count === 0) throw new Error(`Email not found: ${email}`);
}
```

### CLI Command Routing Pattern

```typescript
// cli/index.ts — simplified routing (no CLI framework needed)
import 'dotenv/config';
import { runAllowlistCommand } from './commands/allowlist.js';
import { runUsersCommand } from './commands/users.js';

const [,, subcommand, action, arg] = process.argv;

async function main() {
  if (!subcommand || !action || !arg) {
    console.error('Usage: manlycam-admin <allowlist|users> <action> <value>');
    process.exit(1);
  }

  if (subcommand === 'allowlist') {
    await runAllowlistCommand(action, arg);
  } else if (subcommand === 'users') {
    await runUsersCommand(action, arg);
  } else {
    console.error(`Unknown subcommand: ${subcommand}`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`✗ Error: ${message}`);
  process.exit(1);
});
```

### CLI Command Output Pattern

```typescript
// cli/commands/allowlist.ts
import { addDomain, removeDomain, addEmail, removeEmail } from '../services/allowlistService.js';

export async function runAllowlistCommand(action: string, arg: string): Promise<void> {
  switch (action) {
    case 'add-domain':
      await addDomain(arg);
      console.log(`✓ Domain ${arg} added to allowlist`);
      break;
    case 'remove-domain':
      await removeDomain(arg);
      console.log(`✓ Domain ${arg} removed from allowlist`);
      break;
    case 'add-email':
      await addEmail(arg);
      console.log(`✓ Email ${arg} added to allowlist`);
      break;
    case 'remove-email':
      await removeEmail(arg);
      console.log(`✓ Email ${arg} removed from allowlist`);
      break;
    default:
      throw new Error(`Unknown allowlist action: ${action}. Valid: add-domain, remove-domain, add-email, remove-email`);
  }
}
```

```typescript
// cli/commands/users.ts
import { banUser, unbanUser } from '../services/userService.js';

export async function runUsersCommand(action: string, arg: string): Promise<void> {
  switch (action) {
    case 'ban': {
      const { sessionCount } = await banUser(arg);
      console.log(`✓ User ${arg} has been banned (${sessionCount} active session(s) revoked)`);
      // TODO(story-3.4): WS hub will detect missing sessions on heartbeat and emit session:revoked
      break;
    }
    case 'unban':
      await unbanUser(arg);
      console.log(`✓ User ${arg} has been unbanned`);
      break;
    default:
      throw new Error(`Unknown users action: ${action}. Valid: ban, unban`);
  }
}
```

### Test Patterns — Mock Setup

All service tests mock prisma via `vi.mock('../db/client.js', ...)`. Follow the exact same pattern as `authService.test.ts`:

```typescript
// allowlistService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../db/client.js';

vi.mock('../db/client.js', () => ({
  prisma: {
    allowlistEntry: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => '01TESTULID00000000000000001') }));

beforeEach(() => { vi.clearAllMocks(); });
```

For `userService.test.ts`, mock both `prisma.user.findUnique`, `prisma.user.update`, `prisma.session.deleteMany`, and `prisma.$transaction`:

```typescript
vi.mock('../db/client.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    session: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
```

**Note on `$transaction` mocking:** The interactive transaction API passes an array to `$transaction`. Mock it to return the results array:

```typescript
vi.mocked(prisma.$transaction).mockResolvedValue([
  { id: 'user-id', bannedAt: new Date() } as never,
  { count: 2 } as never,
]);
```

Then verify `prisma.$transaction` was called with the correct array of operations.

### ULID Usage in allowlistService

- New `AllowlistEntry` IDs: `ulid()` imported from `'../lib/ulid.js'` (the monotonicFactory singleton)
- `userService.ts` does NOT need ULID — no new records are created, only updates/deletes

### Coverage — vitest.config.ts Exclusion

The CLI command files (`src/cli/index.ts`, `src/cli/commands/*.ts`) contain process.exit calls, console.log side effects, and process.argv parsing — these patterns are impractical to unit test. The business logic is entirely in the service layer. Add CLI files to the coverage exclude list:

```typescript
// vitest.config.ts — update exclude array:
exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/cli/**'],
```

After this change + adding service tests, coverage may improve. Run:
```bash
pnpm --filter @manlycam/server exec vitest run --coverage
```
Update thresholds if any metric improves; never lower them.

### Prisma AllowlistEntry Unique Constraint Name

The Prisma schema defines `@@unique([type, value])` on `AllowlistEntry`. Prisma auto-generates the compound unique name as `type_value`. This is used in the upsert `where` clause:
```typescript
where: { type_value: { type: 'domain', value: domain } }
```
[Source: `apps/server/prisma/schema.prisma` line 50: `@@unique([type, value])`]

### Architecture Compliance

- Named exports only — no `export default` in service or command files
- Prisma singleton: `import { prisma } from '../db/client.js'` — never `new PrismaClient()`
- ULID: `import { ulid } from '../lib/ulid.js'` — never import `monotonicFactory` or `ulidx` directly
- No new Prisma models, no new migrations needed — all tables exist (`users`, `sessions`, `allowlist_entries`)
- No routes, no frontend changes — purely CLI + service layer
- ESM imports: all relative imports use `.js` extension (TypeScript compiles to ESM)
- `prisma.$transaction()` for the atomic ban operation — non-negotiable

### File Summary

**Create (new files):**
```
apps/server/src/services/allowlistService.ts
apps/server/src/services/allowlistService.test.ts
apps/server/src/services/userService.ts
apps/server/src/services/userService.test.ts
apps/server/src/cli/index.ts
apps/server/src/cli/commands/allowlist.ts
apps/server/src/cli/commands/users.ts
```

**Modify (existing files):**
```
apps/server/vitest.config.ts    # add 'src/cli/**' to exclude; update thresholds if improved
```

**Remove (existing files):**
```
apps/server/src/cli/commands/.gitkeep   # remove now that real files exist
```

**DO NOT touch:**
- `apps/server/src/services/authService.ts` — complete, no changes needed
- `apps/server/src/services/authService.test.ts` — complete
- `apps/server/src/env.ts` — CLI must NOT import this
- `apps/server/src/db/client.ts` — complete, no changes
- `apps/server/src/lib/ulid.ts` — complete, no changes
- `apps/server/package.json` — bin entry already set: `"manlycam-admin": "./src/cli/index.ts"`
- Any web/frontend files — future stories

### Project Structure Notes

- `allowlistService.ts` and `userService.ts` live in `apps/server/src/services/` — the standard service layer location per architecture
- `cli/index.ts` is the registered bin entry; `cli/commands/` holds the thin command routing modules
- The `.gitkeep` in `cli/commands/` should be deleted once real files are added
- No new npm packages are required — `dotenv` is already in dependencies, `prisma` client is already installed

### References

- Story requirements: [Source: `_bmad-output/planning-artifacts/epics.md#Story 2.5`, lines 687–723]
- Atomic ban architecture: [Source: `_bmad-output/planning-artifacts/architecture.md` line 615: "Ban must atomically set `banned_at` + delete sessions in a single Prisma transaction"]
- CLI location: [Source: `_bmad-output/planning-artifacts/architecture.md` line 152: "Admin CLI: `apps/server/src/cli/` — same Prisma client, no separate deployment"]
- CLI bin entry: [Source: `apps/server/package.json` line 14: `"manlycam-admin": "./src/cli/index.ts"`]
- Session revocation WS: [Source: `_bmad-output/planning-artifacts/architecture.md` line 338–341] — heartbeat detection is Story 3.4
- Prisma AllowlistEntry schema: [Source: `apps/server/prisma/schema.prisma` lines 44–52]
- AllowlistEntry unique constraint: `@@unique([type, value])` → compound key name `type_value`
- ULID singleton: [Source: `apps/server/src/lib/ulid.ts`]
- Prisma client singleton: [Source: `apps/server/src/db/client.ts`]
- Test mock patterns: [Source: `apps/server/src/services/authService.test.ts`]
- Coverage thresholds (current, Story 2.4): lines: 84, functions: 76, branches: 87, statements: 84 [Source: `apps/server/vitest.config.ts`]
- WsMessage `session:revoked` type: [Source: `packages/types/src/ws.ts` line 69]
- Allowlist policy (registration-gate only): [Source: `_bmad-output/planning-artifacts/architecture.md` line 345: "Allowlist gates first login (new user registration) only — existing users row bypasses allowlist entirely"]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_No blockers encountered._

### Completion Notes List

- Implemented `allowlistService.ts` with `addDomain`, `removeDomain`, `addEmail`, `removeEmail` using Prisma upsert (idempotent) and deleteMany (throws on missing entry)
- Implemented `userService.ts` with atomic `banUser` (`prisma.$transaction` — sets `bannedAt` + deletes all sessions) and `unbanUser` (sets `bannedAt: null`)
- Added TODO(story-3.4) comment in `userService.ts` and `cli/commands/users.ts` for future WS hub session:revoked detection
- CLI entry point (`cli/index.ts`) uses `import 'dotenv/config'` as first import — does NOT import `env.ts`
- Deleted `src/cli/commands/.gitkeep` now that real command files exist
- Updated `vitest.config.ts`: added `src/cli/**` to coverage excludes; updated all thresholds (lines: 86, functions: 82, branches: 89, statements: 86 — all improved from Story 2.4 baseline)
- 56 tests total, 8 test files, all pass; no regressions

### File List

apps/server/src/services/allowlistService.ts (new)
apps/server/src/services/allowlistService.test.ts (new)
apps/server/src/services/userService.ts (new)
apps/server/src/services/userService.test.ts (new)
apps/server/src/cli/index.ts (new)
apps/server/src/cli/commands/allowlist.ts (new)
apps/server/src/cli/commands/users.ts (new)
apps/server/src/cli/commands/.gitkeep (deleted)
apps/server/vitest.config.ts (modified)

## Change Log

- 2026-03-07: Story 2.5 implemented — CLI allowlist & ban management service layer and entry point; 13 new tests; coverage thresholds raised (Date: 2026-03-07)
