<template>
  <div class="relative min-h-full">
    <!-- Offline overlay (stream not live) -->
    <div
      v-if="showOfflineOverlay"
      class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[hsl(var(--sidebar))]/90 backdrop-blur-sm"
    >
      <Lock class="w-7 h-7 text-muted-foreground" />
      <p class="text-sm text-muted-foreground text-center px-6 leading-snug">
        {{ overlayMessage }}
      </p>
    </div>

    <div class="px-4 py-3 space-y-4">
      <!-- Error banner -->
      <div
        v-if="lastError"
        class="text-xs bg-red-500/10 border border-red-500/30 text-red-400 rounded px-3 py-2"
      >
        {{ lastError }}
      </div>

      <!-- Pi Offline Banner (stream live but Pi temporarily unreachable via frp) -->
      <div
        v-if="piReachable === false && !showOfflineOverlay"
        class="text-xs bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 rounded px-3 py-2"
      >
        Pi Offline — changes apply on reconnect
      </div>

      <!-- Loading skeleton -->
      <div v-if="isLoading" class="space-y-4">
        <div v-for="i in CAMERA_CONTROL_META.length" :key="i" class="space-y-2">
          <div class="h-3 w-1/2 bg-muted rounded animate-pulse" />
          <div class="h-2 w-full bg-muted rounded animate-pulse" />
        </div>
      </div>

      <template v-else>
        <div v-for="section in sections" :key="section">
          <!-- Section header -->
          <p class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3 mt-5 first:mt-0">
            {{ section }}
          </p>

          <div class="space-y-4">
            <template v-for="ctrl in getControlsForSection(section)" :key="ctrl.key">

              <!-- Switch -->
              <div v-if="ctrl.type === 'switch'" class="flex items-center justify-between">
                <label :for="ctrl.key" class="text-sm text-foreground cursor-pointer select-none">
                  {{ ctrl.label }}
                </label>
                <Switch
                  :id="ctrl.key"
                  :checked="!!getValue(ctrl.key, ctrl.defaultValue)"
                  @update:checked="(v: boolean) => patchSetting(ctrl.key, v)"
                />
              </div>

              <!-- Slider -->
              <div v-else-if="ctrl.type === 'slider'" class="space-y-1.5">
                <div class="flex items-center justify-between">
                  <label :for="ctrl.key" class="text-sm text-foreground">{{ ctrl.label }}</label>
                  <span class="text-sm tabular-nums text-muted-foreground">
                    {{ displaySliderValue(ctrl.key, ctrl.defaultValue) }}
                  </span>
                </div>
                <Slider
                  :id="ctrl.key"
                  :model-value="[Number(getValue(ctrl.key, ctrl.defaultValue))]"
                  :min="ctrl.min ?? 0"
                  :max="ctrl.max ?? 1"
                  :step="ctrl.step ?? 0.01"
                  @update:model-value="(v) => v && handleSliderChange(ctrl.key, v[0])"
                />
              </div>

              <!-- Select -->
              <div v-else-if="ctrl.type === 'select'" class="space-y-1.5">
                <label :for="ctrl.key" class="text-sm text-foreground">{{ ctrl.label }}</label>
                <select
                  :id="ctrl.key"
                  :value="String(getValue(ctrl.key, ctrl.defaultValue))"
                  @change="(e) => debouncedPatch(ctrl.key, (e.target as HTMLSelectElement).value)"
                  class="w-full bg-input border border-border text-foreground text-sm rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option
                    v-for="opt in ctrl.options"
                    :key="opt.value"
                    :value="opt.value"
                  >{{ opt.label }}</option>
                </select>
              </div>

              <!-- Number -->
              <div v-else-if="ctrl.type === 'number'" class="space-y-1.5">
                <label :for="ctrl.key" class="text-sm text-foreground">{{ ctrl.label }}</label>
                <input
                  :id="ctrl.key"
                  type="number"
                  :value="Number(getValue(ctrl.key, ctrl.defaultValue))"
                  :min="ctrl.min"
                  :max="ctrl.max"
                  :step="ctrl.step ?? 1"
                  @change="(e) => debouncedPatch(ctrl.key, Number((e.target as HTMLInputElement).value))"
                  class="w-full bg-input border border-border text-foreground text-sm rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <p v-if="ctrl.description" class="text-[11px] text-muted-foreground">
                  {{ ctrl.description }}
                </p>
              </div>

              <!-- Text -->
              <div v-else-if="ctrl.type === 'text'" class="space-y-1.5">
                <label :for="ctrl.key" class="text-sm text-foreground">{{ ctrl.label }}</label>
                <input
                  :id="ctrl.key"
                  type="text"
                  :value="String(getValue(ctrl.key, ctrl.defaultValue))"
                  @change="(e) => debouncedPatch(ctrl.key, (e.target as HTMLInputElement).value)"
                  class="w-full bg-input border border-border text-foreground text-sm rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <p v-if="ctrl.description" class="text-[11px] text-muted-foreground">
                  {{ ctrl.description }}
                </p>
              </div>

              <!-- Dual number -->
              <div v-else-if="ctrl.type === 'dual-number'" class="space-y-1.5">
                <label class="text-sm text-foreground">{{ ctrl.label }}</label>
                <div class="flex gap-2">
                  <div class="flex-1 space-y-1">
                    <span class="text-[11px] text-muted-foreground">Red</span>
                    <input
                      type="number"
                      :value="(getValue(ctrl.key, ctrl.defaultValue) as number[])?.[0] ?? 0"
                      :min="ctrl.min" :max="ctrl.max" :step="ctrl.step ?? 0.01"
                      @change="(e) => handleDualChange(ctrl.key, 0, Number((e.target as HTMLInputElement).value))"
                      class="w-full bg-input border border-border text-foreground text-sm rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div class="flex-1 space-y-1">
                    <span class="text-[11px] text-muted-foreground">Blue</span>
                    <input
                      type="number"
                      :value="(getValue(ctrl.key, ctrl.defaultValue) as number[])?.[1] ?? 0"
                      :min="ctrl.min" :max="ctrl.max" :step="ctrl.step ?? 0.01"
                      @change="(e) => handleDualChange(ctrl.key, 1, Number((e.target as HTMLInputElement).value))"
                      class="w-full bg-input border border-border text-foreground text-sm rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
              </div>

            </template>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, watch } from 'vue';
import { Lock } from 'lucide-vue-next';
import { useCameraControls } from '@/composables/useCameraControls';
import { useStream } from '@/composables/useStream';
import { CAMERA_CONTROL_META, type CameraControlMeta, type CameraControlKey } from '@manlycam/types';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

const { settings, piReachable, isLoading, lastError, fetchSettings, patchSetting } = useCameraControls();
const { streamState } = useStream();

onMounted(() => { fetchSettings(); });

// Keep piReachable in sync with real-time stream state from WebSocket
watch(streamState, (state) => {
  if (state === 'live') {
    piReachable.value = true;
  } else if (state === 'unreachable' || state === 'explicit-offline') {
    piReachable.value = false;
  }
});

// Overlay when stream is not live (controls would have no effect)
const showOfflineOverlay = computed(
  () => streamState.value === 'unreachable' || streamState.value === 'explicit-offline'
);

const overlayMessage = computed(() =>
  streamState.value === 'explicit-offline'
    ? 'Start the stream to manage camera settings'
    : 'Pi is offline — start the stream to manage camera settings'
);

// Per-key debounce timers (used for all non-switch controls)
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function debouncedPatch(key: string, value: unknown): void {
  if (debounceTimers.has(key)) clearTimeout(debounceTimers.get(key)!);
  debounceTimers.set(key, setTimeout(() => {
    patchSetting(key, value);
    debounceTimers.delete(key);
  }, 300));
}

function handleSliderChange(key: string, value: number): void {
  // Update immediately so the controlled Slider component can track the drag visually
  settings.value = { ...settings.value, [key as CameraControlKey]: value };
  debouncedPatch(key, value);
}

function handleDualChange(key: string, index: number, value: number): void {
  const current = (settings.value[key as CameraControlKey] as number[] | undefined) ?? [0, 0];
  const updated = [...current];
  updated[index] = value;
  debouncedPatch(key, updated);
}

function getValue(key: string, defaultValue: unknown): unknown {
  const v = settings.value[key as CameraControlKey];
  return v !== undefined ? v : defaultValue;
}

function displaySliderValue(key: string, defaultValue: unknown): string {
  const v = Number(getValue(key, defaultValue));
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function isControlVisible(ctrl: CameraControlMeta): boolean {
  if (!ctrl.showIf) return true;
  return settings.value[ctrl.showIf.key] === ctrl.showIf.value;
}

const SECTION_ORDER = ['Image', 'Exposure', 'White Balance', 'Autofocus', 'Overlay'] as const;

const sections = computed(() => {
  const visible = new Set(
    CAMERA_CONTROL_META.filter(isControlVisible).map((c) => c.section)
  );
  return SECTION_ORDER.filter((s) => visible.has(s));
});

function getControlsForSection(section: string): CameraControlMeta[] {
  return CAMERA_CONTROL_META.filter((c) => c.section === section && isControlVisible(c));
}
</script>
