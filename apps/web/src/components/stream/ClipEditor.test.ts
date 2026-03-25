import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { ref, nextTick } from 'vue';
import ClipEditor from './ClipEditor.vue';

// Mock hls.js (through useHlsPlayer composable)
const mockInitHls = vi.fn();
const mockDestroyHls = vi.fn();
const mockSeekTo = vi.fn();
const mockHlsPlay = vi.fn();
const mockHlsPause = vi.fn();
const hlsReady = ref(false);
const hlsError = ref<string | null>(null);
const hlsCurrentTime = ref(0);
const programDateTimeMs = ref(0);

vi.mock('@/composables/useHlsPlayer', () => ({
  useHlsPlayer: () => ({
    isReady: hlsReady,
    error: hlsError,
    currentTime: hlsCurrentTime,
    duration: ref(300),
    programDateTimeMs,
    initHls: mockInitHls,
    destroy: mockDestroyHls,
    seekTo: mockSeekTo,
    play: mockHlsPlay,
    pause: mockHlsPause,
  }),
}));

// Mock useClipCreate composable
const mockFetchSegmentRange = vi.fn();
const mockSubmitClip = vi.fn();
const mockIsSubmitting = ref(false);

vi.mock('@/composables/useClipCreate', () => ({
  useClipCreate: () => ({
    isSubmitting: mockIsSubmitting,
    fetchSegmentRange: mockFetchSegmentRange,
    submitClip: mockSubmitClip,
  }),
}));

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const defaultSegmentRange = {
  earliest: '2026-03-22T10:00:00.000Z',
  latest: '2026-03-22T10:05:00.000Z',
  minDurationSeconds: 10,
  maxDurationSeconds: 120,
  streamStartedAt: '2026-03-22T09:55:00.000Z',
};

function createMockVideoEl(): HTMLVideoElement {
  return document.createElement('video');
}

describe('ClipEditor', () => {
  let wrapper: VueWrapper | null = null;

  const mountEditor = (propsOverrides = {}) => {
    wrapper = mount(ClipEditor, {
      props: {
        segmentRange: defaultSegmentRange,
        streamState: 'live' as const,
        open: true,
        hlsVideoEl: createMockVideoEl(),
        ...propsOverrides,
      },
      global: {
        stubs: {
          Videotape: true,
          Play: true,
          Pause: true,
          Loader2: true,
        },
      },
    });
    return wrapper;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    hlsReady.value = false;
    hlsError.value = null;
    hlsCurrentTime.value = 0;
    programDateTimeMs.value = 0;
    mockIsSubmitting.value = false;
  });

  afterEach(() => {
    vi.useRealTimers();
    if (wrapper) {
      wrapper.unmount();
      wrapper = null;
    }
  });

  it('renders with data-clip-editor attribute', () => {
    mountEditor();
    expect(wrapper!.find('[data-clip-editor]').exists()).toBe(true);
  });

  it('shows loading state when HLS is not ready', () => {
    hlsReady.value = false;
    hlsError.value = null;
    mountEditor();
    expect(wrapper!.text()).toContain('Loading clip preview');
  });

  it('shows error state when HLS has error', () => {
    hlsError.value = 'Network error — check your connection';
    mountEditor();
    expect(wrapper!.text()).toContain('Network error');
    expect(wrapper!.find('[role="alert"]').exists()).toBe(true);
  });

  it('shows Retry button when HLS has error', () => {
    hlsError.value = 'Playback error — try again';
    mountEditor();
    expect(wrapper!.text()).toContain('Retry');
  });

  it('shows stream offline warning banner when stream goes offline', async () => {
    mountEditor({ streamState: 'live' });
    await nextTick();
    // Transition from live to explicit-offline triggers the watcher
    await wrapper!.setProps({ streamState: 'explicit-offline' });
    await nextTick();
    expect(wrapper!.text()).toContain('Stream went offline');
  });

  it('does not render video element (video is now in StreamPlayer)', () => {
    mountEditor();
    expect(wrapper!.find('video').exists()).toBe(false);
  });

  describe('form', () => {
    it('renders name input, description textarea, and share switch', () => {
      mountEditor();
      expect(wrapper!.find('#clip-editor-name').exists()).toBe(true);
      expect(wrapper!.find('#clip-editor-desc').exists()).toBe(true);
      expect(wrapper!.find('#clip-editor-share').exists()).toBe(true);
    });

    it('shows name error when name exceeds 200 chars', async () => {
      mountEditor();
      const input = wrapper!.find('#clip-editor-name');
      await input.setValue('a'.repeat(201));
      expect(wrapper!.text()).toContain('200 characters or less');
    });

    it('shows description error when exceeding 500 chars', async () => {
      mountEditor();
      const textarea = wrapper!.find('#clip-editor-desc');
      await textarea.setValue('a'.repeat(501));
      expect(wrapper!.text()).toContain('500 characters or less');
    });
  });

  describe('presets', () => {
    it('renders preset buttons filtered by maxDurationSeconds', () => {
      mountEditor();
      const buttons = wrapper!.findAll('button').filter((b) => {
        const text = b.text();
        return text === '30s' || text === '1min' || text === '2min';
      });
      expect(buttons.length).toBe(3); // 30s, 1min, 2min all <= 120
    });

    it('filters out presets exceeding maxDurationSeconds', () => {
      mountEditor({
        segmentRange: { ...defaultSegmentRange, maxDurationSeconds: 45 },
      });
      const buttons = wrapper!.findAll('button').filter((b) => {
        const text = b.text();
        return text === '30s' || text === '1min' || text === '2min';
      });
      expect(buttons.length).toBe(1); // only 30s
    });

    it('applies preset when clicked', async () => {
      mountEditor();
      const btn30s = wrapper!.findAll('button').find((b) => b.text() === '30s');
      await btn30s?.trigger('click');
      // After clicking 30s preset, duration should be shown
      expect(wrapper!.text()).toContain('30s');
    });
  });

  describe('submit', () => {
    it('shows "Buffer too short to clip" when selection is below min duration', () => {
      mountEditor({
        segmentRange: {
          ...defaultSegmentRange,
          // Only 5 seconds available
          earliest: '2026-03-22T10:04:55.000Z',
          latest: '2026-03-22T10:05:00.000Z',
          minDurationSeconds: 10,
        },
      });
      expect(wrapper!.text()).toContain('Buffer too short to clip');
    });

    it('disables Create Clip button when name is empty', async () => {
      hlsReady.value = true;
      mountEditor();
      await nextTick();
      const createBtn = wrapper!.findAll('button').find((b) => b.text().includes('Create Clip'));
      expect(createBtn?.attributes('disabled')).toBeDefined();
    });

    it('submits clip with correct params', async () => {
      hlsReady.value = true;
      mockSubmitClip.mockResolvedValue({ id: 'clip-1', status: 'pending' });
      mountEditor();
      await nextTick();

      // Fill name
      await wrapper!.find('#clip-editor-name').setValue('Test Clip');
      await nextTick();

      const createBtn = wrapper!.findAll('button').find((b) => b.text().includes('Create Clip'));
      await createBtn?.trigger('click');
      await flushPromises();

      expect(mockSubmitClip).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Clip',
          shareToChat: false,
        }),
      );
    });

    it('emits close after successful submit', async () => {
      hlsReady.value = true;
      mockSubmitClip.mockResolvedValue({ id: 'clip-1', status: 'pending' });
      mountEditor();
      await nextTick();

      await wrapper!.find('#clip-editor-name').setValue('Test Clip');
      const createBtn = wrapper!.findAll('button').find((b) => b.text().includes('Create Clip'));
      await createBtn?.trigger('click');
      await flushPromises();

      expect(wrapper!.emitted('close')).toBeTruthy();
    });

    it('shows submit error when submitClip fails', async () => {
      hlsReady.value = true;
      mockSubmitClip.mockRejectedValue(new Error('Server error'));
      mountEditor();
      await nextTick();

      await wrapper!.find('#clip-editor-name').setValue('Test Clip');
      const createBtn = wrapper!.findAll('button').find((b) => b.text().includes('Create Clip'));
      await createBtn?.trigger('click');
      await flushPromises();

      expect(wrapper!.text()).toContain('Server error');
    });

    it('shows "Creating…" label when submitting', async () => {
      mockIsSubmitting.value = true;
      mountEditor();
      await nextTick();
      expect(wrapper!.text()).toContain('Creating');
    });
  });

  describe('cancel', () => {
    it('emits close when Cancel button is clicked', async () => {
      mountEditor();
      const cancelBtn = wrapper!.findAll('button').find((b) => b.text() === 'Cancel');
      await cancelBtn?.trigger('click');
      expect(wrapper!.emitted('close')).toBeTruthy();
    });
  });

  describe('keyboard accessibility', () => {
    it('renders handles with tabindex and role="slider"', () => {
      mountEditor();
      const handles = wrapper!.findAll('[role="slider"][tabindex="0"]');
      // Track + left handle + right handle = 3 (track also has role=slider)
      expect(handles.length).toBeGreaterThanOrEqual(2);
    });

    it('renders start handle with aria-label', () => {
      mountEditor();
      const startHandle = wrapper!.find('[aria-label="Selection start handle"]');
      expect(startHandle.exists()).toBe(true);
    });

    it('renders end handle with aria-label', () => {
      mountEditor();
      const endHandle = wrapper!.find('[aria-label="Selection end handle"]');
      expect(endHandle.exists()).toBe(true);
    });
  });

  describe('Go Live badge', () => {
    it('does not show Go Live badge initially (auto-advance on)', () => {
      mountEditor();
      // autoAdvance starts true, so Go Live should not appear
      expect(wrapper!.text()).not.toContain('Live');
    });

    it('shows Go Live badge after preset click (auto-advance off) and re-enables on click', async () => {
      mountEditor();
      // Click a preset to disable auto-advance
      const btn30s = wrapper!.findAll('button').find((b) => b.text() === '30s');
      await btn30s?.trigger('click');
      await nextTick();
      // Now Go Live badge should appear
      const liveBtn = wrapper!.findAll('button').find((b) => b.text().includes('Live'));
      expect(liveBtn?.exists()).toBe(true);
      // Click Go Live to re-enable auto-advance
      await liveBtn?.trigger('click');
      await nextTick();
      // Go Live badge should disappear
      const liveBtnAfter = wrapper!.findAll('button').find((b) => b.text().includes('Live'));
      expect(liveBtnAfter).toBeUndefined();
    });
  });

  describe('formatDuration', () => {
    it('shows duration in scrubber info bar', () => {
      mountEditor();
      // Default selection is last 30s of 5 min range
      expect(wrapper!.text()).toContain('30s');
    });
  });

  describe('play/pause toggle', () => {
    it('renders play button with aria-label', () => {
      mountEditor();
      const playBtn = wrapper!.find('[aria-label="Play clip preview"]');
      expect(playBtn.exists()).toBe(true);
    });

    it('play button is disabled when HLS is not ready', () => {
      hlsReady.value = false;
      mountEditor();
      const playBtn = wrapper!.find('[aria-label="Play clip preview"]');
      expect(playBtn.attributes('disabled')).toBeDefined();
    });
  });

  describe('hlsVideoEl prop', () => {
    it('accepts hlsVideoEl prop as null without error', () => {
      mountEditor({ hlsVideoEl: null });
      expect(wrapper!.find('[data-clip-editor]').exists()).toBe(true);
    });
  });

  describe('polling and selection clamping', () => {
    it('resets selection when stream advances past paused selection', async () => {
      mockFetchSegmentRange.mockResolvedValue({
        earliest: '2026-03-22T10:00:00.000Z',
        latest: '2026-03-22T10:05:00.000Z',
        minDurationSeconds: 10,
        maxDurationSeconds: 120,
        streamStartedAt: '2026-03-22T09:55:00.000Z',
      });

      mountEditor();
      await nextTick();
      await flushPromises();

      const btn30s = wrapper!.findAll('button').find((b) => b.text() === '30s');
      await btn30s?.trigger('click');
      await nextTick();

      mockFetchSegmentRange.mockResolvedValue({
        earliest: '2026-03-22T10:06:00.000Z',
        latest: '2026-03-22T10:11:00.000Z',
        minDurationSeconds: 10,
        maxDurationSeconds: 120,
        streamStartedAt: '2026-03-22T09:55:00.000Z',
      });

      vi.advanceTimersByTime(5000);
      await flushPromises();
      await nextTick();

      const startHandle = wrapper!.find('[aria-label="Selection start handle"]');
      const endHandle = wrapper!.find('[aria-label="Selection end handle"]');

      const startMs = Number(startHandle.attributes('aria-valuenow'));
      const endMs = Number(endHandle.attributes('aria-valuenow'));

      expect(endMs - startMs).toBe(30000);
      expect(endMs).toBe(new Date('2026-03-22T10:11:00.000Z').getTime());
    });
  });

  // isStreamTooNew is tested in useClipCreate.test.ts

  describe('spacebar play/pause (AC #5)', () => {
    it('Space key calls togglePlayback when component mounts with open=true (immediate watch regression)', async () => {
      // ClipEditor mounts via v-if with open=true already set in StreamPlayer.vue.
      // Without { immediate: true } on the watch, the listener is never added.
      mountEditor({ open: true });
      await nextTick();
      document.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }),
      );
      await nextTick();
      expect(mockHlsPlay).toHaveBeenCalled();
    });

    it('Space key calls togglePlayback (via hlsPlay) when editor is open and target is not input/textarea', async () => {
      // Mount closed first, then open — triggers watch which adds the listener
      mountEditor({ open: false });
      await wrapper!.setProps({ open: true });
      await nextTick();
      document.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }),
      );
      await nextTick();
      expect(mockHlsPlay).toHaveBeenCalled();
    });

    it('Space key does NOT call togglePlayback when target is INPUT', async () => {
      mountEditor({ open: false });
      await wrapper!.setProps({ open: true });
      await nextTick();
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }),
      );
      document.body.removeChild(input);
      await nextTick();
      expect(mockHlsPlay).not.toHaveBeenCalled();
    });

    it('Space key does NOT call togglePlayback when target is TEXTAREA', async () => {
      mountEditor({ open: false });
      await wrapper!.setProps({ open: true });
      await nextTick();
      const ta = document.createElement('textarea');
      document.body.appendChild(ta);
      ta.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }),
      );
      document.body.removeChild(ta);
      await nextTick();
      expect(mockHlsPlay).not.toHaveBeenCalled();
    });

    it('Space key does NOT call togglePlayback when editor is closed (open=false)', async () => {
      // Never transitioned to open=true so listener was never added
      mountEditor({ open: false });
      await nextTick();
      document.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }),
      );
      await nextTick();
      expect(mockHlsPlay).not.toHaveBeenCalled();
    });

    it('listener removed when editor closes (watch fires with open=false)', async () => {
      mountEditor({ open: false });
      await wrapper!.setProps({ open: true });
      await nextTick();
      // Space works while open
      document.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }),
      );
      await nextTick();
      expect(mockHlsPlay).toHaveBeenCalledTimes(1);
      // Close editor — listener should be removed
      vi.clearAllMocks();
      await wrapper!.setProps({ open: false });
      await nextTick();
      document.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }),
      );
      await nextTick();
      expect(mockHlsPlay).not.toHaveBeenCalled();
    });

    it('listener removed on unmount', async () => {
      mountEditor({ open: false });
      await wrapper!.setProps({ open: true });
      await nextTick();
      wrapper!.unmount();
      wrapper = null;
      vi.clearAllMocks();
      document.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true }),
      );
      await nextTick();
      expect(mockHlsPlay).not.toHaveBeenCalled();
    });
  });
});
