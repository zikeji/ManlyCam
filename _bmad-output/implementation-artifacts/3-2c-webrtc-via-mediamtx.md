# Story 3-2c: WebRTC via Server-Side mediamtx (Unplanned Correction)

**Status:** done
**Type:** unplanned — latency improvement identified during Story 3-2b QA
**Date:** 2026-03-08
**Supersedes:** HLS transcoding pipeline introduced in Story 3.2

---

## Problem Statement

After the Story 3-2b mediamtx/RTSP pivot:
- Pi-side: mediamtx with rpiCamera source → RTSP at `:8554` — **working, ~2s RTSP latency observed directly**
- Server-side: ffmpeg pulls RTSP → transcodes to HLS → browser plays HLS — **15s browser latency**

HLS latency is structural: 2s segments × 5-segment playlist buffer = 10–15s minimum at the browser. This is inherent to standard HLS regardless of the upstream transport. The user observed 2s latency when connecting to the RTSP stream directly (via VLC/ffplay) vs. 15s in the browser via HLS — confirming the issue is the HLS layer, not frp or mediamtx.

The architecture in 3-2b only fixed the Pi side (camera lifecycle decoupling). The server side still used ffmpeg → HLS.

---

## Solution

Run mediamtx on the **server side** as well. It pulls the RTSP stream from the Pi (via frp tunnel), re-publishes it as WebRTC WHEP. The browser connects directly to the stream over WebRTC — sub-second latency.

Hono proxies the WHEP signaling endpoint so authentication (session cookie) is enforced before WebRTC negotiation begins. The raw mediamtx WebRTC port never needs to be publicly exposed.

### Full architecture after 3-2c

```
Pi (mediamtx rpiCamera)          frp RTSP tunnel        Server (mediamtx + Hono)
┌──────────────────────┐         ┌────────────┐         ┌───────────────────────────────────┐
│ libcamera            │         │            │         │ mediamtx (subprocess of Hono)     │
│  ↓ rpiCamera source  │         │ TCP:8554   │         │   source: rtsp://frps:11935/cam   │
│ mediamtx RTSP :8554 ─┼─────────┼────────────┼────────>│   webrtcAddress: :8889           │
│  path: /cam          │         │   →11935   │         │   apiAddress: 127.0.0.1:9997     │
└──────────────────────┘         └────────────┘         └─────────────────┬─────────────────┘
                                                                           │ WebRTC WHEP (UDP/TCP)
                                                         ┌─────────────────▼─────────────────┐
                                                         │ Hono /api/stream/whep proxy       │
                                                         │  - requireAuth middleware         │
                                                         │  - rewrites Location header       │
                                                         └─────────────────┬─────────────────┘
                                                                           │ authenticated WHEP
                                                         ┌─────────────────▼─────────────────┐
                                                         │ Browser (WebRTC WHEP client)      │
                                                         │  Story 3.3: implement player      │
                                                         └───────────────────────────────────┘
```

### Why proxy WHEP through Hono

mediamtx's WebRTC port (8889) could be exposed directly, but that bypasses session-based auth entirely. By proxying the WHEP signaling (POST offer → answer, PATCH trickle ICE) through Hono with `requireAuth`, only logged-in users can initiate WebRTC sessions. The actual media flows via WebRTC UDP/TCP directly between the browser and the server — the proxy only handles the HTTP signaling phase.

The WHEP `Location` header (returned by mediamtx as `/whep/cam/{uuid}`) is rewritten to `/api/stream/whep/{uuid}` so the browser's subsequent PATCH/DELETE requests continue through the Hono auth proxy.

### Pi reachability detection

With ffmpeg gone, `piReachable` can no longer be inferred from process events (ffmpeg would fail to connect if Pi was offline). Instead, `StreamService` polls the mediamtx HTTP API (`GET /v3/paths/get/cam`) every 2 seconds. When mediamtx reports `ready: true` for the `cam` path, the Pi's RTSP source is active. State broadcasts to WebSocket clients are triggered only on transition.

---

## Acceptance Criteria (all met)

- [x] Server spawns mediamtx as a subprocess, generating config at startup
- [x] All non-WebRTC protocols disabled in mediamtx config (RTSP, RTMP, HLS, SRT ports set to `:0`)
- [x] `POST /api/stream/whep` proxies SDP offer to mediamtx, rewrites `Location` header to Hono proxy path
- [x] `PATCH /api/stream/whep/:session` proxies trickle ICE candidates
- [x] `DELETE /api/stream/whep/:session` proxies session close
- [x] All WHEP routes require auth (401 without valid session)
- [x] `piReachable` derived from mediamtx API polling, not ffmpeg process events
- [x] `HLS_SEGMENT_PATH` env var removed (no more HLS on the server)
- [x] All server tests pass (80/80)

---

## Files Changed

### Server (`apps/server/`)

| File | Change |
|------|--------|
| `src/env.ts` | Removed `HLS_SEGMENT_PATH`. Added `MTX_WEBRTC_PORT` (default `"8889"`) and `MTX_API_PORT` (default `"9997"`). |
| `src/services/streamService.ts` | Complete rewrite. `buildMTXConfig()` generates mediamtx YAML (exported for testing). `StreamService` spawns mediamtx subprocess and polls `/v3/paths/get/cam` for Pi reachability. No more ffmpeg, no more HLS. |
| `src/services/streamService.test.ts` | Rewritten: 10 tests covering `buildMTXConfig` output, state machine transitions, `pollMediamtxState` behavior (via `vi.stubGlobal('fetch', ...)`), and process lifecycle. |
| `src/routes/stream.ts` | Removed HLS routes (`/hls/stream.m3u8`, `/hls/:segment`). Added WHEP proxy: POST create session, PATCH trickle ICE, DELETE close. Location header rewriting. |
| `src/routes/stream.test.ts` | Replaced HLS tests with WHEP proxy tests (9 tests). Tests cover auth gating, SDP offer proxying + Location rewrite, error passthrough, PATCH ICE, DELETE close. |
| `.env` | Removed `HLS_SEGMENT_PATH`. Added `MTX_WEBRTC_PORT=8889`, `MTX_API_PORT=9997`. |
| `.env.example` | Same. Added documentation comments for new vars. |
| `deploy/docker-compose.yml` | Removed `HLS_SEGMENT_PATH`. Added `MTX_WEBRTC_PORT`, `MTX_API_PORT` env vars. |
| `deploy/traefik/docker-compose.yml` | Same. |

---

## Operator Notes

### New dependency: mediamtx on the server

The server binary must have `mediamtx` on `$PATH`. Install instructions:

```sh
# Linux x86_64 (typical cloud server):
wget https://github.com/bluenviron/mediamtx/releases/latest/download/mediamtx_linux_amd64.tar.gz
tar xf mediamtx_linux_amd64.tar.gz
sudo mv mediamtx /usr/local/bin/
```

For Docker: add `mediamtx` to the server `Dockerfile` (Story 6.x deployment work).

### WebRTC UDP for production

WebRTC media flows via UDP by default. In production Docker deployments, ensure the host exposes the UDP port range mediamtx uses for ICE (default: random ephemeral UDP). Configure mediamtx `webrtcICEHostNAT1To1IPs` with the server's public IP. This is deployment-environment-specific and deferred to Story 6.x.

For single-server bare-metal deployments (no Docker NAT), WebRTC works without extra configuration.

### Removed env vars

- `HLS_SEGMENT_PATH` — no longer required; remove from `.env` on upgrade

---

## Web Client (Story 3.3)

Story 3.3 must implement a WebRTC WHEP player instead of HLS.js. The WHEP endpoint is `/api/stream/whep`. A minimal browser integration:

```javascript
// POST SDP offer to /api/stream/whep, get SDP answer
const res = await fetch('/api/stream/whep', {
  method: 'POST',
  credentials: 'include',             // send session cookie for auth
  headers: { 'Content-Type': 'application/sdp' },
  body: pc.localDescription.sdp,
});
const sdpAnswer = await res.text();
const sessionUrl = res.headers.get('Location'); // /api/stream/whep/{uuid}

// Set remote description, play
await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });
videoEl.srcObject = stream;
```

mediamtx's JavaScript client library (`@bluenviron/mediamtx-node`) may simplify this further.

---

## Retrospective Notes

- **Two pivots in one sprint** is unusual. Both were justified by hardware QA revealing structural issues that would get worse, not better, as the project matured (camera lock, 15s latency). Catching them now in Story 3.2 vs. Story 4.x or later was the right call.
- **mediamtx does both sides**: Pi camera source AND server WebRTC re-publish. Single dependency, single binary, consistent approach across the stack.
- **WHEP as a standard**: The WHEP protocol (RFC draft) is implemented by mediamtx, Apple, Cloudflare, and most modern WebRTC stacks. Using it via HTTP proxy is a sound, standards-based approach rather than custom WebSocket signaling.
- **HLS vs. WebRTC trade-off**: HLS is universally compatible and CDN-friendly; WebRTC is low-latency but stateful and harder to cache. For a private home camera where latency matters and CDN distribution is irrelevant, WebRTC is clearly the better choice.
