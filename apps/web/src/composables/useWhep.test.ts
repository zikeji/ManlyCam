import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const SESSION_URL = '/api/stream/whep/test-uuid';

function makeMockPc() {
  return {
    addTransceiver: vi.fn(),
    createOffer: vi.fn().mockResolvedValue({ sdp: 'v=0\r\noffer-sdp' }),
    setLocalDescription: vi.fn().mockResolvedValue(undefined),
    setRemoteDescription: vi.fn().mockResolvedValue(undefined),
    onicecandidate: null as ((e: { candidate: RTCIceCandidate | null }) => void) | null,
    ontrack: null as ((e: { streams: MediaStream[] }) => void) | null,
    close: vi.fn(),
  };
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
    const videoEl = { srcObject: null, play: vi.fn().mockResolvedValue(undefined) };
    const { useWhep } = await import('./useWhep');
    const { startWhep } = useWhep();
    await startWhep(videoEl as unknown as HTMLVideoElement);
    expect(mockPc.addTransceiver).toHaveBeenCalledWith('video', { direction: 'recvonly' });
    expect(mockPc.addTransceiver).toHaveBeenCalledWith('audio', { direction: 'recvonly' });
  });

  it('startWhep calls createOffer and setLocalDescription', async () => {
    const videoEl = { srcObject: null, play: vi.fn().mockResolvedValue(undefined) };
    const { useWhep } = await import('./useWhep');
    const { startWhep } = useWhep();
    await startWhep(videoEl as unknown as HTMLVideoElement);
    expect(mockPc.createOffer).toHaveBeenCalled();
    expect(mockPc.setLocalDescription).toHaveBeenCalledWith({ sdp: 'v=0\r\noffer-sdp' });
  });

  it('startWhep POSTs SDP offer to /api/stream/whep', async () => {
    const videoEl = { srcObject: null, play: vi.fn().mockResolvedValue(undefined) };
    const { useWhep } = await import('./useWhep');
    const { startWhep } = useWhep();
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
  });

  it('startWhep calls setRemoteDescription with SDP answer', async () => {
    const videoEl = { srcObject: null, play: vi.fn().mockResolvedValue(undefined) };
    const { useWhep } = await import('./useWhep');
    const { startWhep } = useWhep();
    await startWhep(videoEl as unknown as HTMLVideoElement);
    expect(mockPc.setRemoteDescription).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'v=0\r\nanswer-sdp',
    });
  });

  it('startWhep attaches stream to video srcObject via ontrack', async () => {
    const mockStream = {} as MediaStream;
    const videoEl = {
      srcObject: null as MediaStream | null,
      play: vi.fn().mockResolvedValue(undefined),
    };
    const { useWhep } = await import('./useWhep');
    const { startWhep } = useWhep();
    await startWhep(videoEl as unknown as HTMLVideoElement);
    // Simulate ontrack event
    mockPc.ontrack!({ streams: [mockStream] });
    expect(videoEl.srcObject).toBe(mockStream);
    expect(videoEl.play).toHaveBeenCalled();
  });

  it('stopWhep sends DELETE to session URL and closes peer connection', async () => {
    const videoEl = { srcObject: null, play: vi.fn().mockResolvedValue(undefined) };
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
    const videoEl = { srcObject: null, play: vi.fn().mockResolvedValue(undefined) };
    const { useWhep } = await import('./useWhep');
    const { startWhep } = useWhep();
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
  });
});
