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
    MTX_WEBRTC_PORT: '8889',
    MTX_API_PORT: '9997',
  },
}));
vi.mock('../db/client.js', () => ({
  prisma: {
    streamConfig: {
      upsert: vi.fn().mockResolvedValue({ id: 'cfg', adminToggle: 'live' }),
    },
  },
}));

import { spawn } from 'node:child_process';
import { wsHub } from './wsHub.js';
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
});
