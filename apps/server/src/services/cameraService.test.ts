import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/client.js', () => ({
  prisma: {
    cameraSettings: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from '../db/client.js';
import { getCameraSettings, upsertCameraSettings } from './cameraService.js';

describe('cameraService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCameraSettings', () => {
    it('returns settings as a key/value record', async () => {
      vi.mocked(prisma.cameraSettings.findMany).mockResolvedValue([
        { key: 'brightness', value: '50' },
        { key: 'enabled', value: 'true' },
      ] as never);
      const result = await getCameraSettings();
      expect(result).toEqual({ brightness: 50, enabled: true });
    });

    it('returns empty object when no settings exist', async () => {
      vi.mocked(prisma.cameraSettings.findMany).mockResolvedValue([]);
      const result = await getCameraSettings();
      expect(result).toEqual({});
    });
  });

  describe('upsertCameraSettings', () => {
    it('upserts each key as JSON stringified value', async () => {
      vi.mocked(prisma.cameraSettings.upsert).mockResolvedValue(undefined as never);
      await upsertCameraSettings({ brightness: 75, enabled: false });
      expect(prisma.cameraSettings.upsert).toHaveBeenCalledWith({
        where: { key: 'brightness' },
        update: { value: '75' },
        create: { key: 'brightness', value: '75' },
      });
      expect(prisma.cameraSettings.upsert).toHaveBeenCalledWith({
        where: { key: 'enabled' },
        update: { value: 'false' },
        create: { key: 'enabled', value: 'false' },
      });
    });

    it('handles empty settings object without calling upsert', async () => {
      await upsertCameraSettings({});
      expect(prisma.cameraSettings.upsert).not.toHaveBeenCalled();
    });
  });
});
