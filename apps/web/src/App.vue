<script setup lang="ts">
import { onMounted, provide, watch } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { useWebSocket, WS_INJECTION_KEY } from '@/composables/useWebSocket';
import LoginView from '@/views/LoginView.vue';
import WatchView from '@/views/WatchView.vue';

const { user, fetchCurrentUser } = useAuth();

const ws = useWebSocket();
provide(WS_INJECTION_KEY, ws);

// Connect WS when user is authenticated; disconnect on logout
watch(user, (u) => {
  if (u) ws.connect();
  else ws.disconnect();
}, { immediate: true });

onMounted(() => {
  fetchCurrentUser();
});
</script>

<template>
  <RouterView v-if="$route.path !== '/'" />
  <WatchView v-else-if="user" />
  <LoginView v-else />
</template>
