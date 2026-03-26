<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useStreamOnlyWhep } from '@/composables/useStreamOnlyWhep';

const route = useRoute();
const key = route.params.key as string;

const videoRef = ref<HTMLVideoElement | null>(null);
const { startWhep, stopWhep, isHealthy, isConnecting, isPermanentlyFailed } =
  useStreamOnlyWhep(key);

onMounted(async () => {
  if (videoRef.value) {
    await startWhep(videoRef.value).catch(() => {});
  }
});

onUnmounted(async () => {
  await stopWhep();
});
</script>

<template>
  <div class="relative w-screen h-screen bg-black overflow-hidden">
    <video
      ref="videoRef"
      autoplay
      muted
      playsinline
      class="w-screen h-screen"
      style="object-fit: cover"
      data-testid="stream-video"
    />

    <!-- Spinner overlay: shown while connecting or not healthy (unless permanently failed) -->
    <div
      v-if="isConnecting || (!isHealthy && !isPermanentlyFailed)"
      class="absolute inset-0 flex items-center justify-center"
      data-testid="spinner"
    >
      <svg
        class="h-10 w-10 animate-spin text-white/40"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    </div>
  </div>
</template>

<style>
body {
  background-color: #000;
  margin: 0;
  overflow: hidden;
}
</style>
