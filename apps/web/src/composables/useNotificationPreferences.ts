import { ref, watch } from 'vue';

const STORAGE_KEY = 'manlycam:notification-preferences';

export interface NotificationPreferences {
  chatMessages: boolean;
  mentions: boolean;
  streamState: boolean;
  flashTitlebar: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  chatMessages: false,
  mentions: false,
  streamState: false,
  flashTitlebar: true,
};

function loadPreferences(): NotificationPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return {
        ...DEFAULT_PREFERENCES,
        ...(JSON.parse(stored) as Partial<NotificationPreferences>),
      };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_PREFERENCES };
}

// Module-level singleton — all callers share the same ref
const preferences = ref<NotificationPreferences>(loadPreferences());

function savePreferences(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences.value));
  } catch {
    /* ignore */
  }
}

watch(preferences, savePreferences, { deep: true });

export function useNotificationPreferences() {
  function updatePreference<K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K],
  ): void {
    preferences.value[key] = value;
  }

  return { preferences, updatePreference };
}
