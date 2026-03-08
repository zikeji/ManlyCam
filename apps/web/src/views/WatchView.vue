<script setup lang="ts">
import { onMounted, ref, watch, computed } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { useStream } from '@/composables/useStream';
import { Role } from '@manlycam/types';
import StreamPlayer from '@/components/stream/StreamPlayer.vue';
import AdminPanel from '@/components/admin/AdminPanel.vue';
import { Sheet, SheetContent } from '@/components/ui/sheet';

const { user } = useAuth();
const { streamState, initStream } = useStream();

// Admin panel state
const adminPanelOpen = ref(false);

// Persist to localStorage on change
watch(adminPanelOpen, (newValue) => {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem('manlycam:admin-panel-open', newValue ? 'true' : 'false');
    }
  } catch {
    // localStorage might not be available in test environment
  }
});

const isAdmin = computed(() => user.value?.role === Role.Admin);

const handleOpenCameraControls = () => {
  adminPanelOpen.value = true;
};

onMounted(() => {
  initStream();
  // Initialize admin panel state from localStorage
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      adminPanelOpen.value = localStorage.getItem('manlycam:admin-panel-open') === 'true';
    }
  } catch {
    // localStorage might not be available in test environment
  }
});
</script>

<template>
  <div class="flex h-screen w-full overflow-hidden bg-[hsl(var(--background))]">
    <!-- Left sidebar: admin only, desktop (lg+) -->
    <aside
      v-if="isAdmin"
      v-show="adminPanelOpen"
      data-sidebar-left
      class="w-[280px] shrink-0 hidden lg:flex flex-col bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--border))]"
    >
      <AdminPanel @close="adminPanelOpen = false" />
    </aside>

    <!-- Stream column: fills remaining space -->
    <main class="flex-1 min-w-0 flex items-center justify-center bg-black">
      <StreamPlayer
        :streamState="streamState"
        @open-camera-controls="handleOpenCameraControls"
      />
    </main>

    <!-- Right sidebar: placeholder for Story 4.x chat panel -->
    <aside
      data-sidebar-right
      class="w-[320px] shrink-0 hidden lg:flex flex-col bg-[hsl(var(--sidebar))] border-l border-[hsl(var(--border))]"
    >
      <!-- Story 4.x: ChatPanel here -->
    </aside>

    <!-- Mobile: Sheet drawer for admin controls (< lg) -->
    <Sheet v-if="isAdmin" v-model:open="adminPanelOpen">
      <SheetContent side="bottom" class="h-[90vh]">
        <AdminPanel @close="adminPanelOpen = false" />
      </SheetContent>
    </Sheet>
  </div>
</template>
