import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/client.js', () => ({
  prisma: {
    message: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    reaction: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => 'test-ulid-001') }));

vi.mock('../services/wsHub.js', () => ({
  wsHub: { broadcast: vi.fn() },
}));

import { prisma } from '../db/client.js';
import { wsHub } from '../services/wsHub.js';
import {
  addReaction,
  removeReaction,
  removeReactionByMod,
  getReactionsForMessage,
  getReactionsForMessages,
} from './reactionsService.js';

const mockMessage = {
  id: 'msg-001',
  userId: 'user-author',
  deletedAt: null,
  user: { displayName: 'Author User' },
};

const mockUser = { id: 'user-001', mutedAt: null };
const mutedUser = { id: 'user-muted', mutedAt: new Date() };

describe('addReaction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds a reaction and broadcasts reaction:add', async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValue(mockMessage as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
    const now = new Date();
    vi.mocked(prisma.reaction.upsert).mockResolvedValue({
      id: 'rxn-001',
      messageId: 'msg-001',
      userId: 'user-001',
      emoji: 'thumbs_up',
      createdAt: now,
      user: { displayName: 'User One', role: 'ViewerCompany' },
    } as never);

    const result = await addReaction({
      messageId: 'msg-001',
      userId: 'user-001',
      emoji: 'thumbs_up',
    });

    expect(result.messageId).toBe('msg-001');
    expect(result.emoji).toBe('thumbs_up');
    expect(result.displayName).toBe('User One');
    expect(result.role).toBe('ViewerCompany');
    expect(wsHub.broadcast).toHaveBeenCalledWith({
      type: 'reaction:add',
      payload: expect.objectContaining({ messageId: 'msg-001', emoji: 'thumbs_up' }),
    });
  });

  it('throws NOT_FOUND when message does not exist', async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValue(null);
    await expect(
      addReaction({ messageId: 'nonexistent', userId: 'user-001', emoji: 'thumbs_up' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('throws NOT_FOUND when message is deleted', async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValue({
      ...mockMessage,
      deletedAt: new Date(),
    } as never);
    await expect(
      addReaction({ messageId: 'msg-001', userId: 'user-001', emoji: 'thumbs_up' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('throws NOT_FOUND when user does not exist', async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValue(mockMessage as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await expect(
      addReaction({ messageId: 'msg-001', userId: 'nonexistent', emoji: 'thumbs_up' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('throws FORBIDDEN when user is muted', async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValue(mockMessage as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mutedUser as never);
    await expect(
      addReaction({ messageId: 'msg-001', userId: 'user-muted', emoji: 'thumbs_up' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(prisma.reaction.upsert).not.toHaveBeenCalled();
  });

  it('uses upsert to prevent duplicate reactions', async () => {
    vi.mocked(prisma.message.findUnique).mockResolvedValue(mockMessage as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
    vi.mocked(prisma.reaction.upsert).mockResolvedValue({
      id: 'rxn-001',
      messageId: 'msg-001',
      userId: 'user-001',
      emoji: 'thumbs_up',
      createdAt: new Date(),
      user: { displayName: 'User One', role: 'ViewerCompany' },
    } as never);

    await addReaction({ messageId: 'msg-001', userId: 'user-001', emoji: 'thumbs_up' });

    expect(prisma.reaction.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          messageId_userId_emoji: { messageId: 'msg-001', userId: 'user-001', emoji: 'thumbs_up' },
        },
        update: {},
      }),
    );
  });
});

describe('removeReaction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes reaction and broadcasts reaction:remove', async () => {
    vi.mocked(prisma.reaction.deleteMany).mockResolvedValue({ count: 1 } as never);

    await removeReaction({ messageId: 'msg-001', userId: 'user-001', emoji: 'thumbs_up' });

    expect(prisma.reaction.deleteMany).toHaveBeenCalledWith({
      where: { messageId: 'msg-001', userId: 'user-001', emoji: 'thumbs_up' },
    });
    expect(wsHub.broadcast).toHaveBeenCalledWith({
      type: 'reaction:remove',
      payload: { messageId: 'msg-001', userId: 'user-001', emoji: 'thumbs_up' },
    });
  });
});

describe('removeReactionByMod', () => {
  beforeEach(() => vi.clearAllMocks());

  it('removes reaction, creates audit log, and broadcasts', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'target-001',
      role: 'ViewerCompany',
    } as never);
    vi.mocked(prisma.reaction.deleteMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    await removeReactionByMod({
      messageId: 'msg-001',
      targetUserId: 'target-001',
      emoji: 'thumbs_up',
      modId: 'mod-001',
      modRole: 'Moderator',
    });

    expect(prisma.reaction.deleteMany).toHaveBeenCalledWith({
      where: { messageId: 'msg-001', userId: 'target-001', emoji: 'thumbs_up' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'reaction_remove', actorId: 'mod-001' }),
    });
    expect(wsHub.broadcast).toHaveBeenCalledWith({
      type: 'reaction:remove',
      payload: { messageId: 'msg-001', userId: 'target-001', emoji: 'thumbs_up' },
    });
  });

  it('throws NOT_FOUND when target user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await expect(
      removeReactionByMod({
        messageId: 'msg-001',
        targetUserId: 'nonexistent',
        emoji: 'thumbs_up',
        modId: 'mod-001',
        modRole: 'Moderator',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('throws INSUFFICIENT_ROLE when mod cannot moderate over target', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'target', role: 'Admin' } as never);
    await expect(
      removeReactionByMod({
        messageId: 'msg-001',
        targetUserId: 'target',
        emoji: 'thumbs_up',
        modId: 'mod-001',
        modRole: 'Moderator',
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE', statusCode: 403 });
    expect(prisma.reaction.deleteMany).not.toHaveBeenCalled();
  });
});

describe('getReactionsForMessage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when no reactions exist', async () => {
    vi.mocked(prisma.reaction.findMany).mockResolvedValue([]);
    const result = await getReactionsForMessage('msg-001');
    expect(result).toEqual([]);
  });

  it('groups reactions by emoji with count, userIds and userDisplayNames', async () => {
    const t1 = new Date('2026-01-01T10:00:00Z');
    const t2 = new Date('2026-01-01T10:01:00Z');
    vi.mocked(prisma.reaction.findMany).mockResolvedValue([
      {
        id: 'r1',
        messageId: 'msg-001',
        userId: 'u1',
        emoji: 'thumbs_up',
        createdAt: t1,
        user: { displayName: 'User One', role: 'ViewerCompany' },
      },
      {
        id: 'r2',
        messageId: 'msg-001',
        userId: 'u2',
        emoji: 'thumbs_up',
        createdAt: t2,
        user: { displayName: 'User Two', role: 'Viewer' },
      },
      {
        id: 'r3',
        messageId: 'msg-001',
        userId: 'u1',
        emoji: 'red_heart',
        createdAt: t2,
        user: { displayName: 'User One', role: 'ViewerCompany' },
      },
    ] as never);

    const result = await getReactionsForMessage('msg-001');
    expect(result).toHaveLength(2);
    expect(result[0].emoji).toBe('thumbs_up');
    expect(result[0].count).toBe(2);
    expect(result[0].userIds).toEqual(['u1', 'u2']);
    expect(result[0].userDisplayNames).toEqual(['User One', 'User Two']);
    expect(result[0].userRoles).toEqual(['ViewerCompany', 'Viewer']);
    expect(result[1].emoji).toBe('red_heart');
    expect(result[1].count).toBe(1);
    expect(result[1].userDisplayNames).toEqual(['User One']);
    expect(result[1].userRoles).toEqual(['ViewerCompany']);
  });

  it('sorts reactions by first reaction time (oldest first)', async () => {
    const t1 = new Date('2026-01-01T10:00:00Z');
    const t2 = new Date('2026-01-01T10:05:00Z');
    vi.mocked(prisma.reaction.findMany).mockResolvedValue([
      {
        id: 'r1',
        messageId: 'msg-001',
        userId: 'u1',
        emoji: 'red_heart',
        createdAt: t2,
        user: { displayName: 'User One', role: 'ViewerCompany' },
      },
      {
        id: 'r2',
        messageId: 'msg-001',
        userId: 'u2',
        emoji: 'thumbs_up',
        createdAt: t1,
        user: { displayName: 'User Two', role: 'Viewer' },
      },
    ] as never);

    const result = await getReactionsForMessage('msg-001');
    expect(result[0].emoji).toBe('thumbs_up'); // earlier firstReactedAt
    expect(result[1].emoji).toBe('red_heart');
  });

  it('sets userReacted=true when currentUserId is in userIds', async () => {
    vi.mocked(prisma.reaction.findMany).mockResolvedValue([
      {
        id: 'r1',
        messageId: 'msg-001',
        userId: 'u1',
        emoji: 'thumbs_up',
        createdAt: new Date(),
        user: { displayName: 'User One', role: 'ViewerCompany' },
      },
      {
        id: 'r2',
        messageId: 'msg-001',
        userId: 'u2',
        emoji: 'thumbs_up',
        createdAt: new Date(),
        user: { displayName: 'User Two', role: 'Viewer' },
      },
    ] as never);

    const result = await getReactionsForMessage('msg-001', 'u1');
    expect(result[0].userReacted).toBe(true);
  });

  it('sets userReacted=false when currentUserId is NOT in userIds', async () => {
    vi.mocked(prisma.reaction.findMany).mockResolvedValue([
      {
        id: 'r1',
        messageId: 'msg-001',
        userId: 'u1',
        emoji: 'thumbs_up',
        createdAt: new Date(),
        user: { displayName: 'User One', role: 'ViewerCompany' },
      },
    ] as never);

    const result = await getReactionsForMessage('msg-001', 'other-user');
    expect(result[0].userReacted).toBe(false);
  });
});

describe('getReactionsForMessages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty map for empty messageIds', async () => {
    const result = await getReactionsForMessages([]);
    expect(result.size).toBe(0);
    expect(prisma.reaction.findMany).not.toHaveBeenCalled();
  });

  it('returns reactions grouped by messageId', async () => {
    vi.mocked(prisma.reaction.findMany).mockResolvedValue([
      {
        id: 'r1',
        messageId: 'msg-001',
        userId: 'u1',
        emoji: 'thumbs_up',
        createdAt: new Date(),
        user: { displayName: 'User One', role: 'ViewerCompany' },
      },
      {
        id: 'r2',
        messageId: 'msg-002',
        userId: 'u2',
        emoji: 'red_heart',
        createdAt: new Date(),
        user: { displayName: 'User Two', role: 'Viewer' },
      },
    ] as never);

    const result = await getReactionsForMessages(['msg-001', 'msg-002'], 'u1');
    expect(result.get('msg-001')).toHaveLength(1);
    expect(result.get('msg-001')![0].emoji).toBe('thumbs_up');
    expect(result.get('msg-001')![0].userReacted).toBe(true);
    expect(result.get('msg-002')).toHaveLength(1);
    expect(result.get('msg-002')![0].userReacted).toBe(false);
  });

  it('returns empty array for messages with no reactions', async () => {
    vi.mocked(prisma.reaction.findMany).mockResolvedValue([]);
    const result = await getReactionsForMessages(['msg-001', 'msg-002']);
    expect(result.get('msg-001')).toEqual([]);
    expect(result.get('msg-002')).toEqual([]);
  });

  it('aggregates multiple reactions with same emoji from different users on same message', async () => {
    const t1 = new Date('2026-01-01T10:00:00Z');
    const t2 = new Date('2026-01-01T10:01:00Z');
    vi.mocked(prisma.reaction.findMany).mockResolvedValue([
      {
        id: 'r1',
        messageId: 'msg-001',
        userId: 'u1',
        emoji: 'thumbs_up',
        createdAt: t1,
        user: { displayName: 'User One', role: 'ViewerCompany' },
      },
      {
        id: 'r2',
        messageId: 'msg-001',
        userId: 'u2',
        emoji: 'thumbs_up',
        createdAt: t2,
        user: { displayName: 'User Two', role: 'Viewer' },
      },
    ] as never);

    const result = await getReactionsForMessages(['msg-001']);
    const reactions = result.get('msg-001')!;
    expect(reactions).toHaveLength(1);
    expect(reactions[0].emoji).toBe('thumbs_up');
    expect(reactions[0].count).toBe(2);
    expect(reactions[0].userIds).toEqual(['u1', 'u2']);
    expect(reactions[0].userDisplayNames).toEqual(['User One', 'User Two']);
    expect(reactions[0].userRoles).toEqual(['ViewerCompany', 'Viewer']);
  });
});
