import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv } from '../lib/types.js';
import { getSessionUser } from '../services/authService.js';

export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const sessionId = getCookie(c, 'session_id') ?? null;
  const user = sessionId ? await getSessionUser(sessionId) : null;
  c.set('user', user);
  await next();
};
