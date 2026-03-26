import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import crypto from 'node:crypto';
import { env } from '../env.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { streamService } from '../services/streamService.js';
import { streamConfig } from '../lib/stream-config.js';
import { AppError } from '../lib/errors.js';
import type { AppEnv } from '../lib/types.js';
import { Role } from '@manlycam/types';

// Hop-by-hop headers must not be forwarded — mixing Transfer-Encoding + Content-Length
// in the same response is an HTTP protocol violation that Node.js rejects.
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-length',
  'te',
  'trailer',
  'upgrade',
  'proxy-authenticate',
  'proxy-authorization',
]);

export const streamOnlyRouter = new Hono<AppEnv>();

const mtxWhepBase = () => `${env.MTX_WEBRTC_URL}/cam/whep`;

// GET /api/stream-only/config — admin only — returns { enabled, key }
streamOnlyRouter.get('/api/stream-only/config', requireAuth, requireRole(Role.Admin), async (c) => {
  const [enabledRaw, key] = await Promise.all([
    streamConfig.getOrNull('stream_only_enabled'),
    streamConfig.getOrNull('stream_only_key'),
  ]);
  return c.json({ enabled: enabledRaw === 'true', key });
});

// PATCH /api/stream-only/config — admin only — persists stream_only_enabled
streamOnlyRouter.patch(
  '/api/stream-only/config',
  requireAuth,
  requireRole(Role.Admin),
  async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch (_err) {
      throw new AppError('Invalid JSON in request body', 'INVALID_JSON', 400);
    }
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as Record<string, unknown>).enabled !== 'boolean'
    ) {
      throw new AppError('Invalid request body', 'VALIDATION_ERROR', 422);
    }
    const { enabled } = body as { enabled: boolean };
    await streamConfig.set('stream_only_enabled', enabled ? 'true' : 'false');
    return c.json({ ok: true });
  },
);

// POST /api/stream-only/config/regenerate — admin only — generates new key
streamOnlyRouter.post(
  '/api/stream-only/config/regenerate',
  requireAuth,
  requireRole(Role.Admin),
  async (c) => {
    const key = crypto.randomBytes(96).toString('base64url');
    await streamConfig.set('stream_only_key', key);
    return c.json({ key });
  },
);

async function validateStreamOnlyKey(key: string): Promise<boolean> {
  const [enabledRaw, storedKey] = await Promise.all([
    streamConfig.getOrNull('stream_only_enabled'),
    streamConfig.getOrNull('stream_only_key'),
  ]);
  return enabledRaw === 'true' && storedKey === key;
}

// GET /api/stream-only/:key/sse — no auth — SSE stream of { live: boolean } reachability events.
// Sends current state immediately on connect, then pushes an event on every piReachable change.
streamOnlyRouter.get('/api/stream-only/:key/sse', async (c) => {
  const key = c.req.param('key');
  const valid = await validateStreamOnlyKey(key);
  if (!valid) throw new AppError('Not found', 'NOT_FOUND', 404);

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ data: JSON.stringify({ live: streamService.isPiReachable() }) });

    const unsubscribe = streamService.subscribeReachability(async (live) => {
      await stream.writeSSE({ data: JSON.stringify({ live }) });
    });

    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        unsubscribe();
        resolve();
      });
    });
  });
});

// POST /api/stream-only/:key/whep — no auth — validate key+enabled, long-poll, proxy WHEP
// Only piReachable matters — admin toggle is intentionally bypassed for stream-only links.
streamOnlyRouter.post('/api/stream-only/:key/whep', async (c) => {
  const key = c.req.param('key');

  const valid = await validateStreamOnlyKey(key);
  if (!valid) {
    throw new AppError('Not found', 'NOT_FOUND', 404);
  }

  if (!streamService.isPiReachable()) {
    throw new AppError('Stream not live', 'STREAM_NOT_LIVE', 503);
  }

  const res = await fetch(mtxWhepBase(), {
    method: 'POST',
    /* c8 ignore next -- ?? fallback for missing Content-Type; tests always send Content-Type header */
    headers: { 'Content-Type': c.req.header('Content-Type') ?? 'application/sdp' },
    body: await c.req.text(),
  });

  const headers = new Headers();
  for (const [k, value] of res.headers.entries()) {
    if (HOP_BY_HOP.has(k.toLowerCase())) continue;
    if (k.toLowerCase() === 'location') {
      // Rewrite mediamtx session path to embed the key so PATCH/DELETE can re-validate.
      // mediamtx: /cam/whep/{uuid}  →  us: /api/stream-only/{key}/whep/{uuid}
      headers.set('Location', value.replace(/^\/cam\/whep/, `/api/stream-only/${key}/whep`));
    } else {
      headers.set(k, value);
    }
  }
  return new Response(await res.text(), { status: res.status, headers });
});

// PATCH|DELETE /api/stream-only/:key/whep/:session — no auth — validate key+enabled, proxy
streamOnlyRouter.on(['PATCH', 'DELETE'], '/api/stream-only/:key/whep/:session', async (c) => {
  const key = c.req.param('key');
  const session = c.req.param('session');

  const valid = await validateStreamOnlyKey(key);
  if (!valid) {
    throw new AppError('Not found', 'NOT_FOUND', 404);
  }

  const res = await fetch(`${mtxWhepBase()}/${session}`, {
    method: c.req.method,
    /* c8 ignore next 3 -- ?? fallback for missing Content-Type; tests always send Content-Type header */
    headers:
      c.req.method === 'PATCH'
        ? { 'Content-Type': c.req.header('Content-Type') ?? 'application/trickle-ice-sdpfrag' }
        : {},
    body: c.req.method === 'PATCH' ? await c.req.text() : undefined,
  });
  const forwardedHeaders = Object.fromEntries(
    [...res.headers.entries()].filter(([k]) => !HOP_BY_HOP.has(k.toLowerCase())),
  );
  return new Response(null, { status: res.status, headers: forwardedHeaders });
});
