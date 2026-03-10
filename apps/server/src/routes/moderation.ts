import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { muteUser, unmuteUser } from '../services/moderationService.js';
import type { AppEnv } from '../lib/types.js';
import type { Role } from '@manlycam/types';

export function createModerationRouter() {
  const router = new Hono<AppEnv>();

  router.post(
    '/api/users/:userId/mute',
    requireAuth,
    requireRole(['Admin', 'Moderator']),
    async (c) => {
      const targetUserId = c.req.param('userId');
      const actor = c.get('user')!;
      await muteUser({ actorId: actor.id, actorRole: actor.role as Role, targetUserId });
      return c.body(null, 204);
    },
  );

  router.post(
    '/api/users/:userId/unmute',
    requireAuth,
    requireRole(['Admin', 'Moderator']),
    async (c) => {
      const targetUserId = c.req.param('userId');
      const actor = c.get('user')!;
      await unmuteUser({ actorId: actor.id, actorRole: actor.role as Role, targetUserId });
      return c.body(null, 204);
    },
  );

  return router;
}
