<script setup lang="ts">
import { computed, ref, watch, nextTick, onUnmounted } from 'vue';
import type { ChatMessage, ClipChatMessage, Role, UserPresence } from '@manlycam/types';
import { ROLE_RANK, SYSTEM_USER_ID } from '@manlycam/types';
import { MicOff } from 'lucide-vue-next';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { renderMarkdown } from '@/lib/markdown';
import { highlightMentions } from '@/lib/highlightMentions';
import { lookupUser } from '@/composables/useUserCache';
import { formatTime, initials } from '@/lib/dateFormat';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import ReactionBar from './ReactionBar.vue';
import ReactionDisplay from './ReactionDisplay.vue';
import ClipCard from './ClipCard.vue';
import { useReactions } from '@/composables/useReactions';

const props = defineProps<{
  message: ChatMessage;
  isContinuation?: boolean;
  isOwn?: boolean;
  canModerateDelete?: boolean;
  isAuthorMuted?: boolean;
  isCurrentUserMuted?: boolean;
  currentUserRole?: Role;
  currentUserId?: string;
  viewers?: UserPresence[];
  isEphemeral?: boolean;
}>();

const emit = defineEmits<{
  requestEdit: [messageId: string, newContent: string];
  requestDelete: [messageId: string];
  muteUser: [userId: string];
  unmuteUser: [userId: string];
  banUser: [userId: string];
  dismiss: [messageId: string];
}>();

const timeLabel = computed(() => formatTime(props.message.createdAt));
const avatarInitials = computed(() => initials(props.message.displayName));
const isClipMessage = computed(() => props.message.messageType === 'clip');

const renderedContent = computed(() => {
  const html = renderMarkdown(props.message.content);
  // Build a map from the prop viewers (online / freshly-passed) for fast lookup,
  // then fall back to the persistent user cache for anyone who has since gone offline.
  const viewerMap = new Map((props.viewers ?? []).map((v) => [v.id, v]));
  return highlightMentions(
    html,
    props.currentUserId ?? '',
    (id) => viewerMap.get(id) ?? lookupUser(id),
  );
});
const editedLabel = computed(() =>
  props.message.updatedAt ? formatTime(props.message.updatedAt) : null,
);

const isSystemMessage = computed(() => props.message.userId === SYSTEM_USER_ID);

const isPrivilegedUser = computed(
  () => props.currentUserRole === 'Admin' || props.currentUserRole === 'Moderator',
);

// canModerate controls mute/ban — never applicable to the system user
const canModerate = computed(() => {
  if (isSystemMessage.value) return false;
  if (!props.currentUserRole || !isPrivilegedUser.value) return false;
  return (ROLE_RANK[props.currentUserRole] ?? 0) > (ROLE_RANK[props.message.authorRole] ?? 0);
});

const isEditing = ref(false);
const editContent = ref('');
const editTextareaRef = ref<HTMLTextAreaElement | null>(null);
const editActionsRef = ref<HTMLElement | null>(null);
const rootRef = ref<HTMLElement | null>(null);
const canSave = computed(() => editContent.value.trim().length > 0);
const showDeleteDialog = ref(false);
const showBanDialog = ref(false);

// Reaction bar (hover = desktop, long-press = mobile)
const showReactionBar = ref(false);
const reactionBarJustOpened = ref(false);
let barOpenedByLongPress = false;
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let barTouchDismissCleanup: (() => void) | null = null;
let isMounted = true;

const { addReaction, removeReaction, modRemoveReaction } = useReactions();

function clearBarTouchDismiss() {
  if (barTouchDismissCleanup) {
    barTouchDismissCleanup();
    barTouchDismissCleanup = null;
  }
}

function setupBarTouchDismiss() {
  clearBarTouchDismiss();
  const handler = () => {
    showReactionBar.value = false;
    clearBarTouchDismiss();
  };
  requestAnimationFrame(() => {
    if (!isMounted) return;
    document.addEventListener('touchstart', handler);
    barTouchDismissCleanup = () => document.removeEventListener('touchstart', handler);
  });
}

function handleMouseEnter() {
  if (props.isEphemeral) return;
  barOpenedByLongPress = false;
  showReactionBar.value = true;
}

function handleMouseLeave() {
  showReactionBar.value = false;
  clearBarTouchDismiss();
}

function handleTouchStart() {
  if (props.isEphemeral) return;
  if (showReactionBar.value) {
    showReactionBar.value = false;
    clearBarTouchDismiss();
    return; // dismiss bar on tap, don't start new long-press
  }
  longPressTimer = setTimeout(() => {
    barOpenedByLongPress = true;
    showReactionBar.value = true;
    reactionBarJustOpened.value = true;
    setTimeout(() => {
      reactionBarJustOpened.value = false;
    }, 200);
    longPressTimer = null;
    setupBarTouchDismiss();
  }, 500);
}

function handleTouchEnd() {
  if (longPressTimer !== null) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

onUnmounted(() => {
  isMounted = false;
  if (longPressTimer !== null) {
    clearTimeout(longPressTimer);
  }
  clearBarTouchDismiss();
});

async function handleReactionSelect(emoji: string) {
  if (barOpenedByLongPress) {
    showReactionBar.value = false;
    clearBarTouchDismiss();
  }
  if (!props.currentUserId) return;
  const reaction = props.message.reactions?.find((r) => r.emoji === emoji);
  try {
    if (reaction?.userIds.includes(props.currentUserId)) {
      await removeReaction(props.message.id, emoji);
    } else {
      await addReaction(props.message.id, emoji);
    }
  } catch {
    // Silently ignore — server will reject if muted etc.
  }
}

async function handleReactionToggle(emoji: string) {
  await handleReactionSelect(emoji);
}

async function handleModRemove(emoji: string, userId: string) {
  try {
    await modRemoveReaction(props.message.id, emoji, userId);
  } catch {
    // Silently ignore
  }
}

function resizeEditTextarea() {
  const el = editTextareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  const panel = el.closest('[data-chat-panel]') as HTMLElement | null;
  const maxH = panel ? Math.floor(panel.clientHeight / 2) : 300;
  const capped = Math.min(el.scrollHeight, maxH);
  el.style.height = capped + 'px';
  el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
}

watch(editContent, () => nextTick(resizeEditTextarea));

function startEdit() {
  isEditing.value = true;
  editContent.value = props.message.content;
  nextTick(() => {
    editTextareaRef.value?.focus();
    resizeEditTextarea();
    requestAnimationFrame(() => {
      editActionsRef.value?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    });
  });
}

function cancelEdit() {
  isEditing.value = false;
  editContent.value = '';
}

function submitEdit() {
  const trimmed = editContent.value.trim();
  if (!trimmed) return;
  emit('requestEdit', props.message.id, trimmed);
  isEditing.value = false;
  editContent.value = '';
}

function handleEditKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitEdit();
  }
  if (e.key === 'Escape') {
    cancelEdit();
  }
}

defineExpose({ startEdit });

function confirmDelete(e?: MouseEvent) {
  if (e?.shiftKey) {
    emit('requestDelete', props.message.id);
    return;
  }
  showDeleteDialog.value = true;
}

function executeDelete() {
  showDeleteDialog.value = false;
  emit('requestDelete', props.message.id);
}

function executeBan() {
  showBanDialog.value = false;
  emit('banUser', props.message.userId);
}
</script>

<template>
  <!-- Continuation row: only message body, indented to align with group header text -->
  <ContextMenu
    v-if="
      isContinuation && (isEphemeral || isOwn || canModerateDelete || canModerate) && !isEditing
    "
  >
    <ContextMenuTrigger as-child>
      <div
        ref="rootRef"
        role="listitem"
        class="relative group px-3 py-0.5 pl-[52px] hover:bg-white/[.03]"
        @mouseenter="handleMouseEnter"
        @mouseleave="handleMouseLeave"
        @touchstart.passive="handleTouchStart"
        @touchend.passive="handleTouchEnd"
      >
        <template v-if="!isEditing">
          <!-- Floating reaction bar -->
          <div
            v-if="showReactionBar && !isCurrentUserMuted"
            class="absolute -top-5 right-2 z-20"
            @touchstart.stop
          >
            <ReactionBar
              :disabled="isCurrentUserMuted || reactionBarJustOpened"
              @select="handleReactionSelect"
              @close="showReactionBar = false"
            />
          </div>
          <ClipCard v-if="isClipMessage" :message="message as ClipChatMessage" />
          <div
            v-else
            class="text-sm text-foreground break-words [&_a]:underline [&_a]:text-primary [&_code]:font-mono [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-1 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground [&_blockquote]:pl-3 [&_blockquote]:py-1 [&_blockquote]:my-1 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_img]:max-h-64 [&_img]:object-contain [&_img]:rounded [&_img]:my-1 [&_s]:line-through [&_del]:line-through"
            v-html="renderedContent"
          />
          <TooltipProvider v-if="message.updatedAt">
            <Tooltip>
              <TooltipTrigger as-child>
                <span class="text-xs text-muted-foreground/60 italic cursor-default">(edited)</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Edited {{ editedLabel }}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <ReactionDisplay
            v-if="message.reactions && message.reactions.length > 0"
            :reactions="message.reactions"
            :current-user-id="currentUserId ?? ''"
            :current-user-role="currentUserRole"
            :can-moderate="isPrivilegedUser"
            :is-muted="isCurrentUserMuted"
            @toggle="handleReactionToggle"
            @mod-remove="handleModRemove"
          />
        </template>
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem v-if="isEphemeral" @click="emit('dismiss', props.message.id)"
        >Dismiss</ContextMenuItem
      >
      <ContextMenuItem v-if="!isEphemeral && isOwn" @click="startEdit">Edit</ContextMenuItem>
      <ContextMenuItem
        v-if="!isEphemeral && (isOwn || canModerateDelete)"
        @click="(e: MouseEvent) => confirmDelete(e)"
        class="text-red-400 focus:text-red-400"
      >
        Delete
      </ContextMenuItem>
      <ContextMenuItem
        v-if="!isEphemeral && canModerate && !isAuthorMuted"
        @click="emit('muteUser', props.message.userId)"
      >
        Mute
      </ContextMenuItem>
      <ContextMenuItem
        v-if="!isEphemeral && canModerate && isAuthorMuted"
        @click="emit('unmuteUser', props.message.userId)"
      >
        Unmute
      </ContextMenuItem>
      <ContextMenuItem
        v-if="!isEphemeral && canModerate"
        @click="showBanDialog = true"
        class="text-red-400 focus:text-red-400"
      >
        Ban
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
  <div
    v-else-if="isContinuation"
    ref="rootRef"
    role="listitem"
    class="relative group px-3 py-0.5 pl-[52px] hover:bg-white/[.03]"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @touchstart.passive="handleTouchStart"
    @touchend.passive="handleTouchEnd"
  >
    <template v-if="!isEditing">
      <!-- Floating reaction bar -->
      <div
        v-if="showReactionBar && !isCurrentUserMuted"
        class="absolute -top-5 right-2 z-20"
        @touchstart.stop
      >
        <ReactionBar
          :disabled="isCurrentUserMuted || reactionBarJustOpened"
          @select="handleReactionSelect"
          @close="showReactionBar = false"
        />
      </div>
      <ClipCard v-if="isClipMessage" :message="message as ClipChatMessage" />
      <div
        v-else
        class="text-sm text-foreground break-words [&_a]:underline [&_a]:text-primary [&_code]:font-mono [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-1 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground [&_blockquote]:pl-3 [&_blockquote]:py-1 [&_blockquote]:my-1 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_img]:max-h-64 [&_img]:object-contain [&_img]:rounded [&_img]:my-1 [&_s]:line-through [&_del]:line-through"
        v-html="renderedContent"
      />
      <TooltipProvider v-if="message.updatedAt">
        <Tooltip>
          <TooltipTrigger as-child>
            <span class="text-xs text-muted-foreground/60 italic cursor-default">(edited)</span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Edited {{ editedLabel }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <ReactionDisplay
        v-if="message.reactions && message.reactions.length > 0"
        :reactions="message.reactions"
        :current-user-id="currentUserId ?? ''"
        :can-moderate="isPrivilegedUser"
        :is-muted="isCurrentUserMuted"
        @toggle="handleReactionToggle"
        @mod-remove="handleModRemove"
      />
    </template>
    <template v-else>
      <textarea
        ref="editTextareaRef"
        v-model="editContent"
        rows="1"
        maxlength="1000"
        class="w-full resize-none rounded border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[32px] overflow-y-hidden"
        @keydown="handleEditKeydown"
      />
      <div ref="editActionsRef" class="flex gap-2 mt-1">
        <button
          class="text-xs px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90"
          @click="submitEdit"
        >
          Save
        </button>
        <button class="text-xs px-2 py-0.5 rounded hover:bg-accent" @click="cancelEdit">
          Cancel
        </button>
      </div>
    </template>
  </div>

  <!-- Group header row: avatar + name + tag + timestamp + message body -->
  <ContextMenu v-else-if="(isEphemeral || isOwn || canModerateDelete || canModerate) && !isEditing">
    <ContextMenuTrigger as-child>
      <div
        ref="rootRef"
        role="listitem"
        class="relative group flex items-start gap-2 px-3 py-1.5 hover:bg-white/[.03]"
        @mouseenter="handleMouseEnter"
        @mouseleave="handleMouseLeave"
        @touchstart.passive="handleTouchStart"
        @touchend.passive="handleTouchEnd"
      >
        <Avatar class="h-8 w-8 shrink-0 mt-0.5">
          <AvatarImage v-if="isSystemMessage" src="/favicon.svg" :alt="message.displayName" />
          <AvatarImage
            v-else-if="message.avatarUrl"
            :src="message.avatarUrl"
            :alt="message.displayName"
            referrer-policy="no-referrer"
          />
          <AvatarFallback class="text-xs">{{ avatarInitials }}</AvatarFallback>
        </Avatar>

        <!-- Floating reaction bar -->
        <div
          v-if="showReactionBar && !isCurrentUserMuted"
          class="absolute -top-5 right-2 z-20"
          @touchstart.stop
        >
          <ReactionBar
            :disabled="isCurrentUserMuted || reactionBarJustOpened"
            @select="handleReactionSelect"
            @close="showReactionBar = false"
          />
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span
              class="text-sm font-semibold truncate"
              :class="isSystemMessage ? 'text-muted-foreground' : 'text-foreground'"
              >{{ message.displayName }}</span
            >
            <MicOff
              v-if="isAuthorMuted && canModerate"
              class="h-3 w-3 shrink-0 text-muted-foreground"
              aria-label="Muted"
            />
            <span
              v-if="message.userTag"
              class="text-xs px-1.5 py-0.5 rounded font-semibold shrink-0"
              :style="{
                backgroundColor: message.userTag.color + '66',
                color: message.userTag.color,
              }"
            >
              {{ message.userTag.text }}
            </span>
            <span class="text-xs text-muted-foreground shrink-0">{{ timeLabel }}</span>
            <TooltipProvider v-if="message.updatedAt">
              <Tooltip>
                <TooltipTrigger as-child>
                  <span class="text-xs text-muted-foreground/60 italic cursor-default shrink-0"
                    >(edited)</span
                  >
                </TooltipTrigger>
                <TooltipContent>
                  <p>Edited {{ editedLabel }}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <template v-if="!isEditing">
            <ClipCard v-if="isClipMessage" :message="message as ClipChatMessage" />
            <p
              v-else
              class="text-sm text-foreground break-words [&_a]:underline [&_a]:text-primary [&_code]:font-mono [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-1 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground [&_blockquote]:pl-3 [&_blockquote]:py-1 [&_blockquote]:my-1 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_img]:max-h-64 [&_img]:object-contain [&_img]:rounded [&_img]:my-1 [&_s]:line-through [&_del]:line-through"
              v-html="renderedContent"
            />
            <ReactionDisplay
              v-if="message.reactions && message.reactions.length > 0"
              :reactions="message.reactions"
              :current-user-id="currentUserId ?? ''"
              :can-moderate="isPrivilegedUser"
              :is-muted="isCurrentUserMuted"
              @toggle="handleReactionToggle"
              @mod-remove="handleModRemove"
            />
          </template>
          <template v-else>
            <textarea
              ref="editTextareaRef"
              v-model="editContent"
              rows="1"
              maxlength="1000"
              class="w-full resize-none rounded border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[32px] overflow-y-hidden"
              @keydown="handleEditKeydown"
            />
            <div ref="editActionsRef" class="flex gap-2 mt-1">
              <button
                :disabled="!canSave"
                class="text-xs px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                @click="submitEdit"
              >
                Save
              </button>
              <button class="text-xs px-2 py-0.5 rounded hover:bg-accent" @click="cancelEdit">
                Cancel
              </button>
            </div>
          </template>
        </div>
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem v-if="isEphemeral" @click="emit('dismiss', props.message.id)"
        >Dismiss</ContextMenuItem
      >
      <ContextMenuItem v-if="!isEphemeral && isOwn" @click="startEdit">Edit</ContextMenuItem>
      <ContextMenuItem
        v-if="!isEphemeral && (isOwn || canModerateDelete)"
        @click="(e: MouseEvent) => confirmDelete(e)"
        class="text-red-400 focus:text-red-400"
      >
        Delete
      </ContextMenuItem>
      <ContextMenuItem
        v-if="!isEphemeral && canModerate && !isAuthorMuted"
        @click="emit('muteUser', props.message.userId)"
      >
        Mute
      </ContextMenuItem>
      <ContextMenuItem
        v-if="!isEphemeral && canModerate && isAuthorMuted"
        @click="emit('unmuteUser', props.message.userId)"
      >
        Unmute
      </ContextMenuItem>
      <ContextMenuItem
        v-if="!isEphemeral && canModerate"
        @click="showBanDialog = true"
        class="text-red-400 focus:text-red-400"
      >
        Ban
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
  <div
    v-else
    ref="rootRef"
    role="listitem"
    class="relative group flex items-start gap-2 px-3 py-1.5 hover:bg-white/[.03]"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @touchstart.passive="handleTouchStart"
    @touchend.passive="handleTouchEnd"
  >
    <Avatar class="h-8 w-8 shrink-0 mt-0.5">
      <AvatarImage v-if="isSystemMessage" src="/favicon.svg" :alt="message.displayName" />
      <AvatarImage
        v-else-if="message.avatarUrl"
        :src="message.avatarUrl"
        :alt="message.displayName"
        referrer-policy="no-referrer"
      />
      <AvatarFallback class="text-xs">{{ avatarInitials }}</AvatarFallback>
    </Avatar>

    <!-- Floating reaction bar -->
    <div
      v-if="showReactionBar && !isCurrentUserMuted"
      class="absolute -top-5 right-2 z-20"
      @touchstart.stop
    >
      <ReactionBar
        :disabled="isCurrentUserMuted || reactionBarJustOpened"
        @select="handleReactionSelect"
        @close="showReactionBar = false"
      />
    </div>

    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-1.5 flex-wrap">
        <span
          class="text-sm font-semibold truncate"
          :class="isSystemMessage ? 'text-muted-foreground' : 'text-foreground'"
          >{{ message.displayName }}</span
        >
        <span
          v-if="message.userTag"
          class="text-xs px-1.5 py-0.5 rounded font-semibold shrink-0"
          :style="{ backgroundColor: message.userTag.color + '66', color: message.userTag.color }"
        >
          {{ message.userTag.text }}
        </span>
        <span class="text-xs text-muted-foreground shrink-0">{{ timeLabel }}</span>
        <TooltipProvider v-if="message.updatedAt">
          <Tooltip>
            <TooltipTrigger as-child>
              <span class="text-xs text-muted-foreground/60 italic cursor-default shrink-0"
                >(edited)</span
              >
            </TooltipTrigger>
            <TooltipContent>
              <p>Edited {{ editedLabel }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <template v-if="!isEditing">
        <ClipCard v-if="isClipMessage" :message="message as ClipChatMessage" />
        <div
          v-else
          class="text-sm text-foreground break-words [&_a]:underline [&_a]:text-primary [&_code]:font-mono [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-1 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground [&_blockquote]:pl-3 [&_blockquote]:py-1 [&_blockquote]:my-1 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_img]:max-h-64 [&_img]:object-contain [&_img]:rounded [&_img]:my-1 [&_s]:line-through [&_del]:line-through"
          v-html="renderedContent"
        />
        <ReactionDisplay
          v-if="message.reactions && message.reactions.length > 0"
          :reactions="message.reactions"
          :current-user-id="currentUserId ?? ''"
          :can-moderate="isPrivilegedUser"
          :is-muted="isCurrentUserMuted"
          @toggle="handleReactionToggle"
          @mod-remove="handleModRemove"
        />
      </template>
      <template v-else>
        <textarea
          ref="editTextareaRef"
          v-model="editContent"
          rows="1"
          maxlength="1000"
          class="w-full resize-none rounded border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[32px] overflow-y-hidden"
          @keydown="handleEditKeydown"
        />
        <div ref="editActionsRef" class="flex gap-2 mt-1">
          <button
            :disabled="!canSave"
            class="text-xs px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            @click="submitEdit"
          >
            Save
          </button>
          <button class="text-xs px-2 py-0.5 rounded hover:bg-accent" @click="cancelEdit">
            Cancel
          </button>
        </div>
      </template>
    </div>
  </div>

  <!-- AlertDialog: single instance, outside ContextMenu -->
  <AlertDialog :open="showDeleteDialog" @update:open="showDeleteDialog = $event">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete message?</AlertDialogTitle>
        <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          @click="executeDelete"
        >
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <AlertDialog :open="showBanDialog" @update:open="showBanDialog = $event">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Ban {{ message.displayName }}?</AlertDialogTitle>
        <AlertDialogDescription>
          This will revoke their access immediately and terminate all active sessions. This action
          cannot be undone from the UI.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          @click="executeBan"
        >
          Ban User
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<style scoped>
:deep(.mention) {
  background-color: hsl(var(--muted));
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-weight: 500;
}

:deep(.mention-highlight) {
  background-color: hsl(var(--primary) / 0.2);
  color: hsl(var(--primary));
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-weight: 600;
}
</style>
