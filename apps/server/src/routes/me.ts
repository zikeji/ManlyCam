import { Hono } from 'hono';
import type { AppEnv } from '../lib/types.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const meRouter = new Hono<AppEnv>();

meRouter.get('/api/me', requireAuth, (c) => {
  const user = c.get('user')!;
  return c.json({
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl ?? null,
    bannedAt: user.bannedAt?.toISOString() ?? null,
    mutedAt: user.mutedAt?.toISOString() ?? null,
  });
});
