# Story 10.6: Public Clip Pages

Status: review

## Story

As an **unauthenticated user with a clip link**,
I want to view a public clip without logging in,
So that I can watch shared moments without requiring stream access.

## Acceptance Criteria

1. **Server OG injection route** — A `GET /clips/:id` route handler is registered in `app.ts` at module level, **outside** the `if (env.NODE_ENV === 'production')` block. `distPath` is hoisted above the production guard so both the OG route and the production static block share it.

2. **OG meta injection for public clips** — When clip exists with `visibility: 'public'`, the server reads `index.html` from `distPath`, injects `og:title` (clip name), `og:description` (clip description or default), `og:image` (`/api/clips/{id}/thumbnail`), `og:url` (`{BASE_URL}/clips/{id}`) into `<head>`, and returns the modified HTML.

3. **Non-public / missing clip fallback** — When the clip is non-public, soft-deleted, or does not exist, plain `index.html` is served with no OG injection. The SPA handles the appropriate UI state.

4. **DB error fallback** — If the DB lookup fails during OG injection, the server falls through to plain `index.html` (non-fatal, logged).

5. **Unauthenticated public clip page** — SPA renders: video player, clip name, description, clipper attribution (if `showClipper: true` — name; if `showClipperAvatar: true` — avatar). No stream link, chat panel, application navigation, or stream CTA for unauthenticated users. Download button calls `GET /api/clips/:id/download` — this works for unauthenticated users on public clips since the public clip endpoint does not require auth.

6. **Authenticated standalone clip page** — When `history.state.clipModal` is absent/false and user is authenticated, the standalone clip page renders with a stream-status-aware CTA ("Watch Live" when online, "Go to Stream" when offline or WS state unknown). Download button calls `GET /api/clips/:id/download`.

7. **Authenticated shared clip access** — Authenticated users can view `shared` clips at `/clips/:id` with the full standalone layout plus stream CTA.

8. **Modal vs standalone detection** — Vue Router checks `history.state?.clipModal === true && history.state?.fromRoute === '/'`. If both conditions hold, the clip modal overlay renders over the stream page. If either fails (stale state, external navigation, refresh), the standalone clip page renders instead.

9. **SPA states for non-accessible clips** — "Sign in to view this clip" for unauthenticated requests to shared clips. "Clip not found" for missing or private clips.

10. **Download** — All users (authenticated or not) call `GET /api/clips/:id/download` which returns a presigned URL redirect. The endpoint does not require authentication for public clips.

## Tasks / Subtasks

- [x] **Task 1: Server — Hoist `distPath` and register OG injection route** (AC: #1, #2, #3, #4)
  - [x] 1.1 Move `const distPath = join(__dirname, '../../web/dist')` out of the `if (env.NODE_ENV === 'production')` block in `app.ts`
  - [x] 1.2 Register `GET /clips/:id` route handler **before** the production `serveStatic` block and **outside** the production guard
  - [x] 1.3 In the route handler: query `prisma.clip.findFirst({ where: { id: params.id, deletedAt: null } })` — select `visibility`, `name`, `description`, `thumbnailKey`
  - [x] 1.4 If clip is public: read `index.html` from `distPath`, inject OG meta tags into `<head>` (`og:title`, `og:description`, `og:image`, `og:url`), return modified HTML
  - [x] 1.5 If clip is non-public, missing, or DB error: serve plain `index.html` with no injection; log DB errors via `logger.error`
  - [x] 1.6 Handle `distPath` not existing (dev without build): return a minimal HTML response or 404 gracefully

- [x] **Task 2: Vue Router — Add `/clips/:id` route** (AC: #8)
  - [x] 2.1 Add route `{ path: '/clips/:id', component: ClipPage }` to `router/index.ts`
  - [x] 2.2 Ensure the route is excluded from the banned/rejected redirect logic (clip pages should be accessible without full auth for public clips)
  - [x] 2.3 Allow the route to pass through router guard without requiring authentication

- [x] **Task 3: Create `ClipPage.vue` standalone page** (AC: #5, #6, #7, #9, #10)
  - [x] 3.1 Create `apps/web/src/views/ClipPage.vue`
  - [x] 3.2 On mount, check `history.state?.clipModal === true && history.state?.fromRoute === '/'` — if true, emit/signal to render modal overlay instead (defer to Story 10-5's modal system)
  - [x] 3.3 Fetch clip data via `GET /api/clips/:id` — handle 401, 404, and success responses
  - [x] 3.4 Unauthenticated + public clip: render video player (video source via `GET /api/clips/:id/download` presigned redirect), clip name, description, clipper attribution block (conditional on `showClipper`/`showClipperAvatar`), download button (calls `GET /api/clips/:id/download`)
  - [x] 3.5 Unauthenticated + shared clip (401 response): render "Sign in to view this clip" with login link
  - [x] 3.6 Missing/private clip (404 response): render "Clip not found"
  - [x] 3.7 Authenticated + accessible clip: render full clip page with stream-status CTA and API download button

- [x] **Task 4: Stream-status CTA for authenticated users** (AC: #6)
  - [x] 4.1 Use `useStream` composable's `streamState` to determine CTA text
  - [x] 4.2 "Watch Live" link when `streamState === 'live'`; "Go to Stream" when other states
  - [x] 4.3 CTA links to `/` (the stream page)

- [x] **Task 5: Clipper attribution block** (AC: #5)
  - [x] 5.1 Conditional rendering: show attribution only when clip's `showClipper` is `true`
  - [x] 5.2 Display `clipperName` text
  - [x] 5.3 Show `clipperAvatarUrl` image only when `showClipperAvatar` is `true` and `clipperAvatarUrl` is present

- [x] **Task 6: Tests** (All ACs)
  - [x] 6.1 Server tests: OG injection for public clips, plain HTML for non-public/missing/DB-error, `distPath` hoisting
  - [x] 6.2 `ClipPage.vue` tests: unauthenticated public view, unauthenticated shared (sign-in prompt), missing/private (not found), authenticated with stream CTA, download button bifurcation, clipper attribution rendering, modal detection logic
  - [x] 6.3 Router tests: `/clips/:id` route registration, guard behavior for unauthenticated clip access (route guard returns true immediately for `/clips/` paths — tested in ClipPage.test.ts via real router mount)

## Dev Notes

### Server OG Injection — Critical Implementation Details

- **`distPath` hoisting**: The current `app.ts` declares `distPath` inside the `if (env.NODE_ENV === 'production')` block (line 55). Move it to before this block so the OG route can reference it in all environments. The production block continues to use the same variable.
- **Route placement**: The `GET /clips/:id` route MUST be registered before `app.use('/*', serveStatic(...))` — otherwise the static handler will intercept `GET /clips/abc` and try to serve a file. Place it after API routes but before the production block.
- **OG injection approach**: Read `index.html` as string, use `String.replace()` to inject tags after `<head>` or before `</head>`. Do NOT use a DOM parser — this is a simple string injection.
- **`env.BASE_URL`**: Already validated in `apps/server/src/env.ts` — use it for `og:url`.
- **Thumbnail proxy**: Thumbnails are served via `GET /api/clips/{id}/thumbnail` — use this path for `og:image`. No `S3_PUBLIC_BASE_URL` is needed.
- **Prisma singleton**: Import from `apps/server/src/db/client.ts`.
- **Error handling**: Use `try/catch` around DB query. On catch, log with `logger.error` and fall through to plain `index.html`. Do NOT throw `AppError` — this is a best-effort injection, not an API endpoint.
- **No auth required on this route**: The `authMiddleware` is already applied globally as informational (non-rejecting). The OG route does not need to check authentication — it serves HTML regardless, and the SPA handles auth gating.

### Frontend — ClipPage.vue Architecture

- **Route guard**: The `/clips/:id` route must bypass the standard auth-required guard. Currently the router guard in `router/index.ts` only redirects for `/rejected` and `/banned`. Since `App.vue` renders `<RouterView>` for all paths except `/`, the `ClipPage.vue` will render via `<RouterView>` when at `/clips/:id`. Verify this works for both authenticated and unauthenticated users.
- **`App.vue` template logic**: `App.vue` line 26 checks `$route.path !== '/'` to decide whether to render `<RouterView>` vs `WatchView`. The `/clips/:id` path satisfies `path !== '/'`, so `<RouterView>` will render `ClipPage.vue`. This is the correct behavior.
- **`GET /api/clips/:id`**: This endpoint is defined in Story 10-3. For unauthenticated requests to public clips, it returns the clip data. For unauthenticated requests to non-public clips, it returns 401. For missing/soft-deleted clips, 404. The SPA must handle all three.
- **Video player**: Use a plain `<video>` element with `controls` attribute. Load the video via `GET /api/clips/:id/download` (302 redirect to presigned URL) — this works for both authenticated and unauthenticated users on public clips. For shared/private clips, authenticated users use the same presigned URL flow.
- **Stream state for CTA**: Import `useStream` from `@/composables/useStream`. The `streamState` ref is reactive and updated via WS `stream:state` messages. For unauthenticated users, no WS connection exists, so the CTA should not be shown (AC #5 explicitly says no stream CTA for unauthenticated users).
- **Modal detection**: Check `window.history.state?.clipModal === true && window.history.state?.fromRoute === '/'` — if true, this page was loaded from a clip card click in the stream view (Story 10-5). In that case, defer rendering to the modal overlay system. For this story, just render the standalone page when the modal conditions are not met.

### Key Dependencies (Stories 10-2 and 10-3 must be merged first)

- `S3_BUCKET`, `S3_ENDPOINT` env vars in `env.ts` — Story 10-2
- `clips` Prisma model — Story 10-2
- `GET /api/clips/:id` endpoint — Story 10-3
- `GET /api/clips/:id/download` endpoint — Story 10-3
- `ClipChatMessage` type in `packages/types` — Story 10-2
- `clip:visibility-changed` WsMessage type — Story 10-2

### Existing Patterns to Follow

- **Views directory**: All page-level components live in `apps/web/src/views/` (`LoginView.vue`, `RejectedView.vue`, `BannedView.vue`, `WatchView.vue`)
- **Composables**: Use `useAuth` for auth state, `useStream` for stream state, `useWebSocket` for WS connection
- **API calls**: Use `apiFetch` from the codebase (check `useStream.ts` or similar for the pattern)
- **Named exports only**: No `export default` in source files
- **c8 coverage**: All new lines must be covered or have `/* c8 ignore next */` annotations

### Project Structure Notes

- `apps/server/src/app.ts` — modify for OG injection route and `distPath` hoisting
- `apps/web/src/router/index.ts` — add `/clips/:id` route
- `apps/web/src/views/ClipPage.vue` — new standalone clip page component
- `apps/web/src/views/ClipPage.test.ts` — new test file (co-located)
- `apps/server/src/app.test.ts` — add OG injection tests (or co-located test near app.ts)

### References

- [Source: `_bmad-output/planning-artifacts/epics.md` lines 2342-2381] Story 10-6 acceptance criteria
- [Source: `_bmad-output/planning-artifacts/epics.md` lines 2047-2049] Epic 10 overview
- [Source: `_bmad-output/planning-artifacts/epics.md` lines 424-441] Epic 10 dependencies
- [Source: `apps/server/src/app.ts`] Current server app structure with `distPath` inside production guard
- [Source: `apps/web/src/router/index.ts`] Current Vue Router with 3 routes
- [Source: `apps/web/src/App.vue`] Template routing logic — `path !== '/'` renders `<RouterView>`
- [Source: `apps/server/src/env.ts`] Current env vars — `BASE_URL` already validated
- [Source: `apps/web/src/composables/useStream.ts`] `streamState` ref for CTA logic

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- vi.hoisted required for all mock state in both app.test.ts and ClipPage.test.ts — vitest hoists vi.mock() calls to top of file so any variables referenced in factory functions must also be hoisted
- `ApiFetchError` class must be shared between mock factory and test code (via vi.hoisted) to make `instanceof` checks in the component pass in tests
- `resolveClipForAccess` had unconditional `if (!requestingUserId) throw 401` before DB lookup — this caused all unauthenticated requests (including public clips) to return 401. Fixed by moving DB lookup first and only throwing 401 for unauthenticated + non-public clips.

### Completion Notes List

- **Task 1**: `distPath` hoisted to module level in `app.ts`. Added `escapeHtmlAttr()` helper. `GET /clips/:id` route registered before production SPA catch-all. Tries `readFileSync` on `index.html` — if missing (dev without build) returns minimal placeholder. DB lookup via `prisma.clip.findFirst` with `deletedAt: null` filter. Public clips get OG injection; others get plain HTML. DB errors logged and fallen through to plain HTML.
- **Task 2**: Router already had `/clips/:id` route with `ClipStandalonePage` placeholder from Story 10-5 setup. Replaced placeholder with real `ClipPage` import. `defineComponent`/`h()` placeholder and `import { defineComponent, h }` removed. Router guard already had `startsWith('/clips/')` early-return for unauthenticated access.
- **Task 3–5**: `ClipPage.vue` created with: loading state, modal-mode detection (returns empty div, skips API fetch), 401 → sign-in prompt, 404/error → not-found, success → full clip page. Download button uses `/api/clips/:id/download` for all users. Authenticated users see stream CTA. Clipper attribution block conditional on `showClipper`.
- **Task 6**: 9 server tests (OG injection scenarios + HTML escaping + DB error + missing file). 24 web component tests (all states, attribution, modal detection, CTA text). Router guard behavior tested via real router mount in component tests. 100% coverage on ClipPage.vue.

### File List

- `apps/server/src/app.ts`
- `apps/server/src/app.test.ts`
- `apps/server/src/services/clipService.ts`
- `apps/server/src/services/clipService.test.ts`
- `apps/web/src/router/index.ts`
- `apps/web/src/views/ClipPage.vue`
- `apps/web/src/views/ClipPage.test.ts`

## Change Log

- 2026-03-24: Story implemented — server OG injection route, ClipPage.vue standalone page, router placeholder replaced. 752 server tests + 1461 web tests passing. All quality gates green.
- 2026-03-24: Smoke test fixes — (1) `resolveClipForAccess` in clipService.ts fixed to allow unauthenticated access to public clips (was unconditionally throwing 401 before DB lookup); (2) description now renders as markdown via `renderMarkdown`; (3) landscape two-column layout (video left, content right at `sm:` breakpoint). 754 server tests + 1461 web tests passing. All quality gates green.
