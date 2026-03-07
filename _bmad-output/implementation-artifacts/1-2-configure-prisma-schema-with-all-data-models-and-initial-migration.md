# Story 1.2: Configure Prisma Schema with All Data Models and Initial Migration

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want the complete Prisma schema defined with all data models and an initial migration applied,
so that the database is ready to support all application features from the start.

## Acceptance Criteria

**AC1 — All tables created by initial migration**
Given `DATABASE_URL` points to a running PostgreSQL instance
When `pnpm prisma migrate dev --name init` is run from `apps/server/`
Then all 5 tables exist: `users`, `sessions`, `allowlist_entries`, `messages`, `audit_log`

**AC2 — users table schema**
Given the schema is applied
When the `users` table is inspected
Then it has exactly: `id CHAR(26)` (PK, no DB default), `google_sub TEXT UNIQUE NOT NULL`, `email TEXT UNIQUE NOT NULL`, `display_name TEXT NOT NULL`, `avatar_url TEXT`, `role TEXT NOT NULL`, `user_tag_text TEXT`, `user_tag_color TEXT`, `muted_at TIMESTAMPTZ`, `banned_at TIMESTAMPTZ`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `last_seen_at TIMESTAMPTZ`

**AC3 — sessions table schema**
Given the schema is applied
When the `sessions` table is inspected
Then it has: `id CHAR(26)` (PK), `user_id CHAR(26)` (FK → users with CASCADE DELETE), `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `expires_at TIMESTAMPTZ NOT NULL`

**AC4 — allowlist_entries table schema**
Given the schema is applied
When the `allowlist_entries` table is inspected
Then it has: `id CHAR(26)` (PK), `type TEXT NOT NULL` (values: `'domain'` or `'email'`), `value TEXT NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`; and a unique constraint on `(type, value)`

**AC5 — messages table schema**
Given the schema is applied
When the `messages` table is inspected
Then it has: `id CHAR(26)` (PK), `user_id CHAR(26)` (FK → users), `content TEXT NOT NULL`, `edit_history JSONB` (null = never edited), `updated_at TIMESTAMPTZ`, `deleted_at TIMESTAMPTZ`, `deleted_by CHAR(26)` (nullable FK → users), `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

**AC6 — audit_log table schema (append-only)**
Given the schema is applied
When the `audit_log` table is inspected
Then it has: `id CHAR(26)` (PK), `action TEXT NOT NULL`, `actor_id CHAR(26)` (FK → users), `target_id TEXT` (nullable), `metadata JSONB`, `performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` — NO `updated_at`, NO `deleted_at` (append-only by design)

**AC7 — Prisma model conventions enforced**
All models use explicit `@@map("snake_case")` for table names and `@map("snake_case")` on all FK and multi-word fields; no `id` field has `@default()`; all DateTime fields use `@db.Timestamptz`

**AC8 — Prisma client regenerated and compiles**
After `prisma migrate dev`, `pnpm --filter @manlycam/server typecheck` passes — Prisma client types reflect all new models

## Tasks / Subtasks

- [x] Task 1: Create `apps/server/prisma/schema.prisma` (AC: #1–#7)
  - [x] Create `apps/server/prisma/` directory
  - [x] Write the exact schema from Dev Notes below (do not improvise field definitions)
  - [x] Verify: every DateTime field has `@db.Timestamptz`, every multi-word/FK column has `@map`, every model has `@@map`
  - [x] Verify: no `@default()` on any `id` field
- [x] Task 2: Run initial migration (AC: #1, #8)
  - [x] Ensure `DATABASE_URL` is configured in `apps/server/.env`
  - [x] Run `pnpm prisma migrate dev --name init` from `apps/server/`
  - [x] Confirm `apps/server/prisma/migrations/` directory created with SQL migration file
  - [x] Confirm all 5 tables present in database
- [x] Task 3: Verify TypeScript compilation (AC: #8)
  - [x] Run `pnpm --filter @manlycam/server typecheck` — must pass without errors

## Dev Notes

### Prisma Setup Context

**Story 1.1 already installed Prisma deps** — no `pnpm add` needed:
- `@prisma/client ^6.0.0` in dependencies
- `prisma ^6.0.0` in devDependencies
- `pnpm.onlyBuiltDependencies` already configured in root `package.json` for Prisma build scripts

**`src/db/client.ts` already exists** (singleton from Story 1.1) — do NOT modify it. After `prisma migrate dev` regenerates the client, it automatically picks up new model types.

**Do NOT run `prisma init`** — it creates a default schema that conflicts. Create `prisma/schema.prisma` directly.

**Migration command (run from `apps/server/`):**
```bash
pnpm prisma migrate dev --name init
```
This runs the migration AND regenerates the Prisma client — do not run `prisma generate` separately.

### Complete Target schema.prisma

Create at `apps/server/prisma/schema.prisma`. Every annotation is deliberate — reproduce exactly:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String    @id @db.Char(26)
  googleSub    String    @unique @map("google_sub")
  email        String    @unique
  displayName  String    @map("display_name")
  avatarUrl    String?   @map("avatar_url")
  role         String    // 'Admin' | 'Moderator' | 'ViewerCompany' | 'ViewerGuest'
  userTagText  String?   @map("user_tag_text")
  userTagColor String?   @map("user_tag_color")
  mutedAt      DateTime? @db.Timestamptz @map("muted_at")
  bannedAt     DateTime? @db.Timestamptz @map("banned_at")
  createdAt    DateTime  @default(now()) @db.Timestamptz @map("created_at")
  lastSeenAt   DateTime? @db.Timestamptz @map("last_seen_at")

  sessions        Session[]
  messages        Message[]
  deletedMessages Message[] @relation("MessageDeleter")
  auditActions    AuditLog[]

  @@map("users")
}

model Session {
  id        String   @id @db.Char(26)
  userId    String   @db.Char(26) @map("user_id")
  createdAt DateTime @default(now()) @db.Timestamptz @map("created_at")
  expiresAt DateTime @db.Timestamptz @map("expires_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

model AllowlistEntry {
  id        String   @id @db.Char(26)
  type      String   // 'domain' | 'email'
  value     String
  createdAt DateTime @default(now()) @db.Timestamptz @map("created_at")

  @@unique([type, value])
  @@map("allowlist_entries")
}

model Message {
  id          String    @id @db.Char(26)
  userId      String    @db.Char(26) @map("user_id")
  content     String
  editHistory Json?     @map("edit_history")
  updatedAt   DateTime? @db.Timestamptz @map("updated_at")
  deletedAt   DateTime? @db.Timestamptz @map("deleted_at")
  deletedBy   String?   @db.Char(26) @map("deleted_by")
  createdAt   DateTime  @default(now()) @db.Timestamptz @map("created_at")

  user    User  @relation(fields: [userId], references: [id])
  deleter User? @relation("MessageDeleter", fields: [deletedBy], references: [id])

  @@map("messages")
}

model AuditLog {
  id          String   @id @db.Char(26)
  action      String
  actorId     String   @db.Char(26) @map("actor_id")
  targetId    String?  @map("target_id")
  metadata    Json?
  performedAt DateTime @default(now()) @db.Timestamptz @map("performed_at")

  actor User @relation(fields: [actorId], references: [id])

  @@map("audit_log")
}
```

### Prisma Convention Rules (Hard Rules)

| Rule | Correct | Wrong |
|---|---|---|
| Table names | `@@map("users")` explicit on every model | Relying on Prisma default casing |
| FK/multi-word columns | `@map("user_id")` explicit | camelCase in DB |
| ID generation | `id: ulid()` in service layer before `create()` | `@default(uuid())` or any `@default()` on `id` |
| All DateTime fields | `@db.Timestamptz` required | `DateTime` without `@db.Timestamptz` |
| FK field type | `String @db.Char(26) @map("col_name")` | Missing `@db.Char(26)` annotation |
| Prisma enum | Use `String` with comment | `enum` keyword (banned project-wide) |

### AllowlistEntry — Type Values

`type` stores exactly:
- `'domain'` → value is domain string e.g. `'company.com'`; matches `@company.com` emails at registration
- `'email'` → value is full email e.g. `'guest@gmail.com'`; matches exact email at registration

`@@unique([type, value])` prevents duplicate entries. No `id` is exposed in CLI — lookup is by `(type, value)`.

### Cascade Delete vs. Ban Transaction

`onDelete: Cascade` on `Session.user` handles **user deletion** edge cases. It does NOT handle banning.

**Ban is always done via explicit transaction** (implemented in Story 2.5+):
```typescript
// Future pattern — reference only, do NOT implement in this story
await prisma.$transaction([
  prisma.user.update({ where: { id: userId }, data: { bannedAt: new Date() } }),
  prisma.session.deleteMany({ where: { userId } }),
])
```

### Service Layer ID Pattern (for all future stories)

All IDs are generated server-side before `create()`. The schema has no `@default()` on `id` — omitting it at create is a runtime error:
```typescript
// CORRECT
const id = ulid()  // import { ulid } from '../lib/ulid'
await prisma.user.create({ data: { id, googleSub, email, displayName, role, ... } })

// WRONG — runtime error: id is required
await prisma.user.create({ data: { googleSub, email, displayName, role, ... } })
```

### Files NOT Modified in This Story

| File | Status | Reason |
|---|---|---|
| `src/db/client.ts` | Unchanged | Singleton from Story 1.1 — recompile only |
| `src/lib/ulid.ts` | Unchanged | ULID singleton from Story 1.1 |
| All other `src/` files | Unchanged | Schema-only story |

### Project Structure After This Story

```
apps/server/
├── prisma/
│   ├── schema.prisma          # CREATED — full schema (5 models)
│   └── migrations/
│       └── <timestamp>_init/  # GENERATED by prisma migrate dev
│           └── migration.sql
└── src/
    └── db/
        └── client.ts          # UNCHANGED — singleton from Story 1.1
```

Commit both `prisma/schema.prisma` and the generated `prisma/migrations/` directory.

### Anti-Patterns — Hard Bans

| Anti-pattern | Why |
|---|---|
| `@default(cuid())` or `@default(uuid())` on `id` | IDs are ULID, always set in service layer |
| `DateTime` without `@db.Timestamptz` | Postgres must use `TIMESTAMPTZ` — never timezone-naive |
| Missing `@@map` on any model | All table names must be explicit snake_case |
| Missing `@map` on FK/multi-word fields | All column names must be explicit snake_case in DB |
| Running `prisma init` | Creates conflicting default schema — create file directly |
| `new PrismaClient()` anywhere except `src/db/client.ts` | Connection pool exhaustion |
| `enum` keyword in schema | Project-wide ban — use `String` with comment |

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2] — exact column definitions for all 5 tables (ACs)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.5] — AllowlistEntry `type` values ('domain'/'email')
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture] — ULID strategy, session management, ban transaction pattern, chat message JSONB schema
- [Source: _bmad-output/planning-artifacts/architecture.md#Naming Patterns (Database)] — `@@map`/`@map` convention, camelCase Prisma → snake_case DB
- [Source: _bmad-output/planning-artifacts/architecture.md#Prisma patterns] — singleton client, service-layer ID generation, `$transaction()` for atomics
- [Source: _bmad-output/implementation-artifacts/1-1-initialize-monorepo-with-application-scaffolds-and-shared-types.md#Dev Notes] — Prisma deps already installed, `pnpm.onlyBuiltDependencies` configured, `src/db/client.ts` singleton location

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — clean implementation with no significant debugging required.

### Completion Notes List

- Created `apps/server/prisma/schema.prisma` exactly per spec: 5 models (User, Session, AllowlistEntry, Message, AuditLog), all with `@@map`, all DateTime fields with `@db.Timestamptz`, no `@default()` on any `id` field.
- Created `apps/server/.env` with `DATABASE_URL` pointing to local Docker PostgreSQL instance.
- Ran `pnpm prisma migrate dev --name init` from `apps/server/` — migration `20260307033431_init` created and applied; Prisma client regenerated.
- All 5 tables confirmed in migration SQL: `users`, `sessions`, `allowlist_entries`, `messages`, `audit_log`.
- `pnpm --filter @manlycam/server typecheck` passes with zero errors.

### File List

- `apps/server/prisma/schema.prisma` (created)
- `apps/server/prisma/migrations/20260307033431_init/migration.sql` (generated)
- `apps/server/prisma/migrations/20260307034129_add_fk_indexes/migration.sql` (generated)
- `apps/server/prisma/migrations/migration_lock.toml` (generated)
- `apps/server/.env` (created — not committed, gitignored)

## Code Review (AI)

**Reviewer:** Claude Haiku 4.5
**Date:** 2026-03-06

### Review Summary

✅ **All Acceptance Criteria: PASS**

All 8 ACs verified and implemented correctly:
- AC1-AC6: All 5 tables created with correct schemas (users, sessions, allowlist_entries, messages, audit_log)
- AC7: Prisma conventions fully compliant (@@map on all models, @map on multi-word fields, @db.Timestamptz on all DateTime, no @default() on id fields)
- AC8: TypeScript typecheck passes with zero errors

### Issues Found & Fixed

**CRITICAL (Fixed):** Files were created but not committed to git. **Resolution:** Added all files to git and committed with descriptive message.

**MEDIUM (Fixed):** Missing indexes on foreign key columns would cause table scans on relational queries. **Resolution:** Added `@@index` annotations to:
- `sessions.user_id`
- `messages.user_id`
- `messages.deleted_by`
- `audit_log.actor_id`

Generated new migration `20260307034129_add_fk_indexes` and applied to database.

### Outcome

✅ **APPROVED** — All critical and medium issues resolved. Implementation complete and committed.
