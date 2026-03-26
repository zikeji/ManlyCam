import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const SESSION_URL = '/api/stream-only/testkey/whep/test-uuid';

function makeMockPc() {
  return {
    addTransceiver: vi.fn(),
    createOffer: vi.fn().mockResolvedValue({ sdp: 'v=0\r\noffer-sdp' }),
    setLocalDescription: vi.fn().mockResolvedValue(undefined),
    setRemoteDescription: vi.fn().mockResolvedValue(undefined),
    onicecandidate: null as ((e: { candidate: RTCIceCandidate | null }) => void) | null,
    ontrack: null as ((e: { streams: MediaStream[]; track?: MediaStreamTrack }) => void) | null,
    oniceconnectionstatechange: null as (() => void) | null,
    onconnectionstatechange: null as (() => void) | null,
    iceConnectionState: 'new' as RTCIceConnectionState,
    connectionState: 'new' as RTCPeerConnectionState,
    close: vi.fn(),
  };
}

function makeMockVideoEl() {
  const listeners: Record<string, EventListenerOrEventListenerObject[]> = {};
  return {
    srcObject: null as MediaStream | null,
    paused: false,
    play: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn((event: string, handler: EventListenerOrEventListenerObject) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(handler);
    }),
    removeEventListener: vi.fn((event: string, handler: EventListenerOrEventListenerObject) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((h) => h !== handler);
      }
    }),
    dispatchTimeupdate() {
      (listeners['timeupdate'] ?? []).forEach((h) => {
        if (typeof h === 'function') h(new Event('timeupdate'));
        else h.handleEvent(new Event('timeupdate'));
      });
    },
  };
}

describe('useStreamOnlyWhep', () => {
  let mockPc: ReturnType<typeof makeMockPc>;

  beforeEach(() => {
    vi.resetModules();
    mockPc = makeMockPc();
    vi.stubGlobal(
      'RTCPeerConnection',
      vi.fn(() => mockPc),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
        if (opts?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 201,
            text: () => Promise.resolve('v=0\r\nanswer-sdp'),
            headers: {
              get: (name: string) => (name === 'Location' ? SESSION_URL : null),
            },
          });
        }
        return Promise.resolve({ ok: true });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates RTCPeerConnection with video-only transceiver (no audio)', async () => {
    const videoEl = makeMockVideoEl();
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('testkey');
    await startWhep(videoEl as unknown as HTMLVideoElement);
    expect(mockPc.addTransceiver).toHaveBeenCalledWith('video', { direction: 'recvonly' });
    expect(mockPc.addTransceiver).not.toHaveBeenCalledWith('audio', expect.anything());
    await stopWhep();
  });

  it('POSTs SDP offer to /api/stream-only/:key/whep without credentials', async () => {
    const videoEl = makeMockVideoEl();
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('mykey');
    await startWhep(videoEl as unknown as HTMLVideoElement);
    expect(fetch).toHaveBeenCalledWith(
      '/api/stream-only/mykey/whep',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/sdp' }),
        body: 'v=0\r\noffer-sdp',
      }),
    );
    // No credentials: 'include'
    const fetchCalls = vi.mocked(global.fetch).mock.calls;
    const postCall = fetchCalls.find((c) => (c[1] as RequestInit)?.method === 'POST');
    expect((postCall![1] as RequestInit).credentials).toBeUndefined();
    await stopWhep();
  });

  it('calls setRemoteDescription with SDP answer', async () => {
    const videoEl = makeMockVideoEl();
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('testkey');
    await startWhep(videoEl as unknown as HTMLVideoElement);
    expect(mockPc.setRemoteDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'v=0\r\nanswer-sdp',
    });
    await stopWhep();
  });

  it('attaches stream to video srcObject via ontrack', async () => {
    const mockStream = {} as MediaStream;
    const videoEl = makeMockVideoEl();
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('testkey');
    await startWhep(videoEl as unknown as HTMLVideoElement);
    mockPc.ontrack!({ streams: [mockStream] });
    expect(videoEl.srcObject).toBe(mockStream);
    expect(videoEl.play).toHaveBeenCalled();
    await stopWhep();
  });

  it('ontrack handles undefined streams[0] by wrapping track', async () => {
    const mockTrack = { id: 'track-1' } as MediaStreamTrack;
    const mockFallbackStream = { id: 'stream-fallback' } as unknown as MediaStream;
    vi.stubGlobal('MediaStream', vi.fn().mockReturnValue(mockFallbackStream));

    const videoEl = makeMockVideoEl();
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('testkey');
    await startWhep(videoEl as unknown as HTMLVideoElement);
    mockPc.ontrack!({ streams: [], track: mockTrack });
    expect(videoEl.srcObject).toBe(mockFallbackStream);
    await stopWhep();
  });

  it('stopWhep sends DELETE to session URL and closes peer connection', async () => {
    const videoEl = makeMockVideoEl();
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('testkey');
    await startWhep(videoEl as unknown as HTMLVideoElement);
    await stopWhep();
    expect(fetch).toHaveBeenCalledWith(SESSION_URL, expect.objectContaining({ method: 'DELETE' }));
    expect(mockPc.close).toHaveBeenCalled();
  });

  it('stopWhep is safe to call before startWhep', async () => {
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { stopWhep } = useStreamOnlyWhep('testkey');
    await expect(stopWhep()).resolves.toBeUndefined();
  });

  it('trickle ICE PATCHes candidate to session URL', async () => {
    const videoEl = makeMockVideoEl();
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('testkey');
    await startWhep(videoEl as unknown as HTMLVideoElement);
    mockPc.onicecandidate!({ candidate: { candidate: 'candidate:1 ...' } as RTCIceCandidate });
    await new Promise((r) => setTimeout(r, 0));
    expect(fetch).toHaveBeenCalledWith(
      SESSION_URL,
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/trickle-ice-sdpfrag' },
        body: 'candidate:1 ...',
      }),
    );
    await stopWhep();
  });

  it('trickle ICE with null candidate does not call fetch', async () => {
    const videoEl = makeMockVideoEl();
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('testkey');
    await startWhep(videoEl as unknown as HTMLVideoElement);
    const callsBefore = vi.mocked(global.fetch).mock.calls.length;
    // null candidate is the "gathering complete" signal — should not PATCH
    mockPc.onicecandidate!({ candidate: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(vi.mocked(global.fetch).mock.calls.length).toBe(callsBefore);
    await stopWhep();
  });

  it('404 response sets isPermanentlyFailed true and does not reconnect', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
        if (opts?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 404,
            text: () => Promise.resolve('not found'),
            headers: { get: () => null },
          });
        }
        return Promise.resolve({ ok: true });
      }),
    );

    const videoEl = makeMockVideoEl();
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, isPermanentlyFailed, isConnecting } = useStreamOnlyWhep('testkey');

    await startWhep(videoEl as unknown as HTMLVideoElement);

    expect(isPermanentlyFailed.value).toBe(true);
    expect(isConnecting.value).toBe(false);

    await new Promise((r) => setTimeout(r, 50));
    // fetch was only called once (the POST) — no reconnect attempts
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
  });

  it('non-404 error does not set isPermanentlyFailed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
        if (opts?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 503,
            text: () => Promise.resolve('retry'),
            headers: { get: () => null },
          });
        }
        return Promise.resolve({ ok: true });
      }),
    );

    const videoEl = makeMockVideoEl();
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, isPermanentlyFailed, stopWhep } = useStreamOnlyWhep('testkey');

    await startWhep(videoEl as unknown as HTMLVideoElement).catch(() => {});
    expect(isPermanentlyFailed.value).toBe(false);
    await stopWhep();
  });

  it('isConnecting is true during fetch and false after', async () => {
    const videoEl = makeMockVideoEl();
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep, isConnecting } = useStreamOnlyWhep('testkey');

    let connectingDuringFetch = false;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
        if (opts?.method === 'POST') {
          connectingDuringFetch = isConnecting.value;
          return Promise.resolve({
            ok: true,
            status: 201,
            text: () => Promise.resolve('v=0\r\nanswer-sdp'),
            headers: { get: (name: string) => (name === 'Location' ? SESSION_URL : null) },
          });
        }
        return Promise.resolve({ ok: true });
      }),
    );

    await startWhep(videoEl as unknown as HTMLVideoElement);
    expect(connectingDuringFetch).toBe(true);
    expect(isConnecting.value).toBe(false);
    await stopWhep();
  });

  it('isConnecting is false when connect throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
        if (opts?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 503,
            text: () => Promise.resolve('error'),
            headers: { get: () => null },
          });
        }
        return Promise.resolve({ ok: true });
      }),
    );

    const videoEl = makeMockVideoEl();
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, isConnecting, stopWhep } = useStreamOnlyWhep('testkey');

    await startWhep(videoEl as unknown as HTMLVideoElement).catch(() => {});
    expect(isConnecting.value).toBe(false);
    await stopWhep();
  });

  it('timeupdate event sets isHealthy true', async () => {
    const videoEl = makeMockVideoEl();
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep, isHealthy } = useStreamOnlyWhep('testkey');
    await startWhep(videoEl as unknown as HTMLVideoElement);
    expect(isHealthy.value).toBe(false);
    videoEl.dispatchTimeupdate();
    expect(isHealthy.value).toBe(true);
    await stopWhep();
  });

  it('ICE connection failed state schedules reconnect', async () => {
    const videoEl = makeMockVideoEl();
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep, isHealthy } = useStreamOnlyWhep('testkey');
    await startWhep(videoEl as unknown as HTMLVideoElement);

    // Simulate healthy stream first
    videoEl.dispatchTimeupdate();
    expect(isHealthy.value).toBe(true);

    // Simulate ICE failure
    mockPc.iceConnectionState = 'failed';
    mockPc.oniceconnectionstatechange!();

    // isHealthy becomes false (reconnecting)
    expect(isHealthy.value).toBe(false);
    await stopWhep();
  });

  it('connection state failed schedules reconnect', async () => {
    const videoEl = makeMockVideoEl();
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep, isHealthy } = useStreamOnlyWhep('testkey');
    await startWhep(videoEl as unknown as HTMLVideoElement);

    videoEl.dispatchTimeupdate();
    expect(isHealthy.value).toBe(true);

    mockPc.connectionState = 'failed';
    mockPc.onconnectionstatechange!();
    expect(isHealthy.value).toBe(false);
    await stopWhep();
  });

  it('startWhep throws on setRemoteDescription failure and cleans up', async () => {
    mockPc.setRemoteDescription = vi.fn().mockRejectedValue(new Error('Invalid SDP'));
    const videoEl = makeMockVideoEl();
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep } = useStreamOnlyWhep('testkey');
    await expect(startWhep(videoEl as unknown as HTMLVideoElement)).rejects.toThrow('Invalid SDP');
    expect(mockPc.close).toHaveBeenCalled();
  });

  it('visibility change to hidden clears stall timer', async () => {
    const videoEl = makeMockVideoEl();
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('testkey');
    await startWhep(videoEl as unknown as HTMLVideoElement);
    videoEl.dispatchTimeupdate();

    // Simulate visibility change to hidden
    Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    // Restore and cleanup
    Object.defineProperty(document, 'hidden', {
      value: false,
      writable: true,
      configurable: true,
    });
    await stopWhep();
  });
});
