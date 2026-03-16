import { ref } from 'vue';
import { apiFetch } from '@/lib/api';

export interface CommandEntry {
  name: string;
  description: string;
  placeholder?: string;
}

export const availableCommands = ref<CommandEntry[]>([]);
let _loaded = false;

/**
 * Always fetch fresh commands from the server and update the cache.
 * On failure, _loaded is left unchanged: if already true, loadCommands()
 * remains a no-op (the next WS reconnect will retry via refreshCommands).
 */
export async function refreshCommands(): Promise<void> {
  try {
    const data = await apiFetch<{ commands: CommandEntry[] }>('/api/commands');
    availableCommands.value = data.commands;
    _loaded = true;
  } catch {
    /* commands unavailable — silent fail; _loaded intentionally not cleared */
  }
}

let _loadPromise: Promise<void> | null = null;

/**
 * Load commands once. Concurrent callers before the first fetch resolves
 * share the same in-flight promise. Subsequent calls after a successful
 * load are no-ops.
 */
export async function loadCommands(): Promise<void> {
  if (_loaded) return;
  if (_loadPromise !== null) return _loadPromise;
  _loadPromise = refreshCommands().finally(() => {
    _loadPromise = null;
  });
  return _loadPromise;
}
