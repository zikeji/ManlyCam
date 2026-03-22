# ManlyCam Pi Setup Guide

This guide covers the full lifecycle of a ManlyCam Pi camera node — from initial OS flash through daily operation, tuning, updates, and uninstall.

For server-side deployment (Docker Compose, mediamtx, frps), see [`docs/deploy/README.md`](../docs/deploy/README.md).

## Prerequisites

- **Raspberry Pi Zero W 2** (or any Pi with a CSI camera connector and 64-bit OS support)
- **Arducam or official Raspberry Pi camera module** connected via CSI ribbon cable
- **Raspberry Pi OS Lite (64-bit) — Trixie** flashed to a microSD card (older versions may work but are untested)
- **Network connectivity** (WiFi or Ethernet via USB adapter)
- A running ManlyCam server with frps accessible from the Pi (see server docs)

## 1. Flash the OS

Use [Raspberry Pi Imager](https://www.raspberrypi.com/software/) to flash **Raspberry Pi OS Lite (64-bit) — Trixie** to a microSD card. The install script and this documentation are tested against Trixie; older releases may work but are not officially supported.

In the Imager's **OS Customisation** menu (gear icon), configure:

- **Hostname** — e.g. `manlycam`
- **Enable SSH** — select "Allow public-key authentication only" and paste your SSH public key
- **WiFi** (optional) — enter your SSID and password here if you want WiFi preconfigured

> **Tip:** Configuring WiFi in the Imager is the simplest approach. If you skip it, see the [WiFi Configuration](#wifi-configuration) section below.

Insert the microSD card, power on the Pi, and SSH in:

```bash
ssh pi@manlycam.local
```

## 2. Verify the Camera

Before running the install script, confirm the camera module is detected and working:

```bash
rpicam-still -o test.jpg
```

If this succeeds, you'll see a `test.jpg` file. If it fails, check:

- The CSI ribbon cable is seated correctly (contacts facing the board)
- The camera interface is enabled (`sudo raspi-config` → Interface Options → Camera)
- You're running a 64-bit OS (`uname -m` should show `aarch64`)

> **ArduCam users:** ArduCam modules generally require additional driver installation before `rpicam-still` will detect them. Refer to the [ArduCam documentation](https://docs.arducam.com/) for your specific module's setup instructions. Complete the ArduCam setup first, then verify with `rpicam-still` before proceeding.

## 3. Install ManlyCam Services

Copy `install.sh` to the Pi (or clone the repo), then run:

```bash
sudo ./install.sh --endpoint cam.example.com --frp-token your-secret-token
```

### Required flags

| Flag                                | Description                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `--endpoint <host\|host:port\|url>` | frps server address. Port defaults to 7000 if omitted.                            |
| `--frp-token <token>`               | Authentication token. Must match the `[auth] token` in your server's `frps.toml`. |

### Optional flags

| Flag                           | Description                                     |
| ------------------------------ | ----------------------------------------------- |
| `--frpc-version <version>`     | frpc version to install (default: `0.61.0`)     |
| `--mediamtx-version <version>` | mediamtx version to install (default: `1.17.0`) |
| `-h`, `--help`                 | Show usage help                                 |

The script:

1. Checks for root privileges and 64-bit OS (`aarch64`)
2. Installs `libcamera-apps` (required for the rpiCamera source)
3. Downloads frpc and mediamtx binaries for `linux/arm64`
4. Writes config files to `/etc/manlycam/`
5. Creates and enables `frpc` and `mediamtx` systemd services
6. Starts both services immediately

### Confirm the stream is live

After install completes, check that both services are running:

```bash
systemctl status mediamtx
systemctl status frpc
```

Watch the mediamtx logs for the camera ready message:

```bash
journalctl -u mediamtx -f
```

Look for a log line containing `[path cam] [source] ready` — this means the camera is streaming via RTSP and the frpc tunnel should be forwarding it to your server.

## Service Management

### Service names and paths

| Item             | Value                                                     |
| ---------------- | --------------------------------------------------------- |
| frpc service     | `frpc` (unit: `/etc/systemd/system/frpc.service`)         |
| mediamtx service | `mediamtx` (unit: `/etc/systemd/system/mediamtx.service`) |
| Config directory | `/etc/manlycam/`                                          |
| frpc config      | `/etc/manlycam/frpc.toml`                                 |
| mediamtx config  | `/etc/manlycam/mediamtx.yml`                              |
| frpc binary      | `/usr/local/bin/frpc`                                     |
| mediamtx binary  | `/usr/local/bin/mediamtx`                                 |

### Checking status

```bash
systemctl status mediamtx
systemctl status frpc
```

### Restarting services

```bash
sudo systemctl restart mediamtx
sudo systemctl restart frpc
```

### Viewing logs

```bash
# Last 50 lines
journalctl -u mediamtx -n 50 --no-pager
journalctl -u frpc -n 50 --no-pager

# Follow logs live
journalctl -u mediamtx -f
journalctl -u frpc -f
```

### Stream is down — troubleshooting checklist

1. **Check service status** — `systemctl status mediamtx` and `systemctl status frpc`. If either is `failed` or `inactive`, check its logs.
2. **Check mediamtx logs** — `journalctl -u mediamtx -n 50 --no-pager`. Look for camera errors (e.g. `cannot open camera`).
3. **Check frpc logs** — `journalctl -u frpc -n 50 --no-pager`. Look for connection errors to the frps server (wrong endpoint, token mismatch, network unreachable).
4. **Verify camera** — `rpicam-still -o test.jpg`. If this fails, the camera connection or libcamera has an issue.
5. **Verify network** — `ping your-server-hostname`. If unreachable, fix network/WiFi before proceeding.
6. **Restart services** — `sudo systemctl restart mediamtx frpc`. Sometimes a restart clears transient errors.

## WiFi Configuration

WiFi setup is the operator's responsibility and is independent of the ManlyCam install script.

**Recommended approach:** Configure WiFi during OS flash using Raspberry Pi Imager's OS Customisation menu (see [Flash the OS](#1-flash-the-os) above). This is the simplest method and requires no additional steps after boot.

**Alternative approaches:**

- **cloud-init** — Trixie uses cloud-init for first-boot configuration. You can place a `network-config` file on the boot partition to configure WiFi before the first boot. See the [Raspberry Pi cloud-init post](https://www.raspberrypi.com/news/cloud-init-on-raspberry-pi-os/) for details.
- **wifi-connect** — [balena-io/wifi-connect](https://github.com/balena-io/wifi-connect) provides a captive portal for WiFi setup via a phone/laptop. This is a third-party tool and is entirely optional.

## Optional Configuration (Camera Tuning)

The install script writes `/etc/manlycam/mediamtx.yml` with sensible defaults. You can edit this file to tune camera settings.

> **Important:** Running `sudo ./install.sh ...` again will overwrite `/etc/manlycam/mediamtx.yml` from the script's built-in template. If you've customized the config, re-apply your changes after each install.sh run, or fork the script to embed your values.

After editing, restart mediamtx to apply changes:

```bash
sudo systemctl restart mediamtx
```

### Resolution and framerate

The defaults are mediamtx's built-in 1920x1080 at 30fps. The Pi Zero W 2's CPU can struggle at full resolution under network load. If stream quality is poor or the Pi is CPU-overwhelmed, add lower resolution settings:

```yaml
paths:
  cam:
    source: rpiCamera
    rpiCameraBitrate: 4000000
    rpiCameraIDRPeriod: 30
    rpiCameraWidth: 1280
    rpiCameraHeight: 720
    rpiCameraFPS: 25
    useAbsoluteTimestamp: true
```

1280x720 at 25fps is a well-tested fallback for the Pi Zero W 2.

### Bitrate

`rpiCameraBitrate` controls H.264 encoder output in bits/s. The install script default is `4000000` (4 Mbps), suitable for LAN and frp tunnels. The sweet spot for most setups is **4-10 Mbps** — lower end for constrained uplinks or flaky tunnels, higher end for better quality on a reliable connection. Going above 10 Mbps rarely improves perceived quality and increases tunnel bandwidth demand.

### Camera tuning file

libcamera ships per-sensor ISP tuning files that can dramatically improve image quality (color accuracy, noise reduction, exposure) compared to the generic default. If you know your camera module's sensor, point mediamtx at the correct tuning file:

```yaml
rpiCameraTuningFile: /usr/share/libcamera/ipa/rpi/vc4/imx519.json
```

Common tuning files (in `/usr/share/libcamera/ipa/rpi/vc4/`):

| File          | Camera Module                          |
| ------------- | -------------------------------------- |
| `imx519.json` | Arducam 16MP (IMX519)                  |
| `imx477.json` | Raspberry Pi HQ Camera (IMX477)        |
| `imx708.json` | Raspberry Pi Camera Module 3 (IMX708)  |
| `ov5647.json` | Raspberry Pi Camera Module v1 (OV5647) |
| `imx219.json` | Raspberry Pi Camera Module v2 (IMX219) |

Run `ls /usr/share/libcamera/ipa/rpi/vc4/` on your Pi to see what's available. Using the wrong tuning file is safe (mediamtx falls back to defaults) but using the correct one can be a significant visual improvement.

### Camera orientation flips

If the camera module is mounted upside down or mirrored:

```yaml
rpiCameraHFlip: yes # horizontal mirror
rpiCameraVFlip: yes # vertical flip (combine with HFlip for 180-degree rotation)
```

### Timestamp synchronization (clipping feature)

The install script sets `useAbsoluteTimestamp: true` by default. This preserves the original frame timestamps from the camera, which is required for accurate clip extraction on the server. Without this setting, clip timestamps would not align with the UI scrubber.

If you are not using the clipping feature and experience issues, you can set this to `false`, though this is not recommended.

These options are all part of mediamtx's rpiCamera source. See the [mediamtx documentation](https://mediamtx.org/docs/publish/raspberry-pi-cameras) for the full option list.

## Updating

To update frpc or mediamtx to newer versions, re-run the install script with version flags:

```bash
sudo ./install.sh --endpoint cam.example.com --frp-token your-secret-token \
  --frpc-version 0.62.0 \
  --mediamtx-version 1.10.0
```

The script downloads new binaries, regenerates configs from the provided flags, and restarts both services. Re-running is safe and idempotent.

> **Note:** Any manual edits to `/etc/manlycam/frpc.toml` or `/etc/manlycam/mediamtx.yml` will be overwritten. Re-apply custom config changes after the update.

## Uninstalling

```bash
sudo ./uninstall.sh
```

The uninstall script:

1. Stops and disables both `frpc` and `mediamtx` services
2. Removes systemd unit files (`/etc/systemd/system/frpc.service`, `/etc/systemd/system/mediamtx.service`)
3. Prompts whether to remove the config directory (`/etc/manlycam/`) — defaults to keeping it in non-interactive shells
4. Removes binaries (`/usr/local/bin/frpc`, `/usr/local/bin/mediamtx`)

After uninstall, verify clean state:

```bash
systemctl status frpc      # expect: Unit frpc.service could not be found
systemctl status mediamtx  # expect: Unit mediamtx.service could not be found
ls /etc/manlycam           # expect: No such file or directory
ls /usr/local/bin/frpc     # expect: No such file or directory
```

The script is safe to run even if services are not currently installed.

## PiSugar Battery Monitoring (Optional)

If you have a PiSugar power management module installed on your Pi, you can enable battery monitoring in the web UI.

### Prerequisites

1. Install PiSugar manager on your Pi (follow [official PiSugar documentation](https://github.com/PiSugar/PiSugar))
2. Ensure PiSugar manager is running and listening on port 8423 (default)

### Server Configuration

Add to your server `.env`:

```
FRP_PISUGAR_PORT=<port>
```

Choose an available port (e.g., 8424). This is the server-side port that will receive the tunneled connection.

### Pi frpc Configuration

Add to your Pi's `/etc/manlycam/frpc.toml`:

```toml
[[proxies]]
name = "pisugar"
type = "tcp"
localIP = "127.0.0.1"
localPort = 8423
remotePort = <FRP_PISUGAR_PORT>
```

Replace `<FRP_PISUGAR_PORT>` with the same port you configured on the server.

After updating frpc.toml, restart the frpc service:

```bash
sudo systemctl restart frpc
```

### Verification

1. Check frpc tunnel is established: `sudo journalctl -u frpc -f`
2. On the server, the battery indicator should appear in the Broadcast Console left flank (admin-only) within 30 seconds
