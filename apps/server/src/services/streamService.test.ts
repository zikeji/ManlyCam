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
vi.mock('../lib/stream-config.js', () => ({
  streamConfig: {
    get: vi.fn().mockResolvedValue('live'),
    getMany: vi.fn().mockResolvedValue({
      offlineEmoji: null,
      offlineTitle: null,
      offlineDescription: null,
    }),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => 'test-ulid') }));
vi.mock('../db/client.js', () => ({
  prisma: {
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    cameraSettings: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { wsHub } from './wsHub.js';
import { prisma } from '../db/client.js';
import { streamConfig } from '../lib/stream-config.js';
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
    expect(service.getState()).toEqual({
      state: 'unreachable',
      adminToggle: 'live',
    });
  });

  it('setAdminToggle offline → explicit-offline (piReachable: false, null offline fields)', async () => {
    await service.setAdminToggle('offline', 'actor-1');
    expect(service.getState()).toEqual({
      state: 'explicit-offline',
      piReachable: false,
      offlineEmoji: null,
      offlineTitle: null,
      offlineDescription: null,
    });
    expect(vi.mocked(wsHub.broadcast)).toHaveBeenCalledWith({
      type: 'stream:state',
      payload: {
        state: 'explicit-offline',
        piReachable: false,
        offlineEmoji: null,
        offlineTitle: null,
        offlineDescription: null,
      },
    });
  });

  it('setAdminToggle offline → inserts stream_stop audit log', async () => {
    await service.setAdminToggle('offline', 'actor-1');
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { id: 'test-ulid', action: 'stream_stop', actorId: 'actor-1' },
    });
  });

  it('setAdminToggle live → inserts stream_start audit log', async () => {
    await service.setAdminToggle('live', 'actor-2');
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { id: 'test-ulid', action: 'stream_start', actorId: 'actor-2' },
    });
  });

  it('explicit-offline includes piReachable: true when Pi is reachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ready: true }) }),
    );
    await service.pollMediamtxState();
    await service.setAdminToggle('offline', 'actor-1');
    expect(service.getState()).toEqual({
      state: 'explicit-offline',
      piReachable: true,
      offlineEmoji: null,
      offlineTitle: null,
      offlineDescription: null,
    });
    vi.unstubAllGlobals();
  });

  it('setAdminToggle live while piReachable=false → unreachable', async () => {
    await service.setAdminToggle('offline', 'actor-1');
    await service.setAdminToggle('live', 'actor-1');
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ready: true }) }),
    );
    await service.pollMediamtxState();
    expect(service.getState()).toEqual({ state: 'live' });

    vi.mocked(wsHub.broadcast).mockClear();

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
    await new Promise((r) => setTimeout(r, 0));
    expect(errorSpy).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'mediamtx poll loop exited unexpectedly',
    );
  });

  it('start() loads adminToggle from DB and offline message fields', async () => {
    vi.mocked(streamConfig.get).mockResolvedValueOnce('offline');
    vi.mocked(streamConfig.getMany).mockResolvedValueOnce({
      offlineEmoji: '1f600',
      offlineTitle: 'Custom Title',
      offlineDescription: 'Custom Desc',
    });
    await service.start();
    expect(service.getState()).toMatchObject({
      state: 'explicit-offline',
      offlineEmoji: '1f600',
      offlineTitle: 'Custom Title',
      offlineDescription: 'Custom Desc',
    });
  });

  it('pollLoop polls mediamtx state periodically', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ready: true }) }),
    );

    const startPromise = service.start();

    await vi.advanceTimersByTimeAsync(3000);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    service.stop();
    await vi.advanceTimersByTimeAsync(2000);
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

describe('StreamService offline message', () => {
  let service: StreamService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StreamService();
  });

  afterEach(() => {
    service.stop();
  });

  it('getOfflineMessage returns null fields by default', () => {
    expect(service.getOfflineMessage()).toEqual({
      emoji: null,
      title: null,
      description: null,
    });
  });

  it('setOfflineMessage stores values, calls streamConfig.set for each, and broadcasts', async () => {
    await service.setAdminToggle('offline', 'actor-1');
    vi.mocked(wsHub.broadcast).mockClear();

    await service.setOfflineMessage({
      emoji: '1f600',
      title: 'Custom Title',
      description: 'Custom Desc',
      actorId: 'actor-1',
    });

    expect(service.getOfflineMessage()).toEqual({
      emoji: '1f600',
      title: 'Custom Title',
      description: 'Custom Desc',
    });

    expect(streamConfig.set).toHaveBeenCalledWith('offlineEmoji', '1f600');
    expect(streamConfig.set).toHaveBeenCalledWith('offlineTitle', 'Custom Title');
    expect(streamConfig.set).toHaveBeenCalledWith('offlineDescription', 'Custom Desc');

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        id: 'test-ulid',
        action: 'offline_message_update',
        actorId: 'actor-1',
        metadata: { emoji: '1f600', title: 'Custom Title', description: 'Custom Desc' },
      },
    });

    expect(wsHub.broadcast).toHaveBeenCalledWith({
      type: 'stream:state',
      payload: expect.objectContaining({
        state: 'explicit-offline',
        offlineEmoji: '1f600',
        offlineTitle: 'Custom Title',
        offlineDescription: 'Custom Desc',
      }),
    });
  });

  it('setOfflineMessage with nulls calls streamConfig.set with null for each', async () => {
    await service.setOfflineMessage({
      emoji: null,
      title: null,
      description: null,
      actorId: 'actor-1',
    });

    expect(streamConfig.set).toHaveBeenCalledWith('offlineEmoji', null);
    expect(streamConfig.set).toHaveBeenCalledWith('offlineTitle', null);
    expect(streamConfig.set).toHaveBeenCalledWith('offlineDescription', null);
  });

  it('setOfflineMessage inserts offline_message_update audit log with metadata', async () => {
    await service.setOfflineMessage({
      emoji: '1f634',
      title: null,
      description: 'Test',
      actorId: 'actor-2',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        id: 'test-ulid',
        action: 'offline_message_update',
        actorId: 'actor-2',
        metadata: { emoji: '1f634', title: null, description: 'Test' },
      },
    });
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

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ready: false }),
    } as never);
    await service.pollMediamtxState();
    expect(service.isPiReachable()).toBe(false);

    mockFetch.mockClear();

    vi.mocked(prisma.cameraSettings.findMany).mockResolvedValueOnce([
      { key: 'rpiCameraBrightness', value: '0.5', updatedAt: new Date() },
    ] as never);

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

    await new Promise((r) => setTimeout(r, 50));

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

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ready: true }),
    } as never);

    vi.mocked(prisma.cameraSettings.findMany).mockRejectedValueOnce(
      new Error('DB connection error'),
    );

    await service.pollMediamtxState();

    await new Promise((r) => setTimeout(r, 50));

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

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ready: true }) }),
    );
    await service.pollMediamtxState();

    await new Promise((r) => setTimeout(r, 0));
    expect(errorSpy).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'stream: reapplyCameraSettings rejected unexpectedly',
    );
    vi.unstubAllGlobals();
  });
});
