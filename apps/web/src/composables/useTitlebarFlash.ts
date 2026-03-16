import { onMounted, onUnmounted } from 'vue';
import { useNotificationPreferences } from './useNotificationPreferences';

const { preferences } = useNotificationPreferences();

let originalTitle = '';
let isFlashing = false;
let flashInterval: ReturnType<typeof setInterval> | null = null;

function stopFlash() {
  if (flashInterval) {
    clearInterval(flashInterval);
    flashInterval = null;
  }
  if (isFlashing) {
    document.title = originalTitle;
    isFlashing = false;
  }
}

export function useTitlebarFlash() {
  function flashTitlebar(message: string): void {
    if (!preferences.value.flashTitlebar) return;
    if (!document.hidden || isFlashing) return;
    if (!originalTitle) {
      originalTitle = document.title;
    }
    isFlashing = true;
    // Start alternating between flash message and original title every 1s
    document.title = message;
    flashInterval = setInterval(() => {
      document.title = document.title === message ? originalTitle : message;
    }, 1000);
  }

  function restoreTitle(): void {
    stopFlash();
  }

  function handleVisibilityChange(): void {
    if (!document.hidden) {
      restoreTitle();
    }
  }

  onMounted(() => {
    if (!originalTitle) {
      originalTitle = document.title;
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
  });

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    isFlashing = false;
    if (flashInterval) {
      clearInterval(flashInterval);
      flashInterval = null;
    }
  });

  return { flashTitlebar, restoreTitle };
}
