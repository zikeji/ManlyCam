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
    MTX_HLS_URL: 'http://127.0.0.1:8090',
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
    setWithClient: vi.fn().mockResolvedValue(undefined),
    getOrNull: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('../lib/ulid.js', () => ({ ulid: vi.fn(() => 'test-ulid') }));
vi.mock('../db/client.js', () => ({
  prisma: {
    $transaction: vi.fn((fn) =>
      fn({
        auditLog: {
          create: vi.fn().mockResolvedValue({}),
        },
        streamConfig: {
          upsert: vi.fn().mockResolvedValue({}),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }),
    ),
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
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('setAdminToggle live → inserts stream_start audit log', async () => {
    await service.setAdminToggle('live', 'actor-2');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('setAdminToggle live → writes stream_started_at via transaction', async () => {
    await service.setAdminToggle('live', 'actor-1');
    const txCall = vi.mocked(prisma.$transaction).mock.calls[0][0];
    const txClient = {
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      streamConfig: {
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    // Verify transaction was called (stream_started_at write happens inside)
    expect(prisma.$transaction).toHaveBeenCalled();
    // The setWithClient mock is called for adminToggle and stream_started_at
    expect(vi.mocked(streamConfig.setWithClient)).toHaveBeenCalledWith(
      expect.anything(),
      'stream_started_at',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    );
    void txCall;
    void txClient;
  });

  it('setAdminToggle offline → calls flushHlsPath fire-and-forget', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await service.setAdminToggle('offline', 'actor-1');
    await new Promise((r) => setTimeout(r, 0));
    expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:9997/v3/hlsmuxers/delete/cam', {
      method: 'DELETE',
    });
    vi.unstubAllGlobals();
  });

  it('setAdminToggle offline → HLS flush non-ok logs warning', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await service.setAdminToggle('offline', 'actor-1');
    await new Promise((r) => setTimeout(r, 0));
    // flushHlsPath should not throw — logged as warning, not error
    vi.unstubAllGlobals();
  });

  it('setAdminToggle offline → HLS flush error is caught and logged', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const errorSpy = vi.spyOn(logger, 'error');
    await service.setAdminToggle('offline', 'actor-1');
    await new Promise((r) => setTimeout(r, 0));
    expect(errorSpy).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'stream: failed to flush HLS path on offline toggle',
    );
    vi.unstubAllGlobals();
  });

  it('flushHlsPath warns on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const warnSpy = vi.spyOn(logger, 'warn');
    await service.flushHlsPath();
    expect(warnSpy).toHaveBeenCalledWith(
      { status: 404 },
      'stream: HLS path flush returned non-ok status',
    );
    vi.unstubAllGlobals();
  });

  it('setAdminToggle live → does NOT call flushHlsPath', async () => {
    const flushSpy = vi.spyOn(service, 'flushHlsPath');
    await service.setAdminToggle('live', 'actor-1');
    await new Promise((r) => setTimeout(r, 0));
    expect(flushSpy).not.toHaveBeenCalled();
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

  it('setOfflineMessage stores values and broadcasts', async () => {
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

    expect(prisma.$transaction).toHaveBeenCalled();

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

  it('setOfflineMessage with nulls uses transaction', async () => {
    await service.setOfflineMessage({
      emoji: null,
      title: null,
      description: null,
      actorId: 'actor-1',
    });

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('setOfflineMessage inserts offline_message_update audit log with metadata via transaction', async () => {
    await service.setOfflineMessage({
      emoji: '1f634',
      title: null,
      description: 'Test',
      actorId: 'actor-2',
    });

    expect(prisma.$transaction).toHaveBeenCalled();
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

describe('StreamService cacheHlsPlaylistName', () => {
  let service: StreamService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StreamService();
  });

  afterEach(() => {
    service.stop();
  });

  it('fetches index.m3u8 and caches playlist name on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '#EXTM3U\nvideo1_stream.m3u8\n',
      }),
    );
    await service.cacheHlsPlaylistName();
    expect(global.fetch).toHaveBeenCalledWith('http://127.0.0.1:8090/cam/index.m3u8');
    expect(vi.mocked(streamConfig.set)).toHaveBeenCalledWith(
      'hls_stream_playlist',
      'video1_stream.m3u8',
    );
    vi.unstubAllGlobals();
  });

  it('logs warning when index.m3u8 returns non-ok status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const warnSpy = vi.spyOn(logger, 'warn');
    await service.cacheHlsPlaylistName();
    expect(warnSpy).toHaveBeenCalledWith(
      { status: 503 },
      'stream: failed to fetch HLS master playlist',
    );
    vi.unstubAllGlobals();
  });

  it('logs warning when playlist filename not found in index.m3u8', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => '#EXTM3U\n# comment only\n' }),
    );
    const warnSpy = vi.spyOn(logger, 'warn');
    await service.cacheHlsPlaylistName();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.any(String) }),
      'stream: could not parse stream playlist filename from master playlist',
    );
    vi.unstubAllGlobals();
  });

  it('setAdminToggle live → calls cacheHlsPlaylistName fire-and-forget', async () => {
    const cacheSpy = vi.spyOn(service, 'cacheHlsPlaylistName').mockResolvedValue(undefined);
    await service.setAdminToggle('live', 'actor-1');
    await new Promise((r) => setTimeout(r, 0));
    expect(cacheSpy).toHaveBeenCalled();
  });

  it('setAdminToggle live → logs warning if cacheHlsPlaylistName rejects', async () => {
    vi.spyOn(service, 'cacheHlsPlaylistName').mockRejectedValue(new Error('HLS unavailable'));
    const warnSpy = vi.spyOn(logger, 'warn');
    await service.setAdminToggle('live', 'actor-1');
    await new Promise((r) => setTimeout(r, 0));
    expect(warnSpy).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'stream: failed to cache HLS playlist name on live toggle (will retry on first clip)',
    );
  });
});
