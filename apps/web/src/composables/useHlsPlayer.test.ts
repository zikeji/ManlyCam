import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoist mock variables so they are available in vi.mock factory
const { mockOn, mockLoadSource, mockAttachMedia, mockDestroy, MockHls } = vi.hoisted(() => {
  const on = vi.fn();
  const loadSource = vi.fn();
  const attachMedia = vi.fn();
  const destroy = vi.fn();

  const Hls = vi.fn(() => ({
    on,
    loadSource,
    attachMedia,
    destroy,
  }));
  (Hls as unknown as Record<string, unknown>).isSupported = vi.fn().mockReturnValue(true);
  (Hls as unknown as Record<string, unknown>).Events = {
    MANIFEST_PARSED: 'hlsManifestParsed',
    FRAG_LOADED: 'hlsFragLoaded',
    ERROR: 'hlsError',
  };
  (Hls as unknown as Record<string, unknown>).ErrorTypes = {
    NETWORK_ERROR: 'networkError',
    MEDIA_ERROR: 'mediaError',
  };

  return {
    mockOn: on,
    mockLoadSource: loadSource,
    mockAttachMedia: attachMedia,
    mockDestroy: destroy,
    MockHls: Hls,
  };
});

vi.mock('hls.js', () => ({
  default: MockHls,
}));

// Stub onUnmounted so tests don't need a component context
vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return { ...actual, onUnmounted: vi.fn() };
});

import { useHlsPlayer } from './useHlsPlayer';

function createMockVideo(): HTMLVideoElement {
  const el = document.createElement('video');
  vi.spyOn(el, 'play').mockResolvedValue(undefined);
  vi.spyOn(el, 'pause').mockImplementation(() => {});
  return el;
}

describe('useHlsPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (MockHls as unknown as { isSupported: ReturnType<typeof vi.fn> }).isSupported.mockReturnValue(
      true,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns expected refs and functions', () => {
    const player = useHlsPlayer();
    expect(player.isReady.value).toBe(false);
    expect(player.error.value).toBeNull();
    expect(player.currentTime.value).toBe(0);
    expect(player.duration.value).toBe(0);
    expect(player.programDateTimeMs.value).toBe(0);
    expect(typeof player.initHls).toBe('function');
    expect(typeof player.destroy).toBe('function');
    expect(typeof player.seekTo).toBe('function');
    expect(typeof player.play).toBe('function');
    expect(typeof player.pause).toBe('function');
  });

  describe('initHls', () => {
    it('creates HLS instance and attaches to video element', () => {
      const { initHls } = useHlsPlayer();
      const video = createMockVideo();
      initHls(video);

      expect(MockHls).toHaveBeenCalledWith(expect.objectContaining({ liveDurationInfinity: true }));
      expect(mockLoadSource).toHaveBeenCalledWith('/api/stream/hls/index.m3u8');
      expect(mockAttachMedia).toHaveBeenCalledWith(video);
    });

    it('sets isReady on MANIFEST_PARSED event', () => {
      const { initHls, isReady } = useHlsPlayer();
      initHls(createMockVideo());

      // Find the MANIFEST_PARSED callback
      const manifestCall = mockOn.mock.calls.find((c) => c[0] === 'hlsManifestParsed');
      expect(manifestCall).toBeDefined();
      manifestCall![1]();
      expect(isReady.value).toBe(true);
    });

    it('sets programDateTimeMs on first FRAG_LOADED event (wall-clock at media time 0)', () => {
      const { initHls, programDateTimeMs } = useHlsPlayer();
      initHls(createMockVideo());

      const fragCall = mockOn.mock.calls.find((c) => c[0] === 'hlsFragLoaded');
      expect(fragCall).toBeDefined();
      fragCall![1]('event', { frag: { programDateTime: 1700000000000, start: 30 } });
      // programDateTimeMs = pdt - frag.start * 1000 (reference point at media time 0)
      expect(programDateTimeMs.value).toBe(1700000000000 - 30000);
    });

    it('locks programDateTimeMs to first fragment and ignores subsequent fragments', () => {
      const { initHls, programDateTimeMs } = useHlsPlayer();
      initHls(createMockVideo());

      const fragCall = mockOn.mock.calls.find((c) => c[0] === 'hlsFragLoaded');
      fragCall![1]('event', { frag: { programDateTime: 1700000000000, start: 30 } });
      const firstValue = programDateTimeMs.value;

      // Subsequent fragment with different timing should NOT update
      fragCall![1]('event', { frag: { programDateTime: 1700000002000, start: 32 } });
      expect(programDateTimeMs.value).toBe(firstValue);
    });

    it('ignores FRAG_LOADED with no programDateTime', () => {
      const { initHls, programDateTimeMs } = useHlsPlayer();
      initHls(createMockVideo());

      const fragCall = mockOn.mock.calls.find((c) => c[0] === 'hlsFragLoaded');
      fragCall![1]('event', { frag: { programDateTime: null } });
      expect(programDateTimeMs.value).toBe(0);
    });

    it('sets network error on fatal NETWORK_ERROR', () => {
      const { initHls, error } = useHlsPlayer();
      initHls(createMockVideo());

      const errorCall = mockOn.mock.calls.find((c) => c[0] === 'hlsError');
      errorCall![1]('event', { fatal: true, type: 'networkError' });
      expect(error.value).toBe('Network error — check your connection');
    });

    it('sets 502 error on fatal NETWORK_ERROR with response code 502', () => {
      const { initHls, error } = useHlsPlayer();
      initHls(createMockVideo());

      const errorCall = mockOn.mock.calls.find((c) => c[0] === 'hlsError');
      errorCall![1]('event', {
        fatal: true,
        type: 'networkError',
        response: { code: 502 },
      });
      expect(error.value).toBe('Stream unavailable — server cannot reach media source');
    });

    it('sets media error on fatal MEDIA_ERROR', () => {
      const { initHls, error } = useHlsPlayer();
      initHls(createMockVideo());

      const errorCall = mockOn.mock.calls.find((c) => c[0] === 'hlsError');
      errorCall![1]('event', { fatal: true, type: 'mediaError' });
      expect(error.value).toBe('Playback error — try again');
    });

    it('sets generic error on other fatal errors', () => {
      const { initHls, error } = useHlsPlayer();
      initHls(createMockVideo());

      const errorCall = mockOn.mock.calls.find((c) => c[0] === 'hlsError');
      errorCall![1]('event', { fatal: true, type: 'otherError' });
      expect(error.value).toBe('Failed to load stream');
    });

    it('ignores non-fatal errors', () => {
      const { initHls, error } = useHlsPlayer();
      initHls(createMockVideo());

      const errorCall = mockOn.mock.calls.find((c) => c[0] === 'hlsError');
      errorCall![1]('event', { fatal: false, type: 'networkError' });
      expect(error.value).toBeNull();
    });

    it('sets error if Hls.isSupported() returns false', () => {
      (MockHls as unknown as { isSupported: ReturnType<typeof vi.fn> }).isSupported.mockReturnValue(
        false,
      );
      const { initHls, error } = useHlsPlayer();
      initHls(createMockVideo());
      expect(error.value).toBe('Your browser does not support this feature');
    });

    it('destroys previous instance when initHls called again', () => {
      const { initHls } = useHlsPlayer();
      initHls(createMockVideo());
      mockDestroy.mockClear();
      initHls(createMockVideo());
      expect(mockDestroy).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('resets all state including programDateTimeMs', () => {
      const { initHls, destroy, isReady, error, currentTime, duration, programDateTimeMs } =
        useHlsPlayer();
      initHls(createMockVideo());

      // Simulate ready state
      const manifestCall = mockOn.mock.calls.find((c) => c[0] === 'hlsManifestParsed');
      manifestCall![1]();
      expect(isReady.value).toBe(true);

      // Set programDateTimeMs via FRAG_LOADED
      const fragCall = mockOn.mock.calls.find((c) => c[0] === 'hlsFragLoaded');
      fragCall![1]('event', { frag: { programDateTime: 1700000000000, start: 10 } });
      expect(programDateTimeMs.value).toBe(1700000000000 - 10000);

      destroy();
      expect(isReady.value).toBe(false);
      expect(error.value).toBeNull();
      expect(currentTime.value).toBe(0);
      expect(duration.value).toBe(0);
      expect(programDateTimeMs.value).toBe(0);
      expect(mockDestroy).toHaveBeenCalled();
    });
  });

  describe('seekTo', () => {
    it('sets video currentTime', () => {
      const { initHls, seekTo } = useHlsPlayer();
      const video = createMockVideo();
      initHls(video);
      seekTo(42.5);
      expect(video.currentTime).toBe(42.5);
    });

    it('is a no-op without initHls', () => {
      const { seekTo } = useHlsPlayer();
      expect(() => seekTo(10)).not.toThrow();
    });
  });

  describe('play/pause', () => {
    it('play calls video.play()', () => {
      const { initHls, play } = useHlsPlayer();
      const video = createMockVideo();
      initHls(video);
      play();
      expect(video.play).toHaveBeenCalled();
    });

    it('pause calls video.pause()', () => {
      const { initHls, pause } = useHlsPlayer();
      const video = createMockVideo();
      initHls(video);
      pause();
      expect(video.pause).toHaveBeenCalled();
    });
  });

  describe('timeupdate', () => {
    it('updates currentTime and duration on timeupdate event', () => {
      const { initHls, currentTime, duration } = useHlsPlayer();
      const video = createMockVideo();
      initHls(video);

      // Simulate timeupdate
      Object.defineProperty(video, 'currentTime', { value: 12.5, writable: true });
      Object.defineProperty(video, 'duration', { value: 300, writable: true });
      video.dispatchEvent(new Event('timeupdate'));

      expect(currentTime.value).toBe(12.5);
      expect(duration.value).toBe(300);
    });
  });

  describe('constructor error', () => {
    it('sets error when Hls constructor throws', () => {
      (MockHls as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('MSE not available');
      });
      const { initHls, error } = useHlsPlayer();
      initHls(createMockVideo());
      expect(error.value).toBe('Your browser does not support this feature');
    });
  });
});
