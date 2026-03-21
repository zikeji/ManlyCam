import { ref, onMounted } from 'vue';
import { toast } from 'vue-sonner';
import { apiFetch } from '@/lib/api';

// toast calls here are intentional — this composable is single-use and the presentation coupling is acceptable
export interface AllowlistEntry {
  id: string;
  type: 'domain' | 'email';
  value: string;
  createdAt: string;
}

interface AddEntryResponse extends AllowlistEntry {
  alreadyExists: boolean;
}

export const entries = ref<AllowlistEntry[]>([]);

export function useAdminAllowlist() {
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const fetchEntries = async () => {
    isLoading.value = true;
    error.value = null;
    try {
      const data = await apiFetch<AllowlistEntry[]>('/api/admin/allowlist');
      entries.value = data;
    } catch (err: unknown) {
      error.value = (err as Error).message || 'Failed to fetch allowlist';
    } finally {
      isLoading.value = false;
    }
  };

  const addEntry = async (type: 'domain' | 'email', value: string) => {
    const normalized = type === 'email' ? value.trim().toLowerCase() : value.trim();
    const result = await apiFetch<AddEntryResponse>('/api/admin/allowlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, value: normalized }),
    });
    if (result.alreadyExists) {
      return result;
    }
    entries.value = [
      ...entries.value,
      { id: result.id, type: result.type, value: result.value, createdAt: result.createdAt },
    ];
    toast.success('Entry added');
    return result;
  };

  const removeEntry = async (id: string) => {
    await apiFetch(`/api/admin/allowlist/${id}`, { method: 'DELETE' });
    entries.value = entries.value.filter((e) => e.id !== id);
    toast.success('Entry removed');
  };

  onMounted(() => {
    if (entries.value.length === 0) {
      fetchEntries();
    }
  });

  return {
    entries,
    isLoading,
    error,
    fetchEntries,
    addEntry,
    removeEntry,
  };
}
