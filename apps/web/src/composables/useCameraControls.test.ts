import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCameraControls } from './useCameraControls';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  ApiFetchError: class ApiFetchError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ApiFetchError';
    }
  },
}));

import { apiFetch, ApiFetchError } from '@/lib/api';

describe('useCameraControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with default state', () => {
    const { settings, piReachable, isLoading, lastError } = useCameraControls();
    expect(settings.value).toEqual({});
    expect(piReachable.value).toBe(true);
    expect(isLoading.value).toBe(false);
    expect(lastError.value).toBeNull();
  });

  it('fetchSettings populates settings and piReachable', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      settings: { rpiCameraBrightness: 0.5, rpiCameraContrast: 1.2 },
      piReachable: true,
    });

    const { fetchSettings, settings, piReachable } = useCameraControls();
    await fetchSettings();

    expect(settings.value).toEqual({
      rpiCameraBrightness: 0.5,
      rpiCameraContrast: 1.2,
    });
    expect(piReachable.value).toBe(true);
  });

  it('fetchSettings handles pi offline state', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      settings: {},
      piReachable: false,
    });

    const { fetchSettings, piReachable } = useCameraControls();
    await fetchSettings();

    expect(piReachable.value).toBe(false);
  });

  it('fetchSettings sets error on ApiFetchError', async () => {
    const error = new ApiFetchError('Network error');
    vi.mocked(apiFetch).mockRejectedValue(error);

    const { fetchSettings, lastError, isLoading } = useCameraControls();
    await fetchSettings();

    expect(lastError.value).toBe('Network error');
    expect(isLoading.value).toBe(false);
  });

  it('patchSetting calls API and optimistically updates', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ok: true });

    const { patchSetting, settings } = useCameraControls();
    settings.value = { rpiCameraBrightness: 0.5 };

    await patchSetting('rpiCameraBrightness', 0.7);

    expect(settings.value.rpiCameraBrightness).toBe(0.7);
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/api/stream/camera-settings', {
      method: 'PATCH',
      body: JSON.stringify({ rpiCameraBrightness: 0.7 }),
    });
  });

  it('patchSetting reverts on error', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: false,
      error: 'Failed to apply',
    });

    const { patchSetting, settings, lastError } = useCameraControls();
    settings.value = { rpiCameraBrightness: 0.5 };

    await patchSetting('rpiCameraBrightness', 0.7);

    expect(settings.value.rpiCameraBrightness).toBe(0.5);
    expect(lastError.value).toBe('Failed to apply');
  });

  it('patchSetting reverts on network error', async () => {
    const error = new ApiFetchError('Network error');
    vi.mocked(apiFetch).mockRejectedValue(error);

    const { patchSetting, settings, lastError } = useCameraControls();
    settings.value = { rpiCameraBrightness: 0.5 };

    await patchSetting('rpiCameraBrightness', 0.7);

    expect(settings.value.rpiCameraBrightness).toBe(0.5);
    expect(lastError.value).toBe('Network error');
  });

  it('patchSetting does not treat piOffline as error', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      piOffline: true,
    });

    const { patchSetting, settings, lastError } = useCameraControls();
    settings.value = { rpiCameraBrightness: 0.5 };

    await patchSetting('rpiCameraBrightness', 0.7);

    expect(settings.value.rpiCameraBrightness).toBe(0.7);
    expect(lastError.value).toBeNull();
  });
});
