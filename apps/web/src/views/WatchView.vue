<script setup lang="ts">
import { onMounted, ref, watch, computed } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { useStream } from '@/composables/useStream';
import { Role } from '@manlycam/types';
import StreamPlayer from '@/components/stream/StreamPlayer.vue';
import BroadcastConsole from '@/components/stream/BroadcastConsole.vue';
import AtmosphericVoid from '@/components/stream/AtmosphericVoid.vue';
import AdminPanel from '@/components/admin/AdminPanel.vue';
import UserManagerDialog from '@/components/admin/UserManagerDialog.vue';
import ChatPanel from '@/components/chat/ChatPanel.vue';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { messages, unreadCount, resetUnread, incrementUnread, isLoadingHistory } from '@/composables/useChat';

const { user } = useAuth();
const { streamState, initStream } = useStream();

const isDesktop = ref(false);
const isMobilePortrait = ref(false);
const isMobileLandscape = ref(false);
const chatSidebarOpen = ref(true);

const adminPanelOpen = ref(false);
const userManagerOpen = ref(false);

const streamPlayerRef = ref<InstanceType<typeof StreamPlayer> | null>(null);
const streamVideoRef = computed(() => streamPlayerRef.value?.videoRef ?? null);

const mobileSheetOpen = computed({
  get: () => adminPanelOpen.value && !isDesktop.value,
  set: (val: boolean) => { adminPanelOpen.value = val; },
});

watch(adminPanelOpen, (newValue) => {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem('manlycam:admin-panel-open', newValue ? 'true' : 'false');
    }
  } catch { /* ignore */ }
});

watch(chatSidebarOpen, (open) => {
  if (open) resetUnread();
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem('manlycam:chat-sidebar-open', open ? 'true' : 'false');
    }
  } catch { /* ignore */ }
});

watch(() => messages.value.length, (newLen, oldLen) => {
  if (!chatSidebarOpen.value && !isLoadingHistory.value && newLen > (oldLen ?? 0)) {
    incrementUnread();
  }
}, { flush: 'sync' });

const isAdmin = computed(() => user.value?.role === Role.Admin);

const handleOpenCameraControls = () => { adminPanelOpen.value = !adminPanelOpen.value; };
const handleToggleAdminPanel = () => { adminPanelOpen.value = !adminPanelOpen.value; };
const handleToggleChatSidebar = () => { chatSidebarOpen.value = !chatSidebarOpen.value; };

onMounted(() => {
  initStream();

  if (typeof window.matchMedia === 'function') {
    const mqDesktop = window.matchMedia('(min-width: 1024px)');
    isDesktop.value = mqDesktop.matches;
    mqDesktop.addEventListener('change', (e) => { isDesktop.value = e.matches; });

    const mqPortrait = window.matchMedia('(max-width: 1023px) and (orientation: portrait)');
    isMobilePortrait.value = mqPortrait.matches;
    mqPortrait.addEventListener('change', (e) => { isMobilePortrait.value = e.matches; });

    const mqLandscape = window.matchMedia('(max-width: 1023px) and (orientation: landscape)');
    isMobileLandscape.value = mqLandscape.matches;
    mqLandscape.addEventListener('change', (e) => { isMobileLandscape.value = e.matches; });
  }

  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      adminPanelOpen.value = localStorage.getItem('manlycam:admin-panel-open') === 'true';

      const stored = localStorage.getItem('manlycam:chat-sidebar-open');
      if (stored !== null) {
        chatSidebarOpen.value = stored === 'true';
      } else {
        chatSidebarOpen.value = isDesktop.value;
      }
    }
  } catch { /* ignore */ }
});
</script>

<template>
  <div class="flex flex-col landscape:flex-row lg:flex-row h-screen w-full overflow-hidden bg-[hsl(var(--background))]">
    <!-- Left sidebar: admin only, desktop -->
    <Transition name="sidebar-left">
      <aside
        v-if="isAdmin && adminPanelOpen && isDesktop"
        data-sidebar-left
        class="w-[280px] shrink-0 flex flex-col bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--border))] z-30"
      >
        <AdminPanel :show-close="false" @close="adminPanelOpen = false" />
      </aside>
    </Transition>

    <!-- Main Column: Stream + Console (when not in landscape right-column) -->
    <main class="flex-1 min-w-0 flex flex-col bg-black overflow-hidden relative">
      <!-- Non-portrait content area: Void + Stream Centered -->
      <div v-if="!isMobilePortrait" class="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden">
        <AtmosphericVoid
          v-if="!isMobileLandscape"
          class="absolute inset-0"
          :video-ref="streamVideoRef"
        />
        <StreamPlayer
          ref="streamPlayerRef"
          class="relative z-10 w-full"
          :streamState="streamState"
          :chatSidebarOpen="chatSidebarOpen"
          :unreadCount="unreadCount"
          :showLandscapeTapToggle="isMobileLandscape && !chatSidebarOpen"
          @toggle-chat-sidebar="handleToggleChatSidebar"
        />
      </div>

      <!-- Portrait content area: Stream at top, shrink-0 -->
      <div v-if="isMobilePortrait" class="shrink-0 w-full">
        <StreamPlayer
          ref="streamPlayerRef"
          class="w-full"
          :streamState="streamState"
          :chatSidebarOpen="chatSidebarOpen"
          :unreadCount="unreadCount"
          :showLandscapeTapToggle="false"
          @toggle-chat-sidebar="handleToggleChatSidebar"
        />
      </div>

      <!-- Broadcast Console (Non-landscape) -->
      <BroadcastConsole
        v-if="!isMobileLandscape"
        :isAdmin="isAdmin"
        :streamState="streamState"
        :adminPanelOpen="adminPanelOpen"
        :chatSidebarOpen="chatSidebarOpen"
        :unreadCount="unreadCount"
        :isDesktop="isDesktop"
        :showChatToggle="!isMobilePortrait"
        :videoRef="streamVideoRef"
        @toggle-admin-panel="handleToggleAdminPanel"
        @toggle-chat-sidebar="handleToggleChatSidebar"
        @open-user-manager="userManagerOpen = true"
      />

      <!-- Portrait Chat (Replaces Void) -->
      <ChatPanel
        v-if="isMobilePortrait"
        data-chat-panel
        class="flex-1 min-h-0 flex flex-col bg-[hsl(var(--sidebar))]"
        @open-camera-controls="handleOpenCameraControls"
        @open-user-manager="userManagerOpen = true"
      />
    </main>

    <!-- Mobile Landscape Right Column -->
    <Transition v-if="isMobileLandscape" name="sidebar-right">
      <div
        v-if="chatSidebarOpen"
        class="w-[280px] shrink-0 flex flex-col bg-[hsl(var(--sidebar))] border-l border-[hsl(var(--border))] z-30"
      >
        <ChatPanel
          class="flex-1 flex flex-col min-h-0"
          @open-camera-controls="handleOpenCameraControls"
          @open-user-manager="userManagerOpen = true"
        />
        <BroadcastConsole
          :isAdmin="isAdmin"
          :streamState="streamState"
          :adminPanelOpen="adminPanelOpen"
          :chatSidebarOpen="chatSidebarOpen"
          :unreadCount="unreadCount"
          :isDesktop="false"
          :showViewerCount="false"
          :videoRef="streamVideoRef"
          @toggle-admin-panel="handleToggleAdminPanel"
          @toggle-chat-sidebar="handleToggleChatSidebar"
          @open-user-manager="userManagerOpen = true"
        />
      </div>
    </Transition>

    <!-- Desktop / Tablet Right Sidebar -->
    <Transition v-if="!isMobilePortrait && !isMobileLandscape" name="sidebar-right">
      <ChatPanel
        v-if="chatSidebarOpen"
        data-chat-panel
        class="lg:flex-none lg:w-[320px] shrink-0 flex flex-col bg-[hsl(var(--sidebar))] border-l border-[hsl(var(--border))] z-30"
        @open-camera-controls="handleOpenCameraControls"
        @open-user-manager="userManagerOpen = true"
      />
    </Transition>

    <!-- Mobile: Sheet drawer for admin controls (< lg only) -->
    <Sheet v-if="isAdmin" v-model:open="mobileSheetOpen">
      <SheetContent side="bottom" class="h-[90vh] p-0">
        <AdminPanel :show-close="false" @close="adminPanelOpen = false" />
      </SheetContent>
    </Sheet>

    <UserManagerDialog v-if="isAdmin" v-model:open="userManagerOpen" />
  </div>
</template>

<style scoped>
.sidebar-left-enter-active {
  transition: margin-left 250ms ease-out;
}
.sidebar-left-leave-active {
  transition: margin-left 200ms ease-in;
}
.sidebar-left-enter-from,
.sidebar-left-leave-to {
  margin-left: -280px;
}

.sidebar-right-enter-active,
.sidebar-right-leave-active {
  transition: margin-right 150ms ease-in-out;
}
.sidebar-right-enter-from,
.sidebar-right-leave-to {
  margin-right: -320px;
}
@media (max-width: 1023px) and (orientation: landscape) {
  .sidebar-right-enter-from,
  .sidebar-right-leave-to {
    margin-right: -280px;
  }
}
</style>
