import { ref, onMounted, onUnmounted } from 'vue';

// Module-level singletons shared across all callers
export const isClipModalOpen = ref(false);
export const activeClipId = ref<string | null>(null);

export function openClip(clipId: string): void {
  const stateObj = { clipModal: true, fromRoute: '/' };
  if (isClipModalOpen.value) {
    history.replaceState(stateObj, '', `/clips/${clipId}`);
  } else {
    history.pushState(stateObj, '', `/clips/${clipId}`);
  }
  isClipModalOpen.value = true;
  activeClipId.value = clipId;
}

export function closeClip(): void {
  isClipModalOpen.value = false;
  activeClipId.value = null;
  history.back();
}

function handlePopState(): void {
  if (history.state?.clipModal !== true) {
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
