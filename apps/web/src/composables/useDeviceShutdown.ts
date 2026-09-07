import { ref } from 'vue';
import { apiFetch, ApiFetchError } from '@/lib/api';

export function useDeviceShutdown() {
  const isShuttingDown = ref(false);
  const error = ref<string | null>(null);

  const shutdownDevice = async (): Promise<boolean> => {
    isShuttingDown.value = true;
    error.value = null;
    try {
      await apiFetch('/api/admin/device/shutdown', { method: 'POST' });
      return true;
    } catch (err) {
      const message = err instanceof ApiFetchError ? err.message : 'Failed to shutdown device';
      error.value = message;
      console.error('[DeviceShutdown]', message, err);
      return false;
    } finally {
      isShuttingDown.value = false;
    }
  };

  return { shutdownDevice, isShuttingDown, error };
}
