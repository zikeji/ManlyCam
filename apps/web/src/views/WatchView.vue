<script setup lang="ts">
import { onMounted, ref, watch, computed } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { useStream } from '@/composables/useStream';
import { Role } from '@manlycam/types';
import StreamPlayer from '@/components/stream/StreamPlayer.vue';
import AdminPanel from '@/components/admin/AdminPanel.vue';
import ChatPanel from '@/components/chat/ChatPanel.vue';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { messages, unreadCount, resetUnread, incrementUnread, isLoadingHistory } from '@/composables/useChat';

const { user } = useAuth();
const { streamState, initStream } = useStream();

// Whether we're on a desktop breakpoint (≥ 1024px)
const isDesktop = ref(false);
const isMobilePortrait = ref(false);
const chatSidebarOpen = ref(true);

const adminPanelOpen = ref(false);

// mobileSheetOpen is only true when on mobile and panel is open
const mobileSheetOpen = computed({
  get: () => adminPanelOpen.value && !isDesktop.value,
  set: (val: boolean) => { adminPanelOpen.value = val; },
});

watch(adminPanelOpen, (newValue) => {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem('manlycam:admin-panel-open', newValue ? 'true' : 'false');
    }
  } catch { /* not available in test env */ }
});

watch(chatSidebarOpen, (open) => {
  if (open) resetUnread();
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem('manlycam:chat-sidebar-open', open ? 'true' : 'false');
    }
  } catch { /* not available in test env */ }
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

  // Detect and track lg breakpoint (matchMedia not available in test env)
  if (typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(min-width: 1024px)');
    isDesktop.value = mq.matches;
    mq.addEventListener('change', (e) => { isDesktop.value = e.matches; });

    const mqPortrait = window.matchMedia('(max-width: 767px) and (orientation: portrait)');
    isMobilePortrait.value = mqPortrait.matches;
    mqPortrait.addEventListener('change', (e) => { isMobilePortrait.value = e.matches; });
  }

  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      adminPanelOpen.value = localStorage.getItem('manlycam:admin-panel-open') === 'true';

      const stored = localStorage.getItem('manlycam:chat-sidebar-open');
      if (stored !== null) {
        chatSidebarOpen.value = stored === 'true';
      } else {
        // Default: expanded on desktop only; collapsed on tablet/landscape/portrait
        chatSidebarOpen.value = isDesktop.value;
      }
    }
  } catch { /* not available in test env */ }
});
</script>

<template>
  <div class="flex flex-col landscape:flex-row lg:flex-row h-screen w-full overflow-hidden bg-[hsl(var(--background))]">
    <!-- Left sidebar: admin only, desktop (≥ lg). Transition slides it in/out, pushing the stream. -->
    <Transition name="sidebar-left">
      <aside
        v-if="isAdmin && adminPanelOpen && isDesktop"
        data-sidebar-left
        class="w-[280px] shrink-0 flex flex-col bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--border))]"
      >
        <AdminPanel :show-close="false" @close="adminPanelOpen = false" />
      </aside>
    </Transition>

    <!-- Stream column: aspect-video on mobile, flex-1 on desktop -->
    <main class="lg:flex-1 min-w-0 flex items-center justify-center bg-black">
      <StreamPlayer
        :streamState="streamState"
        :isAdmin="isAdmin"
        :adminPanelOpen="adminPanelOpen"
        :isDesktop="isDesktop"
        :chatSidebarOpen="chatSidebarOpen"
        :unreadCount="unreadCount"
        :showChatSidebarToggle="!isMobilePortrait"
        @open-camera-controls="handleOpenCameraControls"
        @toggle-admin-panel="handleToggleAdminPanel"
        @toggle-chat-sidebar="handleToggleChatSidebar"
      />
    </main>

    <!-- Mobile portrait: persistent bottom chat (no collapse, no transition) -->
    <ChatPanel
      v-if="isMobilePortrait"
      data-chat-panel
      class="flex-1 flex flex-col bg-[hsl(var(--sidebar))]"
      @open-camera-controls="handleOpenCameraControls"
    />

    <!-- Desktop + tablet + mobile landscape: collapsible right sidebar -->
    <Transition v-else name="sidebar-right">
      <ChatPanel
        v-if="chatSidebarOpen"
        data-chat-panel
        class="lg:flex-none lg:w-[320px] flex flex-col bg-[hsl(var(--sidebar))] border-l border-[hsl(var(--border))]"
        @open-camera-controls="handleOpenCameraControls"
      />
    </Transition>

    <!-- Mobile: Sheet drawer for admin controls (< lg only) -->
    <Sheet v-if="isAdmin" v-model:open="mobileSheetOpen">
      <SheetContent side="bottom" class="h-[90vh] p-0">
        <!-- Sheet has its own X button; hide AdminPanel's close button to avoid duplication -->
        <AdminPanel :show-close="false" @close="adminPanelOpen = false" />
      </SheetContent>
    </Sheet>
  </div>
</template>

<style scoped>
/*
 * Desktop left sidebar slide — animates margin-left on the flex item.
 * The aside keeps its full 280px width so content never reflows.
 * Negative margin-left shifts the panel off-screen to the left; the parent's
 * overflow-hidden clips it. As margin-left goes 0, the right edge pushes the stream.
 */
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
</style>
