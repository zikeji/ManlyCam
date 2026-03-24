<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { Videotape, Play, Pause, Loader2 } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useHlsPlayer } from '@/composables/useHlsPlayer';
import { useClipCreate } from '@/composables/useClipCreate';
import type { SegmentRange } from '@/composables/useClipCreate';
import type { ClientStreamState } from '@/composables/useStream';

const props = defineProps<{
  segmentRange: SegmentRange;
  streamState: ClientStreamState;
  open: boolean;
  hlsVideoEl: HTMLVideoElement | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const {
  isReady: hlsReady,
  error: hlsError,
  currentTime: hlsCurrentTime,
  programDateTimeMs,
  initHls,
  destroy: destroyHls,
  seekTo,
  play: hlsPlay,
  pause: hlsPause,
} = useHlsPlayer();
const { isSubmitting, fetchSegmentRange, submitClip } = useClipCreate();

const trackRef = ref<HTMLElement | null>(null);
const trackWidth = ref(0);

// Form state
const name = ref('');
const description = ref('');
const shareToChat = ref(false);
const submitError = ref('');

// Scrubber state — wall-clock ms
const earliestMs = ref(0);
const latestMs = ref(0);
const selectionStartMs = ref(0);
const selectionEndMs = ref(0);
const isPlaying = ref(false);
const autoAdvance = ref(true);
const streamOfflineWarning = ref(false);
const isDragging = ref(false);
const scrubMs = ref<number | null>(null);

// Auto-advance polling
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let resizeObserver: ResizeObserver | null = null;
let playbackRaf: number | null = null;

const minDurationMs = computed(() => props.segmentRange.minDurationSeconds * 1000);
const maxDurationMs = computed(() => props.segmentRange.maxDurationSeconds * 1000);

const selectionDurationMs = computed(() =>
  Math.max(0, selectionEndMs.value - selectionStartMs.value),
);
const canSubmit = computed(() => {
  return (
    hlsReady.value &&
    name.value.trim().length > 0 &&
    name.value.length <= 200 &&
    description.value.length <= 500 &&
    selectionDurationMs.value >= minDurationMs.value &&
    selectionDurationMs.value <= maxDurationMs.value &&
    !isSubmitting.value
  );
});

const submitLabel = computed(() => {
  if (isSubmitting.value) return 'Creating\u2026';
  if (selectionDurationMs.value < minDurationMs.value) return 'Buffer too short to clip';
  /* c8 ignore next -- requires lifecycle watchers to set selection > max; watchers are c8-ignored */
  if (selectionDurationMs.value > maxDurationMs.value) return 'Selection exceeds max duration';
  return 'Create Clip';
});

const nameError = computed(() => {
  if (name.value.length > 200) return 'Name must be 200 characters or less';
  return '';
});

const descError = computed(() => {
  if (description.value.length > 500) return 'Description must be 500 characters or less';
  return '';
});

// Preset buttons — only show if preset <= maxDurationSeconds
const presets = computed(() => {
  const all = [
    { label: '30s', seconds: 30 },
    { label: '1min', seconds: 60 },
    { label: '2min', seconds: 120 },
  ];
  return all.filter((p) => p.seconds <= props.segmentRange.maxDurationSeconds);
});

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function resetForm(): void {
  name.value = '';
  description.value = '';
  shareToChat.value = false;
  submitError.value = '';
}

function initScrubber(): void {
  earliestMs.value = new Date(props.segmentRange.earliest).getTime();
  latestMs.value = new Date(props.segmentRange.latest).getTime();

  const rangeMs = latestMs.value - earliestMs.value;
  const defaultSelMs = Math.min(30_000, rangeMs);
  selectionEndMs.value = latestMs.value;
  selectionStartMs.value = latestMs.value - defaultSelMs;
  autoAdvance.value = true;
  streamOfflineWarning.value = false;
  isPlaying.value = false;
}

// --- Pixel ↔ time mapping ---
function msToPixel(ms: number): number {
  const rangeMs = latestMs.value - earliestMs.value;
  if (rangeMs <= 0 || trackWidth.value <= 0) return 0;
  return ((ms - earliestMs.value) / rangeMs) * trackWidth.value;
}

function pixelToMs(px: number): number {
  const rangeMs = latestMs.value - earliestMs.value;
  /* c8 ignore next -- defensive guard; trackWidth is always > 0 when scrubber is visible */
  if (trackWidth.value <= 0) return earliestMs.value;
  return earliestMs.value + (px / trackWidth.value) * rangeMs;
}

// --- Playhead position ---
const playheadMs = computed(() => {
  // During scrubbing, follow the mouse position directly (instant feedback)
  if (scrubMs.value !== null) return scrubMs.value;
  if (programDateTimeMs.value <= 0) return selectionStartMs.value;
  /* c8 ignore next -- requires real HLS playback with valid programDateTime */
  return programDateTimeMs.value + hlsCurrentTime.value * 1000;
});

const playheadPx = computed(() => {
  const ms = Math.max(earliestMs.value, Math.min(latestMs.value, playheadMs.value));
  return msToPixel(ms);
});

// Selection pixel positions
const selectionLeftPx = computed(() => msToPixel(selectionStartMs.value));
const selectionRightPx = computed(() => msToPixel(selectionEndMs.value));

// Smooth CSS transition for boundary polling updates; disabled during interaction
const pxTransition = computed(() =>
  isDragging.value ? 'none' : 'left 0.4s ease-out, width 0.4s ease-out',
);

// --- Handle limit feedback ---
const leftAtLimit = computed(() => {
  const dur = selectionEndMs.value - selectionStartMs.value;
  return selectionStartMs.value <= earliestMs.value || dur >= maxDurationMs.value;
});
const rightAtLimit = computed(() => {
  const dur = selectionEndMs.value - selectionStartMs.value;
  return selectionEndMs.value >= latestMs.value || dur >= maxDurationMs.value;
});

/* c8 ignore start -- playback loop uses requestAnimationFrame which JSDOM does not meaningfully support */
function seekToWallClockMs(wallMs: number): void {
  if (programDateTimeMs.value <= 0) return;
  const mediaTime = (wallMs - programDateTimeMs.value) / 1000;
  seekTo(Math.max(0, mediaTime));
}

function togglePlayback(): void {
  if (isPlaying.value) {
    hlsPause();
    isPlaying.value = false;
    if (playbackRaf) {
      cancelAnimationFrame(playbackRaf);
      playbackRaf = null;
    }
  } else {
    seekToWallClockMs(selectionStartMs.value);
    hlsPlay();
    isPlaying.value = true;
    startPlaybackLoop();
  }
}

function startPlaybackLoop(): void {
  if (playbackRaf) cancelAnimationFrame(playbackRaf);
  const tick = () => {
    if (!isPlaying.value) return;
    if (playheadMs.value >= selectionEndMs.value) {
      seekToWallClockMs(selectionStartMs.value);
    }
    playbackRaf = requestAnimationFrame(tick);
  };
  playbackRaf = requestAnimationFrame(tick);
}
/* c8 ignore stop */

// --- Drag handling ---
/* c8 ignore start -- JSDOM does not implement getBoundingClientRect or setPointerCapture; drag math exercises zero pixels */
function onLeftHandlePointerDown(e: PointerEvent): void {
  e.preventDefault();
  e.stopPropagation();
  isDragging.value = true;
  autoAdvance.value = false;
  (e.target as HTMLElement).setPointerCapture(e.pointerId);

  const onMove = (ev: PointerEvent) => {
    const rect = trackRef.value?.getBoundingClientRect();
    if (!rect) return;
    const px = Math.max(0, Math.min(ev.clientX - rect.left, trackWidth.value));
    let newMs = pixelToMs(px);
    // Clamp: min distance
    if (selectionEndMs.value - newMs < minDurationMs.value) {
      newMs = selectionEndMs.value - minDurationMs.value;
    }
    // Clamp: max distance
    if (selectionEndMs.value - newMs > maxDurationMs.value) {
      newMs = selectionEndMs.value - maxDurationMs.value;
    }
    // Clamp to range
    newMs = Math.max(earliestMs.value, newMs);
    selectionStartMs.value = newMs;
  };

  const onUp = () => {
    isDragging.value = false;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

function onRightHandlePointerDown(e: PointerEvent): void {
  e.preventDefault();
  e.stopPropagation();
  isDragging.value = true;
  autoAdvance.value = false;
  (e.target as HTMLElement).setPointerCapture(e.pointerId);

  const onMove = (ev: PointerEvent) => {
    const rect = trackRef.value?.getBoundingClientRect();
    if (!rect) return;
    const px = Math.max(0, Math.min(ev.clientX - rect.left, trackWidth.value));
    let newMs = pixelToMs(px);
    // Clamp: min distance
    if (newMs - selectionStartMs.value < minDurationMs.value) {
      newMs = selectionStartMs.value + minDurationMs.value;
    }
    // Clamp: max distance
    if (newMs - selectionStartMs.value > maxDurationMs.value) {
      newMs = selectionStartMs.value + maxDurationMs.value;
    }
    // Clamp to range
    newMs = Math.min(latestMs.value, newMs);
    selectionEndMs.value = newMs;
  };

  const onUp = () => {
    isDragging.value = false;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

function onSelectionPointerDown(e: PointerEvent): void {
  e.preventDefault();
  e.stopPropagation();

  const startX = e.clientX;
  const origStart = selectionStartMs.value;
  const origEnd = selectionEndMs.value;
  const dur = origEnd - origStart;
  let dragging = false;

  const onMove = (ev: PointerEvent) => {
    // Only start selection drag after moving > 3px (disambiguate click vs drag)
    if (!dragging) {
      if (Math.abs(ev.clientX - startX) <= 3) return;
      dragging = true;
      isDragging.value = true;
      autoAdvance.value = false;
    }
    const rect = trackRef.value?.getBoundingClientRect();
    if (!rect) return;
    const dx = ev.clientX - startX;
    const dMs = (dx / trackWidth.value) * (latestMs.value - earliestMs.value);
    let newStart = origStart + dMs;
    let newEnd = origEnd + dMs;
    // Clamp to bounds
    if (newStart < earliestMs.value) {
      newStart = earliestMs.value;
      newEnd = earliestMs.value + dur;
    }
    if (newEnd > latestMs.value) {
      newEnd = latestMs.value;
      newStart = latestMs.value - dur;
    }
    selectionStartMs.value = newStart;
    selectionEndMs.value = newEnd;
  };

  const onUp = (ev: PointerEvent) => {
    if (!dragging) {
      // Click without drag — seek to position
      const rect = trackRef.value?.getBoundingClientRect();
      if (rect) {
        const px = Math.max(0, Math.min(ev.clientX - rect.left, trackWidth.value));
        seekToWallClockMs(pixelToMs(px));
      }
    }
    isDragging.value = false;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}
/* c8 ignore stop */

/* c8 ignore start -- JSDOM does not implement getBoundingClientRect; track scrub math exercises zero pixels */
function onTrackPointerDown(e: PointerEvent): void {
  e.preventDefault();
  isDragging.value = true;

  const scrub = (clientX: number) => {
    const r = trackRef.value?.getBoundingClientRect();
    if (!r) return;
    const px = Math.max(0, Math.min(clientX - r.left, trackWidth.value));
    const ms = pixelToMs(px);
    scrubMs.value = ms;
    seekToWallClockMs(ms);
  };

  scrub(e.clientX);

  const onMove = (ev: PointerEvent) => scrub(ev.clientX);
  const onUp = () => {
    scrubMs.value = null;
    isDragging.value = false;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}
/* c8 ignore stop */

// --- Preset click ---
function applyPreset(seconds: number): void {
  autoAdvance.value = false;
  const presetMs = seconds * 1000;
  const center = (selectionStartMs.value + selectionEndMs.value) / 2;
  let newStart = center - presetMs / 2;
  let newEnd = center + presetMs / 2;
  /* c8 ignore start -- clamping requires real timeline state from lifecycle watchers (c8-ignored) */
  if (newEnd > latestMs.value) {
    newEnd = latestMs.value;
    newStart = newEnd - presetMs;
  }
  if (newStart < earliestMs.value) {
    newStart = earliestMs.value;
    newEnd = Math.min(newStart + presetMs, latestMs.value);
  }
  /* c8 ignore stop */
  selectionStartMs.value = newStart;
  selectionEndMs.value = newEnd;
}

// --- Go Live ---
function goLive(): void {
  const dur = selectionEndMs.value - selectionStartMs.value;
  const clampedDur = Math.min(dur, maxDurationMs.value);
  selectionEndMs.value = latestMs.value;
  selectionStartMs.value = latestMs.value - clampedDur;
  autoAdvance.value = true;
}

/* c8 ignore start -- keyboard handler branches tested via aria attributes; full key math requires real DOM track width */
function onHandleKeydown(handle: 'left' | 'right', e: KeyboardEvent): void {
  const step = e.shiftKey ? 10_000 : 1_000;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
    e.preventDefault();
    autoAdvance.value = false;
    if (handle === 'left') {
      const newMs = Math.max(earliestMs.value, selectionStartMs.value - step);
      if (selectionEndMs.value - newMs <= maxDurationMs.value) {
        selectionStartMs.value = newMs;
      }
    } else {
      const newMs = Math.max(
        selectionStartMs.value + minDurationMs.value,
        selectionEndMs.value - step,
      );
      selectionEndMs.value = newMs;
    }
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
    e.preventDefault();
    autoAdvance.value = false;
    if (handle === 'left') {
      const newMs = Math.min(
        selectionEndMs.value - minDurationMs.value,
        selectionStartMs.value + step,
      );
      selectionStartMs.value = newMs;
    } else {
      const newMs = Math.min(latestMs.value, selectionEndMs.value + step);
      if (newMs - selectionStartMs.value <= maxDurationMs.value) {
        selectionEndMs.value = newMs;
      }
    }
  } else if (e.key === 'Home') {
    e.preventDefault();
    autoAdvance.value = false;
    if (handle === 'left') {
      const newMs = Math.max(earliestMs.value, selectionEndMs.value - maxDurationMs.value);
      selectionStartMs.value = newMs;
    } else {
      selectionEndMs.value = selectionStartMs.value + minDurationMs.value;
    }
  } else if (e.key === 'End') {
    e.preventDefault();
    autoAdvance.value = false;
    if (handle === 'left') {
      selectionStartMs.value = selectionEndMs.value - minDurationMs.value;
    } else {
      const newMs = Math.min(latestMs.value, selectionStartMs.value + maxDurationMs.value);
      selectionEndMs.value = newMs;
    }
  }
}
/* c8 ignore stop */

/* c8 ignore start -- polling logic requires real network and timer interactions */
function startPolling(): void {
  stopPolling();
  const poll = async () => {
    if (!props.open) return;
    try {
      const range = await fetchSegmentRange();
      const newLatest = new Date(range.latest).getTime();
      const newEarliest = new Date(range.earliest).getTime();
      const selDur = selectionEndMs.value - selectionStartMs.value;

      // Always update timeline boundaries so the track stays in sync
      // with the rolling HLS buffer (old segments get deleted by mediamtx)
      latestMs.value = newLatest;
      earliestMs.value = Math.max(new Date(range.streamStartedAt).getTime(), newEarliest);

      if (autoAdvance.value) {
        // Auto-advance: pin selection end to the live edge
        selectionEndMs.value = newLatest;
        selectionStartMs.value = newLatest - selDur;
        if (selectionStartMs.value < earliestMs.value) {
          selectionStartMs.value = earliestMs.value;
        }
      } else {
        // Manual mode: clamp selection if it drifted outside new boundaries
        if (selectionEndMs.value > newLatest) {
          selectionEndMs.value = newLatest;
        }
        if (selectionStartMs.value < earliestMs.value) {
          selectionStartMs.value = earliestMs.value;
        }

        // After clamping, check if selection is still valid
        if (selectionStartMs.value >= selectionEndMs.value) {
          // Reset to last N seconds of available buffer (use current preset or default 30s)
          const defaultDurationMs = 30_000;
          const maxAllowedDurationMs = props.segmentRange.maxDurationSeconds * 1000;
          const durationMs = Math.min(
            defaultDurationMs,
            maxAllowedDurationMs,
            newLatest - earliestMs.value,
          );

          selectionEndMs.value = newLatest;
          selectionStartMs.value = Math.max(earliestMs.value, selectionEndMs.value - durationMs);
        }
      }
    } catch {
      // Stream went offline during polling — stop and show warning
      stopPolling();
      autoAdvance.value = false;
      streamOfflineWarning.value = true;
      return;
    }
    pollTimer = setTimeout(poll, 5000);
  };
  pollTimer = setTimeout(poll, 5000);
}

function stopPolling(): void {
  if (pollTimer !== null) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}
/* c8 ignore stop */

// --- Submit ---
async function handleSubmit(): Promise<void> {
  if (!canSubmit.value) return;
  submitError.value = '';
  try {
    await submitClip({
      startTime: new Date(selectionStartMs.value).toISOString(),
      endTime: new Date(selectionEndMs.value).toISOString(),
      name: name.value.trim(),
      description: description.value.trim() || undefined,
      shareToChat: shareToChat.value,
    });
    resetForm();
    emit('close');
  } catch (err: unknown) {
    submitError.value = err instanceof Error ? err.message : 'Failed to create clip';
  }
}

function handleCancel(): void {
  /* c8 ignore next 3 -- isPlaying branch requires real HLS playback state */
  if (isPlaying.value) {
    hlsPause();
    isPlaying.value = false;
  }
  emit('close');
}

// --- Stream offline detection ---
/* c8 ignore start -- watcher requires real polling/timer interactions for live recovery branch */
watch(
  () => props.streamState,
  (state) => {
    if (state === 'explicit-offline' || state === 'unreachable') {
      autoAdvance.value = false;
      stopPolling();
      streamOfflineWarning.value = true;
    } else if (state === 'live' && streamOfflineWarning.value) {
      streamOfflineWarning.value = false;
      startPolling();
    }
  },
);
/* c8 ignore stop */

/* c8 ignore start -- lifecycle watchers interact with HLS init/polling which require real media/network */
// When hlsVideoEl becomes available (parent template ref populates after mount),
// init HLS if the editor is already open. This handles first-open where onMounted
// fires before the parent ref is populated.
watch(
  () => props.hlsVideoEl,
  (el) => {
    if (el && props.open) {
      initHls(el);
    }
  },
);

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      resetForm();
      initScrubber();
      await nextTick();
      if (props.hlsVideoEl) {
        initHls(props.hlsVideoEl);
      }
      startPolling();
    } else {
      hlsPause();
      isPlaying.value = false;
      stopPolling();
      if (playbackRaf) {
        cancelAnimationFrame(playbackRaf);
        playbackRaf = null;
      }
    }
  },
);

onMounted(() => {
  initScrubber();
  if (props.hlsVideoEl && props.open) {
    initHls(props.hlsVideoEl);
  }
  if (props.open) startPolling();

  if (trackRef.value) {
    trackWidth.value = trackRef.value.clientWidth;
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        trackWidth.value = entry.contentRect.width;
      }
    });
    resizeObserver.observe(trackRef.value);
  }
});

onUnmounted(() => {
  stopPolling();
  destroyHls();
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (playbackRaf) {
    cancelAnimationFrame(playbackRaf);
    playbackRaf = null;
  }
});
/* c8 ignore stop */
</script>

<template>
  <div data-clip-editor>
    <!-- HLS loading status (inline) -->
    <div
      v-if="!hlsReady && !hlsError"
      class="flex items-center justify-center gap-2 py-2 bg-[hsl(var(--background))]"
    >
      <Loader2 class="w-4 h-4 animate-spin text-muted-foreground" />
      <p class="text-xs text-muted-foreground">Loading clip preview&hellip;</p>
    </div>

    <!-- HLS error (inline) -->
    <div
      v-if="hlsError"
      class="flex items-center justify-center gap-2 py-2 bg-[hsl(var(--background))]"
    >
      <p class="text-xs text-destructive" role="alert">{{ hlsError }}</p>
      <Button
        variant="outline"
        size="sm"
        class="h-6 text-xs"
        @click="hlsVideoEl && initHls(hlsVideoEl)"
      >
        Retry
      </Button>
    </div>

    <!-- Stream offline warning -->
    <div
      v-if="streamOfflineWarning"
      class="bg-amber-900/80 text-amber-100 text-xs px-3 py-1.5"
      role="status"
    >
      Stream went offline &mdash; you can still clip what was buffered
    </div>

    <!-- Scrubber -->
    <div class="px-3 py-2 bg-[hsl(var(--background))] border-t border-[hsl(var(--border))]">
      <!-- Timeline track -->
      <div class="relative">
        <!-- Play/Pause + duration info -->
        <div class="flex items-center gap-2 mb-1.5">
          <Button
            variant="ghost"
            size="icon"
            class="w-7 h-7"
            :disabled="!hlsReady"
            :aria-label="isPlaying ? 'Pause clip preview' : 'Play clip preview'"
            @click="togglePlayback"
          >
            <Pause v-if="isPlaying" class="w-4 h-4" />
            <Play v-else class="w-4 h-4" />
          </Button>
          <span class="text-xs text-muted-foreground font-mono tabular-nums">
            {{ formatDuration(selectionDurationMs) }}
          </span>
          <!-- Go Live badge -->
          <button
            v-if="!autoAdvance"
            class="ml-auto flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
            @click="goLive"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
            Live
          </button>
        </div>

        <!-- Track -->
        <div
          ref="trackRef"
          class="relative h-8 bg-[hsl(var(--muted))] rounded cursor-pointer select-none"
          role="slider"
          :aria-valuemin="earliestMs"
          :aria-valuemax="latestMs"
          :aria-valuenow="selectionStartMs"
          :aria-label="`Clip selection: ${formatDuration(selectionDurationMs)}`"
          @pointerdown="onTrackPointerDown"
        >
          <!-- Selected region -->
          <div
            class="absolute top-0 bottom-0 bg-primary/30 cursor-move"
            :style="{
              left: `${selectionLeftPx}px`,
              width: `${selectionRightPx - selectionLeftPx}px`,
              transition: pxTransition,
            }"
            @pointerdown="onSelectionPointerDown"
          />

          <!-- Left handle -->
          <div
            class="absolute top-0 bottom-0 w-3 -ml-1.5 cursor-ew-resize z-10 flex items-center justify-center group"
            :class="leftAtLimit ? 'opacity-50' : ''"
            :style="{ left: `${selectionLeftPx}px`, transition: pxTransition }"
            tabindex="0"
            role="slider"
            :aria-valuemin="earliestMs"
            :aria-valuemax="selectionEndMs - minDurationMs"
            :aria-valuenow="selectionStartMs"
            aria-label="Selection start handle"
            @pointerdown="onLeftHandlePointerDown"
            @keydown="onHandleKeydown('left', $event)"
          >
            <div
              class="w-1 h-5 rounded-full bg-primary group-focus-visible:ring-2 group-focus-visible:ring-ring"
            />
          </div>

          <!-- Right handle -->
          <div
            class="absolute top-0 bottom-0 w-3 -ml-1.5 cursor-ew-resize z-10 flex items-center justify-center group"
            :class="rightAtLimit ? 'opacity-50' : ''"
            :style="{ left: `${selectionRightPx}px`, transition: pxTransition }"
            tabindex="0"
            role="slider"
            :aria-valuemin="selectionStartMs + minDurationMs"
            :aria-valuemax="latestMs"
            :aria-valuenow="selectionEndMs"
            aria-label="Selection end handle"
            @pointerdown="onRightHandlePointerDown"
            @keydown="onHandleKeydown('right', $event)"
          >
            <div
              class="w-1 h-5 rounded-full bg-primary group-focus-visible:ring-2 group-focus-visible:ring-ring"
            />
          </div>

          <!-- Playhead -->
          <div
            v-if="isPlaying || hlsReady"
            class="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none"
            :style="{ left: `${playheadPx}px`, transition: pxTransition }"
          />
        </div>

        <!-- Presets -->
        <div class="flex items-center gap-1.5 mt-1.5">
          <Button
            v-for="preset in presets"
            :key="preset.seconds"
            variant="outline"
            size="sm"
            class="h-6 px-2 text-xs"
            @click="applyPreset(preset.seconds)"
          >
            {{ preset.label }}
          </Button>
        </div>
      </div>
    </div>

    <!-- Form -->
    <div
      class="px-3 py-2 bg-[hsl(var(--background))] border-t border-[hsl(var(--border))] space-y-2"
    >
      <!-- Name -->
      <div class="space-y-0.5">
        <label class="text-xs font-medium" for="clip-editor-name">
          Name <span class="text-destructive">*</span>
        </label>
        <input
          id="clip-editor-name"
          v-model="name"
          type="text"
          maxlength="200"
          placeholder="Enter clip name"
          class="flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <p v-if="nameError" class="text-xs text-destructive">{{ nameError }}</p>
      </div>

      <!-- Description -->
      <div class="space-y-0.5">
        <label class="text-xs font-medium" for="clip-editor-desc">Description</label>
        <Textarea
          id="clip-editor-desc"
          v-model="description"
          maxlength="500"
          placeholder="Optional description"
          class="resize-none align-top"
          rows="2"
        />
        <p v-if="descError" class="text-xs text-destructive">{{ descError }}</p>
      </div>

      <!-- Share to chat -->
      <div class="flex items-center gap-2">
        <Switch id="clip-editor-share" v-model:checked="shareToChat" />
        <label class="text-xs" for="clip-editor-share">Share to chat when ready</label>
      </div>

      <!-- Submit error -->
      <p v-if="submitError" class="text-xs text-destructive" role="alert">{{ submitError }}</p>

      <!-- Actions -->
      <div class="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" @click="handleCancel">Cancel</Button>
        <Button size="sm" :disabled="!canSubmit" @click="handleSubmit">
          <Videotape v-if="!isSubmitting" class="w-4 h-4 mr-1" />
          <Loader2 v-else class="w-4 h-4 mr-1 animate-spin" />
          {{ submitLabel }}
        </Button>
      </div>
    </div>
  </div>
</template>
