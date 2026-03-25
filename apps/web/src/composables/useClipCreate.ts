import { ref } from 'vue';
import { toast } from 'vue-sonner';
import { apiFetch } from '@/lib/api';
import type { ClipStatusChangedPayload } from '@manlycam/types';

export interface SegmentRange {
  earliest: string;
  latest: string;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  streamStartedAt: string;
}

export function isStreamTooNew(streamStartedAt: string): boolean {
  return Date.now() - new Date(streamStartedAt).getTime() < 60_000;
}

interface PendingClipEntry {
  toastId: string | number;
  createdAt: number;
}

const pendingClips = new Map<string, PendingClipEntry>();
const PENDING_CLIP_TIMEOUT_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60000;

/* c8 ignore start -- module-level interval cleanup; testing requires waiting 5 min real-time */
setInterval(() => {
  const now = Date.now();
  for (const [clipId, entry] of pendingClips.entries()) {
    if (now - entry.createdAt > PENDING_CLIP_TIMEOUT_MS) {
      toast.info('Clip status unknown - check My Clips page', {
        id: entry.toastId,
        duration: 4000,
      });
      pendingClips.delete(clipId);
    }
  }
}, CLEANUP_INTERVAL_MS);
/* c8 ignore stop */

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
      pendingClips.set(result.id, { toastId, createdAt: Date.now() });
      return result;
    } finally {
      isSubmitting.value = false;
    }
  }

  return { isSubmitting, fetchSegmentRange, submitClip };
}

const MIN_LOADING_MS = 1000;

export function handleClipStatusChanged(payload: ClipStatusChangedPayload): void {
  const entry = pendingClips.get(payload.clipId);
  if (entry === undefined) return;
  pendingClips.delete(payload.clipId);

  const elapsed = Date.now() - entry.createdAt;
  const delay = Math.max(0, MIN_LOADING_MS - elapsed);

  setTimeout(() => {
    toast.dismiss(entry.toastId);
    if (payload.status === 'ready') {
      toast.success('Clip ready!', { duration: 4000 });
    } else {
      toast.error('Clip processing failed', { duration: 8000 });
    }
  }, delay);
}
