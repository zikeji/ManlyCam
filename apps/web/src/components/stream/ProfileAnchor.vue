<script setup lang="ts">
import { computed, withDefaults } from 'vue';
import { useAuth } from '@/composables/useAuth';
import { useStream } from '@/composables/useStream';
import { useAdminStream } from '@/composables/useAdminStream';
import { Role } from '@manlycam/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

withDefaults(defineProps<{
  isDesktop?: boolean;
}>(), { isDesktop: false });

const isOpen = defineModel<boolean>('popoverOpen', { default: false });
const emit = defineEmits<{ openCameraControls: [] }>();

const { user, logout } = useAuth();
const { streamState } = useStream();
const { startStream, stopStream, isLoading, error } = useAdminStream();

const isAdmin = computed(() => user.value?.role === Role.Admin);

const toggleLabel = computed(() =>
  streamState.value === 'explicit-offline' ? 'Start Stream' : 'Stop Stream',
);

const avatarFallback = computed(() => {
  const name = user.value?.displayName ?? '';
  return name.slice(0, 2).toUpperCase();
});

const handleToggle = async () => {
  if (streamState.value === 'explicit-offline') {
    await startStream();
  } else {
    await stopStream();
  }
  if (!error.value) {
    isOpen.value = false;
  }
};

const handleLogout = async () => {
  isOpen.value = false;
  await logout();
};

</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <Button
        variant="ghost"
        class="rounded-full p-0 w-9 h-9"
        aria-label="Account menu"
        aria-haspopup="true"
        :aria-expanded="isOpen"
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

    <PopoverContent class="w-52 p-1" side="top" align="start">
      <!-- Username header -->
      <div class="px-2 py-1.5 text-sm font-medium text-foreground select-none">
        {{ user?.displayName }}
      </div>

      <div class="h-px bg-border my-1" />

      <!-- Admin-only controls -->
      <template v-if="isAdmin">
        <button
          class="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="isLoading"
          @click="handleToggle"
        >
          <span v-if="isLoading" class="opacity-60">{{ toggleLabel }}…</span>
          <span v-else>{{ toggleLabel }}</span>
        </button>

        <!-- Camera Controls button: mobile only (hidden on desktop where toggle button is used) -->
        <button
          v-if="!isDesktop"
          class="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent hover:text-accent-foreground"
          @click="() => { isOpen = false; emit('openCameraControls'); }"
        >
          Camera Controls
        </button>

        <div class="h-px bg-border my-1" />
      </template>

      <!-- Log out -->
      <button
        class="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent hover:text-accent-foreground"
        @click="handleLogout"
      >
        Log out
      </button>

      <!-- Error indicator -->
      <p v-if="error" class="px-2 py-1 text-xs text-destructive">{{ error }}</p>
    </PopoverContent>
  </Popover>
</template>
