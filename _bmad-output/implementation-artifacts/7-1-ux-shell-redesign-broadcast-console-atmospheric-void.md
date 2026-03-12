# Story 7.1: UX Shell Redesign — Broadcast Console + Atmospheric Void

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a viewer or admin,
I want the watch page redesigned with a persistent Broadcast Console and Atmospheric Void,
so that stream controls are always accessible without hovering, and the interface feels like a professional broadcast environment rather than a floating-UI screen.

## Acceptance Criteria

1. **Given** a desktop user is on the watch page, **When** the page loads, **Then** the center flex column layout is: a content area (flex-1) containing `<AtmosphericVoid>` as an absolute-positioned background with `<StreamPlayer>` vertically centered on top of it, followed by the `<BroadcastConsole>` strip pinned at the bottom (shrink-0). The left admin sidebar and right chat sidebar are unchanged.

2. **Given** the stream is live on desktop, **When** the `<AtmosphericVoid>` is visible, **Then** it fills the entire content area (absolute inset-0) with a blurred, darkened mirror of the live stream (`filter: blur(40px) brightness(0.6)`), creating an ambient glow above and below the stream. The stream is `w-full aspect-video` centered vertically — the void naturally frames it above and below in the space the aspect ratio doesn't occupy. When the stream is not live (no `srcObject`), the void renders a dark placeholder (`bg-[hsl(var(--surface))]`) rather than collapsing.

3. **Given** the `<BroadcastConsole>` is rendered, **When** viewed by any authenticated user, **Then** it shows three flanks:
   - **Left** (admin-only, hidden for non-admins): Camera Controls toggle button and Stream Start/Stop toggle button; a commented stub `<!-- 7-4: BatteryIndicator -->` in the leftmost position.
   - **Center** (all users): `<StreamStatusBadge>` (moved here from StreamPlayer overlay), a viewer count showing `viewers.value.length` from `usePresence`, and a static stream title text `"Manly is live 🐾"` with a stub comment `<!-- 7-2: editable title -->`.
   - **Right** (all users): a disabled camera snapshot button with `title="Take Snapshot (coming soon)"` and `<!-- 7-3: snapshot -->`; the profile avatar popover; the chat sidebar toggle with unread badge.

4. **Given** an admin user views the Console left flank, **When** they click the Camera Controls button, **Then** `toggleAdminPanel` is emitted. **When** they click the Stream Start/Stop button, **Then** the stream is toggled via `useAdminStream`'s `startStream`/`stopStream` with a loading state indicator on the button.

5. **Given** any user views the Console right flank, **When** they click the chat toggle button, **Then** `toggleChatSidebar` is emitted. The button shows the unread badge (with pulse animation) when the sidebar is collapsed and there are unread messages — matching the existing `SidebarCollapseButton` behavior.

6. **Given** any user opens the profile popover in the Console right flank, **When** they interact with it, **Then** it contains: username display, Camera Controls button (admin only, mobile only — hidden on desktop where the left flank is visible), Users manager button (admin only), and Logout. **The Start/Stop stream button is removed from the profile popover entirely** — it lives exclusively in the console left flank (always visible to admins in all layouts).

7. **Given** `<StreamPlayer>` after the refactor, **When** rendered in desktop or portrait mode, **Then** it contains only: the video element (existing a11y attributes), the connecting skeleton, `<StateOverlay>` for unreachable/explicit-offline states — all hover-overlay logic, gradient, badge, admin toggle, profile anchor are removed. `defineExpose({ videoRef })` is added. **In mobile landscape mode only**, StreamPlayer retains a minimal tap-to-reveal mechanism (see AC #11 and Dev Notes).

8. **Given** a mobile portrait user (`< 768px, portrait`), **When** the page loads, **Then** the center column shows: `<StreamPlayer>` → `<BroadcastConsole>` → `<ChatPanel>` (flex-1, replacing the void). No right sidebar is rendered. The `<AtmosphericVoid>` is not rendered.

9. **Given** `ProfileAnchor.vue`, `ProfileAnchor.test.ts`, `SidebarCollapseButton.vue`, `SidebarCollapseButton.test.ts` exist, **When** story is complete, **Then** all four files are deleted.

10. **Given** the tests, **When** story is complete, **Then**: `StreamPlayer.test.ts` is updated, `WatchView.test.ts` is updated, `BroadcastConsole.test.ts` is created, `AtmosphericVoid.test.ts` is created. All existing tests pass.

11. **Given** a mobile landscape user (`≥ landscape orientation, < 1024px`), **When** the page loads, **Then**:
    - The stream fills the left column edge-to-edge (`flex-1`, no void, no console below stream).
    - The right column is a single collapsible unit containing `<ChatPanel>` (flex-1, top) stacked above `<BroadcastConsole>` (shrink-0, bottom) — both slide in/out together via `chatSidebarOpen`.
    - When the right column is **open**, the BroadcastConsole at the bottom of the column serves as the persistent control strip.
    - When the right column is **closed**, tapping the stream (touch only) reveals a minimal tap overlay at the stream's right edge for 3 seconds: a single chat-toggle button with unread badge. Tapping this button opens the right column.

---

## ⚠️ UX Spec Notes (Resolved)

| # | Issue | Resolution |
|---|---|---|
| ~~1~~ | Mobile landscape — ChatPanel header slot not possible | **Resolved:** Paired right-column unit (ChatPanel + BroadcastConsole stacked) + stream tap-to-reveal toggle. No ChatPanel modification needed. Console always at bottom of its container in all layouts. |
| 2 | AtmosphericVoid offline state | **Resolved:** Dark `bg-[hsl(var(--surface))]` fallback. Captured in AC #2. |
| 3 | Start/Stop button duplication in profile popover | **Resolved:** Removed from profile popover entirely. Console left flank is always visible to admins in all layouts. |
| 4 | StreamStatusBadge + static title redundancy | **Left to dev/UAT:** Both rendered side-by-side in center. Dev agent may adjust during implementation based on visual testing. Note it in completion notes. |
| 5 | Console styling | **Resolved:** `h-14 bg-black/40 backdrop-blur-sm border-t border-white/10`. |

---

## Tasks / Subtasks

- [x] Task 1: Refactor `StreamPlayer.vue` — remove hover-overlay shell, retain landscape tap (AC: #7, #11)
  - [x] Remove imports: `ProfileAnchor`, `SidebarCollapseButton`
  - [x] Remove props: `adminPanelOpen`, `isDesktop`, `showChatSidebarToggle` — **keep** `chatSidebarOpen`, `unreadCount` (needed for landscape tap toggle)
  - [x] Remove emits: `openCameraControls`, `openUserManager`, `toggleAdminPanel` — **keep** `toggleChatSidebar` (landscape tap)
  - [x] Remove state: `isHovered`, `profilePopoverOpen` — **keep** `tapOverlayVisible`, `tapTimer`
  - [x] Remove `@mouseenter`/`@mouseleave` from container div — **keep** `@click="handleTap"` (touch-only tap logic unchanged)
  - [x] Remove template: hover gradient div, badge container div, admin toggle div, profile anchor div
  - [x] Remove `ChevronLeft`/`ChevronRight` import (was used for admin toggle) — **keep** if needed for landscape tap chevron
  - [x] Add landscape tap overlay to template (see Dev Notes): `v-if="showLandscapeTapToggle"`, positioned at stream's right edge, shows chat toggle + unread badge, fades in/out via `tapOverlayVisible`
  - [x] Add prop `showLandscapeTapToggle?: boolean` (passed from WatchView when `isMobileLandscape && !chatSidebarOpen`)
  - [x] Add `defineExpose({ videoRef })`
  - [x] Keep: `videoRef`, WHEP lifecycle watch, `onUnmounted` stopWhep+clearTimer, connecting skeleton, `<StateOverlay>`, `<video>` element

- [x] Task 2: Create `BroadcastConsole.vue` (AC: #3, #4, #5, #6)
  - [x] Scaffold component with three-flank layout (`flex items-center justify-between`)
  - [x] Left flank (`v-if="isAdmin"`): Camera Controls toggle button, Stream Start/Stop toggle button, stub `<!-- 7-4: BatteryIndicator -->`
  - [x] Center: `<StreamStatusBadge :state="streamState" />`, viewer count, static title + `<!-- 7-2: editable title -->`
  - [x] Right flank: disabled snapshot stub + `<!-- 7-3: snapshot -->`, profile avatar popover, chat toggle with unread badge + pulse animation
  - [x] Profile popover content: username, Camera Controls (admin + `!isDesktop` only), Users manager (admin only), Logout. **No Start/Stop button.**
  - [x] Props: `streamState`, `isAdmin`, `adminPanelOpen`, `chatSidebarOpen`, `unreadCount`, `isDesktop`
  - [x] Emits: `toggleAdminPanel`, `toggleChatSidebar`, `openUserManager`
  - [x] Styling: `h-14 bg-black/40 backdrop-blur-sm border-t border-white/10 flex items-center justify-between px-3`
  - [x] All buttons: `w-11 h-11` minimum (44px touch target, WCAG 2.5.5)
  - [x] Unread badge pulse: port `isPulsing`/`pulseTimer`/`onBeforeUnmount` pattern from `SidebarCollapseButton.vue`

- [x] Task 3: Create `AtmosphericVoid.vue` (AC: #2)
  - [x] Props: `videoRef: HTMLVideoElement | null`
  - [x] Internal `voidVideoRef` ref for mirrored `<video>` element
  - [x] `watch(() => props.videoRef, ...)` + `loadeddata` event listener pattern (see Dev Notes)
  - [x] `<video>`: `w-full h-full object-cover pointer-events-none select-none`, inline style `filter: blur(40px) brightness(0.6)`, `autoplay muted playsinline`
  - [x] Container: **`absolute inset-0 overflow-hidden bg-[hsl(var(--surface))]`** + `aria-hidden="true"` — fills parent via absolute positioning; parent must be `relative`
  - [x] `onUnmounted` cleanup of event listener

- [x] Task 4: Restructure `WatchView.vue` (AC: #1, #8, #11)
  - [x] Add `isMobileLandscape` ref + matchMedia detection: `(max-width: 1023px) and (orientation: landscape)` — add listener in `onMounted`, same pattern as existing `isMobilePortrait`
  - [x] Add `streamPlayerRef = ref<InstanceType<typeof StreamPlayer> | null>(null)` + `streamVideoRef = computed(() => streamPlayerRef.value?.videoRef ?? null)`
  - [x] Import `BroadcastConsole`, `AtmosphericVoid`
  - [x] Restructure `<main>` to `flex flex-col bg-black overflow-hidden` (remove `items-center justify-center`):
    - [x] **Content area div** (desktop/non-portrait): `class="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden"` with `v-if="!isMobilePortrait"` — hosts AtmosphericVoid (absolute bg) + centered StreamPlayer (relative z-10)
      - [x] Inside: `<AtmosphericVoid v-if="!isMobileLandscape" class="absolute inset-0" :video-ref="streamVideoRef" />`
      - [x] Inside: `<StreamPlayer ref="streamPlayerRef" class="relative z-10 w-full" :streamState="streamState" :chatSidebarOpen="chatSidebarOpen" :unreadCount="unreadCount" :showLandscapeTapToggle="isMobileLandscape && !chatSidebarOpen" @toggle-chat-sidebar="handleToggleChatSidebar" />`
    - [x] **Portrait content area**: `v-if="isMobilePortrait"` — `class="shrink-0"` — contains StreamPlayer only (no void, no centering flex)
      - [x] Inside: `<StreamPlayer ref="streamPlayerRef" class="w-full" :streamState="streamState" :chatSidebarOpen="chatSidebarOpen" :unreadCount="unreadCount" :showLandscapeTapToggle="false" @toggle-chat-sidebar="handleToggleChatSidebar" />`
    - [x] `<BroadcastConsole v-if="!isMobileLandscape" ...all props... />` (shrink-0, pinned at bottom of main)
    - [x] `<ChatPanel v-if="isMobilePortrait" class="flex-1 min-h-0 flex flex-col bg-[hsl(var(--sidebar))]" ... />`
  - [x] Landscape right column (sibling of `<main>`, replaces right sidebar for landscape):
    ```
    <Transition v-if="isMobileLandscape" name="sidebar-right">
      <div v-if="chatSidebarOpen" class="w-[280px] shrink-0 flex flex-col bg-[hsl(var(--sidebar))] border-l border-[hsl(var(--border))]">
        <ChatPanel class="flex-1 flex flex-col min-h-0" @open-camera-controls="handleOpenCameraControls" @open-user-manager="userManagerOpen = true" />
        <BroadcastConsole :isAdmin="isAdmin" :streamState="streamState" :adminPanelOpen="adminPanelOpen" :chatSidebarOpen="chatSidebarOpen" :unreadCount="unreadCount" :isDesktop="false" @toggle-admin-panel="handleToggleAdminPanel" @toggle-chat-sidebar="handleToggleChatSidebar" @open-user-manager="userManagerOpen = true" />
      </div>
    </Transition>
    ```
  - [x] Desktop right sidebar (`v-if="!isMobilePortrait && !isMobileLandscape"`): existing ChatPanel sibling, unchanged structure
  - [x] Remove old StreamPlayer props: `adminPanelOpen`, `isDesktop`, `showChatSidebarToggle`
  - [x] Remove old StreamPlayer events: `@open-camera-controls`, `@toggle-admin-panel`, `@open-user-manager`
  - [x] Preserve localStorage persistence for `adminPanelOpen` and `chatSidebarOpen`
  - [x] Preserve mobile Sheet drawer for admin (`v-if="isAdmin && !isDesktop"`)

- [x] Task 5: Delete obsolete files (AC: #9)
  - [x] Delete `apps/web/src/components/stream/ProfileAnchor.vue`
  - [x] Delete `apps/web/src/components/stream/ProfileAnchor.test.ts`
  - [x] Delete `apps/web/src/components/stream/SidebarCollapseButton.vue`
  - [x] Delete `apps/web/src/components/stream/SidebarCollapseButton.test.ts`

- [x] Task 6: Update `StreamPlayer.test.ts` (AC: #10)
  - [x] Remove tests: hover overlay, admin toggle, profile anchor, chat sidebar toggle (non-landscape)
  - [x] Keep tests: WHEP lifecycle, state overlays, connecting skeleton
  - [x] Add test: `defineExpose` exposes `videoRef`
  - [x] Add test: landscape tap overlay visible after touch tap when `showLandscapeTapToggle=true`; hidden when `showLandscapeTapToggle=false`
  - [x] Add test: landscape chat toggle emits `toggleChatSidebar`
  - [x] Verify `afterEach(() => { wrapper?.unmount(); wrapper = null; })`

- [x] Task 7: Update `WatchView.test.ts` (AC: #10)
  - [x] Update layout assertions to match new center-column structure
  - [x] Assert content area div is `relative flex items-center justify-center` (non-portrait)
  - [x] Assert `<AtmosphericVoid>` is `absolute inset-0` inside content area on desktop; not rendered on mobile portrait; not rendered on mobile landscape
  - [x] Assert `<BroadcastConsole>` is below content area in main (non-landscape); inside right column (landscape)
  - [x] Assert mobile portrait: stream is `shrink-0` with no centering wrapper; ChatPanel below console; no void
  - [x] Assert mobile landscape: right column contains ChatPanel + BroadcastConsole stacked; BroadcastConsole NOT in main column
  - [x] Assert StreamPlayer gets `showLandscapeTapToggle=true` when `isMobileLandscape && !chatSidebarOpen`
  - [x] Verify `afterEach` cleanup

- [x] Task 8: Create `BroadcastConsole.test.ts` (AC: #10)
  - [x] Left flank hidden for non-admin; visible for admin
  - [x] Camera Controls button emits `toggleAdminPanel`
  - [x] Stream Start/Stop calls `useAdminStream` (mock it)
  - [x] Center renders `<StreamStatusBadge>` with correct state prop
  - [x] Center viewer count matches mocked `viewers` length
  - [x] Right chat toggle emits `toggleChatSidebar`
  - [x] Right unread badge visible when `!chatSidebarOpen && unreadCount > 0`
  - [x] Profile popover: no Start/Stop button in any scenario
  - [x] Profile popover: Camera Controls hidden when `isDesktop=true`
  - [x] `afterEach` cleanup

- [x] Task 9: Create `AtmosphericVoid.test.ts` (AC: #10)
  - [x] Renders dark fallback container when `videoRef` is null
  - [x] Container has `aria-hidden="true"`
  - [x] Copies `srcObject` to internal video on `loadeddata` event
  - [x] Cleans up event listener on unmount

---

## Dev Notes

### Three-Layout Architecture (Critical)

WatchView now has three distinct layouts driven by JS-level breakpoint state:

| Mode | Condition | Layout |
|---|---|---|
| **Desktop** | `isDesktop` (`≥ 1024px`) | Left admin sidebar ↔ center column (void+stream centered in flex-1, console at bottom) ↔ right chat sidebar |
| **Mobile portrait** | `isMobilePortrait` | Single column: stream (shrink-0, top) → console → chat (flex-1, no void) |
| **Mobile landscape** | `isMobileLandscape` | Stream fills left (void+stream centered, no console in main) ↔ right column (ChatPanel top + BroadcastConsole bottom, paired) |

**The key structural change:** AtmosphericVoid is now an `absolute inset-0` background inside the content area div (which is `relative`). StreamPlayer sits on top of it (`relative z-10 w-full`). The content area is `flex items-center justify-center flex-1` so the stream is vertically centered — void fills the full height, stream's `aspect-video` ratio means void bleeds above and below it naturally.

```
Before: flex-col → [stream shrink-0 at top] → [console] → [void flex-1 below]
After:  flex-col → [content area flex-1: void absolute bg + stream centered on top] → [console shrink-0 at bottom]
```

Add to `WatchView.vue` `onMounted`:
```typescript
const isMobileLandscape = ref(false);
// In onMounted, after existing matchMedia setup:
const mqLandscape = window.matchMedia('(max-width: 1023px) and (orientation: landscape)');
isMobileLandscape.value = mqLandscape.matches;
mqLandscape.addEventListener('change', (e) => { isMobileLandscape.value = e.matches; });
```

Note: `isMobileLandscape` and `isMobilePortrait` are mutually exclusive. `isDesktop` (`≥ 1024px`) excludes both mobile modes. Verify no overlapping matchMedia ranges.

### StreamPlayer: Landscape Tap Overlay (Minimal)

StreamPlayer retains `tapOverlayVisible`, `tapTimer`, and `handleTap` unchanged. The ONLY template addition is the landscape chat toggle overlay, gated by the new `showLandscapeTapToggle` prop:

```html
<!-- Landscape-only tap-to-reveal chat toggle (touch only, 3s auto-hide) -->
<div
  v-if="showLandscapeTapToggle"
  class="absolute inset-y-0 right-3 flex items-center pointer-events-auto transition-opacity duration-300"
  :class="tapOverlayVisible ? 'opacity-100' : 'opacity-0'"
>
  <div class="relative">
    <Button
      variant="ghost"
      size="icon"
      class="w-11 h-11 text-white hover:bg-white/20"
      :aria-label="(unreadCount ?? 0) > 0 ? `Open chat (${unreadCount} unread)` : 'Open chat'"
      @click.stop="emit('toggleChatSidebar')"
    >
      <ChevronLeft class="w-5 h-5" />
    </Button>
    <Badge
      v-if="(unreadCount ?? 0) > 0"
      class="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 text-[10px] border-2 border-black/60 pointer-events-none"
      aria-hidden="true"
    >
      {{ (unreadCount ?? 0) > 99 ? '99+' : unreadCount }}
    </Badge>
  </div>
</div>
```

`handleTap` is unchanged — touch-only, 3-second timer. The `@click="handleTap"` stays on the container div. No `@mouseenter`/`@mouseleave`.

What's fully removed from StreamPlayer vs what's kept:

| Item | Removed? |
|---|---|
| `isHovered`, `profilePopoverOpen` | ✅ Removed |
| `@mouseenter`/`@mouseleave` | ✅ Removed |
| Hover gradient, badge, admin toggle div, profile anchor div | ✅ Removed |
| `ProfileAnchor`, `SidebarCollapseButton` imports | ✅ Removed |
| `adminPanelOpen`, `isDesktop`, `showChatSidebarToggle` props | ✅ Removed |
| `openCameraControls`, `openUserManager`, `toggleAdminPanel` emits | ✅ Removed |
| `tapOverlayVisible`, `tapTimer`, `handleTap` | ⚠️ Kept (landscape) |
| `chatSidebarOpen`, `unreadCount` props | ⚠️ Kept (landscape) |
| `toggleChatSidebar` emit | ⚠️ Kept (landscape) |
| `showLandscapeTapToggle` prop | ✅ New |
| `videoRef`, WHEP watch, `defineExpose` | ✅ Kept/New |

### StreamPlayer: `defineExpose` Pattern

```typescript
// End of StreamPlayer.vue <script setup>:
defineExpose({ videoRef });
```

In `WatchView.vue`:
```typescript
import StreamPlayer from '@/components/stream/StreamPlayer.vue';
const streamPlayerRef = ref<InstanceType<typeof StreamPlayer> | null>(null);
const streamVideoRef = computed(() => streamPlayerRef.value?.videoRef ?? null);
```

Template: `<StreamPlayer ref="streamPlayerRef" ... />`

### AtmosphericVoid: MediaStream Synchronization

`useWhep` sets `videoEl.srcObject` internally via `pc.ontrack` — no reactive ref exposed. The void syncs via `loadeddata` event:

```typescript
const voidVideoRef = ref<HTMLVideoElement | null>(null);
let cleanupFn: (() => void) | null = null;

watch(() => props.videoRef, (srcEl) => {
  if (cleanupFn) { cleanupFn(); cleanupFn = null; }
  if (!srcEl || !voidVideoRef.value) return;

  const sync = () => {
    if (voidVideoRef.value && srcEl.srcObject !== voidVideoRef.value.srcObject) {
      voidVideoRef.value.srcObject = srcEl.srcObject;
      if (srcEl.srcObject) voidVideoRef.value.play().catch(() => {});
    }
  };

  sync(); // immediate sync if srcObject already set
  srcEl.addEventListener('loadeddata', sync);
  cleanupFn = () => srcEl.removeEventListener('loadeddata', sync);
}, { immediate: true });

onUnmounted(() => { if (cleanupFn) cleanupFn(); });
```

AtmosphericVoid is only rendered on desktop (`!isMobilePortrait && !isMobileLandscape`) — WatchView controls this via `v-if`.

### BroadcastConsole: Viewer Count Source

```typescript
import { viewers } from '@/composables/usePresence';
// viewers is module-level ref<UserPresence[]>
// Pluralize: viewers.value.length === 1 ? '1 viewer' : `${viewers.value.length} viewers`
```

### BroadcastConsole: Stream Start/Stop

Uses `useAdminStream`. Start/Stop is **only** in the left flank — no conditional needed, no duplicate in the profile popover:

```typescript
const { startStream, stopStream, isLoading, error } = useAdminStream();
const { streamState } = useStream();
const handleStreamToggle = async () => {
  if (streamState.value === 'explicit-offline') await startStream();
  else await stopStream();
};
```

Button label: `streamState === 'explicit-offline' ? 'Start Stream' : 'Stop Stream'`. Disabled + loading indicator while `isLoading`.

### BroadcastConsole: Unread Badge Pulse

Port directly from `SidebarCollapseButton.vue`:
```typescript
const isPulsing = ref(false);
let pulseTimer: number | null = null;

onBeforeUnmount(() => { if (pulseTimer !== null) { clearTimeout(pulseTimer); pulseTimer = null; } });

watch(() => props.unreadCount, (newVal, oldVal) => {
  if (newVal > (oldVal ?? 0)) {
    isPulsing.value = true;
    pulseTimer = window.setTimeout(() => { isPulsing.value = false; pulseTimer = null; }, 400);
  }
});
```

### BroadcastConsole: Profile Popover Content

No Start/Stop button — removed entirely. Remaining content:
```
[username header]
[divider]
[Camera Controls button — admin only, v-if="isAdmin && !isDesktop"]
[Users button — admin only, v-if="isAdmin"]
[divider if admin]
[Log out]
[error p if error]
```

### ShadCN Components Already Available

All needed components are installed — no new installs for 7-1:
- `Popover`, `PopoverTrigger`, `PopoverContent`
- `Avatar`, `AvatarImage`, `AvatarFallback`
- `Button`, `Badge`, `Tooltip`, `TooltipContent`, `TooltipTrigger`, `TooltipProvider`

Import from `@/components/ui/[name]`.

### Mobile Sheet for Admin (Unchanged)

The existing `<Sheet v-if="isAdmin" v-model:open="mobileSheetOpen">` with `<AdminPanel>` inside is unchanged. `mobileSheetOpen` computed still works: `adminPanelOpen && !isDesktop`. On mobile landscape, the left flank of BroadcastConsole provides the Camera Controls toggle (opens the sheet via `toggleAdminPanel`).

### What to Delete From WatchView Imports

- `StreamPlayer` events `@open-camera-controls`, `@toggle-admin-panel`, `@open-user-manager` → remove wiring
- `handleOpenCameraControls` → merge into `handleToggleAdminPanel` if they're identical; check if ChatPanel still emits `open-camera-controls` (it does — keep that handler pointing to `handleToggleAdminPanel`)

### BroadcastConsole Center — StreamStatusBadge + Title (UAT Note)

Both `<StreamStatusBadge>` and the static title text `"Manly is live 🐾"` are rendered in the center flank. They may feel redundant (the badge already says "Manly is live"). Dev agent should implement both as specced, note it in completion notes, and flag for Zikeji to evaluate during UAT. If the title is removed, it becomes just the badge + viewer count in center.

### Test Patterns Reference

Always `afterEach(() => { wrapper?.unmount(); wrapper = null; })` in Vue component tests (Epic 4 lesson).

Mock module-level refs by direct assignment:
```typescript
import { viewers } from '@/composables/usePresence';
beforeEach(() => { viewers.value = [{ id: '1', displayName: 'Alice' } as UserPresence]; });
afterEach(() => { viewers.value = []; });
```

### Project Structure Notes

**Files to create:**
- `apps/web/src/components/stream/BroadcastConsole.vue`
- `apps/web/src/components/stream/BroadcastConsole.test.ts`
- `apps/web/src/components/stream/AtmosphericVoid.vue`
- `apps/web/src/components/stream/AtmosphericVoid.test.ts`

**Files to modify:**
- `apps/web/src/views/WatchView.vue`
- `apps/web/src/views/WatchView.test.ts`
- `apps/web/src/components/stream/StreamPlayer.vue`
- `apps/web/src/components/stream/StreamPlayer.test.ts`

**Files to delete:**
- `apps/web/src/components/stream/ProfileAnchor.vue`
- `apps/web/src/components/stream/ProfileAnchor.test.ts`
- `apps/web/src/components/stream/SidebarCollapseButton.vue`
- `apps/web/src/components/stream/SidebarCollapseButton.test.ts`

**Files NOT to touch:**
- `apps/web/src/components/stream/StreamStatusBadge.vue` — reused as-is
- `apps/web/src/components/stream/StateOverlay.vue` — stays in StreamPlayer
- `apps/web/src/components/admin/AdminPanel.vue` — no changes
- `apps/web/src/components/chat/ChatPanel.vue` — no changes
- All server files — no server changes in 7-1

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-7] — Story 7-1 spec, key changes, placeholder slot notes
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Chosen-Design-Direction] — Desktop/mobile layout, BroadcastConsole spec, AtmosphericVoid spec, accessibility requirements
- [Source: _bmad-output/planning-artifacts/ux-design-directions.html] — Visual mockups (load manually if visual reference needed)
- [Source: apps/web/src/views/WatchView.vue] — Current layout, localStorage persistence, matchMedia pattern
- [Source: apps/web/src/components/stream/StreamPlayer.vue] — Current hover-overlay to remove; tap logic to keep/adapt
- [Source: apps/web/src/components/stream/ProfileAnchor.vue] — Functionality to port into BroadcastConsole profile popover
- [Source: apps/web/src/components/stream/SidebarCollapseButton.vue] — Pulse badge animation to port into BroadcastConsole chat toggle
- [Source: apps/web/src/composables/usePresence.ts] — `viewers` module-level ref for viewer count
- [Source: apps/web/src/composables/useWhep.ts] — No MediaStream exposed; use `loadeddata` event to sync srcObject
- [Source: apps/web/src/composables/useAdminStream.ts] — `startStream`, `stopStream`, `isLoading`, `error`
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Accessibility] — 44px touch targets, aria-live, focus trap for popover

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References
- Addressed user feedback to use the global theme background rather than dark styling for BroadcastConsole

### Completion Notes List
- Completed refactor of WatchView shell adding three responsive states (Desktop, Mobile Portrait, Mobile Landscape).
- BroadcastConsole uses standard layout backgrounds based on user instruction.
- Both StreamStatusBadge and static text retained side-by-side in center as UAT issue #4 noted.
- All acceptance criteria verified and tasks checked.

### File List
- `apps/web/src/views/WatchView.vue`
- `apps/web/src/views/WatchView.test.ts`
- `apps/web/src/components/stream/StreamPlayer.vue`
- `apps/web/src/components/stream/StreamPlayer.test.ts`
- `apps/web/src/components/stream/BroadcastConsole.vue` (new)
- `apps/web/src/components/stream/BroadcastConsole.test.ts` (new)
- `apps/web/src/components/stream/AtmosphericVoid.vue` (new)
- `apps/web/src/components/stream/AtmosphericVoid.test.ts` (new)
- `apps/web/src/components/stream/ProfileAnchor.vue` (deleted)
- `apps/web/src/components/stream/ProfileAnchor.test.ts` (deleted)
- `apps/web/src/components/stream/SidebarCollapseButton.vue` (deleted)
- `apps/web/src/components/stream/SidebarCollapseButton.test.ts` (deleted)
