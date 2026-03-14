<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { Button } from '@/components/ui/button';
import { SendHorizontal } from 'lucide-vue-next';

defineProps<{ muted?: boolean }>();

const emit = defineEmits<{ send: [content: string]; editLast: []; typingStart: []; typingStop: [] }>();

const content = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const maxHeight = ref(200);
let panelObserver: ResizeObserver | null = null;

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

onMounted(() => nextTick(() => requestAnimationFrame(() => { initPanelObserver(); resize(); })));

const charCount = computed(() => content.value.length);
const showCounter = computed(() => charCount.value >= 800);
const isEmpty = computed(() => content.value.trim().length === 0);

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

function handleInput() {
  // Reset stop timer on every keystroke
  if (typingStopTimer) clearTimeout(typingStopTimer);
  typingStopTimer = setTimeout(() => stopTyping(), TYPING_STOP_DELAY_MS);

  // Fire typingStart immediately on first keystroke (if non-empty)
  if (content.value.trim().length > 0) {
    startTyping();
  }
}

function handleKeydown(e: KeyboardEvent) {
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
  emit('send', content.value);
  content.value = '';
  nextTick(resize);
}

onUnmounted(() => {
  if (typingStopTimer) clearTimeout(typingStopTimer);
  if (typingHeartbeatInterval) clearInterval(typingHeartbeatInterval);
  panelObserver?.disconnect();
});
</script>

<template>
  <div class="flex items-end gap-2">
    <div class="relative flex-1">
      <textarea
        v-if="!muted"
        ref="textareaRef"
        v-model="content"
        aria-label="Message ManlyCam"
        placeholder="Message ManlyCam…"
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
