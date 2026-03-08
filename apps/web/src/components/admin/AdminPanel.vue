<template>
  <div class="flex flex-col h-full overflow-hidden">
    <div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
      <span class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Camera Controls
      </span>
      <button
        v-if="showClose"
        @click="$emit('close')"
        class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        aria-label="Close panel"
      >
        <X class="w-4 h-4" />
      </button>
    </div>
    <div class="flex-1 overflow-y-auto">
      <CameraControls />
    </div>
  </div>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next';
import CameraControls from './CameraControls.vue';

withDefaults(defineProps<{ showClose?: boolean }>(), { showClose: true });
defineEmits<{ close: [] }>();
</script>
