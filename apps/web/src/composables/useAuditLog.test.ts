import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuditLog } from './useAuditLog';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api';

// Valid 26-char ULIDs for testing
const ULID_1 = '01HX00000000000000000000AA';
const ULID_2 = '01HX00000000000000000000BB';

const makeEntry = (id: string) => ({
  id,
  action: 'ban',
  actorId: 'u1',
  actorDisplayName: 'Admin',
  targetId: 'u2',
  metadata: null,
  performedAt: '2026-01-01T10:00:00.000Z',
});

describe('useAuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initial state has empty entries and hasMore false', () => {
    const { entries, isLoading, error, hasMore } = useAuditLog();
    expect(entries.value).toHaveLength(0);
    expect(isLoading.value).toBe(false);
    expect(error.value).toBeNull();
    expect(hasMore.value).toBe(false);
  });

  it('fetchInitial loads entries and sets hasMore false when no nextCursor', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      entries: [makeEntry(ULID_1)],
      nextCursor: null,
    });

    const { entries, hasMore, fetchInitial } = useAuditLog();
    await fetchInitial();

    expect(entries.value).toHaveLength(1);
    expect(entries.value[0].id).toBe(ULID_1);
    expect(hasMore.value).toBe(false);
    expect(apiFetch).toHaveBeenCalledWith('/api/admin/audit-log?limit=50');
  });

  it('fetchInitial sets hasMore true when nextCursor is returned', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      entries: [makeEntry(ULID_1)],
      nextCursor: ULID_1,
    });

    const { hasMore, fetchInitial } = useAuditLog();
    await fetchInitial();

    expect(hasMore.value).toBe(true);
  });

  it('fetchNextPage appends entries', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({
        entries: [makeEntry(ULID_1)],
        nextCursor: ULID_1,
      })
      .mockResolvedValueOnce({
        entries: [makeEntry(ULID_2)],
        nextCursor: null,
      });

    const { entries, hasMore, fetchInitial, fetchNextPage } = useAuditLog();
    await fetchInitial();
    await fetchNextPage();

    expect(entries.value).toHaveLength(2);
    expect(entries.value[0].id).toBe(ULID_1);
    expect(entries.value[1].id).toBe(ULID_2);
    expect(hasMore.value).toBe(false);
  });

  it('fetchNextPage passes cursor from last fetch', async () => {
    const cursor = ULID_1;
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ entries: [makeEntry(cursor)], nextCursor: cursor })
      .mockResolvedValueOnce({ entries: [], nextCursor: null });

    const { fetchInitial, fetchNextPage } = useAuditLog();
    await fetchInitial();
    await fetchNextPage();

    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      `/api/admin/audit-log?limit=50&cursor=${encodeURIComponent(cursor)}`,
    );
  });

  it('fetchNextPage is a no-op when there is no cursor', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ entries: [], nextCursor: null });

    const { fetchInitial, fetchNextPage } = useAuditLog();
    await fetchInitial();
    await fetchNextPage();

    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('sets error on fetchInitial failure', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('Network error'));

    const { error, fetchInitial } = useAuditLog();
    await fetchInitial();

    expect(error.value).toBe('Network error');
  });

  it('sets error on fetchNextPage failure', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({
        entries: [makeEntry('01HXAAAA0000000000000002')],
        nextCursor: '01HXAAAA0000000000000002',
      })
      .mockRejectedValueOnce(new Error('Fetch failed'));

    const { error, fetchInitial, fetchNextPage } = useAuditLog();
    await fetchInitial();
    await fetchNextPage();

    expect(error.value).toBe('Fetch failed');
  });

  it('isLoading is true during fetch and false after', async () => {
    let resolvePromise!: (value: unknown) => void;
    const promise = new Promise((res) => {
      resolvePromise = res;
    });
    vi.mocked(apiFetch).mockReturnValue(promise as never);

    const { isLoading, fetchInitial } = useAuditLog();
    const fetchPromise = fetchInitial();
    expect(isLoading.value).toBe(true);
    resolvePromise({ entries: [], nextCursor: null });
    await fetchPromise;
    expect(isLoading.value).toBe(false);
  });
});
