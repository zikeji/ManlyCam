<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Role, ROLE_RANK } from '@manlycam/types';
import { useAuth } from '@/composables/useAuth';
import { useClips } from '@/composables/useClips';
import type { ClipListItem } from '@/composables/useClips';
import { toast } from 'vue-sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import ClipEditForm from '@/components/clips/ClipEditForm.vue';
import type { UpdateClipData } from '@/composables/useClips';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const { user } = useAuth();
const {
  clips,
  total,
  currentPage,
  isLoading,
  error,
  fetchClips,
  deleteClip,
  updateClip,
  shareClipToChat,
  copyClipLink,
  downloadClip,
} = useClips();

const includeShared = ref(false);
const showAll = ref(false);
const editingClip = ref<ClipListItem | null>(null);
const deletingClipId = ref<string | null>(null);

const isAdmin = computed(() => user.value && ROLE_RANK[user.value.role] >= ROLE_RANK[Role.Admin]);
const isMuted = computed(() => !!user.value?.mutedAt);
const hasMore = computed(() => clips.value.length < total.value);

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function visibilityLabel(v: string): string {
  if (v === 'private') return 'Private';
  if (v === 'shared') return 'Shared';
  if (v === 'public') return 'Public';
  /* c8 ignore next -- defensive fallback for unknown visibility values */
  return v;
}

async function refresh() {
  await fetchClips({ page: 0, includeShared: includeShared.value, all: showAll.value });
}

async function loadMore() {
  await fetchClips({
    page: currentPage.value + 1,
    includeShared: includeShared.value,
    all: showAll.value,
  });
}

async function onToggleShared(val: boolean) {
  includeShared.value = val;
  await fetchClips({ page: 0, includeShared: val, all: showAll.value });
}

async function onToggleAll(val: boolean) {
  showAll.value = val;
  await fetchClips({ page: 0, includeShared: includeShared.value, all: val });
}

async function onDismiss(clipId: string) {
  try {
    await deleteClip(clipId);
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Failed to dismiss clip');
  }
}

async function onConfirmDelete() {
  /* c8 ignore next -- guard cannot be reached when dialog is open since deletingClipId is set to open it */
  if (!deletingClipId.value) return;
  try {
    await deleteClip(deletingClipId.value);
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Failed to delete clip');
  } finally {
    deletingClipId.value = null;
  }
}

async function onShare(clipId: string) {
  try {
    await shareClipToChat(clipId);
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Failed to share clip');
  }
}

async function onCopy(clipId: string, visibility: string) {
  try {
    await copyClipLink(clipId, visibility);
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Failed to copy link');
  }
}

async function onSaveEdit(data: UpdateClipData) {
  /* c8 ignore next -- guard cannot be reached when dialog is open since editingClip is set to open it */
  if (!editingClip.value) return;
  try {
    await updateClip(editingClip.value.id, data);
    editingClip.value = null;
    toast.success('Clip updated');
  } catch (err: unknown) {
    /* c8 ignore next -- rejection is always an Error in practice */
    toast.error(err instanceof Error ? err.message : 'Failed to update clip');
  }
}

// Fetch when dialog opens; reset filters on each open
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      includeShared.value = false;
      showAll.value = false;
      void refresh();
    }
  },
  { immediate: true },
);
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-w-4xl h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
      <DialogHeader class="px-6 py-4 border-b border-border shrink-0">
        <div class="flex items-center justify-between">
          <DialogTitle>My Clips</DialogTitle>
          <div class="flex items-center gap-4">
            <label class="flex items-center gap-2 text-sm">
              <Switch
                :model-value="includeShared"
                data-testid="include-shared-toggle"
                @update:model-value="onToggleShared"
              />
              Show shared
            </label>
            <label v-if="isAdmin" class="flex items-center gap-2 text-sm">
              <Switch
                :model-value="showAll"
                data-testid="show-all-toggle"
                @update:model-value="onToggleAll"
              />
              Show all
            </label>
          </div>
        </div>
      </DialogHeader>

      <div class="flex-1 overflow-y-auto px-6 py-4">
        <p v-if="error" class="mb-4 text-sm text-destructive" data-testid="error-message">
          {{ error }}
        </p>

        <div v-if="isLoading && clips.length === 0" class="flex justify-center py-12">
          <div
            class="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"
            data-testid="loading-spinner"
          />
        </div>

        <p
          v-else-if="!isLoading && clips.length === 0"
          class="py-12 text-center text-muted-foreground"
          data-testid="empty-message"
        >
          No clips yet.
        </p>

        <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="clip in clips"
            :key="clip.id"
            class="flex flex-col overflow-hidden rounded-lg border bg-card"
            :data-testid="`clip-card-${clip.id}`"
          >
            <!-- Thumbnail -->
            <div class="relative aspect-video bg-muted">
              <img
                v-if="clip.thumbnailUrl"
                :src="clip.thumbnailUrl"
                :alt="clip.name"
                class="h-full w-full object-cover"
              />
              <div v-else class="flex h-full items-center justify-center text-muted-foreground">
                <span class="text-xs">No preview</span>
              </div>

              <!-- Pending overlay -->
              <div
                v-if="clip.status === 'pending'"
                class="absolute inset-0 flex items-center justify-center bg-black/60"
                data-testid="pending-overlay"
              >
                <div class="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent" />
              </div>

              <!-- Duration badge -->
              <div v-if="clip.durationSeconds != null" class="absolute bottom-1 right-1">
                <Badge variant="secondary" class="text-xs" data-testid="duration-badge">
                  {{ formatDuration(clip.durationSeconds) }}
                </Badge>
              </div>
            </div>

            <!-- Card body -->
            <div class="flex flex-1 flex-col gap-2 p-3">
              <div class="flex items-start justify-between gap-1">
                <p class="text-sm font-medium leading-tight" data-testid="clip-name">{{ clip.name }}</p>
                <Badge
                  :variant="
                    clip.visibility === 'private'
                      ? 'outline'
                      : clip.visibility === 'public'
                        ? 'default'
                        : 'secondary'
                  "
                  class="shrink-0 text-xs"
                  data-testid="visibility-badge"
                >
                  {{ visibilityLabel(clip.visibility) }}
                </Badge>
              </div>

              <p class="text-xs text-muted-foreground" data-testid="created-at">
                {{ new Date(clip.createdAt).toLocaleDateString() }}
              </p>

              <!-- Failed state -->
              <div v-if="clip.status === 'failed'" class="mt-auto flex flex-col gap-2">
                <p class="text-xs text-destructive" data-testid="failed-message">
                  Clip processing failed.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  class="w-full"
                  data-testid="dismiss-button"
                  @click="onDismiss(clip.id)"
                >
                  Dismiss
                </Button>
              </div>

              <!-- Ready state actions -->
              <div v-else-if="clip.status === 'ready'" class="mt-auto flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="edit-button"
                  @click="editingClip = clip"
                >
                  Edit
                </Button>
                <Button
                  v-if="!isMuted"
                  size="sm"
                  variant="outline"
                  data-testid="share-button"
                  @click="onShare(clip.id)"
                >
                  Share
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="copy-link-button"
                  @click="onCopy(clip.id, clip.visibility)"
                >
                  Copy Link
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="download-button"
                  @click="downloadClip(clip.id)"
                >
                  Download
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  data-testid="delete-button"
                  @click="deletingClipId = clip.id"
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </div>

        <!-- Load more -->
        <div v-if="hasMore" class="mt-6 flex justify-center">
          <Button
            variant="outline"
            :disabled="isLoading"
            data-testid="load-more-button"
            @click="loadMore"
          >
            <span v-if="isLoading">Loading…</span>
            <span v-else>Load more</span>
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>

  <!-- Edit dialog -->
  <Dialog :open="editingClip !== null" @update:open="(v) => { if (!v) editingClip = null; }">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Edit Clip</DialogTitle>
      </DialogHeader>
      <ClipEditForm
        v-if="editingClip"
        :clip="editingClip"
        :user-role="user!.role"
        @save="onSaveEdit"
        @cancel="editingClip = null"
      />
    </DialogContent>
  </Dialog>

  <!-- Delete confirmation dialog -->
  <AlertDialog
    :open="deletingClipId !== null"
    @update:open="(v) => { if (!v) deletingClipId = null; }"
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete clip?</AlertDialogTitle>
        <AlertDialogDescription>
          This will permanently delete the clip. This action cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel data-testid="delete-cancel-button">Cancel</AlertDialogCancel>
        <AlertDialogAction
          data-testid="delete-confirm-button"
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          @click="onConfirmDelete"
        >
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
