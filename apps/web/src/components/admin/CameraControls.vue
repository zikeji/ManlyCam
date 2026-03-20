<template>
  <div class="relative min-h-full flex flex-col">
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

    <div class="px-4 py-3 space-y-4 flex-1">
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
                  :modelValue="!!getStagedOrValue(ctrl.key, ctrl.defaultValue, ctrl.restartRequired)"
                  @update:modelValue="handleSwitchChange(ctrl, $event)"
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
                  :value="String(getStagedOrValue(ctrl.key, ctrl.defaultValue, ctrl.restartRequired))"
                  @change="(e) => handleSelectChange(ctrl, (e.target as HTMLSelectElement).value)"
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
                  :value="Number(getDisplayValue(ctrl, getStagedOrValue(ctrl.key, ctrl.defaultValue, ctrl.restartRequired)))"
                  :min="ctrl.min"
                  :max="ctrl.max"
                  :step="ctrl.step ?? 1"
                  @change="(e) => handleNumberChange(ctrl, Number((e.target as HTMLInputElement).value))"
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
                  :value="String(getStagedOrValue(ctrl.key, ctrl.defaultValue, ctrl.restartRequired))"
                  @change="(e) => handleTextChange(ctrl, (e.target as HTMLInputElement).value)"
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

    <!-- Sticky footer — visible when staged changes exist -->
    <div
      v-if="hasStagedChanges"
      class="sticky bottom-0 flex gap-2 px-4 py-3 bg-[hsl(var(--sidebar))] border-t border-border"
    >
      <Button variant="outline" size="icon" title="Reset Changes" @click="openResetDialog">
        <RotateCcw class="w-4 h-4" />
      </Button>
      <Button class="flex-1" @click="openConfirmDialog">Apply</Button>
    </div>

    <!-- Confirmation dialog for restart-required settings -->
    <AlertDialog :open="confirmOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restart required</AlertDialogTitle>
          <AlertDialogDescription>
            Applying these settings will briefly restart the camera stream. Continue?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="handleConfirmCancel">Cancel</AlertDialogCancel>
          <AlertDialogAction @click="handleConfirm">Apply</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Reset confirmation dialog -->
    <AlertDialog :open="resetConfirmOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset changes</AlertDialogTitle>
          <AlertDialogDescription>
            Unsaved changes will be lost. Reset?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="handleResetCancel">Cancel</AlertDialogCancel>
          <AlertDialogAction @click="handleResetConfirm">Reset</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, watch, ref } from 'vue';
import { Lock, RotateCcw } from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import { useCameraControls } from '@/composables/useCameraControls';
import { useStream } from '@/composables/useStream';
import { CAMERA_CONTROL_META, type CameraControlMeta, type CameraControlKey } from '@manlycam/types';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const props = withDefaults(defineProps<{ previewActive?: boolean }>(), { previewActive: false });

const {
  settings,
  piReachable,
  isLoading,
  lastError,
  stagedValues,
  fetchSettings,
  patchSetting,
  stageValue,
  discardStagedValues,
  applyStaged,
} = useCameraControls();
const { streamState } = useStream();

const confirmOpen = ref(false);
const resetConfirmOpen = ref(false);

onMounted(() => { fetchSettings(); });

// hasStagedChanges: true only when staged value differs from the effective stored+default value.
// This ensures toggling a control back to its current stored value hides the Apply button.
const hasStagedChanges = computed(() =>
  Object.entries(stagedValues.value).some(([k, v]) => {
    const ctrl = CAMERA_CONTROL_META.find((c) => c.key === k);
    const current = getValue(k, ctrl?.defaultValue);
    return current !== v;
  }),
);

function handleSwitchChange(ctrl: CameraControlMeta, value: boolean): void {
  if (ctrl.restartRequired) {
    stageValue(ctrl.key, value);
  } else {
    // Update settings immediately for UI reactivity
    settings.value = { ...settings.value, [ctrl.key]: value };
    patchSetting(ctrl.key, value);
  }
}

function handleSelectChange(ctrl: CameraControlMeta, value: string): void {
  if (ctrl.restartRequired) {
    stageValue(ctrl.key, value);
  } else {
    debouncedPatch(ctrl.key, value);
  }
}

function handleNumberChange(ctrl: CameraControlMeta, value: number): void {
  const clamped = clampNumber(value, ctrl.min, ctrl.max);
  const stored = ctrl.transform ? ctrl.transform.toBackend(clamped) : clamped;
  if (ctrl.restartRequired) {
    stageValue(ctrl.key, stored);
  } else {
    debouncedPatch(ctrl.key, stored);
  }
}

function handleTextChange(ctrl: CameraControlMeta, value: string): void {
  if (ctrl.restartRequired) {
    stageValue(ctrl.key, value);
  } else {
    debouncedPatch(ctrl.key, value);
  }
}

function clampNumber(value: number, min?: number, max?: number): number {
  let v = value;
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
}

// Keep piReachable in sync with real-time stream state from WebSocket
watch(streamState, (state) => {
  if (state === 'live') {
    piReachable.value = true;
  } else if (state === 'unreachable') {
    piReachable.value = false;
  } else if (state === 'explicit-offline') {
    piReachable.value = props.previewActive ?? false;
  }
});

// Keep piReachable in sync when previewActive changes while stream stays explicit-offline
watch(
  () => props.previewActive,
  (active) => {
    if (streamState.value === 'explicit-offline') {
      piReachable.value = active ?? false;
    }
  }
);

// Overlay only when stream is explicitly stopped — controls are inaccessible when stream hasn't started.
// For 'unreachable' (Pi offline or bad settings), the yellow piReachable banner is sufficient;
// the admin must still be able to correct settings to recover from a misconfigured state.
const showOfflineOverlay = computed(
  () => !props.previewActive && streamState.value === 'explicit-offline'
);

const overlayMessage = 'Start the stream to manage camera settings';

// Per-key debounce timers (used for non-restart-required controls)
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

function getStagedOrValue(key: string, defaultValue: unknown, restartRequired?: boolean): unknown {
  if (restartRequired) {
    const staged = stagedValues.value[key as CameraControlKey];
    if (staged !== undefined) return staged;
  }
  return getValue(key, defaultValue);
}

function displaySliderValue(key: string, defaultValue: unknown): string {
  const v = Number(getValue(key, defaultValue));
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function isControlVisible(ctrl: CameraControlMeta): boolean {
  if (!ctrl.showIf) return true;
  // Check staged value first so toggling a restart-required switch shows/hides
  // dependent fields immediately without needing to Apply first.
  const staged = stagedValues.value[ctrl.showIf.key];
  if (staged !== undefined) return staged === ctrl.showIf.value;
  return settings.value[ctrl.showIf.key] === ctrl.showIf.value;
}

function getDisplayValue(ctrl: CameraControlMeta, backendValue: unknown): unknown {
  if (ctrl.transform) return ctrl.transform.fromBackend(backendValue as number);
  return backendValue;
}

const SECTION_ORDER = ['Image', 'Exposure', 'White Balance', 'Autofocus', 'Overlay', 'Encoding'] as const;

const sections = computed(() => {
  const visible = new Set(
    CAMERA_CONTROL_META.filter(isControlVisible).map((c) => c.section)
  );
  return SECTION_ORDER.filter((s) => visible.has(s));
});

function getControlsForSection(section: string): CameraControlMeta[] {
  return CAMERA_CONTROL_META.filter((c) => c.section === section && isControlVisible(c));
}

function openConfirmDialog(): void {
  confirmOpen.value = true;
}

function openResetDialog(): void {
  resetConfirmOpen.value = true;
}

async function handleConfirm(): Promise<void> {
  confirmOpen.value = false;
  try {
    await applyStaged();
    toast.success('Camera settings applied');
  } catch (_err) {
    /* istanbul ignore next */
    // server always returns ok:true for connectivity failures; this branch is a safety net only
    toast.error('Failed to apply settings');
  }
}

function handleConfirmCancel(): void {
  confirmOpen.value = false;
}

function handleResetConfirm(): void {
  discardStagedValues();
  resetConfirmOpen.value = false;
}

function handleResetCancel(): void {
  resetConfirmOpen.value = false;
}
</script>
