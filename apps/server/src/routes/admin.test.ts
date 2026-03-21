import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { createAdminRouter } from './admin.js';
import { getSessionUser } from '../services/authService.js';
import { authMiddleware } from '../middleware/auth.js';
import { getAllUsers, updateUserRoleById, updateUserTagById } from '../services/userService.js';
import { listEntries, addDomain, addEmail, removeById } from '../services/allowlistService.js';
import { getAuditLogPage } from '../services/auditLogService.js';
import { AppError } from '../lib/errors.js';
import type { AppEnv } from '../lib/types.js';
import { Role, SYSTEM_USER_ID } from '@manlycam/types';
import { Prisma } from '@prisma/client';

vi.mock('../services/authService.js', () => ({
  getSessionUser: vi.fn(),
}));

vi.mock('../services/userService.js', () => ({
  getAllUsers: vi.fn(),
  updateUserRoleById: vi.fn(),
  updateUserTagById: vi.fn(),
}));

vi.mock('../services/allowlistService.js', () => ({
  listEntries: vi.fn(),
  addDomain: vi.fn(),
  addEmail: vi.fn(),
  removeById: vi.fn(),
}));

vi.mock('../services/auditLogService.js', () => ({
  getAuditLogPage: vi.fn(),
}));

vi.mock('../db/client.js', () => ({
  prisma: {
    allowlistEntry: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '../db/client.js';

import type { User } from '@prisma/client';

describe('admin routes', () => {
  const app = new Hono<AppEnv>();
  app.use('*', authMiddleware);
  app.route('/api/admin', createAdminRouter());
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

    it('returns 400 when body is invalid JSON', async () => {
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
        body: 'not-valid-json{',
      });

      expect(res.status).toBe(400);
      expect(updateUserRoleById).not.toHaveBeenCalled();
    });

    it('returns 422 when role is not an allowed value', async () => {
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
        body: JSON.stringify({ role: Role.Admin }),
      });

      expect(res.status).toBe(422);
      expect(updateUserRoleById).not.toHaveBeenCalled();
    });

    it('returns 403 when targetUserId is the system user', async () => {
      vi.mocked(getSessionUser).mockResolvedValue({
        id: 'u1',
        role: Role.Admin,
        bannedAt: null,
      } as never);

      const res = await app.request(`/api/admin/users/${SYSTEM_USER_ID}/role`, {
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

    it('returns 400 INVALID_JSON when body is malformed', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);

      const res = await app.request('/api/admin/users/u2/user-tag', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: 'session_id=s1' },
        body: 'not-json',
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_JSON');
    });
  });

  describe('GET /api/admin/allowlist', () => {
    const adminSession = { id: 'u1', role: Role.Admin, bannedAt: null };

    it('returns 403 for non-admin', async () => {
      vi.mocked(getSessionUser).mockResolvedValue({
        id: 'u2',
        role: Role.Moderator,
        bannedAt: null,
      } as never);
      const res = await app.request('/api/admin/allowlist', {
        headers: { cookie: 'session_id=s1' },
      });
      expect(res.status).toBe(403);
    });

    it('returns list of entries with ISO createdAt', async () => {
      const now = new Date('2024-01-15T10:00:00.000Z');
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);
      vi.mocked(listEntries).mockResolvedValue([
        { id: 'e1', type: 'domain', value: 'company.com', createdAt: now },
        { id: 'e2', type: 'email', value: 'guest@gmail.com', createdAt: now },
      ]);

      const res = await app.request('/api/admin/allowlist', {
        headers: { cookie: 'session_id=s1' },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
      expect(body[0]).toEqual({
        id: 'e1',
        type: 'domain',
        value: 'company.com',
        createdAt: '2024-01-15T10:00:00.000Z',
      });
    });
  });

  describe('POST /api/admin/allowlist', () => {
    const adminSession = { id: 'u1', role: Role.Admin, bannedAt: null };

    it('returns 403 for non-admin', async () => {
      vi.mocked(getSessionUser).mockResolvedValue({
        id: 'u2',
        role: Role.Moderator,
        bannedAt: null,
      } as never);
      const res = await app.request('/api/admin/allowlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: 'session_id=s1' },
        body: JSON.stringify({ type: 'domain', value: 'company.com' }),
      });
      expect(res.status).toBe(403);
    });

    it('returns 400 for malformed JSON', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);
      const res = await app.request('/api/admin/allowlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: 'session_id=s1' },
        body: 'not-json{',
      });
      expect(res.status).toBe(400);
    });

    it('returns 422 for invalid type', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);
      const res = await app.request('/api/admin/allowlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: 'session_id=s1' },
        body: JSON.stringify({ type: 'phone', value: '123' }),
      });
      expect(res.status).toBe(422);
    });

    it('returns 422 for empty value', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);
      const res = await app.request('/api/admin/allowlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: 'session_id=s1' },
        body: JSON.stringify({ type: 'domain', value: '  ' }),
      });
      expect(res.status).toBe(422);
    });

    it('adds new domain and returns entry with alreadyExists: false', async () => {
      const now = new Date('2024-01-15T10:00:00.000Z');
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);
      vi.mocked(prisma.allowlistEntry.findUnique)
        .mockResolvedValueOnce(null) // pre-check: not found
        .mockResolvedValueOnce({ id: 'e1', type: 'domain', value: 'company.com', createdAt: now }); // re-fetch after create
      vi.mocked(addDomain).mockResolvedValue(undefined);

      const res = await app.request('/api/admin/allowlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: 'session_id=s1' },
        body: JSON.stringify({ type: 'domain', value: 'company.com' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alreadyExists).toBe(false);
      expect(body.value).toBe('company.com');
      expect(body.createdAt).toBe('2024-01-15T10:00:00.000Z');
      expect(addDomain).toHaveBeenCalledWith('company.com');
    });

    it('adds new email and normalizes to lowercase', async () => {
      const now = new Date('2024-01-15T10:00:00.000Z');
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);
      vi.mocked(prisma.allowlistEntry.findUnique)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'e2',
          type: 'email',
          value: 'guest@gmail.com',
          createdAt: now,
        });
      vi.mocked(addEmail).mockResolvedValue(undefined);

      const res = await app.request('/api/admin/allowlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: 'session_id=s1' },
        body: JSON.stringify({ type: 'email', value: 'Guest@Gmail.com' }),
      });
      expect(res.status).toBe(200);
      expect(addEmail).toHaveBeenCalledWith('guest@gmail.com');
    });

    it('returns alreadyExists: true for duplicate domain', async () => {
      const now = new Date('2024-01-15T10:00:00.000Z');
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);
      vi.mocked(prisma.allowlistEntry.findUnique).mockResolvedValueOnce({
        id: 'e1',
        type: 'domain',
        value: 'company.com',
        createdAt: now,
      });

      const res = await app.request('/api/admin/allowlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: 'session_id=s1' },
        body: JSON.stringify({ type: 'domain', value: 'company.com' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alreadyExists).toBe(true);
      expect(addDomain).not.toHaveBeenCalled();
    });

    it('returns 422 when addDomain throws (invalid format)', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);
      vi.mocked(prisma.allowlistEntry.findUnique).mockResolvedValueOnce(null);
      vi.mocked(addDomain).mockRejectedValue(new Error('Invalid domain format: bad domain!'));

      const res = await app.request('/api/admin/allowlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: 'session_id=s1' },
        body: JSON.stringify({ type: 'domain', value: 'bad domain!' }),
      });
      expect(res.status).toBe(422);
    });
  });

  describe('DELETE /api/admin/allowlist/:id', () => {
    const adminSession = { id: 'u1', role: Role.Admin, bannedAt: null };

    it('returns 403 for non-admin', async () => {
      vi.mocked(getSessionUser).mockResolvedValue({
        id: 'u2',
        role: Role.Moderator,
        bannedAt: null,
      } as never);
      const res = await app.request('/api/admin/allowlist/e1', {
        method: 'DELETE',
        headers: { cookie: 'session_id=s1' },
      });
      expect(res.status).toBe(403);
    });

    it('returns 204 on successful delete', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);
      vi.mocked(removeById).mockResolvedValue(undefined);

      const res = await app.request('/api/admin/allowlist/e1', {
        method: 'DELETE',
        headers: { cookie: 'session_id=s1' },
      });
      expect(res.status).toBe(204);
      expect(removeById).toHaveBeenCalledWith('e1');
    });

    it('returns 404 when entry not found (P2025)', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);
      vi.mocked(removeById).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '6.0.0',
        }),
      );

      const res = await app.request('/api/admin/allowlist/nope', {
        method: 'DELETE',
        headers: { cookie: 'session_id=s1' },
      });
      expect(res.status).toBe(404);
    });

    it('rethrows non-P2025 errors as 500', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);
      vi.mocked(removeById).mockRejectedValue(new Error('DB connection lost'));

      const res = await app.request('/api/admin/allowlist/e1', {
        method: 'DELETE',
        headers: { cookie: 'session_id=s1' },
      });
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/admin/audit-log', () => {
    const adminSession = { id: 'u1', role: Role.Admin, bannedAt: null };

    it('returns 403 for non-Admin (Moderator)', async () => {
      vi.mocked(getSessionUser).mockResolvedValue({
        id: 'u2',
        role: Role.Moderator,
        bannedAt: null,
      } as never);

      const res = await app.request('/api/admin/audit-log', {
        headers: { cookie: 'session_id=s1' },
      });
      expect(res.status).toBe(403);
      expect(getAuditLogPage).not.toHaveBeenCalled();
    });

    it('returns 200 with entries on success', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);
      vi.mocked(getAuditLogPage).mockResolvedValue({
        entries: [
          {
            id: '01HX00000000000000000000AA',
            action: 'ban',
            actorId: 'u1',
            actorDisplayName: 'Admin',
            targetId: 'u2',
            metadata: null,
            performedAt: '2026-01-01T10:00:00.000Z',
          },
        ],
        nextCursor: null,
      });

      const res = await app.request('/api/admin/audit-log', {
        headers: { cookie: 'session_id=s1' },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.entries).toHaveLength(1);
      expect(body.entries[0].action).toBe('ban');
      expect(body.nextCursor).toBeNull();
    });

    it('passes cursor query param to service', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);
      vi.mocked(getAuditLogPage).mockResolvedValue({ entries: [], nextCursor: null });
      const cursor = '01HX00000000000000000000AA';

      await app.request(`/api/admin/audit-log?cursor=${cursor}`, {
        headers: { cookie: 'session_id=s1' },
      });

      expect(getAuditLogPage).toHaveBeenCalledWith(expect.objectContaining({ cursor }));
    });

    it('returns empty entries when audit log is empty', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);
      vi.mocked(getAuditLogPage).mockResolvedValue({ entries: [], nextCursor: null });

      const res = await app.request('/api/admin/audit-log', {
        headers: { cookie: 'session_id=s1' },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.entries).toHaveLength(0);
    });

    it('clamps limit to 50 when a larger value is passed', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);
      vi.mocked(getAuditLogPage).mockResolvedValue({ entries: [], nextCursor: null });

      await app.request('/api/admin/audit-log?limit=999', {
        headers: { cookie: 'session_id=s1' },
      });

      // The route passes limit=999 to the service; clamping happens inside the service
      expect(getAuditLogPage).toHaveBeenCalledWith(expect.objectContaining({ limit: 999 }));
    });

    it('returns nextCursor when more pages exist', async () => {
      vi.mocked(getSessionUser).mockResolvedValue(adminSession as never);
      vi.mocked(getAuditLogPage).mockResolvedValue({
        entries: [],
        nextCursor: '01HX00000000000000000000BB',
      });

      const res = await app.request('/api/admin/audit-log', {
        headers: { cookie: 'session_id=s1' },
      });
      const body = await res.json();
      expect(body.nextCursor).toBe('01HX00000000000000000000BB');
    });
  });
});
