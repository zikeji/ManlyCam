import { Hono } from 'hono';
import { env } from '../env.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { streamService } from '../services/streamService.js';
import type { AppEnv } from '../lib/types.js';

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

const mtxWhepBase = () => `http://127.0.0.1:${env.MTX_WEBRTC_PORT}/whep/cam`;

streamRouter.post('/api/stream/whep', requireAuth, async (c) => {
  const res = await fetch(mtxWhepBase(), {
    method: 'POST',
    headers: { 'Content-Type': c.req.header('Content-Type') ?? 'application/sdp' },
    body: await c.req.text(),
  });

  const headers = new Headers();
  for (const [key, value] of res.headers.entries()) {
    if (key.toLowerCase() === 'location') {
      // Rewrite mediamtx's session path to our proxy path so the browser sends
      // subsequent PATCH/DELETE through Hono (where auth is enforced).
      // mediamtx: /whep/cam/{uuid}  →  us: /api/stream/whep/{uuid}
      headers.set('Location', value.replace(/^\/whep\/cam/, '/api/stream/whep'));
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
    headers:
      c.req.method === 'PATCH'
        ? { 'Content-Type': c.req.header('Content-Type') ?? 'application/trickle-ice-sdpfrag' }
        : {},
    body: c.req.method === 'PATCH' ? await c.req.text() : undefined,
  });
  // 204 No Content (typical PATCH response) forbids a body — always use null.
  return new Response(null, {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
  });
});
