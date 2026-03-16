<script setup lang="ts">
import { ref } from 'vue';
import type { Reaction, Role } from '@manlycam/types';
import { ROLE_RANK } from '@manlycam/types';
import { EMOJI_MAP, getEmojiUrl } from '@/lib/emoji-data';

const props = defineProps<{
  reactions: Reaction[];
  currentUserId: string;
  currentUserRole?: Role;
  canModerate?: boolean;
  isMuted?: boolean;
}>();

const emit = defineEmits<{
  toggle: [emoji: string];
  modRemove: [emoji: string, userId: string];
}>();

// Detail popover state
const showDetail = ref(false);
const detailX = ref(0);
const detailY = ref(0);
let longPressTimer: ReturnType<typeof setTimeout> | null = null;

function getReactionEmojiUrl(shortcode: string): string {
  const emoji = EMOJI_MAP.get(shortcode);
  if (!emoji) return '';
  return getEmojiUrl(emoji.codepoint);
}

function getEmojiName(shortcode: string): string {
  return shortcode.replace(/_/g, ' ');
}

function isUserReacted(reaction: Reaction): boolean {
  return reaction.userIds.includes(props.currentUserId);
}

function handleClick(reaction: Reaction) {
  if (props.isMuted) return;
  emit('toggle', reaction.emoji);
}

function handleOutsidePointer() {
  showDetail.value = false;
  document.removeEventListener('pointerdown', handleOutsidePointer);
}

function closeDetail() {
  showDetail.value = false;
  document.removeEventListener('pointerdown', handleOutsidePointer);
}

function openDetail(clientX: number, clientY: number) {
  detailX.value = Math.min(clientX, window.innerWidth - 220);
  detailY.value = Math.min(clientY, window.innerHeight - 150);
  showDetail.value = true;
  requestAnimationFrame(() => {
    document.addEventListener('pointerdown', handleOutsidePointer);
  });
}

function handleContextMenu(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  openDetail(e.clientX, e.clientY);
}

// Long-press for mobile detail popover
function handleAreaTouchStart(e: TouchEvent) {
  e.stopPropagation();
  const touch = e.touches[0];
  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    openDetail(touch.clientX, touch.clientY);
  }, 500);
}

function handleAreaTouchEnd(e: TouchEvent) {
  e.stopPropagation();
  if (longPressTimer !== null) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function showModButton(reaction: Reaction, idx: number, uid: string): boolean {
  if (!props.canModerate) return false;
  if (uid === props.currentUserId) return false;
  const reactorRole = reaction.userRoles?.[idx];
  if (!props.currentUserRole || !reactorRole) return false; // fail closed if role data missing
  return (ROLE_RANK[props.currentUserRole] ?? 0) > (ROLE_RANK[reactorRole] ?? 0);
}

function handleModRemoveClick(emoji: string, userId: string) {
  emit('modRemove', emoji, userId);
}
</script>

<template>
  <div
    v-if="reactions.length > 0"
    class="flex flex-wrap gap-1 mt-1"
    role="group"
    aria-label="Message reactions"
    @contextmenu.prevent.stop="handleContextMenu"
    @pointerdown.stop
    @touchstart.stop="handleAreaTouchStart"
    @touchend.stop="handleAreaTouchEnd"
  >
    <button
      v-for="reaction in reactions"
      :key="reaction.emoji"
      :disabled="isMuted"
      :class="[
        'flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-xs transition-colors',
        isUserReacted(reaction)
          ? 'bg-primary/20 border-primary/50 text-primary'
          : 'bg-background border-border hover:bg-accent',
        isMuted ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer',
      ]"
      :aria-label="`${reaction.emoji} reaction, ${reaction.count} ${reaction.count === 1 ? 'person' : 'people'}`"
      @click="handleClick(reaction)"
    >
      <img
        v-if="getReactionEmojiUrl(reaction.emoji)"
        :src="getReactionEmojiUrl(reaction.emoji)"
        :alt="reaction.emoji"
        class="w-3.5 h-3.5"
      />
      <span v-else class="text-xs">{{ reaction.emoji }}</span>
      <span class="font-medium leading-none">{{ reaction.count }}</span>
    </button>
  </div>

  <!-- Detail popover via Teleport -->
  <Teleport to="body">
    <div
      v-if="showDetail"
      class="fixed z-50 min-w-[200px] max-w-[260px] rounded-lg border bg-popover text-popover-foreground shadow-md p-3"
      :style="{ left: detailX + 'px', top: detailY + 'px' }"
      data-reaction-detail-panel
      @pointerdown.stop
    >
      <p class="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
        Reactions
      </p>
      <div class="space-y-2">
        <div v-for="reaction in reactions" :key="reaction.emoji" class="space-y-1">
          <div class="flex items-center gap-1.5">
            <img
              v-if="getReactionEmojiUrl(reaction.emoji)"
              :src="getReactionEmojiUrl(reaction.emoji)"
              :alt="reaction.emoji"
              class="w-4 h-4"
            />
            <span v-else class="text-sm">{{ reaction.emoji }}</span>
            <span class="text-xs font-medium">{{ getEmojiName(reaction.emoji) }}</span>
          </div>
          <div class="pl-5 space-y-0.5">
            <div
              v-for="(uid, idx) in reaction.userIds"
              :key="uid"
              class="flex items-center justify-between gap-2"
            >
              <span class="text-xs text-muted-foreground truncate">
                {{ reaction.userDisplayNames?.[idx] ?? uid }}
              </span>
              <button
                v-if="showModButton(reaction, idx, uid)"
                class="text-muted-foreground hover:text-destructive text-xs shrink-0"
                :aria-label="`Remove reaction from ${reaction.userDisplayNames?.[idx] ?? uid}`"
                @click="handleModRemoveClick(reaction.emoji, uid)"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
