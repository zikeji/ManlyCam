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
import { useDeviceShutdown } from './useDeviceShutdown';

describe('useDeviceShutdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shutdownDevice() calls apiFetch with POST /api/admin/device/shutdown and returns true', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ok: true });
    const { shutdownDevice, isShuttingDown } = useDeviceShutdown();

    const promise = shutdownDevice();
    expect(isShuttingDown.value).toBe(true);
    const result = await promise;
    expect(result).toBe(true);
    expect(isShuttingDown.value).toBe(false);
    expect(apiFetch).toHaveBeenCalledWith('/api/admin/device/shutdown', { method: 'POST' });
  });

  it('on ApiFetchError, error.value is set to message and returns false', async () => {
    const apiError = new ApiFetchError('Device agent unreachable', 502, 'AGENT_UNREACHABLE');
    vi.mocked(apiFetch).mockRejectedValue(apiError);
    const { shutdownDevice, isShuttingDown, error } = useDeviceShutdown();

    const result = await shutdownDevice();

    expect(result).toBe(false);
    expect(isShuttingDown.value).toBe(false);
    expect(error.value).toBe('Device agent unreachable');
  });

  it('on unexpected error, falls back to generic message', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('network down'));
    const { shutdownDevice, error } = useDeviceShutdown();

    const result = await shutdownDevice();

    expect(result).toBe(false);
    expect(error.value).toBe('Failed to shutdown device');
  });

  it('clears a previous error on a subsequent attempt', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new ApiFetchError('boom', 502));
    const { shutdownDevice, error } = useDeviceShutdown();

    await shutdownDevice();
    expect(error.value).toBe('boom');

    vi.mocked(apiFetch).mockResolvedValue({ ok: true });
    await shutdownDevice();
    expect(error.value).toBeNull();
  });
});
