<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '@/lib/dateFormat';
import type { UserPresence } from '@manlycam/types';

const MAX_RESULTS = 10;

const props = defineProps<{
  visible: boolean;
  query: string;
  viewers: UserPresence[];
  position: { bottom: number; left: number };
}>();

const emit = defineEmits<{
  select: [user: UserPresence];
  close: [];
}>();

const selectedIndex = ref(0);

const filteredViewers = computed(() => {
  const all = props.query
    ? props.viewers.filter((v) =>
        v.displayName.replace(/\s+/g, '').toLowerCase().startsWith(props.query.toLowerCase()),
      )
    : props.viewers;
  return all.slice(0, MAX_RESULTS);
});

// Reset selection when query or visibility changes
watch([() => props.query, () => props.visible], () => {
  selectedIndex.value = 0;
});

function handleKeydown(e: KeyboardEvent) {
  if (!props.visible) return;

  const len = Math.max(filteredViewers.value.length, 1);
  if (e.key === 'ArrowDown') {
    // Visually down = toward the chat box = toward index 0 (most relevant)
    e.preventDefault();
    selectedIndex.value = (selectedIndex.value - 1 + len) % len;
  } else if (e.key === 'ArrowUp') {
    // Visually up = away from the chat box = toward higher indices (less relevant)
    e.preventDefault();
    selectedIndex.value = (selectedIndex.value + 1) % len;
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    if (filteredViewers.value.length > 0) {
      e.preventDefault();
      emit('select', filteredViewers.value[selectedIndex.value]);
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
  }
}

defineExpose({ handleKeydown, filteredViewers, selectedIndex });
</script>

<template>
  <div
    v-if="visible && filteredViewers.length > 0"
    role="listbox"
    aria-label="Mention suggestions"
    class="fixed z-50 bg-popover border border-border rounded-md shadow-lg overflow-y-auto max-h-48 min-w-[160px] flex flex-col-reverse"
    :style="{ bottom: position.bottom + 'px', left: position.left + 'px' }"
  >
    <button
      v-for="(viewer, index) in filteredViewers"
      :key="viewer.id"
      role="option"
      :aria-selected="index === selectedIndex"
      class="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-accent focus:outline-none"
      :class="{ 'bg-accent': index === selectedIndex }"
      @mousedown.prevent="emit('select', viewer)"
    >
      <Avatar class="h-5 w-5 shrink-0">
        <AvatarImage v-if="viewer.avatarUrl" :src="viewer.avatarUrl" :alt="viewer.displayName" />
        <AvatarFallback class="text-[10px]">{{ initials(viewer.displayName) }}</AvatarFallback>
      </Avatar>
      <span class="truncate">{{ viewer.displayName }}</span>
    </button>
  </div>
</template>
