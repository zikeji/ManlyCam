import { Hono } from 'hono';
import { env } from '../env.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { streamService } from '../services/streamService.js';
import { prisma } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import type { AppEnv } from '../lib/types.js';
import { CAMERA_CONTROLS_ALLOWLIST, Role } from '@manlycam/types';

export const streamRouter = new Hono<AppEnv>();

// GET /api/stream/state — current stream state
streamRouter.get('/api/stream/state', requireAuth, (c) => {
  return c.json(streamService.getState());
});

// WHEP proxy — forward WebRTC signaling to the local mediamtx instance.
// Auth is enforced here so the raw mediamtx WebRTC port never needs to be
// publicly exposed. Actual media flows via WebRTC UDP/TCP directly between
// the browser and this server (ICE candidates in the SDP answer).
//
// POST   /api/stream/whep          — create session (SDP offer → answer)
// PATCH  /api/stream/whep/:session — trickle ICE candidate exchange
// DELETE /api/stream/whep/:session — close session

const mtxWhepBase = () => `${env.MTX_WEBRTC_URL}/cam/whep`;

streamRouter.post('/api/stream/whep', requireAuth, async (c) => {
  const res = await fetch(mtxWhepBase(), {
    method: 'POST',
    /* c8 ignore next -- ?? fallback for missing Content-Type; tests always send Content-Type header */
    headers: { 'Content-Type': c.req.header('Content-Type') ?? 'application/sdp' },
    body: await c.req.text(),
  });

  // Hop-by-hop headers must not be forwarded — mixing Transfer-Encoding + Content-Length
  // in the same response is an HTTP protocol violation that Node.js rejects.
  // content-length is also dropped; Response() recalculates it from the string body.
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

  const headers = new Headers();
  for (const [key, value] of res.headers.entries()) {
    if (HOP_BY_HOP.has(key.toLowerCase())) continue;
    if (key.toLowerCase() === 'location') {
      // Rewrite mediamtx's session path to our proxy path so the browser sends
      // subsequent PATCH/DELETE through Hono (where auth is enforced).
      // mediamtx: /cam/whep/{uuid}  →  us: /api/stream/whep/{uuid}
      headers.set('Location', value.replace(/^\/cam\/whep/, '/api/stream/whep'));
    } else {
      headers.set(key, value);
    }
  }
  return new Response(await res.text(), { status: res.status, headers });
});

streamRouter.on(['PATCH', 'DELETE'], '/api/stream/whep/:session', requireAuth, async (c) => {
  const session = c.req.param('session');
  const res = await fetch(`${mtxWhepBase()}/${session}`, {
    method: c.req.method,
    /* c8 ignore next 3 -- ?? fallback for missing Content-Type; tests always send Content-Type header */
    headers:
      c.req.method === 'PATCH'
        ? { 'Content-Type': c.req.header('Content-Type') ?? 'application/trickle-ice-sdpfrag' }
        : {},
    body: c.req.method === 'PATCH' ? await c.req.text() : undefined,
  });
  // 204 No Content (typical PATCH response) forbids a body — always use null.
  // Strip hop-by-hop headers for the same reason as the POST handler above.
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
  const forwardedHeaders = Object.fromEntries(
    [...res.headers.entries()].filter(([k]) => !HOP_BY_HOP.has(k.toLowerCase())),
  );
  return new Response(null, { status: res.status, headers: forwardedHeaders });
});

streamRouter.post('/api/stream/stop', requireAuth, requireRole(Role.Admin), async (c) => {
  await streamService.setAdminToggle('offline');
  return c.json({ ok: true });
});

streamRouter.post('/api/stream/start', requireAuth, requireRole(Role.Admin), async (c) => {
  await streamService.setAdminToggle('live');
  return c.json({ ok: true });
});

// GET /api/stream/camera-settings
streamRouter.get('/api/stream/camera-settings', requireAuth, requireRole(Role.Admin), async (c) => {
  const rows = await prisma.cameraSettings.findMany();
  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    settings[row.key] = JSON.parse(row.value);
  }
  return c.json({ settings, piReachable: streamService.isPiReachable() });
});

// PATCH /api/stream/camera-settings
streamRouter.patch(
  '/api/stream/camera-settings',
  requireAuth,
  requireRole(Role.Admin),
  async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.json<Record<string, unknown>>();
    } catch (_err) {
      throw new AppError('Invalid JSON in request body', 'INVALID_JSON', 400);
    }
    const allowlist = new Set(CAMERA_CONTROLS_ALLOWLIST);

    for (const key of Object.keys(body)) {
      if (!allowlist.has(key as never)) {
        throw new AppError(`Unknown camera control key: ${key}`, 'INVALID_CAMERA_KEY', 400);
      }
    }

    // Persist to DB
    await Promise.all(
      Object.entries(body).map(([key, value]) =>
        prisma.cameraSettings.upsert({
          where: { key },
          update: { value: JSON.stringify(value) },
          create: { key, value: JSON.stringify(value) },
        }),
      ),
    );

    // Forward to Pi via frp tunnel (always attempted — DB is source of truth)
    try {
      const res = await fetch(
        `http://${env.FRP_HOST}:${env.FRP_API_PORT}/v3/config/paths/patch/cam`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const text = await res.text();
        logger.warn({ text }, 'camera: mediamtx PATCH returned non-ok status');
        return c.json({ ok: true });
      }
      return c.json({ ok: true });
    } catch (err) {
      logger.error({ err }, 'camera: failed to PATCH mediamtx');
      return c.json({ ok: true });
    }
  },
);
