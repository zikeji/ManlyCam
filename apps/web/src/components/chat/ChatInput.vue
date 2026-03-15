<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { Button } from '@/components/ui/button';
import { SendHorizontal } from 'lucide-vue-next';
import MentionAutocomplete from './MentionAutocomplete.vue';
import CommandAutocomplete from './CommandAutocomplete.vue';
import { recentlyChattedUserIds } from '@/composables/useRecentlyChatted';
import { userCache } from '@/composables/useUserCache';
import { getSiteName } from '@/lib/env';
import { apiFetch } from '@/lib/api';
import type { UserPresence } from '@manlycam/types';
import { SYSTEM_USER_ID } from '@manlycam/types';

interface CommandEntry {
  name: string;
  description: string;
  placeholder?: string;
}

const props = defineProps<{ muted?: boolean; viewers?: UserPresence[]; currentUserId?: string }>();

const emit = defineEmits<{ send: [content: string]; editLast: []; typingStart: []; typingStop: [] }>();

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
const availableCommands = ref<CommandEntry[]>([]);

function resize() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  const capped = Math.min(el.scrollHeight, maxHeight.value);
  el.style.height = capped + 'px';
  el.style.overflowY = el.scrollHeight > maxHeight.value ? 'auto' : 'hidden';
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
  nextTick(() => requestAnimationFrame(() => { initPanelObserver(); resize(); }));
  // Fetch available commands for the current user's role
  apiFetch<{ commands: CommandEntry[] }>('/api/commands')
    .then((data) => { availableCommands.value = data.commands; })
    .catch(() => { /* commands unavailable — silent fail */ });
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
  if (typingHeartbeatInterval) { clearInterval(typingHeartbeatInterval); typingHeartbeatInterval = null; }
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

function handleInput() {
  const textarea = textareaRef.value;
  if (textarea) {
    detectMentionAt(textarea.selectionStart ?? content.value.length);
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
  const after = content.value.substring(
    mentionStartIndex.value + 1 + mentionQuery.value.length,
  );
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
  if (typingStopTimer) { clearTimeout(typingStopTimer); typingStopTimer = null; }
  stopTyping();
  closeMention();
  closeCommand();
  emit('send', resolveMentions(content.value));
  content.value = '';
  mentionMap = new Map();
  nextTick(resize);
}

function handleClickOutside(e: MouseEvent) {
  if (textareaRef.value && !textareaRef.value.contains(e.target as Node)) {
    if (mentionVisible.value) closeMention();
    if (commandVisible.value) closeCommand();
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
  for (const viewer of (props.viewers ?? [])) {
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

    <div class="relative flex-1">
      <textarea
        v-if="!muted"
        ref="textareaRef"
        v-model="content"
        :aria-label="`Message ${siteName}`"
        :placeholder="`Message ${siteName}…`"
        rows="1"
        maxlength="1000"
        class="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 min-h-[36px] overflow-y-hidden"
        @keydown="handleKeydown"
        @input="handleInput"
      />
      <textarea
        v-else
        readonly
        aria-label="You are muted"
        placeholder="You are muted"
        rows="1"
        class="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 min-h-[36px] max-h-[120px] cursor-not-allowed opacity-50"
      />
      <span
        v-if="showCounter"
        class="absolute bottom-1 right-2 text-xs text-muted-foreground pointer-events-none"
      >
        {{ charCount }}/1000
      </span>
    </div>

    <Button
      variant="default"
      size="icon"
      class="shrink-0 h-9 w-9"
      :disabled="isEmpty || muted"
      aria-label="Send message"
      @click="send"
    >
      <SendHorizontal class="h-4 w-4" />
    </Button>
  </div>
</template>
