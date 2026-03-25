---
title: 'PWA Support via vite-plugin-pwa'
type: 'feature'
created: '2026-03-25'
status: 'done'
baseline_commit: '6b2fa72882695e2b711d0fc7408df3615fcfdc59'
context: []
---

# PWA Support via vite-plugin-pwa

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** ManlyCam has no web app manifest or service worker, so it cannot be installed as a standalone app on mobile and desktop, and the app shell has no caching layer.

**Approach:** Integrate `vite-plugin-pwa` to generate a Workbox-powered service worker and web app manifest; generate PWA icons from `favicon.svg` via `@vite-pwa/assets-generator`; patch `manifest.webmanifest` in `docker-entrypoint.sh` so `name`/`short_name` track `SITE_NAME` at container startup. Install prompt is fully passive — no in-app UI.

## Boundaries & Constraints

**Always:**
- SW uses `NetworkOnly` (implicit Workbox default for unmatched routes) for `/api/*`, `/ws`, and `/whep` — never cache these
- `/emojis/*` uses `CacheFirst` with 30-day expiry (matches existing long-lived cache headers)
- Manifest `name` and `short_name` contain literal `__SITE_NAME__` at build time; `docker-entrypoint.sh` substitutes the real value at container startup
- Generated icon PNGs are committed to the repo (not regenerated on every CI build)
- `display: 'standalone'`, `registerType: 'autoUpdate'`

**Ask First:**
- If `@vite-pwa/assets-generator` fails to rasterize `favicon.svg` (e.g., unsupported SVG features)

**Never:**
- Add any install prompt UI, SW update prompt, or `useRegisterSW` composable to any Vue component or composable
- Cache API responses, WebSocket frames, or WHEP stream data
- Upgrade Tailwind or any other pinned dependency as a side effect

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| SITE_NAME set | Container starts with `SITE_NAME=DogCam` | `GET /manifest.webmanifest` → `"name":"DogCam","short_name":"DogCam"` | n/a |
| SITE_NAME unset | Container starts without `SITE_NAME` | Manifest resolves to `"name":"ManlyCam"` (sed default) | n/a |
| API fetch while offline | SW intercepts `/api/*` | Network pass-through; browser shows offline error normally | n/a |
| Emoji asset fetch | SW intercepts `/emojis/foo.svg` after first load | Served from `CacheFirst` `emojis` cache | n/a |
| New deployment | SW detects updated precache assets | Silently updates; activates on next page reload — no user prompt | n/a |

</frozen-after-approval>

## Code Map

- `apps/web/vite.config.ts` -- add `VitePWA()` plugin with manifest, Workbox runtime caching, and assets config
- `apps/web/package.json` -- add `vite-plugin-pwa` and `@vite-pwa/assets-generator` as devDependencies; add `generate-pwa-assets` script
- `apps/web/public/pwa-192x192.png` -- generated icon (new, committed)
- `apps/web/public/pwa-512x512.png` -- generated icon (new, committed)
- `apps/web/public/maskable-icon-512x512.png` -- generated icon (new, committed)
- `apps/server/docker-entrypoint.sh` -- extend to also sed-patch `dist/manifest.webmanifest` for `__SITE_NAME__`

## Tasks & Acceptance

**Execution:**
- [ ] `apps/web/package.json` -- add `"vite-plugin-pwa"` and `"@vite-pwa/assets-generator"` to `devDependencies`; add script `"generate-pwa-assets": "pwa-assets-generator --preset minimal --source public/favicon.svg"`; run `pnpm install` from repo root
- [ ] `apps/web/public/` -- run `pnpm run generate-pwa-assets` from `apps/web/` to emit `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png` into `public/`; commit the generated files
- [ ] `apps/web/vite.config.ts` -- import and add `VitePWA({ registerType: 'autoUpdate', injectRegister: 'auto', manifest: { name: '__SITE_NAME__', short_name: '__SITE_NAME__', description: 'Live pet camera', theme_color: '#09090b', background_color: '#09090b', display: 'standalone', icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }, { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' }, { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] }, workbox: { navigateFallback: '/index.html', navigateFallbackDenylist: [/^\/api\//, /^\/ws/, /^\/whep/], runtimeCaching: [{ urlPattern: /^\/emojis\/.*/, handler: 'CacheFirst', options: { cacheName: 'emojis', expiration: { maxAgeSeconds: 2592000 } } }] } })`
- [ ] `apps/server/docker-entrypoint.sh` -- after the `index.html` sed block, add a parallel block that patches `/repo/apps/web/dist/manifest.webmanifest` (if it exists and contains `__SITE_NAME__`) with the same `sed -i "s/__SITE_NAME__/${SITE_NAME:-ManlyCam}/g"` substitution

**Acceptance Criteria:**
- Given `pnpm run build` completes in `apps/web`, when listing `dist/`, then `manifest.webmanifest` is present containing `"name":"__SITE_NAME__"` and all three icon PNGs are present
- Given a container started with `SITE_NAME=DogCam`, when `GET /manifest.webmanifest`, then `name` and `short_name` both equal `"DogCam"`
- Given `SITE_NAME` is unset at container start, then manifest `name` equals `"ManlyCam"`
- Given the SW is active, when a `/api/*` request is made offline, then the SW does not serve a cached response (request passes to network and fails naturally)
- Given the SW is active after first load, when `/emojis/*.svg` is fetched again, then it is served from the `emojis` cache without a network request
- Given `pnpm run typecheck && pnpm run lint && pnpm run test --coverage` from `apps/web`, then all three pass with no new failures or coverage regressions

## Design Notes

**`__SITE_NAME__` in JSON**: The placeholder is valid as a JSON string value. The `sed -i "s/__SITE_NAME__/…/g"` replacement in the entrypoint works identically on `manifest.webmanifest` as it does on `index.html`. Guard with `grep -q "__SITE_NAME__"` to make the block idempotent on repeated container restarts.

**Unmatched routes = NetworkOnly by default**: Workbox's default behavior for routes not matched by any `runtimeCaching` rule (and not precached) is a network pass-through. Explicitly listing `/api/*` in `navigateFallbackDenylist` prevents the SW from serving `index.html` as a navigation fallback for those origins; no explicit `NetworkOnly` handler entry is required.

**No coverage impact**: `vite.config.ts` is excluded from coverage. No new runtime TS source files are added. `docker-entrypoint.sh` is shell. No `/* c8 ignore */` annotations needed.

## Verification

**Commands:**
- `cd apps/web && pnpm run build` -- expected: exits 0; `dist/manifest.webmanifest` present
- `cd apps/web && pnpm run typecheck` -- expected: zero errors
- `cd apps/web && pnpm run lint` -- expected: zero errors
- `cd apps/web && pnpm run test --coverage` -- expected: all tests pass, thresholds met

**Manual checks:**
- After container start with `SITE_NAME=TestCam`, `curl /manifest.webmanifest | jq '.name'` → `"TestCam"`
- On Chrome mobile, confirm the install banner / "Add to Home Screen" option appears for the served build
