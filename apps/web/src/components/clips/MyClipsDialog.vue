<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Loader2 } from 'lucide-vue-next';
import { Role, ROLE_RANK } from '@manlycam/types';
import { useAuth } from '@/composables/useAuth';
import { useClips } from '@/composables/useClips';
import type { ClipListItem } from '@/composables/useClips';
import { toast } from 'vue-sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
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
  getClipStreamUrl,
} = useClips();

const includeShared = ref(false);
const showAll = ref(false);
const editingClip = ref<ClipListItem | null>(null);
const deletingClipId = ref<string | null>(null);
const deleteDialogOpen = ref(false);
const isDeleting = ref(false);
const watchingClipUrl = ref<string | null>(null);
const watchingClipName = ref<string>('');

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
  /* c8 ignore next -- guard cannot be reached; button only shown when dialog is open */
  if (!deletingClipId.value) return;
  isDeleting.value = true;
  try {
    await deleteClip(deletingClipId.value);
    deleteDialogOpen.value = false;
    deletingClipId.value = null;
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Failed to delete clip');
  } finally {
    isDeleting.value = false;
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

async function onWatch(clip: ClipListItem) {
  try {
    watchingClipName.value = clip.name;
    watchingClipUrl.value = await getClipStreamUrl(clip.id);
  } catch (err: unknown) {
    toast.error(err instanceof Error ? err.message : 'Failed to load clip');
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
          <div class="flex items-center gap-4 pr-8">
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
            <div class="group relative aspect-video bg-muted">
              <img
                v-if="clip.thumbnailUrl"
                :src="clip.thumbnailUrl"
                :alt="clip.name"
                class="h-full w-full object-cover"
              />
              <div v-else class="flex h-full items-center justify-center text-muted-foreground">
                <span class="text-xs">No preview</span>
              </div>

              <!-- Visibility badge (top-left) -->
              <div class="absolute left-1 top-1">
                <Badge
                  :variant="
                    clip.visibility === 'private'
                      ? 'outline'
                      : clip.visibility === 'public'
                        ? 'default'
                        : 'secondary'
                  "
                  class="text-xs"
                  data-testid="visibility-badge"
                >
                  {{ visibilityLabel(clip.visibility) }}
                </Badge>
              </div>

              <!-- Duration badge (bottom-right) -->
              <div v-if="clip.durationSeconds != null" class="absolute bottom-1 right-1">
                <Badge variant="secondary" class="text-xs" data-testid="duration-badge">
                  {{ formatDuration(clip.durationSeconds) }}
                </Badge>
              </div>

              <!-- Status overlays -->
              <div
                v-if="clip.status === 'pending'"
                class="absolute inset-0 flex items-center justify-center bg-black/60"
                data-testid="pending-overlay"
              >
                <div class="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent" />
              </div><div
                v-else-if="clip.status === 'failed'"
                class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-destructive/70"
                data-testid="failed-overlay"
              >
                <p class="text-sm font-semibold text-white" data-testid="failed-message">Failed</p>
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid="dismiss-button"
                  @click="onDismiss(clip.id)"
                >
                  Dismiss
                </Button>
              </div><button
                v-else-if="clip.status === 'ready'"
                class="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors hover:bg-black/40 focus-visible:bg-black/40 focus-visible:outline-none"
                data-testid="play-overlay"
                @click="onWatch(clip)"
              >
                <svg
                  class="h-12 w-12 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            </div>

            <!-- Card body -->
            <div class="flex flex-1 flex-col gap-1 p-3">
              <div class="flex items-start justify-between gap-1">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium leading-tight" data-testid="clip-name">
                    {{ clip.name }}
                  </p>
                  <p class="text-xs text-muted-foreground" data-testid="created-at">
                    {{ new Date(clip.createdAt).toLocaleDateString() }}
                  </p>
                </div>

                <!-- Ready state actions menu -->
                <div v-if="clip.status === 'ready'" class="shrink-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <Button
                        size="sm"
                        variant="ghost"
                        class="h-7 w-7 p-0"
                        data-testid="clip-actions-trigger"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4">
                          <circle cx="12" cy="5" r="1.5" />
                          <circle cx="12" cy="12" r="1.5" />
                          <circle cx="12" cy="19" r="1.5" />
                        </svg>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem data-testid="edit-button" @click="editingClip = clip">
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        v-if="!isMuted"
                        data-testid="share-button"
                        @click="onShare(clip.id)"
                      >
                        Share to Chat
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        data-testid="copy-link-button"
                        @click="onCopy(clip.id, clip.visibility)"
                      >
                        Copy Link
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        data-testid="download-button"
                        @click="downloadClip(clip.id)"
                      >
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        class="text-destructive focus:text-destructive"
                        data-testid="delete-button"
                        @click="() => { deletingClipId = clip.id; deleteDialogOpen = true; }"
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
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

  <!-- Video player dialog -->
  <Dialog
    :open="watchingClipUrl !== null"
    @update:open="(v) => { if (!v) { watchingClipUrl = null; watchingClipName = ''; } }"
  >
    <DialogContent class="max-w-3xl p-0 overflow-hidden">
      <DialogHeader class="px-6 pt-5 pb-3">
        <DialogTitle>{{ watchingClipName }}</DialogTitle>
      </DialogHeader>
      <div class="px-6 pb-6">
        <video
          v-if="watchingClipUrl"
          :src="watchingClipUrl"
          controls
          autoplay
          class="w-full rounded"
          data-testid="clip-video"
        />
      </div>
    </DialogContent>
  </Dialog>

  <!-- Delete confirmation dialog -->
  <AlertDialog
    :open="deleteDialogOpen"
    @update:open="(v) => { if (!v) { deleteDialogOpen = false; deletingClipId = null; } }"
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete clip?</AlertDialogTitle>
        <AlertDialogDescription>
          This will permanently delete the clip. This action cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel data-testid="delete-cancel-button" :disabled="isDeleting">
          Cancel
        </AlertDialogCancel>
        <Button
          data-testid="delete-confirm-button"
          variant="destructive"
          :disabled="isDeleting"
          @click="onConfirmDelete"
        >
          <Loader2 v-if="isDeleting" class="mr-2 h-4 w-4 animate-spin" />
          {{ isDeleting ? 'Deleting…' : 'Delete' }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
