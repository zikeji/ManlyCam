import 'dotenv/config';
import { serve } from '@hono/node-server';
import { env } from './env.js';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';
import { streamService } from './services/streamService.js';

const { app, injectWebSocket } = createApp();
const port = parseInt(env.PORT, 10);

const server = serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`Server running on http://localhost:${info.port}`);
  streamService.start().catch((err) => {
    logger.error({ err }, 'streamService.start() failed');
  });
});

injectWebSocket(server);

function shutdown() {
  logger.info('Shutting down server...');
  streamService.stop();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
