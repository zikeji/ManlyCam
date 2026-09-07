import { ref } from 'vue';

// Module-level singleton — the terminal window open state is app-wide
export const isTerminalOpen = ref(false);

export function openTerminal(): void {
  isTerminalOpen.value = true;
}

export function closeTerminal(): void {
  isTerminalOpen.value = false;
}
