import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api';

describe('useCommands', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('loadCommands fetches /api/commands and caches result', async () => {
    const mockCommands = [{ name: 'shrug', description: 'Shrug emoticon' }];
    vi.mocked(apiFetch).mockResolvedValue({ commands: mockCommands });

    const { loadCommands, availableCommands } = await import('./useCommands');
    await loadCommands();

    expect(apiFetch).toHaveBeenCalledWith('/api/commands');
    expect(availableCommands.value).toEqual(mockCommands);
  });

  it('loadCommands is a no-op on second call (cached)', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ commands: [] });

    const { loadCommands } = await import('./useCommands');
    await loadCommands();
    await loadCommands();

    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('refreshCommands always fetches fresh data', async () => {
    const first = [{ name: 'shrug', description: 'Shrug' }];
    const second = [
      { name: 'shrug', description: 'Shrug' },
      { name: 'ban', description: 'Ban user' },
    ];
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ commands: first })
      .mockResolvedValueOnce({ commands: second });

    const { loadCommands, refreshCommands, availableCommands } = await import('./useCommands');
    await loadCommands();
    expect(availableCommands.value).toEqual(first);

    await refreshCommands();
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(availableCommands.value).toEqual(second);
  });

  it('concurrent calls to loadCommands share one in-flight request', async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise((r) => {
      resolve = r;
    });
    vi.mocked(apiFetch).mockReturnValueOnce(pending as Promise<{ commands: never[] }>);

    const { loadCommands } = await import('./useCommands');

    // Fire two concurrent calls before the fetch resolves
    const p1 = loadCommands();
    const p2 = loadCommands();

    resolve({ commands: [] });
    await Promise.all([p1, p2]);

    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('loadCommands silently fails on network error', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('Network error'));

    const { loadCommands, availableCommands } = await import('./useCommands');
    await expect(loadCommands()).resolves.toBeUndefined();
    expect(availableCommands.value).toEqual([]);
  });
});
