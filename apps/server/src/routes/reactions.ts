import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { AppError } from '../lib/errors.js';
import { addReaction, removeReaction, removeReactionByMod } from '../services/reactionsService.js';
import type { AppEnv } from '../lib/types.js';
import type { Role } from '@manlycam/types';

export function createReactionsRouter() {
  const router = new Hono<AppEnv>();

  router.post('/api/messages/:messageId/reactions', requireAuth, async (c) => {
    const messageId = c.req.param('messageId');
    const user = c.get('user')!;

    let body: { emoji?: unknown };
    try {
      body = await c.req.json<{ emoji?: unknown }>();
    } catch {
      throw new AppError('Invalid JSON in request body', 'INVALID_JSON', 400);
    }

    const { emoji } = body;
    if (typeof emoji !== 'string' || emoji.trim().length === 0) {
      throw new AppError('Emoji must be a non-empty string', 'VALIDATION_ERROR', 422);
    }

    const payload = await addReaction({ messageId, userId: user.id, emoji: emoji.trim() });
    return c.json({ reaction: payload }, 201);
  });

  router.delete('/api/messages/:messageId/reactions/:emoji', requireAuth, async (c) => {
    const messageId = c.req.param('messageId');
    const emoji = decodeURIComponent(c.req.param('emoji'));
    const user = c.get('user')!;

    await removeReaction({ messageId, userId: user.id, emoji });
    return c.body(null, 204);
  });

  router.delete(
    '/api/messages/:messageId/reactions/:emoji/users/:userId',
    requireAuth,
    requireRole('Moderator'),
    async (c) => {
      const messageId = c.req.param('messageId');
      const emoji = decodeURIComponent(c.req.param('emoji'));
      const targetUserId = c.req.param('userId');
      const actor = c.get('user')!;

      try {
        await removeReactionByMod({
          messageId,
          targetUserId,
          emoji,
          modId: actor.id,
          modRole: actor.role as Role,
        });
      } catch (err) {
        if (err instanceof AppError && err.code === 'INSUFFICIENT_ROLE') {
          throw new AppError('Insufficient permissions.', 'FORBIDDEN', 403);
        }
        throw err;
      }
      return c.body(null, 204);
    },
  );

  return router;
}
