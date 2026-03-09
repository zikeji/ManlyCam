import { ref } from 'vue';
import { apiFetch, ApiFetchError } from '@/lib/api';
import type { CameraSettingsMap } from '@manlycam/types';

export function useCameraControls() {
  const settings = ref<CameraSettingsMap>({});
  const piReachable = ref(true);
  const isLoading = ref(false);
  const lastError = ref<string | null>(null);

  async function fetchSettings(): Promise<void> {
    isLoading.value = true;
    try {
      const data = await apiFetch<{ settings: CameraSettingsMap; piReachable: boolean }>(
        '/api/stream/camera-settings',
      );
      settings.value = data.settings;
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
    // Optimistic update
    settings.value = { ...settings.value, [key]: value };
    try {
      const result = await apiFetch<{ ok: boolean; piOffline?: boolean; error?: string }>(
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
        // Revert
        settings.value = { ...settings.value, [key]: previous };
      } else {
        lastError.value = null;
      }
      // piOffline: true is not an error — setting is saved for reconnect
    } catch (err) {
      if (err instanceof ApiFetchError) {
        console.error('[CameraControls] PATCH error:', err);
        lastError.value = err.message;
        settings.value = { ...settings.value, [key]: previous };
      }
    }
  }

  return { settings, piReachable, isLoading, lastError, fetchSettings, patchSetting };
}
