import { ref } from 'vue';
import { apiFetch, ApiFetchError } from '@/lib/api';

export const useAdminStream = () => {
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const startStream = async (): Promise<void> => {
    isLoading.value = true;
    error.value = null;
    try {
      await apiFetch('/api/stream/start', { method: 'POST' });
    } catch (err) {
      error.value = err instanceof ApiFetchError ? err.message : 'Failed to start stream';
    } finally {
      isLoading.value = false;
    }
  };

  const stopStream = async (): Promise<void> => {
    isLoading.value = true;
    error.value = null;
    try {
      await apiFetch('/api/stream/stop', { method: 'POST' });
    } catch (err) {
      error.value = err instanceof ApiFetchError ? err.message : 'Failed to stop stream';
    } finally {
      isLoading.value = false;
    }
  };

  return { startStream, stopStream, isLoading, error };
};
