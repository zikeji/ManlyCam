<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { useStream } from '@/composables/useStream';
import { Role } from '@manlycam/types';
import StreamPlayer from '@/components/stream/StreamPlayer.vue';

const { user } = useAuth();
const { streamState, initStream } = useStream();

onMounted(() => {
  initStream();
});
</script>

<template>
  <div class="flex h-screen w-full overflow-hidden bg-[hsl(var(--background))]">
    <!-- Left sidebar: admin only, placeholder for Story 3.6 camera controls -->
    <aside
      v-if="user?.role === Role.Admin"
      data-sidebar-left
      class="w-[280px] shrink-0 hidden lg:flex flex-col bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--border))]"
    >
      <!-- Story 3.6: AdminPanel / CameraControls here -->
    </aside>

    <!-- Stream column: fills remaining space -->
    <main class="flex-1 min-w-0 flex items-center justify-center bg-black">
      <StreamPlayer :streamState="streamState" />
    </main>

    <!-- Right sidebar: placeholder for Story 4.x chat panel -->
    <aside
      data-sidebar-right
      class="w-[320px] shrink-0 hidden lg:flex flex-col bg-[hsl(var(--sidebar))] border-l border-[hsl(var(--border))]"
    >
      <!-- Story 4.x: ChatPanel here -->
    </aside>
  </div>
</template>
