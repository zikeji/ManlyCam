import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import StreamPlayer from './StreamPlayer.vue';

// Module-level mock instances so the component and test share the same references
const mockStartWhep = vi.fn().mockResolvedValue(undefined);
const mockStopWhep = vi.fn().mockResolvedValue(undefined);
const mockIsHealthy = ref(true); // healthy by default
const mockClientFrozen = ref(false); // not frozen by default — overlay only shows when true

vi.mock('@/composables/useWhep', () => ({
  useWhep: () => ({
    startWhep: mockStartWhep,
    stopWhep: mockStopWhep,
    isHealthy: mockIsHealthy,
    clientFrozen: mockClientFrozen,
  }),
}));

describe('StreamPlayer', () => {
  let wrapper: VueWrapper<InstanceType<typeof StreamPlayer>> | null;

  beforeEach(() => {
    import.meta.env.VITE_PET_NAME = 'Buddy';
  });

  afterEach(() => {
    mockStartWhep.mockClear();
    mockStopWhep.mockClear();
    mockIsHealthy.value = true; // reset to healthy for next test
    mockClientFrozen.value = false; // reset to not frozen for next test
    if (wrapper) {
      wrapper.unmount();
      wrapper = null;
    }
  });

  it('renders Skeleton when state is connecting', () => {
    wrapper = mount(StreamPlayer, { props: { streamState: 'connecting' } });
    expect(wrapper.find('[data-skeleton]').exists()).toBe(true);
  });

  it('does NOT render Skeleton when state is live', () => {
    wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
    expect(wrapper.find('[data-skeleton]').exists()).toBe(false);
  });

  it('renders video element with role="img" and aria-label', () => {
    wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
    const video = wrapper.find('video');
    expect(video.exists()).toBe(true);
    expect(video.attributes('role')).toBe('img');
    expect(video.attributes('aria-label')).toContain('Buddy');
  });

  it('renders StateOverlay with variant="unreachable" when unreachable', () => {
    wrapper = mount(StreamPlayer, { props: { streamState: 'unreachable' } });
    const overlay = wrapper.findComponent({ name: 'StateOverlay' });
    expect(overlay.exists()).toBe(true);
    expect(overlay.props('variant')).toBe('unreachable');
  });

  it('renders StateOverlay with variant="explicit-offline" when explicit-offline', () => {
    wrapper = mount(StreamPlayer, { props: { streamState: 'explicit-offline' } });
    const overlay = wrapper.findComponent({ name: 'StateOverlay' });
    expect(overlay.exists()).toBe(true);
    expect(overlay.props('variant')).toBe('explicit-offline');
  });

  it('does NOT render StateOverlay when connecting or live (healthy)', () => {
    for (const state of ['connecting', 'live'] as const) {
      wrapper = mount(StreamPlayer, { props: { streamState: state } });
      const overlay = wrapper.findComponent({ name: 'StateOverlay' });
      expect(overlay.exists()).toBe(false);
      wrapper.unmount();
      wrapper = null;
    }
  });

  it('shows spinner overlay when live but not yet healthy (initial connect)', async () => {
    mockIsHealthy.value = false;
    wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-client-overlay]').exists()).toBe(true);
    expect(wrapper.find('p').exists()).toBe(false); // no text on initial connect
  });

  it('shows spinner overlay with "Reconnecting..." text when live and clientFrozen', async () => {
    mockIsHealthy.value = false;
    mockClientFrozen.value = true;
    wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-client-overlay]').exists()).toBe(true);
    expect(wrapper.find('p').text()).toBe('Reconnecting...');
  });

  it('does NOT show spinner overlay when live and healthy', () => {
    mockIsHealthy.value = true;
    wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
    expect(wrapper.find('[data-client-overlay]').exists()).toBe(false);
  });

  it('keeps unreachable StateOverlay when transitioning from unreachable to live while not healthy', async () => {
    mockIsHealthy.value = false;
    wrapper = mount(StreamPlayer, { props: { streamState: 'unreachable' } });
    await wrapper.setProps({ streamState: 'live' });
    await flushPromises();
    // Server overlay stays, spinner does NOT show
    const overlay = wrapper.findComponent({ name: 'StateOverlay' });
    expect(overlay.exists()).toBe(true);
    expect(overlay.props('variant')).toBe('unreachable');
    expect(wrapper.find('[data-client-overlay]').exists()).toBe(false);
  });

  it('clears server overlay once healthy after offline→live transition', async () => {
    mockIsHealthy.value = false;
    wrapper = mount(StreamPlayer, { props: { streamState: 'unreachable' } });
    await wrapper.setProps({ streamState: 'live' });
    await flushPromises();
    mockIsHealthy.value = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent({ name: 'StateOverlay' }).exists()).toBe(false);
    expect(wrapper.find('[data-client-overlay]').exists()).toBe(false);
  });

  it('calls startWhep when streamState transitions to live', async () => {
    wrapper = mount(StreamPlayer, { props: { streamState: 'connecting' } });
    await wrapper.setProps({ streamState: 'live' });
    await flushPromises();
    expect(mockStartWhep).toHaveBeenCalled();
  });

  it('calls startWhep when mounted with streamState already live (remount after layout change)', async () => {
    // When the component remounts with streamState already 'live' (e.g. portrait↔landscape),
    // the immediate watch fires before videoRef is populated. nextTick ensures it still connects.
    wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
    await flushPromises();
    expect(mockStartWhep).toHaveBeenCalled();
  });

  it('calls stopWhep when streamState leaves live', async () => {
    wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
    await flushPromises();
    mockStopWhep.mockClear(); // clear the call from immediate watch
    await wrapper.setProps({ streamState: 'unreachable' });
    await flushPromises();
    expect(mockStopWhep).toHaveBeenCalled();
  });

  it('container has w-full and overflow-hidden', () => {
    wrapper = mount(StreamPlayer, { props: { streamState: 'connecting' } });
    const container = wrapper.find('[data-stream-container]');
    expect(container.exists()).toBe(true);
    expect(container.classes()).toContain('w-full');
    expect(container.classes()).toContain('overflow-hidden');
  });

  it('handles startWhep error gracefully without crashing', async () => {
    mockStartWhep.mockRejectedValueOnce(new Error('WHEP POST failed: 500'));
    wrapper = mount(StreamPlayer, { props: { streamState: 'connecting' } });
    await wrapper.setProps({ streamState: 'live' });
    await flushPromises();
    expect(wrapper.exists()).toBe(true);
  });

  it('calls stopWhep on unmount', async () => {
    wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
    await flushPromises();
    wrapper.unmount();
    expect(mockStopWhep).toHaveBeenCalled();
  });

  it('exposes videoRef via defineExpose', () => {
    wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
    expect(wrapper.vm.videoRef).toBeDefined();
    expect(wrapper.vm.videoRef).toBeInstanceOf(HTMLVideoElement);
  });

  describe('admin preview mode', () => {
    it('does NOT start WHEP when explicit-offline without adminPreview', () => {
      wrapper = mount(StreamPlayer, { props: { streamState: 'explicit-offline' } });
      expect(mockStartWhep).not.toHaveBeenCalled();
    });

    it('starts WHEP when explicit-offline with adminPreview=true', async () => {
      wrapper = mount(StreamPlayer, {
        props: { streamState: 'explicit-offline', adminPreview: true },
      });
      await flushPromises();
      expect(mockStartWhep).toHaveBeenCalled();
    });

    it('hides StateOverlay when adminPreview=true and state is explicit-offline', async () => {
      wrapper = mount(StreamPlayer, {
        props: { streamState: 'explicit-offline', adminPreview: true },
      });
      await flushPromises();
      expect(wrapper.findComponent({ name: 'StateOverlay' }).exists()).toBe(false);
    });

    it('shows PREVIEW badge when adminPreview=true and state is explicit-offline', async () => {
      wrapper = mount(StreamPlayer, {
        props: { streamState: 'explicit-offline', adminPreview: true },
      });
      await flushPromises();
      expect(wrapper.find('[data-preview-badge]').exists()).toBe(true);
    });

    it('does NOT show PREVIEW badge when adminPreview=false', () => {
      wrapper = mount(StreamPlayer, {
        props: { streamState: 'explicit-offline', adminPreview: false },
      });
      expect(wrapper.find('[data-preview-badge]').exists()).toBe(false);
    });

    it('passes showPreviewButton to StateOverlay', () => {
      wrapper = mount(StreamPlayer, {
        props: { streamState: 'explicit-offline', showPreviewButton: true },
      });
      const overlay = wrapper.findComponent({ name: 'StateOverlay' });
      expect(overlay.props('showPreviewButton')).toBe(true);
    });

    it('emits startPreview when StateOverlay preview button is clicked', async () => {
      wrapper = mount(StreamPlayer, {
        props: { streamState: 'explicit-offline', showPreviewButton: true },
      });
      await wrapper.find('[data-preview-button]').trigger('click');
      expect(wrapper.emitted('startPreview')).toBeTruthy();
    });

    it('stops WHEP when adminPreview transitions from true to false while explicit-offline', async () => {
      wrapper = mount(StreamPlayer, {
        props: { streamState: 'explicit-offline', adminPreview: true },
      });
      await flushPromises();
      mockStopWhep.mockClear();
      await wrapper.setProps({ adminPreview: false });
      await flushPromises();
      expect(mockStopWhep).toHaveBeenCalled();
    });
  });

  describe('landscape tap overlay', () => {
    it('landscape tap overlay visible after touch tap when showLandscapeTapToggle=true', async () => {
      wrapper = mount(StreamPlayer, {
        props: { streamState: 'live', showLandscapeTapToggle: true },
      });
      const container = wrapper.find('[data-stream-container]');

      // Before tap: opacity-0
      const toggleOverlay = wrapper.find('.absolute.inset-y-0.right-3');
      expect(toggleOverlay.classes()).toContain('opacity-0');

      // Tap with touch pointer
      await container.trigger('click', { pointerType: 'touch' });
      await wrapper.vm.$nextTick();

      // After tap: opacity-100
      expect(toggleOverlay.classes()).toContain('opacity-100');
    });

    it('landscape tap overlay NOT rendered when showLandscapeTapToggle=false', () => {
      wrapper = mount(StreamPlayer, {
        props: { streamState: 'live', showLandscapeTapToggle: false },
      });
      expect(wrapper.find('.absolute.inset-y-0.right-3').exists()).toBe(false);
    });

    it('tap-triggered overlay auto-hides after 3 seconds', async () => {
      vi.useFakeTimers();
      wrapper = mount(StreamPlayer, {
        props: { streamState: 'live', showLandscapeTapToggle: true },
      });
      const container = wrapper.find('[data-stream-container]');

      await container.trigger('click', { pointerType: 'touch' });
      await wrapper.vm.$nextTick();

      const toggleOverlay = wrapper.find('.absolute.inset-y-0.right-3');
      expect(toggleOverlay.classes()).toContain('opacity-100');

      vi.advanceTimersByTime(3000);
      await wrapper.vm.$nextTick();

      expect(toggleOverlay.classes()).toContain('opacity-0');
      vi.useRealTimers();
    });

    it('landscape chat toggle emits toggleChatSidebar', async () => {
      wrapper = mount(StreamPlayer, {
        props: { streamState: 'live', showLandscapeTapToggle: true },
      });

      const button = wrapper.find('button');
      await button.trigger('click');
      expect(wrapper.emitted('toggleChatSidebar')).toBeTruthy();
    });
  });
});
