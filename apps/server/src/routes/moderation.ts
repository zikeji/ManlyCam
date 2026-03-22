import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { muteUser, unmuteUser, banUser, unbanUser } from '../services/moderationService.js';
import type { AppEnv } from '../lib/types.js';
import type { Role } from '@manlycam/types';

export function createModerationRouter() {
  const router = new Hono<AppEnv>();

  router.post('/api/users/:userId/mute', requireAuth, requireRole('Moderator'), async (c) => {
    const targetUserId = c.req.param('userId');
    const actor = c.get('user')!;
    await muteUser({ actorId: actor.id, actorRole: actor.role as Role, targetUserId });
    return c.body(null, 204);
  });

  router.post('/api/users/:userId/unmute', requireAuth, requireRole('Moderator'), async (c) => {
    const targetUserId = c.req.param('userId');
    const actor = c.get('user')!;
    await unmuteUser({ actorId: actor.id, actorRole: actor.role as Role, targetUserId });
    return c.body(null, 204);
  });

  router.delete('/api/users/:userId/ban', requireAuth, requireRole('Moderator'), async (c) => {
    const targetUserId = c.req.param('userId');
    const actor = c.get('user')!;
    await banUser({ actorId: actor.id, actorRole: actor.role as Role, targetUserId });
    return c.body(null, 204);
  });

  router.post('/api/users/:userId/unban', requireAuth, requireRole('Admin'), async (c) => {
    const targetUserId = c.req.param('userId');
    const actor = c.get('user')!;
    await unbanUser({ actorId: actor.id, actorRole: actor.role as Role, targetUserId });
    return c.body(null, 204);
  });

  return router;
}
