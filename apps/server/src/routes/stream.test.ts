import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../env.js', () => ({
  env: {
    NODE_ENV: 'test',
    BASE_URL: 'http://localhost:3000',
    MTX_WEBRTC_PORT: '8889',
    MTX_API_PORT: '9997',
  },
}));

vi.mock('../db/client.js', () => ({ prisma: {} }));
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
  },
  StreamService: vi.fn(),
}));
vi.mock('../services/wsHub.js', () => ({
  wsHub: { broadcast: vi.fn(), addClient: vi.fn() },
}));

import { getSessionUser } from '../services/authService.js';
import { streamService } from '../services/streamService.js';
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

const authHeaders = { headers: { cookie: 'session_id=valid-session' } };

describe('GET /api/stream/state', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().request('/api/stream/state');
    expect(res.status).toBe(401);
  });

  it('returns 200 with StreamState JSON when authenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.mocked(streamService.getState).mockReturnValue({ state: 'live' });
    const res = await createApp().request('/api/stream/state', authHeaders);
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
    const res = await createApp().request('/api/stream/whep', { method: 'POST', body: 'offer' });
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
            Location: '/whep/cam/session-abc',
          },
        }),
      ),
    );

    const res = await createApp().request('/api/stream/whep', {
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

    const res = await createApp().request('/api/stream/whep', {
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
    const res = await createApp().request('/api/stream/whep/session-abc', { method: 'PATCH' });
    expect(res.status).toBe(401);
  });

  it('proxies trickle ICE candidate to mediamtx', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const res = await createApp().request('/api/stream/whep/session-abc', {
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
    const res = await createApp().request('/api/stream/whep/session-abc', { method: 'DELETE' });
    expect(res.status).toBe(401);
  });

  it('proxies session close to mediamtx', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockUser as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    const res = await createApp().request('/api/stream/whep/session-abc', {
      ...authHeaders,
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
  });
});
