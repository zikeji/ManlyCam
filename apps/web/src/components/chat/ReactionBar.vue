<script setup lang="ts">
import { ref } from 'vue';
import { EMOJI_MAP, getEmojiUrl } from '@/lib/emoji-data';
import EmojiPicker from './EmojiPicker.vue';
import type { Emoji } from '@/lib/emoji-data';

// These slugs match the unicode-emoji-json data used by emoji-data.ts
const QUICK_REACTIONS = [
  'thumbs_up',
  'thumbs_down',
  'face_with_tears_of_joy',
  'red_heart',
  'face_with_open_mouth',
  'crying_face',
];

defineProps<{
  disabled?: boolean;
}>();

const emit = defineEmits<{
  select: [emoji: string]; // shortcode without colons
  close: [];
}>();

const showPicker = ref(false);
const moreButtonRef = ref<HTMLButtonElement | null>(null);
const pickerPosition = ref<{ bottom: number; right: number } | null>(null);

function getQuickEmojiUrl(shortcode: string): string {
  const emoji = EMOJI_MAP.get(shortcode);
  if (!emoji) return '';
  return getEmojiUrl(emoji.codepoint);
}

function handleQuickReaction(shortcode: string) {
  emit('select', shortcode);
}

function togglePicker() {
  showPicker.value = !showPicker.value;
  if (showPicker.value && moreButtonRef.value) {
    const rect = moreButtonRef.value.getBoundingClientRect();
    pickerPosition.value = {
      bottom: window.innerHeight - rect.top + 8,
      right: window.innerWidth - rect.right,
    };
  }
}

function handlePickerSelect(emoji: Emoji) {
  emit('select', emoji.name);
  showPicker.value = false;
}
</script>

<template>
  <div
    class="reaction-bar flex items-center gap-1 p-1 rounded-lg bg-popover border border-border shadow-md"
    role="toolbar"
    aria-label="Quick reactions"
  >
    <button
      v-for="shortcode in QUICK_REACTIONS"
      :key="shortcode"
      :disabled="disabled"
      class="w-7 h-7 flex items-center justify-center rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      :aria-label="shortcode.replace(/_/g, ' ')"
      @click.stop="handleQuickReaction(shortcode)"
    >
      <img
        v-if="getQuickEmojiUrl(shortcode)"
        :src="getQuickEmojiUrl(shortcode)"
        :alt="shortcode"
        class="w-5 h-5"
      />
      <span v-else class="text-xs">?</span>
    </button>

    <div class="relative">
      <button
        ref="moreButtonRef"
        :disabled="disabled"
        class="w-7 h-7 flex items-center justify-center rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-muted-foreground text-sm font-semibold"
        aria-label="More emoji reactions"
        @click.stop="togglePicker"
      >
        +
      </button>
      <EmojiPicker
        :visible="showPicker"
        :position="pickerPosition ?? undefined"
        @select="handlePickerSelect"
        @close="showPicker = false"
      />
    </div>
  </div>
</template>
