import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./wsHub.js', () => ({
  wsHub: { broadcast: vi.fn() },
}));
vi.mock('../env.js', () => ({
  env: {
    FRP_HOST: 'frps',
    FRP_RTSP_PORT: '11935',
    FRP_API_PORT: '7400',
    MTX_API_URL: 'http://127.0.0.1:9997',
    MTX_WEBRTC_URL: 'http://127.0.0.1:8888',
  },
}));
vi.mock('../db/client.js', () => ({
  prisma: {
    streamConfig: {
      upsert: vi.fn().mockResolvedValue({ id: 'cfg', adminToggle: 'live' }),
    },
    cameraSettings: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { wsHub } from './wsHub.js';
import { prisma } from '../db/client.js';
import { StreamService } from './streamService.js';
import { logger } from '../lib/logger.js';

describe('StreamService state machine', () => {
  let service: StreamService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StreamService();
  });

  afterEach(() => {
    service.stop();
  });

  it('initial state is unreachable with adminToggle live', () => {
    expect(service.getState()).toEqual({ state: 'unreachable', adminToggle: 'live' });
  });

  it('setAdminToggle offline → explicit-offline (piReachable: false when Pi not yet polled)', async () => {
    await service.setAdminToggle('offline');
    expect(service.getState()).toEqual({ state: 'explicit-offline', piReachable: false });
    expect(vi.mocked(wsHub.broadcast)).toHaveBeenCalledWith({
      type: 'stream:state',
      payload: { state: 'explicit-offline', piReachable: false },
    });
  });

  it('explicit-offline includes piReachable: true when Pi is reachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ready: true }) }),
    );
    await service.pollMediamtxState();
    await service.setAdminToggle('offline');
    expect(service.getState()).toEqual({ state: 'explicit-offline', piReachable: true });
    expect(vi.mocked(wsHub.broadcast)).toHaveBeenLastCalledWith({
      type: 'stream:state',
      payload: { state: 'explicit-offline', piReachable: true },
    });
    vi.unstubAllGlobals();
  });

  it('setAdminToggle live while piReachable=false → unreachable', async () => {
    await service.setAdminToggle('offline');
    await service.setAdminToggle('live');
    expect(service.getState()).toEqual({ state: 'unreachable', adminToggle: 'live' });
  });

  it('pollMediamtxState: ready=true → state becomes live and broadcasts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ready: true }) }),
    );
    await service.pollMediamtxState();
    expect(service.getState()).toEqual({ state: 'live' });
    expect(vi.mocked(wsHub.broadcast)).toHaveBeenCalledWith({
      type: 'stream:state',
      payload: { state: 'live' },
    });
    vi.unstubAllGlobals();
  });

  it('pollMediamtxState: ready=false after live → state becomes unreachable and broadcasts', async () => {
    // First bring to live
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ready: true }) }),
    );
    await service.pollMediamtxState();
    expect(service.getState()).toEqual({ state: 'live' });

    vi.mocked(wsHub.broadcast).mockClear();

    // Then go unreachable
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ready: false }) }),
    );
    await service.pollMediamtxState();
    expect(service.getState()).toEqual({ state: 'unreachable', adminToggle: 'live' });
    expect(vi.mocked(wsHub.broadcast)).toHaveBeenCalledWith({
      type: 'stream:state',
      payload: { state: 'unreachable', adminToggle: 'live' },
    });
    vi.unstubAllGlobals();
  });

  it('pollMediamtxState: fetch throws → state stays unreachable, no broadcast', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await service.pollMediamtxState();
    expect(service.getState()).toEqual({ state: 'unreachable', adminToggle: 'live' });
    expect(vi.mocked(wsHub.broadcast)).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('pollMediamtxState: fetch returns non-ok status → state becomes unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await service.pollMediamtxState();
    expect(service.getState()).toEqual({ state: 'unreachable', adminToggle: 'live' });
    vi.unstubAllGlobals();
  });

  it('stop() sets stopped flag and does not throw', async () => {
    await service.start();
    expect(() => service.stop()).not.toThrow();
  });

  it('start() catches and logs error if pollLoop throws', async () => {
    vi.spyOn(service as never, 'pollLoop').mockRejectedValueOnce(new Error('poll error'));
    const errorSpy = vi.spyOn(logger, 'error');
    await service.start();
    // Wait for the promise to reject and be caught
    await new Promise((r) => setTimeout(r, 0));
    expect(errorSpy).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'mediamtx poll loop exited unexpectedly',
    );
  });

  it('pollLoop polls mediamtx state periodically', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ready: true }) }),
    );

    // Start the service, which calls pollLoop
    const startPromise = service.start();

    // Fast-forward past initial 3000ms delay
    await vi.advanceTimersByTimeAsync(3000);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Fast-forward past 2000ms delay
    await vi.advanceTimersByTimeAsync(2000);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    service.stop();
    await vi.advanceTimersByTimeAsync(2000); // Let the loop exit
    await startPromise;

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('isPiReachable returns piReachable state', async () => {
    expect(service.isPiReachable()).toBe(false);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ready: true }) }),
    );
    await service.pollMediamtxState();
    expect(service.isPiReachable()).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe('StreamService camera reapply', () => {
  let service: StreamService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StreamService();
  });

  afterEach(() => {
    service.stop();
  });

  it('pollMediamtxState: transition from unreachable to live triggers reapplyCameraSettings', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const mockFetch = vi.mocked(global.fetch);

    // First poll: ready=false (unreachable)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ready: false }),
    } as never);
    await service.pollMediamtxState();
    expect(service.isPiReachable()).toBe(false);

    // Clear mock to track the reapply fetch calls
    mockFetch.mockClear();

    // Setup prisma with camera settings
    vi.mocked(prisma.cameraSettings.findMany).mockResolvedValueOnce([
      { key: 'rpiCameraBrightness', value: '0.5', updatedAt: new Date() },
    ] as never);

    // Second poll: ready=true (transitioned to reachable) — triggers reapply
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ready: true }),
    } as never);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '{}',
    } as never);

    await service.pollMediamtxState();
    expect(service.isPiReachable()).toBe(true);

    // Wait a bit for the async reapply to execute
    await new Promise((r) => setTimeout(r, 50));

    // Verify the reapply PATCH was called
    const calls = mockFetch.mock.calls;
    const patchCall = calls.find((c) => String(c[0]).includes('/v3/config/paths/patch/cam'));
    expect(patchCall).toBeDefined();
    if (patchCall) {
      expect(patchCall[1]?.method).toBe('PATCH');
    }

    vi.unstubAllGlobals();
  });

  it('reapply logs error if camera settings fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const mockFetch = vi.mocked(global.fetch);

    // Transition to live and trigger reapply
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ready: true }),
    } as never);

    // Make prisma.findMany throw
    vi.mocked(prisma.cameraSettings.findMany).mockRejectedValueOnce(
      new Error('DB connection error'),
    );

    await service.pollMediamtxState();

    // Wait for async reapply
    await new Promise((r) => setTimeout(r, 50));

    // Should still transition to reachable despite reapply error
    expect(service.isPiReachable()).toBe(true);

    vi.unstubAllGlobals();
  });

  it('reapply logs warning if fetch returns non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const mockFetch = vi.mocked(global.fetch);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ready: true }),
    } as never);

    vi.mocked(prisma.cameraSettings.findMany).mockResolvedValueOnce([
      { key: 'rpiCameraBrightness', value: '0.5', updatedAt: new Date() },
    ] as never);

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as never);

    const warnSpy = vi.spyOn(logger, 'warn');

    await service.pollMediamtxState();
    await new Promise((r) => setTimeout(r, 50));

    expect(warnSpy).toHaveBeenCalledWith(
      { status: 500 },
      'stream: failed to re-apply camera settings on reconnect',
    );

    vi.unstubAllGlobals();
  });

  it('reapply skips if no camera settings exist', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const mockFetch = vi.mocked(global.fetch);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ready: true }),
    } as never);

    vi.mocked(prisma.cameraSettings.findMany).mockResolvedValueOnce([] as never);

    await service.pollMediamtxState();
    await new Promise((r) => setTimeout(r, 50));

    // Should only call fetch once for the state check, not the reapply
    const calls = mockFetch.mock.calls;
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toContain('/v3/paths/get/cam');

    vi.unstubAllGlobals();
  });

  it('updateReachable catches and logs error if reapplyCameraSettings throws', async () => {
    vi.spyOn(service as never, 'reapplyCameraSettings').mockRejectedValueOnce(
      new Error('reapply error'),
    );
    const errorSpy = vi.spyOn(logger, 'error');

    // Trigger updateReachable(true)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ready: true }) }),
    );
    await service.pollMediamtxState();

    // Wait for the promise to reject and be caught
    await new Promise((r) => setTimeout(r, 0));
    expect(errorSpy).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'stream: reapplyCameraSettings rejected unexpectedly',
    );
    vi.unstubAllGlobals();
  });
});
