import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('useStream', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('streamState starts as connecting', async () => {
    const { useStream } = await import('./useStream');
    const { streamState } = useStream();
    expect(streamState.value).toBe('connecting');
  });

  it('piReachableWhileOffline starts as false', async () => {
    const { useStream } = await import('./useStream');
    const { piReachableWhileOffline } = useStream();
    expect(piReachableWhileOffline.value).toBe(false);
  });

  it('offline message refs start as null', async () => {
    const { useStream } = await import('./useStream');
    const { offlineEmoji, offlineTitle, offlineDescription } = useStream();
    expect(offlineEmoji.value).toBeNull();
    expect(offlineTitle.value).toBeNull();
    expect(offlineDescription.value).toBeNull();
  });

  it('initStream sets state to live when server returns live', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ state: 'live' }),
      } as Response),
    );

    const { useStream } = await import('./useStream');
    const { streamState, initStream } = useStream();
    await initStream();
    expect(streamState.value).toBe('live');
  });

  it('initStream sets state to unreachable when server returns unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ state: 'unreachable', adminToggle: 'live' }),
      } as Response),
    );

    const { useStream } = await import('./useStream');
    const { streamState, initStream } = useStream();
    await initStream();
    expect(streamState.value).toBe('unreachable');
  });

  it('initStream sets state to explicit-offline when server returns explicit-offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ state: 'explicit-offline', piReachable: false }),
      } as Response),
    );

    const { useStream } = await import('./useStream');
    const { streamState, piReachableWhileOffline, initStream } = useStream();
    await initStream();
    expect(streamState.value).toBe('explicit-offline');
    expect(piReachableWhileOffline.value).toBe(false);
  });

  it('initStream sets offline message fields from explicit-offline payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            state: 'explicit-offline',
            piReachable: false,
            offlineEmoji: '1f600',
            offlineTitle: 'Custom Title',
            offlineDescription: 'Custom Desc',
          }),
      } as Response),
    );

    const { useStream } = await import('./useStream');
    const { offlineEmoji, offlineTitle, offlineDescription, initStream } = useStream();
    await initStream();
    expect(offlineEmoji.value).toBe('1f600');
    expect(offlineTitle.value).toBe('Custom Title');
    expect(offlineDescription.value).toBe('Custom Desc');
  });

  it('initStream sets piReachableWhileOffline=true when explicit-offline + piReachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ state: 'explicit-offline', piReachable: true }),
      } as Response),
    );

    const { useStream } = await import('./useStream');
    const { streamState, piReachableWhileOffline, initStream } = useStream();
    await initStream();
    expect(streamState.value).toBe('explicit-offline');
    expect(piReachableWhileOffline.value).toBe(true);
  });

  it('initStream keeps state as connecting on fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const { useStream } = await import('./useStream');
    const { streamState, initStream } = useStream();
    await initStream();
    expect(streamState.value).toBe('connecting');
  });

  it('initStream keeps state as connecting on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }),
      } as Response),
    );

    const { useStream } = await import('./useStream');
    const { streamState, initStream } = useStream();
    await initStream();
    expect(streamState.value).toBe('connecting');
  });

  it('setStateFromWs updates streamState from WS payload (live)', async () => {
    const { useStream } = await import('./useStream');
    const { streamState, setStateFromWs } = useStream();
    setStateFromWs({ state: 'live' });
    expect(streamState.value).toBe('live');
  });

  it('setStateFromWs updates streamState from WS payload (explicit-offline)', async () => {
    const { useStream } = await import('./useStream');
    const { streamState, setStateFromWs } = useStream();
    setStateFromWs({ state: 'explicit-offline' });
    expect(streamState.value).toBe('explicit-offline');
  });

  it('setStateFromWs populates offline message fields from explicit-offline WS payload', async () => {
    const { useStream } = await import('./useStream');
    const { offlineEmoji, offlineTitle, offlineDescription, setStateFromWs } = useStream();
    setStateFromWs({
      state: 'explicit-offline',
      offlineEmoji: '1f634',
      offlineTitle: 'WS Title',
      offlineDescription: 'WS Desc',
    });
    expect(offlineEmoji.value).toBe('1f634');
    expect(offlineTitle.value).toBe('WS Title');
    expect(offlineDescription.value).toBe('WS Desc');
  });

  it('setStateFromWs clears offline fields when transitioning away from explicit-offline', async () => {
    const { useStream } = await import('./useStream');
    const { offlineEmoji, offlineTitle, offlineDescription, setStateFromWs } = useStream();
    setStateFromWs({
      state: 'explicit-offline',
      offlineEmoji: '1f600',
      offlineTitle: 'T',
      offlineDescription: 'D',
    });
    setStateFromWs({ state: 'live' });
    expect(offlineEmoji.value).toBeNull();
    expect(offlineTitle.value).toBeNull();
    expect(offlineDescription.value).toBeNull();
  });

  it('setStateFromWs sets piReachableWhileOffline=true when explicit-offline + piReachable', async () => {
    const { useStream } = await import('./useStream');
    const { piReachableWhileOffline, setStateFromWs } = useStream();
    setStateFromWs({ state: 'explicit-offline', piReachable: true });
    expect(piReachableWhileOffline.value).toBe(true);
  });

  it('setStateFromWs sets piReachableWhileOffline=false when explicit-offline + piReachable false', async () => {
    const { useStream } = await import('./useStream');
    const { piReachableWhileOffline, setStateFromWs } = useStream();
    setStateFromWs({ state: 'explicit-offline', piReachable: false });
    expect(piReachableWhileOffline.value).toBe(false);
  });

  it('setStateFromWs clears piReachableWhileOffline when transitioning to live', async () => {
    const { useStream } = await import('./useStream');
    const { piReachableWhileOffline, setStateFromWs } = useStream();
    setStateFromWs({ state: 'explicit-offline', piReachable: true });
    expect(piReachableWhileOffline.value).toBe(true);
    setStateFromWs({ state: 'live' });
    expect(piReachableWhileOffline.value).toBe(false);
  });

  it('setStateFromWs clears piReachableWhileOffline when transitioning to unreachable', async () => {
    const { useStream } = await import('./useStream');
    const { piReachableWhileOffline, setStateFromWs } = useStream();
    setStateFromWs({ state: 'explicit-offline', piReachable: true });
    setStateFromWs({ state: 'unreachable', adminToggle: 'live' });
    expect(piReachableWhileOffline.value).toBe(false);
  });

  it('setStateFromWs updates streamState from WS payload (unreachable)', async () => {
    const { useStream } = await import('./useStream');
    const { streamState, setStateFromWs } = useStream();
    setStateFromWs({ state: 'unreachable', adminToggle: 'live' });
    expect(streamState.value).toBe('unreachable');
  });

  it('all callers share the same streamState ref (module-level singleton)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ state: 'live' }),
      } as Response),
    );

    const { useStream } = await import('./useStream');
    const { streamState: a, initStream } = useStream();
    const { streamState: b } = useStream();
    await initStream();
    expect(a.value).toBe('live');
    expect(b.value).toBe('live');
    expect(a).toBe(b); // same ref object
  });
});
