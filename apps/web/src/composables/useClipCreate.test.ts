import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

const { mockToastLoading, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastLoading: vi.fn().mockReturnValue('toast-id-default'),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('vue-sonner', () => ({
  toast: Object.assign(vi.fn(), {
    loading: mockToastLoading,
    success: mockToastSuccess,
    error: mockToastError,
  }),
}));

import { apiFetch } from '@/lib/api';
import { useClipCreate, handleClipStatusChanged } from './useClipCreate';

const baseParams = {
  startTime: '2026-01-01T00:00:00.000Z',
  endTime: '2026-01-01T00:00:30.000Z',
  name: 'My Clip',
  shareToChat: false,
};

describe('useClipCreate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToastLoading.mockReturnValue('toast-id-default');
  });

  describe('fetchSegmentRange', () => {
    it('calls /api/clips/segment-range and returns the result', async () => {
      const range = { earliest: '2026-01-01T00:00:00.000Z', latest: '2026-01-01T00:10:00.000Z' };
      vi.mocked(apiFetch).mockResolvedValue(range);
      const { fetchSegmentRange } = useClipCreate();
      const result = await fetchSegmentRange();
      expect(apiFetch).toHaveBeenCalledWith('/api/clips/segment-range');
      expect(result).toEqual(range);
    });

    it('propagates errors from apiFetch', async () => {
      vi.mocked(apiFetch).mockRejectedValue(new Error('Stream not ready'));
      const { fetchSegmentRange } = useClipCreate();
      await expect(fetchSegmentRange()).rejects.toThrow('Stream not ready');
    });
  });

  describe('submitClip', () => {
    it('sends POST /api/clips with provided params', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ id: 'clip-s1', status: 'processing' });
      const { submitClip } = useClipCreate();
      await submitClip(baseParams);
      expect(apiFetch).toHaveBeenCalledWith('/api/clips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(baseParams),
      });
    });

    it('shows a loading toast and returns the API result', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ id: 'clip-s2', status: 'processing' });
      const { submitClip } = useClipCreate();
      const result = await submitClip({ ...baseParams, name: 'Toast Clip' });
      expect(mockToastLoading).toHaveBeenCalledWith('Creating clip "Toast Clip"…', {
        duration: Infinity,
      });
      expect(result).toEqual({ id: 'clip-s2', status: 'processing' });
    });

    it('isSubmitting is true during the request and false after', async () => {
      let resolveApi!: (v: unknown) => void;
      vi.mocked(apiFetch).mockReturnValue(
        new Promise((r) => {
          resolveApi = r;
        }) as never,
      );
      const { submitClip, isSubmitting } = useClipCreate();
      const promise = submitClip(baseParams);
      expect(isSubmitting.value).toBe(true);
      resolveApi({ id: 'clip-s3', status: 'processing' });
      await promise;
      expect(isSubmitting.value).toBe(false);
    });

    it('resets isSubmitting to false even when apiFetch throws', async () => {
      vi.mocked(apiFetch).mockRejectedValue(new Error('server error'));
      const { submitClip, isSubmitting } = useClipCreate();
      await expect(submitClip(baseParams)).rejects.toThrow('server error');
      expect(isSubmitting.value).toBe(false);
    });

    it('passes optional description when provided', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ id: 'clip-s4', status: 'processing' });
      const { submitClip } = useClipCreate();
      await submitClip({ ...baseParams, description: 'A great moment' });
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/clips',
        expect.objectContaining({
          body: expect.stringContaining('A great moment'),
        }),
      );
    });
  });

  describe('handleClipStatusChanged', () => {
    it('updates the loading toast to success when status is ready', async () => {
      const toastId = 'toast-ready-1';
      mockToastLoading.mockReturnValue(toastId);
      vi.mocked(apiFetch).mockResolvedValue({ id: 'clip-h1', status: 'processing' });
      const { submitClip } = useClipCreate();
      await submitClip({ ...baseParams, name: 'Done Clip' });

      handleClipStatusChanged({
        clipId: 'clip-h1',
        status: 'ready',
        durationSeconds: 30,
        thumbnailKey: null,
      });
      expect(mockToastSuccess).toHaveBeenCalledWith('Clip ready!', { id: toastId, duration: 4000 });
    });

    it('updates the loading toast to error when status is failed', async () => {
      const toastId = 'toast-fail-1';
      mockToastLoading.mockReturnValue(toastId);
      vi.mocked(apiFetch).mockResolvedValue({ id: 'clip-h2', status: 'processing' });
      const { submitClip } = useClipCreate();
      await submitClip({ ...baseParams, name: 'Failed Clip' });

      handleClipStatusChanged({ clipId: 'clip-h2', status: 'failed' });
      expect(mockToastError).toHaveBeenCalledWith('Clip processing failed', { id: toastId, duration: 8000 });
    });

    it('does nothing for an unknown clipId', () => {
      expect(() => {
        handleClipStatusChanged({
          clipId: 'does-not-exist',
          status: 'ready',
          durationSeconds: 10,
          thumbnailKey: null,
        });
      }).not.toThrow();
      expect(mockToastSuccess).not.toHaveBeenCalled();
      expect(mockToastError).not.toHaveBeenCalled();
    });
  });
});
