import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { env } from './env.js';
import { AppError } from './lib/errors.js';
import { logger } from './lib/logger.js';
import type { AppEnv } from './lib/types.js';
import { requestLogger } from './middleware/logger.js';
import { authMiddleware } from './middleware/auth.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { streamRouter } from './routes/stream.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = new Hono<AppEnv>();

  // First middleware: request/response logging
  app.use('*', requestLogger);

  // Auth session injection — reads session_id cookie and sets ctx.var.user (optional, no 401)
  app.use('*', authMiddleware);

  // API routes
  app.route('/', healthRouter);
  app.route('/', authRouter);
  app.route('/', meRouter);
  app.route('/', streamRouter);

  // SPA catch-all: serve Vue dist in production
  if (env.NODE_ENV === 'production') {
    const distPath = join(__dirname, '../../web/dist');
    app.use('/*', serveStatic({ root: distPath }));
    app.get('/*', (c) => {
      const indexHtmlPath = join(distPath, 'index.html');
      const indexHtml = readFileSync(indexHtmlPath, 'utf-8');
      return c.html(indexHtml);
    });
  }

  // Global error handler
  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(
        { error: { code: err.code, message: err.message } },
        err.statusCode as ContentfulStatusCode,
      );
    }
    logger.error({ err }, 'Unhandled error');
    return c.json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }, 500);
  });

  return app;
}
