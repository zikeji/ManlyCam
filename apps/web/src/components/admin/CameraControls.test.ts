import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { mount } from '@vue/test-utils';
import CameraControls from './CameraControls.vue';

vi.mock('@/composables/useCameraControls', () => ({
  useCameraControls: vi.fn(),
}));

import { useCameraControls } from '@/composables/useCameraControls';

describe('CameraControls.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Pi offline banner when piReachable is false', () => {
    vi.mocked(useCameraControls).mockReturnValue({
      settings: ref({}),
      piReachable: ref(false),
      isLoading: ref(false),
      lastError: ref(null),
      fetchSettings: vi.fn(),
      patchSetting: vi.fn(),
    } as any);

    const wrapper = mount(CameraControls);
    expect(wrapper.text()).toContain('Pi Offline');
  });

  it('does not show Pi offline banner when piReachable is true', () => {
    vi.mocked(useCameraControls).mockReturnValue({
      settings: ref({}),
      piReachable: ref(true),
      isLoading: ref(false),
      lastError: ref(null),
      fetchSettings: vi.fn(),
      patchSetting: vi.fn(),
    } as any);

    const wrapper = mount(CameraControls);
    expect(wrapper.text()).not.toContain('Pi Offline');
  });

  it('shows loading skeleton when isLoading is true', () => {
    vi.mocked(useCameraControls).mockReturnValue({
      settings: ref({}),
      piReachable: ref(true),
      isLoading: ref(true),
      lastError: ref(null),
      fetchSettings: vi.fn(),
      patchSetting: vi.fn(),
    } as any);

    const wrapper = mount(CameraControls);
    expect(wrapper.find('.animate-pulse').exists()).toBe(true);
  });

  it('calls fetchSettings on mount', () => {
    const fetchSettings = vi.fn();
    vi.mocked(useCameraControls).mockReturnValue({
      settings: ref({}),
      piReachable: ref(true),
      isLoading: ref(false),
      lastError: ref(null),
      fetchSettings,
      patchSetting: vi.fn(),
    } as any);

    mount(CameraControls);
    expect(fetchSettings).toHaveBeenCalled();
  });
});
