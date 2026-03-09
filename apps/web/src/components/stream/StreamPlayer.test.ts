import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent } from 'vue';
import StreamPlayer from './StreamPlayer.vue';

// Module-level mock instances so the component and test share the same references
const mockStartWhep = vi.fn().mockResolvedValue(undefined);
const mockStopWhep = vi.fn().mockResolvedValue(undefined);

vi.mock('@/composables/useWhep', () => ({
  useWhep: () => ({
    startWhep: mockStartWhep,
    stopWhep: mockStopWhep,
  }),
}));

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    user: { value: null },
    logout: vi.fn(),
    fetchCurrentUser: vi.fn(),
  }),
}));

vi.mock('./SidebarCollapseButton.vue', () => ({
  default: defineComponent({
    name: 'SidebarCollapseButton',
    props: ['isOpen', 'unreadCount'],
    emits: ['toggle'],
    template: '<button data-sidebar-collapse-button @click="$emit(\'toggle\')" />',
  }),
}));

describe('StreamPlayer', () => {
  beforeEach(() => {
    import.meta.env.VITE_PET_NAME = 'Buddy';
  });

  afterEach(() => {
    mockStartWhep.mockClear();
    mockStopWhep.mockClear();
  });

  it('renders Skeleton when state is connecting', () => {
    const wrapper = mount(StreamPlayer, { props: { streamState: 'connecting' } });
    expect(wrapper.find('[data-skeleton]').exists()).toBe(true);
  });

  it('does NOT render Skeleton when state is live', () => {
    const wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
    expect(wrapper.find('[data-skeleton]').exists()).toBe(false);
  });

  it('renders video element with role="img" and aria-label', () => {
    const wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
    const video = wrapper.find('video');
    expect(video.exists()).toBe(true);
    expect(video.attributes('role')).toBe('img');
    expect(video.attributes('aria-label')).toContain('Buddy');
  });

  it('renders StateOverlay with variant="unreachable" when unreachable', () => {
    const wrapper = mount(StreamPlayer, { props: { streamState: 'unreachable' } });
    const overlay = wrapper.findComponent({ name: 'StateOverlay' });
    expect(overlay.exists()).toBe(true);
    expect(overlay.props('variant')).toBe('unreachable');
  });

  it('renders StateOverlay with variant="explicit-offline" when explicit-offline', () => {
    const wrapper = mount(StreamPlayer, { props: { streamState: 'explicit-offline' } });
    const overlay = wrapper.findComponent({ name: 'StateOverlay' });
    expect(overlay.exists()).toBe(true);
    expect(overlay.props('variant')).toBe('explicit-offline');
  });

  it('does NOT render StateOverlay when connecting', () => {
    const wrapper = mount(StreamPlayer, { props: { streamState: 'connecting' } });
    const overlay = wrapper.findComponent({ name: 'StateOverlay' });
    expect(overlay.exists()).toBe(false);
  });

  it('does NOT render StateOverlay when live', () => {
    const wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
    const overlay = wrapper.findComponent({ name: 'StateOverlay' });
    expect(overlay.exists()).toBe(false);
  });

  it('renders StreamStatusBadge', () => {
    const wrapper = mount(StreamPlayer, { props: { streamState: 'connecting' } });
    const badge = wrapper.findComponent({ name: 'StreamStatusBadge' });
    expect(badge.exists()).toBe(true);
    expect(badge.props('state')).toBe('connecting');
  });

  it('calls startWhep when streamState transitions to live', async () => {
    const wrapper = mount(StreamPlayer, { props: { streamState: 'connecting' } });
    await wrapper.setProps({ streamState: 'live' });
    await flushPromises();
    expect(mockStartWhep).toHaveBeenCalled();
  });

  it('calls stopWhep when streamState leaves live', async () => {
    const wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
    await flushPromises();
    mockStopWhep.mockClear(); // clear the call from immediate watch
    await wrapper.setProps({ streamState: 'unreachable' });
    await flushPromises();
    expect(mockStopWhep).toHaveBeenCalled();
  });

  it('container uses 16:9 aspect ratio', () => {
    const wrapper = mount(StreamPlayer, { props: { streamState: 'connecting' } });
    const container = wrapper.find('[data-stream-container]');
    expect(container.exists()).toBe(true);
    expect(container.classes().join(' ')).toMatch(/aspect-video/);
  });

  it('badge container is NOT rendered for explicit-offline or unreachable (StateOverlay owns status UI)', () => {
    for (const state of ['explicit-offline', 'unreachable'] as const) {
      const wrapper = mount(StreamPlayer, { props: { streamState: state } });
      expect(wrapper.find('[data-badge-container]').exists()).toBe(false);
    }
  });

  it('badge container is rendered at top-4 for live and connecting', () => {
    for (const state of ['live', 'connecting'] as const) {
      const wrapper = mount(StreamPlayer, { props: { streamState: state } });
      const badgeContainer = wrapper.find('[data-badge-container]');
      expect(badgeContainer.exists()).toBe(true);
      expect(badgeContainer.classes()).toContain('top-4');
    }
  });

  it('handles startWhep error gracefully without crashing', async () => {
    mockStartWhep.mockRejectedValueOnce(new Error('WHEP POST failed: 500'));
    const wrapper = mount(StreamPlayer, { props: { streamState: 'connecting' } });
    // Transition to live — startWhep will reject
    await wrapper.setProps({ streamState: 'live' });
    await flushPromises();
    // Component should remain mounted and handle error gracefully
    expect(wrapper.exists()).toBe(true);
  });

  it('top gradient and badge container are hidden when live and not hovering', async () => {
    const wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
    const badgeContainer = wrapper.find('[data-badge-container]');
    // Initially not hovered, so overlay should be hidden
    expect(badgeContainer.classes()).toContain('opacity-0');
  });

  it('top gradient and badge container are visible when live and hovering', async () => {
    const wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
    const container = wrapper.find('[data-stream-container]');
    // Simulate hover
    await container.trigger('mouseenter');
    const badgeContainer = wrapper.find('[data-badge-container]');
    // Should show overlay on hover
    expect(badgeContainer.classes()).toContain('opacity-100');
  });

  it('calls stopWhep on unmount', async () => {
    const wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
    await flushPromises();
    wrapper.unmount();
    // stopWhep should be called on unmount
    expect(mockStopWhep).toHaveBeenCalled();
  });

  describe('chat sidebar toggle button', () => {
    it('SidebarCollapseButton rendered when showChatSidebarToggle=true', () => {
      const wrapper = mount(StreamPlayer, {
        props: {
          streamState: 'live',
          showChatSidebarToggle: true,
          chatSidebarOpen: true,
          unreadCount: 0,
        },
      });
      expect(wrapper.find('[data-sidebar-collapse-button]').exists()).toBe(true);
    });

    it('SidebarCollapseButton NOT rendered when showChatSidebarToggle=false', () => {
      const wrapper = mount(StreamPlayer, {
        props: {
          streamState: 'live',
          showChatSidebarToggle: false,
          chatSidebarOpen: true,
          unreadCount: 0,
        },
      });
      expect(wrapper.find('[data-sidebar-collapse-button]').exists()).toBe(false);
    });

    it('collapse button container has opacity-100 when unreadCount > 0 (badge-persist, no hover needed)', async () => {
      const wrapper = mount(StreamPlayer, {
        props: {
          streamState: 'live',
          showChatSidebarToggle: true,
          chatSidebarOpen: false,
          unreadCount: 3,
        },
      });
      // Find the div wrapping SidebarCollapseButton (has transition-opacity class)
      const toggleDiv = wrapper.find('.absolute.top-4.right-4');
      expect(toggleDiv.exists()).toBe(true);
      expect(toggleDiv.classes()).toContain('opacity-100');
    });

    it('emits toggleChatSidebar when SidebarCollapseButton emits toggle', async () => {
      const wrapper = mount(StreamPlayer, {
        props: {
          streamState: 'live',
          showChatSidebarToggle: true,
          chatSidebarOpen: true,
          unreadCount: 0,
        },
      });
      await wrapper.find('[data-sidebar-collapse-button]').trigger('click');
      expect(wrapper.emitted('toggleChatSidebar')).toBeTruthy();
    });
  });
});
