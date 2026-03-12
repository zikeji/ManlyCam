import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref, nextTick } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import type { ComponentPublicInstance } from 'vue';
import WatchView from './WatchView.vue';

// Shared mutable state so tests can control auth role
const mockUser = ref<{ role: string; displayName: string } | null>({
  role: 'ViewerCompany',
  displayName: 'Test User',
});

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
    logout: vi.fn(),
    fetchCurrentUser: vi.fn(),
  }),
}));

const mockInitStream = vi.fn().mockResolvedValue(undefined);
const mockStreamState = ref<string>('connecting');

vi.mock('@/composables/useStream', () => ({
  useStream: () => ({
    streamState: mockStreamState,
    initStream: mockInitStream,
    setStateFromWs: vi.fn(),
  }),
}));

// vi.hoisted runs before any imports
const {
  mockMessages,
  mockUnreadCount,
  mockResetUnread,
  mockIncrementUnread,
  mockIsLoadingHistory,
} = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vueModule = require('vue') as typeof import('vue');
  const msgs = vueModule.ref<unknown[]>([]);
  const unread = vueModule.ref(0);
  const loadingHistory = vueModule.ref(false);
  const resetFn = vi.fn(() => {
    unread.value = 0;
  });
  const incrementFn = vi.fn(() => {
    unread.value++;
  });
  return {
    mockMessages: msgs,
    mockUnreadCount: unread,
    mockIsLoadingHistory: loadingHistory,
    mockResetUnread: resetFn,
    mockIncrementUnread: incrementFn,
  };
});

vi.mock('@/composables/useChat', () => ({
  useChat: () => ({
    messages: mockMessages,
    sendChatMessage: vi.fn(),
    handleChatMessage: vi.fn(),
    isLoadingHistory: mockIsLoadingHistory,
  }),
  messages: mockMessages,
  unreadCount: mockUnreadCount,
  resetUnread: mockResetUnread,
  incrementUnread: mockIncrementUnread,
  isLoadingHistory: mockIsLoadingHistory,
}));

vi.mock('@/composables/useAdminStream', () => ({
  useAdminStream: () => ({
    startStream: vi.fn(),
    stopStream: vi.fn(),
    isLoading: ref(false),
    error: ref(null),
  }),
}));

vi.mock('@/components/stream/StreamPlayer.vue', () => ({
  default: {
    name: 'StreamPlayer',
    props: ['streamState', 'chatSidebarOpen', 'unreadCount', 'showLandscapeTapToggle'],
    emits: ['toggleChatSidebar'],
    template: '<button data-stream-player @dblclick="$emit(\'toggleChatSidebar\')" />',
  },
}));

vi.mock('@/components/chat/ChatPanel.vue', () => ({
  default: {
    name: 'ChatPanel',
    emits: ['openCameraControls'],
    template: '<div data-chat-panel />',
  },
}));

vi.mock('@/components/stream/BroadcastConsole.vue', () => ({
  default: {
    name: 'BroadcastConsole',
    template: '<div data-broadcast-console />',
  },
}));

vi.mock('@/components/stream/AtmosphericVoid.vue', () => ({
  default: {
    name: 'AtmosphericVoid',
    template: '<div data-atmospheric-void />',
  },
}));

let mockIsDesktop = true;
let mockIsPortrait = false;
let mockIsLandscape = false;

let mockStorageStore: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string): string | null => mockStorageStore[key] ?? null,
  setItem: (key: string, value: string): void => {
    mockStorageStore[key] = value;
  },
  removeItem: (key: string): void => {
    delete mockStorageStore[key];
  },
};

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
}

describe('WatchView', () => {
  let wrapper: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    mockInitStream.mockClear();
    mockUser.value = { role: 'ViewerCompany', displayName: 'Test User' };
    mockStreamState.value = 'connecting';
    mockMessages.value = [];
    mockUnreadCount.value = 0;
    mockResetUnread.mockClear();
    mockIsDesktop = true;
    mockIsPortrait = false;
    mockIsLandscape = false;

    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation((query: string) => ({
        matches:
          query === '(min-width: 1024px)'
            ? mockIsDesktop
            : query === '(max-width: 1023px) and (orientation: portrait)'
              ? mockIsPortrait
              : query === '(max-width: 1023px) and (orientation: landscape)'
                ? mockIsLandscape
                : false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
      writable: true,
    });

    mockStorageStore = {};
    vi.stubGlobal('localStorage', mockLocalStorage);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  describe('Desktop Layout', () => {
    beforeEach(() => {
      mockIsDesktop = true;
      mockIsPortrait = false;
      mockIsLandscape = false;
    });

    it('renders content area with absolute AtmosphericVoid inside relative centered flex container', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      const main = wrapper.find('main');
      const contentArea = main.find('div.relative.flex.items-center.justify-center');
      expect(contentArea.exists()).toBe(true);

      const voidComp = contentArea.find('[data-atmospheric-void]');
      expect(voidComp.exists()).toBe(true);
      expect(voidComp.classes()).toContain('absolute');
      expect(voidComp.classes()).toContain('inset-0');
    });

    it('renders BroadcastConsole directly in main below content area', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      const main = wrapper.find('main');
      const consoleComp = main.find('[data-broadcast-console]');
      expect(consoleComp.exists()).toBe(true);
    });
  });

  describe('Mobile Portrait Layout', () => {
    beforeEach(() => {
      mockIsDesktop = false;
      mockIsPortrait = true;
      mockIsLandscape = false;
    });

    it('stream container is shrink-0 without centering flex', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      const streamWrapper = wrapper.find('main > div.shrink-0');
      expect(streamWrapper.exists()).toBe(true);
      // Ensure no centering div is rendered
      expect(wrapper.find('div.relative.flex.items-center.justify-center').exists()).toBe(false);
    });

    it('does NOT render AtmosphericVoid', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();
      expect(wrapper.find('[data-atmospheric-void]').exists()).toBe(false);
    });

    it('renders ChatPanel below Console directly in main', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();
      const main = wrapper.find('main');
      expect(main.find('[data-broadcast-console]').exists()).toBe(true);
      expect(main.find('[data-chat-panel]').exists()).toBe(true);
    });
  });

  describe('Mobile Landscape Layout', () => {
    beforeEach(() => {
      mockIsDesktop = false;
      mockIsPortrait = false;
      mockIsLandscape = true;
    });

    it('does NOT render AtmosphericVoid', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();
      expect(wrapper.find('[data-atmospheric-void]').exists()).toBe(false);
    });

    it('does NOT render BroadcastConsole in main', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();
      const main = wrapper.find('main');
      expect(main.find('[data-broadcast-console]').exists()).toBe(false);
    });

    it('renders ChatPanel and BroadcastConsole stacked in right column when sidebar open', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      // ensure sidebar is open
      (wrapper.vm as ComponentPublicInstance & { chatSidebarOpen: boolean }).chatSidebarOpen = true;
      await nextTick();

      const rightCol = wrapper.find('div.w-\\[280px\\]');
      expect(rightCol.exists()).toBe(true);
      expect(rightCol.find('[data-chat-panel]').exists()).toBe(true);
      expect(rightCol.find('[data-broadcast-console]').exists()).toBe(true);
    });

    it('passes showLandscapeTapToggle=true to StreamPlayer when sidebar is closed', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      (wrapper.vm as ComponentPublicInstance & { chatSidebarOpen: boolean }).chatSidebarOpen =
        false;
      await nextTick();

      const streamPlayer = wrapper.findComponent({ name: 'StreamPlayer' });
      expect(streamPlayer.props('showLandscapeTapToggle')).toBe(true);
    });

    it('passes showLandscapeTapToggle=false to StreamPlayer when sidebar is open', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      (wrapper.vm as ComponentPublicInstance & { chatSidebarOpen: boolean }).chatSidebarOpen = true;
      await nextTick();

      const streamPlayer = wrapper.findComponent({ name: 'StreamPlayer' });
      expect(streamPlayer.props('showLandscapeTapToggle')).toBe(false);
    });
  });

  describe('Chat sidebar toggling', () => {
    it('resetUnread called when sidebar toggles open', async () => {
      mockIsDesktop = true;
      // Start collapsed
      mockLocalStorage.setItem('manlycam:chat-sidebar-open', 'false');
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();
      mockResetUnread.mockClear();
      // Expand (toggle to open)
      await wrapper.find('[data-stream-player]').trigger('dblclick');
      await nextTick();
      expect(mockResetUnread).toHaveBeenCalled();
    });
  });
});
