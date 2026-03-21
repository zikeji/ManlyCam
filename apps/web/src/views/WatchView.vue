<script setup lang="ts">
import { onMounted, ref, watch, computed } from 'vue';
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui';
import { useAuth } from '@/composables/useAuth';
import { useStream } from '@/composables/useStream';
import { Role } from '@manlycam/types';
import StreamPlayer from '@/components/stream/StreamPlayer.vue';
import BroadcastConsole from '@/components/stream/BroadcastConsole.vue';
import AtmosphericVoid from '@/components/stream/AtmosphericVoid.vue';
import CameraControlsPanel from '@/components/admin/CameraControlsPanel.vue';
import AdminDialog from '@/components/admin/AdminDialog.vue';
import ChatPanel from '@/components/chat/ChatPanel.vue';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import {
  messages,
  unreadCount,
  resetUnread,
  incrementUnread,
  isLoadingHistory,
} from '@/composables/useChat';

const { user } = useAuth();
const { streamState, piReachableWhileOffline, initStream } = useStream();

const isDesktop = ref(false);
const isMobilePortrait = ref(false);
const isMobileLandscape = ref(false);
const chatSidebarOpen = ref(true);

const controlsPanelOpen = ref(false);
const adminDialogOpen = ref(false);

const streamPlayerRef = ref<InstanceType<typeof StreamPlayer> | null>(null);
const streamVideoRef = computed(() => streamPlayerRef.value?.videoRef ?? null);

const chatPanelRef = ref<InstanceType<typeof SplitterPanel> | null>(null);
const splitterAnimating = ref(false);
let splitterAnimateTimer: ReturnType<typeof setTimeout> | null = null;

const mobileSheetOpen = computed({
  get: () => controlsPanelOpen.value && !isDesktop.value,
  /* c8 ignore next -- computed setter only triggered by Sheet v-model in mobile template */
  set: (val: boolean) => {
    controlsPanelOpen.value = val;
  },
});

watch(controlsPanelOpen, (newValue) => {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem('manlycam:controls-panel-open', newValue ? 'true' : 'false');
    }
  } catch {
    /* ignore */
  }
});

watch(chatSidebarOpen, (open) => {
  if (open) resetUnread();
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem('manlycam:chat-sidebar-open', open ? 'true' : 'false');
    }
  } catch {
    /* ignore */
  }
});

watch(
  () => messages.value.length,
  (newLen, oldLen) => {
    if (!chatSidebarOpen.value && !isLoadingHistory.value && newLen > (oldLen ?? 0)) {
      incrementUnread();
    }
  },
  { flush: 'sync' },
);

const isAdmin = computed(() => user.value?.role === Role.Admin);

const adminPreviewActive = ref(false);
const showPreviewButton = computed(() => isAdmin.value && piReachableWhileOffline.value);

// Reset preview when the stream is no longer explicit-offline
watch(streamState, (state) => {
  if (state !== 'explicit-offline') {
    adminPreviewActive.value = false;
  }
});

const handleOpenCameraControls = () => {
  controlsPanelOpen.value = !controlsPanelOpen.value;
};
const handleToggleControlsPanel = () => {
  controlsPanelOpen.value = !controlsPanelOpen.value;
};
const handleStartPreview = () => {
  adminPreviewActive.value = true;
};
const handleStopPreview = () => {
  adminPreviewActive.value = false;
};

const handleToggleChatSidebar = () => {
  if (isDesktop.value && chatPanelRef.value) {
    if (splitterAnimateTimer !== null) clearTimeout(splitterAnimateTimer);
    splitterAnimating.value = true;
    if (chatSidebarOpen.value) {
      chatPanelRef.value.collapse();
    } else {
      chatPanelRef.value.expand();
    }
    splitterAnimateTimer = setTimeout(() => {
      splitterAnimating.value = false;
    }, 200);
  } else {
    chatSidebarOpen.value = !chatSidebarOpen.value;
  }
};

const handleSplitterCollapse = () => {
  chatSidebarOpen.value = false;
};

const handleSplitterExpand = () => {
  chatSidebarOpen.value = true;
  resetUnread();
};

onMounted(() => {
  initStream();

  if (typeof window.matchMedia === 'function') {
    const mqDesktop = window.matchMedia('(min-width: 1024px)');
    isDesktop.value = mqDesktop.matches;
    mqDesktop.addEventListener('change', (e) => {
      /* c8 ignore next -- jsdom matchMedia change events don't propagate through Vue's script-setup proxy */
      isDesktop.value = e.matches;
    });

    // Use screen dimensions (not viewport) for orientation so the virtual keyboard
    // shrinking the viewport doesn't falsely flip portrait ↔ landscape.
    const updateOrientation = () => {
      const mobile = !mqDesktop.matches;
      const landscape = screen.width > screen.height;
      isMobilePortrait.value = mobile && !landscape;
      isMobileLandscape.value = mobile && landscape;
    };
    updateOrientation();
    screen.orientation?.addEventListener('change', updateOrientation);
    mqDesktop.addEventListener('change', updateOrientation);
  }

  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      controlsPanelOpen.value = localStorage.getItem('manlycam:controls-panel-open') === 'true';

      const stored = localStorage.getItem('manlycam:chat-sidebar-open');
      if (stored !== null) {
        chatSidebarOpen.value = stored === 'true';
      } else {
        chatSidebarOpen.value = isDesktop.value;
      }
    }
  } catch {
    /* ignore */
  }
});
</script>

<template>
  <div
    class="flex flex-col landscape:flex-row lg:flex-row h-dvh w-full overflow-hidden bg-[hsl(var(--background))]"
  >
    <!-- Left sidebar: admin only, desktop -->
    <Transition name="sidebar-left">
      <aside
        v-if="isAdmin && controlsPanelOpen && isDesktop"
        data-sidebar-left
        class="w-[280px] shrink-0 flex flex-col bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--border))] z-30"
      >
        <CameraControlsPanel
          :show-close="false"
          :preview-active="adminPreviewActive"
          @close="controlsPanelOpen = false"
        />
      </aside>
    </Transition>

    <!-- DESKTOP: Splitter layout (≥ 1024px) -->
    <SplitterGroup
      v-if="isDesktop"
      direction="horizontal"
      auto-save-id="manly-chat-sidebar"
      class="flex-1 min-w-0 flex"
    >
      <!-- Panel 1: Main column (stream + console + void) -->
      <SplitterPanel class="flex flex-col bg-black overflow-hidden relative">
        <div class="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden">
          <AtmosphericVoid class="absolute inset-0" :video-ref="streamVideoRef" />
          <StreamPlayer
            ref="streamPlayerRef"
            class="relative z-10 w-full"
            :streamState="streamState"
            :chatSidebarOpen="chatSidebarOpen"
            :unreadCount="unreadCount"
            :showLandscapeTapToggle="false"
            :showPreviewButton="showPreviewButton"
            :adminPreview="adminPreviewActive"
            @toggle-chat-sidebar="handleToggleChatSidebar"
            @start-preview="handleStartPreview"
            @stop-preview="handleStopPreview"
          />
        </div>
        <BroadcastConsole
          :isAdmin="isAdmin"
          :streamState="streamState"
          :controlsPanelOpen="controlsPanelOpen"
          :chatSidebarOpen="chatSidebarOpen"
          :unreadCount="unreadCount"
          :isDesktop="isDesktop"
          :showChatToggle="true"
          :videoRef="streamVideoRef"
          @toggle-controls-panel="handleToggleControlsPanel"
          @toggle-chat-sidebar="handleToggleChatSidebar"
          @open-admin-dialog="adminDialogOpen = true"
        />
      </SplitterPanel>

      <!-- Resize handle -->
      <SplitterResizeHandle
        class="w-px bg-[hsl(var(--border))] hover:bg-[hsl(var(--primary)/0.5)] cursor-col-resize transition-colors"
      />

      <!-- Panel 2: Chat sidebar -->
      <SplitterPanel
        ref="chatPanelRef"
        size-unit="px"
        :default-size="320"
        :min-size="240"
        :max-size="600"
        collapsible
        :collapsed-size="0"
        @collapse="handleSplitterCollapse"
        @expand="handleSplitterExpand"
        class="shrink-0 flex flex-col bg-[hsl(var(--sidebar))] border-l border-[hsl(var(--border))]"
        :class="{ 'splitter-animating': splitterAnimating }"
      >
        <ChatPanel
          data-chat-panel
          class="flex-1 flex flex-col min-h-0"
          @open-camera-controls="handleOpenCameraControls"
          @open-admin-dialog="adminDialogOpen = true"
        />
      </SplitterPanel>
    </SplitterGroup>

    <!-- NON-DESKTOP: Existing main column (< 1024px) -->
    <main v-if="!isDesktop" class="flex-1 min-w-0 flex flex-col bg-black overflow-hidden relative">
      <!-- Non-portrait content area: Void + Stream Centered -->
      <div
        v-if="!isMobilePortrait"
        class="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden"
      >
        <AtmosphericVoid class="absolute inset-0" :video-ref="streamVideoRef" />
        <StreamPlayer
          ref="streamPlayerRef"
          class="relative z-10 w-full"
          :streamState="streamState"
          :chatSidebarOpen="chatSidebarOpen"
          :unreadCount="unreadCount"
          :showLandscapeTapToggle="isMobileLandscape && !chatSidebarOpen"
          :showPreviewButton="showPreviewButton"
          :adminPreview="adminPreviewActive"
          @toggle-chat-sidebar="handleToggleChatSidebar"
          @start-preview="handleStartPreview"
          @stop-preview="handleStopPreview"
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
          :showPreviewButton="showPreviewButton"
          :adminPreview="adminPreviewActive"
          @toggle-chat-sidebar="handleToggleChatSidebar"
          @start-preview="handleStartPreview"
          @stop-preview="handleStopPreview"
        />
      </div>

      <!-- Broadcast Console (Non-landscape) -->
      <BroadcastConsole
        v-if="!isMobileLandscape"
        :isAdmin="isAdmin"
        :streamState="streamState"
        :controlsPanelOpen="controlsPanelOpen"
        :chatSidebarOpen="chatSidebarOpen"
        :unreadCount="unreadCount"
        :isDesktop="isDesktop"
        :showChatToggle="!isMobilePortrait"
        :videoRef="streamVideoRef"
        @toggle-controls-panel="handleToggleControlsPanel"
        @toggle-chat-sidebar="handleToggleChatSidebar"
        @open-admin-dialog="adminDialogOpen = true"
      />

      <!-- Portrait Chat (Replaces Void) -->
      <ChatPanel
        v-if="isMobilePortrait"
        data-chat-panel
        class="flex-1 min-h-0 flex flex-col bg-[hsl(var(--sidebar))]"
        @open-camera-controls="handleOpenCameraControls"
        @open-admin-dialog="adminDialogOpen = true"
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
          @open-admin-dialog="adminDialogOpen = true"
        />
        <BroadcastConsole
          :isAdmin="isAdmin"
          :streamState="streamState"
          :controlsPanelOpen="controlsPanelOpen"
          :chatSidebarOpen="chatSidebarOpen"
          :unreadCount="unreadCount"
          :isDesktop="false"
          :showViewerCount="false"
          :videoRef="streamVideoRef"
          @toggle-controls-panel="handleToggleControlsPanel"
          @toggle-chat-sidebar="handleToggleChatSidebar"
          @open-admin-dialog="adminDialogOpen = true"
        />
      </div>
    </Transition>

    <!-- Mobile: Sheet drawer for admin controls (< lg only) -->
    <Sheet v-if="isAdmin" v-model:open="mobileSheetOpen">
      <SheetContent side="bottom" class="h-[90vh] p-0">
        <CameraControlsPanel
          :show-close="false"
          :preview-active="adminPreviewActive"
          @close="controlsPanelOpen = false"
        />
      </SheetContent>
    </Sheet>

    <AdminDialog v-if="isAdmin" v-model:open="adminDialogOpen" />
  </div>
</template>

<style scoped>
.splitter-animating {
  transition: flex-grow 200ms ease-in-out;
}

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
