import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../env.js', () => ({
  env: {
    NODE_ENV: 'test',
    BASE_URL: 'http://localhost:3000',
    MTX_WEBRTC_PORT: '8889',
    MTX_API_PORT: '9997',
    MTX_HLS_URL: 'http://127.0.0.1:8090',
    FRP_HOST: 'localhost',
    FRP_API_PORT: '7400',
  },
}));

vi.mock('../db/client.js', () => ({
  prisma: {
    cameraSettings: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
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
    start: vi.fn(),
    stop: vi.fn(),
    setAdminToggle: vi.fn(),
    isPiReachable: vi.fn(),
    getOfflineMessage: vi.fn(),
    setOfflineMessage: vi.fn(),
  },
  StreamService: vi.fn(),
}));
vi.mock('../services/wsHub.js', () => ({
  wsHub: { broadcast: vi.fn(), addClient: vi.fn() },
}));

import { getSessionUser } from '../services/authService.js';
import { streamService } from '../services/streamService.js';
import { prisma } from '../db/client.js';
import { createApp } from '../app.js';

const mockUser = {
  id: 'user-001',
  googleSub: 'google-sub-001',
  email: 'test@example.com',
  displayName: 'Test User',
  role: 'ViewerCompany',
  avatarUrl: null,
  bannedAt: null,
  mutedAt: null,
  userTagText: null,
  userTagColor: null,
  createdAt: new Date(),
  lastSeenAt: null,
};

const mockAdmin = { ...mockUser, role: 'Admin' };

const authHeaders = { headers: { cookie: 'session_id=valid-session' } };

describe('GET /api/stream/state', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/stream/state');
    expect(res.status).toBe(401);
  });

  it('returns 200 with StreamState JSON when authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.mocked(streamService.getState).mockReturnValue({ state: 'live' });
    const res = await createApp().app.request('/api/stream/state', authHeaders);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: 'live' });
  });
});

describe('POST /api/stream/whep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/stream/whep', {
      method: 'POST',
      body: 'offer',
    });
    expect(res.status).toBe(401);
  });

  it('proxies SDP offer to mediamtx and rewrites Location header', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
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

    const res = await createApp().app.request('/api/stream/whep', {
      ...authHeaders,
      method: 'POST',
      body: 'v=0\r\n',
    });

    expect(res.status).toBe(201);
    expect(res.headers.get('Location')).toBe('/api/stream/whep/session-abc');
    expect(await res.text()).toBe('v=0\r\n');
  });

  it('passes through mediamtx error responses', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no stream', { status: 404 })));

    const res = await createApp().app.request('/api/stream/whep', {
      ...authHeaders,
      method: 'POST',
      body: 'v=0\r\n',
    });
    expect(res.status).toBe(404);
  });

  it('forwards Content-Type header when provided (non-null ?? branch)', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('v=0\r\n', { status: 201 })));

    const res = await createApp().app.request('/api/stream/whep', {
      method: 'POST',
      headers: { cookie: 'session_id=valid-session', 'Content-Type': 'application/sdp' },
      body: 'v=0\r\n',
    });

    expect(res.status).toBe(201);
    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    expect((fetchCall[1] as RequestInit).headers).toEqual(
      expect.objectContaining({ 'Content-Type': 'application/sdp' }),
    );
  });

  it('strips hop-by-hop headers from mediamtx response', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
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

    const res = await createApp().app.request('/api/stream/whep', {
      ...authHeaders,
      method: 'POST',
      body: 'v=0\r\n',
    });

    expect(res.status).toBe(201);
    expect(res.headers.get('Transfer-Encoding')).toBeNull();
  });
});

describe('PATCH /api/stream/whep/:session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/stream/whep/session-abc', { method: 'PATCH' });
    expect(res.status).toBe(401);
  });

  it('proxies trickle ICE candidate to mediamtx', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const res = await createApp().app.request('/api/stream/whep/session-abc', {
      ...authHeaders,
      method: 'PATCH',
      body: 'a=candidate:...',
    });
    expect(res.status).toBe(204);
  });

  it('forwards Content-Type header on PATCH when provided (non-null ?? branch)', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const res = await createApp().app.request('/api/stream/whep/session-abc', {
      method: 'PATCH',
      headers: {
        cookie: 'session_id=valid-session',
        'Content-Type': 'application/trickle-ice-sdpfrag',
      },
      body: 'a=candidate:...',
    });

    expect(res.status).toBe(204);
    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    expect((fetchCall[1] as RequestInit).headers).toEqual(
      expect.objectContaining({ 'Content-Type': 'application/trickle-ice-sdpfrag' }),
    );
  });
});

describe('DELETE /api/stream/whep/:session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/stream/whep/session-abc', { method: 'DELETE' });
    expect(res.status).toBe(401);
  });

  it('proxies session close to mediamtx', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    const res = await createApp().app.request('/api/stream/whep/session-abc', {
      ...authHeaders,
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/stream/stop', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/stream/stop', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-Admin role', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    const res = await createApp().app.request('/api/stream/stop', {
      ...authHeaders,
      method: 'POST',
    });
    expect(res.status).toBe(403);
    expect(vi.mocked(streamService.setAdminToggle)).not.toHaveBeenCalled();
  });

  it('returns 200 and calls setAdminToggle("offline", actorId) for Admin', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(streamService.setAdminToggle).mockResolvedValue(undefined);
    const res = await createApp().app.request('/api/stream/stop', {
      ...authHeaders,
      method: 'POST',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(vi.mocked(streamService.setAdminToggle)).toHaveBeenCalledWith('offline', mockAdmin.id);
  });
});

describe('POST /api/stream/start', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/stream/start', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-Admin role', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    const res = await createApp().app.request('/api/stream/start', {
      ...authHeaders,
      method: 'POST',
    });
    expect(res.status).toBe(403);
    expect(vi.mocked(streamService.setAdminToggle)).not.toHaveBeenCalled();
  });

  it('returns 200 and calls setAdminToggle("live", actorId) for Admin', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(streamService.setAdminToggle).mockResolvedValue(undefined);
    const res = await createApp().app.request('/api/stream/start', {
      ...authHeaders,
      method: 'POST',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(vi.mocked(streamService.setAdminToggle)).toHaveBeenCalledWith('live', mockAdmin.id);
  });
});

describe('GET /api/stream/camera-settings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/stream/camera-settings');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-Admin role', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    const res = await createApp().app.request('/api/stream/camera-settings', authHeaders);
    expect(res.status).toBe(403);
  });

  it('returns 200 with settings and piReachable for Admin', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(prisma.cameraSettings.findMany).mockResolvedValue([
      { key: 'rpiCameraBrightness', value: '0.5', updatedAt: new Date() },
      { key: 'rpiCameraContrast', value: '1.2', updatedAt: new Date() },
    ] as never);
    vi.mocked(streamService.isPiReachable).mockReturnValue(true);

    const res = await createApp().app.request('/api/stream/camera-settings', authHeaders);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      settings: {
        rpiCameraBrightness: 0.5,
        rpiCameraContrast: 1.2,
      },
      piReachable: true,
    });
  });

  it('returns empty settings when no camera settings exist', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(prisma.cameraSettings.findMany).mockResolvedValue([] as never);
    vi.mocked(streamService.isPiReachable).mockReturnValue(false);

    const res = await createApp().app.request('/api/stream/camera-settings', authHeaders);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ settings: {}, piReachable: false });
  });
});

describe('PATCH /api/stream/camera-settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/stream/camera-settings', {
      method: 'PATCH',
      body: JSON.stringify({ rpiCameraBrightness: 0.5 }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-Admin role', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    const res = await createApp().app.request('/api/stream/camera-settings', {
      ...authHeaders,
      method: 'PATCH',
      body: JSON.stringify({ rpiCameraBrightness: 0.5 }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 when request body is invalid JSON', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    const res = await createApp().app.request('/api/stream/camera-settings', {
      ...authHeaders,
      method: 'PATCH',
      body: 'not valid json',
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it('returns 400 when key is not in allowlist', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    const res = await createApp().app.request('/api/stream/camera-settings', {
      ...authHeaders,
      method: 'PATCH',
      body: JSON.stringify({ invalidKey: 'value' }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_CAMERA_KEY');
  });

  it('persists valid settings and returns 200 ok:true when Pi is reachable', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(streamService.isPiReachable).mockReturnValue(true);
    vi.mocked(prisma.cameraSettings.upsert).mockResolvedValue({
      key: 'rpiCameraBrightness',
      value: '0.5',
      updatedAt: new Date(),
    } as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    const res = await createApp().app.request('/api/stream/camera-settings', {
      ...authHeaders,
      method: 'PATCH',
      body: JSON.stringify({ rpiCameraBrightness: 0.5 }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.piOffline).toBeUndefined();
    expect(vi.mocked(prisma.cameraSettings.upsert)).toHaveBeenCalledWith({
      where: { key: 'rpiCameraBrightness' },
      update: { value: '0.5' },
      create: { key: 'rpiCameraBrightness', value: '0.5' },
    });
  });

  it('persists settings and attempts fetch even when Pi is unreachable, returns ok:true', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(streamService.isPiReachable).mockReturnValue(false);
    vi.mocked(prisma.cameraSettings.upsert).mockResolvedValue({
      key: 'rpiCameraBrightness',
      value: '0.5',
      updatedAt: new Date(),
    } as never);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const res = await createApp().app.request('/api/stream/camera-settings', {
      ...authHeaders,
      method: 'PATCH',
      body: JSON.stringify({ rpiCameraBrightness: 0.5 }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.piOffline).toBeUndefined();
    // Verify DB upsert still happened
    expect(vi.mocked(prisma.cameraSettings.upsert)).toHaveBeenCalled();
    // Verify fetch was still attempted even though Pi is unreachable
    expect(vi.mocked(global.fetch)).toHaveBeenCalled();
  });

  it('returns 200 ok:true (silent failure) when mediamtx API returns error', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(streamService.isPiReachable).mockReturnValue(true);
    vi.mocked(prisma.cameraSettings.upsert).mockResolvedValue({
      key: 'rpiCameraBrightness',
      value: '0.5',
      updatedAt: new Date(),
    } as never);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('mediamtx error', { status: 500 })),
    );

    const res = await createApp().app.request('/api/stream/camera-settings', {
      ...authHeaders,
      method: 'PATCH',
      body: JSON.stringify({ rpiCameraBrightness: 0.5 }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.error).toBeUndefined();
  });

  it('returns 200 ok:true (silent failure) when fetch to mediamtx fails', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(streamService.isPiReachable).mockReturnValue(true);
    vi.mocked(prisma.cameraSettings.upsert).mockResolvedValue({
      key: 'rpiCameraBrightness',
      value: '0.5',
      updatedAt: new Date(),
    } as never);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const res = await createApp().app.request('/api/stream/camera-settings', {
      ...authHeaders,
      method: 'PATCH',
      body: JSON.stringify({ rpiCameraBrightness: 0.5 }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.error).toBeUndefined();
  });

  it('upserts multiple keys in a single PATCH request', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(streamService.isPiReachable).mockReturnValue(true);
    vi.mocked(prisma.cameraSettings.upsert).mockResolvedValue({
      key: 'rpiCameraBrightness',
      value: '0.5',
      updatedAt: new Date(),
    } as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    const res = await createApp().app.request('/api/stream/camera-settings', {
      ...authHeaders,
      method: 'PATCH',
      body: JSON.stringify({
        rpiCameraBrightness: 0.5,
        rpiCameraContrast: 1.2,
      }),
    });

    expect(res.status).toBe(200);
    expect(vi.mocked(prisma.cameraSettings.upsert)).toHaveBeenCalledTimes(2);
  });
});

describe('GET /api/stream/offline-message', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/stream/offline-message');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-Admin role', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    const res = await createApp().app.request('/api/stream/offline-message', authHeaders);
    expect(res.status).toBe(403);
  });

  it('returns current offline message for Admin', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(streamService.getOfflineMessage).mockReturnValue({
      emoji: '1f634',
      title: null,
      description: null,
    });
    const res = await createApp().app.request('/api/stream/offline-message', authHeaders);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ emoji: '1f634', title: null, description: null });
  });
});

describe('PATCH /api/stream/offline-message', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/stream/offline-message', { method: 'PATCH' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-Admin role', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    const res = await createApp().app.request('/api/stream/offline-message', {
      ...authHeaders,
      method: 'PATCH',
      body: JSON.stringify({ emoji: null, title: null, description: null }),
      headers: { ...authHeaders.headers, 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 when body is invalid JSON', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    const res = await createApp().app.request('/api/stream/offline-message', {
      ...authHeaders,
      method: 'PATCH',
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });

  it('returns 422 when emoji exceeds max length', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    const res = await createApp().app.request('/api/stream/offline-message', {
      ...authHeaders,
      method: 'PATCH',
      headers: { ...authHeaders.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji: '1f'.repeat(33), title: null, description: null }),
    });
    expect(res.status).toBe(422);
  });

  it('returns 422 when emoji has invalid format', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    const res = await createApp().app.request('/api/stream/offline-message', {
      ...authHeaders,
      method: 'PATCH',
      headers: { ...authHeaders.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji: '../../../etc/passwd', title: null, description: null }),
    });
    expect(res.status).toBe(422);
  });

  it('normalizes empty strings to null for title and description', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(streamService.setOfflineMessage).mockResolvedValue(undefined);
    const res = await createApp().app.request('/api/stream/offline-message', {
      ...authHeaders,
      method: 'PATCH',
      headers: { ...authHeaders.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji: '1f634', title: '   ', description: '' }),
    });
    expect(res.status).toBe(200);
    expect(vi.mocked(streamService.setOfflineMessage)).toHaveBeenCalledWith({
      emoji: '1f634',
      title: null,
      description: null,
      actorId: mockAdmin.id,
    });
  });

  it('calls setOfflineMessage and returns ok:true for Admin', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(streamService.setOfflineMessage).mockResolvedValue(undefined);
    const payload = { emoji: '1f634', title: 'My Title', description: 'My Desc' };
    const res = await createApp().app.request('/api/stream/offline-message', {
      ...authHeaders,
      method: 'PATCH',
      headers: { ...authHeaders.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(vi.mocked(streamService.setOfflineMessage)).toHaveBeenCalledWith({
      emoji: '1f634',
      title: 'My Title',
      description: 'My Desc',
      actorId: mockAdmin.id,
    });
  });

  it('handles null values (reset case)', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(streamService.setOfflineMessage).mockResolvedValue(undefined);
    const res = await createApp().app.request('/api/stream/offline-message', {
      ...authHeaders,
      method: 'PATCH',
      headers: { ...authHeaders.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji: null, title: null, description: null }),
    });
    expect(res.status).toBe(200);
    expect(vi.mocked(streamService.setOfflineMessage)).toHaveBeenCalledWith({
      emoji: null,
      title: null,
      description: null,
      actorId: mockAdmin.id,
    });
  });
});

describe('GET /api/stream/hls/*', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/stream/hls/index.m3u8');
    expect(res.status).toBe(401);
  });

  it('proxies HLS playlist from mediamtx', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    const playlistContent = '#EXTM3U\n#EXT-X-VERSION:3\n';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(playlistContent, {
          status: 200,
          headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
        }),
      ),
    );

    const res = await createApp().app.request('/api/stream/hls/index.m3u8', authHeaders);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/vnd.apple.mpegurl');
    const body = await res.text();
    expect(body).toBe(playlistContent);
    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith('http://127.0.0.1:8090/cam/index.m3u8');
  });

  it('captures multi-segment wildcard paths', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new ArrayBuffer(8), {
          status: 200,
          headers: { 'Content-Type': 'video/mp2t' },
        }),
      ),
    );

    const res = await createApp().app.request(
      '/api/stream/hls/video1_stream/seg001.ts',
      authHeaders,
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      'http://127.0.0.1:8090/cam/video1_stream/seg001.ts',
    );
  });

  it('rejects paths containing .. with 400', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    const res = await createApp().app.request('/api/stream/hls/foo/..%2fbar', authHeaders);
    expect(res.status).toBe(400);
  });

  it('rejects paths with disallowed characters with 400', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    const res = await createApp().app.request('/api/stream/hls/foo%00bar', authHeaders);
    expect(res.status).toBe(400);
  });

  it('returns 502 when mediamtx HLS is unreachable', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const res = await createApp().app.request('/api/stream/hls/index.m3u8', authHeaders);
    expect(res.status).toBe(502);
  });

  it('forwards upstream status code', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', { status: 404 })));

    const res = await createApp().app.request('/api/stream/hls/nonexistent.m3u8', authHeaders);
    expect(res.status).toBe(404);
  });
});
