# Story 2.1: Landing Page and Google OAuth Sign-In Flow

Status: review

## Story

As an **unauthenticated visitor**,
I want to see a friendly landing page and sign in with my Google account in one click,
So that I can access the stream without creating a new account or remembering a password.

## Acceptance Criteria

1. **Given** a user visits `/` with no active session **When** the page loads **Then** `LoginView.vue` renders with: the configured `SITE_NAME` and `PET_NAME` in the heading, a brief explanation that this is a private stream, and a single "Sign in with Google" button — no other form fields or UI.

2. **Given** the user clicks "Sign in with Google" **When** the OAuth redirect completes **Then** `GET /api/auth/google` initiates the Google OAuth flow with scopes `openid email profile`.

3. **Given** Google completes the OAuth flow **When** `GET /api/auth/google/callback` is called **Then** the server exchanges the code for tokens, fetches the user profile (display name, email, avatar URL), and proceeds to the allowlist check (allowlist enforcement is Story 2.2; for this story the callback flow structure is established).

4. **Given** the server validates the OAuth callback **When** a new session is created **Then** an `httpOnly SameSite=Strict Secure` cookie named `session_id` is set with the session ULID — the value is never exposed to JavaScript.

5. **Given** a user has a valid active session **When** they visit `/` **Then** `App.vue` detects the session via `GET /api/me` and renders `WatchView.vue` — `LoginView.vue` is never shown.

6. **And** the `GET /api/me` response shape is `{ id, displayName, email, role, avatarUrl, bannedAt: null, mutedAt: null }` — all optional fields are explicit `null`, never omitted.

## Tasks / Subtasks

### Server Tasks

- [x] Task 1: Add pino request logger middleware (AC: all routes)
  - [x] Create `apps/server/src/middleware/logger.ts` — Hono middleware wrapping pino for request/response logging
  - [x] Wire into `app.ts` as first middleware (before routes)

- [x] Task 2: Add global error handler to `app.ts` (AC: 1, 6)
  - [x] Update `apps/server/src/app.ts` to add `app.onError()` handler
  - [x] Catch `AppError` → return `{ error: { code, message } }` with correct HTTP status
  - [x] Catch unknown errors → log via pino, return `{ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }` with 500

- [x] Task 3: Create auth middleware (AC: 5, 6)
  - [x] Create `apps/server/src/middleware/auth.ts` — reads `session_id` cookie, looks up session + user, injects into `ctx.var.user` (optional; does NOT 401 on missing — that is `requireAuth.ts`)
  - [x] Create `apps/server/src/middleware/requireAuth.ts` — returns `401 { error: { code: 'UNAUTHORIZED', message: '...' } }` if `ctx.var.user` is not set

- [x] Task 4: Create `authService.ts` — Google OAuth flow and session management (AC: 2, 3, 4)
  - [x] `initiateOAuth()` → generate random state, return authorization URL with scopes `openid email profile`
  - [x] `handleCallback(code, state)` → exchange code for tokens → fetch Google userinfo → return profile `{ googleSub, email, displayName, avatarUrl }`
  - [x] `createSession(userId)` → generate ULID session ID, insert into `sessions` table with `expiresAt = NOW() + 30 days`, return session ID
  - [x] `destroySession(sessionId)` → delete session row
  - [x] `getSessionUser(sessionId)` → look up session + user, check `expiresAt > NOW()`, return user or null
  - [x] Structure `processOAuthCallback(code, state)` to call `handleCallback()` then hand off to allowlist logic (stub for Story 2.2: for now, upsert user with role `ViewerCompany` and create session)

- [x] Task 5: Create auth routes (AC: 2, 3, 4)
  - [x] Create `apps/server/src/routes/auth.ts`
  - [x] `GET /api/auth/google` → call `initiateOAuth()`, set `oauth_state` httpOnly cookie (10-min expiry), redirect to Google URL
  - [x] `GET /api/auth/google/callback` → verify `state` param matches `oauth_state` cookie, clear `oauth_state` cookie, call `processOAuthCallback()`, set `session_id` cookie (30-day), redirect to `/`
  - [x] `POST /api/auth/logout` → call `destroySession()`, clear `session_id` cookie, return `{ ok: true }`
  - [x] Wire into `app.ts`

- [x] Task 6: Create `GET /api/me` route (AC: 5, 6)
  - [x] Create `apps/server/src/routes/me.ts`
  - [x] Protected by `requireAuth` middleware
  - [x] Return `{ id, displayName, email, role, avatarUrl, bannedAt: null, mutedAt: null }` — null for unset fields, not omitted
  - [x] Wire into `app.ts`

- [x] Task 7: Add SPA catch-all to `app.ts` (AC: 5)
  - [x] Mount `serveStatic` from `@hono/node-server/serve-static` to serve `apps/web/dist` in production
  - [x] Add `/*` catch-all that returns `index.html` for Vue Router history mode

- [x] Task 8: Add `MeResponse` type to `packages/types/src/api.ts` (AC: 6)
  - [x] Export `interface MeResponse { id: string; displayName: string; email: string; role: Role; avatarUrl: string | null; bannedAt: string | null; mutedAt: string | null }`

### Web Tasks

- [x] Task 9: Create `apps/web/src/lib/api.ts` — typed fetch wrapper (AC: 5, 6)
  - [x] Base fetch wrapper: attaches `credentials: 'include'` (sends session cookie), handles errors
  - [x] Export `apiFetch(path, options?)` — returns response JSON or throws on non-2xx
  - [x] Do NOT import external HTTP client libraries — use native `fetch()`

- [x] Task 10: Create `apps/web/src/composables/useAuth.ts` (AC: 5)
  - [x] Reactive `user` state (`MeResponse | null`)
  - [x] `fetchCurrentUser()` → `GET /api/me` → set `user` or null on 401
  - [x] `logout()` → `POST /api/auth/logout` → clear `user`, router push `/`
  - [x] Composable follows pattern: `export const useAuth = () => { const user = ref<MeResponse | null>(null); ... return { user, fetchCurrentUser, logout } }`

- [x] Task 11: Create view components (AC: 1, 5)
  - [x] `apps/web/src/views/LoginView.vue` — heading with `SITE_NAME` and `PET_NAME` from env (`VITE_SITE_NAME`, `VITE_PET_NAME`), private stream explanation, single "Sign in with Google" button linking to `/api/auth/google`
  - [x] `apps/web/src/views/WatchView.vue` — stub placeholder for authenticated view (full content in Epic 3); for now renders "Welcome, {user.displayName}" with logout button
  - [x] `apps/web/src/views/RejectedView.vue` — friendly message "This stream is invite-only"; no session required, no retry (Story 2.2)
  - [x] `apps/web/src/views/BannedView.vue` — message explaining account was banned; no session required (Story 2.3)

- [x] Task 12: Update `apps/web/src/router/index.ts` with full route config and `beforeEach` guard (AC: 5)
  - [x] Routes: `/` (auth-aware), `/rejected`, `/banned`
  - [x] Implement `beforeEach` navigation guard per architecture spec
  - [x] `/rejected` and `/banned` always public — return `true` immediately
  - [x] For `/`: `GET /api/me` → if 200 + `bannedAt` → `/banned`; if 200 + `role === 'pending'` → `/rejected`; if 200 → `true` (render WatchView); if 4xx with `BANNED` code → `/banned`; if 4xx → `true` (render LoginView)

- [x] Task 13: Update `apps/web/src/App.vue` to be auth-aware (AC: 5)
  - [x] Use `useAuth().user` to switch between `LoginView` and `WatchView` within the `/` route
  - [x] Call `fetchCurrentUser()` on mount; render based on `user` state
  - [x] Register global error handler: `app.config.errorHandler = (err, instance, info) => { ... }`

- [x] Task 14: Add Vite dev proxy for `/api` (AC: 2, 3, 4, 5, 6)
  - [x] Update `apps/web/vite.config.ts` to add `server.proxy` for `/api` → `http://localhost:3000`
  - [x] Note: `export default config` pattern is required for Vite tooling — not an anti-pattern violation

- [x] Task 15: Add `VITE_SITE_NAME` and `VITE_PET_NAME` to web `.env.example`

- [x] Task 16: Write tests (AC: 1–6)
  - [x] `apps/server/src/services/authService.test.ts` — test `createSession`, `destroySession`, `getSessionUser` against test DB
  - [x] `apps/server/src/routes/auth.test.ts` — test redirect URL shape, state cookie generation, logout response
  - [x] `apps/server/src/routes/me.test.ts` — test authenticated response shape, 401 on missing session
  - [x] `apps/web/src/composables/useAuth.test.ts` — test reactive state updates on `fetchCurrentUser`

## Dev Notes

### Story Scope Boundary

This story establishes the Google OAuth flow **structure**. Story 2.2 will retrofit allowlist enforcement into `authService.processOAuthCallback()`. For this story:
- The callback upserts the user with role `ViewerCompany` (temporary — Story 2.2 changes this based on allowlist type)
- All Google-authenticated users get a session for now
- The `/rejected` and `/banned` views are stubs (they render but are not yet triggered by allowlist logic)

The key architectural goal is to get the end-to-end flow working: visit `/` → click button → Google → callback → session cookie → `/` loads WatchView.

### Google OAuth Implementation — No External Library

Use the built-in `fetch()` API (Node.js 18+ — already required by `@hono/node-server`). No additional package needed.

**Step 1: Initiate (GET /api/auth/google)**
```typescript
// Generate a cryptographically random state for CSRF protection
import { randomBytes } from 'node:crypto'
const state = randomBytes(16).toString('hex')

const params = new URLSearchParams({
  client_id: env.GOOGLE_CLIENT_ID,
  redirect_uri: env.GOOGLE_REDIRECT_URI,
  response_type: 'code',
  scope: 'openid email profile',
  state,
  access_type: 'online',
})
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
```

**Step 2: Exchange Code (GET /api/auth/google/callback)**
```typescript
// Token exchange
const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code',
  }),
})
const { access_token } = await tokenRes.json()

// Fetch user profile
const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
  headers: { Authorization: `Bearer ${access_token}` },
})
const { sub, email, name, picture } = await userRes.json()
// sub = Google's unique user ID (store as users.google_sub)
// picture may be undefined/null — Story 2.4 adds Gravatar fallback
```

### Cookie Handling in Hono

`hono/cookie` is built into the `hono` package — no separate install.

```typescript
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

// Set session cookie (in callback handler)
setCookie(c, 'session_id', sessionId, {
  httpOnly: true,
  sameSite: 'Strict',
  secure: env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 days in seconds
})

// Set state cookie (in initiate handler) — short-lived
setCookie(c, 'oauth_state', state, {
  httpOnly: true,
  sameSite: 'Lax',  // Must be Lax (not Strict) for OAuth redirect to work
  secure: env.NODE_ENV === 'production',
  path: '/',
  maxAge: 600, // 10 minutes
})

// Read cookie
const sessionId = getCookie(c, 'session_id')

// Clear cookie
deleteCookie(c, 'session_id', { path: '/' })
```

**Important:** `oauth_state` cookie must use `SameSite=Lax` (not Strict) — Google's OAuth redirect comes from a different origin and `SameSite=Strict` would cause the cookie to be dropped on the callback.

### Hono Middleware Pattern — Typed Variables

Hono uses typed variables for middleware-injected data. Define the type in `app.ts`:

```typescript
// apps/server/src/app.ts
import { Hono } from 'hono'
import type { User } from '@prisma/client'

type Variables = {
  user: User | null
}

export function createApp() {
  const app = new Hono<{ Variables: Variables }>()
  // ...
}
```

In `auth.ts` middleware:
```typescript
// apps/server/src/middleware/auth.ts
import type { Context, Next } from 'hono'
export const authMiddleware = async (c: Context, next: Next) => {
  const sessionId = getCookie(c, 'session_id') ?? null
  const user = sessionId ? await authService.getSessionUser(sessionId) : null
  c.set('user', user)
  await next()
}
```

In `requireAuth.ts`:
```typescript
export const requireAuth = async (c: Context, next: Next) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401)
  }
  await next()
}
```

### AppError Convention

The existing `apps/server/src/lib/errors.ts` uses `(message, code, statusCode)` parameter order. Use it as-is:

```typescript
// Correct usage with existing signature
throw new AppError('Session expired or invalid', 'UNAUTHORIZED', 401)
throw new AppError('Authentication required', 'UNAUTHORIZED', 401)
throw new AppError('Insufficient permissions', 'FORBIDDEN', 403)
```

The global error handler in `app.ts` should catch these:
```typescript
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.statusCode as StatusCode)
  }
  logger.error({ err }, 'Unhandled error')
  return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500)
})
```

### Session Table — ULID Pattern

Follow established pattern from `src/lib/ulid.ts`:

```typescript
import { ulid } from '../lib/ulid.js'
import { prisma } from '../db/client.js'

// In authService.createSession()
const sessionId = ulid()
const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

await prisma.session.create({
  data: {
    id: sessionId,
    userId: user.id,
    expiresAt,
    // createdAt uses DB default NOW()
  },
})
return sessionId
```

### User Upsert in Callback (Story 2.1 stub — Story 2.2 replaces this logic)

For Story 2.1, the callback upserts any Google-authenticated user:

```typescript
// In authService.processOAuthCallback() — this entire function gets refactored in Story 2.2
const existingUser = await prisma.user.findUnique({ where: { googleSub: profile.sub } })

if (existingUser) {
  // Existing user: update profile, create session
  const updated = await prisma.user.update({
    where: { id: existingUser.id },
    data: {
      displayName: profile.name,
      avatarUrl: profile.picture ?? null,
      lastSeenAt: new Date(),
    },
  })
  const sessionId = await createSession(updated.id)
  return { sessionId, redirectTo: '/' }
} else {
  // New user: Story 2.2 adds allowlist check here
  // For now: create with ViewerCompany role (temporary)
  const userId = ulid()
  const newUser = await prisma.user.create({
    data: {
      id: userId,
      googleSub: profile.sub,
      email: profile.email,
      displayName: profile.name,
      avatarUrl: profile.picture ?? null,
      role: 'ViewerCompany', // Story 2.2 will set based on allowlist match type
    },
  })
  const sessionId = await createSession(newUser.id)
  return { sessionId, redirectTo: '/' }
}
```

### GET /api/me Response Shape

All optional fields must be explicit `null` — never omit:

```typescript
// In me.ts route handler
const user = c.get('user')! // requireAuth ensures non-null
return c.json({
  id: user.id,
  displayName: user.displayName,
  email: user.email,
  role: user.role,
  avatarUrl: user.avatarUrl ?? null,
  bannedAt: user.bannedAt?.toISOString() ?? null,
  mutedAt: user.mutedAt?.toISOString() ?? null,
})
```

### Vue Router `beforeEach` Guard — Exact Implementation

From `apps/server/../architecture.md#Frontend Architecture`:

```typescript
// apps/web/src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import WatchView from '../views/WatchView.vue'
import RejectedView from '../views/RejectedView.vue'
import BannedView from '../views/BannedView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: LoginView },        // App.vue switches to WatchView when auth'd
    { path: '/rejected', component: RejectedView },
    { path: '/banned', component: BannedView },
  ],
})

router.beforeEach(async (to) => {
  if (to.path === '/rejected' || to.path === '/banned') return true // always public

  // For '/', check session state
  const res = await fetch('/api/me', { credentials: 'include' })
  if (res.ok) {
    const user = await res.json()
    if (user.bannedAt) return '/banned'
    if (user.role === 'pending') return '/rejected'
    return true  // approved — render WatchView (App.vue switches based on useAuth state)
  }
  const body = await res.json().catch(() => ({}))
  if (body?.error?.code === 'BANNED') return '/banned'
  return true  // no session — render LoginView (guest state, same route)
})
```

Note: `LoginView` and `WatchView` are both rendered within the `/` route. `App.vue` checks `useAuth().user` to switch between them (not the router).

### App.vue — Auth-Aware Root

```vue
<!-- apps/web/src/App.vue -->
<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuth } from '@/composables/useAuth'
import LoginView from '@/views/LoginView.vue'
import WatchView from '@/views/WatchView.vue'

const { user, fetchCurrentUser } = useAuth()

onMounted(() => {
  fetchCurrentUser()
})
</script>

<template>
  <RouterView v-if="$route.path !== '/'" />
  <WatchView v-else-if="user" />
  <LoginView v-else />
</template>
```

### LoginView.vue — Env Variables

Vite exposes env vars prefixed with `VITE_` to the client:

```typescript
// In LoginView.vue
const siteName = import.meta.env.VITE_SITE_NAME as string
const petName = import.meta.env.VITE_PET_NAME as string
```

Add to `apps/web/.env.example`:
```
VITE_SITE_NAME=ManlyCam
VITE_PET_NAME=Manly
```

**Sign-in button:** Links to `/api/auth/google` as an `<a href>` tag (not a button with `fetch`). This triggers a full-page navigation to the OAuth flow, which is the correct pattern for server-side OAuth.

```vue
<a href="/api/auth/google" class="...">Sign in with Google</a>
```

### Vite Dev Proxy

For local development, the SPA (port 5173) needs to proxy API calls to the server (port 3000):

```typescript
// apps/web/vite.config.ts
export const config = defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
```

The `export default config` at the bottom is required for Vite tooling and is an accepted exception to the no-default-export rule (noted with a comment in the file).

### SPA Catch-All in Hono (Production)

```typescript
// apps/server/src/app.ts (production only)
import { serveStatic } from '@hono/node-server/serve-static'

// Serve Vue SPA dist in production (add AFTER all API routes)
if (env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: '../web/dist' }))
  // Fallback for Vue Router history mode
  app.get('/*', (c) => c.html(/* html */`<html>...index.html content...</html>`))
}
```

In practice, it's simpler to read and return `index.html`:
```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const indexHtml = readFileSync(join(process.cwd(), '../web/dist/index.html'), 'utf-8')
app.get('/*', (c) => c.html(indexHtml))
```

### ENV Variables Checklist

`apps/server/.env` needs all of:
```
NODE_ENV=development
PORT=3000
BASE_URL=http://localhost:3000
DATABASE_URL=postgresql://manlycam:password@localhost:5432/manlycam
SESSION_SECRET=change-me-in-development
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
HLS_SEGMENT_PATH=/tmp/hls
FRP_STREAM_PORT=11935
FRP_API_PORT=11936
AGENT_API_KEY=change-me-in-development
PET_NAME=Manly
SITE_NAME=ManlyCam
```

Note: `SESSION_SECRET` is validated by `env.ts` but not used yet (sessions are stored in DB; a secret would be needed if using signed cookies — currently the ULID is the unforgeable session token).

### Project Structure Notes

**New files this story creates:**
```
apps/server/src/
  middleware/
    auth.ts          # session cookie → ctx.var.user injection (optional session)
    requireAuth.ts   # 401 if no ctx.var.user
    logger.ts        # pino request logger middleware
  routes/
    auth.ts          # GET /api/auth/google, GET /api/auth/google/callback, POST /api/auth/logout
    me.ts            # GET /api/me
  services/
    authService.ts   # Google OAuth flow, session create/destroy, user upsert

apps/web/src/
  lib/
    api.ts           # typed fetch wrapper (credentials: include, error throw)
  composables/
    useAuth.ts       # current user state, fetchCurrentUser, logout
  views/
    LoginView.vue    # / route (guest state): Google sign-in CTA + branding
    WatchView.vue    # / route (auth'd state): stub for now
    RejectedView.vue # /rejected route: invite-only message
    BannedView.vue   # /banned route: banned user message

packages/types/src/
  api.ts             # Add MeResponse interface
```

**Modified files:**
```
apps/server/src/app.ts           # Add middleware, routes, error handler, SPA catch-all
apps/web/src/App.vue             # Auth-aware rendering (LoginView vs WatchView)
apps/web/src/router/index.ts     # Full route config + beforeEach guard
apps/web/src/main.ts             # Add app.config.errorHandler
apps/web/vite.config.ts          # Add server.proxy for /api
apps/web/.env.example            # Add VITE_SITE_NAME, VITE_PET_NAME
```

**Do NOT touch:**
- `apps/server/src/lib/ulid.ts` — singleton, no changes
- `apps/server/src/db/client.ts` — singleton, no changes
- `apps/server/prisma/schema.prisma` — already has all tables needed
- `apps/server/src/lib/errors.ts` — use as-is
- `apps/server/src/routes/health.ts` — already wired, keep working

### References

- Architecture decisions: [Source: `_bmad-output/planning-artifacts/architecture.md#Authentication & Security`]
- Session management details: [Source: `_bmad-output/planning-artifacts/architecture.md#Data Architecture — Session Management`]
- Frontend architecture + router guard: [Source: `_bmad-output/planning-artifacts/architecture.md#Frontend Architecture`]
- Naming and structure patterns: [Source: `_bmad-output/planning-artifacts/architecture.md#Implementation Patterns & Consistency Rules`]
- Story 2.1 requirements: [Source: `_bmad-output/planning-artifacts/epics.md#Story 2.1`]
- UX auth flow: [Source: `_bmad-output/planning-artifacts/ux-design-specification.md#Journey 1: Auth Gate → Stream Load`]
- **Visual design mockups (LoginView):** [Source: `_bmad-output/planning-artifacts/ux-design-directions.html`] — open in a browser; contains 7 interactive direction mockups including "Sign-in landing" state. The chosen direction is "Desktop — No-Topbar Hover-Overlay Three-Column". The sign-in landing shows: centered card layout, single "Sign in with Google" CTA button, minimal text, no other form fields or nav.
- Enforcement guidelines: [Source: `_bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines`]

### Testing Standards

- Test framework: **Vitest** (already configured in `apps/server/package.json`)
- Test location: Co-located `*.test.ts` — **no `__tests__/` directories**
- Test DB: Use a separate Postgres database for integration tests (`DATABASE_URL_TEST` or test-specific DB)
- Run with: `pnpm test` in `apps/server` or `apps/web`

Key test scenarios:
1. `authService.createSession()` — returns a ULID, inserts a `sessions` row with correct `expiresAt`
2. `authService.getSessionUser()` — returns `null` for expired/missing sessions
3. `GET /api/me` with no session → 401 `UNAUTHORIZED`
4. `GET /api/me` with valid session → correct shape with all fields present (no undefined)
5. `POST /api/auth/logout` → clears cookie, deletes session row
6. Router guard: no session → renders `LoginView` (does not redirect)
7. Router guard: valid session → renders `WatchView` (via `useAuth.user` reactive state)

### Epic 1 Patterns — Carry Forward

From Epic 1 retrospective:
- **Named exports only** — no `export default` anywhere in `apps/server/src/**` or `packages/types/src/**` (Vite configs are an exception)
- **ULID from `src/lib/ulid.ts`** — never import `monotonicFactory` from `ulidx` directly
- **Prisma client from `src/db/client.ts`** — never `new PrismaClient()`
- **Verify scaffold output** — check all files created match TypeScript expectations before committing
- **Co-located tests** — `authService.test.ts` lives next to `authService.ts`
- **All FK columns have `@@index`** — sessions.user_id already has `@@index([userId])` in schema ✓

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation proceeded without blockers.

### Completion Notes List

- Implemented full Google OAuth flow (initiateOAuth → handleCallback → processOAuthCallback) using native fetch, no external library
- Added `NODE_ENV` to env.ts schema (optional, defaults to 'development') to support secure cookie flag
- Created `src/lib/types.ts` with `AppEnv` type to avoid circular imports between app.ts and middleware/route files
- Used `ContentfulStatusCode` (not `StatusCode`) for Hono's `c.json()` status param — StatusCode includes 101 which is not valid for JSON responses
- `WatchView` is not a route component — it's rendered directly by App.vue based on `useAuth().user`; removed unused import from router to satisfy `noUnusedLocals`
- All tests use vitest mocks (vi.mock) for Prisma and env — no real database required for unit/integration tests
- Added vitest + @vue/test-utils to web devDependencies; ran `pnpm install` to update lockfile
- Added `@` path alias to both vite.config.ts (resolve.alias) and tsconfig.json (paths) for `@/` imports in web

**Test results:** 14 server tests + 3 web tests = 17 tests total, all passing. Typecheck and lint clean.

### File List

**New files:**
- `apps/server/src/lib/types.ts` — AppEnv type (shared, avoids circular imports)
- `apps/server/src/middleware/logger.ts` — pino request logger middleware
- `apps/server/src/middleware/auth.ts` — session cookie → ctx.var.user injection
- `apps/server/src/middleware/requireAuth.ts` — 401 guard
- `apps/server/src/services/authService.ts` — Google OAuth + session management
- `apps/server/src/routes/auth.ts` — OAuth initiate, callback, logout routes
- `apps/server/src/routes/me.ts` — GET /api/me route
- `apps/server/src/services/authService.test.ts`
- `apps/server/src/routes/auth.test.ts`
- `apps/server/src/routes/me.test.ts`
- `apps/web/src/lib/api.ts` — typed fetch wrapper
- `apps/web/src/composables/useAuth.ts`
- `apps/web/src/composables/useAuth.test.ts`
- `apps/web/src/views/LoginView.vue`
- `apps/web/src/views/WatchView.vue`
- `apps/web/src/views/RejectedView.vue`
- `apps/web/src/views/BannedView.vue`

**Modified files:**
- `apps/server/src/env.ts` — added NODE_ENV field
- `apps/server/src/app.ts` — added middleware, routes, error handler, SPA catch-all
- `packages/types/src/api.ts` — added MeResponse interface
- `apps/web/src/App.vue` — auth-aware rendering
- `apps/web/src/router/index.ts` — full route config + beforeEach guard
- `apps/web/src/main.ts` — added app.config.errorHandler
- `apps/web/vite.config.ts` — added server.proxy and @ alias
- `apps/web/tsconfig.json` — added @/* path alias
- `apps/web/.env.example` — added VITE_SITE_NAME, VITE_PET_NAME
- `apps/web/package.json` — added vitest, @vue/test-utils devDependencies
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status in-progress → review
