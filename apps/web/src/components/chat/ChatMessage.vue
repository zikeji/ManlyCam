<script setup lang="ts">
import { computed, ref, nextTick } from 'vue';
import type { ChatMessage } from '@manlycam/types';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { renderMarkdownLite } from '@/lib/markdown';
import { formatTime, initials } from '@/lib/dateFormat';
import { MoreHorizontal } from 'lucide-vue-next';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
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
}>();

const emit = defineEmits<{
  requestEdit: [messageId: string, newContent: string];
  requestDelete: [messageId: string];
}>();

const timeLabel = computed(() => formatTime(props.message.createdAt));
const avatarInitials = computed(() => initials(props.message.displayName));
const renderedContent = computed(() => renderMarkdownLite(props.message.content));
const editedLabel = computed(() =>
  props.message.updatedAt ? formatTime(props.message.updatedAt) : null,
);

const isEditing = ref(false);
const editContent = ref('');
const editTextareaRef = ref<HTMLTextAreaElement | null>(null);
const rootRef = ref<HTMLElement | null>(null);
const canSave = computed(() => editContent.value.trim().length > 0);

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

function confirmDelete(e?: Event) {
  if ((e as MouseEvent | undefined)?.shiftKey) {
    emit('requestDelete', props.message.id);
    return;
  }
  if (window.confirm('Delete this message?')) {
    emit('requestDelete', props.message.id);
  }
}
</script>

<template>
  <!-- Continuation row: only message body, indented to align with group header text -->
  <div
    v-if="isContinuation"
    ref="rootRef"
    role="listitem"
    class="relative group px-3 py-0.5 pl-[52px] hover:bg-white/[.03]"
  >
    <div
      v-if="isOwn && !isEditing"
      class="absolute inset-y-0 right-2 z-10 flex items-center opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button
            class="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Message actions"
          >
            <MoreHorizontal class="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem @click="startEdit">Edit</DropdownMenuItem>
          <DropdownMenuItem @click="confirmDelete" class="text-red-400 focus:text-red-400">
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

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
  <div v-else ref="rootRef" role="listitem" class="relative group flex items-start gap-2 px-3 py-1.5 hover:bg-white/[.03]">
    <div
      v-if="isOwn && !isEditing"
      class="absolute inset-y-0 right-2 z-10 flex items-center opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button
            class="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Message actions"
          >
            <MoreHorizontal class="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem @click="startEdit">Edit</DropdownMenuItem>
          <DropdownMenuItem @click="confirmDelete" class="text-red-400 focus:text-red-400">
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

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
</template>
