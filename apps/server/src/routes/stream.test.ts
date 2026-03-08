import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../env.js', () => ({
  env: {
    NODE_ENV: 'test',
    BASE_URL: 'http://localhost:3000',
    MTX_WEBRTC_PORT: '8889',
    MTX_API_PORT: '9997',
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

  it('returns 200 and calls setAdminToggle("offline") for Admin', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(streamService.setAdminToggle).mockResolvedValue(undefined);
    const res = await createApp().app.request('/api/stream/stop', {
      ...authHeaders,
      method: 'POST',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(vi.mocked(streamService.setAdminToggle)).toHaveBeenCalledWith('offline');
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

  it('returns 200 and calls setAdminToggle("live") for Admin', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(streamService.setAdminToggle).mockResolvedValue(undefined);
    const res = await createApp().app.request('/api/stream/start', {
      ...authHeaders,
      method: 'POST',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(vi.mocked(streamService.setAdminToggle)).toHaveBeenCalledWith('live');
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

  it('persists settings and returns 200 ok:true piOffline:true when Pi is unreachable', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockAdmin as never);
    vi.mocked(streamService.isPiReachable).mockReturnValue(false);
    vi.mocked(prisma.cameraSettings.upsert).mockResolvedValue({
      key: 'rpiCameraBrightness',
      value: '0.5',
      updatedAt: new Date(),
    } as never);

    const res = await createApp().app.request('/api/stream/camera-settings', {
      ...authHeaders,
      method: 'PATCH',
      body: JSON.stringify({ rpiCameraBrightness: 0.5 }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.piOffline).toBe(true);
    // Verify DB upsert still happened even though Pi is offline
    expect(vi.mocked(prisma.cameraSettings.upsert)).toHaveBeenCalled();
  });

  it('returns 200 ok:false error:string when mediamtx API returns error', async () => {
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
    expect(data.ok).toBe(false);
    expect(data.error).toBe('mediamtx error');
  });

  it('returns 200 ok:false when fetch to mediamtx fails', async () => {
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
    expect(data.ok).toBe(false);
    expect(data.error).toBe('Failed to reach Pi camera API');
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
