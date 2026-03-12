<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';

const props = defineProps<{
  videoRef: HTMLVideoElement | null;
}>();

const voidVideoRef = ref<HTMLVideoElement | null>(null);
let cleanupFn: (() => void) | null = null;

const sync = () => {
  if (voidVideoRef.value && props.videoRef && props.videoRef.srcObject !== voidVideoRef.value.srcObject) {
    voidVideoRef.value.srcObject = props.videoRef.srcObject;
    if (props.videoRef.srcObject) {
      voidVideoRef.value.play()?.catch(() => {});
    }
  }
};

watch(
  () => props.videoRef,
  (srcEl) => {
    if (cleanupFn) {
      cleanupFn();
      cleanupFn = null;
    }
    
    if (!srcEl) return;

    sync(); // immediate sync if srcObject already set
    srcEl.addEventListener('loadeddata', sync);
    cleanupFn = () => srcEl.removeEventListener('loadeddata', sync);
  },
  { immediate: true }
);

watch(voidVideoRef, () => {
  sync();
});

onUnmounted(() => {
  if (cleanupFn) {
    cleanupFn();
  }
});
</script>

<template>
  <div
    class="absolute inset-0 overflow-hidden bg-[hsl(var(--surface))]"
    aria-hidden="true"
  >
    <video
      ref="voidVideoRef"
      class="w-full h-full object-cover pointer-events-none select-none"
      style="filter: blur(40px) brightness(0.6);"
      autoplay
      muted
      playsinline
    />
  </div>
</template>
