import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { FakeWebSocket, wsInstances } = vi.hoisted(() => {
  const instances: FakeWsImpl[] = [];
  class FakeWsImpl {
    listeners = new Map<string, ((...args: unknown[]) => void)[]>();
    sent: string[] = [];
    openSent = false;
    constructor(public url: string) {
      instances.push(this as never);
    }
    on(event: string, cb: (...args: unknown[]) => void) {
      const list = this.listeners.get(event) ?? [];
      list.push(cb);
      this.listeners.set(event, list);
    }
    removeAllListeners(event?: string) {
      if (event) this.listeners.delete(event);
      else this.listeners.clear();
    }
    emit(event: string, ...args: unknown[]) {
      for (const cb of this.listeners.get(event) ?? []) cb(...args);
    }
    send(data: string) {
      this.sent.push(data);
    }
    terminate() {
      this.emit('close');
    }
    close() {
      this.emit('close');
    }
    // Test helpers
    simulateOpen() {
      this.openSent = true;
      this.emit('open');
    }
    simulateMessage(msg: unknown) {
      this.emit('message', Buffer.from(JSON.stringify(msg)));
    }
    simulateRawMessage(raw: string) {
      this.emit('message', Buffer.from(raw));
    }
  }
  return { FakeWebSocket: FakeWsImpl, wsInstances: instances };
});

vi.mock('ws', () => ({
  default: FakeWebSocket,
}));

vi.mock('../env.js', () => ({
  env: { FRP_HOST: 'localhost', FRP_AGENT_PORT: 11937, FRP_AGENT_TOKEN: 'secret-token' },
}));

import { openAgentTerminal, sendAgentShutdown } from './agentClient.js';
import { env } from '../env.js';

describe('agentClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wsInstances.length = 0;
    vi.useFakeTimers();
    env.FRP_AGENT_PORT = 11937;
    env.FRP_AGENT_TOKEN = 'secret-token';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('openAgentTerminal', () => {
    it('rejects immediately when the agent is not configured', async () => {
      env.FRP_AGENT_PORT = undefined;
      await expect(openAgentTerminal()).rejects.toThrow('Agent not configured');
      env.FRP_AGENT_PORT = 11937;
    });

    it('auths on open and resolves on ready', async () => {
      const promise = openAgentTerminal();
      const ws = wsInstances[0];
      expect(ws.url).toBe('ws://localhost:11937');
      ws.simulateOpen();
      expect(JSON.parse(ws.sent[0])).toEqual({ type: 'auth', token: 'secret-token' });
      ws.simulateMessage({ type: 'ready' });
      await expect(promise).resolves.toBe(ws);
    });

    it('rejects when agent replies with error', async () => {
      const promise = openAgentTerminal();
      const ws = wsInstances[0];
      ws.simulateOpen();
      ws.simulateMessage({ type: 'error', message: 'bad token' });
      await expect(promise).rejects.toThrow('Agent auth failed: bad token');
    });

    it('ignores malformed frames while waiting for ready', async () => {
      const promise = openAgentTerminal();
      const ws = wsInstances[0];
      ws.simulateOpen();
      ws.simulateRawMessage('not-json{{');
      ws.simulateMessage({ type: 'ready' });
      await expect(promise).resolves.toBe(ws);
    });

    it('rejects on connect timeout', async () => {
      const promise = openAgentTerminal();
      const expectation = expect(promise).rejects.toThrow('Agent connect timeout');
      await vi.advanceTimersByTimeAsync(5_001);
      await expectation;
    });

    it('rejects on auth timeout after open', async () => {
      const promise = openAgentTerminal();
      const ws = wsInstances[0];
      ws.simulateOpen();
      const expectation = expect(promise).rejects.toThrow('Agent auth timeout');
      await vi.advanceTimersByTimeAsync(10_001);
      await expectation;
    });

    it('rejects when connection closes before ready', async () => {
      const promise = openAgentTerminal();
      const ws = wsInstances[0];
      ws.emit('close');
      await expect(promise).rejects.toThrow('Agent connection closed before ready');
    });

    it('rejects on socket error', async () => {
      const promise = openAgentTerminal();
      const ws = wsInstances[0];
      ws.emit('error', new Error('ECONNREFUSED'));
      await expect(promise).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('sendAgentShutdown', () => {
    it('sends shutdown and resolves on shutting-down ack', async () => {
      const promise = sendAgentShutdown();
      const ws = wsInstances[0];
      ws.simulateOpen();
      ws.simulateMessage({ type: 'ready' });
      await Promise.resolve();
      expect(JSON.parse(ws.sent[ws.sent.length - 1])).toEqual({ type: 'shutdown' });
      ws.simulateMessage({ type: 'shutting-down' });
      await expect(promise).resolves.toBeUndefined();
    });

    it('resolves when the socket closes without ack (poweroff teardown)', async () => {
      const promise = sendAgentShutdown();
      const ws = wsInstances[0];
      ws.simulateOpen();
      ws.simulateMessage({ type: 'ready' });
      await Promise.resolve();
      ws.emit('close');
      await expect(promise).resolves.toBeUndefined();
    });

    it('ignores duplicate frames once settled', async () => {
      const promise = sendAgentShutdown();
      const ws = wsInstances[0];
      ws.simulateOpen();
      ws.simulateMessage({ type: 'ready' });
      await Promise.resolve();
      ws.simulateMessage({ type: 'shutting-down' });
      await expect(promise).resolves.toBeUndefined();
      // Late frames after settlement must not throw or double-resolve
      ws.simulateMessage({ type: 'shutting-down' });
      ws.simulateMessage({ type: 'error', message: 'late' });
      ws.emit('error', new Error('late error'));
    });

    it('rejects when agent reports shutdown error', async () => {
      const promise = sendAgentShutdown();
      const ws = wsInstances[0];
      ws.simulateOpen();
      ws.simulateMessage({ type: 'ready' });
      await Promise.resolve();
      ws.simulateMessage({ type: 'error', message: 'sudo failed' });
      await expect(promise).rejects.toThrow('Agent shutdown failed: sudo failed');
      // Late ack after rejection must not throw
      ws.simulateMessage({ type: 'shutting-down' });
    });

    it('ignores malformed frames while waiting for ack', async () => {
      const promise = sendAgentShutdown();
      const ws = wsInstances[0];
      ws.simulateOpen();
      ws.simulateMessage({ type: 'ready' });
      await Promise.resolve();
      ws.simulateRawMessage('garbage{');
      ws.simulateMessage({ type: 'shutting-down' });
      await expect(promise).resolves.toBeUndefined();
    });

    it('rejects on socket error while waiting for ack', async () => {
      const promise = sendAgentShutdown();
      const ws = wsInstances[0];
      ws.simulateOpen();
      ws.simulateMessage({ type: 'ready' });
      await Promise.resolve();
      ws.emit('error', new Error('reset during shutdown'));
      await expect(promise).rejects.toThrow('reset during shutdown');
    });

    it('rejects on shutdown ack timeout', async () => {
      const promise = sendAgentShutdown();
      const ws = wsInstances[0];
      ws.simulateOpen();
      ws.simulateMessage({ type: 'ready' });
      await Promise.resolve();
      // Suppress the close triggered by terminate so the timeout path is observed
      const expectation = expect(promise).rejects.toThrow('Agent shutdown ack timeout');
      ws.removeAllListeners('close');
      await vi.advanceTimersByTimeAsync(5_001);
      await expectation;
    });
  });
});
