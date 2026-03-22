<script setup lang="ts">
import { ref, watch } from 'vue';
import { getPetName } from '@/lib/env';
import { getEmojiUrl } from '@/lib/emoji-data';
import { useOfflineMessage } from '@/composables/useOfflineMessage';
import EmojiPicker from '@/components/chat/EmojiPicker.vue';
import type { Emoji } from '@/lib/emoji-data';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const petName = getPetName();
const defaultTitle = `${petName} needs their Zzzs`;
const defaultDescription = "The stream is offline for now. Check back later — they'll be back.";

const draftEmoji = ref<string | null>(null);
const draftTitle = ref('');
const draftDescription = ref('');
const isSubmitting = ref(false);
const pickerVisible = ref(false);

const { fetchOfflineMessage, saveOfflineMessage } = useOfflineMessage();

const emojiPreviewUrl = () => getEmojiUrl(draftEmoji.value ?? '1f634');

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) {
      pickerVisible.value = false;
      return;
    }
    pickerVisible.value = false;
    const data = await fetchOfflineMessage();
    if (data) {
      draftEmoji.value = data.emoji;
      draftTitle.value = data.title ?? '';
      draftDescription.value = data.description ?? '';
    } else {
      draftEmoji.value = null;
      draftTitle.value = '';
      draftDescription.value = '';
    }
  },
);

function handleEmojiSelect(emoji: Emoji) {
  draftEmoji.value = emoji.codepoint;
  pickerVisible.value = false;
}

async function handleSave() {
  isSubmitting.value = true;
  const payload = {
    emoji: draftEmoji.value || null,
    title: draftTitle.value.trim() || null,
    description: draftDescription.value.trim() || null,
  };
  const ok = await saveOfflineMessage(payload);
  isSubmitting.value = false;
  if (ok) emit('update:open', false);
}

async function handleReset() {
  isSubmitting.value = true;
  const ok = await saveOfflineMessage({ emoji: null, title: null, description: null });
  isSubmitting.value = false;
  if (ok) emit('update:open', false);
}

function handleCancel() {
  emit('update:open', false);
}
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-md">
      <div data-offline-dialog class="contents">
      <DialogHeader>
        <DialogTitle>Edit Offline Message</DialogTitle>
      </DialogHeader>

      <div class="space-y-4">
        <!-- Emoji row -->
        <div class="relative flex items-center gap-3">
          <button
            type="button"
            class="relative flex h-12 w-12 items-center justify-center rounded-lg border border-input hover:bg-accent transition-colors"
            data-emoji-trigger
            @click="pickerVisible = !pickerVisible"
          >
            <img :src="emojiPreviewUrl()" alt="Offline emoji" class="w-8 h-8" />
          </button>
          <span class="text-sm text-muted-foreground">Click emoji to change</span>
          <EmojiPicker
            :visible="pickerVisible"
            :position="{ bottom: 60, right: 16 }"
            @select="handleEmojiSelect"
            @close="pickerVisible = false"
          />
        </div>

        <!-- Title input -->
        <div class="space-y-1">
          <label class="text-sm font-medium" for="offline-title">Title</label>
          <input
            id="offline-title"
            v-model="draftTitle"
            type="text"
            :placeholder="defaultTitle"
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            data-title-input
          />
        </div>

        <!-- Description input -->
        <div class="space-y-1">
          <label class="text-sm font-medium" for="offline-description">Description</label>
          <input
            id="offline-description"
            v-model="draftDescription"
            type="text"
            :placeholder="defaultDescription"
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            data-description-input
          />
        </div>
      </div>

      <DialogFooter class="flex-row items-center justify-between sm:justify-between">
        <Button
          variant="ghost"
          :disabled="isSubmitting"
          data-reset-button
          @click="handleReset"
        >
          Reset
        </Button>
        <div class="flex gap-2">
          <Button variant="ghost" :disabled="isSubmitting" data-cancel-button @click="handleCancel">
            Cancel
          </Button>
          <Button :disabled="isSubmitting" data-save-button @click="handleSave">
            Save
          </Button>
        </div>
      </DialogFooter>
      </div>
    </DialogContent>
  </Dialog>
</template>
