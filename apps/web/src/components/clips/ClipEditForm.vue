<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { Role, ROLE_RANK } from '@manlycam/types';
import type { ClipListItem, UpdateClipData } from '@/composables/useClips';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

const props = defineProps<{
  clip: ClipListItem;
  userRole: Role;
}>();

const emit = defineEmits<{
  (e: 'save', data: UpdateClipData): void;
  (e: 'cancel'): void;
}>();

const name = ref(props.clip.name);
const description = ref(props.clip.description ?? '');
const visibility = ref(props.clip.visibility);
const showClipper = ref(props.clip.showClipper);
const showClipperAvatar = ref(props.clip.showClipperAvatar);
const clipperName = ref(props.clip.clipperName ?? props.clip.clipperDisplayName);

const canSetPublic = computed(() => ROLE_RANK[props.userRole] >= ROLE_RANK[Role.Moderator]);

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
  emit('save', data);
}
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
        class="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring align-top"
        data-testid="clip-description-input"
      />
    </div>

    <div class="flex flex-col gap-1">
      <label class="text-sm font-medium">Visibility</label>
      <select
        v-model="visibility"
        class="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        data-testid="clip-visibility-select"
      >
        <option value="private">Private</option>
        <option value="shared">Shared</option>
        <option v-if="canSetPublic" value="public">Public</option>
      </select>
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
      <Button type="button" variant="outline" @click="emit('cancel')">Cancel</Button>
      <Button type="submit">Save</Button>
    </div>
  </form>
</template>
