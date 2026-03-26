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
    getState: vi.fn(),
    waitForLive: vi.fn(),
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

    // WHEP POST with old key must return 404
    const whepRes = await createApp().app.request(`/api/stream-only/${oldKey}/whep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: 'v=0\r\n',
    });
    expect(whepRes.status).toBe(404);
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

  it('returns 404 when disabled', async () => {
    vi.mocked(streamConfig.getOrNull)
      .mockResolvedValueOnce('false')
      .mockResolvedValueOnce('validkey');
    const res = await createApp().app.request('/api/stream-only/validkey/whep', {
      method: 'POST',
      body: 'v=0\r\n',
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when key does not match stored key', async () => {
    vi.mocked(streamConfig.getOrNull)
      .mockResolvedValueOnce('true')
      .mockResolvedValueOnce('correctkey');
    const res = await createApp().app.request('/api/stream-only/wrongkey/whep', {
      method: 'POST',
      body: 'v=0\r\n',
    });
    expect(res.status).toBe(404);
  });

  it('proxies WHEP immediately when stream is live', async () => {
    vi.mocked(streamConfig.getOrNull)
      .mockResolvedValueOnce('true')
      .mockResolvedValueOnce('validkey');
    vi.mocked(streamService.getState).mockReturnValue({ state: 'live' });
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

  it('waits for live and proxies when stream becomes live', async () => {
    vi.mocked(streamConfig.getOrNull)
      .mockResolvedValueOnce('true')
      .mockResolvedValueOnce('validkey');
    vi.mocked(streamService.getState).mockReturnValue({
      state: 'unreachable',
      adminToggle: 'live',
    });
    vi.mocked(streamService.waitForLive).mockResolvedValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('v=0\r\n', {
          status: 201,
          headers: { Location: '/cam/whep/session-xyz' },
        }),
      ),
    );

    const res = await createApp().app.request('/api/stream-only/validkey/whep', {
      method: 'POST',
      body: 'v=0\r\n',
    });

    expect(res.status).toBe(201);
    expect(res.headers.get('Location')).toBe('/api/stream-only/validkey/whep/session-xyz');
    expect(vi.mocked(streamService.waitForLive)).toHaveBeenCalledWith(30_000);
  });

  it('returns 503 when waitForLive times out', async () => {
    vi.mocked(streamConfig.getOrNull)
      .mockResolvedValueOnce('true')
      .mockResolvedValueOnce('validkey');
    vi.mocked(streamService.getState).mockReturnValue({
      state: 'unreachable',
      adminToggle: 'live',
    });
    vi.mocked(streamService.waitForLive).mockResolvedValue(false);

    const res = await createApp().app.request('/api/stream-only/validkey/whep', {
      method: 'POST',
      body: 'v=0\r\n',
    });

    expect(res.status).toBe(503);
  });

  it('strips hop-by-hop headers from mediamtx response', async () => {
    vi.mocked(streamConfig.getOrNull)
      .mockResolvedValueOnce('true')
      .mockResolvedValueOnce('validkey');
    vi.mocked(streamService.getState).mockReturnValue({ state: 'live' });
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
