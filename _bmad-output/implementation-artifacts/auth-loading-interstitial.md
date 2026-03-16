# Story: Auth Loading Interstitial — Suppress Login Flash on Page Load

Status: done

## Story

As **any user**,
when I load the app,
I want a loading spinner shown while the auth state is being resolved,
so that the login page doesn't flash briefly before the app determines I'm already signed in.

## Acceptance Criteria

1. **`useAuth` tracks a loading state**
   - A module-level `authLoading = ref(true)` is exported from `useAuth`
   - `authLoading` starts as `true` and is set to `false` after `fetchCurrentUser()` resolves (regardless of success or error)

2. **`App.vue` shows a full-screen spinner while auth is loading**
   - When `authLoading` is `true`, `App.vue` renders a full-screen centered spinner instead of `LoginView` or `WatchView`
   - The spinner renders on the root `'/'` path (same condition as where the `LoginView`/`WatchView` switch already lives)
   - Non-root routes (`RouterView`) are unaffected — they render immediately as before

3. **Login page no longer flashes for authenticated users**
   - After `fetchCurrentUser()` resolves with a valid user, `LoginView` is never rendered — only `WatchView` is shown
   - The transition from spinner → WatchView is direct

4. **Spinner design matches the app's visual language**
   - Dark background (`bg-[hsl(var(--background))]`), full viewport height, centered spinner
   - Spinner reuses the existing SVG spinner markup already present in `StreamPlayer.vue` (the `animate-spin` circle/path pattern)
   - No new dependencies required

5. **All tests pass; new loading state is covered**
   - `useAuth.test.ts` covers the new `authLoading` ref: starts `true`, becomes `false` after `fetchCurrentUser()` resolves (both success and error cases)
   - `App.vue` does not have its own test file; behavior is validated via the `useAuth` unit tests

---

## Tasks / Subtasks

- [x] **Task 1: Add `authLoading` ref to `useAuth`**
  - [x] 1.1 Add `const authLoading = ref(true)` at module level in `useAuth.ts`
  - [x] 1.2 In `fetchCurrentUser()`, add `finally { authLoading.value = false }` so it clears on both success and error
  - [x] 1.3 Export `authLoading` from the `useAuth()` return value
  - [x] 1.4 Update `useAuth.test.ts` to cover the new ref

- [x] **Task 2: Show spinner in `App.vue` while loading**
  - [x] 2.1 Import `authLoading` from `useAuth`
  - [x] 2.2 Add a loading branch in the template: `v-else-if="authLoading"` renders the spinner (placed before the `v-else` `LoginView`)
  - [x] 2.3 Spinner markup: full-screen dark div with centered `animate-spin` SVG (reuse the pattern from `StreamPlayer.vue`)

- [x] **Task 3: Full regression — all tests pass**

---

## Dev Notes

### Exact template logic (App.vue)

Current:

```vue
<RouterView v-if="$route.path !== '/'" />
<WatchView v-else-if="user" />
<LoginView v-else />
```

After:

```vue
<RouterView v-if="$route.path !== '/'" />
<WatchView v-else-if="user" />
<div
  v-else-if="authLoading"
  class="flex items-center justify-center h-dvh bg-[hsl(var(--background))]"
>
  <!-- spinner SVG -->
</div>
<LoginView v-else />
```

Order matters: `user` check comes first so an already-resolved user skips the spinner entirely (fast path). `authLoading` only activates when `user` is null AND we haven't resolved yet.

### Why `finally` not `then`/`catch`

`fetchCurrentUser()` already has a try/catch that swallows errors (it logs but doesn't rethrow). Using `finally` ensures `authLoading` is cleared even if future error handling changes.

### `useAuth.test.ts` isolation note

Tests use `vi.resetModules()` to isolate module-level state. The new `authLoading` ref is module-level, so existing test isolation already covers it — tests just need to assert the expected `authLoading` values.

---

## File List

- `apps/web/src/composables/useAuth.ts`
- `apps/web/src/composables/useAuth.test.ts`
- `apps/web/src/App.vue`

---

## Dev Agent Record

### Implementation Plan

Added `authLoading = ref(true)` at module level in `useAuth.ts`. Added `finally { authLoading.value = false }` to `fetchCurrentUser()`. Exported from return value. Added spinner branch in `App.vue` between `WatchView` and `LoginView` checks.

### Completion Notes

- `authLoading` starts `true`, cleared in `finally` block covering both success and error paths
- `App.vue` template order: `RouterView` → `WatchView` (user set) → spinner (loading) → `LoginView`
- 4 new tests in `useAuth.test.ts`: authLoading initial=true, cleared on success, cleared on 401, cleared on network error
- 874 web + 390 server tests passing; lint and typecheck clean

### Debug Log

_No issues._

---

## Change Log

| Date       | Change                                            |
| ---------- | ------------------------------------------------- |
| 2026-03-16 | Story created                                     |
| 2026-03-16 | Implemented — all tasks complete, status → review |
| 2026-03-16 | Code review complete — zero issues. Status → done |
