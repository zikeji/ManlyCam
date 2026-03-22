import { describe, it, expect, beforeEach } from 'vitest';
import { piSugarStatus, setStateFromWs } from './usePiSugar';
import type { PiSugarStatus } from '@manlycam/types';

describe('usePiSugar', () => {
  beforeEach(() => {
    piSugarStatus.value = null;
  });

  describe('setStateFromWs', () => {
    it('updates piSugarStatus with the provided payload', () => {
      const mockStatus: PiSugarStatus = {
        connected: true,
        level: 85,
        plugged: true,
        charging: true,
        chargingRange: null,
      };

      setStateFromWs(mockStatus);

      expect(piSugarStatus.value).toEqual(mockStatus);
    });
  });
});
