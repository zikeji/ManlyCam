import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../env.js', () => ({
  env: {
    NODE_ENV: 'test',
    BASE_URL: 'http://localhost:3000',
    MTX_WEBRTC_URL: 'http://127.0.0.1:8888',
  },
}));

vi.mock('../db/client.js', () => ({
  prisma: {},
}));
vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => 'test-ulid') }));
vi.mock('../services/authService.js', () => ({
  initiateOAuth: vi.fn(),
  processOAuthCallback: vi.fn(),
  destroySession: vi.fn(),
  getSessionUser: vi.fn(),
}));
vi.mock('../services/streamService.js', () => ({
  streamService: {
    isPiReachable: vi.fn(),
    subscribeReachability: vi.fn(),
  },
  StreamService: vi.fn(),
}));
vi.mock('../services/wsHub.js', () => ({
  wsHub: { broadcast: vi.fn(), addClient: vi.fn() },
}));
vi.mock('../lib/stream-config.js', () => ({
  streamConfig: {
    getOrNull: vi.fn(),
    set: vi.fn(),
  },
}));

import { getSessionUser } from '../services/authService.js';
import { streamService } from '../services/streamService.js';
import { streamConfig } from '../lib/stream-config.js';
import { createApp } from '../app.js';
import { configEmitter } from './stream-only.js';

const mockAdmin = {
  id: 'admin-001',
  googleSub: 'google-sub-001',
  email: 'admin@example.com',
  displayName: 'Admin User',
  role: 'Admin',
  avatarUrl: null,
  bannedAt: null,
  mutedAt: null,
  userTagText: null,
  userTagColor: null,
  createdAt: new Date(),
  lastSeenAt: null,
};

const mockViewer = { ...mockAdmin, role: 'Viewer' };

const authHeaders = { headers: { cookie: 'session_id=valid-session' } };

describe('GET /api/stream-only/config', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/stream-only/config');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-Admin role', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockViewer as never);
    const res = await createApp().app.request('/api/stream-only/config', authHeaders);
    expect(res.status).toBe(403);
  });

  it('returns enabled:false and key:null when not set', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(streamConfig.getOrNull).mockResolvedValue(null);
    const res = await createApp().app.request('/api/stream-only/config', authHeaders);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false, key: null });
  });

  it('returns enabled:true and key when configured', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(streamConfig.getOrNull)
      .mockResolvedValueOnce('true')
      .mockResolvedValueOnce('abc123key');
    const res = await createApp().app.request('/api/stream-only/config', authHeaders);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: true, key: 'abc123key' });
  });
});

describe('PATCH /api/stream-only/config', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/stream-only/config', { method: 'PATCH' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-Admin role', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockViewer as never);
    const res = await createApp().app.request('/api/stream-only/config', {
      ...authHeaders,
      method: 'PATCH',
      body: JSON.stringify({ enabled: true }),
      headers: { ...authHeaders.headers, 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid JSON', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    const res = await createApp().app.request('/api/stream-only/config', {
      ...authHeaders,
      method: 'PATCH',
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });

  it('returns 422 for missing enabled field', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    const res = await createApp().app.request('/api/stream-only/config', {
      ...authHeaders,
      method: 'PATCH',
      headers: { ...authHeaders.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: 'yes' }),
    });
    expect(res.status).toBe(422);
  });

  it('persists enabled:true and returns ok:true', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(streamConfig.set).mockResolvedValue(undefined);
    const res = await createApp().app.request('/api/stream-only/config', {
      ...authHeaders,
      method: 'PATCH',
      headers: { ...authHeaders.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(vi.mocked(streamConfig.set)).toHaveBeenCalledWith('stream_only_enabled', 'true');
  });

  it('persists enabled:false', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(streamConfig.set).mockResolvedValue(undefined);
    const res = await createApp().app.request('/api/stream-only/config', {
      ...authHeaders,
      method: 'PATCH',
      headers: { ...authHeaders.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(200);
    expect(vi.mocked(streamConfig.set)).toHaveBeenCalledWith('stream_only_enabled', 'false');
  });
});

describe('POST /api/stream-only/config/regenerate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/stream-only/config/regenerate', {
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-Admin role', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockViewer as never);
    const res = await createApp().app.request('/api/stream-only/config/regenerate', {
      ...authHeaders,
      method: 'POST',
    });
    expect(res.status).toBe(403);
  });

  it('generates a key, persists it, and returns { key }', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(streamConfig.set).mockResolvedValue(undefined);
    const res = await createApp().app.request('/api/stream-only/config/regenerate', {
      ...authHeaders,
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.key).toBe('string');
    expect(data.key.length).toBeGreaterThan(0);
    expect(vi.mocked(streamConfig.set)).toHaveBeenCalledWith('stream_only_key', data.key);
  });

  it('generated key is URL-safe base64 (no +, /, =)', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(streamConfig.set).mockResolvedValue(undefined);
    const res = await createApp().app.request('/api/stream-only/config/regenerate', {
      ...authHeaders,
      method: 'POST',
    });
    const data = await res.json();
    expect(data.key).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('old key is invalidated after regenerate — WHEP with old key returns 404', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);

    const oldKey = 'old-key-value';
    let storedKey = oldKey;

    // Simulate streamConfig: getOrNull returns storedKey, set updates it
    vi.mocked(streamConfig.getOrNull).mockImplementation(async (k: string) => {
      if (k === 'stream_only_enabled') return 'true';
      if (k === 'stream_only_key') return storedKey;
      return null;
    });
    vi.mocked(streamConfig.set).mockImplementation(async (_k: string, v: string | null) => {
      if (_k === 'stream_only_key') storedKey = v ?? '';
    });

    // Regenerate — storedKey is now the new key
    const regenRes = await createApp().app.request('/api/stream-only/config/regenerate', {
      ...authHeaders,
      method: 'POST',
    });
    expect(regenRes.status).toBe(200);
    const { key: newKey } = await regenRes.json();
    expect(newKey).not.toBe(oldKey);

    // WHEP POST with old key must return 404 (key validation fails before reachability check)
    vi.mocked(streamService.isPiReachable).mockReturnValue(true);
    const whepRes = await createApp().app.request(`/api/stream-only/${oldKey}/whep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: 'v=0\r\n',
    });
    expect(whepRes.status).toBe(404);
  });
});

describe('GET /api/stream-only/:key/sse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  // Helper: stabilize mock for a single SSE test — k-based dispatch avoids queued-value races
  function mockStreamConfig(key: string | null, enabled: string | null): void {
    vi.mocked(streamConfig.getOrNull).mockImplementation(async (k: string) => {
      if (k === 'stream_only_key') return key;
      if (k === 'stream_only_enabled') return enabled;
      return null;
    });
  }

  it('sends not-found event for invalid key and stream closes', async () => {
    mockStreamConfig(null, null);
    vi.mocked(streamService.subscribeReachability).mockReturnValue(vi.fn());

    const res = await createApp().app.request('/api/stream-only/badkey/sse');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');

    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('event: not-found');
    await reader.cancel();
  });

  it('sends { live: false } for valid but disabled key (stays connected)', async () => {
    mockStreamConfig('validkey', 'false');
    vi.mocked(streamService.isPiReachable).mockReturnValue(true);
    vi.mocked(streamService.subscribeReachability).mockReturnValue(vi.fn());

    const res = await createApp().app.request('/api/stream-only/validkey/sse');
    expect(res.status).toBe(200);

    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('"live":false');
    await reader.cancel();
  });

  it('sends initial { live: true } when enabled and pi is reachable', async () => {
    mockStreamConfig('validkey', 'true');
    vi.mocked(streamService.isPiReachable).mockReturnValue(true);
    vi.mocked(streamService.subscribeReachability).mockReturnValue(vi.fn());

    const res = await createApp().app.request('/api/stream-only/validkey/sse');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');

    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('"live":true');
    await reader.cancel();
  });

  it('sends initial { live: false } when enabled but pi is not reachable', async () => {
    mockStreamConfig('validkey', 'true');
    vi.mocked(streamService.isPiReachable).mockReturnValue(false);
    vi.mocked(streamService.subscribeReachability).mockReturnValue(vi.fn());

    const res = await createApp().app.request('/api/stream-only/validkey/sse');
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('"live":false');
    await reader.cancel();
  });

  it('calls subscribeReachability and unsubscribes on abort', async () => {
    mockStreamConfig('validkey', 'true');
    vi.mocked(streamService.isPiReachable).mockReturnValue(false);
    const unsubscribeMock = vi.fn();
    vi.mocked(streamService.subscribeReachability).mockReturnValue(unsubscribeMock);

    const res = await createApp().app.request('/api/stream-only/validkey/sse');
    const reader = res.body!.getReader();
    await reader.read();
    await new Promise((r) => setTimeout(r, 0)); // drain microtasks so SSE handler registers abort + subscribeReachability
    await reader.cancel();
    await new Promise((r) => setTimeout(r, 10));

    expect(vi.mocked(streamService.subscribeReachability)).toHaveBeenCalled();
    expect(unsubscribeMock).toHaveBeenCalled();
  });

  it('pushes { live: true } when pi becomes reachable (enabled)', async () => {
    mockStreamConfig('validkey', 'true');
    vi.mocked(streamService.isPiReachable).mockReturnValue(false);

    let capturedCb: ((live: boolean) => void) | null = null;
    vi.mocked(streamService.subscribeReachability).mockImplementation((cb) => {
      capturedCb = cb;
      return vi.fn();
    });

    const res = await createApp().app.request('/api/stream-only/validkey/sse');
    const reader = res.body!.getReader();
    await reader.read(); // consume initial { live: false }
    await new Promise((r) => setTimeout(r, 0)); // let SSE handler finish setup

    await capturedCb!(true);
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('"live":true');
    await reader.cancel();
  });

  it('does not push reachability update when disabled', async () => {
    mockStreamConfig('validkey', 'false');
    vi.mocked(streamService.isPiReachable).mockReturnValue(false);

    let capturedCb: ((live: boolean) => void) | null = null;
    vi.mocked(streamService.subscribeReachability).mockImplementation((cb) => {
      capturedCb = cb;
      return vi.fn();
    });

    const res = await createApp().app.request('/api/stream-only/validkey/sse');
    const reader = res.body!.getReader();
    await reader.read(); // consume initial { live: false }
    await new Promise((r) => setTimeout(r, 0)); // let SSE handler finish setup

    // Pi goes online but link is disabled — no event should be pushed
    await capturedCb!(true);

    // No second event — verify via race with timeout
    const raceResult = await Promise.race([
      reader.read(),
      new Promise<null>((r) => setTimeout(() => r(null), 20)),
    ]);
    expect(raceResult).toBeNull();
    await reader.cancel();
  });

  it('sends not-found event when key is regenerated (configEmitter change)', async () => {
    let storedKey = 'oldkey';
    vi.mocked(streamConfig.getOrNull).mockImplementation(async (k: string) => {
      if (k === 'stream_only_key') return storedKey;
      if (k === 'stream_only_enabled') return 'true';
      return null;
    });
    vi.mocked(streamService.isPiReachable).mockReturnValue(true);
    vi.mocked(streamService.subscribeReachability).mockReturnValue(vi.fn());

    const res = await createApp().app.request('/api/stream-only/oldkey/sse');
    const reader = res.body!.getReader();
    await reader.read(); // consume initial { live: true }
    await new Promise((r) => setTimeout(r, 0)); // let SSE handler register configEmitter listener

    // Simulate key regeneration
    storedKey = 'newkey';
    configEmitter.emit('change');
    await new Promise((r) => setTimeout(r, 10));

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('event: not-found');
    await reader.cancel();
  });

  it('sends { live: false } when link is disabled via configEmitter', async () => {
    let isEnabled = 'true';
    vi.mocked(streamConfig.getOrNull).mockImplementation(async (k: string) => {
      if (k === 'stream_only_key') return 'validkey';
      if (k === 'stream_only_enabled') return isEnabled;
      return null;
    });
    vi.mocked(streamService.isPiReachable).mockReturnValue(true);
    vi.mocked(streamService.subscribeReachability).mockReturnValue(vi.fn());

    const res = await createApp().app.request('/api/stream-only/validkey/sse');
    const reader = res.body!.getReader();
    await reader.read(); // consume initial { live: true }
    await new Promise((r) => setTimeout(r, 0)); // let SSE handler register configEmitter listener

    // Admin disables the link
    isEnabled = 'false';
    configEmitter.emit('change');
    await new Promise((r) => setTimeout(r, 10));

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('"live":false');
    await reader.cancel();
  });

  it('sends { live: true } when link is enabled via configEmitter and pi is reachable', async () => {
    let isEnabled = 'false';
    vi.mocked(streamConfig.getOrNull).mockImplementation(async (k: string) => {
      if (k === 'stream_only_key') return 'validkey';
      if (k === 'stream_only_enabled') return isEnabled;
      return null;
    });
    vi.mocked(streamService.isPiReachable).mockReturnValue(true);
    vi.mocked(streamService.subscribeReachability).mockReturnValue(vi.fn());

    const res = await createApp().app.request('/api/stream-only/validkey/sse');
    const reader = res.body!.getReader();
    await reader.read(); // consume initial { live: false }
    await new Promise((r) => setTimeout(r, 0)); // let SSE handler register configEmitter listener

    // Admin enables the link
    isEnabled = 'true';
    configEmitter.emit('change');
    await new Promise((r) => setTimeout(r, 10));

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toContain('"live":true');
    await reader.cancel();
  });
});

describe('POST /api/stream-only/:key/whep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns 404 for invalid key', async () => {
    vi.mocked(streamConfig.getOrNull).mockResolvedValue(null);
    const res = await createApp().app.request('/api/stream-only/badkey/whep', {
      method: 'POST',
      body: 'v=0\r\n',
    });
    expect(res.status).toBe(404);
  });

  it('returns 503 when disabled (transient — client retries via SSE)', async () => {
    vi.mocked(streamConfig.getOrNull).mockImplementation(async (k: string) => {
      if (k === 'stream_only_key') return 'validkey';
      if (k === 'stream_only_enabled') return 'false';
      return null;
    });
    const res = await createApp().app.request('/api/stream-only/validkey/whep', {
      method: 'POST',
      body: 'v=0\r\n',
    });
    expect(res.status).toBe(503);
  });

  it('returns 404 when key does not match stored key', async () => {
    vi.mocked(streamConfig.getOrNull).mockImplementation(async (k: string) => {
      if (k === 'stream_only_key') return 'correctkey';
      if (k === 'stream_only_enabled') return 'true';
      return null;
    });
    const res = await createApp().app.request('/api/stream-only/wrongkey/whep', {
      method: 'POST',
      body: 'v=0\r\n',
    });
    expect(res.status).toBe(404);
  });

  it('proxies WHEP immediately when pi is reachable', async () => {
    vi.mocked(streamConfig.getOrNull).mockImplementation(async (k: string) => {
      if (k === 'stream_only_key') return 'validkey';
      if (k === 'stream_only_enabled') return 'true';
      return null;
    });
    vi.mocked(streamService.isPiReachable).mockReturnValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('v=0\r\n', {
          status: 201,
          headers: {
            'Content-Type': 'application/sdp',
            Location: '/cam/whep/session-abc',
          },
        }),
      ),
    );

    const res = await createApp().app.request('/api/stream-only/validkey/whep', {
      method: 'POST',
      body: 'v=0\r\n',
    });

    expect(res.status).toBe(201);
    expect(res.headers.get('Location')).toBe('/api/stream-only/validkey/whep/session-abc');
    expect(await res.text()).toBe('v=0\r\n');
  });

  it('returns 503 when pi is not reachable', async () => {
    vi.mocked(streamConfig.getOrNull).mockImplementation(async (k: string) => {
      if (k === 'stream_only_key') return 'validkey';
      if (k === 'stream_only_enabled') return 'true';
      return null;
    });
    vi.mocked(streamService.isPiReachable).mockReturnValue(false);

    const res = await createApp().app.request('/api/stream-only/validkey/whep', {
      method: 'POST',
      body: 'v=0\r\n',
    });

    expect(res.status).toBe(503);
  });

  it('proxies WHEP even when admin toggle is explicit-offline (bypass admin state)', async () => {
    // stream-only ignores the admin stream stop/start toggle — only isPiReachable matters for Pi-side.
    vi.mocked(streamConfig.getOrNull).mockImplementation(async (k: string) => {
      if (k === 'stream_only_key') return 'validkey';
      if (k === 'stream_only_enabled') return 'true';
      return null;
    });
    vi.mocked(streamService.isPiReachable).mockReturnValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('v=0\r\n', {
          status: 201,
          headers: { Location: '/cam/whep/session-admin-offline' },
        }),
      ),
    );

    const res = await createApp().app.request('/api/stream-only/validkey/whep', {
      method: 'POST',
      body: 'v=0\r\n',
    });

    expect(res.status).toBe(201);
  });

  it('strips hop-by-hop headers from mediamtx response', async () => {
    vi.mocked(streamConfig.getOrNull).mockImplementation(async (k: string) => {
      if (k === 'stream_only_key') return 'validkey';
      if (k === 'stream_only_enabled') return 'true';
      return null;
    });
    vi.mocked(streamService.isPiReachable).mockReturnValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('v=0\r\n', {
          status: 201,
          headers: {
            'Content-Type': 'application/sdp',
            'Transfer-Encoding': 'chunked',
          },
        }),
      ),
    );

    const res = await createApp().app.request('/api/stream-only/validkey/whep', {
      method: 'POST',
      body: 'v=0\r\n',
    });

    expect(res.status).toBe(201);
    expect(res.headers.get('Transfer-Encoding')).toBeNull();
  });
});

describe('PATCH /api/stream-only/:key/whep/:session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns 404 for invalid key', async () => {
    vi.mocked(streamConfig.getOrNull).mockResolvedValue(null);
    const res = await createApp().app.request('/api/stream-only/badkey/whep/session-abc', {
      method: 'PATCH',
      body: 'a=candidate:...',
    });
    expect(res.status).toBe(404);
  });

  it('proxies trickle ICE candidate to mediamtx', async () => {
    vi.mocked(streamConfig.getOrNull)
      .mockResolvedValueOnce('true')
      .mockResolvedValueOnce('validkey');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const res = await createApp().app.request('/api/stream-only/validkey/whep/session-abc', {
      method: 'PATCH',
      body: 'a=candidate:...',
    });

    expect(res.status).toBe(204);
    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      'http://127.0.0.1:8888/cam/whep/session-abc',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});

describe('DELETE /api/stream-only/:key/whep/:session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns 404 for invalid key', async () => {
    vi.mocked(streamConfig.getOrNull).mockResolvedValue(null);
    const res = await createApp().app.request('/api/stream-only/badkey/whep/session-abc', {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
  });

  it('proxies session close to mediamtx', async () => {
    vi.mocked(streamConfig.getOrNull)
      .mockResolvedValueOnce('true')
      .mockResolvedValueOnce('validkey');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    const res = await createApp().app.request('/api/stream-only/validkey/whep/session-abc', {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      'http://127.0.0.1:8888/cam/whep/session-abc',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
