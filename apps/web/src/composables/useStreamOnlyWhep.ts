import { ref } from 'vue';

// 5s chosen to detect frozen video without false positives from normal network jitter
const STALL_TIMEOUT_MS = 5_000;

export const useStreamOnlyWhep = (key: string) => {
  let stopped = false;
  let sse: EventSource | null = null;
  let whepAbortCtrl: AbortController | null = null;

  // WHEP connection state
  let pc: RTCPeerConnection | null = null;
  let sessionUrl: string | null = null;
  let storedVideoEl: HTMLVideoElement | null = null;
  let isMonitoring = false;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  let lastTimeupdateAt = 0;

  const isHealthy = ref(false);
  const isConnecting = ref(false);
  const isPermanentlyFailed = ref(false);

  function clearStallTimer(): void {
    if (stallTimer !== null) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
  }

  function reconnectSse(): void {
    sse?.close();
    sse = null;
    if (!stopped && !isPermanentlyFailed.value && storedVideoEl) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      openSse(storedVideoEl);
    }
  }

  function resetStallTimer(): void {
    clearStallTimer();
    stallTimer = setTimeout(() => {
      stallTimer = null;
      if (isMonitoring && !document.hidden) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        teardownWhep();
        reconnectSse();
      }
    }, STALL_TIMEOUT_MS);
  }

  function onTimeupdate(): void {
    lastTimeupdateAt = Date.now();
    if (!isHealthy.value) {
      isHealthy.value = true;
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
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        teardownWhep();
        reconnectSse();
      } else {
        resetStallTimer();
      }
    }
  }

  function startMonitoring(el: HTMLVideoElement): void {
    isMonitoring = true;
    lastTimeupdateAt = 0;
    el.addEventListener('timeupdate', onTimeupdate);
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

  function teardownWhep(): void {
    stopMonitoring();
    isHealthy.value = false;
    isConnecting.value = false;
    whepAbortCtrl?.abort();
    whepAbortCtrl = null;
    if (sessionUrl) {
      const url = sessionUrl;
      sessionUrl = null;
      void (async () => {
        try {
          await fetch(url, { method: 'DELETE' });
        } catch {
          // best-effort teardown DELETE — ignore
        }
      })();
    }
    if (pc) {
      pc.oniceconnectionstatechange = null;
      pc.onconnectionstatechange = null;
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.close();
      pc = null;
    }
  }

  async function connectWhep(el: HTMLVideoElement): Promise<void> {
    teardownWhep();
    whepAbortCtrl = new AbortController();
    isConnecting.value = true;

    try {
      pc = new RTCPeerConnection({ iceServers: [] });
      pc.addTransceiver('video', { direction: 'recvonly' });

      pc.ontrack = async (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        el.srcObject = stream;
        try {
          await el.play();
        } catch {
          // autoplay restriction — ignore
        }
      };

      pc.onicecandidate = async ({ candidate }) => {
        if (candidate && sessionUrl) {
          try {
            await fetch(sessionUrl, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/trickle-ice-sdpfrag' },
              body: candidate.candidate,
            });
          } catch {
            // trickle ICE failure — non-fatal
          }
        }
      };

      // ICE/connection failure → teardown + reconnect SSE to get fresh state
      pc.oniceconnectionstatechange = () => {
        /* c8 ignore next 2 -- pc is guaranteed non-null inside this closure */
        if (!pc) return;
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
          teardownWhep();
          reconnectSse();
        }
      };

      pc.onconnectionstatechange = () => {
        /* c8 ignore next 2 -- pc is guaranteed non-null inside this closure */
        if (!pc) return;
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          teardownWhep();
          reconnectSse();
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await fetch(`/api/stream-only/${key}/whep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: offer.sdp,
        signal: whepAbortCtrl.signal,
      });

      if (res.status === 404) {
        isPermanentlyFailed.value = true;
        return;
      }

      if (!res.ok) {
        throw new Error(`WHEP POST failed: ${res.status}`);
      }

      sessionUrl = res.headers.get('Location');
      const sdpAnswer = await res.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });

      startMonitoring(el);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (sessionUrl) {
        const url = sessionUrl;
        sessionUrl = null;
        try {
          await fetch(url, { method: 'DELETE' });
        } catch {
          // best-effort cleanup — ignore
        }
      }
      if (pc) {
        pc.oniceconnectionstatechange = null;
        pc.onconnectionstatechange = null;
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.close();
        pc = null;
      }
      throw err;
    } finally {
      isConnecting.value = false;
      whepAbortCtrl = null;
    }
  }

  function openSse(el: HTMLVideoElement): void {
    const es = new EventSource(`/api/stream-only/${key}/sse`);
    sse = es;

    es.onmessage = async (event: MessageEvent) => {
      if (stopped || isPermanentlyFailed.value) return;
      const data = JSON.parse(event.data as string) as { live: boolean };
      if (data.live && !pc && !isConnecting.value) {
        try {
          await connectWhep(el);
        } catch {
          if (!stopped && !isPermanentlyFailed.value) {
            setTimeout(reconnectSse, 2000);
          }
        }
      } else if (!data.live) {
        teardownWhep();
      }
    };

    es.addEventListener('not-found', () => {
      isPermanentlyFailed.value = true;
      teardownWhep();
      es.close();
      sse = null;
    });

    es.onerror = () => {
      if (stopped || isPermanentlyFailed.value) return;
      // SSE connection dropped — teardown WHEP; EventSource auto-reconnects and will
      // re-send current state, restarting WHEP if Pi is still reachable.
      teardownWhep();
    };
  }

  const startWhep = (el: HTMLVideoElement): void => {
    storedVideoEl = el;
    openSse(el);
  };

  const stopWhep = (): void => {
    stopped = true;
    sse?.close();
    sse = null;
    teardownWhep();
    storedVideoEl = null;
  };

  return { startWhep, stopWhep, isHealthy, isConnecting, isPermanentlyFailed };
};
