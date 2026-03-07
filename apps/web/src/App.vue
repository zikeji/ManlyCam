<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuth } from '@/composables/useAuth';
import LoginView from '@/views/LoginView.vue';
import WatchView from '@/views/WatchView.vue';

const { user, fetchCurrentUser } = useAuth();

onMounted(() => {
  fetchCurrentUser();
});
</script>

<template>
  <RouterView v-if="$route.path !== '/'" />
  <WatchView v-else-if="user" />
  <LoginView v-else />
</template>
