import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/client.js', () => ({
  prisma: {
    message: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => '01HZTEST00000000000000001') }));

vi.mock('./wsHub.js', () => ({
  wsHub: { broadcast: vi.fn() },
}));

import { prisma } from '../db/client.js';
import { wsHub } from './wsHub.js';
import { createMessage, getHistory } from './chatService.js';

const mockUser = {
  id: 'user-001',
  googleSub: 'google-sub',
  email: 'test@example.com',
  displayName: 'Test User',
  avatarUrl: null,
  role: 'ViewerCompany',
  userTagText: null,
  userTagColor: null,
  mutedAt: null,
  bannedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  lastSeenAt: null,
};

const mockMessageRow = {
  id: '01HZTEST00000000000000001',
  userId: 'user-001',
  content: 'Hello world',
  editHistory: null,
  updatedAt: null,
  deletedAt: null,
  deletedBy: null,
  createdAt: new Date('2026-03-08T10:00:00.000Z'),
  user: mockUser,
};

describe('chatService.createMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.message.create).mockResolvedValue(mockMessageRow as never);
  });

  it('inserts a message row into the database', async () => {
    await createMessage({ userId: 'user-001', content: 'Hello world' });

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        id: '01HZTEST00000000000000001',
        userId: 'user-001',
        content: 'Hello world',
      },
      include: { user: true },
    });
  });

  it('returns a ChatMessage shape with correct fields', async () => {
    const result = await createMessage({ userId: 'user-001', content: 'Hello world' });

    expect(result).toEqual({
      id: '01HZTEST00000000000000001',
      userId: 'user-001',
      displayName: 'Test User',
      avatarUrl: null,
      content: 'Hello world',
      editHistory: null,
      updatedAt: null,
      deletedAt: null,
      deletedBy: null,
      createdAt: '2026-03-08T10:00:00.000Z',
      userTag: null,
    });
  });

  it('broadcasts a chat:message WS event to all clients', async () => {
    const result = await createMessage({ userId: 'user-001', content: 'Hello world' });

    expect(wsHub.broadcast).toHaveBeenCalledWith({
      type: 'chat:message',
      payload: result,
    });
  });

  it('computes userTag as null for ViewerCompany with no tag text', async () => {
    const result = await createMessage({ userId: 'user-001', content: 'Hi' });
    expect(result.userTag).toBeNull();
  });

  it('computes Guest userTag for ViewerGuest with no tag text', async () => {
    vi.mocked(prisma.message.create).mockResolvedValue({
      ...mockMessageRow,
      user: { ...mockUser, role: 'ViewerGuest' },
    } as never);

    const result = await createMessage({ userId: 'user-001', content: 'Hi' });
    expect(result.userTag).toEqual({ text: 'Guest', color: '#9CA3AF' });
  });

  it('computes custom userTag when userTagText is set', async () => {
    vi.mocked(prisma.message.create).mockResolvedValue({
      ...mockMessageRow,
      user: { ...mockUser, userTagText: 'VIP', userTagColor: '#FF0000' },
    } as never);

    const result = await createMessage({ userId: 'user-001', content: 'Hi' });
    expect(result.userTag).toEqual({ text: 'VIP', color: '#FF0000' });
  });

  it('falls back to default color when userTagColor is null', async () => {
    vi.mocked(prisma.message.create).mockResolvedValue({
      ...mockMessageRow,
      user: { ...mockUser, userTagText: 'Pro', userTagColor: null },
    } as never);

    const result = await createMessage({ userId: 'user-001', content: 'Hi' });
    expect(result.userTag).toEqual({ text: 'Pro', color: '#6B7280' });
  });
});

describe('chatService.getHistory', () => {
  function makeRow(id: string, createdAt: Date) {
    return { ...mockMessageRow, id, createdAt };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries with deletedAt null and orderBy id desc without cursor', async () => {
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);

    await getHistory({});

    expect(prisma.message.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { id: 'desc' },
      take: 51,
      include: { user: true },
    });
  });

  it('queries with id lt cursor when before is provided', async () => {
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);

    await getHistory({ before: 'CURSOR001' });

    expect(prisma.message.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, id: { lt: 'CURSOR001' } },
      orderBy: { id: 'desc' },
      take: 51,
      include: { user: true },
    });
  });

  it('returns messages in ascending order (oldest first)', async () => {
    const rows = [
      makeRow('MSG003', new Date('2026-03-08T12:00:00.000Z')),
      makeRow('MSG002', new Date('2026-03-08T11:00:00.000Z')),
      makeRow('MSG001', new Date('2026-03-08T10:00:00.000Z')),
    ];
    vi.mocked(prisma.message.findMany).mockResolvedValue(rows as never);

    const result = await getHistory({});

    expect(result.messages[0].id).toBe('MSG001');
    expect(result.messages[1].id).toBe('MSG002');
    expect(result.messages[2].id).toBe('MSG003');
  });

  it('returns hasMore false when rows <= limit', async () => {
    vi.mocked(prisma.message.findMany).mockResolvedValue([mockMessageRow] as never);

    const result = await getHistory({ limit: 50 });

    expect(result.hasMore).toBe(false);
  });

  it('returns hasMore true when rows > limit and slices to limit', async () => {
    const base = new Date('2026-03-08T10:00:00.000Z').getTime();
    const rows = Array.from({ length: 51 }, (_, i) =>
      makeRow(`MSG${String(i).padStart(3, '0')}`, new Date(base + i * 60000)),
    );
    vi.mocked(prisma.message.findMany).mockResolvedValue(rows as never);

    const result = await getHistory({ limit: 50 });

    expect(result.hasMore).toBe(true);
    expect(result.messages).toHaveLength(50);
  });

  it('clamps limit to max 100', async () => {
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);

    await getHistory({ limit: 9999 });

    expect(prisma.message.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 101 }));
  });

  it('clamps limit to min 1', async () => {
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);

    await getHistory({ limit: 0 });

    expect(prisma.message.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
  });

  it('defaults limit to 50 when not provided', async () => {
    vi.mocked(prisma.message.findMany).mockResolvedValue([]);

    await getHistory({});

    expect(prisma.message.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 51 }));
  });

  it('maps rows to ChatMessage shape', async () => {
    vi.mocked(prisma.message.findMany).mockResolvedValue([mockMessageRow] as never);

    const result = await getHistory({});

    expect(result.messages[0]).toEqual({
      id: '01HZTEST00000000000000001',
      userId: 'user-001',
      displayName: 'Test User',
      avatarUrl: null,
      content: 'Hello world',
      editHistory: null,
      updatedAt: null,
      deletedAt: null,
      deletedBy: null,
      createdAt: '2026-03-08T10:00:00.000Z',
      userTag: null,
    });
  });
});
