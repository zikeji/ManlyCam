import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock localStorage before module import
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn<(key: string) => string | null>((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get _store() {
      return store;
    },
  };
})();

vi.stubGlobal('localStorage', localStorageMock);

describe('useNotificationPreferences', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('returns default preferences when localStorage is empty', async () => {
    localStorageMock.getItem.mockReturnValue(null);
    const { useNotificationPreferences } = await import('./useNotificationPreferences');
    const { preferences } = useNotificationPreferences();

    expect(preferences.value.chatMessages).toBe(false);
    expect(preferences.value.mentions).toBe(false);
    expect(preferences.value.streamState).toBe(false);
    expect(preferences.value.flashTitlebar).toBe(true);
  });

  it('loads stored preferences from localStorage', async () => {
    const stored = {
      chatMessages: false,
      mentions: true,
      streamState: false,
      flashTitlebar: false,
    };
    localStorageMock.getItem.mockImplementation((key: string) =>
      key === 'manlycam:notification-preferences' ? JSON.stringify(stored) : null,
    );

    const { useNotificationPreferences } = await import('./useNotificationPreferences');
    const { preferences } = useNotificationPreferences();

    expect(preferences.value.chatMessages).toBe(false);
    expect(preferences.value.streamState).toBe(false);
    expect(preferences.value.flashTitlebar).toBe(false);
  });

  it('merges stored prefs with defaults (missing keys use defaults)', async () => {
    const partial = { chatMessages: false };
    localStorageMock.getItem.mockImplementation((key: string) =>
      key === 'manlycam:notification-preferences' ? JSON.stringify(partial) : null,
    );

    const { useNotificationPreferences } = await import('./useNotificationPreferences');
    const { preferences } = useNotificationPreferences();

    expect(preferences.value.chatMessages).toBe(false);
    expect(preferences.value.mentions).toBe(false); // default
    expect(preferences.value.streamState).toBe(false); // default
    expect(preferences.value.flashTitlebar).toBe(true); // default
  });

  it('updatePreference updates the preferences ref', async () => {
    localStorageMock.getItem.mockReturnValue(null);
    const { useNotificationPreferences } = await import('./useNotificationPreferences');
    const { preferences, updatePreference } = useNotificationPreferences();

    updatePreference('chatMessages', false);
    expect(preferences.value.chatMessages).toBe(false);

    updatePreference('flashTitlebar', false);
    expect(preferences.value.flashTitlebar).toBe(false);
  });

  it('saves to localStorage when preferences change', async () => {
    localStorageMock.getItem.mockReturnValue(null);
    const { useNotificationPreferences } = await import('./useNotificationPreferences');
    const { updatePreference } = useNotificationPreferences();

    // Flush watchers
    updatePreference('chatMessages', true);
    await new Promise((r) => setTimeout(r, 0));

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'manlycam:notification-preferences',
      expect.stringContaining('"chatMessages":true'),
    );
  });

  it('handles corrupted localStorage gracefully', async () => {
    localStorageMock.getItem.mockImplementation((key: string) =>
      key === 'manlycam:notification-preferences' ? 'not-valid-json{{' : null,
    );

    const { useNotificationPreferences } = await import('./useNotificationPreferences');
    const { preferences } = useNotificationPreferences();

    // Should fall back to defaults
    expect(preferences.value.chatMessages).toBe(false);
    expect(preferences.value.mentions).toBe(false);
  });

  it('preferences ref is shared across multiple useNotificationPreferences() calls', async () => {
    localStorageMock.getItem.mockReturnValue(null);
    const { useNotificationPreferences } = await import('./useNotificationPreferences');

    const a = useNotificationPreferences();
    const b = useNotificationPreferences();

    a.updatePreference('chatMessages', false);
    expect(b.preferences.value.chatMessages).toBe(false);
  });
});
