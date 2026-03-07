import 'dotenv/config';
import { serve } from '@hono/node-server';
import { env } from './env.js';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';

const app = createApp();
const port = parseInt(env.PORT, 10);

serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`Server running on http://localhost:${info.port}`);
});
