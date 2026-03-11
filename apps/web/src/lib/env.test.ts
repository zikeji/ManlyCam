import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPetName, getSiteName } from './env';

describe('env helper', () => {
  const originalEnv = import.meta.env;

  beforeEach(() => {
    delete window.__env__;
    vi.stubGlobal('import.meta', { env: { ...originalEnv } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads from window.__env__ if present', () => {
    window.__env__ = { PET_NAME: 'WindowPet', SITE_NAME: 'WindowSite' };

    expect(getPetName()).toBe('WindowPet');
    expect(getSiteName()).toBe('WindowSite');
  });

  it('falls back to import.meta.env if window.__env__ is missing', () => {
    import.meta.env.VITE_PET_NAME = 'MetaPet';
    import.meta.env.VITE_SITE_NAME = 'MetaSite';

    expect(getPetName()).toBe('MetaPet');
    expect(getSiteName()).toBe('MetaSite');
  });

  it('falls back to hardcoded defaults if both are missing', () => {
    import.meta.env.VITE_PET_NAME = undefined;
    import.meta.env.VITE_SITE_NAME = undefined;

    expect(getPetName()).toBe('Pet');
    expect(getSiteName()).toBe('ManlyCam');
  });
});
