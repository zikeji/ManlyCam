<script setup lang="ts">
import { getSiteName, getPetName } from '@/lib/env'
import { getEmojiUrl } from '@/lib/emoji-data'

const siteName = getSiteName()
const petName = getPetName()
const lockEmojiUrl = getEmojiUrl('1f512')
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-background">
    <div class="flex w-full max-w-md flex-col items-center gap-6 rounded-lg border border-border bg-card p-10 shadow-lg">
      <div class="flex flex-col items-center gap-2 text-center">
        <img :src="lockEmojiUrl" aria-hidden="true" class="w-12 h-12" alt="" />
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
