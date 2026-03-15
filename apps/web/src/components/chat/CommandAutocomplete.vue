<script setup lang="ts">
import { computed, ref, watch } from 'vue';

interface CommandEntry {
  name: string;
  description: string;
  placeholder?: string;
}

const props = defineProps<{
  visible: boolean;
  query: string;
  commands: CommandEntry[];
  position: { bottom: number; left: number };
}>();

const emit = defineEmits<{
  select: [command: CommandEntry];
  close: [];
}>();

const selectedIndex = ref(0);

const filteredCommands = computed(() => {
  if (!props.query) return props.commands;
  const q = props.query.toLowerCase();
  return props.commands.filter((cmd) => cmd.name.toLowerCase().startsWith(q));
});

// Reset selection when query or visibility changes
watch([() => props.query, () => props.visible], () => {
  selectedIndex.value = 0;
});

function handleKeydown(e: KeyboardEvent) {
  if (!props.visible) return;

  const len = Math.max(filteredCommands.value.length, 1);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex.value = (selectedIndex.value - 1 + len) % len;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex.value = (selectedIndex.value + 1) % len;
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    if (filteredCommands.value.length > 0) {
      e.preventDefault();
      emit('select', filteredCommands.value[selectedIndex.value]);
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
  }
}

defineExpose({ handleKeydown, filteredCommands, selectedIndex });
</script>

<template>
  <div
    v-if="visible && filteredCommands.length > 0"
    role="listbox"
    aria-label="Command suggestions"
    class="fixed z-50 bg-popover border border-border rounded-md shadow-lg overflow-y-auto max-h-48 min-w-[200px] flex flex-col-reverse"
    :style="{ bottom: position.bottom + 'px', left: position.left + 'px' }"
  >
    <button
      v-for="(cmd, index) in filteredCommands"
      :key="`${cmd.name}-${cmd.description}`"
      role="option"
      :aria-selected="index === selectedIndex"
      class="flex flex-col items-start w-full px-3 py-1.5 text-sm text-left hover:bg-accent focus:outline-none"
      :class="{ 'bg-accent': index === selectedIndex }"
      @mousedown.prevent="emit('select', cmd)"
    >
      <span class="font-mono text-xs text-primary">/{{ cmd.name }}<span v-if="cmd.placeholder" class="text-muted-foreground">&nbsp;{{ cmd.placeholder }}</span></span>
      <span class="text-xs text-muted-foreground">{{ cmd.description }}</span>
    </button>
  </div>
</template>
