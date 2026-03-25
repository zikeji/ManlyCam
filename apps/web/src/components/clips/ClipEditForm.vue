<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Role, ROLE_RANK } from '@manlycam/types';
import type { ClipListItem, UpdateClipData } from '@/composables/useClips';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
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

const props = defineProps<{
  clip: ClipListItem;
  userRole: Role;
}>();

const emit = defineEmits<{
  (e: 'save', data: UpdateClipData): void;
  (e: 'cancel'): void;
}>();

const MAX_DESC = 500;

const name = ref(props.clip.name);
const description = ref(props.clip.description ?? '');
const visibility = ref(props.clip.visibility);
const showClipper = ref(props.clip.showClipper);
const showClipperAvatar = ref(props.clip.showClipperAvatar);
const clipperName = ref(props.clip.clipperName ?? props.clip.clipperDisplayName);

const canSetPublic = computed(() => ROLE_RANK[props.userRole] >= ROLE_RANK[Role.Moderator]);
const lockedPublic = computed(() => props.clip.visibility === 'public' && !canSetPublic.value);

const confirmDialogOpen = ref(false);
const pendingData = ref<UpdateClipData | null>(null);

const descCount = computed(() => description.value.length);
const descOverLimit = computed(() => descCount.value > MAX_DESC);

// Reset attribution fields when visibility leaves 'public'
watch(visibility, (val) => {
  if (val !== 'public') {
    showClipper.value = false;
    showClipperAvatar.value = false;
  }
});

const showAttribution = computed(() => visibility.value === 'public');

function submit() {
  const data: UpdateClipData = {};
  if (name.value.trim() !== props.clip.name) data.name = name.value.trim();
  if (description.value !== (props.clip.description ?? ''))
    data.description = description.value;
  if (visibility.value !== props.clip.visibility) data.visibility = visibility.value;
  if (showAttribution.value) {
    if (showClipper.value !== props.clip.showClipper) data.showClipper = showClipper.value;
    if (showClipperAvatar.value !== props.clip.showClipperAvatar)
      data.showClipperAvatar = showClipperAvatar.value;
    if (clipperName.value !== (props.clip.clipperName ?? props.clip.clipperDisplayName))
      data.clipperName = clipperName.value;
  }
  if (lockedPublic.value && data.visibility !== undefined) {
    pendingData.value = data;
    confirmDialogOpen.value = true;
    return;
  }
  emit('save', data);
}

function onCancelVisibilityChange() {
  visibility.value = 'public';
  pendingData.value = null;
  confirmDialogOpen.value = false;
}

function onConfirmVisibilityChange() {
  if (pendingData.value) emit('save', pendingData.value);
  pendingData.value = null;
  confirmDialogOpen.value = false;
}

const visibilityOptions = [
  { value: 'private', label: 'Private', description: 'Only you can see this clip' },
  { value: 'shared', label: 'Shared', description: 'Any signed-in user can view' },
  { value: 'public', label: 'Public', description: 'Anyone with the link, no sign-in required' },
] as const;
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="submit">
    <div class="flex flex-col gap-1">
      <label class="text-sm font-medium">Name</label>
      <input
        v-model="name"
        type="text"
        required
        class="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        data-testid="clip-name-input"
      />
    </div>

    <div class="flex flex-col gap-1">
      <label class="text-sm font-medium">Description</label>
      <textarea
        v-model="description"
        rows="3"
        :class="[
          'rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring align-top',
          descOverLimit ? 'border-destructive focus:ring-destructive' : 'border-input',
        ]"
        data-testid="clip-description-input"
      />
      <div
        class="flex justify-end text-xs"
        :class="descOverLimit ? 'text-destructive' : 'text-muted-foreground'"
        data-testid="clip-description-counter"
      >
        {{ descCount }}/{{ MAX_DESC }}
      </div>
    </div>

    <div class="flex flex-col gap-1.5">
      <label class="text-sm font-medium">Visibility</label>
      <div class="flex gap-2">
        <template v-for="opt in visibilityOptions" :key="opt.value">
          <button
            v-if="opt.value !== 'public' || canSetPublic || props.clip.visibility === 'public'"
            type="button"
            :disabled="opt.value === 'public' && !canSetPublic"
            :data-testid="`clip-visibility-${opt.value}`"
            :class="[
              'flex flex-1 flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left text-sm transition-colors',
              visibility === opt.value
                ? 'border-ring bg-accent'
                : 'border-input hover:bg-accent/50',
              opt.value === 'public' && !canSetPublic
                ? 'opacity-50 cursor-not-allowed pointer-events-none'
                : '',
            ]"
            @click="visibility = opt.value"
          >
            <span class="font-medium">{{ opt.label }}</span>
            <span class="text-xs text-muted-foreground">{{ opt.description }}</span>
          </button>
        </template>
      </div>
    </div>

    <template v-if="showAttribution">
      <div class="flex items-center justify-between rounded-md border p-3">
        <label class="text-sm font-medium">Show clipper</label>
        <Switch v-model="showClipper" data-testid="show-clipper-switch" />
      </div>

      <template v-if="showClipper">
        <div class="flex items-center justify-between rounded-md border p-3">
          <label class="text-sm font-medium">Show clipper avatar</label>
          <Switch v-model="showClipperAvatar" data-testid="show-clipper-avatar-switch" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium">Clipper name</label>
          <input
            v-model="clipperName"
            type="text"
            class="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            data-testid="clipper-name-input"
          />
        </div>
      </template>
    </template>

    <div class="flex justify-end gap-2">
      <Button type="button" variant="outline" data-testid="clip-cancel-btn" @click="emit('cancel')">Cancel</Button>
      <Button type="submit" :disabled="descOverLimit">Save</Button>
    </div>
  </form>

  <AlertDialog :open="confirmDialogOpen">
    <AlertDialogContent data-testid="confirm-visibility-dialog">
      <AlertDialogHeader>
        <AlertDialogTitle>Change visibility?</AlertDialogTitle>
        <AlertDialogDescription>
          This clip is currently public. Changing visibility will make it less visible and only an
          Admin or Moderator can make it public again.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel data-testid="confirm-cancel" @click="onCancelVisibilityChange">
          Cancel
        </AlertDialogCancel>
        <AlertDialogAction data-testid="confirm-continue" @click="onConfirmVisibilityChange">
          Continue
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
