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
const mockPiReachableWhileOffline = ref(false);

vi.mock('@/composables/useStream', () => ({
  useStream: () => ({
    streamState: mockStreamState,
    piReachableWhileOffline: mockPiReachableWhileOffline,
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
  mockCollapse,
  mockExpand,
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
    mockCollapse: vi.fn(),
    mockExpand: vi.fn(),
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

vi.mock('reka-ui', () => ({
  SplitterGroup: {
    name: 'SplitterGroup',
    props: ['direction', 'autoSaveId'],
    template: '<div data-splitter-group><slot /></div>',
  },
  SplitterPanel: {
    name: 'SplitterPanel',
    props: ['sizeUnit', 'defaultSize', 'minSize', 'maxSize', 'collapsible', 'collapsedSize'],
    emits: ['collapse', 'expand'],
    methods: {
      collapse() {
        mockCollapse();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this as any).$emit('collapse');
      },
      expand() {
        mockExpand();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this as any).$emit('expand');
      },
    },
    template: '<div data-splitter-panel><slot /></div>',
  },
  SplitterResizeHandle: {
    name: 'SplitterResizeHandle',
    template: '<div data-splitter-resize-handle />',
  },
}));

vi.mock('@/components/stream/StreamPlayer.vue', () => ({
  default: {
    name: 'StreamPlayer',
    props: [
      'streamState',
      'chatSidebarOpen',
      'unreadCount',
      'showLandscapeTapToggle',
      'showPreviewButton',
      'adminPreview',
    ],
    emits: ['toggleChatSidebar', 'startPreview', 'stopPreview'],
    template:
      '<button data-stream-player @dblclick="$emit(\'toggleChatSidebar\')" @click="$emit(\'startPreview\')" @contextmenu="$emit(\'stopPreview\')" />',
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

vi.mock('@/components/ui/sheet', () => ({
  Sheet: {
    name: 'Sheet',
    props: ['open'],
    emits: ['update:open'],
    template: '<div data-sheet />',
  },
  SheetContent: {
    name: 'SheetContent',
    props: ['side'],
    template: '<div data-sheet-content />',
  },
}));

vi.mock('@/components/admin/CameraControlsPanel.vue', () => ({
  default: {
    name: 'CameraControlsPanel',
    props: ['showClose', 'previewActive'],
    emits: ['close'],
    template: '<div data-camera-controls-panel />',
  },
}));

vi.mock('@/components/admin/AdminDialog.vue', () => ({
  default: {
    name: 'AdminDialog',
    props: ['open'],
    emits: ['update:open'],
    template: '<div data-admin-dialog />',
  },
}));

let mockIsDesktop = true;
let mockIsPortrait = false;

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
    mockPiReachableWhileOffline.value = false;
    mockMessages.value = [];
    mockUnreadCount.value = 0;
    mockResetUnread.mockClear();
    mockCollapse.mockClear();
    mockExpand.mockClear();
    mockIsDesktop = true;
    mockIsPortrait = false;

    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(min-width: 1024px)' ? mockIsDesktop : false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
      writable: true,
      configurable: true,
    });

    // Orientation now derives from screen.width/height (keyboard-safe).
    // Use getters so the value is read after suite-level beforeEach overrides the flags.
    Object.defineProperty(screen, 'width', {
      get: () => (mockIsPortrait ? 400 : 800),
      configurable: true,
    });
    Object.defineProperty(screen, 'height', {
      get: () => (mockIsPortrait ? 800 : 400),
      configurable: true,
    });
    Object.defineProperty(screen, 'orientation', {
      value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
      writable: true,
      configurable: true,
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
    });

    it('renders SplitterGroup on desktop', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      expect(wrapper.find('[data-splitter-group]').exists()).toBe(true);
    });

    it('SplitterGroup has auto-save-id="manly-chat-sidebar"', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      const splitterGroup = wrapper.findComponent({ name: 'SplitterGroup' });
      expect(splitterGroup.props('autoSaveId')).toBe('manly-chat-sidebar');
    });

    it('does NOT render main element on desktop', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      expect(wrapper.find('main').exists()).toBe(false);
    });

    it('renders content area with absolute AtmosphericVoid inside relative centered flex container', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      const splitterGroup = wrapper.find('[data-splitter-group]');
      const contentArea = splitterGroup.find('div.relative.flex.items-center.justify-center');
      expect(contentArea.exists()).toBe(true);

      const voidComp = contentArea.find('[data-atmospheric-void]');
      expect(voidComp.exists()).toBe(true);
      expect(voidComp.classes()).toContain('absolute');
      expect(voidComp.classes()).toContain('inset-0');
    });

    it('renders BroadcastConsole in desktop splitter layout', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      const splitterGroup = wrapper.find('[data-splitter-group]');
      expect(splitterGroup.find('[data-broadcast-console]').exists()).toBe(true);
    });

    it('renders SplitterResizeHandle between panels', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      expect(wrapper.find('[data-splitter-resize-handle]').exists()).toBe(true);
    });
  });

  describe('Mobile Portrait Layout', () => {
    beforeEach(() => {
      mockIsDesktop = false;
      mockIsPortrait = true;
    });

    it('does NOT render SplitterGroup on mobile portrait', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      expect(wrapper.find('[data-splitter-group]').exists()).toBe(false);
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
    });

    it('does NOT render SplitterGroup on mobile landscape', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      expect(wrapper.find('[data-splitter-group]').exists()).toBe(false);
    });

    it('renders AtmosphericVoid for letterbox fill', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();
      expect(wrapper.find('[data-atmospheric-void]').exists()).toBe(true);
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

  describe('Admin preview', () => {
    beforeEach(() => {
      mockIsDesktop = true;
      mockIsPortrait = false;
      mockUser.value = { role: 'Admin', displayName: 'Admin User' };
    });

    it('passes showPreviewButton=true to StreamPlayer when admin and piReachableWhileOffline', async () => {
      mockStreamState.value = 'explicit-offline';
      mockPiReachableWhileOffline.value = true;
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      const streamPlayer = wrapper.findComponent({ name: 'StreamPlayer' });
      expect(streamPlayer.props('showPreviewButton')).toBe(true);
    });

    it('passes showPreviewButton=false when piReachableWhileOffline=false', async () => {
      mockStreamState.value = 'explicit-offline';
      mockPiReachableWhileOffline.value = false;
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      const streamPlayer = wrapper.findComponent({ name: 'StreamPlayer' });
      expect(streamPlayer.props('showPreviewButton')).toBe(false);
    });

    it('passes showPreviewButton=false to non-admin user even when piReachableWhileOffline', async () => {
      mockUser.value = { role: 'ViewerCompany', displayName: 'Viewer' };
      mockStreamState.value = 'explicit-offline';
      mockPiReachableWhileOffline.value = true;
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      const streamPlayer = wrapper.findComponent({ name: 'StreamPlayer' });
      expect(streamPlayer.props('showPreviewButton')).toBe(false);
    });

    it('sets adminPreview=true when startPreview is emitted', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      const streamPlayer = wrapper.findComponent({ name: 'StreamPlayer' });
      expect(streamPlayer.props('adminPreview')).toBe(false);

      await wrapper.find('[data-stream-player]').trigger('click');
      await nextTick();

      expect(streamPlayer.props('adminPreview')).toBe(true);
    });

    it('resets adminPreview when stopPreview is emitted', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      // Start preview
      await wrapper.find('[data-stream-player]').trigger('click');
      await nextTick();
      const streamPlayer = wrapper.findComponent({ name: 'StreamPlayer' });
      expect(streamPlayer.props('adminPreview')).toBe(true);

      // Stop preview via contextmenu (mapped to stopPreview in mock)
      await wrapper.find('[data-stream-player]').trigger('contextmenu');
      await nextTick();
      expect(streamPlayer.props('adminPreview')).toBe(false);
    });

    it('passes previewActive=true to CameraControlsPanel when adminPreviewActive is true', async () => {
      // Open admin panel so the aside renders
      mockLocalStorage.setItem('manlycam:controls-panel-open', 'true');
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      // Start preview
      await wrapper.find('[data-stream-player]').trigger('click');
      await nextTick();

      const controlsPanel = wrapper.findComponent({ name: 'CameraControlsPanel' });
      expect(controlsPanel.props('previewActive')).toBe(true);
    });

    it('passes previewActive=false to CameraControlsPanel by default', async () => {
      // Open admin panel so the aside renders
      mockLocalStorage.setItem('manlycam:controls-panel-open', 'true');
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      const controlsPanel = wrapper.findComponent({ name: 'CameraControlsPanel' });
      expect(controlsPanel.props('previewActive')).toBe(false);
    });

    it('resets adminPreview when streamState changes away from explicit-offline', async () => {
      mockStreamState.value = 'explicit-offline';
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      // Start preview
      await wrapper.find('[data-stream-player]').trigger('click');
      await nextTick();
      const streamPlayer = wrapper.findComponent({ name: 'StreamPlayer' });
      expect(streamPlayer.props('adminPreview')).toBe(true);

      // Stream goes live — adminPreview should reset
      mockStreamState.value = 'live';
      await nextTick();
      expect(streamPlayer.props('adminPreview')).toBe(false);
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
      // Expand (toggle to open) — on desktop, calls chatPanelRef.expand() which emits @expand
      await wrapper.find('[data-stream-player]').trigger('dblclick');
      await nextTick();
      expect(mockResetUnread).toHaveBeenCalled();
    });
  });

  describe('Desktop Splitter collapse/expand', () => {
    beforeEach(() => {
      mockIsDesktop = true;
      mockIsPortrait = false;
    });

    it('calls collapse() on SplitterPanel when sidebar is open and toggle triggered', async () => {
      mockLocalStorage.setItem('manlycam:chat-sidebar-open', 'true');
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();
      mockCollapse.mockClear();

      await wrapper.find('[data-stream-player]').trigger('dblclick');
      await nextTick();

      expect(mockCollapse).toHaveBeenCalled();
    });

    it('calls expand() on SplitterPanel when sidebar is collapsed and toggle triggered', async () => {
      mockLocalStorage.setItem('manlycam:chat-sidebar-open', 'false');
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();
      mockExpand.mockClear();

      await wrapper.find('[data-stream-player]').trigger('dblclick');
      await nextTick();

      expect(mockExpand).toHaveBeenCalled();
    });

    it('clears existing splitterAnimateTimer when toggled rapidly', async () => {
      vi.useFakeTimers();
      mockLocalStorage.setItem('manlycam:chat-sidebar-open', 'true');
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      const streamPlayer = wrapper.findComponent({ name: 'StreamPlayer' });
      await streamPlayer.vm.$emit('toggleChatSidebar');

      await streamPlayer.vm.$emit('toggleChatSidebar');

      vi.runAllTimers();
      vi.useRealTimers();
      expect(
        (wrapper.vm as ComponentPublicInstance & { splitterAnimating: boolean }).splitterAnimating,
      ).toBe(false);
    });
  });

  describe('Mobile Chat sidebar toggling', () => {
    it('toggles chatSidebarOpen directly on mobile when toggle triggered', async () => {
      mockIsDesktop = false;
      mockLocalStorage.setItem('manlycam:chat-sidebar-open', 'true');
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      const streamPlayer = wrapper.findComponent({ name: 'StreamPlayer' });
      await streamPlayer.vm.$emit('toggleChatSidebar');
      await nextTick();

      expect(
        (wrapper.vm as ComponentPublicInstance & { chatSidebarOpen: boolean }).chatSidebarOpen,
      ).toBe(false);
    });
  });

  describe('Controls Panel toggling', () => {
    beforeEach(() => {
      mockIsDesktop = true;
      mockIsPortrait = false;
      mockUser.value = { role: 'Admin', displayName: 'Admin User' };
    });

    it('toggles controlsPanelOpen when BroadcastConsole emits toggleControlsPanel', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      const console = wrapper.findComponent({ name: 'BroadcastConsole' });
      await console.vm.$emit('toggleControlsPanel');
      await nextTick();

      expect(
        (wrapper.vm as ComponentPublicInstance & { controlsPanelOpen: boolean }).controlsPanelOpen,
      ).toBe(true);
    });

    it('toggles controlsPanelOpen when ChatPanel emits openCameraControls', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      const chatPanel = wrapper.findComponent({ name: 'ChatPanel' });
      await chatPanel.vm.$emit('openCameraControls');
      await nextTick();

      expect(
        (wrapper.vm as ComponentPublicInstance & { controlsPanelOpen: boolean }).controlsPanelOpen,
      ).toBe(true);
    });
  });

  describe('Orientation listener', () => {
    it('adds event listener to screen.orientation if available', async () => {
      const addEventListenerSpy = vi.fn();
      Object.defineProperty(screen, 'orientation', {
        value: { addEventListener: addEventListenerSpy, removeEventListener: vi.fn() },
        writable: true,
        configurable: true,
      });

      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      expect(addEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
    });
  });

  describe('localStorage error handling', () => {
    it('silently catches errors when accessing localStorage on mount', async () => {
      const errorStorage = {
        getItem: () => {
          throw new Error('Access denied');
        },
        setItem: () => {},
        removeItem: () => {},
      };
      vi.stubGlobal('localStorage', errorStorage);

      expect(() => {
        wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      }).not.toThrow();
    });

    it('silently catches localStorage errors in controlsPanelOpen watcher', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      const throwingStorage = {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceeded');
        },
        removeItem: () => {},
      };
      vi.stubGlobal('localStorage', throwingStorage);

      const vm = wrapper.vm as ComponentPublicInstance & { controlsPanelOpen: boolean };
      expect(() => {
        vm.controlsPanelOpen = true;
      }).not.toThrow();
      await nextTick();
    });

    it('silently catches localStorage errors in chatSidebarOpen watcher', async () => {
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();

      const throwingStorage = {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceeded');
        },
        removeItem: () => {},
      };
      vi.stubGlobal('localStorage', throwingStorage);

      const vm = wrapper.vm as ComponentPublicInstance & { chatSidebarOpen: boolean };
      expect(() => {
        vm.chatSidebarOpen = false;
      }).not.toThrow();
      await nextTick();
    });
  });

  describe('messages watcher — unread increment', () => {
    it('calls incrementUnread when a new message arrives and chat sidebar is closed', async () => {
      mockIsDesktop = true;
      mockLocalStorage.setItem('manlycam:chat-sidebar-open', 'false');
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();
      mockIncrementUnread.mockClear();

      mockMessages.value = [{ id: 'msg-1', content: 'hello', createdAt: new Date().toISOString() }];
      await nextTick();

      expect(mockIncrementUnread).toHaveBeenCalled();
    });

    it('does NOT call incrementUnread when chat sidebar is open', async () => {
      mockIsDesktop = true;
      mockLocalStorage.setItem('manlycam:chat-sidebar-open', 'true');
      wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
      await flushPromises();
      mockIncrementUnread.mockClear();

      mockMessages.value = [{ id: 'msg-2', content: 'world', createdAt: new Date().toISOString() }];
      await nextTick();

      expect(mockIncrementUnread).not.toHaveBeenCalled();
    });
  });
});
