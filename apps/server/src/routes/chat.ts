import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth.js';
import { AppError } from '../lib/errors.js';
import { createMessage } from '../services/chatService.js';
import type { AppEnv } from '../lib/types.js';

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

  return chatRouter;
}
