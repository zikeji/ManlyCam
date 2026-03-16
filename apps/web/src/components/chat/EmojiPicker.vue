<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import {
  EMOJI_LIST,
  EMOJI_CATEGORIES,
  searchEmojis,
  getEmojiUrl,
  type Emoji,
} from '@/lib/emoji-data';
import { ScrollArea } from '@/components/ui/scroll-area';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  select: [emoji: Emoji];
  close: [];
}>();

const searchQuery = ref('');
const selectedCategory = ref<string>(EMOJI_CATEGORIES[0]);
const highlightedIndex = ref(0);
const searchInputRef = ref<HTMLInputElement | null>(null);
const gridScrollRef = ref<InstanceType<typeof ScrollArea> | null>(null);

const filteredEmojis = computed(() => {
  if (searchQuery.value) {
    return searchEmojis(searchQuery.value);
  }
  return EMOJI_LIST.filter((e) => e.category === selectedCategory.value);
});

// Reset state when picker opens/closes
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      searchQuery.value = '';
      selectedCategory.value = EMOJI_CATEGORIES[0];
      highlightedIndex.value = 0;
    }
  },
);

// Reset highlight and scroll position when filtered list changes (e.g. category switch)
watch(filteredEmojis, () => {
  highlightedIndex.value = 0;
  nextTick(() => {
    gridScrollRef.value?.getViewport()?.scrollTo?.({ top: 0 });
  });
});

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close');
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    highlightedIndex.value = Math.min(highlightedIndex.value + 1, filteredEmojis.value.length - 1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    highlightedIndex.value = Math.min(highlightedIndex.value + 8, filteredEmojis.value.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    highlightedIndex.value = Math.max(highlightedIndex.value - 8, 0);
  } else if (e.key === 'Enter' && filteredEmojis.value[highlightedIndex.value]) {
    e.preventDefault();
    emit('select', filteredEmojis.value[highlightedIndex.value]);
  }
}

defineExpose({ handleKeydown, searchInputRef });
</script>

<template>
  <div
    v-if="visible"
    role="dialog"
    aria-label="Emoji picker"
    class="absolute bottom-full right-0 z-50 mb-1 w-80 bg-popover border border-border rounded-lg shadow-lg overflow-hidden"
    @keydown="handleKeydown"
  >
    <!-- Search input -->
    <div class="p-2 border-b border-border">
      <input
        ref="searchInputRef"
        v-model="searchQuery"
        type="text"
        placeholder="Search emojis…"
        aria-label="Search emojis"
        class="w-full px-3 py-1.5 text-sm bg-background border border-input rounded-md placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>

    <!-- Category tabs (hidden when searching) -->
    <ScrollArea v-if="!searchQuery" horizontal class="border-b border-border">
      <div class="flex gap-1 px-2 py-1">
        <button
          v-for="cat in EMOJI_CATEGORIES"
          :key="cat"
          :aria-pressed="cat === selectedCategory"
          :aria-label="cat"
          class="shrink-0 px-2 py-0.5 text-xs rounded capitalize transition-colors hover:bg-accent"
          :class="cat === selectedCategory ? 'bg-accent font-medium' : 'text-muted-foreground'"
          @click="selectedCategory = cat"
        >
          {{ cat }}
        </button>
      </div>
    </ScrollArea>

    <!-- Emoji grid -->
    <ScrollArea ref="gridScrollRef" class="h-48">
      <div
        class="grid grid-cols-8 gap-0.5 p-2"
        role="listbox"
        :aria-label="searchQuery ? 'Search results' : selectedCategory + ' emojis'"
      >
        <button
          v-for="(emoji, index) in filteredEmojis"
          :key="emoji.codepoint"
          role="option"
          :aria-selected="index === highlightedIndex"
          :aria-label="emoji.name"
          :title="`:${emoji.name}:`"
          class="flex items-center justify-center w-8 h-8 rounded hover:bg-accent focus:outline-none focus:bg-accent transition-colors"
          :class="{ 'bg-accent': index === highlightedIndex }"
          @click="emit('select', emoji)"
        >
          <img
            :src="getEmojiUrl(emoji.codepoint)"
            :alt="emoji.name"
            class="w-5 h-5 object-contain text-transparent"
            loading="lazy"
          />
        </button>

        <div
          v-if="filteredEmojis.length === 0"
          class="col-span-8 py-4 text-center text-sm text-muted-foreground"
        >
          No emojis found
        </div>
      </div>
    </ScrollArea>
  </div>
</template>
