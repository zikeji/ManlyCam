import { ref, computed } from 'vue';
import { apiFetch, ApiFetchError } from '@/lib/api';
import type { CameraSettingsMap } from '@manlycam/types';

export function useCameraControls() {
  const settings = ref<CameraSettingsMap>({});
  const piReachable = ref(true);
  const isLoading = ref(false);
  const lastError = ref<string | null>(null);
  const stagedValues = ref<CameraSettingsMap>({});
  const pendingPatchCount = ref(0);

  const hasStagedChanges = computed(() => Object.keys(stagedValues.value).length > 0);

  async function fetchSettings(): Promise<void> {
    isLoading.value = true;
    try {
      const data = await apiFetch<{ settings: CameraSettingsMap; piReachable: boolean }>(
        '/api/stream/camera-settings',
      );
      if (pendingPatchCount.value === 0) {
        settings.value = data.settings;
      }
      piReachable.value = data.piReachable;
      lastError.value = null;
    } catch (err) {
      if (err instanceof ApiFetchError) {
        console.error('[CameraControls] Failed to fetch settings:', err);
        lastError.value = err.message;
      }
    } finally {
      isLoading.value = false;
    }
  }

  async function patchSetting(key: string, value: unknown): Promise<void> {
    const previous = settings.value[key as keyof CameraSettingsMap];
    settings.value = { ...settings.value, [key]: value };
    pendingPatchCount.value++;
    try {
      const result = await apiFetch<{ ok: boolean; error?: string }>(
        '/api/stream/camera-settings',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: value }),
        },
      );
      if (!result.ok) {
        console.error('[CameraControls] PATCH failed:', result.error);
        lastError.value = result.error ?? 'Failed to apply setting';
        settings.value = { ...settings.value, [key]: previous };
      } else {
        lastError.value = null;
      }
    } catch (err) {
      if (err instanceof ApiFetchError) {
        console.error('[CameraControls] PATCH error:', err);
        lastError.value = err.message;
        settings.value = { ...settings.value, [key]: previous };
      }
    } finally {
      pendingPatchCount.value--;
    }
  }

  async function patchSettings(body: CameraSettingsMap): Promise<void> {
    settings.value = { ...settings.value, ...body };
    pendingPatchCount.value++;
    try {
      const result = await apiFetch<{ ok: boolean; error?: string }>(
        '/api/stream/camera-settings',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!result.ok) {
        console.error('[CameraControls] batch PATCH failed:', result.error);
        lastError.value = result.error ?? 'Failed to apply settings';
      } else {
        lastError.value = null;
      }
    } catch (err) {
      if (err instanceof ApiFetchError) {
        console.error('[CameraControls] batch PATCH error:', err);
        lastError.value = err.message;
      }
    } finally {
      pendingPatchCount.value--;
    }
  }

  function stageValue(key: string, value: unknown): void {
    stagedValues.value = { ...stagedValues.value, [key]: value };
  }

  function discardStagedValues(): void {
    stagedValues.value = {};
  }

  async function applyStaged(): Promise<void> {
    await patchSettings(stagedValues.value);
    discardStagedValues();
  }

  return {
    settings,
    piReachable,
    isLoading,
    lastError,
    stagedValues,
    hasStagedChanges,
    fetchSettings,
    patchSetting,
    patchSettings,
    stageValue,
    discardStagedValues,
    applyStaged,
  };
}
