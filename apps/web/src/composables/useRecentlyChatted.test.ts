import { describe, it, expect, beforeEach } from 'vitest';
import { recentlyChattedUserIds, recordChatter, useRecentlyChatted } from './useRecentlyChatted';

describe('useRecentlyChatted', () => {
  beforeEach(() => {
    recentlyChattedUserIds.value = [];
  });

  describe('recordChatter', () => {
    it('adds userId to the front of the list', () => {
      recordChatter('user-1');
      expect(recentlyChattedUserIds.value).toEqual(['user-1']);

      recordChatter('user-2');
      expect(recentlyChattedUserIds.value).toEqual(['user-2', 'user-1']);
    });

    it('removes duplicate userId and moves it to the front', () => {
      recordChatter('user-1');
      recordChatter('user-2');
      recordChatter('user-1');
      expect(recentlyChattedUserIds.value).toEqual(['user-1', 'user-2']);
    });

    it('caps the list at MAX_RECENT (20)', () => {
      for (let i = 1; i <= 21; i++) {
        recordChatter(`user-${i}`);
      }
      expect(recentlyChattedUserIds.value).toHaveLength(20);
      expect(recentlyChattedUserIds.value[0]).toBe('user-21');
      expect(recentlyChattedUserIds.value[19]).toBe('user-2');
      expect(recentlyChattedUserIds.value).not.toContain('user-1');
    });
  });

  describe('useRecentlyChatted factory', () => {
    it('returns the reactive state and function', () => {
      const { recentlyChattedUserIds: state, recordChatter: fn } = useRecentlyChatted();
      expect(state.value).toEqual([]);
      fn('user-1');
      expect(state.value).toEqual(['user-1']);
    });
  });
});
