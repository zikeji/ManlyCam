<script setup lang="ts">
import { computed } from 'vue';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { MicOff } from 'lucide-vue-next';
import type { UserPresence, Role } from '@manlycam/types';

const props = defineProps<{
  viewers: UserPresence[];
  currentUserId?: string;
  currentUserRole?: Role;
}>();

const ROLE_RANK: Record<string, number> = {
  Admin: 3,
  Moderator: 2,
  ViewerCompany: 1,
  ViewerGuest: 0,
};

const isPrivilegedUser = computed(
  () => props.currentUserRole === 'Admin' || props.currentUserRole === 'Moderator',
);

function canMuteViewer(viewerRole: string): boolean {
  if (!props.currentUserRole || !isPrivilegedUser.value) return false;
  return (ROLE_RANK[props.currentUserRole] ?? 0) > (ROLE_RANK[viewerRole] ?? 0);
}

const emit = defineEmits<{
  muteUser: [userId: string];
  unmuteUser: [userId: string];
}>();

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
</script>

<template>
  <div class="p-3">
    <p
      v-if="viewers.length === 0"
      class="text-sm text-muted-foreground text-center mt-4"
    >
      Just you for now 👀
    </p>
    <ul v-else class="space-y-2">
      <li
        v-for="viewer in viewers"
        :key="viewer.id"
        class="flex items-center gap-2"
      >
        <ContextMenu v-if="canMuteViewer(viewer.role) && viewer.id !== props.currentUserId">
          <ContextMenuTrigger as-child>
            <div class="flex items-center gap-2 min-w-0 flex-1 cursor-context-menu">
              <Avatar class="h-8 w-8 shrink-0 rounded-full">
                <AvatarImage :src="viewer.avatarUrl ?? ''" :alt="viewer.displayName" />
                <AvatarFallback class="text-xs">{{ initials(viewer.displayName) }}</AvatarFallback>
              </Avatar>
              <span class="text-sm truncate">{{ viewer.displayName }}</span>
              <MicOff
                v-if="viewer.isMuted && isPrivilegedUser"
                class="h-3 w-3 shrink-0 text-muted-foreground"
                aria-label="Muted"
              />
              <span
                v-if="viewer.userTag"
                class="text-xs px-1.5 py-0.5 rounded font-medium shrink-0"
                :style="{ color: viewer.userTag.color, borderColor: viewer.userTag.color, borderWidth: '1px', borderStyle: 'solid' }"
              >{{ viewer.userTag.text }}</span>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem
              v-if="!viewer.isMuted"
              @click="emit('muteUser', viewer.id)"
            >
              Mute
            </ContextMenuItem>
            <ContextMenuItem
              v-else
              @click="emit('unmuteUser', viewer.id)"
            >
              Unmute
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        <div v-else class="flex items-center gap-2 min-w-0 flex-1">
          <Avatar class="h-8 w-8 shrink-0 rounded-full">
            <AvatarImage :src="viewer.avatarUrl ?? ''" :alt="viewer.displayName" />
            <AvatarFallback class="text-xs">{{ initials(viewer.displayName) }}</AvatarFallback>
          </Avatar>
          <span class="text-sm truncate">{{ viewer.displayName }}</span>
          <MicOff
            v-if="viewer.isMuted && isPrivilegedUser"
            class="h-3 w-3 shrink-0 text-muted-foreground"
            aria-label="Muted"
          />
          <span
            v-if="viewer.userTag"
            class="text-xs px-1.5 py-0.5 rounded font-medium shrink-0"
            :style="{ color: viewer.userTag.color, borderColor: viewer.userTag.color, borderWidth: '1px', borderStyle: 'solid' }"
          >{{ viewer.userTag.text }}</span>
        </div>
      </li>
    </ul>
  </div>
</template>
