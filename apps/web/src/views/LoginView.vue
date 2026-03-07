<script setup lang="ts">
import { Button } from '@/components/ui/button'

const siteName = import.meta.env.VITE_SITE_NAME as string
const petName = import.meta.env.VITE_PET_NAME as string
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-background">
    <div class="flex w-full max-w-sm flex-col items-center gap-6 rounded-lg border border-border bg-card p-10 shadow-lg">
      <div class="flex flex-col items-center gap-2 text-center">
        <h1 class="text-2xl font-semibold text-foreground">
          {{ siteName }}
        </h1>
        <p class="text-sm text-muted-foreground">
          Watch {{ petName }} live — private stream. Sign in to continue.
        </p>
      </div>
      <Button asChild size="lg" class="w-full">
        <a href="/api/auth/google">Sign in with Google</a>
      </Button>
    </div>
  </main>
</template>
