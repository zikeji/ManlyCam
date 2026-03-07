<script setup lang="ts">
const siteName = import.meta.env.VITE_SITE_NAME as string
const petName = import.meta.env.VITE_PET_NAME as string
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-background">
    <div class="flex w-full max-w-md flex-col items-center gap-6 rounded-lg border border-border bg-card p-10 shadow-lg">
      <div class="flex flex-col items-center gap-2 text-center">
        <span class="text-5xl" aria-hidden="true">🔒</span>
        <h1 class="text-2xl font-semibold text-foreground">
          This stream is invite-only.
        </h1>
        <p class="text-sm text-muted-foreground">
          {{ siteName }} is a private stream for {{ petName }}'s biggest fans.
          You'll need an invite to watch.
        </p>
      </div>
    </div>
  </main>
</template>
