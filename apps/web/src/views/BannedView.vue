<script setup lang="ts">
import { getSiteName } from '@/lib/env'
import { getEmojiUrl } from '@/lib/emoji-data'

const siteName = getSiteName()
const noEntryEmojiUrl = getEmojiUrl('1f6ab')
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-background">
    <div class="flex w-full max-w-md flex-col items-center gap-6 rounded-lg border border-border bg-card p-10 shadow-lg">
      <div class="flex flex-col items-center gap-2 text-center">
        <img :src="noEntryEmojiUrl" aria-hidden="true" class="w-12 h-12" alt="" />
        <h1 class="text-2xl font-semibold text-foreground">
          Account Suspended
        </h1>
        <p class="text-sm text-muted-foreground">
          Your access to {{ siteName }} has been removed.
        </p>
      </div>
    </div>
  </main>
</template>
