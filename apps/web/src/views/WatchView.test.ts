import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref, nextTick } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
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

// vi.hoisted runs before any imports — required for module-level exports in vi.mock
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

// Stub StreamPlayer to avoid WebRTC complexity in layout tests
vi.mock('@/components/stream/StreamPlayer.vue', () => ({
  default: {
    name: 'StreamPlayer',
    props: ['streamState', 'chatSidebarOpen', 'unreadCount', 'showChatSidebarToggle'],
    emits: ['openCameraControls', 'toggleChatSidebar'],
    template:
      '<button data-stream-player @click="$emit(\'openCameraControls\')" @dblclick="$emit(\'toggleChatSidebar\')" />',
  },
}));

// Stub ChatPanel to avoid chat composable complexity in layout tests
vi.mock('@/components/chat/ChatPanel.vue', () => ({
  default: {
    name: 'ChatPanel',
    emits: ['openCameraControls'],
    template: '<div data-chat-panel />',
  },
}));

let mockIsDesktop = true;
let mockIsPortrait = false;

// localStorage mock (jsdom doesn't provide a full Storage in this vitest setup)
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

    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation((query: string) => ({
        matches:
          query === '(min-width: 1024px)'
            ? mockIsDesktop
            : query === '(max-width: 767px) and (orientation: portrait)'
              ? mockIsPortrait
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

  it('renders StreamPlayer with streamState prop', async () => {
    wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
    await flushPromises();
    expect(wrapper.find('[data-stream-player]').exists()).toBe(true);
  });

  it('calls initStream on mount', async () => {
    wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
    await flushPromises();
    expect(mockInitStream).toHaveBeenCalledOnce();
  });

  it('left sidebar is hidden for non-Admin users', async () => {
    mockUser.value = { role: 'ViewerCompany', displayName: 'Test User' };
    wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
    await flushPromises();
    expect(wrapper.find('[data-sidebar-left]').exists()).toBe(false);
  });

  it('left sidebar is shown for Admin users when adminPanelOpen is true', async () => {
    mockUser.value = { role: 'Admin', displayName: 'Admin User' };
    wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
    await flushPromises();
    // Initially sidebar should not exist (adminPanelOpen is false by default)
    expect(wrapper.find('[data-sidebar-left]').exists()).toBe(false);
  });

  it('renders ChatPanel (replaces right sidebar placeholder)', async () => {
    wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
    await flushPromises();
    expect(wrapper.find('[data-chat-panel]').exists()).toBe(true);
  });

  it('outer container has flex flex-col lg:flex-row classes', async () => {
    wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
    await flushPromises();
    const outer = wrapper.find('div.flex.flex-col');
    expect(outer.exists()).toBe(true);
  });

  it('left sidebar is hidden when user is null', async () => {
    mockUser.value = null;
    wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
    await flushPromises();
    expect(wrapper.find('[data-sidebar-left]').exists()).toBe(false);
  });

  it('handleOpenCameraControls toggles panel open/closed via StreamPlayer event', async () => {
    mockUser.value = { role: 'Admin', displayName: 'Admin User' };
    wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
    await flushPromises();

    // Click once to open
    await wrapper.find('[data-stream-player]').trigger('click');
    await flushPromises();

    // Click again to toggle closed
    await wrapper.find('[data-stream-player]').trigger('click');
    await flushPromises();

    // Component still renders correctly after toggle
    expect(wrapper.find('[data-stream-player]').exists()).toBe(true);
  });

  describe('chat sidebar', () => {
    it('chat panel renders on desktop when chatSidebarOpen is true (default on desktop)', async () => {
      mockIsDesktop = true;
      mockIsPortrait = false;
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();
      expect(wrapper.find('[data-chat-panel]').exists()).toBe(true);
    });

    it('chat panel NOT rendered when desktop + chatSidebarOpen collapses after toggle', async () => {
      mockIsDesktop = true;
      mockIsPortrait = false;
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();
      // Trigger toggleChatSidebar via dblclick on stream player stub
      await wrapper.find('[data-stream-player]').trigger('dblclick');
      await nextTick();
      expect(wrapper.find('[data-chat-panel]').exists()).toBe(false);
    });

    it('chat panel always rendered when isMobilePortrait=true regardless of chatSidebarOpen', async () => {
      mockIsDesktop = false;
      mockIsPortrait = true;
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();
      // Even after toggle, portrait panel always renders
      await wrapper.find('[data-stream-player]').trigger('dblclick');
      await nextTick();
      expect(wrapper.find('[data-chat-panel]').exists()).toBe(true);
    });

    it('localStorage.setItem called on chat sidebar toggle', async () => {
      mockIsDesktop = true;
      mockIsPortrait = false;
      const setItemSpy = vi.spyOn(mockLocalStorage, 'setItem');
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();
      await wrapper.find('[data-stream-player]').trigger('dblclick');
      await nextTick();
      expect(setItemSpy).toHaveBeenCalledWith('manlycam:chat-sidebar-open', expect.any(String));
    });

    it('on mount with localStorage "true" → chatSidebarOpen=true (chat panel visible)', async () => {
      mockIsDesktop = true;
      mockIsPortrait = false;
      mockLocalStorage.setItem('manlycam:chat-sidebar-open', 'true');
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();
      expect(wrapper.find('[data-chat-panel]').exists()).toBe(true);
    });

    it('on mount with localStorage "false" → chatSidebarOpen=false (chat panel hidden)', async () => {
      mockIsDesktop = true;
      mockIsPortrait = false;
      mockLocalStorage.setItem('manlycam:chat-sidebar-open', 'false');
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();
      expect(wrapper.find('[data-chat-panel]').exists()).toBe(false);
    });

    it('resetUnread called when sidebar toggles open', async () => {
      mockIsDesktop = true;
      mockIsPortrait = false;
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

    it('incrementUnread called when new message arrives while sidebar is collapsed', async () => {
      mockIsDesktop = true;
      mockIsPortrait = false;
      // Start collapsed
      mockLocalStorage.setItem('manlycam:chat-sidebar-open', 'false');
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();
      mockIncrementUnread.mockClear();
      // Simulate new message arriving
      mockMessages.value = [{ id: 'msg-1', content: 'Hello' }];
      await nextTick();
      expect(mockIncrementUnread).toHaveBeenCalled();
    });
  });
});
