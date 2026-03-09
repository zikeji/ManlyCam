# Story 4.4: Unread Badge, Sidebar Collapse/Expand, and State Persistence

Status: review

## Story

As a **viewer**,
I want the chat sidebar to auto-collapse on small screens and show an unread count when collapsed,
so that I never miss a message even when the sidebar is out of view.

## Acceptance Criteria

1. **Desktop default — expanded**
   - When the app loads on a desktop viewport (`≥ lg`, 1024px) with no stored preference, the right chat sidebar is expanded by default

2. **Mobile portrait — persistent bottom chat (no collapse)**
   - On mobile portrait (`< 768px + portrait orientation`), the chat renders as a persistent full-width section below the stream — it is not gated by `chatSidebarOpen` and has no collapse toggle
   - This is the UX spec's "persistent bottom chat bar" (line 449–454)

3. **Mobile landscape + tablet — collapsible sidebar, collapsed by default**
   - On mobile landscape (`< 768px + landscape`) and tablet (`768–1023px`), the chat sidebar is collapsible — same mechanism as desktop
   - When the app loads with no stored preference in a non-portrait context (`< lg`), the sidebar is collapsed by default
   - The `←|` toggle button is visible in the stream overlay on these viewports (not portrait-only)

4. **State persistence — no layout flash**
   - When the user has previously collapsed or expanded the sidebar, returning to the page restores the state from `localStorage` before first paint
   - Key: `manlycam:chat-sidebar-open`, value: `'true'` or `'false'`

5. **Unread count increments when collapsed**
   - When the chat sidebar is collapsed and a new `chat:message` WS event arrives, the unread count increments by 1
   - The `<SidebarCollapseButton>` badge remains visible through the non-hover state without requiring the user to hover the stream

6. **Unread count resets on expand**
   - When the user expands the chat sidebar, the unread count resets to zero and the badge disappears

7. **Collapse/expand animation**
   - When the user clicks the `|→` collapse button, the animation completes in 150ms, the sidebar disappears entirely (no persistent strip), the stream expands to fill the freed space, and the button becomes `←|` with any pending unread badge

8. **`aria-label` updates dynamically**
   - `"Collapse chat sidebar"` when sidebar is open
   - `"Expand chat sidebar"` when collapsed with no unread
   - `"Expand chat sidebar (N unread)"` when collapsed with unread messages

---

## Tasks / Subtasks

### Prerequisite — Install shadcn Badge component

- [x] Task 0 — Install `Badge` from shadcn-vue (AC: #5)
  - [x] Run from `apps/web/`: `pnpm dlx shadcn-vue@latest add badge`
  - [x] Verify `apps/web/src/components/ui/badge/` exists after install
  - [x] Badge component will be used in `SidebarCollapseButton.vue` for the unread notification dot

### Client — `useChat.ts` (module-level exports)

- [x] Task 1 — Add `unreadCount`, `resetUnread`, `incrementUnread` to module-level exports in `apps/web/src/composables/useChat.ts` (AC: #5, #6)
  - [x] Add `export const unreadCount = ref(0)` (module-level, alongside `messages`)
  - [x] Add `export const resetUnread = (): void => { unreadCount.value = 0 }`
  - [x] Add `export const incrementUnread = (): void => { unreadCount.value++ }`
  - [x] Do NOT modify the factory function return — these are standalone utilities
  - [x] Do NOT wire increment to `handleChatMessage` — unread tracking belongs in `WatchView.vue` (separation of concerns; `useChat` does not know sidebar state)

### Client — New `SidebarCollapseButton.vue`

- [x] Task 2 — Create `apps/web/src/components/stream/SidebarCollapseButton.vue` (AC: #7, #8)
  - [x] Props: `isOpen: boolean`, `unreadCount: number`
  - [x] Emits: `toggle: []`
  - [x] Renders `<Button variant="ghost" size="icon">` with:
    - `ChevronRight` icon when `isOpen === true` (collapse — pointing toward the sidebar to close it)
    - `ChevronLeft` icon when `isOpen === false` (expand — pointing away from where sidebar will appear)
  - [x] Badge: use `<Badge>` from `@/components/ui/badge` — rendered when `!isOpen && unreadCount > 0`
    - Position: `absolute -top-1.5 -right-1.5` on a `relative` wrapper div
    - Display: `unreadCount > 99 ? '99+' : unreadCount`
    - Style override: `h-4 min-w-4 px-1 text-[10px] border-2 border-black/60 pointer-events-none` to make it circular/compact
    - shadcn Badge's default `rounded-full` and `bg-primary` are correct for this use
  - [x] `aria-label` computed:
    - `isOpen` → `"Collapse chat sidebar"`
    - `!isOpen && unreadCount > 0` → `` `Expand chat sidebar (${unreadCount} unread)` ``
    - `!isOpen && unreadCount === 0` → `"Expand chat sidebar"`

### Client — `StreamPlayer.vue` (add chat sidebar props + toggle button)

- [x] Task 3 — Update `apps/web/src/components/stream/StreamPlayer.vue` to support chat sidebar toggle (AC: #5, #7)
  - [x] Add props: `chatSidebarOpen?: boolean`, `unreadCount?: number`, `showChatSidebarToggle?: boolean`
    - `showChatSidebarToggle` is passed as `!isMobilePortrait` from `WatchView` — true on desktop, tablet, and mobile landscape; false on mobile portrait
  - [x] Add emit: `toggleChatSidebar: []`
  - [x] Import `SidebarCollapseButton` from `@/components/stream/SidebarCollapseButton.vue`
  - [x] Add toggle button block at `top-4 right-4`, mirroring the admin toggle at `top-4 left-4`:
    ```html
    <!-- Chat sidebar toggle: top-right, visible on all but mobile portrait, hover-gated with badge exception -->
    <div
      v-if="showChatSidebarToggle"
      class="absolute top-4 right-4 transition-opacity duration-150 pointer-events-auto"
      :class="(overlayVisible(streamState, isHovered) || (unreadCount ?? 0) > 0) ? 'opacity-100' : 'opacity-0'"
    >
      <SidebarCollapseButton
        :is-open="chatSidebarOpen ?? true"
        :unread-count="unreadCount ?? 0"
        @toggle="emit('toggleChatSidebar')"
      />
    </div>
    ```
  - [x] Badge-persist: `(overlayVisible(...) || unreadCount > 0)` keeps the button visible when unread > 0 regardless of hover state — the gradient div does NOT get this exception (only the button persists in badge-persist state)

### Client — `WatchView.vue` (sidebar state, unread tracking, layout)

- [x] Task 4 — Update `apps/web/src/views/WatchView.vue` to manage chat sidebar state (AC: #1, #2, #3, #4, #5, #6)

  **New state and detection:**
  - [x] Import module-level exports from `useChat`: `messages, unreadCount, resetUnread, incrementUnread, isLoadingHistory`
  - [x] Add `chatSidebarOpen = ref(true)` (initial value overridden in `onMounted` before first paint)
  - [x] Add `isMobilePortrait = ref(false)` — tracks `(max-width: 767px) and (orientation: portrait)`

  **`onMounted` additions:**
  ```typescript
  // Mobile portrait detection
  if (typeof window.matchMedia === 'function') {
    const mqPortrait = window.matchMedia('(max-width: 767px) and (orientation: portrait)')
    isMobilePortrait.value = mqPortrait.matches
    mqPortrait.addEventListener('change', (e) => { isMobilePortrait.value = e.matches })
  }

  // Chat sidebar state — restored before first paint
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      const stored = localStorage.getItem('manlycam:chat-sidebar-open')
      if (stored !== null) {
        chatSidebarOpen.value = stored === 'true'
      } else {
        // Default: expanded on desktop only; collapsed on tablet/landscape/portrait
        chatSidebarOpen.value = isDesktop.value
      }
    }
  } catch { /* not available in test env */ }
  ```

  **Watchers:**
  ```typescript
  // Persist and reset unread on sidebar toggle
  watch(chatSidebarOpen, (open) => {
    if (open) resetUnread()
    try {
      if (typeof localStorage !== 'undefined' && localStorage) {
        localStorage.setItem('manlycam:chat-sidebar-open', open ? 'true' : 'false')
      }
    } catch { /* not available in test env */ }
  })

  // Increment unread for real-time messages only (not history loads)
  watch(messages, (newMessages, oldMessages) => {
    if (!chatSidebarOpen.value && !isLoadingHistory.value &&
        newMessages.length > (oldMessages?.length ?? 0)) {
      incrementUnread()
    }
  })
  ```

  **Handler:**
  ```typescript
  const handleToggleChatSidebar = () => { chatSidebarOpen.value = !chatSidebarOpen.value }
  ```

  **`StreamPlayer` props update:**
  ```html
  <StreamPlayer
    :streamState="streamState"
    :isAdmin="isAdmin"
    :adminPanelOpen="adminPanelOpen"
    :isDesktop="isDesktop"
    :chatSidebarOpen="chatSidebarOpen"
    :unreadCount="unreadCount"
    :showChatSidebarToggle="!isMobilePortrait"
    @open-camera-controls="handleOpenCameraControls"
    @toggle-admin-panel="handleToggleAdminPanel"
    @toggle-chat-sidebar="handleToggleChatSidebar"
  />
  ```

  **ChatPanel rendering — two branches:**
  ```html
  <!-- Mobile portrait: persistent bottom chat (no collapse, no transition) -->
  <ChatPanel
    v-if="isMobilePortrait"
    data-chat-panel
    class="flex-1 flex flex-col bg-[hsl(var(--sidebar))]"
    @open-camera-controls="handleOpenCameraControls"
  />

  <!-- Desktop + tablet + mobile landscape: collapsible sidebar -->
  <Transition v-else name="sidebar-right">
    <ChatPanel
      v-if="chatSidebarOpen"
      data-chat-panel
      class="lg:flex-none lg:w-[320px] flex flex-col bg-[hsl(var(--sidebar))] border-l border-[hsl(var(--border))]"
      @open-camera-controls="handleOpenCameraControls"
    />
  </Transition>
  ```

  **Layout class for `flex-row` on landscape/desktop:**
  - Update the outer container from `flex flex-col lg:flex-row` to `flex flex-col landscape:flex-row lg:flex-row`
  - This makes mobile landscape (`< 1024px` + landscape orientation) use `flex-row`, matching the two-column stream + sidebar layout
  - Tailwind's `landscape:` variant maps to `@media (orientation: landscape)` — it applies on desktop too, but `lg:flex-row` already covers desktop; the `landscape:` addition only meaningfully changes tablets and mobile landscape

  **Style additions:**
  ```css
  .sidebar-right-enter-active,
  .sidebar-right-leave-active {
    transition: margin-right 150ms ease-in-out;
  }
  .sidebar-right-enter-from,
  .sidebar-right-leave-to {
    margin-right: -320px;
  }
  ```

### Tests

- [x] Task 5 — Create `apps/web/src/components/stream/SidebarCollapseButton.test.ts` (new file) (AC: #8)
  - [x] Mock `@/components/ui/badge` alongside `@/components/ui/button`
  - [x] Renders `ChevronRight` when `isOpen=true`
  - [x] Renders `ChevronLeft` when `isOpen=false`
  - [x] Badge NOT rendered when `isOpen=true` (even if `unreadCount > 0`)
  - [x] Badge NOT rendered when `isOpen=false` and `unreadCount === 0`
  - [x] Badge IS rendered when `isOpen=false` and `unreadCount > 0`; text shows count
  - [x] Badge shows `99+` when `unreadCount > 99`
  - [x] `aria-label="Collapse chat sidebar"` when `isOpen=true`
  - [x] `aria-label="Expand chat sidebar"` when `isOpen=false`, `unreadCount=0`
  - [x] `aria-label="Expand chat sidebar (3 unread)"` when `isOpen=false`, `unreadCount=3`
  - [x] Emits `toggle` on button click

- [x] Task 6 — Update `apps/web/src/composables/useChat.test.ts` — ADD unread tests (AC: #5, #6)
  - [x] Import `unreadCount, resetUnread, incrementUnread` from `'@/composables/useChat'`
  - [x] Add `unreadCount.value = 0` to `beforeEach` reset (alongside existing `messages.value = []`)
  - [x] `unreadCount` starts at 0
  - [x] `incrementUnread()` increments by 1
  - [x] `incrementUnread()` called twice → `unreadCount.value === 2`
  - [x] `resetUnread()` sets to 0 after incrementing

- [x] Task 7 — Update `apps/web/src/views/WatchView.test.ts` — ADD chat sidebar tests (AC: #1, #3, #4)
  - [x] Update `useChat` mock: add `isLoadingHistory: ref(false)` to the factory mock; export-level imports (`unreadCount`, `resetUnread`, `incrementUnread`) need vi.fn() stubs or actual refs accessible from test
  - [x] Update `StreamPlayer` stub to include new props and emit
  - [x] Mock `matchMedia` to control `isDesktop` and `isMobilePortrait` independently per test
  - [x] Chat panel renders on desktop when `chatSidebarOpen = true`
  - [x] Chat panel NOT rendered when desktop + `chatSidebarOpen = false` (after toggle)
  - [x] Chat panel always rendered when `isMobilePortrait = true` (regardless of `chatSidebarOpen`)
  - [x] `localStorage.setItem('manlycam:chat-sidebar-open', ...)` called on toggle
  - [x] On mount with `localStorage = 'true'` → `chatSidebarOpen = true`; with `'false'` → `false`
  - [x] `resetUnread` called when sidebar toggles open

- [x] Task 8 — Update `apps/web/src/components/stream/StreamPlayer.test.ts` — ADD collapse button tests (AC: #5, #7)
  - [x] Stub `SidebarCollapseButton` in the StreamPlayer test mock setup
  - [x] `SidebarCollapseButton` rendered when `showChatSidebarToggle=true`
  - [x] `SidebarCollapseButton` NOT rendered when `showChatSidebarToggle=false`
  - [x] Collapse button div has `opacity-100` when `unreadCount > 0` (badge-persist, no hover needed)
  - [x] Emits `toggleChatSidebar` when `SidebarCollapseButton` emits `toggle`

---

## Dev Notes

### UX Spec Gaps — Requires Attention

> **⚠️ The following are gaps or ambiguities in the UX specification that emerged during story analysis. They are flagged for awareness — implementation decisions are provided as reasonable defaults.**

**Gap 1: Mobile landscape sidebar is "overlay" per spec, but implemented as flex sibling**
- UX spec (line 808): "Mobile landscape: `< 768px + landscape` | Stream fills width, right chat panel slides in **over** stream with `←|` toggle"
- The word "over" implies an overlay/drawer, not a flex sibling
- **Implementation decision:** For MVP, mobile landscape uses the same flex sibling pattern as desktop (stream + sidebar side by side). This avoids a separate overlay/positioning system and is functionally equivalent. The visual difference is that on mobile landscape, the stream narrows slightly when the sidebar is open (rather than the sidebar overlaying the stream)
- **Recommendation:** A future story can upgrade mobile landscape to a true overlay drawer (via `position: fixed` or `Sheet`) if the narrowed stream is a problem on small landscape screens

**Gap 2: Tablet (768–1023px) not addressed in original AC**
- The story AC defines behavior for `≥ lg` (1024px) and `< md` (768px) only
- **Implementation decision:** Tablet gets the collapsible sidebar (not the persistent bottom bar), defaulting to collapsed — consistent with UX spec line 809: "Tablet: right sidebar visible, left hidden"
- `showChatSidebarToggle = !isMobilePortrait` naturally includes tablet since tablet is never in portrait at `< 768px`

**Gap 3: `landscape:flex-row` Tailwind variant affects all landscape viewports**
- The `landscape:` Tailwind variant applies to `@media (orientation: landscape)` which includes desktop
- This doesn't break anything (desktop is already covered by `lg:flex-row`) but it means a desktop in portrait rotation would switch layout; this is an acceptable edge case

**Gap 4: HoverOverlay as a named component (spec vs. implementation)**
- UX spec (line 621) defines `<HoverOverlay />` as a distinct component with `<SidebarCollapseButton>` inside it
- Current implementation has all hover controls inline in `StreamPlayer.vue`
- **Implementation decision:** Continue the inline pattern for consistency with existing code; extract `HoverOverlay` in a future refactor story

**Gap 5: `|→` / `←|` text notation vs Lucide icons**
- UX spec uses text notation; HTML prototype renders them as literal text (`font-size: 10px; font-weight: 600; letter-spacing: -.05em`)
- Current admin toggle uses `ChevronLeft`/`ChevronRight` Lucide icons — this story follows the same pattern
- The `PanelRightClose`/`PanelRightOpen` Lucide icons are also available as a more explicit alternative if desired

---

### Architecture Constraints

**Module-level exports pattern** — `unreadCount`, `resetUnread`, `incrementUnread` must be exported at module level (not just returned from factory), following the established pattern from `messages`, `hasMore`, `isLoadingHistory`, `handleUserUpdate`. This allows `WatchView.vue` to import them directly and tests to reset them in `beforeEach`.

**localStorage guard pattern** — Always wrap in `try { if (typeof localStorage !== 'undefined' && localStorage) { ... } } catch { /* not available in test env */ }` — identical to the `manlycam:admin-panel-open` pattern at lines 26–31 and 48–52 of `WatchView.vue`.

**localStorage key**: `manlycam:chat-sidebar-open` (follows `manlycam:admin-panel-open` naming).

**Unread increment guard** — Check `!isLoadingHistory.value` when watching `messages` to avoid incrementing unread for history loads (scroll-up pagination). History loads prepend messages; real-time events append. The `isLoadingHistory` flag is the cleanest discriminator.

**Single ChatPanel instance** — The two-branch `v-if="isMobilePortrait"` / `v-else + Transition` approach means only ONE `ChatPanel` is ever mounted at a time, despite two template branches. This is correct — the branches are mutually exclusive based on orientation.

**Separation of concerns** — `useChat.ts` does NOT track sidebar state. `WatchView.vue` owns the increment decision (it owns `chatSidebarOpen`). This is the same principle as the module-level ref pattern established in Story 4-2.

---

### Reuse: Camera Controls Sidebar Pattern

The left sidebar (`adminPanelOpen`) in `WatchView.vue` is the direct template for `chatSidebarOpen`:

| Feature | Admin Panel (left) | Chat Sidebar (right) |
|---|---|---|
| State ref | `adminPanelOpen = ref(false)` | `chatSidebarOpen = ref(true)` |
| localStorage key | `manlycam:admin-panel-open` | `manlycam:chat-sidebar-open` |
| Default (no stored) | `false` | `isDesktop.value` |
| Transition name | `sidebar-left` | `sidebar-right` |
| Animation axis | `margin-left`, `-280px` | `margin-right`, `-320px` |
| Animation duration | `200ms / 250ms` | `150ms` (per story AC) |
| Toggle button location | `StreamPlayer` top-left overlay | `StreamPlayer` top-right overlay |
| Visibility condition | `v-if="isAdmin && adminPanelOpen && isDesktop"` | `v-if="chatSidebarOpen"` (in the non-portrait branch) |
| Prop for toggle button visibility | `isAdmin && isDesktop` (inline) | `showChatSidebarToggle = !isMobilePortrait` |
| Badge persistence | None | `(overlayVisible(...) || unreadCount > 0)` |

---

### Project Structure — Files to Modify / Create

```
apps/web/src/
  components/
    ui/
      badge/                        ← INSTALL: pnpm dlx shadcn-vue@latest add badge (from apps/web/)
    stream/
      SidebarCollapseButton.vue    ← CREATE: collapse/expand toggle + unread badge
      SidebarCollapseButton.test.ts ← CREATE: 10 tests
      StreamPlayer.vue              ← MODIFY: add props (chatSidebarOpen, unreadCount, showChatSidebarToggle),
                                               add toggleChatSidebar emit, add collapse button block
      StreamPlayer.test.ts          ← MODIFY: stub SidebarCollapseButton, add 4 tests

  composables/
    useChat.ts                      ← MODIFY: add unreadCount, resetUnread, incrementUnread (module-level)
    useChat.test.ts                 ← MODIFY: add 4 unread tests + beforeEach reset

  views/
    WatchView.vue                   ← MODIFY: isMobilePortrait ref, chatSidebarOpen state, localStorage,
                                               unread watch, two-branch ChatPanel rendering,
                                               layout class update, Transition + style
    WatchView.test.ts               ← MODIFY: update StreamPlayer stub, update useChat mock,
                                               add matchMedia mock, add ~6 chat sidebar tests
```

**No server-side changes required.**

---

### Component Implementations (Reference)

**`SidebarCollapseButton.vue`:**
```vue
<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{
  isOpen: boolean
  unreadCount: number
}>()

const emit = defineEmits<{ toggle: [] }>()

const ariaLabel = computed(() => {
  if (!props.isOpen && props.unreadCount > 0) {
    return `Expand chat sidebar (${props.unreadCount} unread)`
  }
  return props.isOpen ? 'Collapse chat sidebar' : 'Expand chat sidebar'
})
</script>

<template>
  <div class="relative">
    <Button
      variant="ghost"
      size="icon"
      class="rounded p-0 w-9 h-9 text-foreground hover:bg-accent"
      :aria-label="ariaLabel"
      @click="emit('toggle')"
    >
      <ChevronRight v-if="isOpen" class="w-4 h-4" />
      <ChevronLeft v-else class="w-4 h-4" />
    </Button>
    <Badge
      v-if="!isOpen && unreadCount > 0"
      class="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 text-[10px] border-2 border-black/60 pointer-events-none"
      aria-hidden="true"
    >
      {{ unreadCount > 99 ? '99+' : unreadCount }}
    </Badge>
  </div>
</template>
```

**`useChat.ts` additions (module level, before the factory):**
```typescript
export const unreadCount = ref(0)
export const resetUnread = (): void => { unreadCount.value = 0 }
export const incrementUnread = (): void => { unreadCount.value++ }
```

**`WatchView.vue` outer container class update:**
```html
<!-- Before -->
<div class="flex flex-col lg:flex-row h-screen w-full overflow-hidden bg-[hsl(var(--background))]">

<!-- After: adds landscape:flex-row for mobile landscape + tablet landscape -->
<div class="flex flex-col landscape:flex-row lg:flex-row h-screen w-full overflow-hidden bg-[hsl(var(--background))]">
```

**`WatchView.vue` ChatPanel rendering (replace current single `<ChatPanel>`):**
```html
<!-- Mobile portrait: persistent bottom chat, always visible -->
<ChatPanel
  v-if="isMobilePortrait"
  data-chat-panel
  class="flex-1 flex flex-col bg-[hsl(var(--sidebar))]"
  @open-camera-controls="handleOpenCameraControls"
/>

<!-- Desktop + tablet + mobile landscape: collapsible right sidebar -->
<Transition v-else name="sidebar-right">
  <ChatPanel
    v-if="chatSidebarOpen"
    data-chat-panel
    class="lg:flex-none lg:w-[320px] flex flex-col bg-[hsl(var(--sidebar))] border-l border-[hsl(var(--border))]"
    @open-camera-controls="handleOpenCameraControls"
  />
</Transition>
```

---

### Testing Approach

**`SidebarCollapseButton.test.ts`** — Mount with Vue Test Utils, mock both UI components:
```typescript
vi.mock('@/components/ui/button', () => ({
  Button: defineComponent({
    template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot/></button>',
  }),
}))
vi.mock('@/components/ui/badge', () => ({
  Badge: defineComponent({
    template: '<span v-bind="$attrs"><slot/></span>',
  }),
}))
```

**`WatchView.test.ts`** — Mock `matchMedia` to control both `isDesktop` and `isMobilePortrait`:
```typescript
let mockIsDesktop = true
let mockIsPortrait = false

Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query: string) => ({
    matches:
      query === '(min-width: 1024px)' ? mockIsDesktop :
      query === '(max-width: 767px) and (orientation: portrait)' ? mockIsPortrait :
      false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
  writable: true,
})
```

**Watch behavior in tests** — `watch(messages, ...)` requires `await nextTick()` after mutating `messages.value` to trigger the watcher callback.

**Module-level ref reset** — `useChat.test.ts` `beforeEach` must add `unreadCount.value = 0` alongside existing `messages.value = []`.

---

### Story 4-3 Learnings Applied

- **Module-level exports**: `unreadCount`, `resetUnread`, `incrementUnread` at module level — same pattern as `messages`, `hasMore`, `isLoadingHistory`, `handleUserUpdate`
- **Test isolation**: `afterEach(() => { wrapper?.unmount() })` in all new component tests
- **Module-level refs reset**: `beforeEach` resets `unreadCount.value = 0` in `useChat.test.ts`
- **Timezone-safe**: no date-dependent logic in this story

### Story 4-1 Lesson Applied
- `<Transition>` wraps the element — do not move layout classes to the `<Transition>` element itself

---

### References

- Story 4-4 epics definition: [Source: `_bmad-output/planning-artifacts/epics.md` §Story 4.4]
- Sidebar collapse UX layout table: [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` lines 440–446]
- Mobile landscape layout: [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` line 808]
- Mobile portrait layout: [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` lines 449–454]
- `<SidebarCollapseButton>` component spec: [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` §`<SidebarCollapseButton />` lines 679–686]
- `<HoverOverlay>` badge exception: [Source: `_bmad-output/planning-artifacts/ux-design-specification.md` §`<HoverOverlay />` lines 621–629]
- Collapse button HTML prototype: [Source: `_bmad-output/planning-artifacts/ux-design-directions.html` — `.icon-btn`, `.ib-badge` CSS; line 706 collapse; lines 817–822 expand+badge]
- Left sidebar animation + localStorage pattern: [Source: `apps/web/src/views/WatchView.vue`]
- Admin toggle button pattern: [Source: `apps/web/src/components/stream/StreamPlayer.vue` lines 110–126]
- Module-level export pattern: [Source: `apps/web/src/composables/useChat.ts`]
- Story 4-3 completion notes: [Source: `_bmad-output/implementation-artifacts/4-3-message-grouping-avatars-and-usertag-display.md`]

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Task 5 icons test: `findComponent({ name: 'ChevronRight' })` doesn't work with lucide-vue-next icons in JSDOM. Fix: mock `lucide-vue-next` with `data-icon` attributes on SVG elements.
- Task 7 mock hoisting: Module-level exports in `vi.mock` factory triggered "Cannot access before initialization" for refs even with `mock` prefix. Root cause: module-level imports (WatchView.vue `import { messages }`) evaluate the factory at load time, not call time. Fix: `vi.hoisted(() => { require('vue').ref(...) })` with `eslint-disable-next-line @typescript-eslint/no-require-imports`.
- Coverage drop: `apps/web/src/components/ui/badge/` files (generated shadcn components) at 0% coverage pulled global lines below 90% threshold. Fix: added `src/components/ui/**` to coverage `exclude` list (same pattern as other untested shadcn components like ScrollArea, Textarea).

### Completion Notes List

- All 8 tasks implemented with 240 tests passing (up from 214 in Story 4-3)
- `SidebarCollapseButton.vue`: new component with ChevronRight/Left icons, Badge overlay, aria-label computed — 100% line coverage, 10 tests
- `useChat.ts`: added `unreadCount`, `resetUnread`, `incrementUnread` module-level exports — 4 new tests
- `StreamPlayer.vue`: added `chatSidebarOpen`, `unreadCount`, `showChatSidebarToggle` props + `toggleChatSidebar` emit + collapse button block — 4 new tests
- `WatchView.vue`: full chat sidebar state management — `isMobilePortrait` detection, `chatSidebarOpen` with localStorage persistence, `watch(messages, ...)` for unread increment, two-branch ChatPanel rendering, `landscape:flex-row` layout, `sidebar-right` CSS transition — 8 new tests
- `apps/web/vite.config.ts`: added `src/components/ui/**` to coverage exclude (generated shadcn code)
- AC #2 (mobile portrait persistent chat) implemented via `v-if="isMobilePortrait"` branch
- AC #3 (mobile landscape/tablet collapsible) implemented via `landscape:flex-row` + `showChatSidebarToggle = !isMobilePortrait`
- AC #4 (state persistence) implemented with `manlycam:chat-sidebar-open` localStorage key
- AC #7 (150ms animation) implemented via `sidebar-right` CSS transition on `margin-right`

### File List

- `apps/web/src/components/ui/badge/Badge.vue` (created — shadcn-vue install)
- `apps/web/src/components/ui/badge/index.ts` (created — shadcn-vue install)
- `apps/web/src/components/stream/SidebarCollapseButton.vue` (created)
- `apps/web/src/components/stream/SidebarCollapseButton.test.ts` (created)
- `apps/web/src/composables/useChat.ts` (modified — added unreadCount, resetUnread, incrementUnread)
- `apps/web/src/composables/useChat.test.ts` (modified — added unread tests)
- `apps/web/src/components/stream/StreamPlayer.vue` (modified — added chat sidebar props/emit/button)
- `apps/web/src/components/stream/StreamPlayer.test.ts` (modified — added collapse button tests)
- `apps/web/src/views/WatchView.vue` (modified — chat sidebar state, layout, transitions)
- `apps/web/src/views/WatchView.test.ts` (modified — added chat sidebar tests)
- `apps/web/vite.config.ts` (modified — excluded src/components/ui/** from coverage)

## Change Log

- 2026-03-09: Story 4.4 implemented — chat sidebar collapse/expand with unread badge, localStorage persistence, mobile portrait persistent chat, mobile landscape/tablet layout, 150ms CSS transition animation. Added SidebarCollapseButton.vue, 240 tests passing.
