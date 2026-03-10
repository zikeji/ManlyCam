import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createAdminRouter } from './admin.js';
import { getSessionUser } from '../services/authService.js';
import { authMiddleware } from '../middleware/auth.js';
import { getAllUsers, updateUserRoleById } from '../services/userService.js';
import type { AppEnv } from '../lib/types.js';
import { Role } from '@manlycam/types';

vi.mock('../services/authService.js', () => ({
  getSessionUser: vi.fn(),
}));

vi.mock('../services/userService.js', () => ({
  getAllUsers: vi.fn(),
  updateUserRoleById: vi.fn(),
}));

import type { User } from '@prisma/client';

describe('admin routes', () => {
  const app = new Hono<AppEnv>();
  app.use('*', authMiddleware);
  app.route('/', createAdminRouter());

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/admin/users', () => {
    it('returns 403 if user is not Admin', async () => {
      vi.mocked(getSessionUser).mockResolvedValue({
        id: 'u1',
        role: Role.Moderator,
        bannedAt: null,
      } as never);

      const res = await app.request('/api/admin/users', {
        headers: { cookie: 'session_id=s1' },
      });
      expect(res.status).toBe(403);
    });

    it('returns all users if user is Admin', async () => {
      vi.mocked(getSessionUser).mockResolvedValue({
        id: 'u1',
        role: Role.Admin,
        bannedAt: null,
      } as never);
      vi.mocked(getAllUsers).mockResolvedValue([
        {
          id: 'u1',
          displayName: 'Admin',
          email: 'admin@example.com',
          role: Role.Admin,
          createdAt: new Date(),
          lastSeenAt: null,
          avatarUrl: null,
          bannedAt: null,
          mutedAt: null,
          googleSub: 'google-1',
          userTagText: null,
          userTagColor: null,
        } as unknown as User,
      ]);

      const res = await app.request('/api/admin/users', {
        headers: { cookie: 'session_id=s1' },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].displayName).toBe('Admin');
    });
  });

  describe('POST /api/admin/users/:userId/role', () => {
    it('updates user role', async () => {
      vi.mocked(getSessionUser).mockResolvedValue({
        id: 'u1',
        role: Role.Admin,
        bannedAt: null,
      } as never);

      const res = await app.request('/api/admin/users/u2/role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: 'session_id=s1',
        },
        body: JSON.stringify({ role: Role.Moderator }),
      });

      expect(res.status).toBe(204);
      expect(updateUserRoleById).toHaveBeenCalledWith('u2', Role.Moderator);
    });

    it('prevents Admin from changing their own role', async () => {
      vi.mocked(getSessionUser).mockResolvedValue({
        id: 'u1',
        role: Role.Admin,
        bannedAt: null,
      } as never);

      const res = await app.request('/api/admin/users/u1/role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: 'session_id=s1',
        },
        body: JSON.stringify({ role: Role.Moderator }),
      });

      expect(res.status).toBe(403);
      expect(updateUserRoleById).not.toHaveBeenCalled();
    });
  });
});
