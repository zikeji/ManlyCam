import { ref } from 'vue';
import { toast } from 'vue-sonner';
import { apiFetch } from '@/lib/api';
import type { ClipStatusChangedPayload, ClipVisibilityChangedPayload } from '@manlycam/types';

export interface ClipListItem {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: string;
  visibility: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  showClipper: boolean;
  showClipperAvatar: boolean;
  clipperName: string | null;
  clipperAvatarUrl: string | null;
  createdAt: string;
  updatedAt: string | null;
  lastEditedAt: string | null;
  clipperDisplayName: string;
  clipperAvatarUrlOwner: string | null;
  clipperRole: string;
}

interface ClipsResponse {
  clips: ClipListItem[];
  total: number;
}

export interface UpdateClipData {
  name?: string;
  description?: string;
  visibility?: string;
  showClipper?: boolean;
  showClipperAvatar?: boolean;
  clipperName?: string;
}

export const clips = ref<ClipListItem[]>([]);

export function handleClipStatusUpdate(payload: ClipStatusChangedPayload) {
  const idx = clips.value.findIndex((c) => c.id === payload.clipId);
  if (idx === -1) return;
  const updated = { ...clips.value[idx], status: payload.status };
  if (payload.status === 'ready') {
    updated.durationSeconds = payload.durationSeconds;
  }
  const next = clips.value.slice();
  next[idx] = updated;
  clips.value = next;
}

export function handleClipVisibilityChanged(payload: ClipVisibilityChangedPayload) {
  if (payload.visibility === 'deleted') {
    clips.value = clips.value.filter((c) => c.id !== payload.clipId);
    return;
  }
  const idx = clips.value.findIndex((c) => c.id === payload.clipId);
  if (idx === -1) return;
  const next = clips.value.slice();
  next[idx] = { ...next[idx], visibility: payload.visibility };
  clips.value = next;
}

export function useClips() {
  const total = ref(0);
  const currentPage = ref(0);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const fetchClips = async (
    params: {
      page?: number;
      includeShared?: boolean;
      all?: boolean;
    } = {},
  ) => {
    isLoading.value = true;
    error.value = null;
    try {
      const p = params.page ?? 0;
      const qs = new URLSearchParams({ page: String(p) });
      if (params.includeShared) qs.set('includeShared', 'true');
      if (params.all) qs.set('all', 'true');
      const data = await apiFetch<ClipsResponse>(`/api/clips?${qs.toString()}`);
      if (p === 0) {
        clips.value = data.clips;
      } else {
        clips.value = [...clips.value, ...data.clips];
      }
      total.value = data.total;
      currentPage.value = p;
    } catch (err: unknown) {
      error.value = (err instanceof Error ? err.message : String(err)) || 'Failed to load clips';
    } finally {
      isLoading.value = false;
    }
  };

  const deleteClip = async (clipId: string) => {
    await apiFetch<void>(`/api/clips/${clipId}`, { method: 'DELETE' });
    clips.value = clips.value.filter((c) => c.id !== clipId);
  };

  const updateClip = async (clipId: string, data: UpdateClipData) => {
    const updated = await apiFetch<ClipListItem>(`/api/clips/${clipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const idx = clips.value.findIndex((c) => c.id === clipId);
    if (idx !== -1) {
      const next = clips.value.slice();
      next[idx] = { ...next[idx], ...updated };
      clips.value = next;
    }
  };

  const shareClipToChat = async (clipId: string) => {
    await apiFetch<void>(`/api/clips/${clipId}/share`, { method: 'POST' });
    toast.success('Clip shared to chat', { duration: 3000 });
  };

  const copyClipLink = async (clipId: string, visibility: string) => {
    const url = `${window.location.origin}/clips/${clipId}`;
    await navigator.clipboard.writeText(url);
    if (visibility === 'private') {
      toast.info('Link copied – only you can view this link');
    } else {
      toast.success('Link copied to clipboard');
    }
  };

  const downloadClip = (clipId: string) => {
    window.location.href = `/api/clips/${clipId}/download`;
  };

  const getClipStreamUrl = async (clipId: string): Promise<string> => {
    const data = await apiFetch<{ url: string }>(`/api/clips/${clipId}/stream`);
    return data.url;
  };

  return {
    clips,
    total,
    currentPage,
    isLoading,
    error,
    fetchClips,
    deleteClip,
    updateClip,
    shareClipToChat,
    copyClipLink,
    downloadClip,
    getClipStreamUrl,
  };
}
