import { ref } from 'vue';
import { apiFetch } from '@/lib/api';

export const useStreamOnlyLink = () => {
  const enabled = ref(false);
  const key = ref<string | null>(null);
  const isLoading = ref(false);
  const isRegenerating = ref(false);
  const error = ref<string | null>(null);

  async function fetchConfig(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const data = await apiFetch<{ enabled: boolean; key: string | null }>(
        '/api/stream-only/config',
      );
      enabled.value = data.enabled;
      key.value = data.key;
    } catch {
      error.value = 'Failed to load stream-only config';
    } finally {
      isLoading.value = false;
    }
  }

  async function toggle(newEnabled: boolean): Promise<void> {
    error.value = null;
    try {
      await apiFetch('/api/stream-only/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      enabled.value = newEnabled;
    } catch {
      // Revert optimistic v-model update
      enabled.value = !newEnabled;
      error.value = 'Failed to update stream-only config';
    }
  }

  async function regenerate(): Promise<void> {
    if (isRegenerating.value) return;
    isRegenerating.value = true;
    error.value = null;
    try {
      const data = await apiFetch<{ key: string }>('/api/stream-only/config/regenerate', {
        method: 'POST',
      });
      key.value = data.key;
    } catch {
      error.value = 'Failed to regenerate stream-only key';
    } finally {
      isRegenerating.value = false;
    }
  }

  return { enabled, key, isLoading, isRegenerating, error, fetchConfig, toggle, regenerate };
};
