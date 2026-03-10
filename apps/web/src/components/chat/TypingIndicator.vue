<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  typingUsers: { userId: string; displayName: string }[];
}>();

const label = computed(() => {
  const n = props.typingUsers.length;
  if (n === 0) return '';
  if (n === 1) return `${props.typingUsers[0].displayName} is typing`;
  if (n === 2) return `${props.typingUsers[0].displayName} and ${props.typingUsers[1].displayName} are typing`;
  return 'Several people are typing';
});
</script>

<template>
  <!-- Fixed height container — never changes size, so input bar never shifts -->
  <div
    class="h-4 flex items-center px-3 text-xs text-muted-foreground overflow-hidden"
    aria-live="polite"
    aria-atomic="false"
  >
    <div
      v-if="typingUsers.length > 0"
      class="flex items-center gap-1"
    >
      <span>{{ label }}</span>
      <span class="flex items-center gap-0.5 ml-1 typing-dots" aria-hidden="true">
        <span class="typing-dot" style="animation-delay: 0ms" />
        <span class="typing-dot" style="animation-delay: 200ms" />
        <span class="typing-dot" style="animation-delay: 400ms" />
      </span>
    </div>
  </div>
</template>

<style scoped>
.typing-dot {
  display: inline-block;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: currentColor;
  animation: bounce 1s ease-in-out infinite;
}

@keyframes bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-4px); }
}

@media (prefers-reduced-motion: reduce) {
  .typing-dots {
    display: none;
  }
}
</style>
