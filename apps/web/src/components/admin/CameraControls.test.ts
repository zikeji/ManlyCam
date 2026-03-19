import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { mount } from '@vue/test-utils';
import CameraControls from './CameraControls.vue';

vi.mock('@/composables/useCameraControls', () => ({
  useCameraControls: vi.fn(),
}));

// Module-level ref so individual tests can change stream state
const mockStreamState = ref('live');
vi.mock('@/composables/useStream', () => ({
  useStream: () => ({ streamState: mockStreamState }),
}));

import {
  type useCameraControls,
  useCameraControls as useCameraControlsMock,
} from '@/composables/useCameraControls';

function defaultControls(overrides: Partial<ReturnType<typeof useCameraControls>> = {}) {
  return {
    settings: ref({}),
    piReachable: ref(true),
    isLoading: ref(false),
    lastError: ref(null),
    fetchSettings: vi.fn(),
    patchSetting: vi.fn(),
    ...overrides,
  } satisfies ReturnType<typeof useCameraControls>;
}

describe('CameraControls.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStreamState.value = 'live';
  });

  it('renders Pi offline banner when piReachable is false and stream is live', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls({ piReachable: ref(false) }));
    const wrapper = mount(CameraControls);
    expect(wrapper.text()).toContain('Pi Offline');
  });

  it('does not show Pi offline banner when piReachable is true', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls());
    const wrapper = mount(CameraControls);
    expect(wrapper.text()).not.toContain('Pi Offline');
  });

  it('shows loading skeleton when isLoading is true', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls({ isLoading: ref(true) }));
    const wrapper = mount(CameraControls);
    expect(wrapper.find('.animate-pulse').exists()).toBe(true);
  });

  it('calls fetchSettings on mount', () => {
    const fetchSettings = vi.fn();
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls({ fetchSettings }));
    mount(CameraControls);
    expect(fetchSettings).toHaveBeenCalled();
  });

  it('shows offline overlay when stream is unreachable', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls());
    mockStreamState.value = 'unreachable';
    const wrapper = mount(CameraControls);
    expect(wrapper.text()).toContain('Pi is offline');
  });

  it('shows offline overlay with start-stream message when stream is explicit-offline', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls());
    mockStreamState.value = 'explicit-offline';
    const wrapper = mount(CameraControls);
    expect(wrapper.text()).toContain('Start the stream');
  });

  it('renders section headers and controls when settings are loaded', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(
      defaultControls({ settings: ref({ rpiCameraBrightness: 0.5 }) }),
    );
    const wrapper = mount(CameraControls);
    expect(wrapper.text()).toContain('Image');
    expect(wrapper.text()).toContain('Brightness');
  });

  it('does not show offline overlay when stream is connecting', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls());
    mockStreamState.value = 'connecting';
    const wrapper = mount(CameraControls);
    // Banner should not appear during connecting state
    expect(wrapper.text()).not.toContain('Start the stream');
    expect(wrapper.text()).not.toContain('Pi is offline');
  });

  it('suppresses offline overlay when previewActive is true and stream is explicit-offline', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls());
    mockStreamState.value = 'explicit-offline';
    const wrapper = mount(CameraControls, { props: { previewActive: true } });
    expect(wrapper.text()).not.toContain('Start the stream');
  });

  it('suppresses offline overlay when previewActive is true and stream is unreachable', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls());
    mockStreamState.value = 'unreachable';
    const wrapper = mount(CameraControls, { props: { previewActive: true } });
    expect(wrapper.text()).not.toContain('Pi is offline');
  });

  it('shows offline overlay when previewActive is false and stream is explicit-offline', () => {
    vi.mocked(useCameraControlsMock).mockReturnValue(defaultControls());
    mockStreamState.value = 'explicit-offline';
    const wrapper = mount(CameraControls, { props: { previewActive: false } });
    expect(wrapper.text()).toContain('Start the stream');
  });
});
