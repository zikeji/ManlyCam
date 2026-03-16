<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { Button } from '@/components/ui/button';
import { SendHorizontal, Smile } from 'lucide-vue-next';
import MentionAutocomplete from './MentionAutocomplete.vue';
import CommandAutocomplete from './CommandAutocomplete.vue';
import EmojiPicker from './EmojiPicker.vue';
import EmojiAutocomplete from './EmojiAutocomplete.vue';
import { recentlyChattedUserIds } from '@/composables/useRecentlyChatted';
import { userCache } from '@/composables/useUserCache';
import { insertEmoji, replaceEmojiQuery } from '@/composables/useEmoji';
import { getSiteName } from '@/lib/env';
import { availableCommands, loadCommands } from '@/composables/useCommands';
import type { CommandEntry } from '@/composables/useCommands';
import type { UserPresence } from '@manlycam/types';
import { SYSTEM_USER_ID } from '@manlycam/types';
import type { Emoji } from '@/lib/emoji-data';

const props = defineProps<{ muted?: boolean; viewers?: UserPresence[]; currentUserId?: string }>();

const emit = defineEmits<{
  send: [content: string];
  editLast: [];
  typingStart: [];
  typingStop: [];
}>();

const content = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const maxHeight = ref(200);
let panelObserver: ResizeObserver | null = null;

// Mention autocomplete state
const autocompleteRef = ref<InstanceType<typeof MentionAutocomplete> | null>(null);
const mentionVisible = ref(false);
const mentionQuery = ref('');
const mentionStartIndex = ref(-1);
const mentionPosition = ref({ bottom: 0, left: 0 });
// Maps nameNoSpaces.toLowerCase() → userId for all mentions selected in current draft
let mentionMap = new Map<string, string>();

// Command autocomplete state
const commandAutocompleteRef = ref<InstanceType<typeof CommandAutocomplete> | null>(null);
const commandVisible = ref(false);
const commandQuery = ref('');
const commandPosition = ref({ bottom: 0, left: 0 });

// Emoji picker state
const emojiPickerVisible = ref(false);
const emojiPickerWrapperRef = ref<HTMLDivElement | null>(null);

// Emoji autocomplete state
const emojiAutocompleteRef = ref<InstanceType<typeof EmojiAutocomplete> | null>(null);
const emojiAutocompleteVisible = ref(false);
const emojiQuery = ref('');
const emojiStartIndex = ref(-1);
const emojiAutocompletePosition = ref({ bottom: 0, left: 0 });

function resize() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  // scrollHeight excludes border; add 2px (1px top + 1px bottom) so that the inline
  // height style matches the border-box height used by the flex container for alignment.
  const natural = el.scrollHeight + 2;
  const capped = Math.min(natural, maxHeight.value);
  el.style.height = capped + 'px';
  el.style.overflowY = natural > maxHeight.value ? 'auto' : 'hidden';
}

function initPanelObserver() {
  const el = textareaRef.value;
  if (!el) return;
  const panel = el.closest('[data-chat-panel]') as HTMLElement | null;
  if (!panel) return;
  panelObserver = new ResizeObserver(() => {
    maxHeight.value = Math.floor(panel.clientHeight / 2);
    resize();
  });
  panelObserver.observe(panel);
  maxHeight.value = Math.floor(panel.clientHeight / 2);
}

watch(content, () => nextTick(resize));

onMounted(() => {
  nextTick(() =>
    requestAnimationFrame(() => {
      initPanelObserver();
      resize();
    }),
  );
  void loadCommands();
});

const charCount = computed(() => content.value.length);
const showCounter = computed(() => charCount.value >= 800);
const isEmpty = computed(() => content.value.trim().length === 0);
const siteName = computed(() => getSiteName());

let typingStopTimer: ReturnType<typeof setTimeout> | null = null;
let typingHeartbeatInterval: ReturnType<typeof setInterval> | null = null;
let isTypingActive = false;
const TYPING_STOP_DELAY_MS = 2000;
const TYPING_HEARTBEAT_MS = 4000;

function startTyping() {
  if (isTypingActive) return;
  isTypingActive = true;
  emit('typingStart');
  typingHeartbeatInterval = setInterval(() => {
    if (isTypingActive) emit('typingStart');
  }, TYPING_HEARTBEAT_MS);
}

function stopTyping() {
  if (!isTypingActive) return;
  isTypingActive = false;
  if (typingHeartbeatInterval) {
    clearInterval(typingHeartbeatInterval);
    typingHeartbeatInterval = null;
  }
  emit('typingStop');
}

function getPopupPosition(): { bottom: number; left: number } {
  const textarea = textareaRef.value;
  if (!textarea) return { bottom: 0, left: 0 };
  const rect = textarea.getBoundingClientRect();
  return {
    // bottom = distance from viewport bottom to textarea top, plus a small gap
    bottom: window.innerHeight - rect.top + 6,
    left: rect.left,
  };
}

function detectMentionAt(cursorPos: number): void {
  const text = content.value.substring(0, cursorPos);
  // Find the last @ before the cursor with no space after it
  const atIndex = text.lastIndexOf('@');
  if (atIndex === -1) {
    closeMention();
    return;
  }

  const afterAt = text.substring(atIndex + 1);
  // If there's a space after @, close autocomplete
  if (afterAt.includes(' ')) {
    closeMention();
    return;
  }

  mentionStartIndex.value = atIndex;
  mentionQuery.value = afterAt.toLowerCase();
  mentionPosition.value = getPopupPosition();
  mentionVisible.value = true;
}

function closeMention() {
  mentionVisible.value = false;
  mentionQuery.value = '';
  mentionStartIndex.value = -1;
}

function detectCommandAt(text: string): void {
  // Only show command autocomplete when text starts with / and no space yet
  if (!text.startsWith('/')) {
    closeCommand();
    return;
  }
  const afterSlash = text.slice(1);
  // If there's a space, the command name is complete — close autocomplete
  if (afterSlash.includes(' ')) {
    closeCommand();
    return;
  }
  if (availableCommands.value.length === 0) {
    closeCommand();
    return;
  }
  commandQuery.value = afterSlash.toLowerCase();
  commandPosition.value = getPopupPosition();
  commandVisible.value = true;
}

function closeCommand() {
  commandVisible.value = false;
  commandQuery.value = '';
}

function selectCommand(cmd: CommandEntry) {
  content.value = `/${cmd.name} `;
  closeCommand();
  nextTick(() => {
    const textarea = textareaRef.value;
    if (textarea) {
      textarea.focus();
      const pos = content.value.length;
      textarea.setSelectionRange(pos, pos);
    }
    resize();
  });
}

// Detect `:` followed by alphanumeric/underscore characters for emoji autocomplete
function detectEmojiAt(cursorPos: number): void {
  const text = content.value.substring(0, cursorPos);
  // Find the last `:` before cursor
  const colonIndex = text.lastIndexOf(':');
  if (colonIndex === -1) {
    closeEmojiAutocomplete();
    return;
  }

  const afterColon = text.substring(colonIndex + 1);
  // Only trigger if: afterColon has 1+ alphanumeric/underscore chars, no spaces, no colons
  if (!/^[a-z0-9_]+$/i.test(afterColon) || afterColon.length === 0) {
    closeEmojiAutocomplete();
    return;
  }

  emojiStartIndex.value = colonIndex;
  emojiQuery.value = afterColon.toLowerCase();
  emojiAutocompletePosition.value = getPopupPosition();
  emojiAutocompleteVisible.value = true;
}

function closeEmojiAutocomplete() {
  emojiAutocompleteVisible.value = false;
  emojiQuery.value = '';
  emojiStartIndex.value = -1;
}

function toggleEmojiPicker() {
  emojiPickerVisible.value = !emojiPickerVisible.value;
}

function handleEmojiSelect(emoji: Emoji) {
  const textarea = textareaRef.value;
  if (!textarea) return;

  const cursorPos = textarea.selectionStart ?? content.value.length;
  const result = insertEmoji(content.value, emoji, cursorPos);
  content.value = result.text;

  nextTick(() => {
    textarea.selectionStart = textarea.selectionEnd = result.newCursorPos;
    textarea.focus();
    resize();
  });
  // Keep picker open (AC #3: picker remains open after selection)
}

function handleEmojiAutocompleteSelect(emoji: Emoji) {
  const textarea = textareaRef.value;
  if (!textarea || emojiStartIndex.value === -1) return;

  const cursorPos = textarea.selectionStart ?? content.value.length;
  const result = replaceEmojiQuery(content.value, emoji, emojiStartIndex.value, cursorPos);
  content.value = result.text;
  closeEmojiAutocomplete();

  nextTick(() => {
    textarea.selectionStart = textarea.selectionEnd = result.newCursorPos;
    textarea.focus();
    resize();
  });
}

function handleInput() {
  const textarea = textareaRef.value;
  if (textarea) {
    const cursorPos = textarea.selectionStart ?? content.value.length;
    detectMentionAt(cursorPos);
    detectEmojiAt(cursorPos);
  }
  detectCommandAt(content.value);

  // Reset stop timer on every keystroke
  if (typingStopTimer) clearTimeout(typingStopTimer);
  typingStopTimer = setTimeout(() => stopTyping(), TYPING_STOP_DELAY_MS);

  // Fire typingStart immediately on first keystroke (if non-empty)
  if (content.value.trim().length > 0) {
    startTyping();
  }
}

function selectMention(user: UserPresence) {
  const before = content.value.substring(0, mentionStartIndex.value);
  const after = content.value.substring(mentionStartIndex.value + 1 + mentionQuery.value.length);
  const nameNoSpaces = user.displayName.replace(/\s+/g, '');
  const displayToken = `@${nameNoSpaces} `;
  mentionMap.set(nameNoSpaces.toLowerCase(), user.id);
  content.value = before + displayToken + after;
  closeMention();
  nextTick(() => {
    const textarea = textareaRef.value;
    if (textarea) {
      const pos = (before + displayToken).length;
      textarea.setSelectionRange(pos, pos);
      textarea.focus();
    }
    resize();
  });
}

// Replace @Name tokens that were autocompleted with <@ID> before sending
function resolveMentions(text: string): string {
  return text.replace(/@(\w+)/g, (_match, name) => {
    const userId = mentionMap.get(name.toLowerCase());
    return userId ? `<@${userId}>` : _match;
  });
}

function handleKeydown(e: KeyboardEvent) {
  // Let emoji autocomplete handle arrow keys, Enter, Tab, Escape when visible
  if (emojiAutocompleteVisible.value && emojiAutocompleteRef.value) {
    if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
      emojiAutocompleteRef.value.handleKeydown(e);
      return;
    }
  }

  // Let command autocomplete handle arrow keys, Enter, Tab, Escape when visible
  if (commandVisible.value && commandAutocompleteRef.value) {
    if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
      commandAutocompleteRef.value.handleKeydown(e);
      return;
    }
  }

  // Let mention autocomplete handle arrow keys, Enter, Tab, Escape when visible
  if (mentionVisible.value && autocompleteRef.value) {
    if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
      autocompleteRef.value.handleKeydown(e);
      return;
    }
  }

  // Close emoji picker on Escape
  if (e.key === 'Escape' && emojiPickerVisible.value) {
    emojiPickerVisible.value = false;
    return;
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
  if (e.key === 'ArrowUp' && content.value === '') {
    e.preventDefault();
    emit('editLast');
  }
}

function send() {
  if (isEmpty.value) return;
  if (typingStopTimer) {
    clearTimeout(typingStopTimer);
    typingStopTimer = null;
  }
  stopTyping();
  closeMention();
  closeCommand();
  closeEmojiAutocomplete();
  emojiPickerVisible.value = false;
  emit('send', resolveMentions(content.value));
  content.value = '';
  mentionMap = new Map();
  nextTick(resize);
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as Node;
  // Close mention popup if clicking outside textarea
  if (textareaRef.value && !textareaRef.value.contains(target)) {
    if (mentionVisible.value) closeMention();
    if (commandVisible.value) closeCommand();
  }
  // Close emoji picker if clicking outside the picker wrapper
  if (emojiPickerWrapperRef.value && !emojiPickerWrapperRef.value.contains(target)) {
    if (emojiPickerVisible.value) emojiPickerVisible.value = false;
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside);
});

onUnmounted(() => {
  if (typingStopTimer) clearTimeout(typingStopTimer);
  if (typingHeartbeatInterval) clearInterval(typingHeartbeatInterval);
  panelObserver?.disconnect();
  document.removeEventListener('mousedown', handleClickOutside);
});

// Sorted viewers: merge cache + online viewers, exclude self.
// Online viewers override stale cache data. Online users sort before offline.
// Recently chatted always bubble to the top.
const sortedViewers = computed(() => {
  const onlineViewerIds = new Set((props.viewers ?? []).map((v) => v.id));

  // Build merged map: cache first, then override with live presence data
  const merged = new Map(userCache.value);
  for (const viewer of props.viewers ?? []) {
    merged.set(viewer.id, viewer);
  }

  const allUsers = [...merged.values()].filter(
    (v) => v.id !== props.currentUserId && v.id !== SYSTEM_USER_ID,
  );
  const recentIds = recentlyChattedUserIds.value;

  return allUsers.sort((a, b) => {
    const aIdx = recentIds.indexOf(a.id);
    const bIdx = recentIds.indexOf(b.id);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    // Online users appear before offline
    const aOnline = onlineViewerIds.has(a.id);
    const bOnline = onlineViewerIds.has(b.id);
    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;
    return a.displayName.localeCompare(b.displayName);
  });
});
</script>

<template>
  <div class="flex items-end gap-2 relative">
    <CommandAutocomplete
      ref="commandAutocompleteRef"
      :visible="commandVisible"
      :query="commandQuery"
      :commands="availableCommands"
      :position="commandPosition"
      @select="selectCommand"
      @close="closeCommand"
    />

    <MentionAutocomplete
      ref="autocompleteRef"
      :visible="mentionVisible"
      :query="mentionQuery"
      :viewers="sortedViewers"
      :position="mentionPosition"
      @select="selectMention"
      @close="closeMention"
    />

    <EmojiAutocomplete
      ref="emojiAutocompleteRef"
      :visible="emojiAutocompleteVisible"
      :query="emojiQuery"
      :position="emojiAutocompletePosition"
      @select="handleEmojiAutocompleteSelect"
      @close="closeEmojiAutocomplete"
    />

    <!-- Textarea wrapper — also anchors emoji picker popup -->
    <div ref="emojiPickerWrapperRef" class="relative flex-1">
      <textarea
        v-if="!muted"
        ref="textareaRef"
        v-model="content"
        :aria-label="`Message ${siteName}`"
        :placeholder="`Message ${siteName}…`"
        rows="1"
        maxlength="1000"
        class="w-full resize-none rounded-md border border-input bg-background px-3 py-[7px] pr-9 text-sm align-top placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 min-h-[36px] overflow-y-hidden"
        @keydown="handleKeydown"
        @input="handleInput"
      />
      <textarea
        v-else
        readonly
        aria-label="You are muted"
        placeholder="You are muted"
        rows="1"
        class="w-full resize-none rounded-md border border-input bg-background px-3 py-[7px] text-sm align-top placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 min-h-[36px] max-h-[120px] cursor-not-allowed opacity-50"
      />

      <button
        v-if="!muted"
        type="button"
        class="absolute right-2 bottom-2 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="Open emoji picker"
        :aria-expanded="emojiPickerVisible"
        @click="toggleEmojiPicker"
      >
        <Smile class="h-4 w-4" />
      </button>

      <EmojiPicker
        :visible="emojiPickerVisible"
        @select="handleEmojiSelect"
        @close="emojiPickerVisible = false"
      />

      <span
        v-if="showCounter"
        :class="[
          'absolute bottom-1 text-xs text-muted-foreground pointer-events-none',
          muted ? 'right-2' : 'right-9',
        ]"
      >
        {{ charCount }}/1000
      </span>
    </div>

    <Button
      variant="default"
      size="icon"
      class="shrink-0 h-9 w-9 self-end"
      :disabled="isEmpty || muted"
      aria-label="Send message"
      @click="send"
    >
      <SendHorizontal class="h-4 w-4" />
    </Button>
  </div>
</template>
