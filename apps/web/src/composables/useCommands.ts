import { ref } from 'vue';
import { apiFetch } from '@/lib/api';

export interface CommandEntry {
  name: string;
  description: string;
  placeholder?: string;
}

export const availableCommands = ref<CommandEntry[]>([]);
let _loaded = false;

/** Load commands once; subsequent calls are no-ops if already loaded. */
export async function loadCommands(): Promise<void> {
  if (_loaded) return;
  await refreshCommands();
}

/** Always fetch fresh commands from the server and update the cache. */
export async function refreshCommands(): Promise<void> {
  try {
    const data = await apiFetch<{ commands: CommandEntry[] }>('/api/commands');
    availableCommands.value = data.commands;
    _loaded = true;
  } catch {
    /* commands unavailable — silent fail */
  }
}
