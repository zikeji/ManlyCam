<script setup lang="ts">
import { computed } from 'vue';
import type { ClipChatMessage } from '@manlycam/types';
import { Play, VideoOff } from 'lucide-vue-next';
import { openClip } from '@/composables/useClipModal';

const props = defineProps<{
  message: ClipChatMessage;
}>();

const durationLabel = computed(() => {
  const secs = props.message.clipDurationSeconds;
  if (secs == null) return null;
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
});

function handleWatch() {
  openClip(props.message.clipId);
}
</script>

<template>
  <div
    class="mt-1 rounded-lg border border-border bg-muted/30 overflow-hidden w-full max-w-sm"
    data-clip-card
  >
    <template v-if="!message.tombstone">
      <!-- Thumbnail area — clickable to open viewer -->
      <div
        class="relative w-full aspect-video bg-black/40 flex items-center justify-center cursor-pointer"
        data-thumbnail-area
        @click="handleWatch"
      >
        <img
          v-if="message.clipThumbnailUrl"
          :src="message.clipThumbnailUrl"
          :alt="message.clipName"
          class="w-full h-full object-cover"
          data-thumbnail
        />
        <VideoOff v-else class="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
        <span
          v-if="durationLabel"
          class="absolute bottom-1 right-1 text-xs bg-black/70 text-white px-1 rounded"
          data-duration-badge
        >
          {{ durationLabel }}
        </span>
      </div>
      <!-- Clip info + actions -->
      <div class="px-3 py-2 flex items-center justify-between gap-2">
        <span class="text-sm font-medium truncate flex-1" data-clip-name>{{
          message.clipName
        }}</span>
        <button
          class="flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
          data-watch-button
          @click="handleWatch"
        >
          <Play class="h-3 w-3" />
          <span class="hidden md:inline">Watch</span>
        </button>
      </div>
    </template>
    <!-- Tombstone state -->
    <template v-else>
      <div
        class="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"
        data-tombstone
      >
        <VideoOff class="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>This clip is no longer available</span>
      </div>
    </template>
  </div>
</template>
