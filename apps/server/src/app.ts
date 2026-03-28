import { Hono } from 'hono';
import { createNodeWebSocket } from '@hono/node-ws';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
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
import { createWsRouter } from './routes/ws.js';
import { createChatRouter } from './routes/chat.js';
import { createModerationRouter } from './routes/moderation.js';
import { createAdminRouter } from './routes/admin.js';
import { createCommandsRouter } from './routes/commands.js';
import { createReactionsRouter } from './routes/reactions.js';
import { createClipsRouter } from './routes/clips.js';
import { streamOnlyRouter } from './routes/stream-only.js';
import { getPublicClipForOg } from './services/clipService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Hoisted so both the OG injection route and production static block share it
const distPath = join(__dirname, '../../web/dist');
const indexHtmlPath = join(distPath, 'index.html');

// Cache index.html at module init to avoid blocking I/O on every request
let cachedIndexHtml: string | null = null;
/* c8 ignore next 3 -- cached at module load, tests mock fs */
if (existsSync(indexHtmlPath)) {
  cachedIndexHtml = readFileSync(indexHtmlPath, 'utf-8');
}

function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
  app.route('/', createChatRouter());
  app.route('/', createCommandsRouter());
  app.route('/', createModerationRouter());
  app.route('/', createReactionsRouter());
  app.route('/', createClipsRouter());
  app.route('/', streamOnlyRouter);
  app.route('/api/admin', createAdminRouter());

  // WebSocket — createNodeWebSocket must receive the app instance before routes are added
  // so it can intercept upgrade requests through the full middleware pipeline.
  const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });
  app.route('/', createWsRouter(upgradeWebSocket));

  // OG injection route for public clips — must be before SPA catch-all
  app.get('/clips/:id', async (c) => {
    const { id } = c.req.param();

    /* c8 ignore next 4 -- dev-only: index.html missing without build */
    if (!cachedIndexHtml) {
      logger.warn('index.html not found — dev environment without built SPA');
      return c.html('<!doctype html><html><head></head><body></body></html>');
    }

    try {
      const clip = await getPublicClipForOg(id);

      if (clip?.visibility === 'public') {
        const ogTitle = escapeHtmlAttr(clip.name);
        const ogDesc = escapeHtmlAttr(clip.description ?? 'Watch this clip');
        const ogImage = `${env.BASE_URL}/api/clips/${id}/thumbnail`;
        const ogUrl = `${env.BASE_URL}/clips/${id}`;
        const ogTags =
          `<meta property="og:title" content="${ogTitle}" />\n` +
          `    <meta property="og:description" content="${ogDesc}" />\n` +
          `    <meta property="og:image" content="${ogImage}" />\n` +
          `    <meta property="og:url" content="${ogUrl}" />`;
        const withOg = cachedIndexHtml.replace('</head>', `${ogTags}\n  </head>`);
        const modified = withOg.replace(/<title>[^<]*<\/title>/, `<title>${ogTitle}</title>`);
        return c.html(modified);
      }
    } catch (err) {
      logger.error({ err }, 'OG injection DB lookup failed');
    }

    return c.html(cachedIndexHtml);
  });

  // SPA catch-all: serve Vue dist in production
  /* c8 ignore next -- production-only SPA serving, env is mocked as test in all test runs */
  if (env.NODE_ENV === 'production') {
    // Emoji SVGs are content-addressed (npm package version) — cache aggressively.
    app.use('/emojis/*', async (c, next) => {
      await next();
      c.header('Cache-Control', 'public, max-age=31536000, immutable');
    });
    app.use('/*', serveStatic({ root: distPath }));
    app.get('/*', (c) => {
      /* c8 ignore next 4 -- defensive: production builds always have index.html */
      if (!cachedIndexHtml) {
        logger.error('index.html not found in production');
        return c.html('<!doctype html><html><head></head><body>Build error</body></html>', 500);
      }
      return c.html(cachedIndexHtml);
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

  return { app, injectWebSocket };
}
