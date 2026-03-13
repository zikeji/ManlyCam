import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('../env.js', () => ({
  env: {
    FRP_HOST: 'frps',
  },
}));

// Mock the net module
const mockSocket = {
  connect: vi.fn(),
  on: vi.fn(),
  write: vi.fn(),
  destroy: vi.fn(),
  destroyed: false,
  writable: true,
};

vi.mock('node:net', () => ({
  createConnection: vi.fn(() => mockSocket),
}));

import * as net from 'node:net';
import { PiSugarService, pisugarStatus } from './pisugar.js';

// Helper: get all registered handlers for a given event
function getHandler(event: string): ((...args: unknown[]) => void) | undefined {
  const calls = (mockSocket.on as ReturnType<typeof vi.fn>).mock.calls;
  const match = calls.findLast((c: unknown[]) => c[0] === event);
  return match ? (match[1] as (...args: unknown[]) => void) : undefined;
}

describe('PiSugarService', () => {
  let service: PiSugarService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.destroyed = false;
    mockSocket.writable = true;
    service = new PiSugarService(8424);
  });

  afterEach(() => {
    service.stop();
  });

  describe('start()', () => {
    it('calls net.createConnection with configured port and FRP_HOST', () => {
      service.start();
      expect(net.createConnection).toHaveBeenCalledWith(8424, 'frps');
    });

    it('does not reconnect if already running', () => {
      service.start();
      service.start();
      expect(net.createConnection).toHaveBeenCalledTimes(1);
    });

    it('start(port) overrides constructor port', () => {
      service.start(9999);
      expect(net.createConnection).toHaveBeenCalledWith(9999, 'frps');
    });

    it('registers connect, data, error, close handlers', () => {
      service.start();
      const events = (mockSocket.on as ReturnType<typeof vi.fn>).mock.calls.map(
        (c: unknown[]) => c[0],
      );
      expect(events).toContain('connect');
      expect(events).toContain('data');
      expect(events).toContain('error');
      expect(events).toContain('close');
    });
  });

  describe('stop()', () => {
    it('destroys the socket on stop', () => {
      service.start();
      service.stop();
      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it('stop does not throw if never started', () => {
      expect(() => service.stop()).not.toThrow();
    });
  });

  describe('TCP connection failure', () => {
    it('emits { connected: false } when close event fires', () => {
      const statuses: unknown[] = [];
      pisugarStatus.on('pisugarStatus', (s) => statuses.push(s));

      service.start();
      const closeHandler = getHandler('close');
      closeHandler?.();

      expect(statuses).toContainEqual({ connected: false });
      pisugarStatus.removeAllListeners('pisugarStatus');
    });

    it('emits { connected: false } when error event fires', () => {
      const statuses: unknown[] = [];
      pisugarStatus.on('pisugarStatus', (s) => statuses.push(s));

      service.start();
      // error fires (rejects pending sendCommand, then close fires handleDisconnect)
      const errorHandler = getHandler('error');
      errorHandler?.(new Error('ECONNREFUSED'));
      const closeHandler = getHandler('close');
      closeHandler?.();

      expect(statuses).toContainEqual({ connected: false });
      pisugarStatus.removeAllListeners('pisugarStatus');
    });

    it('schedules exponential backoff reconnect after disconnect', () => {
      vi.useFakeTimers();
      service.start();

      const closeHandler = getHandler('close');
      closeHandler?.();

      // After 1s the reconnect fires (initial delay)
      vi.advanceTimersByTime(1_000);
      expect(net.createConnection).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('reconnect delay doubles on each failure (exponential backoff)', () => {
      vi.useFakeTimers();
      service.start();

      for (let attempt = 0; attempt < 3; attempt++) {
        const closeHandler = getHandler('close');
        closeHandler?.();
        vi.clearAllMocks(); // reset createConnection call count
        // Advance by the current expected delay
        const delay = Math.min(1_000 * Math.pow(2, attempt), 60_000);
        vi.advanceTimersByTime(delay);
        expect(net.createConnection).toHaveBeenCalledTimes(1);
      }

      vi.useRealTimers();
    });

    it('caps reconnect delay at 60 seconds', () => {
      vi.useFakeTimers();
      service.start();

      // Simulate enough failures to exceed the cap
      for (let i = 0; i < 10; i++) {
        const closeHandler = getHandler('close');
        closeHandler?.();
        vi.advanceTimersByTime(60_000);
      }
      // Should still reconnect (not throw or hang)
      expect(net.createConnection).toHaveBeenCalledTimes(11);

      vi.useRealTimers();
    });
  });

  describe('command parsing (poll)', () => {
    it('emits connected status with parsed battery values', async () => {
      const statuses: unknown[] = [];
      pisugarStatus.on('pisugarStatus', (s) => statuses.push(s));

      service.start();

      // Simulate connect event
      const connectHandler = getHandler('connect');
      connectHandler?.();

      // poll() is called — it sends 4 commands sequentially
      // Simulate data responses for each command
      const dataHandler = getHandler('data');

      // Each sendCommand resolves when a newline-delimited line arrives
      // We simulate by triggering data events synchronously

      // Give poll() a tick to reach the first sendCommand
      await Promise.resolve();
      dataHandler?.(Buffer.from('battery: 85.5\n'));
      await Promise.resolve();
      dataHandler?.(Buffer.from('battery_power_plugged: false\n'));
      await Promise.resolve();
      dataHandler?.(Buffer.from('battery_allow_charging: false\n'));
      await Promise.resolve();
      dataHandler?.(Buffer.from('battery_charging_range: 80 90\n'));
      await Promise.resolve();

      expect(statuses).toContainEqual({
        connected: true,
        level: 85.5,
        plugged: false,
        charging: false,
        chargingRange: [80, 90],
      });

      pisugarStatus.removeAllListeners('pisugarStatus');
    });

    it('parses comma-separated charging range (actual PiSugar format)', async () => {
      const statuses: unknown[] = [];
      pisugarStatus.on('pisugarStatus', (s) => statuses.push(s));

      service.start();
      const connectHandler = getHandler('connect');
      connectHandler?.();
      const dataHandler = getHandler('data');

      await Promise.resolve();
      dataHandler?.(Buffer.from('battery: 91.71799\n'));
      await Promise.resolve();
      dataHandler?.(Buffer.from('battery_power_plugged: true\n'));
      await Promise.resolve();
      dataHandler?.(Buffer.from('battery_allow_charging: false\n'));
      await Promise.resolve();
      dataHandler?.(Buffer.from('battery_charging_range: 90,100\n'));
      await Promise.resolve();

      expect(statuses).toContainEqual({
        connected: true,
        level: 91.71799,
        plugged: true,
        charging: false,
        chargingRange: [90, 100],
      });

      pisugarStatus.removeAllListeners('pisugarStatus');
    });

    it('parses raw values (no key prefix format)', async () => {
      const statuses: unknown[] = [];
      pisugarStatus.on('pisugarStatus', (s) => statuses.push(s));

      service.start();
      const connectHandler = getHandler('connect');
      connectHandler?.();
      const dataHandler = getHandler('data');

      await Promise.resolve();
      dataHandler?.(Buffer.from('75\n'));
      await Promise.resolve();
      dataHandler?.(Buffer.from('1\n'));
      await Promise.resolve();
      dataHandler?.(Buffer.from('1\n'));
      await Promise.resolve();
      dataHandler?.(Buffer.from('70 85\n'));
      await Promise.resolve();

      expect(statuses).toContainEqual({
        connected: true,
        level: 75,
        plugged: true,
        charging: true,
        chargingRange: [70, 85],
      });

      pisugarStatus.removeAllListeners('pisugarStatus');
    });

    it('parses boolean "true"/"false" string values', async () => {
      const statuses: unknown[] = [];
      pisugarStatus.on('pisugarStatus', (s) => statuses.push(s));

      service.start();
      const connectHandler = getHandler('connect');
      connectHandler?.();
      const dataHandler = getHandler('data');

      await Promise.resolve();
      dataHandler?.(Buffer.from('60\n'));
      await Promise.resolve();
      dataHandler?.(Buffer.from('true\n'));
      await Promise.resolve();
      dataHandler?.(Buffer.from('false\n'));
      await Promise.resolve();
      dataHandler?.(Buffer.from('\n')); // empty range → null
      await Promise.resolve();

      const found = (
        statuses as Array<{
          connected: boolean;
          plugged?: boolean;
          charging?: boolean;
          chargingRange?: unknown;
        }>
      ).find((s) => s.connected === true);
      expect(found?.plugged).toBe(true);
      expect(found?.charging).toBe(false);
      expect(found?.chargingRange).toBeNull();

      pisugarStatus.removeAllListeners('pisugarStatus');
    });

    it('sends correct command strings to socket', async () => {
      service.start();
      const connectHandler = getHandler('connect');
      connectHandler?.();

      const dataHandler = getHandler('data');

      await Promise.resolve();
      dataHandler?.(Buffer.from('80\n'));
      await Promise.resolve();
      dataHandler?.(Buffer.from('0\n'));
      await Promise.resolve();
      dataHandler?.(Buffer.from('0\n'));
      await Promise.resolve();
      dataHandler?.(Buffer.from('\n'));
      await Promise.resolve();

      const writes = (mockSocket.write as ReturnType<typeof vi.fn>).mock.calls.map(
        (c: unknown[]) => c[0],
      );
      expect(writes).toContain('get battery\n');
      expect(writes).toContain('get battery_power_plugged\n');
      expect(writes).toContain('get battery_allow_charging\n');
      expect(writes).toContain('get battery_charging_range\n');
    });

    it('rejects sendCommand if socket is not writable', async () => {
      mockSocket.destroyed = true;
      service.start();
      const connectHandler = getHandler('connect');
      connectHandler?.();

      // poll() should swallow the error (not throw)
      await expect(service.poll()).resolves.toBeUndefined();
    });
  });

  describe('pisugarStatus event emitter', () => {
    it('is an EventEmitter', () => {
      expect(pisugarStatus).toBeInstanceOf(EventEmitter);
    });
  });
});
