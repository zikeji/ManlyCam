<script setup lang="ts">
import { getPetName } from '@/lib/env';
import type { ClientStreamState } from '@/composables/useStream';

const props = defineProps<{
  state: ClientStreamState;
}>();

const petName = getPetName();

const dotClass = (state: ClientStreamState): string => {
  switch (state) {
    case 'live':
      return 'bg-[hsl(var(--live))] animate-pulse rounded-full w-2 h-2';
    case 'connecting':
    case 'unreachable':
      return 'bg-[hsl(var(--reconnecting))] rounded-full w-2 h-2';
    case 'explicit-offline':
      return 'bg-[hsl(var(--offline-explicit))] rounded-full w-2 h-2';
  }
};

const label = (state: ClientStreamState): string => {
  switch (state) {
    case 'connecting':
      return 'Connecting...';
    case 'live':
      return `${petName} is live`;
    case 'unreachable':
      return 'Trying to reconnect...';
    case 'explicit-offline':
      return 'Stream is offline';
  }
};
</script>

<template>
  <div
    aria-live="polite"
    class="flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-sm font-medium text-[hsl(var(--foreground))] backdrop-blur-sm"
  >
    <span :class="dotClass(props.state)" data-state-dot />
    <span>{{ label(props.state) }}</span>
  </div>
</template>
