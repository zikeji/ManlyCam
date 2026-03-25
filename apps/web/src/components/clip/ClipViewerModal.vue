<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { X, Download } from 'lucide-vue-next';
import { apiFetch } from '@/lib/api';
import { closeClip, activeClipId } from '@/composables/useClipModal';
import { renderMarkdown } from '@/lib/markdown';

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

const renderedDescription = computed(() =>
  clipData.value?.description ? renderMarkdown(clipData.value.description) : null,
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
        <div
          v-if="clipData.showClipper && clipData.clipperName"
          class="text-xs text-muted-foreground"
          data-modal-clipper
        >
          Clipped by {{ clipData.clipperName }}
        </div>
        <div
          v-if="renderedDescription"
          class="text-sm text-muted-foreground break-words [&_a]:underline [&_a]:text-primary [&_code]:font-mono [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-1 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground [&_blockquote]:pl-3 [&_blockquote]:py-1 [&_blockquote]:my-1 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_s]:line-through [&_del]:line-through"
          data-modal-description
          v-html="renderedDescription"
        />
      </div>
    </div>
  </div>
</template>
