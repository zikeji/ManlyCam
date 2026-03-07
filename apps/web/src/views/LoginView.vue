<script setup lang="ts">
const siteName = import.meta.env.VITE_SITE_NAME as string;
const petName = import.meta.env.VITE_PET_NAME as string;
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-gray-950">
    <div class="flex flex-col items-center gap-6 rounded-xl bg-gray-900 p-10 shadow-xl">
      <h1 class="text-2xl font-semibold text-white">
        {{ siteName }} — Watch {{ petName }}
      </h1>
      <p class="text-sm text-gray-400">This is a private stream. Sign in to continue.</p>
      <a
        href="/api/auth/google"
        class="flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-gray-800 shadow hover:bg-gray-100"
      >
        Sign in with Google
      </a>
    </div>
  </main>
</template>
