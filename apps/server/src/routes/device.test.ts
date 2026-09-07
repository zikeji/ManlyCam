import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the handler factory passed to upgradeWebSocket so lifecycle tests can
// invoke onOpen / onClose / onMessage directly without real WS infrastructure.
type MockWs = {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};
type WsHandlerFactory = (c: unknown) => {
  onOpen?: (evt: unknown, ws: MockWs) => void;
  onClose?: (evt: unknown, ws: MockWs) => void;
  onMessage?: (evt: { data: string | ArrayBuffer }, ws: MockWs) => void | Promise<void>;
};
let capturedFactory: WsHandlerFactory | null = null;

vi.mock('@hono/node-ws', () => ({
  createNodeWebSocket: vi.fn(() => ({
    upgradeWebSocket: (factory: WsHandlerFactory) => {
      capturedFactory = factory;
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
    FRP_AGENT_PORT: 11937,
    FRP_AGENT_TOKEN: 'test-agent-token',
  },
}));

vi.mock('../services/authService.js', () => ({
  getSessionUser: vi.fn(),
}));

const mockSendAgentShutdown = vi.hoisted(() => vi.fn());
const mockOpenAgentTerminal = vi.hoisted(() => vi.fn());
vi.mock('../lib/agentClient.js', () => ({
  sendAgentShutdown: mockSendAgentShutdown,
  openAgentTerminal: mockOpenAgentTerminal,
}));

vi.mock('../services/wsHub.js', () => ({
  wsHub: { broadcast: vi.fn() },
}));

vi.mock('../db/client.js', () => ({
  prisma: { auditLog: { create: vi.fn() } },
}));

vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => 'test-ulid') }));
vi.mock('../lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

import { getSessionUser } from '../services/authService.js';
import { wsHub } from '../services/wsHub.js';
import { prisma } from '../db/client.js';
import { createApp } from '../app.js';
import { Role } from '@manlycam/types';
import { EventEmitter } from 'node:events';

const adminHeaders = { headers: { cookie: 'session_id=valid-session' } };

function mockSession(role: Role) {
  vi.mocked(getSessionUser).mockResolvedValue({
    id: 'u1',
    role,
    bannedAt: null,
  } as never);
}

class FakeAgentSocket extends EventEmitter {
  sent: (string | Uint8Array)[] = [];
  send(data: string | Uint8Array) {
    this.sent.push(data);
  }
  close() {
    this.emit('close');
  }
}

describe('GET /api/admin/device/status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 for non-admin', async () => {
    mockSession(Role.Moderator);
    const res = await createApp().app.request('/api/admin/device/status', adminHeaders);
    expect(res.status).toBe(403);
  });

  it('returns agentEnabled=true when agent env is configured', async () => {
    mockSession(Role.Admin);
    const res = await createApp().app.request('/api/admin/device/status', adminHeaders);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { agentEnabled: boolean };
    expect(body.agentEnabled).toBe(true);
  });
});

describe('POST /api/admin/device/shutdown', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 for non-admin', async () => {
    mockSession(Role.Moderator);
    const res = await createApp().app.request('/api/admin/device/shutdown', {
      method: 'POST',
      ...adminHeaders,
    });
    expect(res.status).toBe(403);
    expect(mockSendAgentShutdown).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    const res = await createApp().app.request('/api/admin/device/shutdown', { method: 'POST' });
    expect(res.status).toBe(401);
    expect(mockSendAgentShutdown).not.toHaveBeenCalled();
  });

  it('writes an audit log, broadcasts, and returns ok for admin', async () => {
    mockSession(Role.Admin);
    mockSendAgentShutdown.mockResolvedValue(undefined);
    const res = await createApp().app.request('/api/admin/device/shutdown', {
      method: 'POST',
      ...adminHeaders,
    });
    expect(res.status).toBe(200);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { id: 'test-ulid', action: 'device_shutdown', actorId: 'u1', metadata: {} },
    });
    expect(mockSendAgentShutdown).toHaveBeenCalledOnce();
    expect(wsHub.broadcast).toHaveBeenCalledWith({ type: 'device:shutdown', payload: null });
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('records a device_shutdown_failed audit entry (not device_shutdown) when the agent is unreachable', async () => {
    mockSession(Role.Admin);
    mockSendAgentShutdown.mockRejectedValue(new Error('Agent connect timeout'));
    const res = await createApp().app.request('/api/admin/device/shutdown', {
      method: 'POST',
      ...adminHeaders,
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('AGENT_UNREACHABLE');
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        id: 'test-ulid',
        action: 'device_shutdown_failed',
        actorId: 'u1',
        metadata: { reason: 'agent_unreachable' },
      },
    });
    expect(prisma.auditLog.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'device_shutdown' }) }),
    );
    expect(wsHub.broadcast).not.toHaveBeenCalled();
  });

  it('still returns 502 when both the agent and the failure-audit write fail', async () => {
    mockSession(Role.Admin);
    mockSendAgentShutdown.mockRejectedValue(new Error('Agent connect timeout'));
    vi.mocked(prisma.auditLog.create).mockRejectedValueOnce(new Error('db down'));
    const res = await createApp().app.request('/api/admin/device/shutdown', {
      method: 'POST',
      ...adminHeaders,
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('AGENT_UNREACHABLE');
    expect(wsHub.broadcast).not.toHaveBeenCalled();
  });

  it('still returns ok and broadcasts when the success audit write fails', async () => {
    mockSession(Role.Admin);
    mockSendAgentShutdown.mockResolvedValue(undefined);
    vi.mocked(prisma.auditLog.create).mockRejectedValueOnce(new Error('db down'));
    const res = await createApp().app.request('/api/admin/device/shutdown', {
      method: 'POST',
      ...adminHeaders,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(wsHub.broadcast).toHaveBeenCalledWith({ type: 'device:shutdown', payload: null });
  });
});

describe('GET /api/admin/device/terminal', () => {
  let mockWs: MockWs;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWs = { send: vi.fn(), close: vi.fn() };
  });

  it('returns 403 for non-admin', async () => {
    mockSession(Role.Moderator);
    const res = await createApp().app.request('/api/admin/device/terminal', adminHeaders);
    expect(res.status).toBe(403);
  });

  it('closes the browser socket with 4503 when the agent is unreachable', async () => {
    mockSession(Role.Admin);
    mockOpenAgentTerminal.mockRejectedValue(new Error('Agent connect timeout'));
    capturedFactory!({ get: () => undefined }).onOpen!(null, mockWs);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockWs.close).toHaveBeenCalledWith(4503, 'Device offline');
  });

  it('closes the agent immediately when the browser is already closed on ready', async () => {
    mockSession(Role.Admin);
    const agent = new FakeAgentSocket();
    const closeSpy = vi.spyOn(agent, 'close');
    mockOpenAgentTerminal.mockResolvedValue(agent);
    const handlers = capturedFactory!({ get: () => undefined });
    handlers.onClose!(null, mockWs);
    handlers.onOpen!(null, mockWs);
    await Promise.resolve();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('relays agent binary and text frames to the browser', async () => {
    mockSession(Role.Admin);
    const agent = new FakeAgentSocket();
    mockOpenAgentTerminal.mockResolvedValue(agent);
    capturedFactory!({ get: () => undefined }).onOpen!(null, mockWs);
    await Promise.resolve();

    agent.emit('message', Buffer.from([1, 2, 3]), true);
    agent.emit('message', Buffer.from(JSON.stringify({ type: 'ready' })), false);

    expect(mockWs.send).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ready' }));
  });

  it('closes the browser when the agent closes or errors', async () => {
    mockSession(Role.Admin);
    const agent = new FakeAgentSocket();
    mockOpenAgentTerminal.mockResolvedValue(agent);
    capturedFactory!({ get: () => undefined }).onOpen!(null, mockWs);
    await Promise.resolve();

    agent.emit('error', new Error('socket error'));
    expect(mockWs.close).toHaveBeenCalled();

    mockWs.close.mockClear();
    const agent2 = new FakeAgentSocket();
    mockWs.send.mockClear();
    mockOpenAgentTerminal.mockResolvedValue(agent2);
    capturedFactory!({ get: () => undefined }).onOpen!(null, mockWs);
    await Promise.resolve();
    agent2.emit('close');
    expect(mockWs.close).toHaveBeenCalled();
  });

  it('forwards input and resize frames to the agent, drops others and malformed', async () => {
    mockSession(Role.Admin);
    const agent = new FakeAgentSocket();
    mockOpenAgentTerminal.mockResolvedValue(agent);
    const handlers = capturedFactory!({ get: () => undefined });
    handlers.onOpen!(null, mockWs);
    await Promise.resolve();

    handlers.onMessage!({ data: JSON.stringify({ type: 'input', data: 'ls\n' }) }, mockWs);
    handlers.onMessage!({ data: JSON.stringify({ type: 'resize', cols: 80, rows: 24 }) }, mockWs);
    handlers.onMessage!({ data: JSON.stringify({ type: 'shutdown' }) }, mockWs);
    handlers.onMessage!({ data: 'not-json{{' }, mockWs);
    handlers.onMessage!({ data: new ArrayBuffer(4) }, mockWs);

    expect(agent.sent).toEqual([
      JSON.stringify({ type: 'input', data: 'ls\n' }),
      JSON.stringify({ type: 'resize', cols: 80, rows: 24 }),
    ]);
  });

  it('drops frames after the browser closes and closes the agent', async () => {
    mockSession(Role.Admin);
    const agent = new FakeAgentSocket();
    mockOpenAgentTerminal.mockResolvedValue(agent);
    const handlers = capturedFactory!({ get: () => undefined });
    handlers.onOpen!(null, mockWs);
    await Promise.resolve();

    handlers.onClose!(null, mockWs);
    handlers.onMessage!({ data: JSON.stringify({ type: 'input', data: 'x' }) }, mockWs);
    // Agent frames arriving after browser close must be dropped without sending
    agent.emit('message', Buffer.from('late'), false);
    expect(mockWs.send).not.toHaveBeenCalled();
    expect(agent.sent).toEqual([]);
  });

  it('closes the agent when ws.send throws mid-relay', async () => {
    mockSession(Role.Admin);
    const agent = new FakeAgentSocket();
    const closeSpy = vi.spyOn(agent, 'close');
    mockOpenAgentTerminal.mockResolvedValue(agent);
    mockWs.send.mockImplementation(() => {
      throw new Error('socket gone');
    });
    capturedFactory!({ get: () => undefined }).onOpen!(null, mockWs);
    await Promise.resolve();

    agent.emit('message', Buffer.from('x'), false);
    expect(closeSpy).toHaveBeenCalled();
  });

  it('swallows errors when closing an already-dead browser socket', async () => {
    mockSession(Role.Admin);
    const agent = new FakeAgentSocket();
    mockOpenAgentTerminal.mockResolvedValue(agent);
    mockWs.close.mockImplementation(() => {
      throw new Error('already closed');
    });
    capturedFactory!({ get: () => undefined }).onOpen!(null, mockWs);
    await Promise.resolve();

    expect(() => agent.emit('error', new Error('socket error'))).not.toThrow();
  });
});
