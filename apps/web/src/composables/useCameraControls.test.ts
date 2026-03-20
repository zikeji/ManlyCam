import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCameraControls } from './useCameraControls';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  ApiFetchError: class ApiFetchError extends Error {
    constructor(
      message: string,
      public status = 0,
      public code = 'UNKNOWN',
    ) {
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
    const { settings, piReachable, isLoading, lastError, stagedValues, hasStagedChanges } =
      useCameraControls();
    expect(settings.value).toEqual({});
    expect(piReachable.value).toBe(true);
    expect(isLoading.value).toBe(false);
    expect(lastError.value).toBeNull();
    expect(stagedValues.value).toEqual({});
    expect(hasStagedChanges.value).toBe(false);
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
    const error = new ApiFetchError('Network error', 0);
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
      headers: { 'Content-Type': 'application/json' },
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
    const error = new ApiFetchError('Network error', 0);
    vi.mocked(apiFetch).mockRejectedValue(error);

    const { patchSetting, settings, lastError } = useCameraControls();
    settings.value = { rpiCameraBrightness: 0.5 };

    await patchSetting('rpiCameraBrightness', 0.7);

    expect(settings.value.rpiCameraBrightness).toBe(0.5);
    expect(lastError.value).toBe('Network error');
  });

  it('patchSetting succeeds with ok:true — server no longer returns piOffline:true', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
    });

    const { patchSetting, settings, lastError } = useCameraControls();
    settings.value = { rpiCameraBrightness: 0.5 };

    await patchSetting('rpiCameraBrightness', 0.7);

    expect(settings.value.rpiCameraBrightness).toBe(0.7);
    expect(lastError.value).toBeNull();
  });

  it('stageValue adds to stagedValues and hasStagedChanges becomes true', () => {
    const { stageValue, stagedValues, hasStagedChanges } = useCameraControls();

    expect(hasStagedChanges.value).toBe(false);
    stageValue('rpiCameraFps', 60);
    expect(stagedValues.value).toEqual({ rpiCameraFps: 60 });
    expect(hasStagedChanges.value).toBe(true);
  });

  it('stageValue accumulates multiple staged values', () => {
    const { stageValue, stagedValues } = useCameraControls();

    stageValue('rpiCameraFps', 60);
    stageValue('rpiCameraWidth', 1920);
    expect(stagedValues.value).toEqual({ rpiCameraFps: 60, rpiCameraWidth: 1920 });
  });

  it('discardStagedValues resets stagedValues to empty', () => {
    const { stageValue, discardStagedValues, stagedValues, hasStagedChanges } = useCameraControls();

    stageValue('rpiCameraFps', 60);
    expect(hasStagedChanges.value).toBe(true);

    discardStagedValues();
    expect(stagedValues.value).toEqual({});
    expect(hasStagedChanges.value).toBe(false);
  });

  it('applyStaged sends batch PATCH and clears staged values', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ok: true });

    const { stageValue, applyStaged, stagedValues, hasStagedChanges, settings } =
      useCameraControls();

    stageValue('rpiCameraFps', 60);
    stageValue('rpiCameraWidth', 1920);

    await applyStaged();

    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/api/stream/camera-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rpiCameraFps: 60, rpiCameraWidth: 1920 }),
    });
    expect(stagedValues.value).toEqual({});
    expect(hasStagedChanges.value).toBe(false);
    expect(settings.value.rpiCameraFps).toBe(60);
    expect(settings.value.rpiCameraWidth).toBe(1920);
  });

  it('applyStaged clears staged values even on ok:false response', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ok: false, error: 'Validation error' });

    const { stageValue, applyStaged, stagedValues, lastError } = useCameraControls();

    stageValue('rpiCameraFps', 60);
    await applyStaged();

    // staged values are cleared regardless
    expect(stagedValues.value).toEqual({});
    expect(lastError.value).toBe('Validation error');
  });

  it('patchSettings sends batch PATCH with all keys', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ ok: true });

    const { patchSettings, settings } = useCameraControls();

    await patchSettings({ rpiCameraFps: 30, rpiCameraBitrate: 2000 });

    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/api/stream/camera-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rpiCameraFps: 30, rpiCameraBitrate: 2000 }),
    });
    expect(settings.value.rpiCameraFps).toBe(30);
    expect(settings.value.rpiCameraBitrate).toBe(2000);
  });

  it('fetchSettings does not overwrite settings when PATCH is in flight', async () => {
    const { fetchSettings, patchSettings, settings } = useCameraControls();

    settings.value = { rpiCameraFps: 60 };
    let resolvePatch: () => void;
    vi.mocked(apiFetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePatch = () => resolve({ ok: true });
        }) as Promise<{ ok: boolean }>,
    );

    const patchPromise = patchSettings({ rpiCameraFps: 60 });
    vi.mocked(apiFetch).mockResolvedValue({
      settings: { rpiCameraFps: 30 },
      piReachable: true,
    });
    await fetchSettings();
    expect(settings.value.rpiCameraFps).toBe(60);

    resolvePatch!();
    await patchPromise;
  });

  it('fetchSettings updates settings when no PATCH is in flight', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      settings: { rpiCameraFps: 30 },
      piReachable: true,
    });

    const { fetchSettings, settings } = useCameraControls();
    await fetchSettings();

    expect(settings.value.rpiCameraFps).toBe(30);
  });
});
