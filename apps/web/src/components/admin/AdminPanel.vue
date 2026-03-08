<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center justify-between p-4 border-b">
      <h2 class="text-lg font-semibold">Camera Controls</h2>
      <button
        @click="$emit('close')"
        class="p-1 hover:bg-gray-100 rounded"
        aria-label="Close panel"
      >
        <span class="text-xl">←</span>
      </button>
    </div>
    <div class="flex-1 overflow-y-auto">
      <CameraControls />
    </div>
  </div>
</template>

<script setup lang="ts">
import CameraControls from './CameraControls.vue';

defineEmits<{
  close: [];
}>();
</script>
