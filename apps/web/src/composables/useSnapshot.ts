import { getPetName, getSiteName } from '@/lib/env';

/**
 * Formats a timestamp in compact ISO 8601-style format with milliseconds.
 * Format: YYYYMMDD-HHmmssZ (e.g., 20260312-143015Z)
 * Milliseconds guarantee uniqueness for rapid-fire snapshots.
 */
function formatSnapshotTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}${ms}Z`;
}

/**
 * Firefox-specific bug: drawImage() on a canvas from an HTMLVideoElement can
 * produce spurious all-black rows at the bottom (a letterbox-like artifact).
 * This only occurs in Firefox — Chrome renders the frame correctly.
 *
 * Fix: scan pixel rows from the bottom upward, stopping at the first row that
 * contains at least one non-black pixel, then return a cropped canvas of that
 * height. If no black rows are found, the original canvas is returned as-is.
 */
function cropFirefoxBlackRows(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): HTMLCanvasElement {
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  let croppedHeight = height;
  for (let y = height - 1; y >= 0; y--) {
    let rowIsBlack = true;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) {
        rowIsBlack = false;
        break;
      }
    }
    if (!rowIsBlack) {
      croppedHeight = y + 1;
      break;
    }
  }

  if (croppedHeight === height) return canvas;

  const cropped = document.createElement('canvas');
  cropped.width = width;
  cropped.height = croppedHeight;
  const croppedCtx = cropped.getContext('2d')!;
  croppedCtx.drawImage(canvas, 0, 0);
  return cropped;
}

/**
 * Captures the current video frame as a JPEG image and triggers download.
 * @param videoEl - The HTMLVideoElement to capture from
 * @param petName - Optional pet name (defaults to env config if not provided)
 */
export function takeSnapshot(videoEl: HTMLVideoElement, petName?: string): void {
  const siteName = getSiteName();
  const pet = petName ?? getPetName();
  const timestamp = formatSnapshotTimestamp();

  // Create off-screen canvas with video dimensions
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    console.error('Failed to get canvas 2D context');
    return;
  }

  // Draw current video frame to canvas
  ctx.drawImage(videoEl, 0, 0);

  // Firefox workaround: crop trailing all-black rows introduced by drawImage() on video
  const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
  const finalCanvas = isFirefox ? cropFirefoxBlackRows(canvas, ctx) : canvas;

  // Convert canvas to JPEG blob at 0.75 quality (balances file size vs. visual fidelity)
  finalCanvas.toBlob(
    (blob) => {
      if (!blob) {
        console.error('Failed to create blob from canvas');
        return;
      }

      // Generate filename: SITE_NAME_PET_NAME_YYYYMMDD-HHmmssZ.jpg
      const filename = `${siteName}_${pet}_${timestamp}.jpg`;

      // Create object URL
      const url = URL.createObjectURL(blob);

      // Create anchor element, set download attribute, and click
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();

      // Revoke object URL to prevent memory leaks
      URL.revokeObjectURL(url);
    },
    'image/jpeg',
    0.75,
  );
}

/**
 * Snapshot composable
 */
export function useSnapshot() {
  return {
    takeSnapshot,
  };
}
