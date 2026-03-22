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
import { useOfflineMessage } from './useOfflineMessage';

describe('useOfflineMessage', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('fetchOfflineMessage', () => {
    it('returns data on success', async () => {
      const data = { emoji: '1f634', title: null, description: null };
      vi.mocked(apiFetch).mockResolvedValue(data);

      const { fetchOfflineMessage } = useOfflineMessage();
      const result = await fetchOfflineMessage();

      expect(result).toEqual(data);
      expect(apiFetch).toHaveBeenCalledWith('/api/stream/offline-message');
    });

    it('sets isLoading true during fetch and false after', async () => {
      let resolvePromise!: (v: unknown) => void;
      const pending = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(apiFetch).mockReturnValue(pending as never);

      const { fetchOfflineMessage, isLoading } = useOfflineMessage();
      const fetchPromise = fetchOfflineMessage();
      expect(isLoading.value).toBe(true);

      resolvePromise({ emoji: null, title: null, description: null });
      await fetchPromise;
      expect(isLoading.value).toBe(false);
    });

    it('returns null and sets error on failure', async () => {
      vi.mocked(apiFetch).mockRejectedValue(new Error('Network error'));

      const { fetchOfflineMessage, error } = useOfflineMessage();
      const result = await fetchOfflineMessage();

      expect(result).toBeNull();
      expect(error.value).toBe('Network error');
    });

    it('uses fallback error message when error is not an Error instance', async () => {
      vi.mocked(apiFetch).mockRejectedValue('string error');

      const { fetchOfflineMessage, error } = useOfflineMessage();
      await fetchOfflineMessage();

      expect(error.value).toBe('Failed to fetch offline message');
    });

    it('clears error on new fetch', async () => {
      vi.mocked(apiFetch)
        .mockRejectedValueOnce(new Error('first error'))
        .mockResolvedValueOnce({ emoji: null, title: null, description: null });

      const { fetchOfflineMessage, error } = useOfflineMessage();
      await fetchOfflineMessage();
      expect(error.value).toBe('first error');

      await fetchOfflineMessage();
      expect(error.value).toBeNull();
    });
  });

  describe('saveOfflineMessage', () => {
    it('returns true on success', async () => {
      vi.mocked(apiFetch).mockResolvedValue({ ok: true });

      const { saveOfflineMessage } = useOfflineMessage();
      const result = await saveOfflineMessage({ emoji: '1f634', title: null, description: null });

      expect(result).toBe(true);
      expect(apiFetch).toHaveBeenCalledWith('/api/stream/offline-message', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji: '1f634', title: null, description: null }),
      });
    });

    it('returns false and sets error on failure', async () => {
      vi.mocked(apiFetch).mockRejectedValue(new Error('Save failed'));

      const { saveOfflineMessage, error } = useOfflineMessage();
      const result = await saveOfflineMessage({ emoji: null, title: null, description: null });

      expect(result).toBe(false);
      expect(error.value).toBe('Save failed');
    });

    it('sets isLoading true during save and false after', async () => {
      let resolvePromise!: (v: unknown) => void;
      const pending = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(apiFetch).mockReturnValue(pending as never);

      const { saveOfflineMessage, isLoading } = useOfflineMessage();
      const savePromise = saveOfflineMessage({ emoji: null, title: null, description: null });
      expect(isLoading.value).toBe(true);

      resolvePromise({ ok: true });
      await savePromise;
      expect(isLoading.value).toBe(false);
    });

    it('uses fallback error message when error is not an Error instance', async () => {
      vi.mocked(apiFetch).mockRejectedValue('string error');

      const { saveOfflineMessage, error } = useOfflineMessage();
      await saveOfflineMessage({ emoji: null, title: null, description: null });

      expect(error.value).toBe('Failed to save offline message');
    });
  });
});
