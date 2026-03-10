# Story 5.5: Four-Tier Role Hierarchy, CLI Admin Grant, Web UI Moderator Management

Status: ready-for-review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an **admin**,
I want to promote or demote users to/from Moderator via a web UI and manage all roles via CLI,
So that I can delegate moderation without sharing server access.

## Acceptance Criteria

1. **Role Hierarchy Enforcement (Server)** (AC: #1)
   - **Given** the system enforces the role hierarchy `Admin > Moderator > ViewerCompany > ViewerGuest`
   - **When** any role-gated action is evaluated server-side
   - **Then** the check compares the caller's role ordinal against the required minimum — a role comparison helper `hasRole(user, minRole)` is imported from `packages/types` and used in all server middleware and route handlers.

2. **CLI Admin Grant** (AC: #2)
   - **Given** no Admin user exists yet (or an additional one is needed)
   - **When** the server operator runs the CLI command `npm run cli -- users grant-admin --email=<email>`
   - **Then** the target user's role is set to `Admin` in the database — this is the only way to create an Admin; the web UI provides no path to grant Admin.

3. **Web UI User Management Roster** (AC: #3)
   - **Given** an admin clicks the avatar button → Users
   - **When** the user management modal renders
   - **Then** every registered user is listed with their display name, email, and current role badge.

4. **Web UI Role Management Dropdown** (AC: #4)
   - **Given** an admin clicks "Change Role" on a user row
   - **When** the dropdown opens
   - **Then** they can select between `Moderator`, `ViewerCompany`, and `ViewerGuest`.
   - **When** a selection is made, `POST /api/admin/users/:userId/role` is called and a `{ type: 'user:update', payload: UserProfile }` WS message is broadcast.

5. **CLI Role Management** (AC: #5)
   - **And** the CLI (`npm run cli -- users set-role --email=<email> --role=<role>`) supports all four role values.

6. **Admin Self-Protection** (AC: #6)
   - **And** an Admin cannot change their own role via the web UI — the "Change Role" control is disabled for the currently authenticated admin's own row.

7. **UX/UI Alignment & Polish** (AC: #7)
   - **And** the UI follows the ShadCN-based design system with warm dark palette.
   - **And** role badges use clear, distinct colors (Admin: red/purple, Moderator: blue, ViewerCompany: green/brown, ViewerGuest: muted grey).

## Tasks / Subtasks

- [x] Task 1: Type System & Helpers (AC: #1)
  - [x] 1.1: Add `hasRole` helper to `packages/types/src/roles.ts`.
  - [x] 1.2: Ensure `Role` and `ROLE_RANK` are correctly exported.
- [x] Task 2: Server - Admin CLI Enhancements (AC: #2, #5)
  - [x] 2.1: Implement `grant-admin` and `set-role` in `apps/server/src/cli/commands/users.ts`.
  - [x] 2.2: Update `apps/server/src/cli/index.ts` to expose these commands.
- [x] Task 3: Server - Admin User API (AC: #3, #4)
  - [x] 3.1: Create `apps/server/src/routes/admin.ts` with endpoints:
    - `GET /api/admin/users` (list all users)
    - `POST /api/admin/users/:userId/role` (update role)
  - [x] 3.2: Implement `updateUserRole` in `userService.ts` with `user:update` WS broadcast.
  - [x] 3.3: Refactor `requireRole` middleware to use `hasRole` helper.
- [x] Task 4: Web - Admin User Management UI (AC: #3, #4, #6, #7)
  - [x] 4.1: Create `apps/web/src/components/admin/UserList.vue` using ShadCN `DropdownMenu`, `Badge`, and `Button`.
  - [x] 4.2: Create `apps/web/src/components/admin/UserManagerDialog.vue` (full-page modal).
  - [x] 4.3: Integrate "Users" entry point into `ProfileAnchor.vue`.
  - [x] 4.4: Disable role editing for the current user's own row.
- [x] Task 5: Testing & Validation
  - [x] 5.1: Add server integration tests for admin endpoints.
  - [x] 5.2: Add unit tests for `hasRole` and CLI commands.
  - [x] 5.3: Add web component tests for `UserList.vue`.

## Dev Notes

### Architecture Patterns
- **ID Strategy**: All IDs are ULIDs (`CHAR(26)`), server-generated.
- **Role Hierarchy**: Enforced via `ROLE_RANK` comparison.
- **CLI vs Web**: Admin role is CLI-only. Other roles can be managed via Web UI by an Admin.
- **WebSocket**: `user:update` message is critical for real-time consistency.

### Testing Standards
- **Server**: Vitest integration tests in `apps/server/src/routes/admin.test.ts`.
- **Web**: Vitest component tests in `apps/web/src/components/admin/UserList.test.ts`.
- **Coverage**: Branch coverage maintained above 91%.

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.5]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md]
- [Source: _bmad-output/planning-artifacts/architecture.md]
- [Source: _bmad-output/implementation-artifacts/5-4-non-privileged-ui-gating.md]
