import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { useClipModal, isClipModalOpen, activeClipId, openClip, closeClip } from './useClipModal';

// Stub history API
const mockPushState = vi.fn();
const mockReplaceState = vi.fn();
const mockBack = vi.fn();

Object.defineProperty(window, 'history', {
  value: {
    pushState: mockPushState,
    replaceState: mockReplaceState,
    back: mockBack,
    state: null as Record<string, unknown> | null,
  },
  writable: true,
});

// Use Object.defineProperty to set history.state (handles cases where prior tests
// created a getter-only descriptor with configurable: true)
function setHistoryState(state: Record<string, unknown> | null) {
  Object.defineProperty(window.history, 'state', {
    get: () => state,
    configurable: true,
  });
}

function resetState() {
  isClipModalOpen.value = false;
  activeClipId.value = null;
  setHistoryState(null);
}

// Minimal component that registers the popstate listener via useClipModal()
const TestComponent = defineComponent({
  setup() {
    useClipModal();
    return {};
  },
  template: '<div></div>',
});

describe('useClipModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
  });

  describe('openClip', () => {
    it('calls history.pushState when modal is closed', () => {
      openClip('clip-001');
      expect(mockPushState).toHaveBeenCalledWith(
        { clipModal: true, fromRoute: '/', clipId: 'clip-001' },
        '',
        '/clips/clip-001',
      );
      expect(mockReplaceState).not.toHaveBeenCalled();
    });

    it('calls history.replaceState when modal is already open', () => {
      isClipModalOpen.value = true;
      openClip('clip-002');
      expect(mockReplaceState).toHaveBeenCalledWith(
        { clipModal: true, fromRoute: '/', clipId: 'clip-002' },
        '',
        '/clips/clip-002',
      );
      expect(mockPushState).not.toHaveBeenCalled();
    });

    it('sets isClipModalOpen to true', () => {
      openClip('clip-001');
      expect(isClipModalOpen.value).toBe(true);
    });

    it('sets activeClipId to the provided clipId', () => {
      openClip('clip-abc');
      expect(activeClipId.value).toBe('clip-abc');
    });

    it('updates activeClipId when called again while already open', () => {
      openClip('clip-001');
      openClip('clip-002');
      expect(activeClipId.value).toBe('clip-002');
    });
  });

  describe('closeClip', () => {
    it('sets isClipModalOpen to false', () => {
      isClipModalOpen.value = true;
      closeClip();
      expect(isClipModalOpen.value).toBe(false);
    });

    it('sets activeClipId to null', () => {
      isClipModalOpen.value = true;
      activeClipId.value = 'clip-001';
      closeClip();
      expect(activeClipId.value).toBeNull();
    });

    it('calls history.back()', () => {
      isClipModalOpen.value = true;
      closeClip();
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('popstate listener', () => {
    let wrapper: VueWrapper | null = null;

    beforeEach(async () => {
      // Mount a component so the popstate listener is registered via useClipModal()
      wrapper = mount(TestComponent);
      await nextTick();
    });

    afterEach(() => {
      wrapper?.unmount();
      wrapper = null;
    });

    it('closes modal when popstate fires without clipModal state', async () => {
      isClipModalOpen.value = true;
      activeClipId.value = 'clip-001';
      setHistoryState(null);
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
      await nextTick();
      expect(isClipModalOpen.value).toBe(false);
      expect(activeClipId.value).toBeNull();
    });

    it('does not close modal when popstate fires with clipModal state', async () => {
      isClipModalOpen.value = true;
      activeClipId.value = 'clip-001';
      setHistoryState({ clipModal: true, fromRoute: '/', clipId: 'clip-001' });
      window.dispatchEvent(
        new PopStateEvent('popstate', {
          state: { clipModal: true, fromRoute: '/', clipId: 'clip-001' },
        }),
      );
      await nextTick();
      expect(isClipModalOpen.value).toBe(true);
      expect(activeClipId.value).toBe('clip-001');
    });
  });

  describe('useClipModal composable lifecycle', () => {
    it('registers popstate listener on mount and removes on unmount', async () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      const wrapper = mount(TestComponent);
      await nextTick();
      expect(addSpy).toHaveBeenCalledWith('popstate', expect.any(Function));

      wrapper.unmount();
      expect(removeSpy).toHaveBeenCalledWith('popstate', expect.any(Function));

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it('returns isClipModalOpen, activeClipId, openClip, closeClip', async () => {
      const ReturnCheckComponent = defineComponent({
        setup() {
          const result = useClipModal();
          return { result };
        },
        template: '<div></div>',
      });
      const wrapper = mount(ReturnCheckComponent);
      await nextTick();
      const { result } = wrapper.vm as { result: ReturnType<typeof useClipModal> };
      expect(result).toHaveProperty('isClipModalOpen');
      expect(result).toHaveProperty('activeClipId');
      expect(result).toHaveProperty('openClip');
      expect(result).toHaveProperty('closeClip');
      wrapper.unmount();
    });
  });
});
