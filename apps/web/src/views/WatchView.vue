<script setup lang="ts">
import { useAuth } from '@/composables/useAuth';

const { user, logout } = useAuth();
</script>

<template>
  <main class="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-950 text-white">
    <p class="text-lg">Welcome, {{ user?.displayName }}</p>
    <button
      class="rounded bg-gray-700 px-4 py-2 text-sm hover:bg-gray-600"
      @click="logout"
    >
      Sign out
    </button>
  </main>
</template>
