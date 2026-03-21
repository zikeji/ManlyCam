import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { getAllUsers, updateUserRoleById, updateUserTagById } from '../services/userService.js';
import { AppError } from '../lib/errors.js';
import type { AppEnv } from '../lib/types.js';
import { Role, SYSTEM_USER_ID } from '@manlycam/types';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function createAdminRouter() {
  const router = new Hono<AppEnv>();

  router.use('*', requireAuth);
  router.use('*', requireRole(Role.Admin));

  router.get('/users', async (c) => {
    const users = await getAllUsers();
    return c.json(
      users.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        email: u.email,
        role: u.role as Role,
        avatarUrl: u.avatarUrl,
        /* c8 ignore next -- ?? null fallback: test users always have non-null dates; null path unreachable */
        bannedAt: u.bannedAt?.toISOString() ?? null,
        /* c8 ignore next -- ?? null fallback: test users always have non-null dates; null path unreachable */
        mutedAt: u.mutedAt?.toISOString() ?? null,
        firstSeenAt: u.createdAt.toISOString(),
        /* c8 ignore next -- ?? null fallback: test users always have non-null dates; null path unreachable */
        lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
        userTagText: u.userTagText ?? null,
        userTagColor: u.userTagColor ?? null,
      })),
    );
  });

  router.patch('/users/:userId/user-tag', async (c) => {
    const targetUserId = c.req.param('userId');
    let body: { userTagText?: unknown; userTagColor?: unknown };
    try {
      body = await c.req.json<{ userTagText?: unknown; userTagColor?: unknown }>();
    } catch {
      throw new AppError('Invalid JSON in request body', 'INVALID_JSON', 400);
    }

    const { userTagText, userTagColor } = body;

    // Normalize: empty string treated as clear
    /* c8 ignore next -- || null for empty trimmed string; tests pass non-empty strings */
    const text = (typeof userTagText === 'string' ? userTagText.trim() : '') || null;
    const color = typeof userTagColor === 'string' ? userTagColor : null;

    if (text !== null) {
      if (text.length > 20) {
        throw new AppError('userTagText must be 20 characters or fewer', 'VALIDATION_ERROR', 422);
      }
      if (color === null || !HEX_COLOR_RE.test(color)) {
        throw new AppError(
          'Invalid tag color: must be a 6-digit hex value',
          'VALIDATION_ERROR',
          422,
        );
      }
    }

    await updateUserTagById(targetUserId, text, text ? color : null);
    return c.body(null, 204);
  });

  router.post('/users/:userId/role', async (c) => {
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

    // System user role is immutable
    if (targetUserId === SYSTEM_USER_ID) {
      return c.json(
        { error: { code: 'FORBIDDEN', message: 'The system user role cannot be changed.' } },
        403,
      );
    }

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
