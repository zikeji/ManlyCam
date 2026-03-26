<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useStreamOnlyLink } from '@/composables/useStreamOnlyLink';

const { enabled, key, isLoading, isRegenerating, toggle, regenerate, fetchConfig } =
  useStreamOnlyLink();

onMounted(fetchConfig);

const streamUrl = computed(() =>
  enabled.value && key.value ? `${window.location.origin}/stream-only/${key.value}` : '',
);

async function handleCopy() {
  if (streamUrl.value) {
    await navigator.clipboard.writeText(streamUrl.value);
  }
}
</script>

<template>
  <div class="p-6 flex flex-col gap-6">
    <!-- Loading skeleton -->
    <template v-if="isLoading">
      <div class="flex flex-col gap-3">
        <div class="h-5 w-48 rounded bg-muted animate-pulse" />
        <div class="h-4 w-72 rounded bg-muted animate-pulse" />
      </div>
    </template>

    <template v-else>
      <!-- Toggle row -->
      <div class="flex items-center justify-between gap-4">
        <div class="flex flex-col gap-1">
          <label for="stream-only-switch" class="text-sm font-medium cursor-pointer">
            Enable Stream-Only Link
          </label>
          <p class="text-xs text-muted-foreground">
            A link that only displays the stream when enabled and nothing else, e.g. in an OBS
            browser source.
          </p>
        </div>
        <Switch
          id="stream-only-switch"
          v-model="enabled"
          @update:model-value="(v: boolean) => toggle(v)"
        />
      </div>

      <!-- URL row — always shown -->
      <div class="flex flex-col gap-2">
        <p class="text-xs text-muted-foreground font-medium">Stream-Only URL</p>
        <div class="flex gap-2">
          <input
            v-if="enabled && key"
            :value="streamUrl"
            readonly
            class="flex-1 min-w-0 rounded-md border border-input bg-muted px-3 py-1.5 text-sm text-muted-foreground focus:outline-none"
            data-testid="stream-only-url"
          />
          <input
            v-else
            placeholder="Enable and generate a key to get the link"
            readonly
            disabled
            class="flex-1 min-w-0 rounded-md border border-input bg-muted px-3 py-1.5 text-sm text-muted-foreground focus:outline-none opacity-50"
            data-testid="stream-only-url-placeholder"
          />
          <Button
            v-if="enabled && key"
            variant="outline"
            size="sm"
            @click="handleCopy"
            data-testid="copy-button"
          >
            Copy
          </Button>
          <Button
            v-if="enabled"
            variant="outline"
            size="sm"
            :disabled="isRegenerating"
            @click="regenerate"
            data-testid="regenerate-button"
          >
            Regenerate
          </Button>
        </div>
      </div>
    </template>
  </div>
</template>
