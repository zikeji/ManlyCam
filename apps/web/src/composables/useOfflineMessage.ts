import { ref } from 'vue';
import { apiFetch } from '@/lib/api';

export interface OfflineMessageData {
  emoji: string | null;
  title: string | null;
  description: string | null;
}

export const useOfflineMessage = () => {
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const fetchOfflineMessage = async (): Promise<OfflineMessageData | null> => {
    isLoading.value = true;
    error.value = null;
    try {
      const data = await apiFetch<OfflineMessageData>('/api/stream/offline-message');
      return data;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch offline message';
      return null;
    } finally {
      isLoading.value = false;
    }
  };

  const saveOfflineMessage = async (payload: OfflineMessageData): Promise<boolean> => {
    isLoading.value = true;
    error.value = null;
    try {
      await apiFetch('/api/stream/offline-message', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to save offline message';
      return false;
    } finally {
      isLoading.value = false;
    }
  };

  return { fetchOfflineMessage, saveOfflineMessage, isLoading, error };
};
