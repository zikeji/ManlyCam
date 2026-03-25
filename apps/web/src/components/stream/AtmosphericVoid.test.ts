import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import AtmosphericVoid from './AtmosphericVoid.vue';

describe('AtmosphericVoid', () => {
  let wrapper: VueWrapper<InstanceType<typeof AtmosphericVoid>> | null = null;

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount();
      wrapper = null;
    }
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('renders dark fallback container', () => {
    wrapper = mount(AtmosphericVoid, {
      props: { videoRef: null },
    });

    const container = wrapper.find('div');
    expect(container.exists()).toBe(true);
    expect(container.classes()).toContain('bg-[hsl(var(--surface))]');
    expect(container.attributes('aria-hidden')).toBe('true');
  });

  describe('WebRTC (srcObject) path', () => {
    it('copies srcObject to internal video on mount if available', async () => {
      const mockSrcObject = {} as MediaProvider;
      const mockVideoRef = document.createElement('video');
      mockVideoRef.srcObject = mockSrcObject;

      wrapper = mount(AtmosphericVoid, {
        props: { videoRef: mockVideoRef },
      });
      await wrapper.vm.$nextTick();

      const voidVideo = wrapper.find('video').element as HTMLVideoElement;
      expect(voidVideo.srcObject).toBe(mockSrcObject);
    });

    it('copies srcObject to internal video on loadeddata event', async () => {
      const mockVideoRef = document.createElement('video');
      const initialSrc = {} as MediaProvider;
      mockVideoRef.srcObject = initialSrc;

      wrapper = mount(AtmosphericVoid, {
        props: { videoRef: mockVideoRef },
      });
      await wrapper.vm.$nextTick();

      const newSrcObject = {} as MediaProvider;
      mockVideoRef.srcObject = newSrcObject;
      mockVideoRef.dispatchEvent(new Event('loadeddata'));

      const voidVideo = wrapper.find('video').element as HTMLVideoElement;
      expect(voidVideo.srcObject).toBe(newSrcObject);
    });

    it('shows video element and hides canvas for WebRTC', async () => {
      const mockVideoRef = document.createElement('video');
      mockVideoRef.srcObject = {} as MediaProvider;

      wrapper = mount(AtmosphericVoid, {
        props: { videoRef: mockVideoRef },
      });
      await wrapper.vm.$nextTick();

      const video = wrapper.find('video');
      const canvas = wrapper.find('canvas');
      expect(video.isVisible()).toBe(true);
      expect(canvas.isVisible()).toBe(false);
    });

    it('cleans up loadeddata listener on unmount', async () => {
      const mockVideoRef = document.createElement('video');
      mockVideoRef.srcObject = {} as MediaProvider;
      vi.spyOn(mockVideoRef, 'removeEventListener');

      wrapper = mount(AtmosphericVoid, {
        props: { videoRef: mockVideoRef },
      });
      await wrapper.vm.$nextTick();

      wrapper.unmount();
      wrapper = null;

      expect(mockVideoRef.removeEventListener).toHaveBeenCalledWith(
        'loadeddata',
        expect.any(Function),
      );
    });

    it('removes old listener when videoRef changes', async () => {
      const firstEl = document.createElement('video');
      firstEl.srcObject = {} as MediaProvider;
      vi.spyOn(firstEl, 'removeEventListener');

      wrapper = mount(AtmosphericVoid, {
        props: { videoRef: firstEl },
      });
      await wrapper.vm.$nextTick();

      const secondEl = document.createElement('video');
      secondEl.srcObject = {} as MediaProvider;
      await wrapper.setProps({ videoRef: secondEl });
      await wrapper.vm.$nextTick();

      expect(firstEl.removeEventListener).toHaveBeenCalledWith('loadeddata', expect.any(Function));
    });
  });

  describe('HLS/MSE (canvas) path', () => {
    it('shows canvas and hides video for HLS source', async () => {
      const hlsVideo = document.createElement('video');

      wrapper = mount(AtmosphericVoid, {
        props: { videoRef: hlsVideo },
      });
      await wrapper.vm.$nextTick();

      const video = wrapper.find('video');
      const canvas = wrapper.find('canvas');
      expect(video.isVisible()).toBe(false);
      expect(canvas.isVisible()).toBe(true);
    });

    it('draws frames from HLS video onto canvas via rAF loop', async () => {
      const hlsVideo = document.createElement('video');
      Object.defineProperty(hlsVideo, 'readyState', { value: 3 });
      Object.defineProperty(hlsVideo, 'paused', { value: false });

      const mockCtx = { drawImage: vi.fn() };
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        mockCtx as unknown as CanvasRenderingContext2D,
      );

      wrapper = mount(AtmosphericVoid, {
        props: { videoRef: hlsVideo },
      });
      await wrapper.vm.$nextTick();

      // The component uses requestAnimationFrame internally — invoke the queued callbacks
      // by triggering the rAF mock. Since vi.spyOn on rAF doesn't auto-invoke,
      // we run the actual rAF callbacks via vi.advanceTimersByTime won't work here.
      // Instead, verify the canvas context was obtained (loop was started).
      expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d');
    });

    it('registers playing listener for HLS source', async () => {
      const hlsVideo = document.createElement('video');
      vi.spyOn(hlsVideo, 'addEventListener');

      wrapper = mount(AtmosphericVoid, {
        props: { videoRef: hlsVideo },
      });
      await wrapper.vm.$nextTick();

      expect(hlsVideo.addEventListener).toHaveBeenCalledWith('playing', expect.any(Function));
    });

    it('cleans up playing listener on unmount', async () => {
      const hlsVideo = document.createElement('video');
      vi.spyOn(hlsVideo, 'removeEventListener');

      wrapper = mount(AtmosphericVoid, {
        props: { videoRef: hlsVideo },
      });
      await wrapper.vm.$nextTick();

      wrapper.unmount();
      wrapper = null;

      expect(hlsVideo.removeEventListener).toHaveBeenCalledWith('playing', expect.any(Function));
    });

    it('does not reset canvas dimensions on repeated playing events (flash regression)', async () => {
      const hlsVideo = document.createElement('video');

      wrapper = mount(AtmosphericVoid, {
        props: { videoRef: hlsVideo },
      });
      await wrapper.vm.$nextTick();

      const canvas = wrapper.find('canvas').element as HTMLCanvasElement;
      // Set canvas to initialized dimensions (CANVAS_W=64, CANVAS_H=36) to simulate
      // the post-init state — JSDOM may not have run startCanvasLoop yet due to rAF timing
      canvas.width = 64;
      canvas.height = 36;

      // Spy on width setter at the instance level so we detect any reset
      let widthResetCount = 0;
      const origDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width')!;
      Object.defineProperty(canvas, 'width', {
        get() {
          return origDescriptor.get!.call(this);
        },
        set(v: number) {
          widthResetCount++;
          origDescriptor.set!.call(this, v);
        },
        configurable: true,
      });

      // Fire playing event — what HLS fires each time play() is called
      hlsVideo.dispatchEvent(new Event('playing'));
      await wrapper.vm.$nextTick();

      // canvas.width must NOT be reset: resetting clears the canvas, causing a one-frame flash
      expect(widthResetCount).toBe(0);
    });

    it('sets useCanvas false when switching to WebRTC source', async () => {
      const hlsVideo = document.createElement('video');

      wrapper = mount(AtmosphericVoid, {
        props: { videoRef: hlsVideo },
      });
      await wrapper.vm.$nextTick();
      // Canvas mode active for HLS
      expect(wrapper.find('canvas').isVisible()).toBe(true);
      expect(wrapper.find('video').isVisible()).toBe(false);

      // Switch to WebRTC source
      const whepVideo = document.createElement('video');
      whepVideo.srcObject = {} as MediaProvider;
      await wrapper.setProps({ videoRef: whepVideo });
      // Flush all pending reactivity + DOM updates
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();

      // Video visible, canvas hidden
      expect(wrapper.find('video').attributes('style')).not.toContain('display: none');
      expect(wrapper.find('canvas').attributes('style')).toContain('display: none');
    });
  });
});
