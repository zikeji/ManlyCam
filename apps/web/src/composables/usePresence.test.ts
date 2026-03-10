import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  viewers,
  typingUsers,
  mutedUserIds,
  handlePresenceSeed,
  handlePresenceJoin,
  handlePresenceLeave,
  handleTypingStart,
  handleTypingStop,
  handlePresenceUserUpdate,
  handleModerationMuted,
  handleModerationUnmuted,
  usePresence,
} from './usePresence';
import type { UserPresence } from '@manlycam/types';

const userA: UserPresence = {
  id: 'user-001',
  displayName: 'Alice',
  avatarUrl: null,
  role: 'ViewerCompany',
  isMuted: false,
  userTag: null,
};

const userB: UserPresence = {
  id: 'user-002',
  displayName: 'Bob',
  avatarUrl: 'https://example.com/bob.jpg',
  role: 'Admin',
  isMuted: false,
  userTag: { text: 'Staff', color: '#ff0000' },
};

describe('usePresence', () => {
  beforeEach(() => {
    viewers.value = [];
    typingUsers.value = [];
    mutedUserIds.value = new Set();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('handlePresenceSeed', () => {
    it('sets viewers to the provided array', () => {
      handlePresenceSeed([userA, userB]);
      expect(viewers.value).toHaveLength(2);
      expect(viewers.value[0].id).toBe('user-001');
    });

    it('replaces existing viewers (not appends)', () => {
      viewers.value = [userA];
      handlePresenceSeed([userB]);
      expect(viewers.value).toHaveLength(1);
      expect(viewers.value[0].id).toBe('user-002');
    });

    it('works with empty array', () => {
      viewers.value = [userA];
      handlePresenceSeed([]);
      expect(viewers.value).toHaveLength(0);
    });

    it('populates mutedUserIds from muted users in seed', () => {
      handlePresenceSeed([
        { ...userA, isMuted: true },
        { ...userB, isMuted: false },
      ]);
      expect(mutedUserIds.value.has('user-001')).toBe(true);
      expect(mutedUserIds.value.has('user-002')).toBe(false);
    });

    it('clears mutedUserIds when seeded with no muted users', () => {
      mutedUserIds.value = new Set(['old-id']);
      handlePresenceSeed([userA, userB]);
      expect(mutedUserIds.value.size).toBe(0);
    });
  });

  describe('handlePresenceJoin', () => {
    it('adds user to viewers list', () => {
      handlePresenceJoin(userA);
      expect(viewers.value).toHaveLength(1);
      expect(viewers.value[0].id).toBe('user-001');
    });

    it('does NOT add duplicate (same userId already present)', () => {
      viewers.value = [userA];
      handlePresenceJoin(userA);
      expect(viewers.value).toHaveLength(1);
    });
  });

  describe('handlePresenceLeave', () => {
    it('removes user with matching userId', () => {
      viewers.value = [userA, userB];
      handlePresenceLeave({ userId: 'user-001' });
      expect(viewers.value).toHaveLength(1);
      expect(viewers.value[0].id).toBe('user-002');
    });

    it('leaves non-matching users in list', () => {
      viewers.value = [userA, userB];
      handlePresenceLeave({ userId: 'nonexistent' });
      expect(viewers.value).toHaveLength(2);
    });

    it('works when list is empty (no-op)', () => {
      expect(() => handlePresenceLeave({ userId: 'user-001' })).not.toThrow();
      expect(viewers.value).toHaveLength(0);
    });
  });

  describe('handleTypingStart', () => {
    it('adds user to typingUsers list', () => {
      handleTypingStart({ userId: 'user-001', displayName: 'Alice' });
      expect(typingUsers.value).toHaveLength(1);
      expect(typingUsers.value[0].displayName).toBe('Alice');
    });

    it('does NOT add duplicate (same userId)', () => {
      handleTypingStart({ userId: 'user-001', displayName: 'Alice' });
      handleTypingStart({ userId: 'user-001', displayName: 'Alice' });
      expect(typingUsers.value).toHaveLength(1);
    });

    it('auto-clears after 6000ms', () => {
      handleTypingStart({ userId: 'user-001', displayName: 'Alice' });
      expect(typingUsers.value).toHaveLength(1);
      vi.advanceTimersByTime(6000);
      expect(typingUsers.value).toHaveLength(0);
    });

    it('resets timer if called again for same userId before expiry', () => {
      handleTypingStart({ userId: 'user-001', displayName: 'Alice' });
      vi.advanceTimersByTime(5000);
      // Reset by calling again (heartbeat arrives before 6s expiry)
      handleTypingStart({ userId: 'user-001', displayName: 'Alice' });
      vi.advanceTimersByTime(5000);
      // Should still be present (timer was reset, needs 6000ms from last call)
      expect(typingUsers.value).toHaveLength(1);
      vi.advanceTimersByTime(1000);
      expect(typingUsers.value).toHaveLength(0);
    });
  });

  describe('handleTypingStop', () => {
    it('removes user from typingUsers list', () => {
      typingUsers.value = [{ userId: 'user-001', displayName: 'Alice' }];
      handleTypingStop({ userId: 'user-001' });
      expect(typingUsers.value).toHaveLength(0);
    });

    it('clears auto-clear timer (no lingering calls)', () => {
      handleTypingStart({ userId: 'user-001', displayName: 'Alice' });
      handleTypingStop({ userId: 'user-001' });
      vi.advanceTimersByTime(3000);
      // Should not cause issues (timer was cleared)
      expect(typingUsers.value).toHaveLength(0);
    });

    it('works when userId not in list (no-op)', () => {
      expect(() => handleTypingStop({ userId: 'nonexistent' })).not.toThrow();
    });
  });

  describe('handlePresenceUserUpdate', () => {
    it('updates displayName, avatarUrl, userTag for matching viewer', () => {
      viewers.value = [{ ...userA }];
      handlePresenceUserUpdate({
        id: 'user-001',
        displayName: 'Alice Updated',
        avatarUrl: 'https://example.com/new.jpg',
        role: 'ViewerCompany',
        isMuted: false,
        userTag: { text: 'VIP', color: '#00ff00' },
      });
      expect(viewers.value[0].displayName).toBe('Alice Updated');
      expect(viewers.value[0].avatarUrl).toBe('https://example.com/new.jpg');
      expect(viewers.value[0].userTag?.text).toBe('VIP');
    });

    it('leaves non-matching viewers unchanged', () => {
      viewers.value = [{ ...userA }, { ...userB }];
      handlePresenceUserUpdate({
        id: 'user-001',
        displayName: 'Alice Updated',
        avatarUrl: null,
        role: 'ViewerCompany',
        isMuted: false,
        userTag: null,
      });
      expect(viewers.value[1].displayName).toBe('Bob');
    });

    it('no-op when userId not in viewers list', () => {
      viewers.value = [{ ...userA }];
      handlePresenceUserUpdate({
        id: 'nonexistent',
        displayName: 'Ghost',
        avatarUrl: null,
        role: 'ViewerCompany',
        isMuted: false,
        userTag: null,
      });
      expect(viewers.value[0].displayName).toBe('Alice');
    });
  });

  describe('handleModerationMuted', () => {
    it('sets isMuted: true for matching viewer', () => {
      viewers.value = [{ ...userA }, { ...userB }];
      handleModerationMuted({ userId: 'user-001' });
      expect(viewers.value[0].isMuted).toBe(true);
      expect(viewers.value[1].isMuted).toBe(false);
    });

    it('adds userId to mutedUserIds', () => {
      viewers.value = [{ ...userA }];
      handleModerationMuted({ userId: 'user-001' });
      expect(mutedUserIds.value.has('user-001')).toBe(true);
    });

    it('no-op when userId not in viewers list', () => {
      viewers.value = [{ ...userA }];
      handleModerationMuted({ userId: 'nonexistent' });
      expect(viewers.value[0].isMuted).toBe(false);
    });
  });

  describe('handleModerationUnmuted', () => {
    it('sets isMuted: false for matching viewer', () => {
      viewers.value = [{ ...userA, isMuted: true }, { ...userB }];
      handleModerationUnmuted({ userId: 'user-001' });
      expect(viewers.value[0].isMuted).toBe(false);
    });

    it('removes userId from mutedUserIds', () => {
      mutedUserIds.value = new Set(['user-001']);
      viewers.value = [{ ...userA, isMuted: true }];
      handleModerationUnmuted({ userId: 'user-001' });
      expect(mutedUserIds.value.has('user-001')).toBe(false);
    });

    it('no-op when userId not in viewers list', () => {
      viewers.value = [{ ...userA, isMuted: true }];
      handleModerationUnmuted({ userId: 'nonexistent' });
      expect(viewers.value[0].isMuted).toBe(true);
    });
  });

  describe('usePresence factory', () => {
    it('returns { viewers, typingUsers } reactive refs', () => {
      const { viewers: v, typingUsers: t } = usePresence();
      expect(v).toBe(viewers);
      expect(t).toBe(typingUsers);
    });
  });
});
