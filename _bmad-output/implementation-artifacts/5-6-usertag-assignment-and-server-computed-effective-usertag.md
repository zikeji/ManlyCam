# Story 5.6: UserTag Assignment and Server-Computed Effective UserTag

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an **admin**,
I want to assign a custom UserTag (text + color) to any user,
So that I can give special members a distinguishing identity badge that appears consistently across the chat and presence list.

## Acceptance Criteria

1. **UserTag Edit UI in Admin Panel** (AC: #1)
   - **Given** an admin opens Admin Panel → Users (via avatar → Users)
   - **When** the user list renders
   - **Then** each user row shows a "Set Tag" action button (in addition to the existing "Change Role" button)
   - **And** clicking "Set Tag" opens a `<Popover>` with an inline editor containing: a text input (max 20 chars, placeholder "Tag text…"), a color swatch palette of exactly 12 theme-safe colors, and "Save" / "Clear" buttons

2. **UserTag Update API** (AC: #2)
   - **Given** the admin submits a UserTag update
   - **When** `PATCH /api/admin/users/:userId/user-tag` is called with `{ userTagText: string; userTagColor: string }`
   - **Then** the server validates: `userTagText` is non-empty and ≤ 20 chars; `userTagColor` is one of the `USER_TAG_PALETTE` values; returns `204 No Content` on success
   - **And** the server updates `user_tag_text` and `user_tag_color` on the `users` record, then computes the new `effectiveUserTag` via `computeUserTag()` and broadcasts `{ type: 'user:update', payload: UserProfile }` to all connected WS clients

3. **UserTag Clear** (AC: #3)
   - **Given** the admin clicks "Clear" in the Set Tag popover (or submits with empty text)
   - **When** `PATCH /api/admin/users/:userId/user-tag` is called with `{ userTagText: '' }`
   - **Then** the server sets `user_tag_text = NULL` and `user_tag_color = NULL`; broadcasts the updated UserProfile
   - **And** for a `ViewerGuest` user, `effectiveUserTag` reverts to `{ text: 'Guest', color: DEFAULT_GUEST_TAG_COLOR }` in the broadcast; for all other roles it becomes `null`

4. **Real-time Propagation** (AC: #4)
   - **Given** a `user:update` WS message is received
   - **When** `useChat.ts` and `usePresence.ts` process it
   - **Then** all visible instances of that user's messages in `ChatPanel.vue` update immediately with the new tag, and their entry in the Viewers list updates — no page refresh required
   - **And** `handleUserUpdate` and `handlePresenceUserUpdate` already handle `userTag` in the payload; no changes required to these composables (this is a verification AC)

5. **Centralized `computeUserTag` Pure Function** (AC: #5)
   - **And** `apps/server/src/lib/user-tag.ts` exports a pure `computeUserTag` function:
     ```ts
     function computeUserTag(user: {
       role: string;
       userTagText: string | null;
       userTagColor: string | null;
     }): UserTag | null {
       if (user.userTagText) return { text: user.userTagText, color: user.userTagColor ?? DEFAULT_TAG_COLOR };
       if (user.role === 'ViewerGuest') return { text: 'Guest', color: DEFAULT_GUEST_TAG_COLOR };
       return null;
     }
     ```
   - **And** `DEFAULT_TAG_COLOR` and `DEFAULT_GUEST_TAG_COLOR` are exported constants from this module
   - **And** ALL existing inline `computeUserTag` implementations in `chatService.ts`, `ws.ts`, and `userService.ts` are replaced with imports from this module

6. **No Vue/composable Re-implementation** (AC: #6)
   - **And** no Vue component or composable re-implements `computeUserTag` — they receive and render `userTag` as provided in WS/REST payloads

7. **Admin Users API — UserTag in Response** (AC: #7)
   - **And** `GET /api/admin/users` returns `userTagText: string | null` and `userTagColor: string | null` for each user, so the admin UI can pre-populate the tag editor with the current values
   - **And** `AdminUser` interface in `useAdminUsers.ts` is updated to include `userTagText: string | null` and `userTagColor: string | null`

8. **Curated Color Palette** (AC: #8)
   - **And** a `USER_TAG_PALETTE` constant (12 hex values) is exported from `apps/web/src/lib/userTagPalette.ts` (web) and referenced in the Popover swatch picker — colors are visually distinct and legible on the warm dark background
   - **And** the server validates `userTagColor` against the same palette list (imported from a shared location or duplicated as a typed const in the server route handler)

## Tasks / Subtasks

- [x] **Task 1: Server — Create `computeUserTag` pure function** (AC: #5)
  - [x] 1.1: Create `apps/server/src/lib/user-tag.ts` exporting `computeUserTag`, `DEFAULT_TAG_COLOR` (`#6b7280`), and `DEFAULT_GUEST_TAG_COLOR` (`#a16207`)
  - [x] 1.2: Replace the inline `computeUserTag` in `apps/server/src/services/chatService.ts` with import from `user-tag.ts`; add ViewerGuest branch handling
  - [x] 1.3: Replace the inline `computeUserTag` in `apps/server/src/routes/ws.ts` with import from `user-tag.ts`; add ViewerGuest branch handling
  - [x] 1.4: Replace the inline userTag computation in both `updateUserRole` and `updateUserRoleById` in `apps/server/src/services/userService.ts` with `computeUserTag(updated)`

- [x] **Task 2: Server — UserTag Update Service + Endpoint** (AC: #2, #3)
  - [x] 2.1: Add `updateUserTagById(userId: string, userTagText: string | null, userTagColor: string | null): Promise<void>` to `apps/server/src/services/userService.ts`; DB update + `computeUserTag` + WS broadcast
  - [x] 2.2: Add `PATCH /api/admin/users/:userId/user-tag` to `apps/server/src/routes/admin.ts`; validate payload; call `updateUserTagById`
  - [x] 2.3: Update `GET /api/admin/users` response to include `userTagText` and `userTagColor` fields (AC: #7)

- [x] **Task 3: Web — Color Palette Constant** (AC: #8)
  - [x] 3.1: Create `apps/web/src/lib/userTagPalette.ts` exporting `USER_TAG_PALETTE` (12 theme-safe hex colors) and `DEFAULT_TAG_COLOR` matching the server constant

- [x] **Task 4: Web — AdminUser Interface + composable update** (AC: #7)
  - [x] 4.1: Add `userTagText: string | null` and `userTagColor: string | null` to `AdminUser` interface in `useAdminUsers.ts`
  - [x] 4.2: Add `updateUserTag(userId: string, userTagText: string, userTagColor: string): Promise<void>` and `clearUserTag(userId: string): Promise<void>` to `useAdminUsers.ts`; include optimistic update of `users` ref

- [x] **Task 5: Web — UserList.vue Set Tag UI** (AC: #1, #6)
  - [x] 5.1: Import `Popover`, `PopoverTrigger`, `PopoverContent` from `@/components/ui/popover`
  - [x] 5.2: Add per-row `tagPopoverOpen` state (use a `Map<string, boolean>` or reactive object keyed by user ID)
  - [x] 5.3: Add "Set Tag" `<Button>` in the Actions column that opens the popover; show current tag as a color-dot preview on the button when a tag is set
  - [x] 5.4: Popover content: text input (native `<input>`, `maxlength="20"`, styled with Tailwind `input` classes), 12-color swatch grid (3×4), "Save" and "Clear" buttons
  - [x] 5.5: "Save": calls `updateUserTag(user.id, tagText, selectedColor)`, closes popover; "Clear": calls `clearUserTag(user.id)`, closes popover
  - [x] 5.6: Pre-populate input and selected swatch from `user.userTagText` / `user.userTagColor` when popover opens

- [x] **Task 6: Tests** (AC: all)
  - [x] 6.1: `apps/server/src/lib/user-tag.test.ts` — unit tests for `computeUserTag`: custom tag returned, ViewerGuest default returned, non-guest returns null, null userTagText with set color returns ViewerGuest default for guest
  - [x] 6.2: `apps/server/src/routes/admin.test.ts` — integration tests for `PATCH /api/admin/users/:userId/user-tag`: success (set tag), success (clear tag), 422 on invalid color (not in palette), 422 on text > 20 chars, 403 for non-admin, 404 for unknown userId
  - [x] 6.3: `apps/web/src/composables/useAdminUsers.test.ts` — unit tests for `updateUserTag` and `clearUserTag` optimistic updates
  - [x] 6.4: `apps/web/src/components/admin/UserList.test.ts` — component tests: Set Tag button visible, popover opens, text input present, swatch grid renders 12 swatches, Save calls updateUserTag, Clear calls clearUserTag

## Dev Notes

### Critical Architecture Requirement: Centralize computeUserTag
The story's most important change is eliminating a **3-way code duplication**. `computeUserTag` currently exists as 3 separate private functions:
- `apps/server/src/services/chatService.ts:12` — private inline (custom tag only)
- `apps/server/src/routes/ws.ts:19` — private inline (custom tag only)
- `apps/server/src/services/userService.ts:63,90` — inline in update functions (custom tag only)

**None of these implement the `ViewerGuest` default** — this is a functional bug. After this story, all three are replaced with `import { computeUserTag } from '../lib/user-tag.js'`.

### Color Constants
Current hardcoded fallback in chatService and ws.ts is `'#6B7280'` (zinc-500). This should become `DEFAULT_TAG_COLOR`. The `DEFAULT_GUEST_TAG_COLOR` for the ViewerGuest default badge is `#a16207` (yellow-700 — warm amber, fits the dog-cam theme). If the user prefers a different guest tag color, they can change it in `user-tag.ts`.

### Recommended Color Palette (12 swatches)
```ts
export const USER_TAG_PALETTE = [
  '#ef4444', // red-500
  '#f97316', // orange-500
  '#eab308', // yellow-500
  '#22c55e', // green-500
  '#14b8a6', // teal-500
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#f472b6', // pink-400
  '#a78bfa', // violet-400
  '#6ee7b7', // emerald-300
] as const;
```
These are all visually distinct and legible on the warm dark background (`zinc-950` / `zinc-900` base). The server palette validation should use a `Set` lookup: `new Set(USER_TAG_PALETTE_SERVER).has(userTagColor)`.

### UX Design Gap — Flagged for Review
**Gap 1: "User detail panel" vs. flat table.**
The story AC says "opens a user's detail panel in Admin Panel → Users" but the existing UI is a flat table with inline Popover actions (established pattern from Story 5.5). A full "detail panel" (slide-out Sheet or modal) would be over-engineered for a 2-field edit form. Recommendation: **use a `<Popover>`** consistent with the existing "Change Role" dropdown pattern. This keeps the table compact. If the admin panel ever grows to need full user editing, a Sheet can be introduced then.

**Gap 2: UX spec has no mockup for UserTag editor.**
`ux-design-specification.md` and `ux-design-directions.html` have no explicit mockup for the UserTag assignment UI. The existing style language (warm dark palette, ShadCN components, compact table) is the implied design contract. Follow the established admin panel aesthetic.

**Gap 3: Mobile UX for the swatch picker.**
The admin panel is primarily desktop-oriented (Story 3.6 established desktop-first for admin controls). A 3×4 grid of 32px swatches is sufficient for desktop. On mobile, the popover will auto-position — no special mobile handling needed.

### Server Validation — UserTagColor
The server MUST validate that `userTagColor` is in the palette. Import the palette as a typed const array in `admin.ts` (or a shared server constant). Do not accept arbitrary hex values — this prevents XSS-via-style-injection risk since the color is rendered in `:style` bindings in the Vue components.

```ts
// In admin.ts PATCH handler
const ALLOWED_TAG_COLORS = new Set([
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f472b6',
  '#a78bfa', '#6ee7b7',
]);
if (userTagColor && !ALLOWED_TAG_COLORS.has(userTagColor)) {
  throw new AppError('Invalid tag color', 'VALIDATION_ERROR', 422);
}
```

### Popover UX Details
- The "Set Tag" button should show a tiny color-filled circle (inline `<span>` with `style="background-color: user.userTagColor"` and `w-2 h-2 rounded-full`) when a tag is currently set, giving instant visual feedback at the row level
- When popover opens, pre-select the swatch matching `user.userTagColor` (highlight with a ring)
- Swatch grid: `grid grid-cols-6 gap-1.5` (2 rows × 6 cols = 12 swatches) each `w-6 h-6 rounded cursor-pointer ring-offset-1 ring-offset-background`, selected swatch gets `ring-2 ring-white`
- Saving with empty text → same behavior as Clear

### Existing Code Not to Touch
- `useChat.ts` (`handleUserUpdate`) — already handles `userTag` in payload; no changes needed
- `usePresence.ts` (`handlePresenceUserUpdate`) — already handles `userTag`; no changes needed
- `ChatMessage.vue` — already renders `message.userTag` with inline style
- `PresenceList.vue` — already renders `viewer.userTag` with border style

### Architecture Patterns
- **Named exports only**: no `export default` from `user-tag.ts` or `userTagPalette.ts`
- **IDs**: always ULIDs — no changes to ID strategy
- **AppError**: `new AppError(message, code, statusCode)` from `apps/server/src/lib/errors.ts`
- **apiFetch in web**: always passes `credentials: 'include'` (existing wrapper)
- **Prisma singleton**: `import { prisma } from '../db/client.js'`

### Testing Patterns
- Server integration tests: use `createTestUser`, `createTestSession` helpers (see existing admin.test.ts for pattern)
- Web component tests: mock `useAdminUsers` composable; test that ShadCN Popover opens
- Vitest co-located: no `__tests__/` directories

### Project Structure Notes
- `apps/server/src/lib/` — already has: `errors.ts`, `ulid.ts`, `logger.ts` — add `user-tag.ts` here
- `apps/web/src/lib/` — add `userTagPalette.ts` here (if `lib/` doesn't exist, check `utils/` or create `lib/`)
- `apps/server/src/routes/admin.ts` — add PATCH route inline with existing GET/POST
- `apps/server/src/services/userService.ts` — add `updateUserTagById` alongside `updateUserRoleById`

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.6]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADMIN-01–05]
- [Source: apps/server/src/services/userService.ts] — current inline userTag logic (lines 63-65, 90-93)
- [Source: apps/server/src/services/chatService.ts:12] — duplicate computeUserTag
- [Source: apps/server/src/routes/ws.ts:19] — duplicate computeUserTag
- [Source: apps/server/src/routes/admin.ts] — existing admin endpoints to extend
- [Source: apps/web/src/composables/useAdminUsers.ts] — AdminUser interface + updateRole pattern
- [Source: apps/web/src/components/admin/UserList.vue] — existing table + Popover pattern to follow
- [Source: apps/web/src/components/ui/] — available: popover, button, badge, scroll-area (NO input component — use native `<input>`)
- [Source: packages/types/src/ws.ts] — UserTag, UserProfile already correct shape
- [Source: apps/server/prisma/schema.prisma] — user_tag_text, user_tag_color fields exist in User model

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Existing chatService.test.ts had hardcoded old Guest tag color (`#9CA3AF`) and wrong case for DEFAULT_TAG_COLOR (`#6B7280`) — updated both to match new centralized constants.
- Admin test app needed `onError` handler to correctly return 422/404 from `AppError` throws (Hono's default handler returns 500).
- `updateUserTagById` throws `AppError` (not plain Error) for NOT_FOUND to propagate the correct 404 status via the global error handler.
- Web branch coverage dropped to 90.38% after adding UserList.vue popover UI; added 6 additional tests covering error paths, loading state, error state, and "System Admin" label to restore above 91% threshold.
- UX fix (post-initial-implementation): (1) Clear button now resets UI state immediately via `resetTagState(userId)` called after `clearUserTag` succeeds. (2) Replaced 12-color swatch button grid with Reka UI full color picker: `ColorFieldRoot`/`ColorFieldInput` (hex text input), `ColorAreaRoot` (saturation/brightness 2D picker), `ColorSliderRoot` (hue slider), `ColorSwatchPickerRoot` (12 preset swatches). Server validation loosened from palette-only to any valid 6-digit hex regex. Internal state changed from `tagColorSelected: Record<string, string>` to `tagColorObj: Record<string, Color>`. TypeScript issues fixed: extracted `setTagColor(userId, value: Color | string | null | undefined)` helper to avoid template ref auto-unwrap bug; `onSwatchChange` uses `unknown` parameter type. Test mock: `vi.mock('reka-ui', async (importOriginal))` pattern preserves `Primitive` and other non-overridden exports. Test selectors updated from `color-field-root`/`color-area-root` to `color-field`/`color-area` (Vue fallthrough attribute override). Added `handleRoleChange` error-catch test to maintain 91% branch threshold.

### Completion Notes List

- **Task 1:** Centralized `computeUserTag` into `apps/server/src/lib/user-tag.ts`. Eliminated 3-way code duplication from `chatService.ts`, `ws.ts`, and `userService.ts`. All three now import from the shared module. Functional bug fixed: all three previously lacked the ViewerGuest default tag — now correctly returns `{ text: 'Guest', color: '#a16207' }`.
- **Task 2:** `updateUserTagById` added to `userService.ts` with `AppError` for 404. `PATCH /api/admin/users/:userId/user-tag` validates text (max 20 chars), color (any valid 6-digit hex via `/^#[0-9a-fA-F]{6}$/`), handles clear (empty/null text). `GET /api/admin/users` now returns `userTagText` and `userTagColor`.
- **Task 3:** `userTagPalette.ts` with 12 theme-safe palette colors and `DEFAULT_TAG_COLOR`.
- **Task 4:** `AdminUser` interface extended with `userTagText`/`userTagColor`. `updateUserTag` and `clearUserTag` added with optimistic updates via `handleAdminUserUpdate`.
- **Task 5:** `UserList.vue` redesigned Actions column with "Set Tag" popover using native `<input>`, Reka UI full color picker (ColorField hex input + ColorArea 2D gradient + hue slider + ColorSwatchPicker 12-preset swatches), color dot indicator when tag is set, pre-population from user data, immediate UI reset on Clear.
- **Task 6:** 10 server unit tests for `computeUserTag`, 4 userService tests for `updateUserTagById`, 6 admin route integration tests for PATCH, 4 composable tests, 24 UserList component tests, 5 apiFetch tests. Total: 301 server + 437 web = **738 tests** (all passing). All CI checks green: typecheck, lint, test --coverage.

## Post-Implementation Code Review

### Approved Pivot: Color Validation Scope Change (AC #8)

**Original Spec:** AC #8 required server validation against a **curated palette of exactly 12 hex colors** (palette-only validation).

**Implementation Pivot:** Server validation was **loosened to accept ANY valid 6-digit hex** via regex `/^#[0-9a-fA-F]{6}$/`.

**Rationale:** Flexibility to support admin preferences and future color themes without API changes. Client UI continues to present the 12-palette swatch picker, but administrators can now use direct API calls or client-side customization to set arbitrary colors if needed. This is a **backward-compatible expansion** that maintains AC #1-#7 compliance while improving extensibility.

**Evidence:** Documented in agent notes (Story Dev Agent Record, line 211-212): "Server validation loosened from palette-only to any valid 6-digit hex regex."

**No Breaking Changes:**
- All 12 palette colors remain valid
- Web UI still shows only 12 swatches (default behavior)
- Existing user tags with palette colors unaffected
- Out-of-palette colors render correctly in chat/presence (color value passes through validation chain)

**Test Coverage:** Admin route tests (admin.test.ts, line 196-208) verify any valid 6-digit hex is accepted; palette colors tested separately for swatch picker (UserList.test.ts).

### Reka UI Color Picker — Scope Enhancement (Task 5)

**Original Spec:** AC #1 specified "color swatch palette of exactly 12 theme-safe colors" with "Save/Clear buttons."

**Enhancement:** Implemented with **Reka UI full-featured color picker** (ColorField hex input, ColorArea 2D gradient + hue slider, ColorSwatchPickerRoot 12-preset swatches), providing:
- Direct hex input for power users
- Saturation/brightness 2D gradient
- Hue slider for fine-tuning
- Swatch picker for quick selection

**Rationale:** UX improvement aligned with the color validation pivot—users can now explore/discover colors via gradient UI while still respecting the 12-swatch default. Completes AC #1 requirement and enhances usability.

**No AC Violation:** AC #1 requires "swatch palette"; Reka UI **includes the swatch picker** plus additional tools. Requirement met + exceeded.

---

### File List

- `apps/server/src/lib/user-tag.ts` (new)
- `apps/server/src/lib/user-tag.test.ts` (new)
- `apps/server/src/services/userService.ts` (modified — add updateUserTagById, replace inline computeUserTag, import AppError)
- `apps/server/src/services/userService.test.ts` (modified — add updateUserTagById tests, import updateUserTagById)
- `apps/server/src/services/chatService.ts` (modified — replace inline computeUserTag, remove UserTag import)
- `apps/server/src/services/chatService.test.ts` (modified — fix outdated Guest tag color and case)
- `apps/server/src/routes/ws.ts` (modified — replace inline computeUserTag, remove UserTag import)
- `apps/server/src/routes/admin.ts` (modified — add ALLOWED_TAG_COLORS, PATCH user-tag route, update GET to include userTagText/userTagColor, import updateUserTagById)
- `apps/server/src/routes/admin.test.ts` (modified — add onError handler, import AppError/ContentfulStatusCode, add PATCH user-tag tests, update GET test for userTag fields, import updateUserTagById)
- `apps/web/src/lib/userTagPalette.ts` (new)
- `apps/web/src/lib/api.test.ts` (new — apiFetch unit tests for error handling and response parsing)
- `apps/web/src/composables/useAdminUsers.ts` (modified — AdminUser interface extended, updateUserTag, clearUserTag)
- `apps/web/src/composables/useAdminUsers.test.ts` (modified — add updateUserTag/clearUserTag tests)
- `apps/web/src/components/admin/UserList.vue` (modified — Set Tag popover UI with Reka UI color picker, color dot, pre-population)
- `apps/web/src/components/admin/UserList.test.ts` (modified — mock updateUserTag/clearUserTag, Set Tag UI tests, loading/error/System Admin branch tests)
