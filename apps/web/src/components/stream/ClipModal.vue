<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Videotape } from 'lucide-vue-next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useClipCreate } from '@/composables/useClipCreate';
import type { SegmentRange } from '@/composables/useClipCreate';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const { isSubmitting, fetchSegmentRange, submitClip } = useClipCreate();

const segmentRange = ref<SegmentRange | null>(null);
const rangeFetchedAt = ref<number | null>(null);
const rangeError = ref('');
const startOffsetMs = ref(0);
const endOffsetMs = ref(0);
const name = ref('');
const description = ref('');
const shareToChat = ref(false);
const submitError = ref('');

const RANGE_STALE_THRESHOLD_MS = 30000;

// Total available window in ms
const windowMs = computed(() => {
  if (!segmentRange.value) return 0;
  return (
    new Date(segmentRange.value.latest).getTime() - new Date(segmentRange.value.earliest).getTime()
  );
});

const startTime = computed(() => {
  if (!segmentRange.value) return '';
  return new Date(
    new Date(segmentRange.value.earliest).getTime() + startOffsetMs.value,
  ).toISOString();
});

const endTime = computed(() => {
  if (!segmentRange.value) return '';
  return new Date(
    new Date(segmentRange.value.earliest).getTime() + endOffsetMs.value,
  ).toISOString();
});

const durationSeconds = computed(() => {
  return Math.round((endOffsetMs.value - startOffsetMs.value) / 1000);
});

const isRangeStale = computed(() => {
  if (!rangeFetchedAt.value) return false;
  return Date.now() - rangeFetchedAt.value > RANGE_STALE_THRESHOLD_MS;
});

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function applyPreset(seconds: number): void {
  if (!segmentRange.value) return;
  const presetMs = seconds * 1000;
  endOffsetMs.value = windowMs.value;
  startOffsetMs.value = Math.max(0, windowMs.value - presetMs);
}

function clampRange(): void {
  /* c8 ignore next -- sliders only render when segmentRange is set; this guard is defensive */
  if (!segmentRange.value) return;
  startOffsetMs.value = Math.max(0, Math.min(startOffsetMs.value, endOffsetMs.value - 1000));
  endOffsetMs.value = Math.min(
    windowMs.value,
    Math.max(endOffsetMs.value, startOffsetMs.value + 1000),
  );
}

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return;
    rangeError.value = '';
    submitError.value = '';
    name.value = '';
    description.value = '';
    shareToChat.value = false;
    segmentRange.value = null;
    try {
      segmentRange.value = await fetchSegmentRange();
      rangeFetchedAt.value = Date.now();
      // Default: last 30s
      endOffsetMs.value = windowMs.value;
      startOffsetMs.value = Math.max(0, windowMs.value - 30_000);
    } catch (err: unknown) {
      rangeError.value = err instanceof Error ? err.message : 'Could not load stream range';
    }
  },
);

const nameError = computed(() => {
  if (name.value.length > 200) return 'Name must be 200 characters or less';
  return '';
});

const descError = computed(() => {
  if (description.value.length > 500) return 'Description must be 500 characters or less';
  return '';
});

const canSubmit = computed(() => {
  return (
    !!segmentRange.value &&
    name.value.trim().length > 0 &&
    !nameError.value &&
    !descError.value &&
    durationSeconds.value > 0 &&
    durationSeconds.value <= 120 &&
    !isSubmitting.value
  );
});

async function handleSubmit(): Promise<void> {
  if (!canSubmit.value) return;
  submitError.value = '';
  try {
    await submitClip({
      startTime: startTime.value,
      endTime: endTime.value,
      name: name.value.trim(),
      description: description.value.trim() || undefined,
      shareToChat: shareToChat.value,
    });
    emit('update:open', false);
  } catch (err: unknown) {
    submitError.value = err instanceof Error ? err.message : 'Failed to create clip';
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Videotape class="w-5 h-5" />
          Create Clip
        </DialogTitle>
        <DialogDescription class="sr-only"
          >Select a range from the live stream buffer to create a clip.</DialogDescription
        >
      </DialogHeader>

      <div class="space-y-4 py-2">
        <!-- Range error -->
        <p v-if="rangeError" class="text-sm text-destructive" role="alert">{{ rangeError }}</p>

        <template v-if="segmentRange">
          <!-- Preset buttons -->
          <div class="space-y-2">
            <p class="text-sm font-medium text-muted-foreground">Quick select</p>
            <div class="flex gap-2">
              <Button variant="outline" size="sm" @click="applyPreset(30)">30s</Button>
              <Button variant="outline" size="sm" @click="applyPreset(60)">1 min</Button>
              <Button variant="outline" size="sm" @click="applyPreset(120)">2 min</Button>
            </div>
          </div>

          <!-- Range staleness warning -->
          <p v-if="isRangeStale" class="text-xs text-amber-600" role="status">
            Stream range may be stale. Consider closing and reopening to refresh.
          </p>

          <!-- Range sliders -->
          <div class="space-y-2">
            <p class="text-sm font-medium text-muted-foreground">
              Range: {{ formatDuration(endOffsetMs - startOffsetMs) }}
            </p>
            <div class="space-y-2">
              <div class="flex items-center gap-3">
                <span class="text-xs text-muted-foreground w-10 text-right">Start</span>
                <input
                  type="range"
                  class="flex-1"
                  :min="0"
                  :max="windowMs"
                  :step="1000"
                  :value="startOffsetMs"
                  @input="
                    startOffsetMs = Math.min(
                      Number(($event.target as HTMLInputElement).value),
                      endOffsetMs - 1000,
                    );
                    clampRange();
                  "
                />
                <span class="text-xs text-muted-foreground w-16">{{
                  formatDuration(startOffsetMs)
                }}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-xs text-muted-foreground w-10 text-right">End</span>
                <input
                  type="range"
                  class="flex-1"
                  :min="0"
                  :max="windowMs"
                  :step="1000"
                  :value="endOffsetMs"
                  @input="
                    endOffsetMs = Math.max(
                      Number(($event.target as HTMLInputElement).value),
                      startOffsetMs + 1000,
                    );
                    clampRange();
                  "
                />
                <span class="text-xs text-muted-foreground w-16">{{
                  formatDuration(endOffsetMs)
                }}</span>
              </div>
            </div>
          </div>

          <!-- Name -->
          <div class="space-y-1">
            <label class="text-sm font-medium" for="clip-name"
              >Name <span class="text-destructive">*</span></label
            >
            <input
              id="clip-name"
              v-model="name"
              type="text"
              maxlength="200"
              placeholder="Enter clip name"
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p v-if="nameError" class="text-xs text-destructive">{{ nameError }}</p>
          </div>

          <!-- Description -->
          <div class="space-y-1">
            <label class="text-sm font-medium" for="clip-desc">Description</label>
            <Textarea
              id="clip-desc"
              v-model="description"
              maxlength="500"
              placeholder="Optional description"
              class="resize-none"
              rows="2"
            />
            <p v-if="descError" class="text-xs text-destructive">{{ descError }}</p>
          </div>

          <!-- Share to chat -->
          <div class="flex items-center gap-3">
            <Switch id="share-to-chat" v-model:checked="shareToChat" />
            <label class="text-sm" for="share-to-chat">Share to chat when ready</label>
          </div>
        </template>

        <p v-else-if="!rangeError" class="text-sm text-muted-foreground">Loading stream range…</p>

        <!-- Submit error -->
        <p v-if="submitError" class="text-sm text-destructive" role="alert">{{ submitError }}</p>
      </div>

      <DialogFooter>
        <Button variant="ghost" @click="emit('update:open', false)">Cancel</Button>
        <Button :disabled="!canSubmit" @click="handleSubmit">
          {{ isSubmitting ? 'Creating…' : 'Create Clip' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
