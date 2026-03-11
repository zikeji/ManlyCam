import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { createAdminRouter } from './admin.js';
import { getSessionUser } from '../services/authService.js';
import { authMiddleware } from '../middleware/auth.js';
import { getAllUsers, updateUserRoleById, updateUserTagById } from '../services/userService.js';
import { AppError } from '../lib/errors.js';
import type { AppEnv } from '../lib/types.js';
import { Role } from '@manlycam/types';

vi.mock('../services/authService.js', () => ({
  getSessionUser: vi.fn(),
}));

vi.mock('../services/userService.js', () => ({
  getAllUsers: vi.fn(),
  updateUserRoleById: vi.fn(),
  updateUserTagById: vi.fn(),
}));

import type { User } from '@prisma/client';

describe('admin routes', () => {
  const app = new Hono<AppEnv>();
  app.use('*', authMiddleware);
  app.route('/', createAdminRouter());
  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(
        { error: { code: err.code, message: err.message } },
        err.statusCode as ContentfulStatusCode,
      );
    }
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
  });

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
      expect(body[0].userTagText).toBeNull();
      expect(body[0].userTagColor).toBeNull();
    });

    it('returns userTagText and userTagColor when set', async () => {
      vi.mocked(getSessionUser).mockResolvedValue({
        id: 'u1',
        role: Role.Admin,
        bannedAt: null,
      } as never);
      vi.mocked(getAllUsers).mockResolvedValue([
        {
          id: 'u2',
          displayName: 'VIP User',
          email: 'vip@example.com',
          role: Role.ViewerCompany,
          createdAt: new Date(),
          lastSeenAt: null,
          avatarUrl: null,
          bannedAt: null,
          mutedAt: null,
          googleSub: 'google-2',
          userTagText: 'VIP',
          userTagColor: '#ef4444',
        } as unknown as User,
      ]);

      const res = await app.request('/api/admin/users', {
        headers: { cookie: 'session_id=s1' },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body[0].userTagText).toBe('VIP');
      expect(body[0].userTagColor).toBe('#ef4444');
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

  describe('PATCH /api/admin/users/:userId/user-tag', () => {
    const adminSession = { id: 'u1', role: Role.Admin, bannedAt: null };

    it('sets a user tag successfully', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);
      vi.mocked(updateUserTagById).mockResolvedValue(undefined);

      const res = await app.request('/api/admin/users/u2/user-tag', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: 'session_id=s1' },
        body: JSON.stringify({ userTagText: 'VIP', userTagColor: '#ef4444' }),
      });

      expect(res.status).toBe(204);
      expect(updateUserTagById).toHaveBeenCalledWith('u2', 'VIP', '#ef4444');
    });

    it('clears a user tag when userTagText is empty string', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);
      vi.mocked(updateUserTagById).mockResolvedValue(undefined);

      const res = await app.request('/api/admin/users/u2/user-tag', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: 'session_id=s1' },
        body: JSON.stringify({ userTagText: '' }),
      });

      expect(res.status).toBe(204);
      expect(updateUserTagById).toHaveBeenCalledWith('u2', null, null);
    });

    it('accepts any valid 6-digit hex color', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);
      vi.mocked(updateUserTagById).mockResolvedValue(undefined);

      const res = await app.request('/api/admin/users/u2/user-tag', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: 'session_id=s1' },
        body: JSON.stringify({ userTagText: 'VIP', userTagColor: '#123456' }),
      });

      expect(res.status).toBe(204);
      expect(updateUserTagById).toHaveBeenCalledWith('u2', 'VIP', '#123456');
    });

    it('returns 422 when userTagColor is not a valid hex string', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);

      const res = await app.request('/api/admin/users/u2/user-tag', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: 'session_id=s1' },
        body: JSON.stringify({ userTagText: 'VIP', userTagColor: 'red' }),
      });

      expect(res.status).toBe(422);
      expect(updateUserTagById).not.toHaveBeenCalled();
    });

    it('returns 422 when userTagText exceeds 20 characters', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);

      const res = await app.request('/api/admin/users/u2/user-tag', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: 'session_id=s1' },
        body: JSON.stringify({ userTagText: 'ThisTagIsTooLongForUI', userTagColor: '#ef4444' }),
      });

      expect(res.status).toBe(422);
      expect(updateUserTagById).not.toHaveBeenCalled();
    });

    it('returns 403 for non-admin user', async () => {
      vi.mocked(getSessionUser).mockResolvedValue({
        id: 'u2',
        role: Role.Moderator,
        bannedAt: null,
      } as never);

      const res = await app.request('/api/admin/users/u3/user-tag', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: 'session_id=s1' },
        body: JSON.stringify({ userTagText: 'VIP', userTagColor: '#ef4444' }),
      });

      expect(res.status).toBe(403);
      expect(updateUserTagById).not.toHaveBeenCalled();
    });

    it('returns 404 for unknown userId', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);
      vi.mocked(updateUserTagById).mockRejectedValue(
        new AppError('User not found', 'NOT_FOUND', 404),
      );

      const res = await app.request('/api/admin/users/nonexistent/user-tag', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: 'session_id=s1' },
        body: JSON.stringify({ userTagText: 'VIP', userTagColor: '#ef4444' }),
      });

      expect(res.status).toBe(404);
    });
  });
});
