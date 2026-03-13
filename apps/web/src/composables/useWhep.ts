import { ref } from 'vue';

let pc: RTCPeerConnection | null = null;
let sessionUrl: string | null = null;
let storedVideoEl: HTMLVideoElement | null = null;
let reconnectDelay = 1000;
const MAX_DELAY = 30_000;
// 5s chosen to detect frozen video without false positives from normal network jitter
const STALL_TIMEOUT_MS = 5_000;

const isHealthy = ref(false);
// clientFrozen is true only after a healthy stream loses connection — not during initial connect.
// This prevents showing the reconnecting overlay on first page load.
const clientFrozen = ref(false);

let stallTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastTimeupdateAt = 0;
let isMonitoring = false;

// Forward reference: connectWhep and scheduleReconnect are mutually recursive.
// Declared first so all functions below can safely reference it;
// the actual implementation is assigned after connectWhep is defined.
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
    clientFrozen.value = false;
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
    // Returned to visible — if stream was frozen while backgrounded, reconnect immediately
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
    await fetch(sessionUrl, { method: 'DELETE', credentials: 'include' }).catch(() => {});
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

  try {
    pc = new RTCPeerConnection({ iceServers: [] });
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    // Wire up handlers BEFORE setRemoteDescription — ontrack fires synchronously
    // during setRemoteDescription processing and would be missed if set afterwards.
    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      videoEl.srcObject = stream;
      videoEl.play().catch(() => {});
    };

    // Trickle ICE — fire-and-forget; errors non-fatal
    pc.onicecandidate = ({ candidate }) => {
      if (candidate && sessionUrl) {
        fetch(sessionUrl, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/trickle-ice-sdpfrag' },
          body: candidate.candidate,
        }).catch(() => {});
      }
    };

    pc.oniceconnectionstatechange = () => {
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

    const res = await fetch('/api/stream/whep', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/sdp' },
      body: offer.sdp,
    });

    if (!res.ok) {
      throw new Error(`WHEP POST failed: ${res.status}`);
    }

    sessionUrl = res.headers.get('Location');
    const sdpAnswer = await res.text();

    // ontrack will fire during this call — handler is already set above.
    await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });

    startMonitoring(videoEl);
  } catch (error) {
    // Clean up on error so caller can retry
    if (sessionUrl) {
      await fetch(sessionUrl, { method: 'DELETE', credentials: 'include' }).catch(() => {});
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
  }
}

// Actual implementation assigned after connectWhep is defined (mutual recursion)
scheduleReconnect = (): void => {
  if (!storedVideoEl) return;
  clearStallTimer();
  clearReconnectTimer();
  isHealthy.value = false;
  clientFrozen.value = true;
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

export const useWhep = () => {
  const stopWhep = async (): Promise<void> => {
    clearReconnectTimer();
    stopMonitoring();
    // Capture-and-clear: clear module state synchronously before async ops to prevent a
    // concurrent startWhep (e.g. from component remount on layout change) from seeing
    // stale sessionUrl/pc and sending a duplicate DELETE or closing the new connection.
    const capturedSessionUrl = sessionUrl;
    const capturedPc = pc;
    sessionUrl = null;
    pc = null;
    storedVideoEl = null;
    // If we were healthy when stopped, the next load is a reconnect — preserve that signal
    // so the spinner shows "Reconnecting..." (covers layout-change remounts, not just stall/ICE)
    clientFrozen.value = isHealthy.value;
    isHealthy.value = false;
    if (capturedSessionUrl) {
      await fetch(capturedSessionUrl, { method: 'DELETE', credentials: 'include' }).catch(() => {});
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

  return { startWhep, stopWhep, isHealthy, clientFrozen };
};
