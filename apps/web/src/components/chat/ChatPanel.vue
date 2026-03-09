<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useChat } from '@/composables/useChat';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TabsIndicator } from 'reka-ui';
import ChatMessage from './ChatMessage.vue';
import ChatInput from './ChatInput.vue';
import ProfileAnchor from '@/components/stream/ProfileAnchor.vue';

const emit = defineEmits<{ openCameraControls: [] }>();

const { messages, sendChatMessage } = useChat();

const scrollRef = ref<HTMLElement | null>(null);
const profilePopoverOpen = ref(false);

const TAB_ORDER = ['chat', 'viewers'] as const;
type Tab = (typeof TAB_ORDER)[number];

const activeTab = ref<Tab>('chat');
const slideDirection = ref<'left' | 'right'>('left');

// Scroll state preserved across tab switches
const savedScrollTop = ref(0);
const savedWasNearBottom = ref(true);

// When set, the next message appended scrolls to bottom unconditionally (own send)
const forceNextScroll = ref(false);

const SCROLL_THRESHOLD = 80; // px from bottom — within this range auto-scroll follows

function isNearBottom(): boolean {
  if (!scrollRef.value) return false;
  const { scrollTop, scrollHeight, clientHeight } = scrollRef.value;
  return scrollHeight - scrollTop - clientHeight <= SCROLL_THRESHOLD;
}

function handleTabChange(tab: string | number) {
  const newTab = String(tab) as Tab;
  const oldIndex = TAB_ORDER.indexOf(activeTab.value);
  const newIndex = TAB_ORDER.indexOf(newTab);
  slideDirection.value = newIndex > oldIndex ? 'left' : 'right';

  // Snapshot scroll state before the chat tab is destroyed
  if (activeTab.value === 'chat' && scrollRef.value) {
    savedScrollTop.value = scrollRef.value.scrollTop;
    savedWasNearBottom.value = isNearBottom();
  }

  activeTab.value = newTab;

  // Restore scroll state once the chat tab remounts
  if (newTab === 'chat') {
    nextTick(() => {
      if (!scrollRef.value) return;
      if (savedWasNearBottom.value) {
        // Was at bottom before — scroll to current bottom to pick up new messages
        scrollRef.value.scrollTop = scrollRef.value.scrollHeight;
      } else {
        // Was scrolled up — restore exact position
        scrollRef.value.scrollTop = savedScrollTop.value;
      }
    });
  }
}

watch(
  messages,
  async () => {
    const shouldFollow = forceNextScroll.value || isNearBottom();
    forceNextScroll.value = false;
    await nextTick();
    if (shouldFollow && scrollRef.value) {
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight;
    }
  },
  { deep: true },
);

async function handleSend(content: string) {
  forceNextScroll.value = true;
  await sendChatMessage(content);
}
</script>

<template>
  <div class="flex flex-col h-full">
    <Tabs
      :model-value="activeTab"
      @update:model-value="handleTabChange"
      class="flex flex-col flex-1 min-h-0"
    >
      <TabsList
        class="relative flex w-full rounded-none bg-transparent p-0 gap-0 h-10 border-b border-[hsl(var(--border))]"
      >
        <TabsIndicator
          class="absolute bottom-0 left-0 h-0.5 bg-foreground w-[--reka-tabs-indicator-size] translate-x-[--reka-tabs-indicator-position] transition-all duration-200 ease-in-out"
        />
        <TabsTrigger
          value="chat"
          class="flex-1 rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none text-muted-foreground data-[state=active]:text-foreground transition-colors"
        >
          Chat
        </TabsTrigger>
        <TabsTrigger
          value="viewers"
          class="flex-1 rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none text-muted-foreground data-[state=active]:text-foreground transition-colors"
        >
          Viewers
        </TabsTrigger>
      </TabsList>

      <!-- Content area: slides in/out based on direction -->
      <div class="flex-1 min-h-0 relative overflow-hidden">
        <Transition :name="slideDirection === 'left' ? 'slide-left' : 'slide-right'">
          <!-- Chat tab -->
          <div v-if="activeTab === 'chat'" key="chat" class="absolute inset-0 flex flex-col">
            <div class="flex-1 min-h-0 overflow-y-auto" ref="scrollRef">
              <div
                role="log"
                aria-live="polite"
                aria-label="Chat messages"
                class="flex flex-col justify-end min-h-full py-2"
              >
                <div
                  v-if="messages.length === 0"
                  class="flex items-center justify-center h-32 text-sm text-muted-foreground text-center px-4"
                >
                  Be the first to say something 👋
                </div>

                <ChatMessage
                  v-for="message in messages"
                  :key="message.id"
                  :message="message"
                />
              </div>
            </div>

            <!-- Mobile input bar: avatar + input -->
            <div class="flex items-center gap-2 p-2 border-t border-[hsl(var(--border))] lg:hidden">
              <ProfileAnchor
                :isDesktop="false"
                v-model:popover-open="profilePopoverOpen"
                @open-camera-controls="emit('openCameraControls')"
              />
              <ChatInput class="flex-1" @send="handleSend" />
            </div>

            <!-- Desktop input: standalone -->
            <div class="p-2 border-t border-[hsl(var(--border))] hidden lg:block">
              <ChatInput @send="handleSend" />
            </div>
          </div>

          <!-- Viewers tab -->
          <div v-else key="viewers" class="absolute inset-0">
            <!-- Story 4.6: presence list -->
          </div>
        </Transition>
      </div>
    </Tabs>
  </div>
</template>

<style scoped>
/* Navigating right (Chat → Viewers): new content enters from right, old exits left */
.slide-left-enter-from,
.slide-left-leave-to {
  position: absolute;
  inset: 0;
}
.slide-left-enter-from { transform: translateX(100%); }
.slide-left-leave-to   { transform: translateX(-100%); }
.slide-left-enter-active,
.slide-left-leave-active { transition: transform 220ms ease-in-out; }

/* Navigating left (Viewers → Chat): new content enters from left, old exits right */
.slide-right-enter-from,
.slide-right-leave-to {
  position: absolute;
  inset: 0;
}
.slide-right-enter-from { transform: translateX(-100%); }
.slide-right-leave-to   { transform: translateX(100%); }
.slide-right-enter-active,
.slide-right-leave-active { transition: transform 220ms ease-in-out; }
</style>
