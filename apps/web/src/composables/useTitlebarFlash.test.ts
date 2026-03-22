import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { useTitlebarFlash } from './useTitlebarFlash';

// Helper: mount a component that uses useTitlebarFlash
function mountFlash() {
  let instance: ReturnType<typeof useTitlebarFlash> | null = null;
  const Comp = defineComponent({
    setup() {
      instance = useTitlebarFlash();
      return instance;
    },
    template: '<div></div>',
  });
  const wrapper = mount(Comp);
  return {
    wrapper,
    get flash() {
      return instance!;
    },
  };
}

describe('useTitlebarFlash', () => {
  const originalTitle = 'ManlyCam';

  beforeEach(() => {
    document.title = originalTitle;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.title = originalTitle;
    vi.restoreAllMocks();
  });

  it('does not change title when tab is visible (document.hidden = false)', () => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    const { flash, wrapper } = mountFlash();
    flash.flashTitlebar('Caleb mentioned you!');
    expect(document.title).toBe(originalTitle);
    wrapper.unmount();
  });

  it('changes title immediately when tab is hidden', () => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    const { flash, wrapper } = mountFlash();
    flash.flashTitlebar('Caleb mentioned you!');
    expect(document.title).toBe('Caleb mentioned you!');
    wrapper.unmount();
  });

  it('alternates title back to original after 1s', () => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    const { flash, wrapper } = mountFlash();
    flash.flashTitlebar('Caleb mentioned you!');
    expect(document.title).toBe('Caleb mentioned you!');

    vi.advanceTimersByTime(1000);
    expect(document.title).toBe(originalTitle);

    vi.advanceTimersByTime(1000);
    expect(document.title).toBe('Caleb mentioned you!');

    wrapper.unmount();
  });

  it('restores original title on restoreTitle call', () => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    const { flash, wrapper } = mountFlash();
    flash.flashTitlebar('Caleb mentioned you!');
    flash.restoreTitle();
    expect(document.title).toBe(originalTitle);
    wrapper.unmount();
  });

  it('stops alternating after restoreTitle', () => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    const { flash, wrapper } = mountFlash();
    flash.flashTitlebar('Caleb mentioned you!');
    flash.restoreTitle();
    const titleAfterRestore = document.title;
    vi.advanceTimersByTime(3000);
    // No more changes after restore
    expect(document.title).toBe(titleAfterRestore);
    wrapper.unmount();
  });

  it('restores title on visibilitychange when tab becomes visible', () => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    const { flash, wrapper } = mountFlash();
    flash.flashTitlebar('Caleb mentioned you!');

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(document.title).toBe(originalTitle);
    wrapper.unmount();
  });

  it('does not flash again if already flashing', () => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    const { flash, wrapper } = mountFlash();
    flash.flashTitlebar('first flash');
    flash.flashTitlebar('second flash');
    // Second call is ignored — still shows first flash
    expect(document.title).toBe('first flash');
    wrapper.unmount();
  });

  it('removes visibilitychange listener on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { wrapper } = mountFlash();
    wrapper.unmount();
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('captures originalTitle in flashTitlebar if not already set', async () => {
    vi.resetModules();
    document.title = 'Initial Title';
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });

    const mod = await import('./useTitlebarFlash');
    const { flashTitlebar } = mod.useTitlebarFlash();

    flashTitlebar('Flash!');

    vi.advanceTimersByTime(1000);
    expect(document.title).toBe('Initial Title');
  });
});
