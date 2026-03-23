import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
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

const mockScale = ref(1);
const mockIsDragging = ref(false);
const mockIsResetting = ref(false);
const mockZoomTransform = ref('translate(0px, 0px) scale(1)');
const mockContainerRef = ref(null);

// Mock ClipEditor to avoid pulling in HLS dependencies
vi.mock('./ClipEditor.vue', () => ({
  default: {
    name: 'ClipEditor',
    template: '<div data-clip-editor><slot /></div>',
    props: ['segmentRange', 'streamState', 'open', 'hlsVideoEl'],
    emits: ['close'],
  },
}));

vi.mock('@/composables/useStreamZoom', () => ({
  useStreamZoom: () => ({
    containerRef: mockContainerRef,
    assignContainerRef: vi.fn(),
    scale: mockScale,
    isDragging: mockIsDragging,
    isResetting: mockIsResetting,
    zoomTransform: mockZoomTransform,
    resetZoom: vi.fn(),
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
    mockScale.value = 1;
    mockIsDragging.value = false;
    mockIsResetting.value = false;
    mockZoomTransform.value = 'translate(0px, 0px) scale(1)';
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

  it('renders WHEP video element with role="img" and aria-label', () => {
    wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
    const video = wrapper.find('[data-whep-video]');
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

  it('container uses flex-col layout', () => {
    wrapper = mount(StreamPlayer, { props: { streamState: 'connecting' } });
    const container = wrapper.find('[data-stream-container]');
    expect(container.classes()).toContain('flex');
    expect(container.classes()).toContain('flex-col');
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

    it('emits stopPreview when Stop Preview button is clicked', async () => {
      wrapper = mount(StreamPlayer, {
        props: { streamState: 'explicit-offline', adminPreview: true },
      });
      await flushPromises();
      await wrapper.find('[data-preview-badge]').trigger('click');
      expect(wrapper.emitted('stopPreview')).toBeTruthy();
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

    it('clears existing tapTimer when second tap arrives before first timer expires', async () => {
      vi.useFakeTimers();
      wrapper = mount(StreamPlayer, {
        props: { streamState: 'live', showLandscapeTapToggle: true },
      });
      const container = wrapper.find('[data-stream-container]');

      await container.trigger('click', { pointerType: 'touch' });
      vi.advanceTimersByTime(1500);
      await container.trigger('click', { pointerType: 'touch' });
      await wrapper.vm.$nextTick();

      const toggleOverlay = wrapper.find('.absolute.inset-y-0.right-3');
      expect(toggleOverlay.classes()).toContain('opacity-100');
      vi.useRealTimers();
    });

    it('aria-label includes unread count when unreadCount > 0', () => {
      wrapper = mount(StreamPlayer, {
        props: { streamState: 'live', showLandscapeTapToggle: true, unreadCount: 3 },
      });
      const btn = wrapper.find('button[aria-label]');
      expect(btn.attributes('aria-label')).toContain('3 unread');
    });
  });

  it('renders Stop Preview button when adminPreview is true and streamState is explicit-offline', () => {
    wrapper = mount(StreamPlayer, {
      props: { streamState: 'explicit-offline', adminPreview: true },
    });
    expect(wrapper.find('[data-preview-badge]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Stop Preview');
  });

  it('emits stopPreview when Stop Preview button is clicked', async () => {
    wrapper = mount(StreamPlayer, {
      props: { streamState: 'explicit-offline', adminPreview: true },
    });
    await wrapper.find('[data-preview-badge]').trigger('click');
    expect(wrapper.emitted('stopPreview')).toBeTruthy();
  });

  describe('zoom integration', () => {
    it('WHEP video element has non-empty transform style from useStreamZoom', async () => {
      mockZoomTransform.value = 'translate(10px, 20px) scale(2)';
      wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
      await flushPromises();
      const video = wrapper.find('[data-whep-video]');
      expect(video.attributes('style')).toContain('translate(10px, 20px) scale(2)');
    });

    it('container has cursor-grab class when scale > 1 and not dragging', () => {
      mockScale.value = 2;
      mockIsDragging.value = false;
      wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
      const container = wrapper.find('[data-stream-container]');
      expect(container.classes()).toContain('cursor-grab');
    });

    it('container has cursor-grabbing class when dragging', () => {
      mockScale.value = 2;
      mockIsDragging.value = true;
      wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
      const container = wrapper.find('[data-stream-container]');
      expect(container.classes()).toContain('cursor-grabbing');
    });

    it('WHEP video has transition style when isResetting is true', async () => {
      mockIsResetting.value = true;
      wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
      await nextTick();
      const video = wrapper.find('[data-whep-video]');
      expect(video.attributes('style')).toContain('transition: transform 0.3s ease-out');
    });

    it('WHEP video has no transition style when isResetting is false', async () => {
      mockIsResetting.value = false;
      wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
      await nextTick();
      const video = wrapper.find('[data-whep-video]');
      expect(video.attributes('style')).toContain('transition: none');
    });
  });

  describe('clip editor integration', () => {
    const mockSegmentRange = {
      earliest: '2026-03-22T10:00:00.000Z',
      latest: '2026-03-22T10:05:00.000Z',
      minDurationSeconds: 10,
      maxDurationSeconds: 120,
      streamStartedAt: '2026-03-22T09:55:00.000Z',
    };

    it('does not render ClipEditor initially (lazy-mount)', () => {
      wrapper = mount(StreamPlayer, { props: { streamState: 'live' } });
      expect(wrapper.findComponent({ name: 'ClipEditor' }).exists()).toBe(false);
    });

    it('renders ClipEditor once clipEditorOpen becomes true (lazy-mount)', async () => {
      wrapper = mount(StreamPlayer, {
        props: {
          streamState: 'live',
          clipEditorOpen: false,
          clipSegmentRange: mockSegmentRange,
        },
      });
      expect(wrapper.findComponent({ name: 'ClipEditor' }).exists()).toBe(false);

      // Trigger the watch that sets hasClipEditorBeenOpened
      await wrapper.setProps({ clipEditorOpen: true });
      await flushPromises();
      await nextTick();
      expect(wrapper.findComponent({ name: 'ClipEditor' }).exists()).toBe(true);
    });

    it('keeps ClipEditor in DOM after closing (lazy-mount keeps alive)', async () => {
      wrapper = mount(StreamPlayer, {
        props: {
          streamState: 'live',
          clipEditorOpen: false,
          clipSegmentRange: mockSegmentRange,
        },
      });
      // Open the editor (triggers watch → hasClipEditorBeenOpened = true)
      await wrapper.setProps({ clipEditorOpen: true });
      await flushPromises();
      expect(wrapper.findComponent({ name: 'ClipEditor' }).exists()).toBe(true);

      // Close the editor
      await wrapper.setProps({ clipEditorOpen: false });
      await flushPromises();
      // hasClipEditorBeenOpened stays true, so v-if keeps it in DOM
      const editor = wrapper.findComponent({ name: 'ClipEditor' });
      expect(editor.exists()).toBe(true);
      expect(editor.props('open')).toBe(false);
    });

    it('WHEP video stays visible when clip editor is open (HLS overlays at z-20)', async () => {
      wrapper = mount(StreamPlayer, {
        props: {
          streamState: 'live',
          clipEditorOpen: false,
          clipSegmentRange: mockSegmentRange,
        },
      });
      await wrapper.setProps({ clipEditorOpen: true });
      await nextTick();
      const video = wrapper.find('[data-whep-video]');
      expect(video.attributes('style')).not.toContain('visibility: hidden');
    });

    it('renders HLS video element when clip editor has been opened', async () => {
      wrapper = mount(StreamPlayer, {
        props: {
          streamState: 'live',
          clipEditorOpen: false,
          clipSegmentRange: mockSegmentRange,
        },
      });
      expect(wrapper.find('[data-hls-video]').exists()).toBe(false);

      await wrapper.setProps({ clipEditorOpen: true });
      await flushPromises();
      expect(wrapper.find('[data-hls-video]').exists()).toBe(true);
    });

    it('HLS video has no autoplay attribute', async () => {
      wrapper = mount(StreamPlayer, {
        props: {
          streamState: 'live',
          clipEditorOpen: false,
          clipSegmentRange: mockSegmentRange,
        },
      });
      await wrapper.setProps({ clipEditorOpen: true });
      await flushPromises();
      const hlsVideo = wrapper.find('[data-hls-video]');
      expect(hlsVideo.attributes('autoplay')).toBeUndefined();
    });

    it('controls wrapper uses max-height transition for slide animation', async () => {
      wrapper = mount(StreamPlayer, {
        props: {
          streamState: 'live',
          clipEditorOpen: false,
          clipSegmentRange: mockSegmentRange,
        },
      });
      // Find the max-height transition wrapper
      const transitionWrapper = wrapper.find('.overflow-hidden.transition-\\[max-height\\]');
      expect(transitionWrapper.exists()).toBe(true);
      // Closed: 0px
      expect(transitionWrapper.attributes('style')).toContain('max-height: 0px');

      await wrapper.setProps({ clipEditorOpen: true });
      await flushPromises();
      // Open: 600px
      expect(transitionWrapper.attributes('style')).toContain('max-height: 600px');
    });

    it('emits clip-editor-close when ClipEditor emits close', async () => {
      wrapper = mount(StreamPlayer, {
        props: {
          streamState: 'live',
          clipEditorOpen: false,
          clipSegmentRange: mockSegmentRange,
        },
      });
      // Open the editor first so it mounts
      await wrapper.setProps({ clipEditorOpen: true });
      await flushPromises();
      const editor = wrapper.findComponent({ name: 'ClipEditor' });
      expect(editor.exists()).toBe(true);
      editor.vm.$emit('close');
      await nextTick();
      expect(wrapper.emitted('clip-editor-close')).toBeTruthy();
    });

    it('passes hlsVideoEl prop to ClipEditor', async () => {
      wrapper = mount(StreamPlayer, {
        props: {
          streamState: 'live',
          clipEditorOpen: false,
          clipSegmentRange: mockSegmentRange,
        },
      });
      await wrapper.setProps({ clipEditorOpen: true });
      await flushPromises();
      const editor = wrapper.findComponent({ name: 'ClipEditor' });
      // hlsVideoEl should be the video element ref
      expect(editor.props('hlsVideoEl')).toBeInstanceOf(HTMLVideoElement);
    });
  });
});
