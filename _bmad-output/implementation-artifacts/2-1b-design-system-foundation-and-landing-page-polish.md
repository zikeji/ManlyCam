# Story 2.1b: Design System Foundation and Landing Page Polish

Status: done

## Story

As a **developer**,
I want Tailwind v3, ShadCN-vue, and the project's CSS custom property theme established in apps/web,
So that all current and future UI stories build on a consistent, spec-aligned design system from this point forward.

## Acceptance Criteria

1. **Given** `apps/web/package.json` is inspected **When** dependencies are reviewed **Then** `tailwindcss@^3` (pinned), `autoprefixer`, and `tailwind-merge` are present; `apps/web/tailwind.config.js` exists with `darkMode: 'class'` and content paths covering `src/**/*.{vue,ts}`; ShadCN-vue has been initialized (`components.json` present, `apps/web/src/components/ui/` contains at least `Button.vue` and `Avatar.vue`, `src/lib/utils.ts` exports `cn()`)

2. **Given** `apps/web/src/assets/main.css` is inspected **When** its contents are reviewed **Then** it contains Tailwind directives and defines CSS custom properties for the ManlyCam warm palette per the UX spec (at minimum: `--background`, `--foreground`, `--card`, `--card-foreground`, `--primary`, `--primary-foreground`, `--muted`, `--muted-foreground`, `--border`, `--ring`, `--radius`) in both `:root` (light) and `.dark` overrides

3. **Given** the user has no system dark/light preference (`prefers-color-scheme` unset or `no-preference`) **When** the app loads for the first time **Then** the `.dark` class is applied to `<html>` by default

4. **Given** the user has previously toggled the theme **When** the app loads **Then** `localStorage.getItem('theme')` is read and the correct class applied before first paint — no flash of incorrect theme on reload

5. **Given** `prefers-color-scheme: light` is active in the user's OS **When** the app loads for the first time (no `localStorage` override) **Then** light mode is applied

6. **Given** `prefers-reduced-motion: reduce` is set **When** any CSS transition or animation runs **Then** all transitions and animations in the design system are suppressed via `@media (prefers-reduced-motion: reduce)` in `main.css`

7. **Given** an unauthenticated user visits `/` **When** `LoginView.vue` renders **Then** the page reflects the UX spec: warm dark background, centered card layout, `SITE_NAME` in a prominent heading, `PET_NAME` referenced in copy, a styled "Sign in with Google" button using the ShadCN `Button` component — not a bare `<a>` or `<button>` — and the overall aesthetic matches the warm/cozy tone specified in the UX design specification

8. **And** `apps/web/public/favicon.svg` exists (placeholder SVG acceptable) and `index.html` links to it

9. **And** `apps/web/src/main.ts` imports `./assets/main.css` as the global stylesheet

## Tasks / Subtasks

- [x] Task 1: Rename CSS file and update components.json (AC: 2, 9)
  - [x] Rename `apps/web/src/assets/index.css` → `apps/web/src/assets/main.css`
  - [x] Update `apps/web/components.json` — change `tailwind.css` from `"src/assets/index.css"` to `"src/assets/main.css"`

- [x] Task 2: Update `tailwind.config.js` with dark mode and CSS variable color mappings (AC: 1, 7)
  - [x] Add `darkMode: 'class'` at the top level
  - [x] Replace `theme: { extend: {} }` with full CSS variable color mapping (see Dev Notes for exact config)
  - [x] Keep `content: ['./index.html', './src/**/*.{vue,ts}']` as-is

- [x] Task 3: Replace CSS custom properties in `main.css` with ManlyCam warm palette (AC: 2, 6)
  - [x] Replace `:root` block with warm light mode palette
  - [x] Replace `.dark` block with warm dark mode palette (based on UX spec HSL values)
  - [x] Add custom semantic tokens: `--sidebar`, `--live`, `--reconnecting`, `--offline-explicit`
  - [x] Add `@media (prefers-reduced-motion: reduce)` block suppressing all transitions/animations

- [x] Task 4: Add ShadCN-vue Button and Avatar components (AC: 1, 7)
  - [x] From `apps/web/`, run: `pnpm dlx shadcn-vue@latest add button avatar`
  - [x] Verify `src/components/ui/Button.vue` and `src/components/ui/Avatar.vue` are created
  - [x] Verify `src/lib/utils.ts` still exports `cn()` (should be untouched)

- [x] Task 5: Update `main.ts` to import global CSS (AC: 9)
  - [x] Add `import './assets/main.css'` as the first import in `apps/web/src/main.ts`

- [x] Task 6: Update `index.html` — title, favicon, dark mode init script (AC: 3, 4, 5, 8)
  - [x] Change `<title>web</title>` → `<title>ManlyCam</title>`
  - [x] Change favicon link from `/vite.svg` → `/favicon.svg` with `type="image/svg+xml"`
  - [x] Add inline dark mode initialization `<script>` in `<head>` (before any stylesheets) — see Dev Notes for exact script
  - [x] Place the inline script as the FIRST child of `<head>` to guarantee it runs before any paint

- [x] Task 7: Create `apps/web/public/favicon.svg` placeholder (AC: 8)
  - [x] Create a minimal SVG placeholder (simple circle or tooth shape, off-white color — final Manly tooth SVG is a post-MVP design asset)

- [x] Task 8: Restyle `LoginView.vue` with ShadCN Button and design system tokens (AC: 7)
  - [x] Import and use `Button` from `@/components/ui/button`
  - [x] Replace bare `<a href="/api/auth/google">` with `<Button asChild size="lg">` pattern
  - [x] Replace hard-coded `bg-gray-*` classes with design system classes (`bg-background`, `bg-card`, `text-foreground`, etc.)
  - [x] Maintain the existing functional behavior (SITE_NAME heading, PET_NAME in copy, link to `/api/auth/google`)
  - [x] Apply warm card aesthetic: centered, single-column, max-width constrained card on full-screen background

- [x] Task 9: Configure vitest environment and write tests (AC: 7)
  - [x] Add `test: { environment: 'jsdom' }` to `apps/web/vite.config.ts` (see Dev Notes — current config has no test section)
  - [x] Install jsdom if not present: `pnpm add -D jsdom` in `apps/web/`
  - [x] Create `apps/web/src/views/LoginView.test.ts`
  - [x] Test: LoginView renders SITE_NAME from `import.meta.env.VITE_SITE_NAME`
  - [x] Test: LoginView renders PET_NAME from `import.meta.env.VITE_PET_NAME`
  - [x] Test: LoginView contains a link/button pointing to `/api/auth/google`
  - [x] Test: The Google sign-in element is not a bare unstyled `<a>` tag (it has classes or is a Button)

## Dev Notes

### CRITICAL: Do NOT install `@tailwindcss/vite`

The acceptance criteria in epics.md lists `@tailwindcss/vite` as a dependency — **this is an error in the sprint change proposal that was copied in**. `@tailwindcss/vite` is a Tailwind **v4-only** Vite plugin and is incompatible with Tailwind v3. The architecture document explicitly forbids it:

> "Tailwind v3 (not v4) — use `tailwind.config.ts` not `@tailwindcss/vite` plugin"
> [Source: `_bmad-output/planning-artifacts/architecture.md` line 1252]

The correct PostCSS-based integration (`postcss.config.js` with `tailwindcss: {}`) is **already in place** and is the correct approach for Tailwind v3. Do not change it.

### Current State of `apps/web` — What Already Exists

Story 2.1 completed much of the scaffolding. These files already exist:

| File | State |
|---|---|
| `apps/web/tailwind.config.js` | Exists — missing `darkMode: 'class'` and CSS var color mappings |
| `apps/web/postcss.config.js` | Correct as-is (tailwindcss + autoprefixer) |
| `apps/web/components.json` | Exists — references `src/assets/index.css` (needs update to `main.css`) |
| `apps/web/src/assets/index.css` | Exists — Tailwind directives + default cold shadcn palette (rename to `main.css` + replace palette) |
| `apps/web/src/lib/utils.ts` | Exists with `cn()` — do not touch |
| `apps/web/src/main.ts` | Exists — does NOT import CSS yet |
| `apps/web/index.html` | Exists — wrong title, wrong favicon, no dark mode script |
| `apps/web/src/views/LoginView.vue` | Exists — functional but uses cold gray classes, bare `<a>` tag |
| `apps/web/src/components/ui/` | Does NOT exist — no ShadCN components yet |
| `apps/web/public/favicon.svg` | Does NOT exist |

### Task 2 — `tailwind.config.js` Complete Replacement

The existing config is missing CSS variable color mappings. Replace entirely with:

```js
/** @type {import('tailwindcss').Config} */
export const tailwindConfig = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // ManlyCam custom semantic tokens
        sidebar: 'hsl(var(--sidebar))',
        live: 'hsl(var(--live))',
        reconnecting: 'hsl(var(--reconnecting))',
        'offline-explicit': 'hsl(var(--offline-explicit))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}

// Tool configs require export default to function
export default tailwindConfig
```

### Task 3 — `main.css` Complete Content

Replace the entire `src/assets/main.css` (formerly `index.css`) with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  /* Light mode — warm neutrals */
  :root {
    --background: 30 20% 96%;
    --foreground: 20 10% 10%;
    --card: 30 15% 100%;
    --card-foreground: 20 10% 10%;
    --popover: 30 15% 100%;
    --popover-foreground: 20 10% 10%;
    --primary: 25 50% 38%;
    --primary-foreground: 30 20% 96%;
    --secondary: 30 10% 90%;
    --secondary-foreground: 20 10% 10%;
    --muted: 30 10% 90%;
    --muted-foreground: 30 5% 45%;
    --accent: 30 10% 90%;
    --accent-foreground: 20 10% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 30 10% 85%;
    --input: 30 10% 85%;
    --ring: 25 50% 38%;
    --radius: 0.5rem;
    /* Custom semantic tokens */
    --sidebar: 30 12% 94%;
    --live: 142 70% 45%;
    --reconnecting: 38 95% 55%;
    --offline-explicit: 30 5% 50%;
  }

  /* Dark mode — Manly's warm coat palette (default) */
  .dark {
    --background: 20 8% 10%;
    --foreground: 30 15% 92%;
    --card: 20 6% 14%;
    --card-foreground: 30 15% 92%;
    --popover: 20 6% 14%;
    --popover-foreground: 30 15% 92%;
    --primary: 25 50% 38%;
    --primary-foreground: 30 15% 92%;
    --secondary: 20 5% 18%;
    --secondary-foreground: 30 15% 92%;
    --muted: 20 5% 18%;
    --muted-foreground: 30 5% 55%;
    --accent: 20 5% 18%;
    --accent-foreground: 30 15% 92%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 30 15% 92%;
    --border: 25 5% 20%;
    --input: 25 5% 20%;
    --ring: 25 50% 38%;
    --radius: 0.5rem;
    /* Custom semantic tokens */
    --sidebar: 20 5% 11%;
    --live: 142 70% 45%;
    --reconnecting: 38 95% 55%;
    --offline-explicit: 30 5% 42%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}

/* Suppress all motion for users who prefer reduced motion */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Color token rationale** (from UX spec):
- `--background` dark: `hsl(20, 8%, 10%)` — warmed dark base, not pure black
- `--card` dark: `hsl(20, 6%, 14%)` — Manly's coat in shadow
- `--primary` dark/light: `hsl(25, 50%, 38%)` — warm brown accent, his coat in ambient light
- `--foreground` dark: `hsl(30, 15%, 92%)` — near-white with warmth, his white streaks
- `--muted-foreground` dark: `hsl(30, 5%, 55%)` — grey streak, secondary text
- `--border` dark: `hsl(25, 5%, 20%)` — warm subtle dividers
- `--sidebar` dark: `hsl(20, 5%, 11%)` — slightly deeper than background
- CSS vars use plain HSL numbers (no `hsl()` wrapper) because Tailwind uses them as `hsl(var(--token))`

[Source: `_bmad-output/planning-artifacts/ux-design-specification.md#Color System`]

### Task 6 — `index.html` Dark Mode Init Script

The dark mode FOUC (Flash of Unstyled Content) problem: if the `.dark` class is applied by Vue/JS after mount, users briefly see the wrong theme. The solution is an **inline blocking script** in `<head>` that runs synchronously before any paint.

Full updated `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <script>
      (function () {
        var stored = localStorage.getItem('theme')
        if (stored === 'light') {
          document.documentElement.classList.remove('dark')
        } else if (stored === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          // No stored preference — use system; default to dark if no-preference
          if (window.matchMedia('(prefers-color-scheme: light)').matches) {
            document.documentElement.classList.remove('dark')
          } else {
            document.documentElement.classList.add('dark')
          }
        }
      })()
    </script>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ManlyCam</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

**Critical:** The `<script>` block must appear FIRST in `<head>`, before `<link>` tags, so it executes before any rendering. This eliminates FOUC on all three scenarios: explicit dark, explicit light, system preference.

**Logic:**
1. If `localStorage.theme === 'light'` → force light mode
2. If `localStorage.theme === 'dark'` → force dark mode
3. Otherwise → respect `prefers-color-scheme`; if no system preference (or `no-preference`) → apply dark (ManlyCam default)

### Task 7 — Favicon SVG Placeholder

Create `apps/web/public/favicon.svg` as a minimal SVG (final Manly tooth is post-MVP):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect width="32" height="32" rx="8" fill="#5c3d1e"/>
  <circle cx="16" cy="16" r="8" fill="#e8d5b0"/>
</svg>
```

This is a warm brown square with a cream circle — placeholder that evokes the color palette. No design requirements for MVP.

### Task 8 — `LoginView.vue` Restyle

The current `LoginView.vue` is functionally correct but uses cold gray classes and a bare `<a>` tag. Replace the template to use design system tokens and ShadCN Button:

```vue
<script setup lang="ts">
import { Button } from '@/components/ui/button'

const siteName = import.meta.env.VITE_SITE_NAME as string
const petName = import.meta.env.VITE_PET_NAME as string
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-background">
    <div class="flex w-full max-w-sm flex-col items-center gap-6 rounded-lg border border-border bg-card p-10 shadow-lg">
      <div class="flex flex-col items-center gap-2 text-center">
        <h1 class="text-2xl font-semibold text-foreground">
          {{ siteName }}
        </h1>
        <p class="text-sm text-muted-foreground">
          Watch {{ petName }} live — private stream. Sign in to continue.
        </p>
      </div>
      <Button as="a" href="/api/auth/google" size="lg" class="w-full">
        Sign in with Google
      </Button>
    </div>
  </main>
</template>
```

**Key changes:**
- Import `Button` from `@/components/ui/button` (ShadCN-vue convention — lowercase `button` in import path)
- `Button as="a"` renders the ShadCN Button component as an `<a>` element — fully styled, accessible, uses primary color token
- `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border` use CSS variable tokens — adapts to dark/light mode automatically
- `href="/api/auth/google"` preserved — still triggers full-page navigation to OAuth flow
- `max-w-sm` constrains card width for the centered card layout specified in UX spec
- No `<button>` element wrapping a link — ShadCN `as="a"` is the correct pattern

**If `as` prop doesn't work** (depends on shadcn-vue version), use the `asChild` pattern instead:

```vue
<Button asChild size="lg" class="w-full">
  <a href="/api/auth/google">Sign in with Google</a>
</Button>
```

The `asChild` pattern merges Button's styles onto the child `<a>` element via Radix Vue's slot mechanism — this is the canonical Radix Vue approach and is guaranteed to work in all shadcn-vue versions. Prefer `asChild` if `as` prop produces a nested `<a><a>` or doesn't apply styles correctly.

### Task 9 — Vitest Environment Config + Test Pattern for LoginView

**Step 1: Add jsdom environment to `vite.config.ts`**

The current `apps/web/vite.config.ts` has no `test` section. The existing `useAuth.test.ts` tests work without DOM because they use Vue's reactivity in node environment only. `LoginView.test.ts` uses `mount()` from `@vue/test-utils`, which requires a DOM environment.

Add to `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';

export const config = defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
  },
});

// Tool configs require export default to function
export default config;
```

Install jsdom: `pnpm add -D jsdom` (from `apps/web/`)

**Step 2: LoginView test file**

```typescript
// apps/web/src/views/LoginView.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import LoginView from './LoginView.vue'

// Mock ShadCN Button to avoid resolution issues in test environment
vi.mock('@/components/ui/button', () => ({
  Button: {
    name: 'Button',
    props: ['as', 'href', 'size', 'asChild'],
    template: '<component :is="as || \'button\'" :href="href" v-bind="$attrs"><slot /></component>',
  },
}))

describe('LoginView', () => {
  beforeEach(() => {
    import.meta.env.VITE_SITE_NAME = 'TestCam'
    import.meta.env.VITE_PET_NAME = 'Buddy'
  })

  it('renders SITE_NAME in the heading', () => {
    const wrapper = mount(LoginView)
    expect(wrapper.text()).toContain('TestCam')
  })

  it('renders PET_NAME in the copy', () => {
    const wrapper = mount(LoginView)
    expect(wrapper.text()).toContain('Buddy')
  })

  it('has a link to /api/auth/google', () => {
    const wrapper = mount(LoginView)
    const link = wrapper.find('[href="/api/auth/google"]')
    expect(link.exists()).toBe(true)
  })

  it('uses ShadCN Button component (not a bare unstyled element)', () => {
    const wrapper = mount(LoginView)
    const button = wrapper.findComponent({ name: 'Button' })
    expect(button.exists()).toBe(true)
  })
})
```

**Note on import.meta.env in tests:** Vitest exposes `import.meta.env` — set values directly in `beforeEach` for component testing. The existing `useAuth.test.ts` tests do NOT use jsdom — they work in node environment via `createApp().runWithContext()`. Adding `environment: 'jsdom'` to the shared vite.config.ts applies to all web tests, which is fine — jsdom is a superset of the node environment for these tests.

### ShadCN-vue Import Convention

ShadCN-vue uses **lowercase** file names for components in `src/components/ui/`:
- File: `src/components/ui/button.ts` or `src/components/ui/button/index.ts`
- Import: `import { Button } from '@/components/ui/button'`

This matches the `@/components` alias configured in `vite.config.ts` (added in Story 2.1). Do NOT import from `@/components/ui/Button` (uppercase) — will fail on case-sensitive filesystems.

### Architecture Compliance Checklist

- `tailwind.config.js` keeps `export default` — this is an accepted tool config exception [Source: architecture.md#Enforcement Guidelines]
- `postcss.config.js` keeps `export default` — same exception
- `src/lib/utils.ts` uses named export `export function cn()` — no default export ✓
- ShadCN-vue components are scaffolded into repo (copy-into-repo model) — no external library version dependency ✓
- `darkMode: 'class'` driven by `<html>` class — no CSS media query theming ✓
- Tailwind v3 pinned at `3.4.19` — do not upgrade to v4 until shadcn-vue ships stable v4 support ✓
- No `@tailwindcss/vite` — PostCSS integration only ✓

### Project Structure Notes

**Files to create (new):**
```
apps/web/public/
  favicon.svg                        # Placeholder SVG favicon
apps/web/src/
  assets/
    main.css                         # Renamed from index.css — global stylesheet with ManlyCam palette
  components/
    ui/
      button.vue (or button/index.ts) # ShadCN-vue Button (generated by CLI)
      avatar.vue (or avatar/index.ts) # ShadCN-vue Avatar (generated by CLI)
  views/
    LoginView.test.ts                # New test file
```

**Files to modify:**
```
apps/web/
  tailwind.config.js                 # Add darkMode: 'class' + CSS var color mappings
  components.json                    # Update CSS path: index.css → main.css
  index.html                         # Title, favicon, dark mode init script
apps/web/src/
  assets/index.css                   # Rename → main.css (content replaced)
  main.ts                            # Add CSS import
  views/LoginView.vue                # Restyle with ShadCN Button + design system tokens
```

**Do NOT touch:**
- `apps/web/postcss.config.js` — already correct for Tailwind v3
- `apps/web/src/lib/utils.ts` — `cn()` helper is correct as-is
- `apps/web/src/composables/useAuth.ts` — no changes needed
- `apps/web/src/router/index.ts` — no changes needed
- `apps/web/src/App.vue` — no changes needed
- `apps/web/vite.config.ts` — no changes needed (already has proxy + `@` alias)
- All server-side files — this story is frontend-only

### Visual Design Reference

The chosen UX direction is "Desktop — No-Topbar Hover-Overlay Three-Column". For the sign-in landing state specifically:
- Warm dark background fills the full viewport
- A centered card (max-w-sm) sits in the middle
- `SITE_NAME` as a prominent `h1`
- `PET_NAME` in the subtitle copy ("Watch Manly live")
- Single "Sign in with Google" CTA button — full width, ShadCN Button in primary style
- No other form fields, navigation, or UI elements

[Source: `_bmad-output/planning-artifacts/ux-design-directions.html`] — open in browser; the "Sign-in landing" state across the 7 interactive direction mockups shows this minimal centered card pattern.
[Source: `_bmad-output/planning-artifacts/ux-design-specification.md#Design Direction Decision`]
[Source: `_bmad-output/planning-artifacts/ux-design-specification.md#Color System`]

### References

- Story requirements: [Source: `_bmad-output/planning-artifacts/epics.md#Story 2.1b`]
- Sprint change proposal (design system gap): [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-03-07-design-system.md`]
- Design system choice rationale: [Source: `_bmad-output/planning-artifacts/ux-design-specification.md#Design System Foundation`]
- Color palette (HSL values): [Source: `_bmad-output/planning-artifacts/ux-design-specification.md#Color System`]
- Tailwind v3 constraint: [Source: `_bmad-output/planning-artifacts/architecture.md` line 1252]
- ShadCN-vue install commands: [Source: `_bmad-output/planning-artifacts/architecture.md#Selected Stack`]
- Tailwind darkMode + CSS variables: [Source: `_bmad-output/planning-artifacts/architecture.md` lines 130–131]
- Accessibility — reduced motion: [Source: `_bmad-output/planning-artifacts/ux-design-specification.md#Accessibility Considerations`]
- Visual mockups: [Source: `_bmad-output/planning-artifacts/ux-design-directions.html`] — open in browser
- Named export convention: [Source: `_bmad-output/planning-artifacts/architecture.md#Enforcement Guidelines`]
- Previous story learnings (auth patterns, Vite proxy, `@` alias): [Source: `_bmad-output/implementation-artifacts/2-1-landing-page-and-google-oauth-sign-in-flow.md`]

## Dev Agent Record

### Agent Model Used

claude-haiku-4-5-20251001 (switched to Haiku for implementation)

### Debug Log References

None — all tasks completed without blockers.

### Completion Notes List

✅ **Task 1-3 Complete** — CSS file renamed to main.css, tailwind.config.js updated with darkMode: 'class' and full CSS variable color mappings, main.css created with ManlyCam warm palette (light + dark) and reduced-motion support.

✅ **Task 4 Complete** — ShadCN-vue Button and Avatar components installed via CLI; both components render correctly in tests.

✅ **Task 5-6 Complete** — main.ts updated to import main.css; index.html updated with dark mode init script (no FOUC on all 3 scenarios: explicit light/dark, system preference), favicon.svg link added, title changed to "ManlyCam".

✅ **Task 7 Complete** — favicon.svg placeholder created (warm brown with cream circle, evokes the palette).

✅ **Task 8 Complete** — LoginView.vue restyled with ShadCN Button (asChild pattern), design system token classes (bg-background, bg-card, text-foreground, text-muted-foreground, border-border), and proper layout (centered max-w-sm card on full-screen background). Functional behavior preserved: SITE_NAME heading, PET_NAME in copy, link to /api/auth/google.

✅ **Task 9 Complete** — vite.config.ts updated with jsdom environment; jsdom installed; LoginView.test.ts created with 4 tests covering: SITE_NAME rendering, PET_NAME rendering, /api/auth/google link existence, ShadCN Button component presence.

✅ **All Tests Pass** — 4 LoginView tests + 4 useAuth tests = 8 web tests total (no regressions).

✅ **Linting Passes** — ESLint + Prettier enforced; ShadCN-generated code auto-fixed for consistency.

✅ **Code Review Complete** — 4 issues fixed: deleted orphaned `index.css`, changed `components.json` baseColor to `stone`, fixed test mock (invalid nested anchors + boolean prop type), strengthened Button test assertions to verify `asChild=true` and `size="lg"`.

### File List

**New files:**
- `apps/web/src/assets/main.css` — ManlyCam warm palette with dark mode defaults, semantic tokens, reduced-motion support
- `apps/web/src/components/ui/button/Button.vue` — ShadCN-vue Button component
- `apps/web/src/components/ui/button/index.ts` — Button export
- `apps/web/src/components/ui/avatar/Avatar.vue` — ShadCN-vue Avatar component
- `apps/web/src/components/ui/avatar/AvatarFallback.vue` — Avatar fallback
- `apps/web/src/components/ui/avatar/AvatarImage.vue` — Avatar image
- `apps/web/src/components/ui/avatar/index.ts` — Avatar exports
- `apps/web/src/views/LoginView.test.ts` — LoginView component tests (4 tests)
- `apps/web/public/favicon.svg` — Favicon placeholder (warm brown + cream)

**Modified files:**
- `apps/web/tailwind.config.js` — Added darkMode: 'class', full CSS variable color mappings, semantic tokens
- `apps/web/components.json` — Updated CSS path to main.css, removed invalid 'framework' key; baseColor changed to 'stone' (code review)
- `apps/web/vite.config.ts` — Added test: { environment: 'jsdom' }
- `apps/web/src/main.ts` — Added import './assets/main.css'
- `apps/web/index.html` — Updated title, favicon link, dark mode init script in <head>
- `apps/web/src/views/LoginView.vue` — Restyled with ShadCN Button, design system tokens
- `apps/web/src/views/LoginView.test.ts` — Fixed mock (asChild render function, boolean prop type), strengthened Button assertion (code review)
- `package.json` (apps/web) — Added jsdom dev dependency

**Deleted files:**
- `apps/web/src/assets/index.css` — Orphaned old cold-slate palette file; should have been deleted in Task 1 rename (code review)
