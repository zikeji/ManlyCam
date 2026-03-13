<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { ChevronLeft } from 'lucide-vue-next';
import type { ClientStreamState } from '@/composables/useStream';
import { useWhep } from '@/composables/useWhep';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import StateOverlay from './StateOverlay.vue';

import { getPetName } from '@/lib/env';

const props = defineProps<{
  streamState: ClientStreamState;
  chatSidebarOpen?: boolean;
  unreadCount?: number;
  showLandscapeTapToggle?: boolean;
}>();

const emit = defineEmits<{
  toggleChatSidebar: [];
}>();

const petName = getPetName();
const videoRef = ref<HTMLVideoElement | null>(null);
const tapOverlayVisible = ref(false);
let tapTimer: ReturnType<typeof setTimeout> | null = null;
const { startWhep, stopWhep, isHealthy } = useWhep();

function handleTap(event: MouseEvent): void {
  // Only activate tap overlay for touch-originated events
  if ((event as PointerEvent).pointerType === 'touch') {
    if (!tapOverlayVisible.value) {
      tapOverlayVisible.value = true;
    }
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
          // WHEP connection failed
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

defineExpose({ videoRef });
</script>

<template>
  <div
    data-stream-container
    class="relative w-full landscape:max-h-full aspect-video bg-black overflow-hidden"
    @click="handleTap"
  >
    <!-- Connecting: Skeleton -->
    <div
      v-if="streamState === 'connecting'"
      data-skeleton
      class="absolute inset-0 animate-pulse bg-[hsl(var(--surface))]"
    />

    <!-- Video element -->
    <video
      ref="videoRef"
      class="w-full h-full object-cover"
      role="img"
      :aria-label="`Live stream of ${petName}`"
      autoplay
      muted
      playsinline
    />

    <!-- State overlays: server-reported unreachable/offline, or client-detected stream freeze -->
    <StateOverlay
      v-if="streamState === 'unreachable' || streamState === 'explicit-offline' || (streamState === 'live' && !isHealthy)"
      :variant="streamState === 'explicit-offline' ? 'explicit-offline' : 'unreachable'"
    />

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
  </div>
</template>
