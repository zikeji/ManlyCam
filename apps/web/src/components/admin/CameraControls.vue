<template>
  <div class="p-4 space-y-4">
    <!-- Pi Offline Banner -->
    <div
      v-if="!piReachable"
      class="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-2 rounded text-sm"
    >
      ⚠️ Pi Offline — changes will be applied when reconnected
    </div>

    <!-- Loading Skeleton -->
    <div v-if="isLoading" class="space-y-4">
      <div class="h-8 bg-gray-200 rounded animate-pulse" />
      <div class="h-8 bg-gray-200 rounded animate-pulse" />
      <div class="h-8 bg-gray-200 rounded animate-pulse" />
    </div>

    <!-- Controls Grouped by Section -->
    <template v-else>
      <div
        v-for="section in sections"
        :key="section"
        class="space-y-3"
      >
        <h3 class="text-sm font-semibold text-gray-700">{{ section }}</h3>
        <div class="space-y-2">
          <div
            v-for="control in getControlsForSection(section)"
            :key="control.key"
            class="flex flex-col gap-2"
          >
            <!-- Label -->
            <label :for="control.key" class="text-sm font-medium text-gray-600">
              {{ control.label }}
            </label>

            <!-- Switch Control -->
            <input
              v-if="control.type === 'switch'"
              :id="control.key"
              type="checkbox"
              :checked="settings[control.key] === true"
              @change="(e) => patchSetting(control.key, (e.target as HTMLInputElement).checked)"
              class="w-4 h-4 rounded"
            />

            <!-- Slider Control -->
            <input
              v-else-if="control.type === 'slider'"
              :id="control.key"
              type="range"
              :value="settings[control.key] ?? control.defaultValue"
              :min="control.min"
              :max="control.max"
              :step="control.step"
              @input="(e) => handleSliderChange(control.key, parseFloat((e.target as HTMLInputElement).value))"
              class="w-full"
            />

            <!-- Select Control -->
            <select
              v-else-if="control.type === 'select'"
              :id="control.key"
              :value="settings[control.key] ?? control.defaultValue"
              @change="(e) => patchSetting(control.key, (e.target as HTMLSelectElement).value)"
              class="px-2 py-1 border rounded text-sm"
            >
              <option
                v-for="opt in control.options"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>

            <!-- Number Control -->
            <input
              v-else-if="control.type === 'number'"
              :id="control.key"
              type="number"
              :value="settings[control.key] ?? control.defaultValue"
              :min="control.min"
              :max="control.max"
              :step="control.step ?? 1"
              @change="(e) => patchSetting(control.key, parseFloat((e.target as HTMLInputElement).value))"
              class="px-2 py-1 border rounded text-sm"
            />

            <!-- Text Control -->
            <input
              v-else-if="control.type === 'text'"
              :id="control.key"
              type="text"
              :value="(settings[control.key] ?? control.defaultValue) as string"
              @change="(e) => patchSetting(control.key, (e.target as HTMLInputElement).value)"
              class="px-2 py-1 border rounded text-sm"
            />

            <!-- Dual Number Control (Red/Blue gains) -->
            <div v-else-if="control.type === 'dual-number'" class="flex gap-2">
              <div class="flex-1">
                <label :for="`${control.key}-0`" class="text-xs text-gray-500">Red</label>
                <input
                  :id="`${control.key}-0`"
                  type="number"
                  :value="(settings[control.key] as number[] | undefined)?.[0] ?? control.defaultValue?.[0] ?? 0"
                  :min="control.min"
                  :max="control.max"
                  :step="control.step ?? 0.01"
                  @change="(e) => handleDualNumberChange(control.key, 0, parseFloat((e.target as HTMLInputElement).value))"
                  class="w-full px-2 py-1 border rounded text-sm"
                />
              </div>
              <div class="flex-1">
                <label :for="`${control.key}-1`" class="text-xs text-gray-500">Blue</label>
                <input
                  :id="`${control.key}-1`"
                  type="number"
                  :value="(settings[control.key] as number[] | undefined)?.[1] ?? control.defaultValue?.[1] ?? 0"
                  :min="control.min"
                  :max="control.max"
                  :step="control.step ?? 0.01"
                  @change="(e) => handleDualNumberChange(control.key, 1, parseFloat((e.target as HTMLInputElement).value))"
                  class="w-full px-2 py-1 border rounded text-sm"
                />
              </div>
            </div>

            <!-- Description -->
            <p v-if="control.description" class="text-xs text-gray-500">
              {{ control.description }}
            </p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useCameraControls } from '@/composables/useCameraControls';
import { CAMERA_CONTROL_META, type CameraControlMeta } from '@manlycam/types';

const { settings, piReachable, isLoading, fetchSettings, patchSetting } = useCameraControls();

// Initialize on mount
onMounted(() => {
  fetchSettings();
});

// Track debounce timers for sliders
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function handleSliderChange(key: string, value: number): void {
  if (debounceTimers.has(key)) {
    clearTimeout(debounceTimers.get(key)!);
  }
  debounceTimers.set(
    key,
    setTimeout(() => {
      patchSetting(key, value);
      debounceTimers.delete(key);
    }, 300)
  );
}

function handleDualNumberChange(key: string, index: number, value: number): void {
  const current = (settings.value[key as keyof typeof settings.value] as number[] | undefined) ?? [0, 0];
  const updated = [...current];
  updated[index] = value;
  patchSetting(key, updated);
}

// Get unique sections in order from visible controls
const sections = computed(() => {
  const sectionSet = new Set<string>();
  for (const control of CAMERA_CONTROL_META) {
    if (isControlVisible(control)) {
      sectionSet.add(control.section);
    }
  }
  // Return in consistent order
  const order = ['Image', 'Exposure', 'White Balance', 'Autofocus', 'Overlay'];
  return order.filter((s) => sectionSet.has(s));
});

function isControlVisible(control: CameraControlMeta): boolean {
  if (!control.showIf) return true;
  const conditionValue = settings.value[control.showIf.key];
  return conditionValue === control.showIf.value;
}

function getControlsForSection(section: string): CameraControlMeta[] {
  return CAMERA_CONTROL_META.filter(
    (c) => c.section === section && isControlVisible(c)
  );
}
</script>
