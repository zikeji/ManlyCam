import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/client.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => 'test-ulid-001') }));

vi.mock('../services/wsHub.js', () => ({
  wsHub: { broadcast: vi.fn() },
}));

import { prisma } from '../db/client.js';
import { wsHub } from '../services/wsHub.js';
import { muteUser, unmuteUser } from './moderationService.js';
import { AppError } from '../lib/errors.js';

const viewerTarget = { id: 'target-001', role: 'ViewerCompany', mutedAt: null };
const modTarget = { id: 'target-mod', role: 'Moderator', mutedAt: null };
const adminTarget = { id: 'target-admin', role: 'Admin', mutedAt: null };

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
