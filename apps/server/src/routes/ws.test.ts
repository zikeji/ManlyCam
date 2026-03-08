import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the handler factory passed to upgradeWebSocket so we can invoke
// onOpen / onClose directly in tests without real WS infrastructure.
type WsHandlerFactory = (c: unknown) => {
  onOpen?: (evt: unknown, ws: { send: (data: string) => void }) => void;
  onClose?: (evt: unknown, ws: { send: (data: string) => void }) => void;
};
let capturedFactory: WsHandlerFactory | null = null;

vi.mock('@hono/node-ws', () => ({
  createNodeWebSocket: vi.fn(() => ({
    upgradeWebSocket: (factory: WsHandlerFactory) => {
      capturedFactory = factory;
      // No-op middleware — lifecycle tests invoke onOpen/onClose directly
      return async (_c: unknown, next: () => Promise<void>) => next();
    },
    injectWebSocket: vi.fn(),
    wss: {},
  })),
}));

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
    getState: vi.fn(() => ({ state: 'live' })),
    start: vi.fn(),
    stop: vi.fn(),
  },
  StreamService: vi.fn(),
}));
vi.mock('../services/wsHub.js', () => ({
  wsHub: { broadcast: vi.fn(), addClient: vi.fn() },
}));

import { getSessionUser } from '../services/authService.js';
import { wsHub } from '../services/wsHub.js';
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

const mockBannedUser = { ...mockUser, bannedAt: new Date() };
const authHeaders = { headers: { cookie: 'session_id=valid-session' } };

describe('GET /ws — authentication guard (AC #1)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when no session cookie', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/ws');
    expect(res.status).toBe(401);
  });

  it('returns 401 when user is banned', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(mockBannedUser as never);
    const res = await createApp().app.request('/ws', authHeaders);
    expect(res.status).toBe(401);
  });
});

describe('WS lifecycle — onOpen (AC #2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers client with wsHub on open', () => {
    vi.mocked(wsHub.addClient).mockReturnValue(vi.fn());
    const mockWs = { send: vi.fn() };
    capturedFactory!(null).onOpen!(null, mockWs);
    expect(wsHub.addClient).toHaveBeenCalledOnce();
  });

  it('sends current stream state as the first outbound message', () => {
    vi.mocked(wsHub.addClient).mockReturnValue(vi.fn());
    vi.mocked(streamService.getState).mockReturnValue({ state: 'explicit-offline' });
    const mockWs = { send: vi.fn() };
    capturedFactory!(null).onOpen!(null, mockWs);
    expect(mockWs.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'stream:state', payload: { state: 'explicit-offline' } }),
    );
  });

  it('addClient receives a send fn that forwards to ws.send (AC #3 — broadcast path)', () => {
    let registeredClient: { send: (data: string) => void } | null = null;
    vi.mocked(wsHub.addClient).mockImplementation((client) => {
      registeredClient = client;
      return vi.fn();
    });
    const mockWs = { send: vi.fn() };
    capturedFactory!(null).onOpen!(null, mockWs);

    expect(registeredClient).not.toBeNull();
    registeredClient!.send('hello from broadcast');
    expect(mockWs.send).toHaveBeenCalledWith('hello from broadcast');
  });
});

describe('WS lifecycle — onClose (AC #4)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls dispose fn on close, removing client from hub', () => {
    const dispose = vi.fn();
    vi.mocked(wsHub.addClient).mockReturnValue(dispose);
    const mockWs = { send: vi.fn() };
    const handlers = capturedFactory!(null);
    handlers.onOpen!(null, mockWs);
    handlers.onClose!(null, mockWs);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('does not throw if onClose fires without a prior onOpen (no-op)', () => {
    const mockWs = { send: vi.fn() };
    const handlers = capturedFactory!(null);
    expect(() => handlers.onClose!(null, mockWs)).not.toThrow();
  });
});
