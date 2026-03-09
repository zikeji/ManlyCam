<script setup lang="ts">
import { computed, watch, ref } from 'vue';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const props = defineProps<{
  isOpen: boolean
  unreadCount: number
}>();

const emit = defineEmits<{ toggle: [] }>();

const isPulsing = ref(false);

watch(() => props.unreadCount, (newVal, oldVal) => {
  if (newVal > (oldVal ?? 0)) {
    isPulsing.value = true;
    setTimeout(() => { isPulsing.value = false; }, 400);
  }
});

const ariaLabel = computed(() => {
  if (!props.isOpen && props.unreadCount > 0) {
    return `Expand chat sidebar (${props.unreadCount} unread)`;
  }
  return props.isOpen ? 'Collapse chat sidebar' : 'Expand chat sidebar';
});
</script>

<template>
  <div class="relative">
    <Button
      variant="ghost"
      size="icon"
      class="rounded p-0 w-9 h-9 text-foreground hover:bg-accent"
      :aria-label="ariaLabel"
      @click="emit('toggle')"
    >
      <ChevronRight v-if="isOpen" class="w-4 h-4" />
      <ChevronLeft v-else class="w-4 h-4" />
    </Button>
    <Badge
      v-if="!isOpen && unreadCount > 0"
      :class="['absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 text-[10px] border-2 border-black/60 pointer-events-none', isPulsing && 'badge-pulse']"
      aria-hidden="true"
    >
      {{ unreadCount > 99 ? '99+' : unreadCount }}
    </Badge>
  </div>
</template>

<style scoped>
@keyframes badge-pulse {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.25); }
  100% { transform: scale(1); }
}

.badge-pulse {
  animation: badge-pulse 400ms ease-in-out;
}
</style>
