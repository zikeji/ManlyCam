<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { X, Download } from 'lucide-vue-next';
import { apiFetch } from '@/lib/api';
import { closeClip, activeClipId } from '@/composables/useClipModal';

interface ClipDetail {
  id: string;
  name: string;
  description: string | null;
  durationSeconds: number | null;
  clipperName: string | null;
  clipperAvatarUrl: string | null;
  showClipper: boolean;
}

const clipData = ref<ClipDetail | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);

async function fetchClipData(clipId: string) {
  isLoading.value = true;
  error.value = null;
  clipData.value = null;
  try {
    const data = await apiFetch<ClipDetail>(`/api/clips/${clipId}`);
    clipData.value = data;
  } catch (err: unknown) {
    error.value = (err instanceof Error ? err.message : String(err)) || 'Failed to load clip';
  } finally {
    isLoading.value = false;
  }
}

watch(
  activeClipId,
  (id) => {
    if (id) {
      void fetchClipData(id);
    }
  },
  { immediate: true },
);

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    closeClip();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});

function handleDownload() {
  if (activeClipId.value) {
    window.open(`/api/clips/${activeClipId.value}/download`, '_blank');
  }
}

function formatDuration(secs: number | null): string | null {
  if (secs == null) return null;
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
</script>

<template>
  <!-- Fixed overlay — avoids transform/overflow-hidden ancestor issues -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
    data-clip-viewer-modal
    @click.self="closeClip"
  >
    <div class="relative w-full max-w-3xl mx-4 bg-background rounded-lg overflow-hidden shadow-2xl">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-border">
        <span class="text-sm font-semibold truncate flex-1" data-modal-clip-name>
          {{ clipData?.name ?? '…' }}
        </span>
        <div class="flex items-center gap-2 shrink-0 ml-2">
          <button
            class="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-accent"
            data-modal-download-button
            @click="handleDownload"
          >
            <Download class="h-3 w-3" />
            Download
          </button>
          <button
            class="p-1 rounded hover:bg-accent text-muted-foreground"
            data-modal-close-button
            aria-label="Close"
            @click="closeClip"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>

      <!-- Video player -->
      <div class="relative w-full bg-black aspect-video">
        <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center">
          <svg
            class="h-8 w-8 animate-spin text-white/40"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        </div>
        <div
          v-else-if="error"
          class="absolute inset-0 flex items-center justify-center text-sm text-destructive"
          data-modal-error
        >
          {{ error }}
        </div>
        <video
          v-else-if="activeClipId"
          :src="`/api/clips/${activeClipId}/download`"
          class="w-full h-full"
          controls
          data-modal-video
        />
      </div>

      <!-- Clip metadata -->
      <div v-if="clipData" class="px-4 py-3 space-y-1">
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <span v-if="formatDuration(clipData.durationSeconds)" data-modal-duration>
            {{ formatDuration(clipData.durationSeconds) }}
          </span>
          <span v-if="clipData.showClipper && clipData.clipperName" data-modal-clipper>
            Clipped by {{ clipData.clipperName }}
          </span>
        </div>
        <p v-if="clipData.description" class="text-sm text-muted-foreground" data-modal-description>
          {{ clipData.description }}
        </p>
      </div>
    </div>
  </div>
</template>
