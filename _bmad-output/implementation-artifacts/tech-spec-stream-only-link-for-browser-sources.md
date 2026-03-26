---
title: 'Stream-Only Link for Browser Sources'
type: 'feature'
created: '2026-03-26'
status: 'done'
baseline_commit: '358430c9a96bfdd7a87ab6a8dba4e3be80bf96b4'
context: []
---

# Stream-Only Link for Browser Sources

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Admins have no dedicated, auth-free page that shows only the stream — they currently capture the full browser window for tools like OBS browser sources, which requires an active session and includes UI chrome.

**Approach:** Add an admin-controlled stream-only link backed by a secret key in `stream_config`. A new `/stream-only/:key` page renders only a full-viewport video with no UI. A dedicated WHEP endpoint validates the key and long-polls until the stream is live before proxying to mediamtx. Admins manage the link (enable/disable/regenerate) via a new tab in AdminDialog.

## Boundaries & Constraints

**Always:**
- Keys stored in `stream_config`: `stream_only_key` (ULID) and `stream_only_enabled` ("true"/"false")
- Stream-only WHEP endpoints validate by key only — no session auth
- Long-poll: hold POST `/api/stream-only/:key/whep` until stream is live or 30s timeout (→ 503, client retries)
- Invalid/disabled key → 404; client shows permanent black, stops all retries
- Video fills viewport via `object-fit: cover` (may crop, no stretching)
- Auto-reconnect with exponential backoff (1s → 2s → … → 30s cap), same pattern as `useWhep`
- Key generated via `crypto.randomBytes(96).toString('base64url')` (128 URL-safe chars, 768 bits entropy) — called directly in the route handler, not via the ULID singleton
- Admin endpoints require `requireAuth` + `requireRole(Role.Admin)`

**Ask First:**
- Any increase to the 30s long-poll timeout

**Never:**
- WebSocket connections on the stream-only page
- Any API call on the stream-only page beyond WHEP negotiation
- UI chrome, text overlays, or error messages on the stream-only page
- HLS or any stream format other than WebRTC WHEP

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid key, stream live | POST `/api/stream-only/:key/whep` | Immediate WHEP proxy → SDP answer + Location | N/A |
| Valid key, stream offline | POST with valid key, stream not live | Long-poll up to 30s; proxies WHEP when live | After 30s → 503; client retries (re-enters poll) |
| Invalid key or disabled | POST with wrong key or `stream_only_enabled ≠ "true"` | 404 | Client sets `isPermanentlyFailed`, halts retries |
| ICE trickle / close | PATCH or DELETE `/api/stream-only/:key/whep/:session` | Validate key+enabled, proxy to mediamtx | 404 if invalid/disabled |
| Key regenerated mid-session | Existing session's PATCH/DELETE carries old key | Old key → 404; existing ICE fails; page reconnects on next retry | Page shows black then reconnects with new URL |
| Spinner state | `isConnecting=true` on stream-only page | Centered spinner, no text, black background | N/A |
| Permanent failure | 404 received on WHEP POST | Black background, no spinner, no further requests | N/A |

</frozen-after-approval>

## Code Map

- `apps/server/src/services/streamService.ts` — add `waitForLive(ms)` + emit 'live' on state transition (track `prevLive` in `broadcastState`)
- `apps/server/src/routes/stream.ts` — WHEP proxy pattern (HOP_BY_HOP set, Location rewrite) to replicate
- `apps/server/src/lib/stream-config.ts` — key-value store for new `stream_only_*` keys
- `apps/server/src/app.ts` — router mounting point
- `apps/web/src/composables/useWhep.ts` — reconnect/monitoring pattern for `useStreamOnlyWhep`
- `apps/web/src/components/admin/AdminDialog.vue` — tabs pattern to extend
- `apps/web/src/router/index.ts` — auth bypass pattern for public routes
- `apps/web/src/views/ClipPage.vue` — standalone page structure reference

## Tasks & Acceptance

**Execution:**
- [ ] `apps/server/src/services/streamService.ts` — add module-level `EventEmitter`; track `private prevLive = false` in `broadcastState()`; emit `'live'` on `false → true` transition; expose `waitForLive(timeoutMs): Promise<boolean>` using `Promise.race` between the emitter's `once('live')` and a timeout that resolves `false`
- [ ] `apps/server/src/routes/stream-only.ts` — new router: `GET /api/stream-only/config` (returns `{ enabled, key }`); `PATCH /api/stream-only/config` (body `{ enabled: boolean }`, persists to stream_config); `POST /api/stream-only/config/regenerate` (generates `crypto.randomBytes(96).toString('base64url')`, persists, returns `{ key }`); `POST /api/stream-only/:key/whep` (validate key+enabled → 404, check live state → long-poll via `waitForLive(30_000)` → 503 on timeout, else proxy WHEP with Location rewrite to `/api/stream-only/:key/whep/:uuid`); `PATCH|DELETE /api/stream-only/:key/whep/:session` (validate key+enabled, proxy)
- [ ] `apps/server/src/routes/stream-only.test.ts` — unit-test I/O matrix scenarios: valid key+live, valid key+offline (wait resolves true), timeout (503), invalid key (404), disabled (404), PATCH/DELETE relay, regenerate invalidates old key
- [ ] `apps/server/src/app.ts` — import and mount `streamOnlyRouter` before SPA catch-all
- [ ] `apps/web/src/composables/useStreamOnlyWhep.ts` — copy `useWhep` reconnect/monitoring structure; accept `key: string` param; POST to `/api/stream-only/${key}/whep` (no `credentials: 'include'`); add `isConnecting` ref (true while POST in flight, set in try/finally); on 404 response set `isPermanentlyFailed = true` and skip `scheduleReconnect`; rewrite session URL path from `/api/stream/whep/` to `/api/stream-only/${key}/whep/` using Location header value
- [ ] `apps/web/src/composables/useStreamOnlyWhep.test.ts` — test `isConnecting` flag lifecycle, 404 halts retries, non-404 errors schedule reconnect
- [ ] `apps/web/src/composables/useStreamOnlyLink.ts` — fetch `GET /api/stream-only/config`; expose `enabled`, `key`, `isLoading`, `error`; `toggle(enabled: boolean)` → PATCH; `regenerate()` → POST regenerate
- [ ] `apps/web/src/composables/useStreamOnlyLink.test.ts` — test fetch, toggle, regenerate
- [ ] `apps/web/src/components/admin/StreamOnlyPanel.vue` — Switch labeled "Enable Stream-Only Link" with description "A link that only displays the stream when enabled and nothing else, e.g. in an OBS browser source."; bind the Switch via `v-model` bound to `enabled` from `useStreamOnlyLink` (do NOT use `:checked` + `@update:checked` — use `v-model`); when enabled: readonly `<input>` showing `${origin}/stream-only/${key}`, Copy button, Regenerate button; loading skeleton; uses `useStreamOnlyLink`
- [ ] `apps/web/src/components/admin/StreamOnlyPanel.test.ts` — test disabled state, enabled state (URL shown), copy, regenerate
- [ ] `apps/web/src/components/admin/AdminDialog.vue` — add "Stream Link" `TabsTrigger` + `TabsContent` containing `<StreamOnlyPanel />`
- [ ] `apps/web/src/views/StreamOnlyView.vue` — standalone full-viewport page; reads `:key` from `useRoute`; mounts `useStreamOnlyWhep(key)`; `<video>` with `object-fit: cover` / `width: 100vw` / `height: 100vh`; shows centered spinner overlay when `isConnecting || (!isHealthy && !isPermanentlyFailed)`; black when `isPermanentlyFailed`; no other UI
- [ ] `apps/web/src/views/StreamOnlyView.test.ts` — test spinner shown while connecting, black on permanent failure, video rendered when healthy
- [ ] `apps/web/src/router/index.ts` — add `{ path: '/stream-only/:key', component: StreamOnlyView }`; add `to.path.startsWith('/stream-only/')` bypass to `beforeEach` auth guard

**Acceptance Criteria:**
- Given admin opens AdminDialog → Stream Link tab with link disabled, then toggle is off and URL field shows a placeholder (no key exposed)
- Given admin enables the link, then `${origin}/stream-only/${key}` appears in a readonly field with Copy and Regenerate buttons
- Given admin clicks Regenerate, then a new key is saved; the displayed URL updates; the old key returns 404
- Given navigating to `/stream-only/:key` with a valid enabled key while stream is live, then full-viewport video connects with no UI chrome and no auth required
- Given navigating with a valid key while stream is offline, then a spinner shows until the stream comes live (within 30s), at which point video connects
- Given the WHEP endpoint returns 404, then the page shows permanent black with no spinner and makes no further requests
- Given the stream drops while connected, then the page reconnects with exponential backoff; spinner shows during active attempt, black during backoff wait

## Design Notes

**`waitForLive` emit trigger:**
`broadcastState()` is called from both `setAdminToggle` and `updateReachable` — it's the single convergence point for state changes. Track `private prevLive = false`; update it after computing `getState()`; emit `'live'` only on `false → true` transition to avoid duplicate fires.

**Location header rewrite for session URLs:**
The POST handler has access to `key` via route param. Rewrite: `value.replace(/^\/cam\/whep/, \`/api/stream-only/${key}/whep\`)`. This embeds the key in all subsequent PATCH/DELETE calls so they can re-validate.

**`isConnecting` placement:**
Set `isConnecting.value = true` before the `fetch('/api/stream-only/...')` call. Set `false` in the `finally` block of `connectWhep`. This correctly covers both the long-poll wait duration and ICE negotiation time — the spinner stays on throughout.

## Verification

**Commands:**
- `pnpm --filter @manlycam/types build && tsc --noEmit` (from `apps/server`) — expected: zero TypeScript errors
- `pnpm run typecheck` (from `apps/web`) — expected: zero TypeScript errors
- `pnpm run lint` (from `apps/server` and `apps/web`) — expected: zero ESLint/Prettier errors
- `pnpm run test --coverage` (from `apps/server`) — expected: all tests pass, thresholds met
- `pnpm run test --coverage` (from `apps/web`) — expected: all tests pass, thresholds met

**Manual checks:**
- Open `/stream-only/:key` in an incognito window (no session) — stream should connect and show full-viewport video with no UI
- Disable the link in admin panel — same URL should show permanent black with no spinner
