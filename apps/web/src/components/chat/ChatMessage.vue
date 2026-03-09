<script setup lang="ts">
import { computed } from 'vue';
import type { ChatMessage } from '@manlycam/types';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { renderMarkdownLite } from '@/lib/markdown';
import { formatTime, initials } from '@/lib/dateFormat';

const props = defineProps<{ message: ChatMessage; isContinuation?: boolean }>();

const timeLabel = computed(() => formatTime(props.message.createdAt));
const avatarInitials = computed(() => initials(props.message.displayName));
const renderedContent = computed(() => renderMarkdownLite(props.message.content));
</script>

<template>
  <!-- Continuation row: only message body, indented to align with group header text -->
  <div
    v-if="isContinuation"
    role="listitem"
    class="px-3 py-0.5 pr-3 pl-[52px] hover:bg-white/[.03]"
  >
    <p
      class="text-sm text-foreground break-words [&_a]:underline [&_a]:text-primary [&_code]:font-mono [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded"
      v-html="renderedContent"
    />
  </div>

  <!-- Group header row: avatar + name + tag + timestamp + message body -->
  <div v-else role="listitem" class="flex items-start gap-2 px-3 py-1.5 hover:bg-white/[.03]">
    <Avatar class="h-8 w-8 shrink-0 mt-0.5">
      <AvatarImage
        v-if="message.avatarUrl"
        :src="message.avatarUrl"
        :alt="message.displayName"
        referrer-policy="no-referrer"
      />
      <AvatarFallback class="text-xs">{{ avatarInitials }}</AvatarFallback>
    </Avatar>

    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-1.5 flex-wrap">
        <span class="text-sm font-semibold text-foreground truncate">{{ message.displayName }}</span>
        <span
          v-if="message.userTag"
          class="text-xs px-1.5 py-0.5 rounded font-semibold shrink-0"
          :style="{ backgroundColor: message.userTag.color + '66', color: message.userTag.color }"
        >
          {{ message.userTag.text }}
        </span>
        <span class="text-xs text-muted-foreground shrink-0">{{ timeLabel }}</span>
      </div>
      <p
        class="text-sm text-foreground break-words [&_a]:underline [&_a]:text-primary [&_code]:font-mono [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded"
        v-html="renderedContent"
      />
    </div>
  </div>
</template>
