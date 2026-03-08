<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import type { ClientStreamState } from '@/composables/useStream';
import { useAuth } from '@/composables/useAuth';
import { useWhep } from '@/composables/useWhep';
import StreamStatusBadge from './StreamStatusBadge.vue';
import StateOverlay from './StateOverlay.vue';
import ProfileAnchor from './ProfileAnchor.vue';

const props = defineProps<{
  streamState: ClientStreamState;
}>();

const emit = defineEmits<{ openCameraControls: [] }>();

const petName = import.meta.env.VITE_PET_NAME as string;
const videoRef = ref<HTMLVideoElement | null>(null);
const isHovered = ref(false);
const profilePopoverOpen = ref(false);
const { user } = useAuth();
const { startWhep, stopWhep } = useWhep();

// Overlay is always visible for non-live states (user needs status feedback).
// For live, it fades in only on hover or when popover is open.
const overlayVisible = (state: ClientStreamState, hovered: boolean) =>
  state !== 'live' || hovered || profilePopoverOpen.value;

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
});
</script>

<template>
  <div
    data-stream-container
    class="relative w-full aspect-video bg-black overflow-hidden"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
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

    <!-- Profile anchor: bottom-left, hover-gated (same behavior as top overlay) -->
    <div
      v-if="user"
      class="absolute inset-x-0 bottom-0 flex items-end p-3 transition-opacity duration-150"
      :class="overlayVisible(streamState, isHovered) ? 'opacity-100' : 'opacity-0'"
    >
      <ProfileAnchor v-model:popover-open="profilePopoverOpen" @open-camera-controls="emit('openCameraControls')" />
    </div>
  </div>
</template>
