import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import type { User } from '@prisma/client';

vi.mock('../db/client.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    session: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
  },
}));

vi.mock('./wsHub.js', () => ({
  wsHub: {
    broadcast: vi.fn(),
  },
}));

import { prisma } from '../db/client.js';
import { wsHub } from './wsHub.js';
import {
  banUser,
  unbanUser,
  updateUserRole,
  updateUserRoleById,
  updateUserTagById,
  getAllUsers,
} from './userService.js';

describe('userService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('banUser', () => {
    it('normalizes email to lowercase before lookup', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      await expect(banUser('User@Example.COM')).rejects.toThrow();
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
      });
    });

    it('throws if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      await expect(banUser('nobody@example.com')).rejects.toThrow(
        'User not found: nobody@example.com',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('executes atomic transaction setting bannedAt and deleting sessions', async () => {
      const mockUser: User = {
        id: 'user-1',
        googleSub: 'google-1',
        email: 'user@example.com',
        displayName: 'Test User',
        avatarUrl: null,
        role: 'ViewerCompany',
        userTagText: null,
        userTagColor: null,
        mutedAt: null,
        bannedAt: null,
        createdAt: new Date(),
        lastSeenAt: null,
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.$transaction).mockResolvedValue([
        { ...mockUser, bannedAt: new Date() },
        { count: 2 },
      ]);

      const result = await banUser('user@example.com');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
      });
      expect(prisma.$transaction).toHaveBeenCalledWith([
        prisma.user.update({ where: { id: 'user-1' }, data: { bannedAt: expect.any(Date) } }),
        prisma.session.deleteMany({ where: { userId: 'user-1' } }),
      ]);
      expect(result).toEqual({ sessionCount: 2 });
    });

    it('returns correct sessionCount from transaction result', async () => {
      const mockUser: User = {
        id: 'user-2',
        googleSub: 'google-2',
        email: 'user2@example.com',
        displayName: 'Test User 2',
        avatarUrl: null,
        role: 'ViewerCompany',
        userTagText: null,
        userTagColor: null,
        mutedAt: null,
        bannedAt: null,
        createdAt: new Date(),
        lastSeenAt: null,
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.$transaction).mockResolvedValue([
        { ...mockUser, bannedAt: new Date() },
        { count: 5 },
      ]);

      const result = await banUser('user2@example.com');
      expect(result.sessionCount).toBe(5);
    });

    it('catches race condition when user is deleted before transaction', async () => {
      const mockUser: User = {
        id: 'user-1',
        googleSub: 'google-1',
        email: 'user@example.com',
        displayName: 'Test User',
        avatarUrl: null,
        role: 'ViewerCompany',
        userTagText: null,
        userTagColor: null,
        mutedAt: null,
        bannedAt: null,
        createdAt: new Date(),
        lastSeenAt: null,
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      const error = new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '0.0.1',
      });
      vi.mocked(prisma.$transaction).mockRejectedValue(error);

      await expect(banUser('user@example.com')).rejects.toThrow('User not found: user@example.com');
    });

    it('re-throws other errors from transaction', async () => {
      const mockUser: User = {
        id: 'user-1',
        googleSub: 'google-1',
        email: 'user@example.com',
        displayName: 'Test User',
        avatarUrl: null,
        role: 'ViewerCompany',
        userTagText: null,
        userTagColor: null,
        mutedAt: null,
        bannedAt: null,
        createdAt: new Date(),
        lastSeenAt: null,
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      const error = new Error('DB connection error');
      vi.mocked(prisma.$transaction).mockRejectedValue(error);

      await expect(banUser('user@example.com')).rejects.toThrow('DB connection error');
    });
  });

  describe('unbanUser', () => {
    it('normalizes email to lowercase before lookup', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      await expect(unbanUser('User@Example.COM')).rejects.toThrow();
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
      });
    });

    it('throws if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      await expect(unbanUser('nobody@example.com')).rejects.toThrow(
        'User not found: nobody@example.com',
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('sets bannedAt to null for existing user', async () => {
      const mockUser: User = {
        id: 'user-1',
        googleSub: 'google-1',
        email: 'user@example.com',
        displayName: 'Test User',
        avatarUrl: null,
        role: 'ViewerCompany',
        userTagText: null,
        userTagColor: null,
        mutedAt: null,
        bannedAt: new Date(),
        createdAt: new Date(),
        lastSeenAt: null,
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue({ ...mockUser, bannedAt: null });

      await unbanUser('user@example.com');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { bannedAt: null },
      });
    });
  });

  describe('updateUserRole', () => {
    it('updates user role and broadcasts user:update', async () => {
      const mockUser: User = {
        id: 'user-1',
        googleSub: 'google-1',
        email: 'user@example.com',
        displayName: 'Test User',
        avatarUrl: null,
        role: 'ViewerCompany',
        userTagText: null,
        userTagColor: null,
        mutedAt: null,
        bannedAt: null,
        createdAt: new Date(),
        lastSeenAt: null,
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue({ ...mockUser, role: 'Moderator' });

      await updateUserRole('user@example.com', 'Moderator');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { role: 'Moderator' },
      });
      expect(wsHub.broadcast).toHaveBeenCalledWith({
        type: 'user:update',
        payload: expect.objectContaining({
          id: 'user-1',
          role: 'Moderator',
        }),
      });
    });

    it('throws if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      await expect(updateUserRole('nobody@example.com', 'Admin')).rejects.toThrow(
        'User not found: nobody@example.com',
      );
    });
  });

  describe('updateUserRoleById', () => {
    it('updates user role and broadcasts user:update', async () => {
      const mockUser: User = {
        id: 'user-1',
        googleSub: 'google-1',
        email: 'user@example.com',
        displayName: 'Test User',
        avatarUrl: null,
        role: 'ViewerCompany',
        userTagText: null,
        userTagColor: null,
        mutedAt: null,
        bannedAt: null,
        createdAt: new Date(),
        lastSeenAt: null,
      };
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue({ ...mockUser, role: 'Moderator' });

      await updateUserRoleById('user-1', 'Moderator');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { role: 'Moderator' },
      });
      expect(wsHub.broadcast).toHaveBeenCalledWith({
        type: 'user:update',
        payload: expect.objectContaining({
          id: 'user-1',
          role: 'Moderator',
        }),
      });
    });

    it('throws if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      await expect(updateUserRoleById('nonexistent', 'Admin')).rejects.toThrow(
        'User not found: nonexistent',
      );
    });
  });

  describe('getAllUsers', () => {
    it('returns all users ordered by createdAt desc', async () => {
      const mockUsers = [{ id: 'user-1' }, { id: 'user-2' }];
      vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers as never);

      const result = await getAllUsers();

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockUsers);
    });
  });

  describe('updateUserTagById', () => {
    const mockUser: User = {
      id: 'user-1',
      googleSub: 'google-1',
      email: 'user@example.com',
      displayName: 'Test User',
      avatarUrl: null,
      role: 'ViewerCompany',
      userTagText: null,
      userTagColor: null,
      mutedAt: null,
      bannedAt: null,
      createdAt: new Date(),
      lastSeenAt: null,
    };

    it('sets user tag and broadcasts user:update', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
      vi.mocked(prisma.user.update).mockResolvedValue({
        ...mockUser,
        userTagText: 'VIP',
        userTagColor: '#ef4444',
      });

      await updateUserTagById('user-1', 'VIP', '#ef4444');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { userTagText: 'VIP', userTagColor: '#ef4444' },
      });
      expect(wsHub.broadcast).toHaveBeenCalledWith({
        type: 'user:update',
        payload: expect.objectContaining({
          id: 'user-1',
          userTag: { text: 'VIP', color: '#ef4444' },
        }),
      });
    });

    it('clears user tag (sets null) and broadcasts user:update', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...mockUser,
        userTagText: 'VIP',
        userTagColor: '#ef4444',
      });
      vi.mocked(prisma.user.update).mockResolvedValue({
        ...mockUser,
        userTagText: null,
        userTagColor: null,
      });

      await updateUserTagById('user-1', null, null);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { userTagText: null, userTagColor: null },
      });
      expect(wsHub.broadcast).toHaveBeenCalledWith({
        type: 'user:update',
        payload: expect.objectContaining({
          id: 'user-1',
          userTag: null,
        }),
      });
    });

    it('returns Guest tag for ViewerGuest when tag is cleared', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...mockUser,
        role: 'ViewerGuest',
        userTagText: 'Custom',
        userTagColor: '#ef4444',
      });
      vi.mocked(prisma.user.update).mockResolvedValue({
        ...mockUser,
        role: 'ViewerGuest',
        userTagText: null,
        userTagColor: null,
      });

      await updateUserTagById('user-1', null, null);

      expect(wsHub.broadcast).toHaveBeenCalledWith({
        type: 'user:update',
        payload: expect.objectContaining({
          userTag: { text: 'Guest', color: '#a16207' },
        }),
      });
    });

    it('throws AppError 404 if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      await expect(updateUserTagById('nonexistent', 'VIP', '#ef4444')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });
  });
});
