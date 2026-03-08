let pc: RTCPeerConnection | null = null;
let sessionUrl: string | null = null;

export const useWhep = () => {
  const stopWhep = async (): Promise<void> => {
    if (sessionUrl) {
      await fetch(sessionUrl, { method: 'DELETE', credentials: 'include' }).catch(() => {});
      sessionUrl = null;
    }
    if (pc) {
      pc.close();
      pc = null;
    }
  };

  const startWhep = async (videoEl: HTMLVideoElement): Promise<void> => {
    await stopWhep();

    pc = new RTCPeerConnection({ iceServers: [] });
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });

    // Wire up handlers BEFORE setRemoteDescription — ontrack fires synchronously
    // during setRemoteDescription processing and would be missed if set afterwards.
    pc.ontrack = (event) => {
      // Use the associated stream if present; otherwise wrap the track directly.
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

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const res = await fetch('/api/stream/whep', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/sdp' },
      body: offer.sdp,
    });

    sessionUrl = res.headers.get('Location');
    const sdpAnswer = await res.text();

    // ontrack will fire during this call — handler is already set above.
    await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });
  };

  return { startWhep, stopWhep };
};
