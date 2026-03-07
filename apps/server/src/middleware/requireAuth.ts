import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../lib/types.js';

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
  }
  await next();
};
