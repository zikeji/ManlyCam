<script setup lang="ts">
import { onMounted, provide, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '@/composables/useAuth';
import { useWebSocket, WS_INJECTION_KEY } from '@/composables/useWebSocket';
import LoginView from '@/views/LoginView.vue';
import WatchView from '@/views/WatchView.vue';
import { Toaster } from '@/components/ui/sonner';

const route = useRoute();
const { user, authLoading, fetchCurrentUser } = useAuth();

const ws = useWebSocket();
provide(WS_INJECTION_KEY, ws);

// Connect WS when user is authenticated; disconnect on logout
watch(user, (u) => {
  if (u) ws.connect();
  else ws.disconnect();
});

onMounted(() => {
  // stream-only pages are auth-free; skip the /api/me call to avoid spurious 401s
  if (!route.path.startsWith('/stream-only/')) {
    fetchCurrentUser();
  }
});
</script>

<template>
  <RouterView v-if="$route.path !== '/'" />
  <WatchView v-else-if="user" />
  <div
    v-else-if="authLoading"
    class="flex items-center justify-center h-dvh bg-[hsl(var(--background))]"
    data-auth-loading
  >
    <svg
      class="h-8 w-8 animate-spin text-white/40"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  </div>
  <LoginView v-else />
  <!-- offset clears the ~48px broadcast console strip -->
  <Toaster position="bottom-center" :duration="10000" offset="52px" />
</template>
