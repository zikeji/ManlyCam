import { ref, onUnmounted } from 'vue';
import Hls from 'hls.js';

const HLS_URL = '/api/stream/hls/index.m3u8';

export function useHlsPlayer() {
  let hls: Hls | null = null;

  const isReady = ref(false);
  const isPlaying = ref(false);
  const error = ref<string | null>(null);
  const currentTime = ref(0);
  const duration = ref(0);
  const programDateTimeMs = ref(0);

  let videoEl: HTMLVideoElement | null = null;
  let timeUpdateHandler: (() => void) | null = null;
  let playingHandler: (() => void) | null = null;
  let pauseHandler: (() => void) | null = null;

  function destroy(): void {
    if (videoEl) {
      if (timeUpdateHandler) videoEl.removeEventListener('timeupdate', timeUpdateHandler);
      if (playingHandler) videoEl.removeEventListener('playing', playingHandler);
      if (pauseHandler) videoEl.removeEventListener('pause', pauseHandler);
    }
    if (hls) {
      hls.destroy();
      hls = null;
    }
    isReady.value = false;
    isPlaying.value = false;
    error.value = null;
    currentTime.value = 0;
    duration.value = 0;
    programDateTimeMs.value = 0;
    videoEl = null;
    timeUpdateHandler = null;
    playingHandler = null;
    pauseHandler = null;
  }

  function initHls(video: HTMLVideoElement): void {
    destroy();
    videoEl = video;
    error.value = null;
    isReady.value = false;

    if (!Hls.isSupported()) {
      error.value = 'Your browser does not support this feature';
      return;
    }

    try {
      hls = new Hls({
        liveDurationInfinity: true,
        liveSyncDurationCount: 3,
        // Set very high to prevent auto-seek to live edge during clip editing
        liveMaxLatencyDurationCount: 9999,
      });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        isReady.value = true;
        error.value = null;
      });

      hls.on(Hls.Events.FRAG_LOADED, (_event, data) => {
        const pdt = data.frag.programDateTime;
        // Lock to the first fragment only — subsequent fragments recalculate with
        // slightly different frag.start offsets, causing the timeline to drift.
        if (pdt && pdt > 0 && programDateTimeMs.value === 0) {
          programDateTimeMs.value = pdt - data.frag.start * 1000;
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (data.response && data.response.code === 502) {
            error.value = 'Stream unavailable — server cannot reach media source';
          } else {
            error.value = 'Network error — check your connection';
          }
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          error.value = 'Playback error — try again';
        } else {
          error.value = 'Failed to load stream';
        }
      });

      hls.loadSource(HLS_URL);
      hls.attachMedia(video);

      timeUpdateHandler = () => {
        currentTime.value = video.currentTime;
        duration.value = video.duration;
      };
      playingHandler = () => {
        isPlaying.value = true;
      };
      pauseHandler = () => {
        isPlaying.value = false;
      };
      video.addEventListener('timeupdate', timeUpdateHandler);
      video.addEventListener('playing', playingHandler);
      video.addEventListener('pause', pauseHandler);
    } catch {
      error.value = 'Your browser does not support this feature';
    }
  }

  function seekTo(time: number): void {
    if (videoEl) {
      videoEl.currentTime = time;
    }
  }

  function play(): void {
    videoEl?.play().catch(() => {});
  }

  function pause(): void {
    videoEl?.pause();
  }

  onUnmounted(() => {
    destroy();
  });

  return {
    isReady,
    isPlaying,
    error,
    currentTime,
    duration,
    programDateTimeMs,
    initHls,
    destroy,
    seekTo,
    play,
    pause,
  };
}
