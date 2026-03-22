import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/client.js', () => ({
  prisma: {
    streamConfig: {
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../db/client.js';
import { streamConfig } from './stream-config.js';

describe('streamConfig.get', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns stored value when row exists', async () => {
    vi.mocked(prisma.streamConfig.findUnique).mockResolvedValue({
      key: 'adminToggle',
      value: 'offline',
      updatedAt: new Date(),
    } as never);
    expect(await streamConfig.get('adminToggle', 'live')).toBe('offline');
  });

  it('returns defaultValue when row is null', async () => {
    vi.mocked(prisma.streamConfig.findUnique).mockResolvedValue(null);
    expect(await streamConfig.get('adminToggle', 'live')).toBe('live');
  });
});

describe('streamConfig.getOrNull', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns stored value when row exists', async () => {
    vi.mocked(prisma.streamConfig.findUnique).mockResolvedValue({
      key: 'offlineEmoji',
      value: '1f600',
      updatedAt: new Date(),
    } as never);
    expect(await streamConfig.getOrNull('offlineEmoji')).toBe('1f600');
  });

  it('returns null when row does not exist', async () => {
    vi.mocked(prisma.streamConfig.findUnique).mockResolvedValue(null);
    expect(await streamConfig.getOrNull('offlineEmoji')).toBeNull();
  });
});

describe('streamConfig.set', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts when value is a non-null string', async () => {
    vi.mocked(prisma.streamConfig.upsert).mockResolvedValue({} as never);
    await streamConfig.set('adminToggle', 'offline');
    expect(prisma.streamConfig.upsert).toHaveBeenCalledWith({
      where: { key: 'adminToggle' },
      update: { value: 'offline' },
      create: { key: 'adminToggle', value: 'offline' },
    });
    expect(prisma.streamConfig.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes row when value is null', async () => {
    vi.mocked(prisma.streamConfig.deleteMany).mockResolvedValue({ count: 1 } as never);
    await streamConfig.set('offlineEmoji', null);
    expect(prisma.streamConfig.deleteMany).toHaveBeenCalledWith({ where: { key: 'offlineEmoji' } });
    expect(prisma.streamConfig.upsert).not.toHaveBeenCalled();
  });
});

describe('streamConfig.getMany', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns map with values for existing keys and null for missing keys', async () => {
    vi.mocked(prisma.streamConfig.findMany).mockResolvedValue([
      { key: 'offlineEmoji', value: '1f634', updatedAt: new Date() },
    ] as never);
    const result = await streamConfig.getMany([
      'offlineEmoji',
      'offlineTitle',
      'offlineDescription',
    ]);
    expect(result).toEqual({
      offlineEmoji: '1f634',
      offlineTitle: null,
      offlineDescription: null,
    });
  });

  it('returns all nulls when no rows match', async () => {
    vi.mocked(prisma.streamConfig.findMany).mockResolvedValue([] as never);
    const result = await streamConfig.getMany(['offlineEmoji', 'offlineTitle']);
    expect(result).toEqual({ offlineEmoji: null, offlineTitle: null });
  });

  it('queries with the correct keys filter', async () => {
    vi.mocked(prisma.streamConfig.findMany).mockResolvedValue([] as never);
    await streamConfig.getMany(['a', 'b']);
    expect(prisma.streamConfig.findMany).toHaveBeenCalledWith({
      where: { key: { in: ['a', 'b'] } },
    });
  });
});
