import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const SESSION_URL = '/api/stream/whep/test-uuid';

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
  const el = {
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
  return el;
}

describe('useWhep', () => {
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
            text: () => Promise.resolve('v=0\r\nanswer-sdp'),
            headers: {
              get: (name: string) => (name === 'Location' ? SESSION_URL : null),
            },
          });
        }
        // PATCH and DELETE
        return Promise.resolve({ ok: true });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('startWhep creates RTCPeerConnection with correct transceivers', async () => {
    const videoEl = makeMockVideoEl();
    const { useWhep } = await import('./useWhep');
    const { startWhep, stopWhep } = useWhep();
    await startWhep(videoEl as unknown as HTMLVideoElement);
    expect(mockPc.addTransceiver).toHaveBeenCalledWith('video', { direction: 'recvonly' });
    expect(mockPc.addTransceiver).toHaveBeenCalledWith('audio', { direction: 'recvonly' });
    await stopWhep();
  });

  it('startWhep calls createOffer and setLocalDescription', async () => {
    const videoEl = makeMockVideoEl();
    const { useWhep } = await import('./useWhep');
    const { startWhep, stopWhep } = useWhep();
    await startWhep(videoEl as unknown as HTMLVideoElement);
    expect(mockPc.createOffer).toHaveBeenCalled();
    expect(mockPc.setLocalDescription).toHaveBeenCalledWith({ sdp: 'v=0\r\noffer-sdp' });
    await stopWhep();
  });

  it('startWhep POSTs SDP offer to /api/stream/whep', async () => {
    const videoEl = makeMockVideoEl();
    const { useWhep } = await import('./useWhep');
    const { startWhep, stopWhep } = useWhep();
    await startWhep(videoEl as unknown as HTMLVideoElement);
    expect(fetch).toHaveBeenCalledWith(
      '/api/stream/whep',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/sdp' }),
        body: 'v=0\r\noffer-sdp',
      }),
    );
    await stopWhep();
  });

  it('startWhep calls setRemoteDescription with SDP answer', async () => {
    const videoEl = makeMockVideoEl();
    const { useWhep } = await import('./useWhep');
    const { startWhep, stopWhep } = useWhep();
    await startWhep(videoEl as unknown as HTMLVideoElement);
    expect(mockPc.setRemoteDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'v=0\r\nanswer-sdp',
    });
    await stopWhep();
  });

  it('startWhep attaches stream to video srcObject via ontrack', async () => {
    const mockStream = {} as MediaStream;
    const videoEl = makeMockVideoEl();
    const { useWhep } = await import('./useWhep');
    const { startWhep, stopWhep } = useWhep();
    await startWhep(videoEl as unknown as HTMLVideoElement);
    // Simulate ontrack event
    mockPc.ontrack!({ streams: [mockStream] });
    expect(videoEl.srcObject).toBe(mockStream);
    expect(videoEl.play).toHaveBeenCalled();
    await stopWhep();
  });

  it('stopWhep sends DELETE to session URL and closes peer connection', async () => {
    const videoEl = makeMockVideoEl();
    const { useWhep } = await import('./useWhep');
    const { startWhep, stopWhep } = useWhep();
    await startWhep(videoEl as unknown as HTMLVideoElement);
    await stopWhep();
    expect(fetch).toHaveBeenCalledWith(
      SESSION_URL,
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    );
    expect(mockPc.close).toHaveBeenCalled();
  });

  it('stopWhep is safe to call before startWhep', async () => {
    const { useWhep } = await import('./useWhep');
    const { stopWhep } = useWhep();
    await expect(stopWhep()).resolves.toBeUndefined();
  });

  it('trickle ICE PATCHes candidate to session URL', async () => {
    const videoEl = makeMockVideoEl();
    const { useWhep } = await import('./useWhep');
    const { startWhep, stopWhep } = useWhep();
    await startWhep(videoEl as unknown as HTMLVideoElement);
    // Simulate ICE candidate
    mockPc.onicecandidate!({ candidate: { candidate: 'candidate:1 ...' } as RTCIceCandidate });
    // Give fetch a tick to be called
    await new Promise((r) => setTimeout(r, 0));
    expect(fetch).toHaveBeenCalledWith(
      SESSION_URL,
      expect.objectContaining({
        method: 'PATCH',
        credentials: 'include',
        body: 'candidate:1 ...',
      }),
    );
    await stopWhep();
  });

  it('startWhep throws on POST response not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    );
    const videoEl = makeMockVideoEl();
    const { useWhep } = await import('./useWhep');
    const { startWhep } = useWhep();
    await expect(startWhep(videoEl as unknown as HTMLVideoElement)).rejects.toThrow(
      'WHEP POST failed: 500',
    );
  });

  it('startWhep cleans up on error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      }),
    );
    const videoEl = makeMockVideoEl();
    const { useWhep } = await import('./useWhep');
    const { startWhep } = useWhep();
    try {
      await startWhep(videoEl as unknown as HTMLVideoElement);
    } catch {
      // Expected
    }
    // Verify pc.close was called (DELETE would only be called if sessionUrl was set)
    expect(mockPc.close).toHaveBeenCalled();
  });

  it('startWhep throws on setRemoteDescription failure', async () => {
    mockPc.setRemoteDescription = vi.fn().mockRejectedValue(new Error('Invalid SDP'));
    const videoEl = makeMockVideoEl();
    const { useWhep } = await import('./useWhep');
    const { startWhep } = useWhep();
    await expect(startWhep(videoEl as unknown as HTMLVideoElement)).rejects.toThrow('Invalid SDP');
  });

  it('ontrack handles undefined event.streams[0] by wrapping track', async () => {
    const mockTrack = { id: 'track-1' } as MediaStreamTrack;
    const mockFallbackStream = { id: 'stream-fallback' } as unknown as MediaStream;
    const mockMediaStreamConstructor = vi.fn().mockReturnValue(mockFallbackStream);
    vi.stubGlobal('MediaStream', mockMediaStreamConstructor);

    const videoEl = makeMockVideoEl();
    const { useWhep } = await import('./useWhep');
    const { startWhep, stopWhep } = useWhep();
    await startWhep(videoEl as unknown as HTMLVideoElement);
    // Simulate ontrack with empty streams array (streams[0] is undefined)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPc.ontrack!({ streams: [], track: mockTrack } as any);
    // Fallback should create a new MediaStream wrapping the track
    expect(mockMediaStreamConstructor).toHaveBeenCalledWith([mockTrack]);
    expect(videoEl.srcObject).toBe(mockFallbackStream);
    await stopWhep();
  });

  describe('health monitoring', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('isHealthy starts as false', async () => {
      const { useWhep } = await import('./useWhep');
      const { isHealthy } = useWhep();
      expect(isHealthy.value).toBe(false);
    });

    it('isHealthy becomes true after first timeupdate event', async () => {
      const videoEl = makeMockVideoEl();
      const { useWhep } = await import('./useWhep');
      const { startWhep, stopWhep, isHealthy } = useWhep();
      await startWhep(videoEl as unknown as HTMLVideoElement);
      expect(isHealthy.value).toBe(false);

      videoEl.dispatchTimeupdate();
      expect(isHealthy.value).toBe(true);

      await stopWhep();
    });

    it('stopWhep sets isHealthy to false', async () => {
      const videoEl = makeMockVideoEl();
      const { useWhep } = await import('./useWhep');
      const { startWhep, stopWhep, isHealthy } = useWhep();
      await startWhep(videoEl as unknown as HTMLVideoElement);
      videoEl.dispatchTimeupdate();
      expect(isHealthy.value).toBe(true);

      await stopWhep();
      expect(isHealthy.value).toBe(false);
    });

    it('stopWhep removes timeupdate listener from video element', async () => {
      const videoEl = makeMockVideoEl();
      const { useWhep } = await import('./useWhep');
      const { startWhep, stopWhep } = useWhep();
      await startWhep(videoEl as unknown as HTMLVideoElement);
      await stopWhep();

      expect(videoEl.removeEventListener).toHaveBeenCalledWith('timeupdate', expect.any(Function));
    });

    it('ICE failed state triggers isHealthy false and schedules reconnect', async () => {
      const videoEl = makeMockVideoEl();
      const { useWhep } = await import('./useWhep');
      const { startWhep, stopWhep, isHealthy } = useWhep();
      await startWhep(videoEl as unknown as HTMLVideoElement);
      videoEl.dispatchTimeupdate();
      expect(isHealthy.value).toBe(true);

      mockPc.iceConnectionState = 'failed';
      mockPc.oniceconnectionstatechange!();

      expect(isHealthy.value).toBe(false);
      await stopWhep();
    });

    it('ICE disconnected state triggers isHealthy false and schedules reconnect', async () => {
      const videoEl = makeMockVideoEl();
      const { useWhep } = await import('./useWhep');
      const { startWhep, stopWhep, isHealthy } = useWhep();
      await startWhep(videoEl as unknown as HTMLVideoElement);
      videoEl.dispatchTimeupdate();

      mockPc.iceConnectionState = 'disconnected';
      mockPc.oniceconnectionstatechange!();

      expect(isHealthy.value).toBe(false);
      await stopWhep();
    });

    it('connection failed state triggers isHealthy false and schedules reconnect', async () => {
      const videoEl = makeMockVideoEl();
      const { useWhep } = await import('./useWhep');
      const { startWhep, stopWhep, isHealthy } = useWhep();
      await startWhep(videoEl as unknown as HTMLVideoElement);
      videoEl.dispatchTimeupdate();

      mockPc.connectionState = 'failed';
      mockPc.onconnectionstatechange!();

      expect(isHealthy.value).toBe(false);
      await stopWhep();
    });

    it('video stall (no timeupdate for 5s) triggers reconnect', async () => {
      const videoEl = makeMockVideoEl();
      const { useWhep } = await import('./useWhep');
      const { startWhep, stopWhep, isHealthy } = useWhep();
      await startWhep(videoEl as unknown as HTMLVideoElement);

      // Receive a timeupdate to mark healthy and restart the stall timer
      videoEl.dispatchTimeupdate();
      expect(isHealthy.value).toBe(true);

      // Advance past the 5s stall timeout
      vi.advanceTimersByTime(5001);

      // scheduleReconnect should have been called, isHealthy cleared
      expect(isHealthy.value).toBe(false);
      await stopWhep();
    });

    it('ICE closed state triggers reconnect', async () => {
      const videoEl = makeMockVideoEl();
      const { useWhep } = await import('./useWhep');
      const { startWhep, stopWhep, isHealthy } = useWhep();
      await startWhep(videoEl as unknown as HTMLVideoElement);
      videoEl.dispatchTimeupdate();

      mockPc.iceConnectionState = 'closed';
      mockPc.oniceconnectionstatechange!();

      expect(isHealthy.value).toBe(false);
      await stopWhep();
    });

    it('connection disconnected state triggers reconnect', async () => {
      const videoEl = makeMockVideoEl();
      const { useWhep } = await import('./useWhep');
      const { startWhep, stopWhep, isHealthy } = useWhep();
      await startWhep(videoEl as unknown as HTMLVideoElement);
      videoEl.dispatchTimeupdate();

      mockPc.connectionState = 'disconnected';
      mockPc.onconnectionstatechange!();

      expect(isHealthy.value).toBe(false);
      await stopWhep();
    });

    it('connection closed state triggers reconnect', async () => {
      const videoEl = makeMockVideoEl();
      const { useWhep } = await import('./useWhep');
      const { startWhep, stopWhep, isHealthy } = useWhep();
      await startWhep(videoEl as unknown as HTMLVideoElement);
      videoEl.dispatchTimeupdate();

      mockPc.connectionState = 'closed';
      mockPc.onconnectionstatechange!();

      expect(isHealthy.value).toBe(false);
      await stopWhep();
    });

    it('returning to visible quickly reschedules stall timer (not immediate reconnect)', async () => {
      const videoEl = makeMockVideoEl();
      videoEl.paused = false;
      const { useWhep } = await import('./useWhep');
      const { startWhep, stopWhep, isHealthy } = useWhep();
      await startWhep(videoEl as unknown as HTMLVideoElement);
      videoEl.dispatchTimeupdate(); // sets lastTimeupdateAt, isHealthy = true
      expect(isHealthy.value).toBe(true);

      // Tab goes hidden briefly
      Object.defineProperty(document, 'hidden', {
        value: true,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      // Return to visible quickly (elapsed < 5s) — should reschedule stall timer, not reconnect
      vi.advanceTimersByTime(100);
      Object.defineProperty(document, 'hidden', {
        value: false,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      // isHealthy should still be true (no reconnect triggered)
      expect(isHealthy.value).toBe(true);

      // Stall timer is now set; advance < 5s should not trigger reconnect
      vi.advanceTimersByTime(4000);
      expect(isHealthy.value).toBe(true);

      await stopWhep();
    });

    it('reconnect attempts use exponential backoff', async () => {
      const videoEl = makeMockVideoEl();
      const { useWhep } = await import('./useWhep');
      const { startWhep, stopWhep } = useWhep();
      await startWhep(videoEl as unknown as HTMLVideoElement);

      // Trigger first reconnect via ICE failure (reconnectDelay = 1000ms initially)
      mockPc.iceConnectionState = 'failed';
      mockPc.oniceconnectionstatechange!();

      // Advance just past the 1s reconnect delay — stall timer (5s) won't fire yet
      await vi.advanceTimersByTimeAsync(1001);

      // RTCPeerConnection called once for startWhep + once for reconnect = 2 total
      expect(RTCPeerConnection).toHaveBeenCalledTimes(2);
      await stopWhep();
    });

    it('stopWhep cancels pending reconnect timer', async () => {
      const videoEl = makeMockVideoEl();
      const { useWhep } = await import('./useWhep');
      const { startWhep, stopWhep } = useWhep();
      await startWhep(videoEl as unknown as HTMLVideoElement);

      // Trigger reconnect
      mockPc.iceConnectionState = 'failed';
      mockPc.oniceconnectionstatechange!();

      // Stop before reconnect fires
      await stopWhep();

      // Advance timers — no new RTCPeerConnection should be created
      const rtcSpy = RTCPeerConnection as unknown as ReturnType<typeof vi.fn>;
      const callCountBefore = rtcSpy.mock.calls.length;
      vi.advanceTimersByTime(5000);
      expect(rtcSpy.mock.calls.length).toBe(callCountBefore);
    });

    it('stall timer is cleared when tab goes hidden', async () => {
      const videoEl = makeMockVideoEl();
      const { useWhep } = await import('./useWhep');
      const { startWhep, stopWhep, isHealthy } = useWhep();
      await startWhep(videoEl as unknown as HTMLVideoElement);
      videoEl.dispatchTimeupdate();
      expect(isHealthy.value).toBe(true);

      // Tab goes hidden — stall timer should be paused
      Object.defineProperty(document, 'hidden', {
        value: true,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      // Advance well past the stall timeout — should NOT trigger reconnect
      vi.advanceTimersByTime(10000);
      expect(isHealthy.value).toBe(true);

      // Restore
      Object.defineProperty(document, 'hidden', {
        value: false,
        writable: true,
        configurable: true,
      });
      await stopWhep();
    });

    it('returns to visible after long background triggers immediate reconnect if stalled', async () => {
      const videoEl = makeMockVideoEl();
      videoEl.paused = false;
      const { useWhep } = await import('./useWhep');
      const { startWhep, stopWhep, isHealthy } = useWhep();
      await startWhep(videoEl as unknown as HTMLVideoElement);
      videoEl.dispatchTimeupdate();
      expect(isHealthy.value).toBe(true);

      // Tab goes hidden
      Object.defineProperty(document, 'hidden', {
        value: true,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      // Advance time well past stall threshold (simulating long background)
      vi.advanceTimersByTime(6000);

      // Return to visible — elapsed since last timeupdate > 5s, so reconnect immediately
      Object.defineProperty(document, 'hidden', {
        value: false,
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      // scheduleReconnect should have fired: isHealthy cleared
      expect(isHealthy.value).toBe(false);

      await stopWhep();
    });

    it('reconnect succeeds and restores isHealthy', async () => {
      const videoEl = makeMockVideoEl();
      const { useWhep } = await import('./useWhep');
      const { startWhep, stopWhep, isHealthy } = useWhep();
      await startWhep(videoEl as unknown as HTMLVideoElement);
      videoEl.dispatchTimeupdate();
      expect(isHealthy.value).toBe(true);

      // Trigger reconnect via ICE failure
      mockPc.iceConnectionState = 'failed';
      mockPc.oniceconnectionstatechange!();
      expect(isHealthy.value).toBe(false);

      // Set up new mock PC for reconnect
      const mockPc2 = makeMockPc();
      vi.stubGlobal(
        'RTCPeerConnection',
        vi.fn(() => mockPc2),
      );

      // Advance just past the 1s reconnect delay — stall timer (5s) won't fire yet
      await vi.advanceTimersByTimeAsync(1001);

      // Simulate timeupdate on the reconnected stream
      videoEl.dispatchTimeupdate();
      expect(isHealthy.value).toBe(true);

      await stopWhep();
    });

    // F1: AC#5 — rapid visibility toggles result in only one active stall timer
    it('rapid successive visibility changes result in only one active stall timer (AC#5)', async () => {
      const videoEl = makeMockVideoEl();
      videoEl.paused = false;
      const { useWhep } = await import('./useWhep');
      const { startWhep, stopWhep, isHealthy } = useWhep();
      await startWhep(videoEl as unknown as HTMLVideoElement);
      videoEl.dispatchTimeupdate(); // isHealthy = true, stall timer reset
      expect(isHealthy.value).toBe(true);

      // Rapid toggle: hidden → visible × 3 times in quick succession
      for (let i = 0; i < 3; i++) {
        Object.defineProperty(document, 'hidden', {
          value: true,
          writable: true,
          configurable: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
        Object.defineProperty(document, 'hidden', {
          value: false,
          writable: true,
          configurable: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
      }

      // Only one stall timer is active (each visible resets it). Advance < 5s — no reconnect.
      vi.advanceTimersByTime(4999);
      expect(isHealthy.value).toBe(true);
      // No new RTCPeerConnection created — only the initial one
      expect(RTCPeerConnection).toHaveBeenCalledTimes(1);

      await stopWhep();
      Object.defineProperty(document, 'hidden', {
        value: false,
        writable: true,
        configurable: true,
      });
    });

    // F2: Backoff caps at MAX_DELAY (30s) after repeated failures
    it('reconnect delay caps at MAX_DELAY (30s) after repeated failures', async () => {
      const videoEl = makeMockVideoEl();
      const { useWhep } = await import('./useWhep');
      const { startWhep, stopWhep } = useWhep();
      await startWhep(videoEl as unknown as HTMLVideoElement);

      // Drive reconnectDelay to cap via repeated ICE failures:
      // call 1: delay=1000, next=2000
      // call 2: delay=2000, next=4000
      // call 3: delay=4000, next=8000
      // call 4: delay=8000, next=16000
      // call 5: delay=16000, next=30000 (min(32000,30000))
      // call 6: delay=30000, next=30000 (stays at cap)
      for (let i = 0; i < 6; i++) {
        mockPc.iceConnectionState = 'failed';
        mockPc.oniceconnectionstatechange!();
      }

      // Active timer fires in 30000ms — advance 29999ms, no reconnect yet
      vi.advanceTimersByTime(29999);
      expect(RTCPeerConnection).toHaveBeenCalledTimes(1); // only initial

      // Advance 1 more ms — timer fires and reconnect attempt begins
      await vi.advanceTimersByTimeAsync(1);
      expect(RTCPeerConnection).toHaveBeenCalledTimes(2); // reconnect created new PC

      await stopWhep();
    });

    // F4: DELETE is sent to old session URL before new WHEP connection on auto-reconnect
    it('sends DELETE to old session URL before establishing new connection on reconnect', async () => {
      const videoEl = makeMockVideoEl();
      const { useWhep } = await import('./useWhep');
      const { startWhep, stopWhep } = useWhep();
      await startWhep(videoEl as unknown as HTMLVideoElement);

      // Trigger reconnect via ICE failure
      mockPc.iceConnectionState = 'failed';
      mockPc.oniceconnectionstatechange!();

      // Advance past the 1s reconnect delay so connectWhep runs
      await vi.advanceTimersByTimeAsync(1001);

      const fetchMock = fetch as ReturnType<typeof vi.fn>;
      const calls = fetchMock.mock.calls as [string, RequestInit | undefined][];
      const callSummary = calls.map(([url, opts]) => ({
        url: url as string,
        method: (opts?.method ?? 'GET') as string,
      }));

      // Verify DELETE to old session was sent during reconnect
      const deleteIndex = callSummary.findIndex(
        (c) => c.url === SESSION_URL && c.method === 'DELETE',
      );
      expect(deleteIndex).toBeGreaterThan(-1);

      // Verify a second POST (new WHEP connection) was made after the DELETE
      const secondPostIndex = callSummary.findIndex(
        (c, i) => i > deleteIndex && c.method === 'POST',
      );
      expect(secondPostIndex).toBeGreaterThan(-1);

      await stopWhep();
    });
  });
});
