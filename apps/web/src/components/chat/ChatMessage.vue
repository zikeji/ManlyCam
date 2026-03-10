<script setup lang="ts">
import { computed, ref, nextTick } from 'vue';
import type { ChatMessage, Role } from '@manlycam/types';
import { ROLE_RANK } from '@manlycam/types';
import { MicOff } from 'lucide-vue-next';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { renderMarkdownLite } from '@/lib/markdown';
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
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';

const props = defineProps<{
  message: ChatMessage;
  isContinuation?: boolean;
  isOwn?: boolean;
  canModerateDelete?: boolean;
  isAuthorMuted?: boolean;
  currentUserRole?: Role;
}>();

const emit = defineEmits<{
  requestEdit: [messageId: string, newContent: string];
  requestDelete: [messageId: string];
  muteUser: [userId: string];
  unmuteUser: [userId: string];
  banUser: [userId: string];
}>();

const timeLabel = computed(() => formatTime(props.message.createdAt));
const avatarInitials = computed(() => initials(props.message.displayName));
const renderedContent = computed(() => renderMarkdownLite(props.message.content));
const editedLabel = computed(() =>
  props.message.updatedAt ? formatTime(props.message.updatedAt) : null,
);

const isPrivilegedUser = computed(
  () => props.currentUserRole === 'Admin' || props.currentUserRole === 'Moderator',
);

const canModerate = computed(() => {
  if (!props.currentUserRole || !isPrivilegedUser.value) return false;
  return (ROLE_RANK[props.currentUserRole] ?? 0) > (ROLE_RANK[props.message.authorRole] ?? 0);
});

const isEditing = ref(false);
const editContent = ref('');
const editTextareaRef = ref<HTMLTextAreaElement | null>(null);
const rootRef = ref<HTMLElement | null>(null);
const canSave = computed(() => editContent.value.trim().length > 0);
const showDeleteDialog = ref(false);
const showBanDialog = ref(false);

function startEdit() {
  isEditing.value = true;
  editContent.value = props.message.content;
  nextTick(() => {
    editTextareaRef.value?.focus();
    rootRef.value?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
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
  <ContextMenu v-if="isContinuation && (isOwn || canModerateDelete || canModerate) && !isEditing">
    <ContextMenuTrigger as-child>
      <div ref="rootRef" role="listitem" class="relative group px-3 py-0.5 pl-[52px] hover:bg-white/[.03]">
        <template v-if="!isEditing">
          <p
            class="text-sm text-foreground break-words [&_a]:underline [&_a]:text-primary [&_code]:font-mono [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded"
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
        </template>
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem v-if="isOwn" @click="startEdit">Edit</ContextMenuItem>
      <ContextMenuItem v-if="isOwn || canModerateDelete" @click="(e: MouseEvent) => confirmDelete(e)" class="text-red-400 focus:text-red-400">
        Delete
      </ContextMenuItem>
      <ContextMenuItem v-if="canModerate && !isAuthorMuted" @click="emit('muteUser', props.message.userId)">
        Mute
      </ContextMenuItem>
      <ContextMenuItem v-if="canModerate && isAuthorMuted" @click="emit('unmuteUser', props.message.userId)">
        Unmute
      </ContextMenuItem>
      <ContextMenuItem v-if="canModerate" @click="showBanDialog = true" class="text-red-400 focus:text-red-400">
        Ban
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
  <div
    v-else-if="isContinuation"
    ref="rootRef"
    role="listitem"
    class="relative group px-3 py-0.5 pl-[52px] hover:bg-white/[.03]"
  >
    <template v-if="!isEditing">
      <p
        class="text-sm text-foreground break-words [&_a]:underline [&_a]:text-primary [&_code]:font-mono [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded"
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
    </template>
    <template v-else>
      <textarea
        ref="editTextareaRef"
        v-model="editContent"
        rows="1"
        maxlength="1000"
        class="w-full resize-none rounded border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[32px]"
        @keydown="handleEditKeydown"
      />
      <div class="flex gap-2 mt-1">
        <button
          class="text-xs px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90"
          @click="submitEdit"
        >Save</button>
        <button
          class="text-xs px-2 py-0.5 rounded hover:bg-accent"
          @click="cancelEdit"
        >Cancel</button>
      </div>
    </template>
  </div>

  <!-- Group header row: avatar + name + tag + timestamp + message body -->
  <ContextMenu v-else-if="(isOwn || canModerateDelete || canModerate) && !isEditing">
    <ContextMenuTrigger as-child>
      <div ref="rootRef" role="listitem" class="relative group flex items-start gap-2 px-3 py-1.5 hover:bg-white/[.03]">
        <Avatar class="h-8 w-8 shrink-0 mt-0.5">
          <AvatarImage
            v-if="message.avatarUrl"
            :src="message.avatarUrl"
            :alt="message.displayName"
            referrer-policy="no-referrer"
          />
          <AvatarFallback class="text-xs">{{ avatarInitials }}</AvatarFallback>
        </Avatar>

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-sm font-semibold text-foreground truncate">{{ message.displayName }}</span>
            <MicOff
              v-if="isAuthorMuted && canModerate"
              class="h-3 w-3 shrink-0 text-muted-foreground"
              aria-label="Muted"
            />
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
                  <span class="text-xs text-muted-foreground/60 italic cursor-default shrink-0">(edited)</span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Edited {{ editedLabel }}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <template v-if="!isEditing">
            <p
              class="text-sm text-foreground break-words [&_a]:underline [&_a]:text-primary [&_code]:font-mono [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded"
              v-html="renderedContent"
            />
          </template>
          <template v-else>
            <textarea
              ref="editTextareaRef"
              v-model="editContent"
              rows="1"
              maxlength="1000"
              class="w-full resize-none rounded border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[32px]"
              @keydown="handleEditKeydown"
            />
            <div class="flex gap-2 mt-1">
              <button
                :disabled="!canSave"
                class="text-xs px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                @click="submitEdit"
              >Save</button>
              <button
                class="text-xs px-2 py-0.5 rounded hover:bg-accent"
                @click="cancelEdit"
              >Cancel</button>
            </div>
          </template>
        </div>
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem v-if="isOwn" @click="startEdit">Edit</ContextMenuItem>
      <ContextMenuItem v-if="isOwn || canModerateDelete" @click="(e: MouseEvent) => confirmDelete(e)" class="text-red-400 focus:text-red-400">
        Delete
      </ContextMenuItem>
      <ContextMenuItem v-if="canModerate && !isAuthorMuted" @click="emit('muteUser', props.message.userId)">
        Mute
      </ContextMenuItem>
      <ContextMenuItem v-if="canModerate && isAuthorMuted" @click="emit('unmuteUser', props.message.userId)">
        Unmute
      </ContextMenuItem>
      <ContextMenuItem v-if="canModerate" @click="showBanDialog = true" class="text-red-400 focus:text-red-400">
        Ban
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
  <div v-else ref="rootRef" role="listitem" class="relative group flex items-start gap-2 px-3 py-1.5 hover:bg-white/[.03]">
    <Avatar class="h-8 w-8 shrink-0 mt-0.5">
      <AvatarImage
        v-if="message.avatarUrl"
        :src="message.avatarUrl"
        :alt="message.displayName"
        referrer-policy="no-referrer"
      />
      <AvatarFallback class="text-xs">{{ avatarInitials }}</AvatarFallback>
    </Avatar>

    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-1.5 flex-wrap">
        <span class="text-sm font-semibold text-foreground truncate">{{ message.displayName }}</span>
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
              <span class="text-xs text-muted-foreground/60 italic cursor-default shrink-0">(edited)</span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Edited {{ editedLabel }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <template v-if="!isEditing">
        <p
          class="text-sm text-foreground break-words [&_a]:underline [&_a]:text-primary [&_code]:font-mono [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded"
          v-html="renderedContent"
        />
      </template>
      <template v-else>
        <textarea
          ref="editTextareaRef"
          v-model="editContent"
          rows="1"
          maxlength="1000"
          class="w-full resize-none rounded border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[32px]"
          @keydown="handleEditKeydown"
        />
        <div class="flex gap-2 mt-1">
          <button
            :disabled="!canSave"
            class="text-xs px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            @click="submitEdit"
          >Save</button>
          <button
            class="text-xs px-2 py-0.5 rounded hover:bg-accent"
            @click="cancelEdit"
          >Cancel</button>
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
          This will revoke their access immediately and terminate all active sessions. This action cannot be undone from the UI.
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
