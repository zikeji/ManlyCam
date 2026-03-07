import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/client.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    session: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../db/client.js';
import { banUser, unbanUser } from './userService.js';

describe('userService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('banUser', () => {
    it('throws if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      await expect(banUser('nobody@example.com')).rejects.toThrow(
        'User not found: nobody@example.com',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('executes atomic transaction setting bannedAt and deleting sessions', async () => {
      const mockUser = { id: 'user-1', email: 'user@example.com' };
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
      vi.mocked(prisma.$transaction).mockResolvedValue([
        { id: 'user-1', bannedAt: new Date() } as never,
        { count: 2 } as never,
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
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'user-2' } as never);
      vi.mocked(prisma.$transaction).mockResolvedValue([
        { id: 'user-2', bannedAt: new Date() } as never,
        { count: 5 } as never,
      ]);

      const result = await banUser('user2@example.com');
      expect(result.sessionCount).toBe(5);
    });
  });

  describe('unbanUser', () => {
    it('throws if user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      await expect(unbanUser('nobody@example.com')).rejects.toThrow(
        'User not found: nobody@example.com',
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('sets bannedAt to null for existing user', async () => {
      const mockUser = { id: 'user-1', email: 'user@example.com' };
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as never);
      vi.mocked(prisma.user.update).mockResolvedValue(mockUser as never);

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
});
