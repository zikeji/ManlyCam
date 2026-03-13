<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, withDefaults } from 'vue';
import { Settings2, Video, VideoOff, Camera, ArrowLeftFromLine, ArrowRightFromLine } from 'lucide-vue-next';
import type { ClientStreamState } from '@/composables/useStream';
import { useAuth } from '@/composables/useAuth';
import { useAdminStream } from '@/composables/useAdminStream';
import { useSnapshot } from '@/composables/useSnapshot';
import { piSugarStatus } from '@/composables/usePiSugar';
// import { Role } from '@manlycam/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import StreamStatusBadge from './StreamStatusBadge.vue';
import BatteryIndicator from './BatteryIndicator.vue';
import { viewers } from '@/composables/usePresence';

const props = withDefaults(defineProps<{
  streamState: ClientStreamState;
  isAdmin?: boolean;
  adminPanelOpen?: boolean;
  chatSidebarOpen?: boolean;
  unreadCount?: number;
  isDesktop?: boolean;
  showChatToggle?: boolean;
  showViewerCount?: boolean;
  videoRef?: HTMLVideoElement | null;
}>(), {
  isAdmin: false,
  adminPanelOpen: false,
  chatSidebarOpen: false,
  unreadCount: 0,
  isDesktop: true,
  showChatToggle: true,
  showViewerCount: true,
  videoRef: null,
});

const emit = defineEmits<{
  toggleAdminPanel: [];
  toggleChatSidebar: [];
  openUserManager: [];
}>();

const { user, logout } = useAuth();
const { startStream, stopStream, isLoading, error } = useAdminStream();
const { takeSnapshot } = useSnapshot();

const handleSnapshot = () => {
  if (props.videoRef) {
    takeSnapshot(props.videoRef);
  }
};

const snapshotTooltip = computed(() => {
  return props.streamState === 'live' ? 'Take Snapshot' : 'Stream not live';
});

const isSnapshotDisabled = computed(() => {
  return props.streamState !== 'live';
});

const isPulsing = ref(false);
let pulseTimer: number | null = null;
const isProfileOpen = ref(false);

onBeforeUnmount(() => {
  if (pulseTimer !== null) {
    clearTimeout(pulseTimer);
    pulseTimer = null;
  }
});

watch(() => props.unreadCount, (newVal, oldVal) => {
  if (newVal > (oldVal ?? 0)) {
    isPulsing.value = true;
    pulseTimer = window.setTimeout(() => {
      isPulsing.value = false;
      pulseTimer = null;
    }, 400);
  }
});

const handleStreamToggle = async () => {
  if (props.streamState === 'explicit-offline') {
    await startStream();
  } else {
    await stopStream();
  }
};

const handleLogout = async () => {
  isProfileOpen.value = false;
  await logout();
};

const avatarFallback = computed(() => {
  const name = user.value?.displayName ?? '';
  return name.slice(0, 2).toUpperCase();
});

const viewerText = computed(() => {
  const count = viewers.value.length;
  return count === 1 ? '1 viewer' : `${count} viewers`;
});

const chatToggleAriaLabel = computed(() => {
  if (!props.chatSidebarOpen && props.unreadCount > 0) {
    return `Expand chat sidebar (${props.unreadCount} unread)`;
  }
  return props.chatSidebarOpen ? 'Collapse chat sidebar' : 'Expand chat sidebar';
});

const streamToggleLabel = computed(() => {
  return props.streamState === 'explicit-offline' ? 'Start Stream' : 'Stop Stream';
});

</script>

<template>
  <div class="h-14 bg-[hsl(var(--background))] border-t border-[hsl(var(--border))] flex items-center justify-between px-3 shrink-0 w-full z-20">
    <!-- Left Flank -->
    <div class="flex items-center gap-1 flex-1 justify-start">
      <!-- Mobile landscape: chat collapse visible to all users -->
      <div v-if="!isDesktop && showChatToggle" class="relative">
        <Button
          variant="ghost"
          size="icon"
          class="w-11 h-11 rounded"
          :aria-label="chatToggleAriaLabel"
          @click="emit('toggleChatSidebar')"
        >
          <ArrowRightFromLine v-if="chatSidebarOpen" class="w-5 h-5" />
          <ArrowLeftFromLine v-else class="w-5 h-5" />
        </Button>
        <Badge
          v-if="!chatSidebarOpen && unreadCount > 0"
          :class="['absolute top-0 right-0 h-4 min-w-4 px-1 text-[10px] border-2 border-[hsl(var(--background))] pointer-events-none transform translate-x-1/4 -translate-y-1/4', isPulsing && 'badge-pulse']"
          aria-hidden="true"
        >
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </Badge>
      </div>

      <!-- Desktop: admin icon controls -->
      <template v-if="isAdmin && isDesktop">
        <Button
          variant="ghost"
          size="icon"
          class="w-11 h-11 rounded"
          :aria-label="adminPanelOpen ? 'Hide camera controls' : 'Show camera controls'"
          @click="emit('toggleAdminPanel')"
        >
          <Settings2 class="w-5 h-5" />
        </Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="w-11 h-11 rounded"
                :aria-label="streamToggleLabel"
                :disabled="isLoading"
                @click="handleStreamToggle"
              >
                <template v-if="streamState === 'explicit-offline'">
                  <VideoOff v-if="!isLoading" class="w-5 h-5" />
                  <div v-else class="w-5 h-5 border-2 border-t-transparent border-foreground rounded-full animate-spin"></div>
                </template>
                <template v-else>
                  <Video v-if="!isLoading" class="w-5 h-5" />
                  <div v-else class="w-5 h-5 border-2 border-t-transparent border-foreground rounded-full animate-spin"></div>
                </template>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{{ streamToggleLabel }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </template>

      <!-- Battery indicator (admin only, both orientations) -->
      <BatteryIndicator
        v-if="isAdmin && piSugarStatus !== null"
        :status="piSugarStatus"
      />
    </div>

    <!-- Center Flank -->
    <div class="flex items-center gap-2 flex-1 justify-center text-sm font-medium">
      <StreamStatusBadge :state="streamState" :compact="!isDesktop" />
      <span v-if="showViewerCount" class="text-muted-foreground whitespace-nowrap hidden sm:inline">{{ viewerText }}</span>
    </div>

    <!-- Right Flank -->
    <div class="flex items-center gap-1 flex-1 justify-end">
      <!-- 7-3: snapshot -->
      <Button
        variant="ghost"
        size="icon"
        class="w-11 h-11 rounded"
        :disabled="isSnapshotDisabled"
        :title="snapshotTooltip"
        @click="handleSnapshot"
      >
        <Camera class="w-5 h-5" />
      </Button>

      <Popover v-model:open="isProfileOpen">
        <PopoverTrigger as-child>
          <Button
            variant="ghost"
            class="rounded-full p-0 w-11 h-11 flex items-center justify-center"
            aria-label="Account menu"
            aria-haspopup="true"
            :aria-expanded="isProfileOpen"
          >
            <Avatar class="w-8 h-8">
              <AvatarImage
                v-if="user?.avatarUrl"
                :src="user.avatarUrl"
                referrer-policy="no-referrer"
              />
              <AvatarFallback>{{ avatarFallback }}</AvatarFallback>
            </Avatar>
          </Button>
        </PopoverTrigger>

        <PopoverContent class="w-52 p-1" side="top" align="end">
          <div class="px-2 py-1.5 text-sm font-medium text-foreground select-none">
            {{ user?.displayName }}
          </div>
          <div class="h-px bg-border my-1" />

          <template v-if="isAdmin">
            <button
              v-if="!isDesktop"
              class="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent hover:text-accent-foreground"
              @click="() => { isProfileOpen = false; emit('toggleAdminPanel'); }"
            >
              Camera Controls
            </button>
            <button
              v-if="!isDesktop"
              class="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent hover:text-accent-foreground"
              :disabled="isLoading"
              @click="() => { isProfileOpen = false; void handleStreamToggle(); }"
            >
              {{ streamToggleLabel }}
            </button>
            <button
              class="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent hover:text-accent-foreground"
              @click="() => { isProfileOpen = false; emit('openUserManager'); }"
            >
              Users
            </button>
            <div class="h-px bg-border my-1" />
          </template>

          <button
            class="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
            @click="handleLogout"
          >
            Log out
          </button>
          
          <p v-if="error" class="px-2 py-1 text-xs text-destructive">{{ error }}</p>
        </PopoverContent>
      </Popover>

      <div v-if="isDesktop && showChatToggle" class="relative">
        <Button
          variant="ghost"
          size="icon"
          class="w-11 h-11 rounded"
          :aria-label="chatToggleAriaLabel"
          @click="emit('toggleChatSidebar')"
        >
          <ArrowRightFromLine v-if="chatSidebarOpen" class="w-5 h-5" />
          <ArrowLeftFromLine v-else class="w-5 h-5" />
        </Button>
        <Badge
          v-if="!chatSidebarOpen && unreadCount > 0"
          :class="['absolute top-0 right-0 h-4 min-w-4 px-1 text-[10px] border-2 border-[hsl(var(--background))] pointer-events-none transform translate-x-1/4 -translate-y-1/4', isPulsing && 'badge-pulse']"
          aria-hidden="true"
        >
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </Badge>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes badge-pulse {
  0%   { transform: scale(1) translate(25%, -25%); }
  50%  { transform: scale(1.25) translate(25%, -25%); }
  100% { transform: scale(1) translate(25%, -25%); }
}

.badge-pulse {
  animation: badge-pulse 400ms ease-in-out;
}
</style>
