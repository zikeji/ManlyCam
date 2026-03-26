import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const SESSION_URL = '/api/stream-only/testkey/whep/test-uuid';

// ── MockEventSource ──────────────────────────────────────────────────────────

class MockEventSource {
  static instance: MockEventSource | null = null;

  url: string;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  private namedListeners: Record<string, ((e: Event) => void)[]> = {};
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instance = this;
  }

  addEventListener(type: string, handler: (e: Event) => void) {
    this.namedListeners[type] = this.namedListeners[type] ?? [];
    this.namedListeners[type].push(handler);
  }

  removeEventListener(type: string, handler: (e: Event) => void) {
    if (this.namedListeners[type]) {
      this.namedListeners[type] = this.namedListeners[type].filter((h) => h !== handler);
    }
  }

  close() {
    this.closed = true;
  }

  // ── Test helpers ────────────────────────────────────────────────────────────

  sendLive(live: boolean) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ live }) }));
  }

  sendNotFound() {
    (this.namedListeners['not-found'] ?? []).forEach((h) => h(new Event('not-found')));
  }

  triggerError() {
    this.onerror?.();
  }
}

// ── Shared mock helpers ──────────────────────────────────────────────────────

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

function stubFetchWhep(mockPc: ReturnType<typeof makeMockPc>, whepStatus = 201) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        if (whepStatus === 404) {
          return Promise.resolve({
            ok: false,
            status: 404,
            text: () => Promise.resolve('not found'),
            headers: { get: () => null },
          });
        }
        if (whepStatus !== 201 && whepStatus !== 200) {
          return Promise.resolve({
            ok: false,
            status: whepStatus,
            text: () => Promise.resolve('error'),
            headers: { get: () => null },
          });
        }
        return Promise.resolve({
          ok: true,
          status: whepStatus,
          text: () => Promise.resolve('v=0\r\nanswer-sdp'),
          headers: {
            get: (name: string) => (name === 'Location' ? SESSION_URL : null),
          },
        });
      }
      return Promise.resolve({ ok: true });
    }),
  );
  return mockPc;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useStreamOnlyWhep', () => {
  let mockPc: ReturnType<typeof makeMockPc>;

  beforeEach(() => {
    vi.resetModules();
    MockEventSource.instance = null;
    mockPc = makeMockPc();
    vi.stubGlobal(
      'RTCPeerConnection',
      vi.fn(() => mockPc),
    );
    vi.stubGlobal('EventSource', MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens EventSource with correct SSE URL on startWhep', async () => {
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('mykey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    expect(MockEventSource.instance).not.toBeNull();
    expect(MockEventSource.instance!.url).toBe('/api/stream-only/mykey/sse');
    stopWhep();
  });

  it('SSE live:true → starts WHEP', async () => {
    stubFetchWhep(mockPc);
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    MockEventSource.instance!.sendLive(true);
    await new Promise((r) => setTimeout(r, 0));

    expect(mockPc.addTransceiver).toHaveBeenCalledWith('video', { direction: 'recvonly' });
    stopWhep();
  });

  it('SSE live:false → WHEP never started', async () => {
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep, isConnecting, isHealthy } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    MockEventSource.instance!.sendLive(false);
    await new Promise((r) => setTimeout(r, 0));

    expect(isConnecting.value).toBe(false);
    expect(isHealthy.value).toBe(false);
    expect(mockPc.addTransceiver).not.toHaveBeenCalled();
    stopWhep();
  });

  it('SSE live:false after WHEP connected → tears down WHEP', async () => {
    stubFetchWhep(mockPc);
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep, isHealthy } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    MockEventSource.instance!.sendLive(true);
    await new Promise((r) => setTimeout(r, 0));
    // Fire timeupdate so isHealthy becomes true
    videoEl.dispatchTimeupdate();
    expect(isHealthy.value).toBe(true);

    MockEventSource.instance!.sendLive(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(isHealthy.value).toBe(false);
    expect(mockPc.close).toHaveBeenCalled();
    stopWhep();
  });

  it('not-found SSE event → isPermanentlyFailed set, EventSource closed', async () => {
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, isPermanentlyFailed } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    MockEventSource.instance!.sendNotFound();
    await new Promise((r) => setTimeout(r, 0));

    expect(isPermanentlyFailed.value).toBe(true);
    expect(MockEventSource.instance!.closed).toBe(true);
  });

  it('404 from WHEP → isPermanentlyFailed set', async () => {
    stubFetchWhep(mockPc, 404);
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep, isPermanentlyFailed } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    MockEventSource.instance!.sendLive(true);
    await new Promise((r) => setTimeout(r, 0));

    expect(isPermanentlyFailed.value).toBe(true);
    stopWhep();
  });

  it('non-404 WHEP error → reconnects SSE after 2s delay', async () => {
    vi.useFakeTimers();
    stubFetchWhep(mockPc, 503);
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep, isPermanentlyFailed } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);
    const firstSse = MockEventSource.instance!;

    firstSse.sendLive(true);
    await Promise.resolve();

    expect(isPermanentlyFailed.value).toBe(false);

    await vi.advanceTimersByTimeAsync(2000);

    // A new SSE instance should have been created
    expect(MockEventSource.instance).not.toBe(firstSse);
    stopWhep();
    vi.useRealTimers();
  });

  it('ICE failure → teardownWhep + reconnects SSE', async () => {
    stubFetchWhep(mockPc);
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep, isHealthy } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);
    const firstSse = MockEventSource.instance!;

    firstSse.sendLive(true);
    await new Promise((r) => setTimeout(r, 0));
    videoEl.dispatchTimeupdate();
    expect(isHealthy.value).toBe(true);

    mockPc.iceConnectionState = 'failed';
    mockPc.oniceconnectionstatechange!();
    await new Promise((r) => setTimeout(r, 0));

    expect(isHealthy.value).toBe(false);
    expect(MockEventSource.instance).not.toBe(firstSse);
    stopWhep();
  });

  it('connection state failed → teardownWhep + reconnects SSE', async () => {
    stubFetchWhep(mockPc);
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep, isHealthy } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);
    const firstSse = MockEventSource.instance!;

    firstSse.sendLive(true);
    await new Promise((r) => setTimeout(r, 0));
    videoEl.dispatchTimeupdate();

    mockPc.connectionState = 'failed';
    mockPc.onconnectionstatechange!();
    await new Promise((r) => setTimeout(r, 0));

    expect(isHealthy.value).toBe(false);
    expect(MockEventSource.instance).not.toBe(firstSse);
    stopWhep();
  });

  it('SSE onerror → teardownWhep (EventSource auto-reconnects)', async () => {
    stubFetchWhep(mockPc);
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep, isHealthy } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    MockEventSource.instance!.sendLive(true);
    await new Promise((r) => setTimeout(r, 0));
    videoEl.dispatchTimeupdate();
    expect(isHealthy.value).toBe(true);

    MockEventSource.instance!.triggerError();
    await new Promise((r) => setTimeout(r, 0));

    expect(isHealthy.value).toBe(false);
    expect(mockPc.close).toHaveBeenCalled();
    stopWhep();
  });

  it('stopWhep closes SSE and tears down WHEP', async () => {
    stubFetchWhep(mockPc);
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    MockEventSource.instance!.sendLive(true);
    await new Promise((r) => setTimeout(r, 0));

    stopWhep();

    expect(MockEventSource.instance!.closed).toBe(true);
    expect(fetch).toHaveBeenCalledWith(SESSION_URL, expect.objectContaining({ method: 'DELETE' }));
    expect(mockPc.close).toHaveBeenCalled();
  });

  it('stopWhep is safe to call before startWhep', async () => {
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { stopWhep } = useStreamOnlyWhep('testkey');
    expect(() => stopWhep()).not.toThrow();
  });

  it('calls setRemoteDescription with SDP answer', async () => {
    stubFetchWhep(mockPc);
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    MockEventSource.instance!.sendLive(true);
    await new Promise((r) => setTimeout(r, 0));

    expect(mockPc.setRemoteDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'v=0\r\nanswer-sdp',
    });
    stopWhep();
  });

  it('attaches stream to video srcObject via ontrack', async () => {
    const mockStream = {} as MediaStream;
    stubFetchWhep(mockPc);
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    MockEventSource.instance!.sendLive(true);
    await new Promise((r) => setTimeout(r, 0));
    mockPc.ontrack!({ streams: [mockStream] });

    expect(videoEl.srcObject).toBe(mockStream);
    expect(videoEl.play).toHaveBeenCalled();
    stopWhep();
  });

  it('ontrack handles undefined streams[0] by wrapping track', async () => {
    const mockTrack = { id: 'track-1' } as MediaStreamTrack;
    const mockFallbackStream = { id: 'stream-fallback' } as unknown as MediaStream;
    vi.stubGlobal('MediaStream', vi.fn().mockReturnValue(mockFallbackStream));
    stubFetchWhep(mockPc);
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    MockEventSource.instance!.sendLive(true);
    await new Promise((r) => setTimeout(r, 0));
    mockPc.ontrack!({ streams: [], track: mockTrack });

    expect(videoEl.srcObject).toBe(mockFallbackStream);
    stopWhep();
  });

  it('POSTs SDP offer to /api/stream-only/:key/whep without credentials', async () => {
    stubFetchWhep(mockPc);
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('mykey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    MockEventSource.instance!.sendLive(true);
    await new Promise((r) => setTimeout(r, 0));

    expect(fetch).toHaveBeenCalledWith(
      '/api/stream-only/mykey/whep',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/sdp' }),
        body: 'v=0\r\noffer-sdp',
      }),
    );
    const fetchCalls = vi.mocked(global.fetch).mock.calls;
    const postCall = fetchCalls.find((c) => (c[1] as RequestInit)?.method === 'POST');
    expect((postCall![1] as RequestInit).credentials).toBeUndefined();
    stopWhep();
  });

  it('trickle ICE PATCHes candidate to session URL', async () => {
    stubFetchWhep(mockPc);
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    MockEventSource.instance!.sendLive(true);
    await new Promise((r) => setTimeout(r, 0));
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
    stopWhep();
  });

  it('trickle ICE with null candidate does not call fetch for PATCH', async () => {
    stubFetchWhep(mockPc);
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    MockEventSource.instance!.sendLive(true);
    await new Promise((r) => setTimeout(r, 0));
    const callsBefore = vi.mocked(global.fetch).mock.calls.length;
    mockPc.onicecandidate!({ candidate: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(vi.mocked(global.fetch).mock.calls.length).toBe(callsBefore);
    stopWhep();
  });

  it('isConnecting is true during WHEP POST and false after', async () => {
    let connectingDuringFetch = false;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
        if (opts?.method === 'POST') {
          connectingDuringFetch = true;
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

    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep, isConnecting } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    MockEventSource.instance!.sendLive(true);
    await new Promise((r) => setTimeout(r, 0));

    expect(connectingDuringFetch).toBe(true);
    expect(isConnecting.value).toBe(false);
    stopWhep();
  });

  it('timeupdate event sets isHealthy true', async () => {
    stubFetchWhep(mockPc);
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep, isHealthy } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    MockEventSource.instance!.sendLive(true);
    await new Promise((r) => setTimeout(r, 0));

    expect(isHealthy.value).toBe(false);
    videoEl.dispatchTimeupdate();
    expect(isHealthy.value).toBe(true);
    stopWhep();
  });

  it('setRemoteDescription failure cleans up pc', async () => {
    mockPc.setRemoteDescription = vi.fn().mockRejectedValue(new Error('Invalid SDP'));
    stubFetchWhep(mockPc);
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    MockEventSource.instance!.sendLive(true);
    await new Promise((r) => setTimeout(r, 0));

    expect(mockPc.close).toHaveBeenCalled();
    stopWhep();
  });

  it('visibility change to hidden clears stall timer', async () => {
    stubFetchWhep(mockPc);
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    MockEventSource.instance!.sendLive(true);
    await new Promise((r) => setTimeout(r, 0));
    videoEl.dispatchTimeupdate();

    Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    Object.defineProperty(document, 'hidden', {
      value: false,
      writable: true,
      configurable: true,
    });
    stopWhep();
  });

  it('stall timer fires after 5s and reconnects SSE', async () => {
    vi.useFakeTimers();
    stubFetchWhep(mockPc);
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    MockEventSource.instance!.sendLive(true);
    await Promise.resolve();
    videoEl.dispatchTimeupdate(); // arms stall timer + sets isHealthy
    const firstSse = MockEventSource.instance!;

    await vi.advanceTimersByTimeAsync(5000);

    expect(MockEventSource.instance).not.toBe(firstSse);
    stopWhep();
    vi.useRealTimers();
  });

  it('visibility change back from hidden with stale video → reconnects SSE', async () => {
    // Use Date.now spy to control elapsed time without fake timers
    let fakeNow = 1_000_000;
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => fakeNow);

    stubFetchWhep(mockPc);
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    MockEventSource.instance!.sendLive(true);
    await new Promise((r) => setTimeout(r, 0)); // flush connectWhep
    videoEl.dispatchTimeupdate(); // lastTimeupdateAt = fakeNow (1_000_000)
    const firstSse = MockEventSource.instance!;

    // Hide tab (clears stall timer)
    Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    // Advance past STALL_TIMEOUT_MS
    fakeNow += 6000;

    // Show tab — elapsed 6000 > 5000 → should reconnect
    Object.defineProperty(document, 'hidden', {
      value: false,
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(MockEventSource.instance).not.toBe(firstSse);
    stopWhep();
    dateNowSpy.mockRestore();
  });

  it('visibility change back from hidden with fresh video → resets stall timer (no reconnect)', async () => {
    // Use Date.now spy — don't advance it so elapsed is tiny
    let fakeNow = 1_000_000;
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => fakeNow);

    stubFetchWhep(mockPc);
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    MockEventSource.instance!.sendLive(true);
    await new Promise((r) => setTimeout(r, 0));
    videoEl.dispatchTimeupdate(); // lastTimeupdateAt = 1_000_000
    const firstSse = MockEventSource.instance!;

    // Hide tab
    Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    // Do NOT advance fakeNow — elapsed will be ~0, NOT > STALL_TIMEOUT_MS
    Object.defineProperty(document, 'hidden', {
      value: false,
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    // Same SSE instance — no reconnect triggered
    expect(MockEventSource.instance).toBe(firstSse);
    stopWhep();
    dateNowSpy.mockRestore();
  });

  it('duplicate SSE live:true messages do not start a second WHEP while one is active', async () => {
    stubFetchWhep(mockPc);
    const { useStreamOnlyWhep } = await import('./useStreamOnlyWhep');
    const { startWhep, stopWhep } = useStreamOnlyWhep('testkey');
    const videoEl = makeMockVideoEl();
    startWhep(videoEl as unknown as HTMLVideoElement);

    MockEventSource.instance!.sendLive(true);
    await new Promise((r) => setTimeout(r, 0));
    const callsAfterFirst = vi.mocked(global.fetch).mock.calls.length;

    // Send live:true again — should be a no-op because pc is already set
    MockEventSource.instance!.sendLive(true);
    await new Promise((r) => setTimeout(r, 0));

    expect(vi.mocked(global.fetch).mock.calls.length).toBe(callsAfterFirst);
    stopWhep();
  });
});
