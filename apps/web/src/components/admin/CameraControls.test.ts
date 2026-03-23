import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, computed, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import CameraControls from './CameraControls.vue';

vi.mock('@/composables/useCameraControls', () => ({
  useCameraControls: vi.fn(),
}));

// Module-level ref so individual tests can change stream state
const mockStreamState = ref('live');
vi.mock('@/composables/useStream', () => ({
  useStream: () => ({ streamState: mockStreamState }),
}));

vi.mock('vue-sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

import {
  type useCameraControls,
  useCameraControls as useCameraControlsMock,
} from '@/composables/useCameraControls';
import { toast } from 'vue-sonner';

function defaultControls(overrides: Partial<ReturnType<typeof useCameraControls>> = {}) {
  return {
    settings: ref({}),
    piReachable: ref(true),
    isLoading: ref(false),
    lastError: ref(null),
    stagedValues: ref({}),
    hasStagedChanges: computed(() => false),
    fetchSettings: vi.fn(),
    patchSetting: vi.fn(),
    patchSettings: vi.fn(),
    stageValue: vi.fn(),
    discardStagedValues: vi.fn(),
    applyStaged: vi.fn(),
    ...overrides,
  } satisfies ReturnType<typeof useCameraControls>;
}

let wrapper: VueWrapper | null = null;

describe('CameraControls.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamState.value = 'live';
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('renders Pi offline banner when piReachable is false and stream is live', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls({ piReachable: ref(false) }));
    wrapper = mount(CameraControls);
    expect(wrapper.text()).toContain('Pi Offline');
  });

  it('does not show Pi offline banner when piReachable is true', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls());
    wrapper = mount(CameraControls);
    expect(wrapper.text()).not.toContain('Pi Offline');
  });

  it('shows loading skeleton when isLoading is true', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls({ isLoading: ref(true) }));
    wrapper = mount(CameraControls);
    expect(wrapper.find('.animate-pulse').exists()).toBe(true);
  });

  it('calls fetchSettings on mount', () => {
    const fetchSettings = vi.fn();
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls({ fetchSettings }));
    wrapper = mount(CameraControls);
    expect(fetchSettings).toHaveBeenCalled();
  });

  it('does not show blocking overlay when stream is unreachable (controls must stay accessible for recovery)', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls());
    mockStreamState.value = 'unreachable';
    wrapper = mount(CameraControls);
    expect(wrapper.text()).not.toContain('Start the stream');
    // Yellow piReachable banner may appear once watcher fires, but no full-screen blocking overlay
    expect(wrapper.find('.absolute.inset-0').exists()).toBe(false);
  });

  it('shows offline overlay with start-stream message when stream is explicit-offline', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls());
    mockStreamState.value = 'explicit-offline';
    wrapper = mount(CameraControls);
    expect(wrapper.text()).toContain('Start the stream');
  });

  it('renders section headers and controls when settings are loaded', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(
      defaultControls({ settings: ref({ rpiCameraBrightness: 0.5 }) }),
    );
    wrapper = mount(CameraControls);
    expect(wrapper.text()).toContain('Image');
    expect(wrapper.text()).toContain('Brightness');
  });

  it('does not show offline overlay when stream is connecting', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls());
    mockStreamState.value = 'connecting';
    wrapper = mount(CameraControls);
    expect(wrapper.text()).not.toContain('Start the stream');
    expect(wrapper.text()).not.toContain('Pi is offline');
  });

  it('suppresses offline overlay when previewActive is true and stream is explicit-offline', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls());
    mockStreamState.value = 'explicit-offline';
    wrapper = mount(CameraControls, { props: { previewActive: true } });
    expect(wrapper.text()).not.toContain('Start the stream');
    expect(wrapper.text()).not.toContain('Pi is offline');
  });

  it('does not show overlay when previewActive is true and stream is unreachable', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls());
    mockStreamState.value = 'unreachable';
    wrapper = mount(CameraControls, { props: { previewActive: true } });
    expect(wrapper.find('.absolute.inset-0').exists()).toBe(false);
  });

  it('shows offline overlay when previewActive is false and stream is explicit-offline', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls());
    mockStreamState.value = 'explicit-offline';
    wrapper = mount(CameraControls, { props: { previewActive: false } });
    expect(wrapper.text()).toContain('Start the stream');
  });

  it('shows offline overlay when previewActive transitions from true to false while stream stays explicit-offline', async () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls());
    mockStreamState.value = 'explicit-offline';
    wrapper = mount(CameraControls, { props: { previewActive: true } });
    expect(wrapper.text()).not.toContain('Start the stream');

    await wrapper.setProps({ previewActive: false });
    await nextTick();
    expect(wrapper.text()).toContain('Start the stream');
  });

  // --- Staged changes & Apply button ---

  it('renders Apply button when staged value differs from current setting', () => {
    // rpiCameraFPS default is 30; staging 60 is a real change
    vi.mocked(useCameraControlsMock).mockReturnValue(
      defaultControls({ stagedValues: ref({ rpiCameraFPS: 60 }), settings: ref({}) }),
    );
    wrapper = mount(CameraControls);
    const buttons = wrapper.findAll('button');
    const applyButton = buttons.find((b) => b.text() === 'Apply');
    expect(applyButton).toBeDefined();
  });

  it('does not render Apply button when no staged changes', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls());
    wrapper = mount(CameraControls);
    const buttons = wrapper.findAll('button');
    const applyButton = buttons.find((b) => b.text() === 'Apply');
    expect(applyButton).toBeUndefined();
  });

  it('does not render Apply button when staged value matches effective stored+default value', () => {
    // rpiCameraFPS default is 30; staging 30 when settings is empty is no change
    vi.mocked(useCameraControlsMock).mockReturnValue(
      defaultControls({ stagedValues: ref({ rpiCameraFPS: 30 }), settings: ref({}) }),
    );
    wrapper = mount(CameraControls);
    const buttons = wrapper.findAll('button');
    const applyButton = buttons.find((b) => b.text() === 'Apply');
    expect(applyButton).toBeUndefined();
  });

  it('renders Reset button when staged changes exist', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(
      defaultControls({ stagedValues: ref({ rpiCameraFPS: 60 }), settings: ref({}) }),
    );
    wrapper = mount(CameraControls);
    const resetButton = wrapper.find('button[title="Reset Changes"]');
    expect(resetButton.exists()).toBe(true);
  });

  it('opens apply confirmation dialog when Apply button is clicked', async () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(
      defaultControls({ stagedValues: ref({ rpiCameraFPS: 60 }), settings: ref({}) }),
    );
    wrapper = mount(CameraControls, { attachTo: document.body });

    const applyButton = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Apply',
    );
    expect(applyButton).toBeDefined();
    applyButton!.click();
    await nextTick();

    expect(document.body.textContent).toContain(
      'Applying these settings will briefly restart the camera stream',
    );
  });

  it('Confirm action calls applyStaged and shows success toast', async () => {
    const applyStaged = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useCameraControlsMock).mockReturnValue(
      defaultControls({ stagedValues: ref({ rpiCameraFPS: 60 }), settings: ref({}), applyStaged }),
    );
    wrapper = mount(CameraControls, { attachTo: document.body });

    // Open dialog
    const applyButton = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Apply',
    );
    applyButton!.click();
    await nextTick();

    // Confirm — AlertDialogAction "Apply" is last Apply button in portal
    const confirmBtn = [...document.body.querySelectorAll('button')]
      .filter((b) => b.textContent?.trim() === 'Apply')
      .at(-1);
    expect(confirmBtn).toBeDefined();
    confirmBtn!.click();
    await nextTick();

    expect(applyStaged).toHaveBeenCalled();
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Camera settings applied');
  });

  it('Apply dialog Cancel closes dialog without discarding staged values', async () => {
    const discardStagedValues = vi.fn();
    vi.mocked(useCameraControlsMock).mockReturnValue(
      defaultControls({
        stagedValues: ref({ rpiCameraFPS: 60 }),
        settings: ref({}),
        discardStagedValues,
      }),
    );
    wrapper = mount(CameraControls, { attachTo: document.body });

    const applyButton = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Apply',
    );
    applyButton!.click();
    await nextTick();

    // Cancel in Apply dialog — should NOT call discardStagedValues
    const cancelButton = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Cancel',
    );
    expect(cancelButton).toBeDefined();
    cancelButton!.click();
    await nextTick();

    expect(discardStagedValues).not.toHaveBeenCalled();
  });

  it('Reset button opens reset confirmation dialog', async () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(
      defaultControls({ stagedValues: ref({ rpiCameraFPS: 60 }), settings: ref({}) }),
    );
    wrapper = mount(CameraControls, { attachTo: document.body });

    const resetButton = document.body.querySelector('button[title="Reset Changes"]');
    expect(resetButton).not.toBeNull();
    resetButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    expect(document.body.textContent).toContain('Unsaved changes will be lost');
  });

  it('Reset Confirm calls discardStagedValues', async () => {
    const discardStagedValues = vi.fn();
    vi.mocked(useCameraControlsMock).mockReturnValue(
      defaultControls({
        stagedValues: ref({ rpiCameraFPS: 60 }),
        settings: ref({}),
        discardStagedValues,
      }),
    );
    wrapper = mount(CameraControls, { attachTo: document.body });

    const resetButton = document.body.querySelector('button[title="Reset Changes"]');
    resetButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    // Click Reset in dialog
    const resetConfirmBtn = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Reset',
    );
    expect(resetConfirmBtn).toBeDefined();
    resetConfirmBtn!.click();
    await nextTick();

    expect(discardStagedValues).toHaveBeenCalled();
  });

  it('Reset dialog Cancel does not call discardStagedValues', async () => {
    const discardStagedValues = vi.fn();
    vi.mocked(useCameraControlsMock).mockReturnValue(
      defaultControls({
        stagedValues: ref({ rpiCameraFPS: 60 }),
        settings: ref({}),
        discardStagedValues,
      }),
    );
    wrapper = mount(CameraControls, { attachTo: document.body });

    const resetButton = document.body.querySelector('button[title="Reset Changes"]');
    resetButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    const cancelButton = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Cancel',
    );
    expect(cancelButton).toBeDefined();
    cancelButton!.click();
    await nextTick();

    expect(discardStagedValues).not.toHaveBeenCalled();
  });

  it('renders Encoding section when loaded', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls());
    wrapper = mount(CameraControls);
    expect(wrapper.text()).toContain('Encoding');
    expect(wrapper.text()).toContain('FPS');
    expect(wrapper.text()).toContain('Bitrate');
  });

  it('non-restart-required controls call patchSetting on change (select)', async () => {
    vi.useFakeTimers();
    const patchSetting = vi.fn().mockResolvedValue(undefined);
    const stageValue = vi.fn();
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls({ patchSetting, stageValue }));
    wrapper = mount(CameraControls);

    // rpiCameraDenoise is restartRequired: false — change goes through debouncedPatch
    const denoiseSelect = wrapper.find('#rpiCameraDenoise');
    if (denoiseSelect.exists()) {
      await denoiseSelect.setValue('cdn_fast');
      vi.runAllTimers();
      await nextTick();
      expect(patchSetting).toHaveBeenCalled();
      expect(stageValue).not.toHaveBeenCalled();
    }
    vi.useRealTimers();
  });

  it('shows overlay text control when rpiCameraTextOverlayEnable is staged true', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(
      defaultControls({ stagedValues: ref({ rpiCameraTextOverlayEnable: true }) }),
    );
    wrapper = mount(CameraControls);
    expect(wrapper.find('#rpiCameraTextOverlay').exists()).toBe(true);
  });

  it('hides overlay text control when rpiCameraTextOverlayEnable is staged false even if stored true', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(
      defaultControls({
        stagedValues: ref({ rpiCameraTextOverlayEnable: false }),
        settings: ref({ rpiCameraTextOverlayEnable: true }),
      }),
    );
    wrapper = mount(CameraControls);
    expect(wrapper.find('#rpiCameraTextOverlay').exists()).toBe(false);
  });

  it('displays bitrate in kbps (fromBackend transform applied)', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(
      defaultControls({ settings: ref({ rpiCameraBitrate: 2000000 }) }),
    );
    wrapper = mount(CameraControls);
    const bitrateInput = wrapper.find('#rpiCameraBitrate').element as HTMLInputElement;
    expect(Number(bitrateInput.value)).toBe(2000);
  });

  it('stages FPS number input value without transform (no unit conversion)', async () => {
    const stageValue = vi.fn();
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls({ stageValue }));
    wrapper = mount(CameraControls);

    const fpsInput = wrapper.find('#rpiCameraFPS');
    if (fpsInput.exists()) {
      await fpsInput.setValue(60);
      await nextTick();
      expect(stageValue).toHaveBeenCalledWith('rpiCameraFPS', 60);
    }
  });

  it('stages bitrate in bps after toBackend transform', async () => {
    const stageValue = vi.fn();
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls({ stageValue }));
    wrapper = mount(CameraControls);

    const bitrateInput = wrapper.find('#rpiCameraBitrate');
    if (bitrateInput.exists()) {
      await bitrateInput.setValue(3000);
      await nextTick();
      expect(stageValue).toHaveBeenCalledWith('rpiCameraBitrate', 3000000);
    }
  });

  it('restart-required switch controls call stageValue instead of patchSetting', async () => {
    const patchSetting = vi.fn();
    const stageValue = vi.fn();
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls({ patchSetting, stageValue }));
    wrapper = mount(CameraControls);

    // rpiCameraHFlip is restartRequired: true
    const hflipSwitch = wrapper.find('#rpiCameraHFlip');
    if (hflipSwitch.exists()) {
      await hflipSwitch.trigger('click');
      await nextTick();
      expect(stageValue).toHaveBeenCalledWith('rpiCameraHFlip', expect.any(Boolean));
      expect(patchSetting).not.toHaveBeenCalled();
    }
  });

  it('debouncedPatch delays API call and cancels previous timer', async () => {
    vi.useFakeTimers();
    const patchSetting = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls({ patchSetting }));
    wrapper = mount(CameraControls);

    const brightnessSlider = wrapper.findComponent({ name: 'Slider' });
    if (brightnessSlider.exists()) {
      brightnessSlider.vm.$emit('update:model-value', [0.6]);
      brightnessSlider.vm.$emit('update:model-value', [0.7]);
      brightnessSlider.vm.$emit('update:model-value', [0.8]);

      vi.advanceTimersByTime(150);
      expect(patchSetting).not.toHaveBeenCalled();

      vi.advanceTimersByTime(200);
      expect(patchSetting).toHaveBeenCalledTimes(1);
      expect(patchSetting).toHaveBeenCalledWith('rpiCameraBrightness', 0.8);
    }
    vi.useRealTimers();
  });

  it('handleTextChange calls debouncedPatch for non-restart-required text controls', async () => {
    vi.useFakeTimers();
    const patchSetting = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls({ patchSetting }));
    wrapper = mount(CameraControls);

    const textInput = wrapper.find('#rpiCameraTextOverlay');
    if (textInput.exists()) {
      await textInput.setValue('New Overlay Text');
      vi.runAllTimers();
      expect(patchSetting).toHaveBeenCalledWith('rpiCameraTextOverlay', 'New Overlay Text');
    }
    vi.useRealTimers();
  });

  it('watch on streamState: sets piReachable=false when state is unreachable', async () => {
    const piReachable = ref(true);
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls({ piReachable }));
    mockStreamState.value = 'live';
    wrapper = mount(CameraControls);
    mockStreamState.value = 'unreachable';
    await nextTick();
    expect(piReachable.value).toBe(false);
  });

  it('watch on streamState: sets piReachable=false when state is explicit-offline (previewActive=false)', async () => {
    const piReachable = ref(true);
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls({ piReachable }));
    mockStreamState.value = 'live';
    wrapper = mount(CameraControls);
    mockStreamState.value = 'explicit-offline';
    await nextTick();
    expect(piReachable.value).toBe(false);
  });

  it('handleDualChange calls debouncedPatch with updated array when AWB mode is custom', async () => {
    vi.useFakeTimers();
    const patchSetting = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useCameraControlsMock).mockReturnValue(
      defaultControls({
        patchSetting,
        settings: ref({ rpiCameraAWB: 'custom', rpiCameraAWBGains: [1.0, 1.5] }),
      }),
    );
    wrapper = mount(CameraControls);

    const numberInputs = wrapper.findAll('input[type="number"]');
    if (numberInputs.length > 0) {
      const inputEl = numberInputs[0].element as HTMLInputElement;
      inputEl.value = '2.5';
      await numberInputs[0].trigger('change');
      vi.runAllTimers();
      expect(patchSetting).toHaveBeenCalled();
    }
    vi.useRealTimers();
  });

  it('handleConfirm shows error toast if applyStaged throws', async () => {
    const applyStaged = vi.fn().mockRejectedValue(new Error('Test error'));
    vi.mocked(useCameraControlsMock).mockReturnValue(
      defaultControls({ stagedValues: ref({ rpiCameraFPS: 60 }), settings: ref({}), applyStaged }),
    );
    wrapper = mount(CameraControls, { attachTo: document.body });

    const applyButton = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Apply',
    );
    applyButton!.click();
    await nextTick();

    const confirmBtn = [...document.body.querySelectorAll('button')]
      .filter((b) => b.textContent?.trim() === 'Apply')
      .at(-1);
    confirmBtn!.click();
    await nextTick();
    await nextTick();

    expect(applyStaged).toHaveBeenCalled();
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to apply settings');
  });
});
