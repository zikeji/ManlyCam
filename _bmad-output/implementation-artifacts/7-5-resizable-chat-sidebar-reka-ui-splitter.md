# Story 7.5: Resizable Chat Sidebar via Reka-UI Splitter

Status: done

## Story

As a **desktop viewer**,
I want to resize the chat sidebar by dragging a handle between the stream and chat panel,
so that I can allocate screen real estate to suit my preference.

## Acceptance Criteria

1. **Given** a desktop user (`≥ 1024px`) views the watch page, **When** the page loads, **Then** the main column and right chat sidebar are wrapped in a `<SplitterGroup direction="horizontal" auto-save-id="manly-chat-sidebar">` layout, with the main column in the first `<SplitterPanel>` and the chat sidebar in the second `<SplitterPanel>`.

2. **Given** the chat sidebar `<SplitterPanel>` is configured, **When** the component renders, **Then** it has: `default-size="320"` (pixels), `min-size="240"` (pixels), `max-size="600"` (pixels), `collapsible`, and `collapsed-size="0"`.

3. **Given** a desktop user drags the `<SplitterResizeHandle>`, **When** the drag occurs, **Then** the chat sidebar width changes fluidly between 240px and 600px, and the main column expands/contracts to fill remaining space.

4. **Given** the `auto-save-id="manly-chat-sidebar"` is set on `<SplitterGroup>`, **When** the user resizes the sidebar, **Then** the width is automatically persisted to `localStorage` by Reka-UI and restored on the next page visit.

5. **Given** a user clicks the chat toggle in Broadcast Console, **When** the sidebar is expanded, **Then** `chatPanelRef.collapse()` is called on the SplitterPanel template ref. **When** the sidebar is collapsed, **Then** `chatPanelRef.expand()` is called.

6. **Given** the existing `chatSidebarOpen` boolean state in WatchView, **When** the splitter panel collapses/expands via the Console toggle, **Then** `chatSidebarOpen` is updated to match (`false` when collapsed, `true` when expanded).

7. **Given** the `<SplitterResizeHandle>` renders, **When** viewed, **Then** it displays as a subtle 1px vertical line with `cursor: col-resize`, and shows a subtle hover highlight effect.

8. **Given** a mobile user (`< 1024px`) views the watch page, **When** the page loads, **Then** the Splitter layout is NOT rendered — mobile portrait and landscape retain their existing fixed-width/overlay behavior unchanged.

9. **Given** a user navigates the splitter via keyboard, **When** focus is on the resize handle, **Then** arrow keys resize the panel and Home/End jump to min/max widths (Reka-UI provides this out of the box — no additional implementation needed).

10. **Given** the chat sidebar is collapsed via the Console toggle, **When** a new message arrives, **Then** the unread badge appears on the chat toggle button (existing behavior preserved).

## Tasks / Subtasks

- [x] Task 1: Import Reka-UI Splitter components (AC: #1)
  - [x] Subtask 1.1: Add imports to `WatchView.vue`: `SplitterGroup`, `SplitterPanel`, `SplitterResizeHandle` from `reka-ui`

- [x] Task 2: Refactor desktop layout to use Splitter (AC: #1, #2, #8)
  - [x] Subtask 2.1: Wrap `[main column + right chat panel]` in `<SplitterGroup direction="horizontal" auto-save-id="manly-chat-sidebar">` for desktop only (`v-if="isDesktop"`)
  - [x] Subtask 2.2: Create first `<SplitterPanel>` for main column (stream + console + void) — no size constraints needed (flexes to fill)
  - [x] Subtask 2.3: Create `<SplitterResizeHandle />` between panels
  - [x] Subtask 2.4: Create second `<SplitterPanel>` for chat sidebar with: `size-unit="px"`, `default-size="320"`, `min-size="240"`, `max-size="600"`, `collapsible`, `collapsed-size="0"`
  - [x] Subtask 2.5: Add template ref `chatPanelRef` to the chat sidebar SplitterPanel for programmatic collapse/expand
  - [x] Subtask 2.6: Move the existing `<Transition name="sidebar-right">` wrapper inside the chat SplitterPanel (animation still works on the inner ChatPanel)

- [x] Task 3: Wire Broadcast Console toggle to Splitter collapse/expand (AC: #5, #6)
  - [x] Subtask 3.1: Update `handleToggleChatSidebar` to call `chatPanelRef.value?.collapse()` when `chatSidebarOpen.value === true`
  - [x] Subtask 3.2: Update `handleToggleChatSidebar` to call `chatPanelRef.value?.expand()` when `chatSidebarOpen.value === false`
  - [x] Subtask 3.3: Add watcher on SplitterPanel collapse state to sync `chatSidebarOpen` boolean (listen to `@collapse` / `@expand` events or use computed)
  - [x] Subtask 3.4: Ensure unread count reset still works when expanding (`resetUnread()` called on expand)

- [x] Task 4: Style the SplitterResizeHandle (AC: #7)
  - [x] Subtask 4.1: Apply Tailwind classes: `w-px bg-[hsl(var(--border))] hover:bg-[hsl(var(--primary)/0.5)] cursor-col-resize transition-colors`
  - [x] Subtask 4.2: Ensure handle has sufficient hit area for mouse interaction (min 4px wide with transparent padding)

- [x] Task 5: Handle mobile layouts unchanged (AC: #8)
  - [x] Subtask 5.1: Add `v-if="isDesktop"` to the SplitterGroup wrapper
  - [x] Subtask 5.2: Keep existing mobile portrait and landscape layout branches outside the Splitter (no changes)
  - [x] Subtask 5.3: Verify tablet (`md` breakpoint, `768px–1023px`) uses non-Splitter layout

- [x] Task 6: Update tests (AC: All)
  - [x] Subtask 6.1: Update `WatchView.test.ts`: assert SplitterGroup renders on desktop (`lg:` breakpoint)
  - [x] Subtask 6.2: Update `WatchView.test.ts`: assert SplitterGroup does NOT render on mobile (`< 1024px`)
  - [x] Subtask 6.3: Update `WatchView.test.ts`: assert chat toggle calls `collapse()` / `expand()` on SplitterPanel ref
  - [x] Subtask 6.4: Update `WatchView.test.ts`: assert `auto-save-id="manly-chat-sidebar"` is present
  - [x] Subtask 6.5: Verify `afterEach` cleanup exists in test file

## Dev Notes

### Architecture and Patterns

- **Reka-UI Splitter:** `reka-ui` is already installed at `^2.9.0`. No new dependencies needed. Import directly: `import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'`.
- **auto-save-id persistence:** Reka-UI's `auto-save-id` prop automatically persists panel sizes to `localStorage` under the key `reka-ui-splitter:{auto-save-id}`. No manual localStorage code needed for width persistence.
- **Dual state model:** Keep both `chatSidebarOpen` (boolean for collapse/expand state) and splitter internal state (width). The boolean controls `collapse()` / `expand()` calls; the splitter remembers width. This matches the existing pattern where `chatSidebarOpen` is used for unread badge visibility and other UI logic.
- **Desktop-only:** Splitter is ONLY applied to the desktop layout (`≥ 1024px`). Mobile portrait and landscape retain their existing fixed-width and overlay behaviors.
- **Template ref for programmatic control:** Use `ref="chatPanelRef"` on the chat SplitterPanel to call `collapse()` / `expand()` methods from the Console toggle handler.

### Source Tree Components to Touch

**Files to modify:**

- `apps/web/src/views/WatchView.vue` — Wrap desktop layout in SplitterGroup, add template ref, update toggle handler
- `apps/web/src/views/WatchView.test.ts` — Add Splitter assertions

**Files NOT to touch:**

- `apps/web/src/components/stream/BroadcastConsole.vue` — No changes needed (toggle emit is unchanged)
- `apps/web/src/components/chat/ChatPanel.vue` — No changes needed
- `apps/web/src/composables/useChat.ts` — No changes needed
- All server files — No server changes in 7-5
- `packages/types` — No new types needed

### Reka-UI Splitter Component Props Reference

```typescript
// SplitterGroup
<SplitterGroup
  direction="horizontal"
  auto-save-id="manly-chat-sidebar"  // localStorage key prefix
>
  {/* panels and resize handles */}
</SplitterGroup>

// SplitterPanel (main column - flex to fill)
<SplitterPanel>
  {/* no size constraints - takes remaining space */}
</SplitterPanel>

// SplitterResizeHandle
<SplitterResizeHandle class="w-px bg-[hsl(var(--border))] hover:bg-[hsl(var(--primary)/0.5)] cursor-col-resize transition-colors" />

// SplitterPanel (chat sidebar - constrained)
<SplitterPanel
  ref="chatPanelRef"
  size-unit="px"
  :default-size="320"
  :min-size="240"
  :max-size="600"
  collapsible
  :collapsed-size="0"
  @collapse="chatSidebarOpen = false"
  @expand="chatSidebarOpen = true; resetUnread()"
>
  <ChatPanel ... />
</SplitterPanel>
```

### WatchView Layout Structure (After Changes)

```vue
<template>
  <div class="flex ...">
    <!-- Left sidebar: unchanged -->
    <aside v-if="isAdmin && adminPanelOpen && isDesktop">...</aside>

    <!-- DESKTOP: Splitter layout -->
    <SplitterGroup
      v-if="isDesktop"
      direction="horizontal"
      auto-save-id="manly-chat-sidebar"
      class="flex-1 min-w-0 flex"
    >
      <!-- Panel 1: Main column (stream + console + void) -->
      <SplitterPanel class="flex flex-col bg-black overflow-hidden relative">
        <div class="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden">
          <AtmosphericVoid ... />
          <StreamPlayer ... />
        </div>
        <BroadcastConsole ... />
      </SplitterPanel>

      <SplitterResizeHandle
        class="w-px bg-[hsl(var(--border))] hover:bg-[hsl(var(--primary)/0.5)] cursor-col-resize"
      />

      <!-- Panel 2: Chat sidebar -->
      <SplitterPanel
        ref="chatPanelRef"
        size-unit="px"
        :default-size="320"
        :min-size="240"
        :max-size="600"
        collapsible
        :collapsed-size="0"
        @collapse="handleSplitterCollapse"
        @expand="handleSplitterExpand"
        class="shrink-0 flex flex-col bg-[hsl(var(--sidebar))] border-l border-[hsl(var(--border))]"
      >
        <ChatPanel ... />
      </SplitterPanel>
    </SplitterGroup>

    <!-- NON-DESKTOP: Existing layouts unchanged -->
    <main v-if="!isDesktop" class="flex-1 min-w-0 flex flex-col bg-black overflow-hidden relative">
      <!-- existing mobile portrait/landscape structure -->
    </main>

    <!-- Mobile Sheet for admin: unchanged -->
    <Sheet v-if="isAdmin" v-model:open="mobileSheetOpen">...</Sheet>
  </div>
</template>
```

### Handler Updates

```typescript
const chatPanelRef = ref<InstanceType<typeof SplitterPanel> | null>(null);

const handleToggleChatSidebar = () => {
  if (isDesktop.value && chatPanelRef.value) {
    if (chatSidebarOpen.value) {
      chatPanelRef.value.collapse();
    } else {
      chatPanelRef.value.expand();
    }
  } else {
    chatSidebarOpen.value = !chatSidebarOpen.value;
  }
};

const handleSplitterCollapse = () => {
  chatSidebarOpen.value = false;
};

const handleSplitterExpand = () => {
  chatSidebarOpen.value = true;
  resetUnread();
};
```

### Testing Standards Summary

- **Component tests:** Follow existing patterns from `WatchView.test.ts`. Test Splitter presence/absence by breakpoint.
- **Mock Reka-UI refs:** For testing `collapse()` / `expand()` calls, mock the template ref with vi.fn() methods.
- **afterEach cleanup:** Always include `afterEach(() => { wrapper?.unmount(); wrapper = null; })` to prevent test isolation issues (Epic 4 lesson).
- **No unit tests for Reka-UI itself:** The library is externally maintained; test our integration, not the library.

### Project Structure Notes

- **Named exports only:** Import directly from `reka-ui` — no `export default` used.
- **Desktop-only feature:** Splitter is conditionally rendered via `v-if="isDesktop"`. Mobile code paths are completely unchanged.
- **localStorage reconciliation:** The existing `manlycam:chat-sidebar-open` key (boolean) continues to work alongside Reka-UI's `reka-ui-splitter:manly-chat-sidebar` key (sizes array). Both are read/written independently.

### Previous Story Context

From story 7-1 (UX Shell Redesign):

- `BroadcastConsole.vue` emits `toggle-chat-sidebar` event
- `WatchView.vue` handles `handleToggleChatSidebar()` which toggles `chatSidebarOpen` ref
- `chatSidebarOpen` is persisted to localStorage and synced with unread count reset
- Desktop layout: left sidebar ↔ main column ↔ right sidebar

From story 7-3 (Camera Snapshot):

- `streamVideoRef` pattern established via `defineExpose` in StreamPlayer
- Component testing patterns in `WatchView.test.ts`

From story 7-4 (PiSugar Battery Monitor):

- Module-level singleton pattern for composables
- `afterEach` cleanup critical for test isolation

### Reka-UI Splitter Events

The SplitterPanel emits:

- `@collapse` — fired when panel collapses to `collapsed-size`
- `@expand` — fired when panel expands from collapsed state

Use these events to sync `chatSidebarOpen` state rather than relying solely on the toggle handler.

### Keyboard Accessibility (Built-in)

Reka-UI Splitter provides keyboard navigation out of the box:

- **Arrow Left/Right:** Resize panel by 10px increments
- **Home:** Jump to minimum size
- **End:** Jump to maximum size
- **Enter/Space:** Toggle collapse/expand (if collapsible)

No additional a11y work is required beyond ensuring the resize handle is focusable (which Reka-UI handles).

### CSS Transition Considerations

The existing `sidebar-right-enter/leave` transitions animate `margin-right`. With Splitter:

- The transition should still work on the inner `<ChatPanel>` or wrapper div inside the SplitterPanel
- The SplitterPanel itself handles collapse/expand animation via Reka-UI
- Test both: (1) collapse via Console toggle, (2) collapse via dragging handle past min-size

### References

- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-03-12.md#Story-7-5] — Complete story definition, key changes, acceptance criteria
- [Source: _bmad-output/planning-artifacts/prd.md#FR59] — FR59 requirement: resizable chat sidebar on desktop
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Responsive-Strategy] — Desktop breakpoint `≥ 1024px`
- [Source: apps/web/src/views/WatchView.vue] — Current layout, localStorage persistence, breakpoint logic
- [Source: apps/web/src/components/stream/BroadcastConsole.vue] — Chat toggle emit
- [Source: apps/web/package.json] — reka-ui ^2.9.0 already installed
- [Source: https://reka-ui.com/docs/components/splitter] — Reka-UI Splitter documentation

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented `SplitterGroup`/`SplitterPanel`/`SplitterResizeHandle` from `reka-ui` (already installed at ^2.9.0) for desktop-only resizable chat sidebar
- Desktop layout: `SplitterGroup v-if="isDesktop"` wraps main column (first `SplitterPanel`) + chat sidebar (second `SplitterPanel` with `ref="chatPanelRef"`)
- Non-desktop layout: original `<main v-if="!isDesktop">` retained, preserving portrait and landscape behaviors unchanged
- `handleToggleChatSidebar` updated: on desktop, calls `chatPanelRef.value.collapse()` or `.expand()` programmatically; on mobile, toggles `chatSidebarOpen` directly
- `handleSplitterCollapse`/`handleSplitterExpand` sync `chatSidebarOpen` boolean + call `resetUnread()` on expand
- `auto-save-id="manly-chat-sidebar"` on `SplitterGroup` for automatic Reka-UI localStorage persistence of panel widths
- Test strategy: mocked `reka-ui` via `vi.mock` with Options API mock that emits `collapse`/`expand` events when methods called programmatically, allowing event handler chain to complete in tests
- 19 WatchView tests all pass; full suite 487 tests passing, 0 regressions; TypeScript and ESLint clean

### File List

- `apps/web/src/views/WatchView.vue`
- `apps/web/src/views/WatchView.test.ts`

## Senior Developer Review (AI)

**Reviewer:** Zikeji  
**Date:** 2026-03-13  
**Model:** glm-5

### Review Outcome: ✅ APPROVED - CLEAN IMPLEMENTATION

All acceptance criteria fully implemented, all tasks verified complete, comprehensive test coverage, no security/performance/quality issues.

### Acceptance Criteria Validation

- **AC1:** ✅ SplitterGroup wraps desktop layout with `auto-save-id="manly-chat-sidebar"`
- **AC2:** ✅ Chat panel configured: 320px default, 240px min, 600px max, collapsible, collapsed-size=0
- **AC3:** ✅ SplitterResizeHandle enables fluid drag resizing (Reka-UI built-in)
- **AC4:** ✅ Width auto-persists via Reka-UI's auto-save-id to localStorage
- **AC5:** ✅ Console toggle calls `chatPanelRef.collapse()` / `.expand()` programmatically
- **AC6:** ✅ `chatSidebarOpen` synced via `@collapse` / `@expand` event handlers
- **AC7:** ✅ Resize handle styled: 1px border, col-resize cursor, hover highlight
- **AC8:** ✅ Mobile layouts unchanged - Splitter only on `v-if="isDesktop"`
- **AC9:** ✅ Keyboard accessibility provided by Reka-UI (no implementation needed)
- **AC10:** ✅ Unread badge preserved - `resetUnread()` called on expand (line 88)

### Task Completion Audit

All 6 tasks marked [x] verified complete via code inspection:

1. ✅ Reka-UI components imported (line 3)
2. ✅ Desktop layout refactored with Splitter (lines 141-203)
3. ✅ Console toggle wired to collapse/expand (lines 67-80, 82-89)
4. ✅ Resize handle styled correctly (line 180)
5. ✅ Mobile layouts preserved unchanged (lines 205-261)
6. ✅ Tests updated - 19 tests covering all scenarios

### Code Quality Assessment

- **Security:** ✅ No injection risks, proper null checks, localStorage wrapped in try/catch
- **Performance:** ✅ No memory leaks, proper timer cleanup, efficient event handling
- **Error Handling:** ✅ Comprehensive try/catch blocks, null safety on refs
- **Code Quality:** ✅ Clean TypeScript, proper naming, good separation of concerns
- **Test Quality:** ✅ 19 passing tests, proper mocking, afterEach cleanup

### Build & Lint Status

- **Tests:** 487/487 passing ✅ (including 19 new WatchView tests)
- **Lint:** Clean ✅
- **TypeScript:** Clean ✅

### Change Log

- 2026-03-13: Code review completed - story marked done, sprint status synced
