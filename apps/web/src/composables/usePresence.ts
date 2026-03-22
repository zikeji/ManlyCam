import { ref } from 'vue';
import type { UserPresence, UserProfile } from '@manlycam/types';
import { handleAdminUserUpdate } from './useAdminUsers';

// Module-level singletons — same pattern as useChat.ts
export const viewers = ref<UserPresence[]>([]);
export const typingUsers = ref<{ userId: string; displayName: string }[]>([]);
export const mutedUserIds = ref<Set<string>>(new Set());

// Typing timer cleanup map (module-level)
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const TYPING_AUTO_CLEAR_MS = 6000; // 4s heartbeat + 2s grace

export const handlePresenceSeed = (users: UserPresence[]): void => {
  viewers.value = users;
  mutedUserIds.value = new Set(users.filter((u) => u.isMuted).map((u) => u.id));
};

export const handlePresenceJoin = (user: UserPresence): void => {
  if (!viewers.value.find((v) => v.id === user.id)) {
    viewers.value.push(user);
  }
};

export const handlePresenceLeave = ({ userId }: { userId: string }): void => {
  viewers.value = viewers.value.filter((v) => v.id !== userId);
};

export const handleTypingStop = ({ userId }: { userId: string }): void => {
  typingUsers.value = typingUsers.value.filter((u) => u.userId !== userId);
  clearTimeout(typingTimers.get(userId));
  typingTimers.delete(userId);
};

export const handleTypingStart = (payload: { userId: string; displayName: string }): void => {
  if (!typingUsers.value.find((u) => u.userId === payload.userId)) {
    typingUsers.value.push(payload);
  }
  // Reset auto-clear timer
  clearTimeout(typingTimers.get(payload.userId));
  typingTimers.set(
    payload.userId,
    setTimeout(() => handleTypingStop({ userId: payload.userId }), TYPING_AUTO_CLEAR_MS),
  );
};

export const handleModerationMuted = ({ userId }: { userId: string }): void => {
  viewers.value = viewers.value.map((v) => (v.id === userId ? { ...v, isMuted: true } : v));
  mutedUserIds.value = new Set([...mutedUserIds.value, userId]);
  // Sync with AdminUser list
  handleAdminUserUpdate({ id: userId, mutedAt: new Date().toISOString() } as never);
};

export const handleModerationUnmuted = ({ userId }: { userId: string }): void => {
  viewers.value = viewers.value.map((v) => (v.id === userId ? { ...v, isMuted: false } : v));
  const next = new Set(mutedUserIds.value);
  next.delete(userId);
  mutedUserIds.value = next;
  // Sync with AdminUser list
  handleAdminUserUpdate({ id: userId, mutedAt: null } as never);
};

export const handlePresenceUserUpdate = (profile: UserProfile): void => {
  viewers.value = viewers.value.map((v) =>
    v.id === profile.id
      ? {
          ...v,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          userTag: profile.userTag,
        }
      : v,
  );
};

export const usePresence = () => {
  return { viewers, typingUsers, mutedUserIds };
};
