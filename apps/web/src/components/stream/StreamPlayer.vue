<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import type { ClientStreamState } from '@/composables/useStream';
import { useAuth } from '@/composables/useAuth';
import { useWhep } from '@/composables/useWhep';
import { Button } from '@/components/ui/button';
import StreamStatusBadge from './StreamStatusBadge.vue';
import StateOverlay from './StateOverlay.vue';
import ProfileAnchor from './ProfileAnchor.vue';
import SidebarCollapseButton from './SidebarCollapseButton.vue';

const props = defineProps<{
  streamState: ClientStreamState;
  isAdmin?: boolean;
  adminPanelOpen?: boolean;
  isDesktop?: boolean;
  chatSidebarOpen?: boolean;
  unreadCount?: number;
  showChatSidebarToggle?: boolean;
}>();

const emit = defineEmits<{
  openCameraControls: []
  toggleAdminPanel: []
  toggleChatSidebar: []
}>();

const petName = import.meta.env.VITE_PET_NAME as string;
const videoRef = ref<HTMLVideoElement | null>(null);
const isHovered = ref(false);
const tapOverlayVisible = ref(false);
let tapTimer: ReturnType<typeof setTimeout> | null = null;
const profilePopoverOpen = ref(false);
const { user } = useAuth();
const { startWhep, stopWhep } = useWhep();

// Overlay is always visible for non-live states (user needs status feedback).
// For live, it fades in only on hover, tap (mobile), or when popover is open.
const overlayVisible = (state: ClientStreamState, hovered: boolean) =>
  state !== 'live' || hovered || profilePopoverOpen.value || tapOverlayVisible.value;

function handleTap(event: MouseEvent): void {
  // Only activate tap overlay for touch-originated events; mouse hover handles desktop
  if ((event as PointerEvent).pointerType === 'touch') {
    // If overlay is hidden, show it; if visible, keep it visible and reset the timer
    if (!tapOverlayVisible.value) {
      tapOverlayVisible.value = true;
    }
    // Always reset the 3-second timer (whether we just showed or were already visible)
    if (tapTimer) clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { tapOverlayVisible.value = false; }, 3000);
  }
}

watch(
  () => props.streamState,
  async (newState, oldState) => {
    if (newState === 'live') {
      if (videoRef.value) {
        try {
          await startWhep(videoRef.value);
        } catch {
          // WHEP connection failed; stay in 'live' state for WS update (Story 3.4)
          // or manual retry when state transitions. Log error for debugging.
        }
      }
    } else if (oldState === 'live') {
      await stopWhep();
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  stopWhep();
  if (tapTimer) clearTimeout(tapTimer);
});
</script>

<template>
  <div
    data-stream-container
    class="relative w-full landscape:max-h-full aspect-video bg-black overflow-hidden"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @click="handleTap"
  >
    <!-- Connecting: Skeleton -->
    <div
      v-if="streamState === 'connecting'"
      data-skeleton
      class="absolute inset-0 animate-pulse bg-[hsl(var(--surface))]"
    />

    <!-- Video element: always mounted so WHEP can attach srcObject -->
    <video
      ref="videoRef"
      class="w-full h-full object-cover"
      role="img"
      :aria-label="`Live stream of ${petName}`"
      autoplay
      muted
      playsinline
    />

    <!-- State overlays (rendered over video) -->
    <StateOverlay
      v-if="streamState === 'unreachable' || streamState === 'explicit-offline'"
      :variant="streamState === 'unreachable' ? 'unreachable' : 'explicit-offline'"
    />

    <!-- Top gradient + badge: hover-gated when live, always visible otherwise -->
    <div
      class="absolute inset-x-0 top-0 transition-opacity duration-300"
      :class="overlayVisible(streamState, isHovered) ? 'opacity-100' : 'opacity-0'"
    >
      <!-- Gradient for badge readability -->
      <div class="h-20 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
    </div>

    <!-- Badge: non-live overlay states handle their own status UI; only show for live/connecting -->
    <div
      v-if="streamState === 'live' || streamState === 'connecting'"
      data-badge-container
      class="absolute inset-x-0 top-4 flex justify-center pointer-events-none transition-opacity duration-300"
      :class="overlayVisible(streamState, isHovered) ? 'opacity-100' : 'opacity-0'"
    >
      <StreamStatusBadge :state="streamState" />
    </div>

    <!-- Admin sidebar toggle: top-left, desktop only, admin only, hover-gated -->
    <div
      v-if="isAdmin && isDesktop"
      class="absolute top-4 left-4 transition-opacity duration-300 pointer-events-auto"
      :class="overlayVisible(streamState, isHovered) ? 'opacity-100' : 'opacity-0'"
    >
      <Button
        variant="ghost"
        size="icon"
        class="rounded p-0 w-9 h-9 text-foreground hover:bg-accent"
        @click="emit('toggleAdminPanel')"
        :aria-label="adminPanelOpen ? 'Hide admin panel' : 'Show admin panel'"
      >
        <ChevronRight v-if="!adminPanelOpen" class="w-4 h-4" />
        <ChevronLeft v-else class="w-4 h-4" />
      </Button>
    </div>

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

    <!-- Profile anchor: bottom-left, hover-gated, desktop only (mobile: moved to ChatPanel input bar) -->
    <div
      v-if="user && isDesktop"
      class="absolute inset-x-0 bottom-0 flex items-end p-3 transition-opacity duration-150"
      :class="overlayVisible(streamState, isHovered) ? 'opacity-100' : 'opacity-0'"
    >
      <ProfileAnchor
        v-model:popover-open="profilePopoverOpen"
        :isDesktop="isDesktop"
        @open-camera-controls="emit('openCameraControls')"
      />
    </div>
  </div>
</template>
