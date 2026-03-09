import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/client.js', () => ({
  prisma: {
    message: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => '01HZTEST00000000000000001') }));

vi.mock('./wsHub.js', () => ({
  wsHub: { broadcast: vi.fn() },
}));

import { prisma } from '../db/client.js';
import { wsHub } from './wsHub.js';
import { createMessage } from './chatService.js';

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
