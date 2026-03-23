import { ref } from 'vue';
import { toast } from 'vue-sonner';
import { apiFetch } from '@/lib/api';
import type { ClipStatusChangedPayload } from '@manlycam/types';

export interface SegmentRange {
  earliest: string;
  latest: string;
}

const pendingClips = new Map<string, string | number>();

export function useClipCreate() {
  const isSubmitting = ref(false);

  async function fetchSegmentRange(): Promise<SegmentRange> {
    return apiFetch<SegmentRange>('/api/clips/segment-range');
  }

  async function submitClip(params: {
    startTime: string;
    endTime: string;
    name: string;
    description?: string;
    shareToChat: boolean;
  }): Promise<{ id: string; status: string }> {
    isSubmitting.value = true;
    try {
      const result = await apiFetch<{ id: string; status: string }>('/api/clips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const toastId = toast.loading(`Creating clip "${params.name}"…`, { duration: Infinity });
      pendingClips.set(result.id, toastId);
      return result;
    } finally {
      isSubmitting.value = false;
    }
  }

  return { isSubmitting, fetchSegmentRange, submitClip };
}

export function handleClipStatusChanged(payload: ClipStatusChangedPayload): void {
  const toastId = pendingClips.get(payload.clipId);
  if (toastId === undefined) return;
  pendingClips.delete(payload.clipId);
  if (payload.status === 'ready') {
    toast.success('Clip ready!', { id: toastId, duration: 4000 });
  } else {
    toast.error('Clip processing failed', { id: toastId, duration: 8000 });
  }
}
