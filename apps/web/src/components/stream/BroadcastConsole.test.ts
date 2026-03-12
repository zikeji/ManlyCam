import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';
import BroadcastConsole from './BroadcastConsole.vue';
import { Role } from '@manlycam/types';

const mockStartStream = vi.fn().mockResolvedValue(undefined);
const mockStopStream = vi.fn().mockResolvedValue(undefined);
const mockLogout = vi.fn().mockResolvedValue(undefined);

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    user: ref({ id: '1', displayName: 'Admin User', avatarUrl: '', role: Role.Admin }),
    logout: mockLogout,
    fetchCurrentUser: vi.fn(),
  }),
}));

vi.mock('@/composables/useAdminStream', () => ({
  useAdminStream: () => ({
    startStream: mockStartStream,
    stopStream: mockStopStream,
    isLoading: ref(false),
    error: ref(null),
  }),
}));

vi.mock('@/composables/usePresence', () => ({
  viewers: ref([{ id: '1', displayName: 'Alice' }, { id: '2', displayName: 'Bob' }]),
}));

// Mock ResizeObserver for Popover
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('BroadcastConsole', () => {
  let wrapper: VueWrapper<any> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount();
      wrapper = null;
    }
  });

  const mountConsole = (props = {}) => {
    wrapper = mount(BroadcastConsole, {
      props: {
        streamState: 'live',
        ...props,
      },
      global: {
        stubs: {
          StreamStatusBadge: true,
          Settings2: true,
          Play: true,
          Square: true,
          Camera: true,
          MessageSquare: true,
        },
      }
    });
    return wrapper;
  };

  it('renders left flank when isAdmin is true', () => {
    wrapper = mountConsole({ isAdmin: true });
    // Left flank buttons: Camera controls and Stream start/stop
    const buttons = wrapper.findAll('button');
    expect(buttons.length).toBeGreaterThan(3); // Left, right flank
    expect(wrapper.find('button[aria-label="Show camera controls"]').exists()).toBe(true);
    expect(wrapper.find('button[aria-label="Stop Stream"]').exists()).toBe(true);
  });

  it('hides left flank when isAdmin is false', () => {
    wrapper = mountConsole({ isAdmin: false });
    expect(wrapper.find('button[aria-label="Show camera controls"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Stop Stream"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Start Stream"]').exists()).toBe(false);
  });

  it('emits toggleAdminPanel when Camera Controls button is clicked', async () => {
    wrapper = mountConsole({ isAdmin: true });
    const settingsBtn = wrapper.find('button[aria-label="Show camera controls"]');
    await settingsBtn.trigger('click');
    expect(wrapper.emitted('toggleAdminPanel')).toBeTruthy();
  });

  it('calls useAdminStream stopStream when stream toggle clicked while live', async () => {
    wrapper = mountConsole({ isAdmin: true, streamState: 'live' });
    const toggleBtn = wrapper.find('button[aria-label="Stop Stream"]');
    await toggleBtn.trigger('click');
    expect(mockStopStream).toHaveBeenCalled();
  });

  it('calls useAdminStream startStream when stream toggle clicked while explicit-offline', async () => {
    wrapper = mountConsole({ isAdmin: true, streamState: 'explicit-offline' });
    const toggleBtn = wrapper.find('button[aria-label="Start Stream"]');
    await toggleBtn.trigger('click');
    expect(mockStartStream).toHaveBeenCalled();
  });

  it('renders StreamStatusBadge with correct state prop', () => {
    wrapper = mountConsole({ streamState: 'connecting' });
    const badge = wrapper.findComponent({ name: 'StreamStatusBadge' });
    expect(badge.exists()).toBe(true);
    expect(badge.props('state')).toBe('connecting');
  });

  it('displays correct viewer count', () => {
    wrapper = mountConsole();
    expect(wrapper.text()).toContain('2 viewers');
  });

  it('emits toggleChatSidebar when chat toggle button is clicked', async () => {
    wrapper = mountConsole();
    // Find message square icon parent button
    const chatBtn = wrapper.find('button[aria-label="Expand chat sidebar"]');
    await chatBtn.trigger('click');
    expect(wrapper.emitted('toggleChatSidebar')).toBeTruthy();
  });

  it('shows unread badge when !chatSidebarOpen && unreadCount > 0', () => {
    wrapper = mountConsole({ chatSidebarOpen: false, unreadCount: 5 });
    const badge = wrapper.find('.absolute.top-0.right-0');
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toBe('5');
  });

  it('hides unread badge when chatSidebarOpen is true', () => {
    wrapper = mountConsole({ chatSidebarOpen: true, unreadCount: 5 });
    const badge = wrapper.find('.absolute.top-0.right-0');
    expect(badge.exists()).toBe(false);
  });

  it('profile popover contains username but NO Start/Stop stream button', async () => {
    wrapper = mountConsole({ isAdmin: true, isDesktop: true });
    // Open popover
    const avatarBtn = wrapper.find('button[aria-label="Account menu"]');
    await avatarBtn.trigger('click');
    await flushPromises();

    // popover content is rendered in a portal by default in shadcn, 
    // but without document.body mocking it's usually inside wrapper or document
    const popoverContent = document.querySelector('[role="dialog"]') || wrapper.element;
    
    expect(popoverContent.textContent).toContain('Admin User');
    expect(popoverContent.textContent).not.toContain('Start Stream');
    expect(popoverContent.textContent).not.toContain('Stop Stream');
  });
});
