import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { getAllUsers, updateUserRoleById } from '../services/userService.js';
import { AppError } from '../lib/errors.js';
import type { AppEnv } from '../lib/types.js';
import { Role } from '@manlycam/types';

export function createAdminRouter() {
  const router = new Hono<AppEnv>();

  router.use('*', requireAuth);
  router.use('*', requireRole(Role.Admin));

  router.get('/api/admin/users', async (c) => {
    const users = await getAllUsers();
    return c.json(
      users.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        email: u.email,
        role: u.role as Role,
        avatarUrl: u.avatarUrl,
        bannedAt: u.bannedAt?.toISOString() ?? null,
        mutedAt: u.mutedAt?.toISOString() ?? null,
        firstSeenAt: u.createdAt.toISOString(),
        lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
      })),
    );
  });

  router.post('/api/admin/users/:userId/role', async (c) => {
    const targetUserId = c.req.param('userId');
    let body: { role?: unknown };
    try {
      body = await c.req.json<{ role?: unknown }>();
    } catch {
      throw new AppError('Invalid JSON in request body', 'INVALID_JSON', 400);
    }

    const { role } = body;
    if (role !== Role.Moderator && role !== Role.ViewerCompany && role !== Role.ViewerGuest) {
      throw new AppError(
        'Invalid role. Only Moderator, ViewerCompany, and ViewerGuest are allowed via Web UI.',
        'VALIDATION_ERROR',
        422,
      );
    }
    const actor = c.get('user')!;

    // AC #8: Admin cannot change their own role via web UI
    if (targetUserId === actor.id) {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'You cannot change your own role.' } },
        403,
      );
    }

    await updateUserRoleById(targetUserId, role as Role);
    return c.body(null, 204);
  });

  return router;
}
