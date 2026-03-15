import { ref } from 'vue';

const MAX_RECENT = 20;

export const recentlyChattedUserIds = ref<string[]>([]);

export function recordChatter(userId: string): void {
  const ids = recentlyChattedUserIds.value.filter((id) => id !== userId);
  recentlyChattedUserIds.value = [userId, ...ids].slice(0, MAX_RECENT);
}

export function useRecentlyChatted() {
  return { recentlyChattedUserIds, recordChatter };
}
