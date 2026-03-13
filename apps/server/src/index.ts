import 'dotenv/config';
import { serve } from '@hono/node-server';
import { env } from './env.js';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';
import { streamService } from './services/streamService.js';
import { pisugarService } from './lib/pisugar.js';

const { app, injectWebSocket } = createApp();
const port = parseInt(env.PORT, 10);

const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  logger.info(`Server running on http://0.0.0.0:${info.port}`);
  streamService.start().catch((err) => {
    logger.error({ err }, 'streamService.start() failed');
  });
  if (env.FRP_PISUGAR_PORT) {
    pisugarService.start(env.FRP_PISUGAR_PORT);
    logger.info({ port: env.FRP_PISUGAR_PORT }, 'PiSugar battery monitor started');
  }
});

injectWebSocket(server);

function shutdown() {
  logger.info('Shutting down server...');
  streamService.stop();
  pisugarService.stop();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
