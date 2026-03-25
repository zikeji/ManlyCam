import { ref, onMounted, onUnmounted } from 'vue';

// Module-level singletons shared across all callers
export const isClipModalOpen = ref(false);
export const activeClipId = ref<string | null>(null);

interface ClipModalState {
  clipModal: true;
  fromRoute: string;
  clipId: string;
}

export function openClip(clipId: string): void {
  const stateObj: ClipModalState = { clipModal: true, fromRoute: '/', clipId };
  if (isClipModalOpen.value) {
    history.replaceState(stateObj, '', `/clips/${clipId}`);
  } else {
    history.pushState(stateObj, '', `/clips/${clipId}`);
  }
  isClipModalOpen.value = true;
  activeClipId.value = clipId;
}

export function closeClip(): void {
  // Guard against repeated calls (e.g., holding Escape key)
  if (!isClipModalOpen.value) return;
  isClipModalOpen.value = false;
  activeClipId.value = null;
  history.back();
}

// Exported for WatchView to reset state on unmount
export function resetClipModalState(): void {
  isClipModalOpen.value = false;
  activeClipId.value = null;
}

function handlePopState(): void {
  const state = history.state as ClipModalState | null;
  if (state?.clipModal === true && state.clipId) {
    // Forward navigation to a clip URL — restore modal state
    isClipModalOpen.value = true;
    activeClipId.value = state.clipId;
  } else {
    // Navigated away from clip URL — close modal
    isClipModalOpen.value = false;
    activeClipId.value = null;
  }
}

export function useClipModal() {
  onMounted(() => {
    window.addEventListener('popstate', handlePopState);
  });
  onUnmounted(() => {
    window.removeEventListener('popstate', handlePopState);
  });

  return { isClipModalOpen, activeClipId, openClip, closeClip };
}
