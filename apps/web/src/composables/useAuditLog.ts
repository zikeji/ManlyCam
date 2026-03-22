import { ref } from 'vue';
import { apiFetch } from '@/lib/api';

export interface AuditLogEntry {
  id: string;
  action: string;
  actorId: string;
  actorDisplayName: string;
  targetId: string | null;
  metadata: unknown | null;
  performedAt: string;
}

interface AuditLogResponse {
  entries: AuditLogEntry[];
  nextCursor: string | null;
}

export function useAuditLog() {
  const entries = ref<AuditLogEntry[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const hasMore = ref(false);

  let nextCursor: string | null = null;

  const fetchInitial = async () => {
    isLoading.value = true;
    error.value = null;
    try {
      const data = await apiFetch<AuditLogResponse>('/api/admin/audit-log?limit=50');
      entries.value = data.entries;
      nextCursor = data.nextCursor;
      hasMore.value = nextCursor !== null;
    } catch (err: unknown) {
      error.value =
        (err instanceof Error ? err.message : String(err)) || 'Failed to fetch audit log';
    } finally {
      isLoading.value = false;
    }
  };

  const fetchNextPage = async () => {
    if (!nextCursor) return;
    isLoading.value = true;
    error.value = null;
    try {
      const data = await apiFetch<AuditLogResponse>(
        `/api/admin/audit-log?limit=50&cursor=${encodeURIComponent(nextCursor)}`,
      );
      entries.value = [...entries.value, ...data.entries];
      nextCursor = data.nextCursor;
      hasMore.value = nextCursor !== null;
    } catch (err: unknown) {
      error.value =
        (err instanceof Error ? err.message : String(err)) || 'Failed to fetch audit log';
    } finally {
      isLoading.value = false;
    }
  };

  return {
    entries,
    isLoading,
    error,
    hasMore,
    fetchInitial,
    fetchNextPage,
  };
}
