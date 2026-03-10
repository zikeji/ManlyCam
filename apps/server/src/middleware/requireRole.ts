import type { MiddlewareHandler } from 'hono';
import type { Role } from '@manlycam/types';
import { hasRole } from '@manlycam/types';
import type { AppEnv } from '../lib/types.js';

export function requireRole(minRole: Role): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user')!; // requireRole always chains after requireAuth; user is guaranteed non-null and non-banned
    if (!hasRole(user as { role: Role }, minRole)) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions.' } }, 403);
    }
    await next();
  };
}
