import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth.js';
import { AppError } from '../lib/errors.js';
import { createMessage, getHistory, editMessage, deleteMessage } from '../services/chatService.js';
import type { AppEnv } from '../lib/types.js';
import type { Role } from '@manlycam/types';

export function createChatRouter() {
  const chatRouter = new Hono<AppEnv>();

  chatRouter.post('/api/chat/messages', requireAuth, async (c) => {
    let body: { content?: unknown };
    try {
      body = await c.req.json<{ content?: unknown }>();
    } catch {
      throw new AppError('Invalid JSON in request body', 'INVALID_JSON', 400);
    }

    const { content } = body;

    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new AppError('Content must be a non-empty string', 'VALIDATION_ERROR', 422);
    }

    if (content.length > 1000) {
      throw new AppError('Content must not exceed 1000 characters', 'CONTENT_TOO_LONG', 422);
    }

    const user = c.get('user')!;
    const message = await createMessage({ userId: user.id, content });
    return c.json({ message }, 201);
  });

  chatRouter.get('/api/chat/history', requireAuth, async (c) => {
    const limitParam = c.req.query('limit');
    const before = c.req.query('before');

    const limit = limitParam !== undefined ? parseInt(limitParam, 10) : 50;
    const clampedLimit = Math.min(Math.max(isNaN(limit) ? 50 : limit, 1), 100);

    const result = await getHistory({ limit: clampedLimit, before });
    return c.json(result, 200);
  });

  chatRouter.patch('/api/chat/messages/:messageId', requireAuth, async (c) => {
    const messageId = c.req.param('messageId');
    let body: { content?: unknown };
    try {
      body = await c.req.json<{ content?: unknown }>();
    } catch {
      throw new AppError('Invalid JSON in request body', 'INVALID_JSON', 400);
    }
    const { content } = body;
    if (typeof content !== 'string' || content.trim().length === 0)
      throw new AppError('Content must be a non-empty string', 'VALIDATION_ERROR', 422);
    if (content.length > 1000)
      throw new AppError('Content must not exceed 1000 characters', 'CONTENT_TOO_LONG', 422);
    const user = c.get('user')!;
    const edit = await editMessage({ messageId, userId: user.id, content });
    return c.json({ edit }, 200);
  });

  chatRouter.delete('/api/chat/messages/:messageId', requireAuth, async (c) => {
    const messageId = c.req.param('messageId');
    const user = c.get('user')!;
    await deleteMessage({ messageId, userId: user.id, callerRole: user.role as Role });
    return c.body(null, 204);
  });

  return chatRouter;
}
