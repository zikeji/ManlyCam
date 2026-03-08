# Story 3-2b: mediamtx RTSP Architecture Pivot (Unplanned Correction)

**Status:** done
**Type:** unplanned — architectural correction identified during Story 3.2 QA
**Date:** 2026-03-08
**Touches:** Stories 3.1 (Pi agent) and 3.2 (server stream ingestion)

---

## Problem Statement

During hardware QA of Story 3.2, two fundamental architectural defects were identified that warranted an in-sprint correction rather than deferral:

### Defect 1: Camera lifecycle coupled to server lifetime

The Story 3.1 implementation used `rpicam-vid --listen` which opens a TCP server and waits for a client. When the client (server's ffmpeg) disconnects (e.g., dev server restart, network blip), `rpicam-vid` receives `SIGABRT` — a libcamera bug — and terminates. The camera hardware then enters a locked state. Subsequent restart attempts also crash immediately until the camera device is physically power-cycled.

**Impact:** Every dev server hot-reload during Story 3.3 UX work would lock the camera. Untenable for development.

**Root cause:** `rpicam-vid --listen` is fundamentally a one-shot server — it owns both the camera and the TCP connection. Client disconnect kills both.

### Defect 2: Raw H.264 over TCP is fragile

The raw TCP frp tunnel carried rpicam-vid's H.264 NAL unit stream. ffmpeg required explicit `-f h264` demuxer hint (no container), and `-bsf:v h264_mp4toannexb` to repackage NAL units for MPEG-TS. Even after these fixes, the stream showed codec negotiation errors because different versions of rpicam-vid output AVCC vs. Annex B format inconsistently. The transport has no error correction, no reconnection semantics, and no standard tooling interop.

### Defect 3: Latency (informational, deferred)

HLS 10–20s latency is inherent to the 2s segment / 5-segment playlist configuration — not a transport issue. Accepted as-is; Low Latency HLS or WebRTC can be pursued in a future epic if needed.

---

## Solution

Replace the rpicam-vid + raw TCP approach with **mediamtx** (a production-grade media server) using its native `rpiCamera` libcamera source.

### How mediamtx fixes the coupling problem

mediamtx owns and supervises the libcamera pipeline internally. The camera streams continuously to mediamtx's internal buffer. RTSP clients (e.g., ffmpeg on the server) connect to mediamtx — not directly to the camera. When an RTSP client disconnects, mediamtx absorbs the disconnect gracefully; the camera pipeline is unaffected and keeps running. The server's ffmpeg can reconnect at any time without any action on the Pi.

### Architecture after pivot

```
Pi (mediamtx)                    frp tunnel         Server (ffmpeg → HLS)
┌──────────────────────────┐     ┌──────────┐      ┌─────────────────────────┐
│ libcamera                │     │          │      │                         │
│   ↓ (rpiCamera source)   │     │ TCP:8554 │      │ ffmpeg                  │
│ mediamtx RTSP :8554 ─────┼─────┼──────────┼─────>│  -rtsp_transport tcp    │
│   /cam path              │     │  →11935  │      │  -i rtsp://frps:11935/  │
└──────────────────────────┘     └──────────┘      │  -c:v copy → HLS        │
                                                    └─────────────────────────┘
```

Camera is always on. RTSP clients connect and disconnect freely. No Annex B / AVCC ambiguity — RTSP carries H.264 with standard container negotiation.

---

## Acceptance Criteria (all met)

- [x] Camera pipeline stays active when server's ffmpeg disconnects (dev server restart, network blip)
- [x] `signal: aborted` restart loop on Pi is eliminated
- [x] Server ffmpeg reconnects to RTSP after restart without manual Pi intervention
- [x] HLS segments are generated from RTSP input without format-hinting workarounds (`-f h264`, `-bsf:v h264_mp4toannexb` removed)
- [x] All existing agent tests pass with new mediamtx-based pipeline
- [x] All existing server tests pass with renamed env var and updated ffmpeg args
- [x] Agent config is backward-incompatible (operator must update `config.toml`); documented in config.example.toml

---

## Files Changed

### Pi Agent (`apps/agent/`)

| File | Change |
|------|--------|
| `internal/config/config.go` | `StreamConfig`: removed `Codec` field (mediamtx handles internally); renamed `OutputPort` → `RTSPPort` (`rtsp_port` in TOML). Updated validation accordingly. |
| `internal/camera/pipeline.go` | Complete rewrite. `BuildArgs()` + rpicam-vid supervisor → `BuildMTXConfig()` + mediamtx supervisor. Same 2s context-aware restart delay retained. |
| `internal/camera/pipeline_test.go` | Rewrote 4 `BuildArgs` tests → 5 `BuildMTXConfig` tests covering port, dimensions, flip flags, and path name. |
| `internal/tunnel/frp.go` | Stream proxy `localPort` source: `cfg.Stream.OutputPort` → `cfg.Stream.RTSPPort`. |
| `internal/tunnel/frp_test.go` | `testConfig()`: `OutputPort: 5000` → `RTSPPort: 8554`. Stream proxy port assertion updated. |
| `internal/config/config_test.go` | `validTOML`: removed `codec`, renamed `output_port` → `rtsp_port = 8554`. `TestLoad_MissingCodec` → `TestLoad_MissingRTSPPort`. All inline TOMLs updated. |
| `deploy/config.example.toml` | Removed `codec` field. Renamed `output_port` → `rtsp_port = 8554`. Updated comments. |
| `cmd/start.go` | Updated `Short` description to reference mediamtx. |

### Server (`apps/server/`)

| File | Change |
|------|--------|
| `src/env.ts` | Renamed `FRP_STREAM_PORT` → `FRP_RTSP_PORT`. |
| `src/services/streamService.ts` | Removed `-re`, `-f h264`, `-bsf:v h264_mp4toannexb`. Added `-rtsp_transport tcp`. Input URL: `tcp://...` → `rtsp://.../cam`. References `env.FRP_RTSP_PORT`. |
| `src/services/streamService.test.ts` | Mock env: `FRP_STREAM_PORT` → `FRP_RTSP_PORT`. |
| `.env` | `FRP_STREAM_PORT` → `FRP_RTSP_PORT`. |
| `.env.example` | Same rename + added explanatory comment. |
| `deploy/docker-compose.yml` | `FRP_STREAM_PORT` → `FRP_RTSP_PORT`. |
| `deploy/traefik/docker-compose.yml` | Same. |

---

## Operator Migration Notes

Operators with an existing Pi deployment must:

1. **Install mediamtx** on the Pi (single static binary, ~20MB):
   ```sh
   # Pi Zero W 2 running 64-bit OS:
   wget https://github.com/bluenviron/mediamtx/releases/latest/download/mediamtx_linux_arm64v8.tar.gz
   tar xf mediamtx_linux_arm64v8.tar.gz
   sudo mv mediamtx /usr/local/bin/

   # Pi Zero W 2 running 32-bit OS (Raspberry Pi OS Lite 32-bit):
   wget https://github.com/bluenviron/mediamtx/releases/latest/download/mediamtx_linux_armv7.tar.gz
   tar xf mediamtx_linux_armv7.tar.gz
   sudo mv mediamtx /usr/local/bin/
   ```

2. **Update `config.toml`** — rename/replace stream section:
   ```toml
   # Remove:  codec = "..."
   # Remove:  output_port = 5000
   # Add:
   rtsp_port = 8554
   ```

3. **Update server `.env`**:
   ```sh
   # Remove:  FRP_STREAM_PORT=11935
   # Add:
   FRP_RTSP_PORT=11935
   ```
   (Remote port value stays the same — only the variable name changes.)

4. Restart agent and server.

---

## Retrospective Notes

- **The `--listen` anti-pattern**: Any tool that couples a hardware resource lifecycle to a network client connection is fragile by design. This should have been caught at architecture review time in Story 3.1. Future camera-adjacent stories should default to a media server (mediamtx, GStreamer with RTSP server element) rather than direct TCP.
- **mediamtx `rpiCamera` source**: Requires libcamera to be installed (standard on Raspberry Pi OS). The agent generates and writes the mediamtx YAML config at startup from `StreamConfig`, keeping the same operator-facing TOML fields (width, height, framerate, hflip, vflip). The `codec` field is dropped because mediamtx always outputs H.264 over RTSP for the rpiCamera source.
- **frp remote port unchanged**: The frp remote port (11935) continues to be used; only what's tunneled through it changes (raw H.264 → RTSP/TCP). Existing frps server configs need no changes.
