---
name: system user pattern
description: Reserved system user row for slash command authoring; architecture decisions
type: project
---

Slash commands post as a reserved **System** user by default (`impersonateUser: false`).

- **ULID:** `015YP4KB00MANLY0CAM0SYSTEM` — hardcoded constant exported as `SYSTEM_USER_ID` from `@manlycam/types`
- **DB row:** Seeded via `apps/server/prisma/migrations/20260315000000_seed_system_user/migration.sql` with `googleSub: 'system'`
- **Role:** `Role.System` with `ROLE_RANK: -1` — below all users, immune to mute/ban/moderation
- **Avatar:** `/favicon.svg` resolved at runtime (not stored in DB)
- **Delete:** Admin-only; bypasses normal rank check
- **`impersonateUser: true`:** Posts as the invoking user instead (used by shrug, tableflip)
- **System user is filtered from:** mention autocomplete, users:directory, users:lookup, PresenceList, admin role selector

**Why:** Designed during Story 8-4 smoke testing — commands needed a neutral bot-like identity distinct from any real user.

**How to apply:** Any new feature that needs server-originated messages (notifications, system events) should use `SYSTEM_USER_ID` as the author. Do not allow moderation actions against the system user.
