<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { searchEmojis, getEmojiUrl, type Emoji } from '@/lib/emoji-data';
import { ScrollArea } from '@/components/ui/scroll-area';

const MAX_RESULTS = 10;

const props = defineProps<{
  visible: boolean;
  query: string;
  position: { bottom: number; left: number };
}>();

const emit = defineEmits<{
  select: [emoji: Emoji];
  close: [];
}>();

const highlightedIndex = ref(0);

const filteredEmojis = computed(() => searchEmojis(props.query, MAX_RESULTS));

// Each item is py-1.5 + text-sm (line-height 20px) = 32px; cap at 192px (h-48)
const listHeight = computed(() => Math.min(filteredEmojis.value.length * 32, 192));

// Reset highlight when query or visibility changes
watch([() => props.query, () => props.visible], () => {
  highlightedIndex.value = 0;
});


function handleKeydown(e: KeyboardEvent) {
  if (!props.visible) return;

  const len = Math.max(filteredEmojis.value.length, 1);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    highlightedIndex.value = (highlightedIndex.value + 1) % len;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    highlightedIndex.value = (highlightedIndex.value - 1 + len) % len;
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    if (filteredEmojis.value.length > 0) {
      e.preventDefault();
      emit('select', filteredEmojis.value[highlightedIndex.value]);
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
  }
}

defineExpose({ handleKeydown, filteredEmojis, highlightedIndex });
</script>

<template>
  <div
    v-if="visible && filteredEmojis.length > 0"
    role="listbox"
    aria-label="Emoji suggestions"
    class="fixed z-50 bg-popover border border-border rounded-md shadow-lg min-w-[200px] overflow-hidden"
    :style="{ bottom: position.bottom + 'px', left: position.left + 'px' }"
  >
    <ScrollArea :style="{ height: listHeight + 'px' }">
      <button
        v-for="(emoji, index) in filteredEmojis"
        :key="emoji.codepoint"
        role="option"
        :aria-selected="index === highlightedIndex"
        class="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-accent focus:outline-none"
        :class="{ 'bg-accent': index === highlightedIndex }"
        @mousedown.prevent="emit('select', emoji)"
      >
        <img
          :src="getEmojiUrl(emoji.codepoint)"
          :alt="emoji.name"
          class="w-5 h-5 object-contain shrink-0 text-transparent"
          loading="lazy"
        />
        <span class="font-mono text-xs text-muted-foreground">:{{ emoji.name }}:</span>
      </button>
    </ScrollArea>
  </div>
</template>
