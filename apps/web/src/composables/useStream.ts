import { ref } from 'vue';
import { apiFetch } from '@/lib/api';
import type { StreamState } from '@manlycam/types';

export type ClientStreamState = 'connecting' | 'live' | 'unreachable' | 'explicit-offline';

function toClientState(s: StreamState): Exclude<ClientStreamState, 'connecting'> {
  if (s.state === 'live') return 'live';
  if (s.state === 'unreachable') return 'unreachable';
  return 'explicit-offline';
}

// Module-level singleton — all callers share the same ref (same pattern as useAuth)
const streamState = ref<ClientStreamState>('connecting');

export const useStream = () => {
  const initStream = async (): Promise<void> => {
    try {
      const state = await apiFetch<StreamState>('/api/stream/state');
      streamState.value = toClientState(state);
    } catch {
      // Remain 'connecting' on error; Story 3.4 WS will push real state
    }
  };

  // Story 3.4 seam: useWebSocket composable calls this when stream:state WS message arrives
  const setStateFromWs = (payload: StreamState): void => {
    streamState.value = toClientState(payload);
  };

  return { streamState, initStream, setStateFromWs };
};
