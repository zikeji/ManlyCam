import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth.js';
import { getCommandsForRole } from '../services/slashCommands.js';
import type { AppEnv } from '../lib/types.js';
import type { Role } from '@manlycam/types';

export function createCommandsRouter() {
  const commandsRouter = new Hono<AppEnv>();

  commandsRouter.get('/api/commands', requireAuth, (c) => {
    const user = c.get('user')!;
    const commands = getCommandsForRole(user.role as Role);
    return c.json({ commands });
  });

  return commandsRouter;
}
