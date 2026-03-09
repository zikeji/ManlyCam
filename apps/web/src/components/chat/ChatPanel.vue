<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useChat } from '@/composables/useChat';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TabsIndicator } from 'reka-ui';
import { ScrollArea } from '@/components/ui/scroll-area';
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

function handleTabChange(tab: string) {
  const newTab = tab as Tab;
  const oldIndex = TAB_ORDER.indexOf(activeTab.value);
  const newIndex = TAB_ORDER.indexOf(newTab);
  slideDirection.value = newIndex > oldIndex ? 'left' : 'right';
  activeTab.value = newTab;
}

watch(
  messages,
  async () => {
    await nextTick();
    if (scrollRef.value) {
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight;
    }
  },
  { deep: true },
);

async function handleSend(content: string) {
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
            <ScrollArea class="flex-1 min-h-0" ref="scrollRef">
              <div
                role="log"
                aria-live="polite"
                aria-label="Chat messages"
                class="flex flex-col py-2"
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
            </ScrollArea>

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
