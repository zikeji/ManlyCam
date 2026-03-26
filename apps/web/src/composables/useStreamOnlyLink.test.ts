import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  ApiFetchError: class ApiFetchError extends Error {
    status: number;
    code: string;
    constructor(message: string, status: number, code = 'UNKNOWN') {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

import { apiFetch } from '@/lib/api';
import { useStreamOnlyLink } from './useStreamOnlyLink';

describe('useStreamOnlyLink', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('fetchConfig', () => {
    it('populates enabled and key on success', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ enabled: true, key: 'mykey123' });
      const { enabled, key, fetchConfig, isLoading } = useStreamOnlyLink();

      const fetchPromise = fetchConfig();
      expect(isLoading.value).toBe(true);
      await fetchPromise;

      expect(isLoading.value).toBe(false);
      expect(enabled.value).toBe(true);
      expect(key.value).toBe('mykey123');
      expect(apiFetch).toHaveBeenCalledWith('/api/stream-only/config');
    });

    it('sets enabled:false and key:null when disabled', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ enabled: false, key: null });
      const { enabled, key, fetchConfig } = useStreamOnlyLink();
      await fetchConfig();
      expect(enabled.value).toBe(false);
      expect(key.value).toBeNull();
    });

    it('sets error on fetch failure', async () => {
      vi.mocked(apiFetch).mockRejectedValue(new Error('Network error'));
      const { error, fetchConfig, isLoading } = useStreamOnlyLink();

      await fetchConfig();
      expect(error.value).toBe('Failed to load stream-only config');
      expect(isLoading.value).toBe(false);
    });

    it('clears error before fetch', async () => {
      vi.mocked(apiFetch)
        .mockRejectedValueOnce(new Error('first error'))
        .mockResolvedValueOnce({ enabled: false, key: null });

      const { error, fetchConfig } = useStreamOnlyLink();
      await fetchConfig();
      expect(error.value).toBe('Failed to load stream-only config');

      await fetchConfig();
      expect(error.value).toBeNull();
    });
  });

  describe('toggle', () => {
    it('calls PATCH with enabled:true and updates enabled ref', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ ok: true });
      const { toggle, enabled } = useStreamOnlyLink();

      await toggle(true);

      expect(apiFetch).toHaveBeenCalledWith('/api/stream-only/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      expect(enabled.value).toBe(true);
    });

    it('calls PATCH with enabled:false and updates enabled ref', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ ok: true });
      const { toggle, enabled } = useStreamOnlyLink();

      await toggle(false);

      expect(apiFetch).toHaveBeenCalledWith('/api/stream-only/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });
      expect(enabled.value).toBe(false);
    });

    it('sets error on toggle failure', async () => {
      vi.mocked(apiFetch).mockRejectedValue(new Error('Failed'));
      const { toggle, error } = useStreamOnlyLink();

      await toggle(true);

      expect(error.value).toBe('Failed to update stream-only config');
    });
  });

  describe('regenerate', () => {
    it('calls POST regenerate and updates key ref', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ key: 'newkey456' });
      const { regenerate, key } = useStreamOnlyLink();

      await regenerate();

      expect(apiFetch).toHaveBeenCalledWith('/api/stream-only/config/regenerate', {
        method: 'POST',
      });
      expect(key.value).toBe('newkey456');
    });

    it('sets error on regenerate failure', async () => {
      vi.mocked(apiFetch).mockRejectedValue(new Error('Failed'));
      const { regenerate, error } = useStreamOnlyLink();

      await regenerate();

      expect(error.value).toBe('Failed to regenerate stream-only key');
    });
  });
});
