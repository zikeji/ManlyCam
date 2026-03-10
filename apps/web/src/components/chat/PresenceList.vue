<script setup lang="ts">
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { UserPresence } from '@manlycam/types';

defineProps<{
  viewers: UserPresence[];
}>();

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
</script>

<template>
  <div class="p-3">
    <p
      v-if="viewers.length === 0"
      class="text-sm text-muted-foreground text-center mt-4"
    >
      Just you for now 👀
    </p>
    <ul v-else class="space-y-2">
      <li
        v-for="viewer in viewers"
        :key="viewer.id"
        class="flex items-center gap-2"
      >
        <Avatar class="h-8 w-8 shrink-0 rounded-full">
          <AvatarImage :src="viewer.avatarUrl ?? ''" :alt="viewer.displayName" />
          <AvatarFallback class="text-xs">{{ initials(viewer.displayName) }}</AvatarFallback>
        </Avatar>
        <span class="text-sm truncate">{{ viewer.displayName }}</span>
        <span
          v-if="viewer.userTag"
          class="text-xs px-1.5 py-0.5 rounded font-medium shrink-0"
          :style="{ color: viewer.userTag.color, borderColor: viewer.userTag.color, borderWidth: '1px', borderStyle: 'solid' }"
        >{{ viewer.userTag.text }}</span>
      </li>
    </ul>
  </div>
</template>
