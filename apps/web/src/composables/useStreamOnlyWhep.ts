import { ref } from 'vue';

const MAX_DELAY = 30_000;
const STALL_TIMEOUT_MS = 5_000;

export const useStreamOnlyWhep = (key: string) => {
  let pc: RTCPeerConnection | null = null;
  let sessionUrl: string | null = null;
  let storedVideoEl: HTMLVideoElement | null = null;
  let reconnectDelay = 1000;

  const isHealthy = ref(false);
  const isConnecting = ref(false);
  const isPermanentlyFailed = ref(false);

  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let lastTimeupdateAt = 0;
  let isMonitoring = false;

  // Forward reference: connectWhep and scheduleReconnect are mutually recursive.
  let scheduleReconnect = (): void => {};

  function clearStallTimer(): void {
    if (stallTimer !== null) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function resetStallTimer(): void {
    clearStallTimer();
    stallTimer = setTimeout(() => {
      stallTimer = null;
      if (isMonitoring && !document.hidden) {
        scheduleReconnect();
      }
    }, STALL_TIMEOUT_MS);
  }

  function onTimeupdate(): void {
    lastTimeupdateAt = Date.now();
    if (!isHealthy.value) {
      isHealthy.value = true;
      reconnectDelay = 1000;
      clearReconnectTimer();
    }
    if (!document.hidden) {
      resetStallTimer();
    }
  }

  function onVisibilityChange(): void {
    if (document.hidden) {
      clearStallTimer();
    } else if (isMonitoring && storedVideoEl && !storedVideoEl.paused) {
      const elapsed = Date.now() - lastTimeupdateAt;
      if (lastTimeupdateAt > 0 && elapsed > STALL_TIMEOUT_MS) {
        scheduleReconnect();
      } else {
        resetStallTimer();
      }
    }
  }

  function startMonitoring(videoEl: HTMLVideoElement): void {
    isMonitoring = true;
    lastTimeupdateAt = 0;
    videoEl.addEventListener('timeupdate', onTimeupdate);
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (!document.hidden) {
      resetStallTimer();
    }
  }

  function stopMonitoring(): void {
    isMonitoring = false;
    clearStallTimer();
    if (storedVideoEl) {
      storedVideoEl.removeEventListener('timeupdate', onTimeupdate);
    }
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }

  async function connectWhep(videoEl: HTMLVideoElement): Promise<void> {
    stopMonitoring();
    clearReconnectTimer();

    if (sessionUrl) {
      await fetch(sessionUrl, { method: 'DELETE' }).catch(() => {});
      sessionUrl = null;
    }
    if (pc) {
      pc.oniceconnectionstatechange = null;
      pc.onconnectionstatechange = null;
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.close();
      pc = null;
    }

    isHealthy.value = false;
    isConnecting.value = true;

    try {
      pc = new RTCPeerConnection({ iceServers: [] });
      pc.addTransceiver('video', { direction: 'recvonly' });

      pc.ontrack = (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        videoEl.srcObject = stream;
        videoEl.play().catch(() => {});
      };

      pc.onicecandidate = ({ candidate }) => {
        if (candidate && sessionUrl) {
          fetch(sessionUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/trickle-ice-sdpfrag' },
            body: candidate.candidate,
          }).catch(() => {});
        }
      };

      pc.oniceconnectionstatechange = () => {
        /* c8 ignore next 2 -- pc is guaranteed non-null inside this closure */
        if (!pc) return;
        const { iceConnectionState } = pc;
        if (
          iceConnectionState === 'failed' ||
          iceConnectionState === 'disconnected' ||
          iceConnectionState === 'closed'
        ) {
          scheduleReconnect();
        }
      };

      pc.onconnectionstatechange = () => {
        /* c8 ignore next 2 -- pc is guaranteed non-null inside this closure */
        if (!pc) return;
        const { connectionState } = pc;
        if (
          connectionState === 'failed' ||
          connectionState === 'disconnected' ||
          connectionState === 'closed'
        ) {
          scheduleReconnect();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await fetch(`/api/stream-only/${key}/whep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      });

      if (res.status === 404) {
        isPermanentlyFailed.value = true;
        // Clean up and do NOT schedule reconnect
        if (pc) {
          pc.oniceconnectionstatechange = null;
          pc.onconnectionstatechange = null;
          pc.onicecandidate = null;
          pc.ontrack = null;
          pc.close();
          pc = null;
        }
        return;
      }

      if (!res.ok) {
        throw new Error(`WHEP POST failed: ${res.status}`);
      }

      // Server rewrites Location header to include key — use it directly
      sessionUrl = res.headers.get('Location');
      const sdpAnswer = await res.text();

      await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });

      startMonitoring(videoEl);
    } catch (error) {
      if (sessionUrl) {
        await fetch(sessionUrl, { method: 'DELETE' }).catch(() => {});
        sessionUrl = null;
      }
      if (pc) {
        pc.oniceconnectionstatechange = null;
        pc.onconnectionstatechange = null;
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.close();
        pc = null;
      }
      throw error;
    } finally {
      isConnecting.value = false;
    }
  }

  scheduleReconnect = (): void => {
    /* c8 ignore next 2 -- storedVideoEl is always set when scheduleReconnect fires; guard against stop() race */
    if (!storedVideoEl) return;
    clearStallTimer();
    clearReconnectTimer();
    isHealthy.value = false;
    const delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
    const el = storedVideoEl;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectWhep(el).catch(() => {
        // connectWhep cleaned up on error; schedule next attempt
        scheduleReconnect();
      });
    }, delay);
  };

  const stopWhep = async (): Promise<void> => {
    clearReconnectTimer();
    stopMonitoring();
    const capturedSessionUrl = sessionUrl;
    const capturedPc = pc;
    sessionUrl = null;
    pc = null;
    storedVideoEl = null;
    isHealthy.value = false;
    isConnecting.value = false;
    if (capturedSessionUrl) {
      await fetch(capturedSessionUrl, { method: 'DELETE' }).catch(() => {});
    }
    if (capturedPc) {
      capturedPc.oniceconnectionstatechange = null;
      capturedPc.onconnectionstatechange = null;
      capturedPc.onicecandidate = null;
      capturedPc.ontrack = null;
      capturedPc.close();
    }
  };

  const startWhep = async (videoEl: HTMLVideoElement): Promise<void> => {
    storedVideoEl = videoEl;
    reconnectDelay = 1000;
    await connectWhep(videoEl);
  };

  return { startWhep, stopWhep, isHealthy, isConnecting, isPermanentlyFailed };
};
