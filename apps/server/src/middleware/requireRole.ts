import type { MiddlewareHandler } from 'hono';
import type { Role } from '@manlycam/types';
import type { AppEnv } from '../lib/types.js';

export function requireRole(roles: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user')!; // requireRole always chains after requireAuth; user is guaranteed non-null and non-banned
    if (!roles.includes(user.role as Role)) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions.' } }, 403);
    }
    await next();
  };
}
