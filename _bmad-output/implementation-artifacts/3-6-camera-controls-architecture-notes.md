# Story 3.6: Admin Camera Controls — Architecture Pre-Work Notes

**Type:** architecture notes — recorded during Story 3.1/3.2c implementation
**Date:** 2026-03-08
**Status:** backlog (story not yet created)

---

## Context

During the Story 3.2b/3.2c mediamtx pivot it became clear that the original Story 3.6 design
(v4l2-ctl via Pi agent HTTP wrapper) is incompatible with the new architecture. These notes
capture the correct approach so the SM/Dev can create and implement Story 3.6 without re-deriving
the design from scratch.

---

## Why v4l2-ctl Won't Work

mediamtx's `rpiCamera` source uses libcamera directly (not the V4L2 kernel driver). Once mediamtx
owns the camera device via libcamera, `v4l2-ctl` either sees a different device abstraction or
fails to apply settings while the camera is active. The V4L2 and libcamera stacks are parallel
kernel interfaces — they do not share runtime state.

---

## The Correct Approach: mediamtx HTTP API Proxy

mediamtx exposes a HTTP management API (default `:9997`) that supports runtime path parameter
overrides. Camera parameters can be changed live without restarting mediamtx or touching the
config file.

### Relevant API endpoint

```
PATCH http://127.0.0.1:9997/v3/config/paths/patch/cam
Content-Type: application/json

{
  "rpiCameraBrightness": 0.2,
  "rpiCameraContrast": 1.5,
  "rpiCameraAWBMode": "fluorescent",
  ...
}
```

mediamtx applies the change immediately to the running `rpiCamera` source. The full list of
patchable parameters is in the mediamtx documentation under `rpiCamera*` path config keys.

### Transport: frp api tunnel

The mediamtx API runs loopback-only (`apiAddress: "127.0.0.1:9997"` in the generated config).
The frp api tunnel exposes it to the server:

```
Pi (mediamtx :9997)  →  frp api tunnel  →  server (frps :11936)
```

The server Hono app connects to `frps:11936` (the `FRP_API_PORT` env var) to reach the Pi's
mediamtx API. The server proxies admin UI camera control requests to this tunnel after
verifying the admin session.

**Agent config fields involved:**

| Field | Value | Purpose |
|-------|-------|---------|
| `stream.api_port` | `9997` | mediamtx `apiAddress` bind port |
| `frp.api.local_port` | `9997` | frpc tunnels this local port |
| `frp.api.remote_port` | `11936` | frps exposes on this remote port |

**Server env vars involved:**

| Var | Default | Purpose |
|-----|---------|---------|
| `FRP_HOST` | `frps` | Docker service name / hostname for frps |
| `FRP_API_PORT` | `11936` | Remote port the server uses to reach Pi's mediamtx API |

---

## Settings: Static vs. Dynamic

### Static (config.toml — requires mediamtx restart to change)

These are set in `config.toml` and baked into the generated mediamtx config at agent startup.
They define the fundamental output characteristics of the stream and do not belong in the
admin controls UI.

- `stream.width` / `stream.height` — output resolution
- `stream.framerate` — output FPS
- `stream.hflip` / `stream.vflip` — physical camera orientation

### Dynamic (mediamtx API — apply immediately at runtime)

These can be changed live via the PATCH endpoint. The full set of mediamtx `rpiCamera*`
parameters includes but is not limited to:

| Parameter | Description |
|-----------|-------------|
| `rpiCameraBrightness` | -1.0 to 1.0 |
| `rpiCameraContrast` | 0.0 to 32.0 |
| `rpiCameraSaturation` | 0.0 to 32.0 |
| `rpiCameraSharpness` | 0.0 to 16.0 |
| `rpiCameraExposureMode` | `normal`, `sport`, `short`, `long`, `custom` |
| `rpiCameraAWBMode` | `auto`, `tungsten`, `fluorescent`, `indoor`, `daylight`, `cloudy`, `custom` |
| `rpiCameraAWBGains` | [r, b] floats (when AWB mode = custom) |
| `rpiCameraGain` | analogue gain float |
| `rpiCameraEV` | exposure compensation, -8.0 to 8.0 |
| `rpiCameraShutter` | shutter speed in microseconds (0 = auto) |
| `rpiCameraMetering` | `centre`, `spot`, `matrix`, `custom` |
| `rpiCameraExposure` | `normal`, `short`, `long` |
| `rpiCameraAfMode` | `auto`, `manual`, `continuous` |
| `rpiCameraAfRange` | `normal`, `macro`, `full` |
| `rpiCameraAfSpeed` | `normal`, `fast` |
| `rpiCameraLensPosition` | 0.0–32.0, manual focus diopters (when AfMode = manual) |
| `rpiCameraFlickerPeriod` | anti-flicker in microseconds (0 = disabled) |

*Reference: mediamtx `rpiCamera*` path config documentation.*

---

## Server-Side Persistence

The mediamtx API applies settings ephemerally — they are lost on mediamtx restart (which
happens if the Pi reboots or the agent restarts). The server must persist admin-applied
dynamic settings and re-apply them when the Pi reconnects.

### Suggested DB model

```prisma
model CameraSettings {
  id        String   @id @default(cuid())
  key       String   @unique   // e.g. "rpiCameraBrightness"
  value     String             // JSON-encoded value
  updatedAt DateTime @updatedAt
}
```

### Re-apply on Pi reconnect

`StreamService` already polls `GET /v3/paths/get/cam` for `piReachable`. On transition to
`piReachable = true`, the server should:

1. Fetch all `CameraSettings` rows from DB.
2. Build a PATCH body from the stored key/value pairs.
3. `PATCH frps:FRP_API_PORT/v3/config/paths/patch/cam` with the stored settings.

This ensures dynamic settings survive Pi reboots without requiring the operator to re-enter
them.

---

## portal.go is NOT the camera control HTTP server

`apps/agent/internal/portal/portal.go` is a stub for the WiFi captive portal (Story 6.3).
It serves on `:8080` for Wi-Fi onboarding, not camera control. The previous `frp.api.local_port = 8080`
was pointing at this stub, which does nothing. Story 3.6 tunnel should use `local_port = 9997`
(mediamtx API), which is now correct in `config.example.toml`.

---

## Story 3.6 Implementation Checklist (for SM to expand)

- [ ] Admin camera controls sidebar UI (Vue — see UX design spec)
- [ ] `GET /api/stream/camera-settings` — returns current persisted settings from DB
- [ ] `PATCH /api/stream/camera-settings` — validates params, persists to DB, proxies PATCH to Pi mediamtx API via frp tunnel
- [ ] On Pi reconnect (`piReachable` transition), re-apply all persisted settings
- [ ] `CameraSettings` Prisma model and migration
- [ ] Require admin role for all camera control endpoints
- [ ] Handle Pi offline gracefully (store in DB, apply on reconnect; surface error in UI if Pi unreachable at time of change)
