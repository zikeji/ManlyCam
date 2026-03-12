import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import AtmosphericVoid from './AtmosphericVoid.vue';

describe('AtmosphericVoid', () => {
  let wrapper: VueWrapper<any> | null = null;

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount();
      wrapper = null;
    }
    vi.clearAllMocks();
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

  it('copies srcObject to internal video on mount if available', async () => {
    const mockSrcObject = {} as MediaProvider;
    const mockVideoRef = document.createElement('video');
    mockVideoRef.srcObject = mockSrcObject;
    
    wrapper = mount(AtmosphericVoid, {
      props: { videoRef: mockVideoRef },
    });
    
    // flush watch
    await wrapper.vm.$nextTick();

    const voidVideo = wrapper.find('video').element as HTMLVideoElement;
    expect(voidVideo.srcObject).toBe(mockSrcObject);
  });

  it('copies srcObject to internal video on loadeddata event', async () => {
    const mockVideoRef = document.createElement('video');
    
    wrapper = mount(AtmosphericVoid, {
      props: { videoRef: mockVideoRef },
    });
    
    await wrapper.vm.$nextTick();
    
    const mockSrcObject = {} as MediaProvider;
    mockVideoRef.srcObject = mockSrcObject;
    
    // Dispatch loadeddata event
    mockVideoRef.dispatchEvent(new Event('loadeddata'));
    
    const voidVideo = wrapper.find('video').element as HTMLVideoElement;
    expect(voidVideo.srcObject).toBe(mockSrcObject);
  });

  it('cleans up event listener on unmount', async () => {
    const mockVideoRef = document.createElement('video');
    vi.spyOn(mockVideoRef, 'removeEventListener');
    
    wrapper = mount(AtmosphericVoid, {
      props: { videoRef: mockVideoRef },
    });
    
    await wrapper.vm.$nextTick();
    
    wrapper.unmount();
    wrapper = null;
    
    expect(mockVideoRef.removeEventListener).toHaveBeenCalledWith('loadeddata', expect.any(Function));
  });
});
