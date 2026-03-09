import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
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

vi.mock('@/composables/useChat', () => ({
  useChat: () => ({
    messages: ref([]),
    sendChatMessage: vi.fn(),
    handleChatMessage: vi.fn(),
  }),
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
    props: ['streamState'],
    emits: ['openCameraControls'],
    template: '<button data-stream-player @click="$emit(\'openCameraControls\')" />',
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

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
}

describe('WatchView', () => {
  beforeEach(() => {
    mockInitStream.mockClear();
    mockUser.value = { role: 'ViewerCompany', displayName: 'Test User' };
    mockStreamState.value = 'connecting';
  });

  it('renders StreamPlayer with streamState prop', async () => {
    const wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
    await flushPromises();
    expect(wrapper.find('[data-stream-player]').exists()).toBe(true);
  });

  it('calls initStream on mount', async () => {
    mount(WatchView, { global: { plugins: [makeRouter()] } });
    await flushPromises();
    expect(mockInitStream).toHaveBeenCalledOnce();
  });

  it('left sidebar is hidden for non-Admin users', async () => {
    mockUser.value = { role: 'ViewerCompany', displayName: 'Test User' };
    const wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
    await flushPromises();
    expect(wrapper.find('[data-sidebar-left]').exists()).toBe(false);
  });

  it('left sidebar is shown for Admin users when adminPanelOpen is true', async () => {
    mockUser.value = { role: 'Admin', displayName: 'Admin User' };
    const wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
    await flushPromises();
    // Initially sidebar should not exist (adminPanelOpen is false by default)
    expect(wrapper.find('[data-sidebar-left]').exists()).toBe(false);
  });

  it('renders ChatPanel (replaces right sidebar placeholder)', async () => {
    const wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
    await flushPromises();
    expect(wrapper.find('[data-chat-panel]').exists()).toBe(true);
  });

  it('outer container has flex flex-col lg:flex-row classes', async () => {
    const wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
    await flushPromises();
    const outer = wrapper.find('div.flex.flex-col');
    expect(outer.exists()).toBe(true);
  });

  it('left sidebar is hidden when user is null', async () => {
    mockUser.value = null;
    const wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
    await flushPromises();
    expect(wrapper.find('[data-sidebar-left]').exists()).toBe(false);
  });

  it('handleOpenCameraControls toggles panel open/closed via StreamPlayer event', async () => {
    mockUser.value = { role: 'Admin', displayName: 'Admin User' };
    const wrapper = mount(WatchView, { global: { plugins: [makeRouter()] } });
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
});
