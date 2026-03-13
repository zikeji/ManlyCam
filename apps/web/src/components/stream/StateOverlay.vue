<script setup lang="ts">
import { getPetName } from '@/lib/env';
import StreamStatusBadge from './StreamStatusBadge.vue';

defineProps<{
  variant: 'unreachable' | 'explicit-offline';
}>();

const petName = getPetName();
</script>

<template>
  <!-- unreachable: server reports camera offline -->
  <div
    v-if="variant === 'unreachable'"
    data-overlay
    class="absolute inset-0 flex flex-col items-center justify-center gap-3 backdrop-blur-sm bg-[hsl(var(--surface))]"
  >
    <svg
      data-spinner
      class="h-10 w-10 animate-spin text-[hsl(var(--reconnecting))]"
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
    <p class="text-base font-semibold text-[hsl(var(--foreground))]">Trying to reconnect...</p>
    <p class="text-sm text-[hsl(var(--muted-foreground))]">
      Oops, looks like the camera went offline. Hang tight.
    </p>
  </div>

  <!-- explicit-offline: warm surface background, centered content, badge below text -->
  <div
    v-else-if="variant === 'explicit-offline'"
    data-overlay
    class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[hsl(var(--surface))]"
  >
    <span class="text-5xl leading-none opacity-70" aria-hidden="true">😴</span>
    <p class="text-base font-semibold text-[hsl(var(--foreground))]">
      {{ petName }} needs their Zzzs
    </p>
    <p class="text-sm text-[hsl(var(--muted-foreground))]">
      The stream is offline for now. Check back later — they'll be back.
    </p>
    <div class="mt-1">
      <StreamStatusBadge state="explicit-offline" />
    </div>
  </div>
</template>
