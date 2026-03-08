import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('node:child_process');
vi.mock('node:fs', () => ({
  mkdtempSync: vi.fn().mockReturnValue('/tmp/test-mtx-dir'),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
}));
vi.mock('node:os', () => ({ tmpdir: vi.fn().mockReturnValue('/tmp') }));
vi.mock('node:path', () => ({ join: vi.fn((...parts: string[]) => parts.join('/')) }));
vi.mock('./wsHub.js', () => ({
  wsHub: { broadcast: vi.fn() },
}));
vi.mock('../env.js', () => ({
  env: {
    FRP_HOST: 'frps',
    FRP_RTSP_PORT: '11935',
    FRP_API_PORT: '7400',
    MTX_WEBRTC_PORT: '8889',
    MTX_API_PORT: '9997',
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

import { spawn } from 'node:child_process';
import { wsHub } from './wsHub.js';
import { prisma } from '../db/client.js';
import { StreamService, buildMTXConfig } from './streamService.js';

function makeMockProc() {
  const proc = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
  proc.kill = vi.fn();
  return proc;
}

describe('buildMTXConfig', () => {
  it('includes RTSP source from env', () => {
    const cfg = buildMTXConfig();
    expect(cfg).toContain('source: rtsp://frps:11935/cam');
    expect(cfg).toContain('sourceProtocol: tcp');
  });

  it('configures WebRTC and API ports', () => {
    const cfg = buildMTXConfig();
    expect(cfg).toContain('webrtcAddress: ":8889"');
    expect(cfg).toContain('apiAddress: "127.0.0.1:9997"');
  });

  it('disables unused protocols', () => {
    const cfg = buildMTXConfig();
    expect(cfg).toContain('rtspAddress: ":0"');
    expect(cfg).toContain('hlsAddress: ":0"');
  });
});

describe('StreamService state machine', () => {
  let service: StreamService;
  let mockProc: ReturnType<typeof makeMockProc>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProc = makeMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc as never);
    service = new StreamService();
  });

  afterEach(() => {
    service.stop();
  });

  it('initial state is unreachable with adminToggle live', () => {
    expect(service.getState()).toEqual({ state: 'unreachable', adminToggle: 'live' });
  });

  it('setAdminToggle offline → explicit-offline', async () => {
    await service.setAdminToggle('offline');
    expect(service.getState()).toEqual({ state: 'explicit-offline' });
    expect(vi.mocked(wsHub.broadcast)).toHaveBeenCalledWith({
      type: 'stream:state',
      payload: { state: 'explicit-offline' },
    });
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

  it('stop() kills the mediamtx process', async () => {
    await service.start();
    service.stop();
    expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');
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
  let mockProc: ReturnType<typeof makeMockProc>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProc = makeMockProc();
    vi.mocked(spawn).mockReturnValue(mockProc as never);
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
    const patchCall = calls.find((c) => c[0]?.includes('/v3/config/paths/patch/cam'));
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
      new Error('DB connection error')
    );

    await service.pollMediamtxState();

    // Wait for async reapply
    await new Promise((r) => setTimeout(r, 50));

    // Should still transition to reachable despite reapply error
    expect(service.isPiReachable()).toBe(true);

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
});
