import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api', () => {
  class MockApiFetchError extends Error {
    constructor(
      message: string,
      public status: number,
      public code: string = 'UNKNOWN',
    ) {
      super(message);
      this.name = 'ApiFetchError';
    }
  }
  return {
    apiFetch: vi.fn(),
    ApiFetchError: MockApiFetchError,
  };
});

import { apiFetch, ApiFetchError } from '@/lib/api';
import { useAdminStream } from './useAdminStream';

describe('useAdminStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('startStream() calls apiFetch with POST /api/stream/start', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ok: true });
    const { startStream, isLoading } = useAdminStream();

    const promise = startStream();
    expect(isLoading.value).toBe(true);
    await promise;
    expect(isLoading.value).toBe(false);
    expect(apiFetch).toHaveBeenCalledWith('/api/stream/start', { method: 'POST' });
  });

  it('stopStream() calls apiFetch with POST /api/stream/stop', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ok: true });
    const { stopStream, isLoading } = useAdminStream();

    const promise = stopStream();
    expect(isLoading.value).toBe(true);
    await promise;
    expect(isLoading.value).toBe(false);
    expect(apiFetch).toHaveBeenCalledWith('/api/stream/stop', { method: 'POST' });
  });

  it('on ApiFetchError, error.value is set to message; isLoading is false', async () => {
    const apiError = new ApiFetchError('Forbidden', 403, 'FORBIDDEN');
    vi.mocked(apiFetch).mockRejectedValue(apiError);
    const { startStream, isLoading, error } = useAdminStream();

    await startStream();

    expect(isLoading.value).toBe(false);
    expect(error.value).toBe('Forbidden');
  });

  it('on non-ApiFetchError, error.value is set to fallback message', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('network error'));
    const { startStream, error } = useAdminStream();

    await startStream();

    expect(error.value).toBe('Failed to start stream');
  });

  it('error is cleared on a new successful call', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiFetchError('err', 500));
    vi.mocked(apiFetch).mockResolvedValueOnce({ ok: true });
    const { startStream, error } = useAdminStream();

    await startStream();
    expect(error.value).not.toBeNull();

    await startStream();
    expect(error.value).toBeNull();
  });
});
