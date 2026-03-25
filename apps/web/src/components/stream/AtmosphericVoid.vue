<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';

const props = defineProps<{
  videoRef: HTMLVideoElement | null;
}>();

const voidVideoRef = ref<HTMLVideoElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

// Which rendering mode is active
const useCanvas = ref(false);

let cleanupFn: (() => void) | null = null;
let canvasRaf: number | null = null;

// --- WebRTC (srcObject) path ---
const syncSrcObject = () => {
  if (!voidVideoRef.value || !props.videoRef) return;
  if (props.videoRef.srcObject && props.videoRef.srcObject !== voidVideoRef.value.srcObject) {
    voidVideoRef.value.srcObject = props.videoRef.srcObject;
    voidVideoRef.value.play()?.catch(() => {});
  }
};

// --- Canvas draw loop for HLS/MSE path ---
const CANVAS_FPS = 10;
const CANVAS_W = 64; // Tiny resolution — it's blurred to 40px anyway
const CANVAS_H = 36;

function startCanvasLoop(): void {
  stopCanvasLoop();
  const canvas = canvasRef.value;
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;

  // Only set dimensions when needed — resetting canvas.width/height clears the canvas,
  // which causes a one-frame flash to the background colour on every 'playing' event.
  if (canvas.width !== CANVAS_W || canvas.height !== CANVAS_H) {
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
  }

  let lastDraw = 0;
  const interval = 1000 / CANVAS_FPS;

  /* c8 ignore start -- rAF callback requires real browser rendering pipeline; JSDOM does not support it */
  const tick = (now: number) => {
    canvasRaf = requestAnimationFrame(tick);
    if (now - lastDraw < interval) return;
    lastDraw = now;

    const src = props.videoRef;
    if (!src || src.readyState < 2) return;
    ctx.drawImage(src, 0, 0, CANVAS_W, CANVAS_H);
  };
  /* c8 ignore stop */

  canvasRaf = requestAnimationFrame(tick);
}

function stopCanvasLoop(): void {
  if (canvasRaf !== null) {
    cancelAnimationFrame(canvasRaf);
    canvasRaf = null;
  }
}

watch(
  () => props.videoRef,
  (srcEl, _oldEl) => {
    // Tear down previous source
    if (cleanupFn) {
      cleanupFn();
      cleanupFn = null;
    }
    stopCanvasLoop();

    if (!srcEl) {
      useCanvas.value = false;
      return;
    }

    if (srcEl.srcObject) {
      // WebRTC path
      useCanvas.value = false;
      syncSrcObject();
      srcEl.addEventListener('loadeddata', syncSrcObject);
      cleanupFn = () => srcEl.removeEventListener('loadeddata', syncSrcObject);
    } else {
      // HLS/MSE path — use canvas draw loop
      useCanvas.value = true;
      startCanvasLoop();
      // Also listen for playing in case HLS hasn't started yet
      const onPlaying = () => startCanvasLoop();
      srcEl.addEventListener('playing', onPlaying);
      cleanupFn = () => {
        srcEl.removeEventListener('playing', onPlaying);
        stopCanvasLoop();
      };
    }
  },
  { immediate: true },
);

// Ensure canvas loop starts when canvas ref is populated
watch(canvasRef, () => {
  if (useCanvas.value && props.videoRef) startCanvasLoop();
});

// Ensure video sync when video ref is populated
watch(voidVideoRef, () => {
  if (!useCanvas.value) syncSrcObject();
});

onUnmounted(() => {
  if (cleanupFn) {
    cleanupFn();
    cleanupFn = null;
  }
  stopCanvasLoop();
});
</script>

<template>
  <div
    class="absolute inset-0 overflow-hidden bg-[hsl(var(--surface))]"
    aria-hidden="true"
  >
    <!-- WebRTC: clone srcObject into a second video -->
    <video
      v-show="!useCanvas"
      ref="voidVideoRef"
      class="w-full h-full object-cover pointer-events-none select-none"
      style="filter: blur(40px) brightness(0.6);"
      autoplay
      muted
      playsinline
    />
    <!-- HLS/MSE: draw frames onto a tiny canvas, CSS-blur scales it up -->
    <canvas
      v-show="useCanvas"
      ref="canvasRef"
      class="w-full h-full object-cover pointer-events-none select-none"
      style="filter: blur(40px) brightness(0.6);"
    />
  </div>
</template>
