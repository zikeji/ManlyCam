import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Prisma } from '@prisma/client';

vi.mock('../db/client.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    session: { deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn((cb) =>
      cb({
        user: { update: vi.fn() },
        session: { deleteMany: vi.fn() },
        auditLog: { create: vi.fn() },
      }),
    ),
  },
}));

vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => 'test-ulid-001') }));

vi.mock('../services/wsHub.js', () => ({
  wsHub: {
    broadcast: vi.fn(),
    revokeUserSessions: vi.fn(),
  },
}));

import { prisma } from '../db/client.js';
import { wsHub } from '../services/wsHub.js';
import { muteUser, unmuteUser, banUser, unbanUser } from './moderationService.js';
import { AppError } from '../lib/errors.js';

const viewerTarget = { id: 'target-001', role: 'ViewerCompany', mutedAt: null, bannedAt: null };
const modTarget = { id: 'target-mod', role: 'Moderator', mutedAt: null, bannedAt: null };
const adminTarget = { id: 'target-admin', role: 'Admin', mutedAt: null, bannedAt: null };

describe('banUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bans a ViewerCompany as Moderator — success', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(viewerTarget as never);
    const txMock = {
      user: { update: vi.fn().mockResolvedValue({}) },
      session: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    vi.mocked(prisma.$transaction).mockImplementation(
      async (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        return cb(txMock as unknown as Prisma.TransactionClient);
      },
    );

    await banUser({ actorId: 'actor-001', actorRole: 'Moderator', targetUserId: 'target-001' });

    expect(txMock.user.update).toHaveBeenCalledWith({
      where: { id: 'target-001' },
      data: { bannedAt: expect.any(Date) },
    });
    expect(txMock.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'target-001' },
    });
    expect(txMock.auditLog.create).toHaveBeenCalledWith({
      data: { id: 'test-ulid-001', action: 'ban', actorId: 'actor-001', targetId: 'target-001' },
    });
    expect(wsHub.revokeUserSessions).toHaveBeenCalledWith('target-001', 'banned');
  });

  it('throws FORBIDDEN when caller is ViewerCompany', async () => {
    await expect(
      banUser({ actorId: 'actor-001', actorRole: 'ViewerCompany', targetUserId: 'target-001' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when target user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await expect(
      banUser({ actorId: 'actor-001', actorRole: 'Moderator', targetUserId: 'nonexistent' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('throws INSUFFICIENT_ROLE when Moderator tries to ban another Moderator', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(modTarget as never);
    await expect(
      banUser({ actorId: 'actor-001', actorRole: 'Moderator', targetUserId: 'target-mod' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE', statusCode: 403 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
describe('muteUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  });

  it('mutes a ViewerCompany as Moderator — success', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(viewerTarget as never);
    await muteUser({ actorId: 'actor-001', actorRole: 'Moderator', targetUserId: 'target-001' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'target-001' },
      data: { mutedAt: expect.any(Date) },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { id: 'test-ulid-001', action: 'mute', actorId: 'actor-001', targetId: 'target-001' },
    });
    expect(wsHub.broadcast).toHaveBeenCalledWith({
      type: 'moderation:muted',
      payload: { userId: 'target-001' },
    });
  });

  it('mutes a Moderator as Admin — success', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(modTarget as never);
    await muteUser({ actorId: 'actor-admin', actorRole: 'Admin', targetUserId: 'target-mod' });
    expect(prisma.user.update).toHaveBeenCalled();
    expect(wsHub.broadcast).toHaveBeenCalledWith({
      type: 'moderation:muted',
      payload: { userId: 'target-mod' },
    });
  });

  it('throws FORBIDDEN when caller is ViewerCompany', async () => {
    await expect(
      muteUser({ actorId: 'actor-001', actorRole: 'ViewerCompany', targetUserId: 'target-001' }),
    ).rejects.toThrow(AppError);
    await expect(
      muteUser({ actorId: 'actor-001', actorRole: 'ViewerCompany', targetUserId: 'target-001' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when target user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await expect(
      muteUser({ actorId: 'actor-001', actorRole: 'Moderator', targetUserId: 'nonexistent' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('throws INSUFFICIENT_ROLE when Moderator tries to mute another Moderator', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(modTarget as never);
    await expect(
      muteUser({ actorId: 'actor-001', actorRole: 'Moderator', targetUserId: 'target-mod' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE', statusCode: 403 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('throws INSUFFICIENT_ROLE when Moderator tries to mute Admin', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(adminTarget as never);
    await expect(
      muteUser({ actorId: 'actor-001', actorRole: 'Moderator', targetUserId: 'target-admin' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE', statusCode: 403 });
  });

  it('throws INSUFFICIENT_ROLE when Admin tries to mute another Admin', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(adminTarget as never);
    await expect(
      muteUser({ actorId: 'actor-admin', actorRole: 'Admin', targetUserId: 'target-admin' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE', statusCode: 403 });
  });
});

describe('unmuteUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  });

  it('unmutes a ViewerCompany as Moderator — success', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(viewerTarget as never);
    await unmuteUser({ actorId: 'actor-001', actorRole: 'Moderator', targetUserId: 'target-001' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'target-001' },
      data: { mutedAt: null },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        id: 'test-ulid-001',
        action: 'unmute',
        actorId: 'actor-001',
        targetId: 'target-001',
      },
    });
    expect(wsHub.broadcast).toHaveBeenCalledWith({
      type: 'moderation:unmuted',
      payload: { userId: 'target-001' },
    });
  });

  it('unmutes a Moderator as Admin — success', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(modTarget as never);
    await unmuteUser({ actorId: 'actor-admin', actorRole: 'Admin', targetUserId: 'target-mod' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'target-mod' },
      data: { mutedAt: null },
    });
    expect(wsHub.broadcast).toHaveBeenCalledWith({
      type: 'moderation:unmuted',
      payload: { userId: 'target-mod' },
    });
  });

  it('throws FORBIDDEN when caller is ViewerGuest', async () => {
    await expect(
      unmuteUser({ actorId: 'actor-001', actorRole: 'ViewerGuest', targetUserId: 'target-001' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when target user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await expect(
      unmuteUser({ actorId: 'actor-001', actorRole: 'Moderator', targetUserId: 'nonexistent' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('throws INSUFFICIENT_ROLE when Moderator tries to unmute Admin', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(adminTarget as never);
    await expect(
      unmuteUser({ actorId: 'actor-001', actorRole: 'Moderator', targetUserId: 'target-admin' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE', statusCode: 403 });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('throws INSUFFICIENT_ROLE when Admin tries to unmute another Admin', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(adminTarget as never);
    await expect(
      unmuteUser({ actorId: 'actor-admin', actorRole: 'Admin', targetUserId: 'target-admin' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE', statusCode: 403 });
  });
});

describe('unbanUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws FORBIDDEN when actor is Moderator', async () => {
    await expect(
      unbanUser({ actorId: 'actor-001', actorRole: 'Moderator', targetUserId: 'target-001' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when target user does not exist', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await expect(
      unbanUser({ actorId: 'actor-001', actorRole: 'Admin', targetUserId: 'nonexistent' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('throws INSUFFICIENT_ROLE when Admin tries to unban Admin', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(adminTarget as never);
    await expect(
      unbanUser({ actorId: 'actor-admin', actorRole: 'Admin', targetUserId: 'target-admin' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_ROLE', statusCode: 403 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('clears bannedAt and creates unban audit log entry in transaction', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(viewerTarget as never);
    const txMock = {
      user: { update: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    vi.mocked(prisma.$transaction).mockImplementation(
      async (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        return cb(txMock as unknown as Prisma.TransactionClient);
      },
    );

    await unbanUser({ actorId: 'actor-001', actorRole: 'Admin', targetUserId: 'target-001' });

    expect(txMock.user.update).toHaveBeenCalledWith({
      where: { id: 'target-001' },
      data: { bannedAt: null },
    });
    expect(txMock.auditLog.create).toHaveBeenCalledWith({
      data: { id: 'test-ulid-001', action: 'unban', actorId: 'actor-001', targetId: 'target-001' },
    });
  });

  it('completes without error when user bannedAt is already null (idempotent)', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(viewerTarget as never);
    const txMock = {
      user: { update: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    vi.mocked(prisma.$transaction).mockImplementation(
      async (cb: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        return cb(txMock as unknown as Prisma.TransactionClient);
      },
    );

    await expect(
      unbanUser({ actorId: 'actor-001', actorRole: 'Admin', targetUserId: 'target-001' }),
    ).resolves.toBeUndefined();
    expect(txMock.user.update).toHaveBeenCalled();
  });
});
