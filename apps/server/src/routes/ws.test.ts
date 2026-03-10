import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the handler factory passed to upgradeWebSocket so we can invoke
// onOpen / onClose / onMessage directly in tests without real WS infrastructure.
type MockWs = { send: ReturnType<typeof vi.fn> };
type WsHandlerFactory = (c: unknown) => {
  onOpen?: (evt: unknown, ws: MockWs) => void;
  onClose?: (evt: unknown, ws: MockWs) => void;
  onMessage?: (evt: { data: string }, ws: MockWs) => void;
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
vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => 'test-conn-id') }));
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
  wsHub: {
    broadcast: vi.fn(),
    addClient: vi.fn(),
    broadcastExcept: vi.fn(),
    getPresenceList: vi.fn(() => []),
  },
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

const mockContext = {
  get: vi.fn((key: string) => (key === 'user' ? mockUser : undefined)),
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

describe('WS lifecycle — onOpen (AC #2, #3)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers client with wsHub on open', () => {
    vi.mocked(wsHub.addClient).mockReturnValue(vi.fn());
    const mockWs = { send: vi.fn() };
    capturedFactory!(mockContext).onOpen!(null, mockWs);
    expect(wsHub.addClient).toHaveBeenCalledOnce();
  });

  it('addClient receives connectionId, send fn, and userPresence', () => {
    vi.mocked(wsHub.addClient).mockReturnValue(vi.fn());
    const mockWs = { send: vi.fn() };
    capturedFactory!(mockContext).onOpen!(null, mockWs);
    expect(wsHub.addClient).toHaveBeenCalledWith(
      'test-conn-id',
      expect.objectContaining({ send: expect.any(Function) }),
      expect.objectContaining({ id: 'user-001', displayName: 'Test User', role: 'ViewerCompany' }),
    );
  });

  it('broadcasts presence:join to other clients via broadcastExcept', () => {
    vi.mocked(wsHub.addClient).mockReturnValue(vi.fn());
    const mockWs = { send: vi.fn() };
    capturedFactory!(mockContext).onOpen!(null, mockWs);
    expect(wsHub.broadcastExcept).toHaveBeenCalledWith(
      'test-conn-id',
      expect.objectContaining({
        type: 'presence:join',
        payload: expect.objectContaining({ id: 'user-001' }),
      }),
    );
  });

  it('sends presence:seed to new client', () => {
    vi.mocked(wsHub.addClient).mockReturnValue(vi.fn());
    vi.mocked(wsHub.getPresenceList).mockReturnValue([
      {
        id: 'user-001',
        displayName: 'Test User',
        avatarUrl: null,
        role: 'ViewerCompany',
        isMuted: false,
        userTag: null,
      },
    ]);
    const mockWs = { send: vi.fn() };
    capturedFactory!(mockContext).onOpen!(null, mockWs);
    const calls = mockWs.send.mock.calls.map((c) => JSON.parse(c[0]));
    const seed = calls.find((m) => m.type === 'presence:seed');
    expect(seed).toBeDefined();
    expect(seed.payload).toHaveLength(1);
  });

  it('sends current stream state as an outbound message', () => {
    vi.mocked(wsHub.addClient).mockReturnValue(vi.fn());
    vi.mocked(streamService.getState).mockReturnValue({ state: 'explicit-offline' });
    const mockWs = { send: vi.fn() };
    capturedFactory!(mockContext).onOpen!(null, mockWs);
    const calls = mockWs.send.mock.calls.map((c) => JSON.parse(c[0]));
    const state = calls.find((m) => m.type === 'stream:state');
    expect(state).toEqual({ type: 'stream:state', payload: { state: 'explicit-offline' } });
  });

  it('addClient receives a send fn that forwards to ws.send', () => {
    let registeredClient: { send: (data: string) => void } | null = null;
    vi.mocked(wsHub.addClient).mockImplementation((_id, client) => {
      registeredClient = client;
      return vi.fn();
    });
    const mockWs = { send: vi.fn() };
    capturedFactory!(mockContext).onOpen!(null, mockWs);

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
    const handlers = capturedFactory!(mockContext);
    handlers.onOpen!(null, mockWs);
    handlers.onClose!(null, mockWs);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('broadcasts presence:leave with correct userId on close', () => {
    vi.mocked(wsHub.addClient).mockReturnValue(vi.fn());
    const mockWs = { send: vi.fn() };
    const handlers = capturedFactory!(mockContext);
    handlers.onOpen!(null, mockWs);
    vi.clearAllMocks();
    handlers.onClose!(null, mockWs);
    expect(wsHub.broadcast).toHaveBeenCalledWith({
      type: 'presence:leave',
      payload: { userId: 'user-001' },
    });
  });

  it('does not throw if onClose fires without a prior onOpen (no-op)', () => {
    const mockWs = { send: vi.fn() };
    const handlers = capturedFactory!(mockContext);
    expect(() => handlers.onClose!(null, mockWs)).not.toThrow();
  });
});

describe('WS onMessage — typing relay (AC #5)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('typing:start → broadcastExcept called with userId and displayName', () => {
    vi.mocked(wsHub.addClient).mockReturnValue(vi.fn());
    const mockWs = { send: vi.fn() };
    const handlers = capturedFactory!(mockContext);
    handlers.onOpen!(null, mockWs);
    vi.clearAllMocks();

    handlers.onMessage!({ data: JSON.stringify({ type: 'typing:start' }) }, mockWs);
    expect(wsHub.broadcastExcept).toHaveBeenCalledWith('test-conn-id', {
      type: 'typing:start',
      payload: { userId: 'user-001', displayName: 'Test User' },
    });
  });

  it('typing:stop → broadcastExcept called with userId', () => {
    vi.mocked(wsHub.addClient).mockReturnValue(vi.fn());
    const mockWs = { send: vi.fn() };
    const handlers = capturedFactory!(mockContext);
    handlers.onOpen!(null, mockWs);
    vi.clearAllMocks();

    handlers.onMessage!({ data: JSON.stringify({ type: 'typing:stop' }) }, mockWs);
    expect(wsHub.broadcastExcept).toHaveBeenCalledWith('test-conn-id', {
      type: 'typing:stop',
      payload: { userId: 'user-001' },
    });
  });

  it('unknown type → broadcastExcept NOT called', () => {
    vi.mocked(wsHub.addClient).mockReturnValue(vi.fn());
    const mockWs = { send: vi.fn() };
    const handlers = capturedFactory!(mockContext);
    handlers.onOpen!(null, mockWs);
    vi.clearAllMocks();

    handlers.onMessage!({ data: JSON.stringify({ type: 'chat:message' }) }, mockWs);
    expect(wsHub.broadcastExcept).not.toHaveBeenCalled();
  });

  it('malformed JSON → does not throw', () => {
    vi.mocked(wsHub.addClient).mockReturnValue(vi.fn());
    const mockWs = { send: vi.fn() };
    const handlers = capturedFactory!(mockContext);
    handlers.onOpen!(null, mockWs);
    expect(() => handlers.onMessage!({ data: 'not-json{{{' }, mockWs)).not.toThrow();
  });
});
