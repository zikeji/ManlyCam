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
        json: () => Promise.resolve({ state: 'explicit-offline' }),
      } as Response),
    );

    const { useStream } = await import('./useStream');
    const { streamState, initStream } = useStream();
    await initStream();
    expect(streamState.value).toBe('explicit-offline');
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
