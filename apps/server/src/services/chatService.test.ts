import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/client.js', () => ({
  prisma: {
    message: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    reaction: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => '01HZTEST00000000000000001') }));

vi.mock('./wsHub.js', () => ({
  wsHub: { broadcast: vi.fn(), getPresenceList: vi.fn(() => []) },
}));

import { prisma } from '../db/client.js';
import { wsHub } from './wsHub.js';
import { createMessage, getHistory, editMessage, deleteMessage } from './chatService.js';
import type { MockInstance } from 'vitest';

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
    await createMessage({
      userId: 'user-001',
      userDisplayName: 'Test User',
      userRole: 'ViewerCompany' as const,
      content: 'Hello world',
    });

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
    const result = await createMessage({
      userId: 'user-001',
      userDisplayName: 'Test User',
      userRole: 'ViewerCompany' as const,
      content: 'Hello world',
    });

    expect(result).toEqual({
      id: '01HZTEST00000000000000001',
      userId: 'user-001',
      displayName: 'Test User',
      avatarUrl: null,
      authorRole: 'ViewerCompany',
      content: 'Hello world',
      editHistory: null,
      updatedAt: null,
      deletedAt: null,
      deletedBy: null,
      createdAt: '2026-03-08T10:00:00.000Z',
      userTag: null,
      reactions: [],
    });
  });

  it('broadcasts a chat:message WS event to all clients', async () => {
    const result = await createMessage({
      userId: 'user-001',
      userDisplayName: 'Test User',
      userRole: 'ViewerCompany' as const,
      content: 'Hello world',
    });

    expect(wsHub.broadcast).toHaveBeenCalledWith({
      type: 'chat:message',
      payload: result,
    });
  });

  it('computes userTag as null for ViewerCompany with no tag text', async () => {
    const result = await createMessage({
      userId: 'user-001',
      userDisplayName: 'Test User',
      userRole: 'ViewerCompany' as const,
      content: 'Hi',
    });
    expect(result!.userTag).toBeNull();
  });

  it('computes Guest userTag for ViewerGuest with no tag text', async () => {
    vi.mocked(prisma.message.create).mockResolvedValue({
      ...mockMessageRow,
      user: { ...mockUser, role: 'ViewerGuest' },
    } as never);

    const result = await createMessage({
      userId: 'user-001',
      userDisplayName: 'Test User',
      userRole: 'ViewerCompany' as const,
      content: 'Hi',
    });
    expect(result!.userTag).toEqual({ text: 'Guest', color: '#a16207' });
  });

  it('computes custom userTag when userTagText is set', async () => {
    vi.mocked(prisma.message.create).mockResolvedValue({
      ...mockMessageRow,
      user: { ...mockUser, userTagText: 'VIP', userTagColor: '#FF0000' },
    } as never);

    const result = await createMessage({
      userId: 'user-001',
      userDisplayName: 'Test User',
      userRole: 'ViewerCompany' as const,
      content: 'Hi',
    });
    expect(result!.userTag).toEqual({ text: 'VIP', color: '#FF0000' });
  });

  it('falls back to default color when userTagColor is null', async () => {
    vi.mocked(prisma.message.create).mockResolvedValue({
      ...mockMessageRow,
      user: { ...mockUser, userTagText: 'Pro', userTagColor: null },
    } as never);

    const result = await createMessage({
      userId: 'user-001',
      userDisplayName: 'Test User',
      userRole: 'ViewerCompany' as const,
      content: 'Hi',
    });
    expect(result!.userTag).toEqual({ text: 'Pro', color: '#6b7280' });
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
      authorRole: 'ViewerCompany',
      content: 'Hello world',
      editHistory: null,
      updatedAt: null,
      deletedAt: null,
      deletedBy: null,
      createdAt: '2026-03-08T10:00:00.000Z',
      userTag: null,
      reactions: [],
    });
  });
});

describe('chatService.toApiChatMessage (via getHistory)', () => {
  it('returns non-null editHistory when row has editHistory JSONB', async () => {
    const history = [{ content: 'original', editedAt: '2026-03-08T10:00:00.000Z' }];
    vi.mocked(prisma.message.findMany).mockResolvedValue([
      { ...mockMessageRow, editHistory: history },
    ] as never);

    const result = await getHistory({});
    expect(result.messages[0].editHistory).toEqual(history);
  });

  it('returns non-null updatedAt when row has updatedAt', async () => {
    vi.mocked(prisma.message.findMany).mockResolvedValue([
      { ...mockMessageRow, updatedAt: new Date('2026-03-08T11:00:00.000Z') },
    ] as never);

    const result = await getHistory({});
    expect(result.messages[0].updatedAt).toBe('2026-03-08T11:00:00.000Z');
  });
});

describe('chatService.editMessage', () => {
  const baseRow = {
    id: 'msg-001',
    userId: 'user-001',
    content: 'Original content',
    editHistory: null,
    updatedAt: null,
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date('2026-03-08T10:00:00.000Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.message.update).mockResolvedValue({} as never);
  });

  it('throws 404 when message not found', async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValue(null);

    await expect(
      editMessage({ messageId: 'msg-001', userId: 'user-001', content: 'New content' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('throws 403 when userId does not match message.userId', async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValue({ ...baseRow } as never);

    await expect(
      editMessage({ messageId: 'msg-001', userId: 'user-999', content: 'New content' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('throws 404 when message is already deleted', async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValue({
      ...baseRow,
      deletedAt: new Date(),
    } as never);

    await expect(
      editMessage({ messageId: 'msg-001', userId: 'user-001', content: 'New content' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('updates content and builds editHistory from null array', async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValue({ ...baseRow } as never);

    await editMessage({ messageId: 'msg-001', userId: 'user-001', content: 'New content' });

    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: 'New content',
          editHistory: [{ content: 'Original content', editedAt: expect.any(String) }],
        }),
      }),
    );
  });

  it('appends to existing editHistory array', async () => {
    const existingHistory = [{ content: 'First', editedAt: '2026-03-08T09:00:00.000Z' }];
    vi.mocked(prisma.message.findUnique).mockResolvedValue({
      ...baseRow,
      editHistory: existingHistory,
    } as never);

    await editMessage({ messageId: 'msg-001', userId: 'user-001', content: 'Third content' });

    const updateCall = vi.mocked(prisma.message.update).mock.calls[0][0];
    const history = (updateCall as unknown as { data: { editHistory: { content: string }[] } }).data
      .editHistory;
    expect(history).toHaveLength(2);
    expect(history[0].content).toBe('First');
    expect(history[1].content).toBe('Original content');
  });

  it('broadcasts chat:edit WS event with correct ChatEdit payload', async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValue({ ...baseRow } as never);

    const result = await editMessage({
      messageId: 'msg-001',
      userId: 'user-001',
      content: 'Edited',
    });

    expect(wsHub.broadcast).toHaveBeenCalledWith({ type: 'chat:edit', payload: result });
  });

  it('returns correct ChatEdit shape', async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValue({ ...baseRow } as never);

    const result = await editMessage({
      messageId: 'msg-001',
      userId: 'user-001',
      content: 'Edited',
    });

    expect(result).toMatchObject({
      messageId: 'msg-001',
      content: 'Edited',
      editHistory: expect.any(Array),
      updatedAt: expect.any(String),
    });
  });
});

describe('chatService.deleteMessage', () => {
  const authorUser = { ...mockUser, id: 'user-002', role: 'ViewerCompany' };
  const baseRow = {
    id: 'msg-001',
    userId: 'user-002',
    content: 'Hello',
    editHistory: null,
    updatedAt: null,
    deletedAt: null,
    deletedBy: null,
    createdAt: new Date('2026-03-08T10:00:00.000Z'),
    user: authorUser,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.message.update).mockResolvedValue({} as never);
    (vi.mocked(prisma.auditLog.create) as MockInstance).mockResolvedValue({} as never);
  });

  it('throws 404 when message not found', async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValue(null);

    await expect(
      deleteMessage({ messageId: 'msg-001', userId: 'user-002', callerRole: 'ViewerCompany' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('throws 404 when message is already deleted', async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValue({
      ...baseRow,
      deletedAt: new Date(),
    } as never);

    await expect(
      deleteMessage({ messageId: 'msg-001', userId: 'user-002', callerRole: 'ViewerCompany' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('self-delete: soft-deletes own message regardless of role', async () => {
    const ownRow = { ...baseRow, userId: 'user-001', user: { ...authorUser, id: 'user-001' } };
    vi.mocked(prisma.message.findUnique).mockResolvedValue(ownRow as never);

    await deleteMessage({ messageId: 'msg-001', userId: 'user-001', callerRole: 'ViewerCompany' });

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-001' },
      data: { deletedAt: expect.any(Date), deletedBy: 'user-001' },
    });
  });

  it('self-delete: does NOT create audit log entry', async () => {
    const ownRow = { ...baseRow, userId: 'user-001', user: { ...authorUser, id: 'user-001' } };
    vi.mocked(prisma.message.findUnique).mockResolvedValue(ownRow as never);

    await deleteMessage({ messageId: 'msg-001', userId: 'user-001', callerRole: 'Admin' });

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('self-delete: broadcasts chat:delete WS event', async () => {
    const ownRow = { ...baseRow, userId: 'user-001', user: { ...authorUser, id: 'user-001' } };
    vi.mocked(prisma.message.findUnique).mockResolvedValue(ownRow as never);

    await deleteMessage({ messageId: 'msg-001', userId: 'user-001', callerRole: 'ViewerCompany' });

    expect(wsHub.broadcast).toHaveBeenCalledWith({
      type: 'chat:delete',
      payload: { messageId: 'msg-001' },
    });
  });

  it('throws 403 FORBIDDEN when non-privileged user tries to delete others message', async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValue(baseRow as never);

    await expect(
      deleteMessage({ messageId: 'msg-001', userId: 'user-001', callerRole: 'ViewerCompany' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('throws 403 FORBIDDEN for ViewerGuest deleting others message', async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValue(baseRow as never);

    await expect(
      deleteMessage({ messageId: 'msg-001', userId: 'user-001', callerRole: 'ViewerGuest' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('mod-delete: Moderator can delete ViewerCompany message', async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValue(baseRow as never);

    await deleteMessage({ messageId: 'msg-001', userId: 'user-001', callerRole: 'Moderator' });

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-001' },
      data: { deletedAt: expect.any(Date), deletedBy: 'user-001' },
    });
  });

  it('mod-delete: creates AuditLog entry for Moderator-initiated delete', async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValue(baseRow as never);

    await deleteMessage({ messageId: 'msg-001', userId: 'user-001', callerRole: 'Moderator' });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        id: expect.any(String),
        action: 'message_delete',
        actorId: 'user-001',
        targetId: 'msg-001',
      },
    });
  });

  it('mod-delete: Moderator CANNOT delete another Moderator message — 403 INSUFFICIENT_ROLE', async () => {
    const modRow = { ...baseRow, user: { ...authorUser, role: 'Moderator' } };
    vi.mocked(prisma.message.findUnique).mockResolvedValue(modRow as never);

    await expect(
      deleteMessage({ messageId: 'msg-001', userId: 'user-001', callerRole: 'Moderator' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'INSUFFICIENT_ROLE' });
  });

  it('mod-delete: Moderator CANNOT delete Admin message — 403 INSUFFICIENT_ROLE', async () => {
    const adminRow = { ...baseRow, user: { ...authorUser, role: 'Admin' } };
    vi.mocked(prisma.message.findUnique).mockResolvedValue(adminRow as never);

    await expect(
      deleteMessage({ messageId: 'msg-001', userId: 'user-001', callerRole: 'Moderator' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'INSUFFICIENT_ROLE' });
  });

  it('mod-delete: Admin CAN delete Moderator message', async () => {
    const modRow = { ...baseRow, user: { ...authorUser, role: 'Moderator' } };
    vi.mocked(prisma.message.findUnique).mockResolvedValue(modRow as never);

    await deleteMessage({ messageId: 'msg-001', userId: 'user-001', callerRole: 'Admin' });

    expect(prisma.message.update).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('mod-delete: Admin CANNOT delete another Admin message — 403 INSUFFICIENT_ROLE', async () => {
    const adminRow = { ...baseRow, user: { ...authorUser, role: 'Admin' } };
    vi.mocked(prisma.message.findUnique).mockResolvedValue(adminRow as never);

    await expect(
      deleteMessage({ messageId: 'msg-001', userId: 'user-001', callerRole: 'Admin' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'INSUFFICIENT_ROLE' });
  });
});
