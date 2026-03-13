import { ref } from 'vue';
import type { PiSugarStatus } from '@manlycam/types';

// Module-level singleton — all components share the same ref (same pattern as useStream)
export const piSugarStatus = ref<PiSugarStatus | null>(null);

// Called by useWebSocket when a pisugar:status WS message arrives
export function setStateFromWs(payload: PiSugarStatus): void {
  piSugarStatus.value = payload;
}
