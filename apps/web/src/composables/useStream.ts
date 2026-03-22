import { ref } from 'vue';
import { apiFetch } from '@/lib/api';
import type { StreamState } from '@manlycam/types';

export type ClientStreamState = 'connecting' | 'live' | 'unreachable' | 'explicit-offline';

// Module-level singleton — all callers share the same ref (same pattern as useAuth)
const streamState = ref<ClientStreamState>('connecting');
const piReachableWhileOffline = ref(false);
const offlineEmoji = ref<string | null>(null);
const offlineTitle = ref<string | null>(null);
const offlineDescription = ref<string | null>(null);

function toClientState(s: StreamState): Exclude<ClientStreamState, 'connecting'> {
  if (s.state === 'explicit-offline') {
    piReachableWhileOffline.value = s.piReachable ?? false;
    offlineEmoji.value = s.offlineEmoji ?? null;
    offlineTitle.value = s.offlineTitle ?? null;
    offlineDescription.value = s.offlineDescription ?? null;
    return 'explicit-offline';
  }
  piReachableWhileOffline.value = false;
  offlineEmoji.value = null;
  offlineTitle.value = null;
  offlineDescription.value = null;
  if (s.state === 'live') return 'live';
  return 'unreachable';
}

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

  return {
    streamState,
    piReachableWhileOffline,
    offlineEmoji,
    offlineTitle,
    offlineDescription,
    initStream,
    setStateFromWs,
  };
};
